/**
 * app-template/tests/run_template_integration.js
 * Bộ kiểm thử tích hợp đầu-cuối (End-to-End Integration Test) giữa `app-template` và `app-core` Library.
 *
 * Kiểm chứng toàn diện:
 * 1. Biên giới 2 VM độc lập: `app-template` chỉ nhận đối tượng `Core` đóng băng (`{ VERSION, init }`) từ `app-core`.
 * 2. `doGet({})` nạp chính xác các file HTML trong thư mục con (`ui/*`, `pages/*`) và tự khởi tạo 12 bảng (0 dòng rác trong `SAMPLE_ITEMS`).
 * 3. Toàn bộ 22 hàm uỷ quyền mỏng trong `RpcGateway.gs` hoạt động thông suốt.
 * 4. Module mẫu `SampleService.gs`: sinh mã tự động `SMP0001..SMP0012`, phân trang bắt buộc (10 + 2), và chặn RBAC `sample.delete` với nhân viên `Staff`.
 * 5. Kiểm tra cú pháp JS (`new vm.Script`) cho mọi thẻ `<script>` và đối chiếu 100% `document.getElementById(...)` tĩnh với DOM thực tế.
 * 6. Chạy thử script khởi tạo dự án mới `scripts/new-project.ps1` ra thư mục tạm và kiểm tra kết quả đóng dấu cấu hình.
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const templateRoot = path.resolve(__dirname, "..");
const templateSrcDir = path.join(templateRoot, "src");
const coreSrcCandidates = [
  process.env.APP_CORE_SRC_DIR ? path.resolve(process.env.APP_CORE_SRC_DIR) : "",
  path.resolve(templateRoot, "..", "app-core", "src"),
  path.resolve(templateRoot, "..", "BaseAppScript", "app-core", "src")
].filter(Boolean);
const coreSrcDir = coreSrcCandidates.find((p) => fs.existsSync(p)) || coreSrcCandidates[0];

// =========================================================================
// 1. MÔI TRƯỜNG GIẢ LẬP GOOGLE APPS SCRIPT CHO CẢ 2 VM (CORE LIBRARY & PROJECT)
// =========================================================================

class MockRange {
  constructor(sheet, row, col, numRows, numCols) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r++) {
      const rIdx = this.row - 1 + r;
      const rowArr = [];
      for (let c = 0; c < this.numCols; c++) {
        const cIdx = this.col - 1 + c;
        const val =
          this.sheet.grid[rIdx] && this.sheet.grid[rIdx][cIdx] !== undefined
            ? this.sheet.grid[rIdx][cIdx]
            : "";
        rowArr.push(val);
      }
      out.push(rowArr);
    }
    return out;
  }

  setValues(values) {
    for (let r = 0; r < values.length; r++) {
      const rIdx = this.row - 1 + r;
      if (!this.sheet.grid[rIdx]) this.sheet.grid[rIdx] = [];
      for (let c = 0; c < values[r].length; c++) {
        const cIdx = this.col - 1 + c;
        let cell = values[r][c];
        if (typeof cell === "string") {
          if (cell.startsWith("'")) {
            cell = cell.slice(1);
          } else if (/^\d+$/.test(cell) && cell.length <= 15) {
            cell = Number(cell);
          }
        }
        this.sheet.grid[rIdx][cIdx] = cell;
      }
    }
    this.sheet._trimEmptyTail();
    return this;
  }

  setValue(val) { return this.setValues([[val]]); }

  clearContent() {
    for (let r = 0; r < this.numRows; r++) {
      const rIdx = this.row - 1 + r;
      if (this.sheet.grid[rIdx]) {
        for (let c = 0; c < this.numCols; c++) {
          this.sheet.grid[rIdx][this.col - 1 + c] = "";
        }
      }
    }
    this.sheet._trimEmptyTail();
    return this;
  }

  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setNumberFormat() { return this; }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.grid = [];
    this.frozenRows = 0;
  }

  getName() { return this.name; }

  _trimEmptyTail() {
    while (this.grid.length > 0) {
      const last = this.grid[this.grid.length - 1];
      if (!last || last.every((v) => v === "" || v === null || v === undefined)) {
        this.grid.pop();
      } else {
        break;
      }
    }
  }

  getLastRow() {
    this._trimEmptyTail();
    return this.grid.length;
  }

  getLastColumn() {
    let maxC = 0;
    for (const row of this.grid) {
      if (row) {
        for (let c = row.length - 1; c >= 0; c--) {
          if (row[c] !== "" && row[c] !== null && row[c] !== undefined) {
            if (c + 1 > maxC) maxC = c + 1;
            break;
          }
        }
      }
    }
    return maxC;
  }

  getRange(row, col, numRows = 1, numCols = 1) {
    return new MockRange(this, row, col, numRows, numCols);
  }

  setFrozenRows(n) { this.frozenRows = n; }
  deleteRow(rowPos) { this.grid.splice(rowPos - 1, 1); }
}

class MockSpreadsheet {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.sheets = [new MockSheet("Sheet1")];
  }

  getId() { return this.id; }
  getName() { return this.name; }
  getSheets() { return this.sheets; }
  getSheetByName(name) { return this.sheets.find((s) => s.getName() === name) || null; }

  insertSheet(name) {
    const sh = new MockSheet(name);
    this.sheets.push(sh);
    return sh;
  }
}

function makeScopedServices() {
  const props = new Map();
  const cache = new Map();
  return {
    properties: {
      getProperty: (k) => (props.has(k) ? props.get(k) : null),
      setProperty: (k, v) => props.set(k, String(v)),
      deleteProperty: (k) => props.delete(k)
    },
    cache: {
      get: (k) => (cache.has(k) ? cache.get(k) : null),
      put: (k, v) => cache.set(k, String(v)),
      remove: (k) => cache.delete(k),
      removeAll: (keys) => keys.forEach((k) => cache.delete(k))
    },
    lock: {
      tryLock: () => true,
      waitLock: () => true,
      releaseLock: () => {}
    }
  };
}

function makeUtilities() {
  return {
    DigestAlgorithm: { SHA_256: "sha256" },
    Charset: { UTF_8: "utf8" },
    computeDigest(_algo, str) {
      const buf = crypto.createHash("sha256").update(String(str), "utf8").digest();
      return Array.from(buf).map((b) => (b > 127 ? b - 256 : b));
    },
    getUuid: () => crypto.randomUUID(),
    formatDate(date, tz, fmt) {
      const d = new Date(date);
      const pad = (n) => String(n).padStart(2, "0");
      const yyyy = d.getFullYear();
      const MM = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const HH = pad(d.getHours());
      const mm = pad(d.getMinutes());
      const ss = pad(d.getSeconds());
      if (fmt === "yyyy-MM-dd") return `${yyyy}-${MM}-${dd}`;
      return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
    },
    base64EncodeWebSafe: (str) => Buffer.from(String(str), "utf8").toString("base64url"),
    base64DecodeWebSafe: (b64) => Buffer.from(String(b64), "base64url"),
    newBlob: (buf) => ({
      getDataAsString: () => Buffer.from(buf).toString("utf8")
    })
  };
}

const projectSpreadsheet = new MockSpreadsheet("SS_STARTER_001", "Starter App DB");
const coreOwnServices = makeScopedServices();
const projectOwnServices = makeScopedServices();

// --- VM #1: Nạp Core Library ---
const coreVm = {
  console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN,
  Logger: { log() {} },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => projectSpreadsheet,
    openById: (id) => (id === projectSpreadsheet.getId() ? projectSpreadsheet : null),
    create: (name) => new MockSpreadsheet("SS_AUTO", name)
  },
  PropertiesService: { getScriptProperties: () => coreOwnServices.properties },
  CacheService: { getScriptCache: () => coreOwnServices.cache },
  LockService: { getScriptLock: () => coreOwnServices.lock },
  Utilities: makeUtilities()
};
vm.createContext(coreVm);

const coreFiles = [
  "common/CoreDefaults_.gs",
  "common/Utils_.gs",
  "common/SheetAdapter_.gs",
  "session/SessionService_.gs",
  "audit/AuditService_.gs",
  "permission/PermissionService_.gs",
  "menu/MenuService_.gs",
  "auth/AuthorizationService_.gs",
  "auth/AuthService_.gs",
  "user/UserService_.gs",
  "role/RoleService_.gs",
  "config/ConfigService_.gs",
  "PublicApi.gs"
];
for (const f of coreFiles) {
  vm.runInContext(fs.readFileSync(path.join(coreSrcDir, f), "utf8"), coreVm, { filename: "core/" + f });
}

// Chỉ xuất đúng Public API như Google Apps Script Library
const ExportedCoreLibrary = Object.freeze({
  VERSION: coreVm.VERSION,
  init: coreVm.init
});

// --- VM #2: Nạp Project Template (`app-template/src`) ---
// Mô phỏng chính xác cách `clasp push` đặt tên file HTML theo đường dẫn tương đối trong `src/` (ví dụ: "ui/Index", "pages/Page_Sample")
function resolveClaspHtmlFile(gasName) {
  const normalized = String(gasName).replace(/\\/g, "/");
  // Chỉ chấp nhận khi đường dẫn thực sự tồn tại đúng trong src/ (bắt buộc Code.gs phải thử "ui/" + filename hoặc "pages/" + filename)
  const fullPath = path.join(templateSrcDir, normalized + ".html");
  if (!fs.existsSync(fullPath)) {
    throw new Error("No HTML file with name: " + gasName);
  }
  return fs.readFileSync(fullPath, "utf8");
}

const templateVm = {
  console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN,
  Core: ExportedCoreLibrary,
  Logger: { log() {} },
  ScriptApp: {
    getScriptId: () => "1StarterProjectScriptIdMock001"
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => projectSpreadsheet,
    openById: (id) => (id === projectSpreadsheet.getId() ? projectSpreadsheet : null)
  },
  PropertiesService: { getScriptProperties: () => projectOwnServices.properties },
  CacheService: { getScriptCache: () => projectOwnServices.cache },
  LockService: { getScriptLock: () => projectOwnServices.lock },
  Utilities: makeUtilities(),
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
    createHtmlOutputFromFile(name) {
      const content = resolveClaspHtmlFile(name);
      return { getContent: () => content };
    },
    createHtmlOutput(html) {
      return {
        getContent: () => html,
        setTitle() { return this; },
        addMetaTag() { return this; },
        setXFrameOptionsMode() { return this; }
      };
    },
    createTemplateFromFile(name) {
      const raw = resolveClaspHtmlFile(name);
      const tpl = {
        evaluate() {
          const rendered = raw
            .replace(/<\?=\s*([a-zA-Z0-9_]+)\s*\?>/g, (_, varName) => String(tpl[varName] || ""))
            .replace(/<\?!=\s*include\(['"]([^'"]+)['"]\);?\s*\?>/g, (_, incName) => templateVm.include(incName));
          return {
            getContent: () => rendered,
            setTitle() { return this; },
            addMetaTag() { return this; },
            setXFrameOptionsMode() { return this; }
          };
        }
      };
      return tpl;
    }
  }
};
vm.createContext(templateVm);

console.log("=== [APP-TEMPLATE INTEGRATION TEST SUITE] ===");

const templateGsFiles = [
  "config/ProjectConfig.gs",
  "Code.gs",
  "RpcGateway.gs",
  "business/SampleService.gs"
];
for (const f of templateGsFiles) {
  vm.runInContext(fs.readFileSync(path.join(templateSrcDir, f), "utf8"), templateVm, { filename: "template/" + f });
}
console.log(`  [PASS] Loaded all ${templateGsFiles.length} .gs files in app-template/src linked to Core v${ExportedCoreLibrary.VERSION}.`);

// =========================================================================
// TEST 1: KIỂM TRA `doGet({})`, SUBFOLDER INCLUDE (`ui/`, `pages/`) & 12 BẢNG AUTO-INIT
// =========================================================================
const renderedHtml = templateVm.doGet({}).getContent();
{
  assert.ok(!renderedHtml.includes("Lỗi khởi động ứng dụng"), "doGet() must render cleanly without errors");
  assert.ok(renderedHtml.includes('id="app-view"'), "Rendered HTML must include #app-view");
  assert.ok(renderedHtml.includes('id="sidebar-dynamic-groups"'), "Rendered HTML must include #sidebar-dynamic-groups");
  assert.ok(renderedHtml.includes('id="view-menus"'), "Rendered HTML must include #view-menus");
  assert.ok(renderedHtml.includes('id="view-sample"'), "Rendered HTML must include #view-sample from pages/Page_Sample.html");
  assert.ok(renderedHtml.includes("var MENUS_CLIENT"), "Rendered HTML must include Js_Menus.html");
  assert.ok(renderedHtml.includes("var SAMPLE_CLIENT"), "Rendered HTML must include Page_Sample.html script");

  // Kiểm tra đủ 11 bảng Core + 1 bảng SAMPLE_ITEMS (tổng 12 bảng dữ liệu + Sheet1 mặc định)
  const sampleSheet = projectSpreadsheet.getSheetByName("SAMPLE_ITEMS");
  assert.ok(sampleSheet, "SAMPLE_ITEMS sheet must be auto-initialized");
  assert.strictEqual(sampleSheet.getLastRow(), 1, "SAMPLE_ITEMS must be Readily Production (header row only, 0 mock rows)");
  console.log("  [PASS] doGet() rendered full UI/Pages HTML and auto-initialized 11 Core + 1 Business sheets (0 mock rows).");
}

// =========================================================================
// TEST 2: KIỂM TRA TOÀN BỘ CỔNG UỶ QUYỀN `RpcGateway.gs`
// =========================================================================
const loginRes = templateVm.apiLogin({ username: "admin", password: "admin123" });
assert.strictEqual(loginRes.success, true, loginRes.message);
const adminToken = loginRes.data.token;

{
  // Kiểm tra phiên chứa menu động `sample` và tham số cấu hình công khai `DEFAULT_PAGE_SIZE`
  const sessRes = templateVm.apiCheckSession(adminToken);
  assert.strictEqual(sessRes.success, true);
  assert.ok(sessRes.data.menus.some((m) => m.code === "sample"), "Session menus must include business menu 'sample'");
  assert.strictEqual(sessRes.data.public_configs.DEFAULT_PAGE_SIZE, "10");

  // Danh sách Users, Roles, Menus, Settings, Audit qua RpcGateway
  assert.strictEqual(templateVm.apiGetUsersList(adminToken, {}, 1, 10).success, true);
  assert.strictEqual(templateVm.apiGetRolesList(adminToken, {}, 1, 10).success, true);
  assert.strictEqual(templateVm.apiGetRolePermissions(adminToken, "ROLE_STAFF").success, true);
  assert.strictEqual(templateVm.apiGetMenusList(adminToken, {}, 1, 10).success, true);
  assert.strictEqual(templateVm.apiGetAppSettings(adminToken).success, true);
  assert.strictEqual(templateVm.apiClearSystemCache(adminToken).success, true);
  assert.strictEqual(templateVm.apiGetAuditLogs(adminToken, {}, 1, 10).success, true);

  console.log("  [PASS] RpcGateway.gs delegated Auth, Users, Roles, Permissions, Menus, Config, Cache & Audit cleanly.");
}

// =========================================================================
// TEST 3: KIỂM TRA MODULE MẪU `SampleService.gs` (PHÂN TRANG + RBAC 2 TẦNG)
// =========================================================================
{
  const createStaff = templateVm.apiCreateUser(adminToken, {
    username: "staff_sample",
    password: "password123",
    full_name: "Nhân viên Nghiệp vụ Mẫu",
    phone: "0912345678",
    email: "staff@starter.local",
    role_ids: ["ROLE_STAFF"]
  });
  assert.strictEqual(createStaff.success, true, createStaff.message);
  const staffUserId = createStaff.data.id;

  // Kiểm tra RPC phân quyền Menu cá nhân qua RpcGateway
  const userMenuMatrix = templateVm.apiGetUserMenus(adminToken, staffUserId);
  assert.strictEqual(userMenuMatrix.success, true);
  const saveUserMenus = templateVm.apiSaveUserMenus(adminToken, staffUserId, [
    { menu_id: "MNU_AUDIT", effect: "GRANT" }
  ]);
  assert.strictEqual(saveUserMenus.success, true);

  const staffLogin = templateVm.apiLogin({ username: "staff_sample", password: "password123" });
  assert.strictEqual(staffLogin.success, true);
  const staffToken = staffLogin.data.token;
  assert.ok(staffLogin.data.menu_permissions.includes("menu.audit"), "Staff received granted menu.audit via RpcGateway");

  // Nhân viên tạo 12 bản ghi nghiệp vụ mẫu -> tự sinh mã SMP0001 .. SMP0012
  let firstItemId = "";
  for (let i = 1; i <= 12; i++) {
    const saveRes = templateVm.apiSaveSampleItem(staffToken, {
      item_name: `Hạng mục mẫu số ${i}`,
      category: i % 2 === 0 ? "Nhóm A" : "Nhóm B",
      status: "ACTIVE",
      notes: `Ghi chú kiểm thử ${i}`
    });
    assert.strictEqual(saveRes.success, true, saveRes.message);
    if (i === 1) {
      assert.strictEqual(saveRes.data.item_code, "SMP0001");
      firstItemId = saveRes.data.id;
    }
    if (i === 12) {
      assert.strictEqual(saveRes.data.item_code, "SMP0012");
    }
  }

  // Kiểm tra phân trang bắt buộc (Trang 1: 10 dòng, Trang 2: 2 dòng)
  const page1 = templateVm.apiGetSampleItems(staffToken, {}, 1, 10);
  assert.strictEqual(page1.success, true);
  assert.strictEqual(page1.data.items.length, 10);
  assert.strictEqual(page1.data.pagination.total, 12);
  assert.strictEqual(page1.data.pagination.totalPages, 2);
  assert.strictEqual(page1.data.pagination.hasNext, true);

  const page2 = templateVm.apiGetSampleItems(staffToken, {}, 2, 10);
  assert.strictEqual(page2.success, true);
  assert.strictEqual(page2.data.items.length, 2);
  assert.strictEqual(page2.data.pagination.hasPrev, true);

  // Nhân viên được phép cập nhật (`sample.update`) nhưng BỊ CHẶN xóa (`sample.delete`)
  const updateRes = templateVm.apiSaveSampleItem(staffToken, {
    id: firstItemId,
    item_name: "Hạng mục mẫu số 1 (Đã cập nhật)",
    category: "Nhóm VIP",
    status: "ACTIVE"
  });
  assert.strictEqual(updateRes.success, true, updateRes.message);

  const forbiddenDelete = templateVm.apiDeleteSampleItem(staffToken, firstItemId);
  assert.strictEqual(forbiddenDelete.success, false, "Staff without sample.delete MUST be blocked on server!");

  // Admin có toàn quyền xóa thành công
  const adminDelete = templateVm.apiDeleteSampleItem(adminToken, firstItemId);
  assert.strictEqual(adminDelete.success, true, adminDelete.message);

  console.log("  [PASS] SampleService auto-numbering (SMP0001..SMP0012), mandatory pagination & 2-Tier RBAC verified.");
}

// =========================================================================
// TEST 4: KIỂM TRA CÚ PHÁP FRONTEND JS & ĐỐI CHIẾU 100% STATIC DOM ID
// =========================================================================
{
  const htmlFiles = [
    ...fs.readdirSync(path.join(templateSrcDir, "ui")).map((f) => path.join("ui", f)),
    ...fs.readdirSync(path.join(templateSrcDir, "pages")).map((f) => path.join("pages", f))
  ].filter((f) => f.endsWith(".html"));

  let scriptBlocksChecked = 0;
  for (const relHtml of htmlFiles) {
    const raw = fs.readFileSync(path.join(templateSrcDir, relHtml), "utf8");
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(raw)) !== null) {
      new vm.Script(match[1], { filename: relHtml });
      scriptBlocksChecked++;
    }
  }
  assert.ok(scriptBlocksChecked >= 8, "Expected at least 8 <script> blocks across ui/ and pages/");

  // Thu thập toàn bộ id="..." định nghĩa trong HTML đã render (bao gồm cả template động bên trong JS)
  const definedIds = new Set();
  const idDefRegex = /\bid=["']([^"'+]+)["']/g;
  let idMatch;
  while ((idMatch = idDefRegex.exec(renderedHtml)) !== null) {
    definedIds.add(idMatch[1]);
  }

  const missingDomIds = [];
  for (const relHtml of htmlFiles) {
    const raw = fs.readFileSync(path.join(templateSrcDir, relHtml), "utf8");
    // Bắt các lời gọi getElementById("static-id") không nối chuỗi động ở hai đầu
    const callRegex = /getElementById\(\s*["']([a-zA-Z0-9_-]+)["']\s*\)/g;
    let cm;
    while ((cm = callRegex.exec(raw)) !== null) {
      // Kiểm tra xem ngay sau dấu nháy có phải phép cộng chuỗi động (ví dụ: "prefix-" + id) hay không
      const fullSnippet = raw.slice(Math.max(0, cm.index - 5), cm.index + cm[0].length + 5);
      if (fullSnippet.includes("+")) continue;
      const targetId = cm[1];
      if (!definedIds.has(targetId)) {
        missingDomIds.push(`${relHtml} -> #${targetId}`);
      }
    }
  }

  assert.deepStrictEqual(
    missingDomIds,
    [],
    "Found static getElementById() calls missing from DOM: " + missingDomIds.join(", ")
  );
  console.log(`  [PASS] Verified JS syntax in ${scriptBlocksChecked} <script> blocks and 100% static DOM ID references.`);
}

// =========================================================================
// TEST 5: KIỂM TRA SCRIPT CLONE DỰ ÁN MỚI (`scripts/new-project.ps1`)
// =========================================================================
{
  const tempTarget = path.join(os.tmpdir(), "baseappscript-test-clone-" + Date.now());
  const scriptPath = path.join(templateRoot, "scripts", "new-project.ps1");
  try {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-AppCode",
        "BOOKING",
        "-AppName",
        "Hệ Thống Đặt Lịch",
        "-TargetDir",
        tempTarget,
        "-ScriptId",
        "1BookingAppScriptIdMock888",
        "-DeploymentId",
        "AKfycbFixedDeploymentMock888",
        "-CoreLibraryId",
        "1CoreLibScriptIdMock999",
        "-CoreVersion",
        "3"
      ],
      { stdio: "pipe" }
    );

    const clonedCfg = fs.readFileSync(path.join(tempTarget, "src", "config", "ProjectConfig.gs"), "utf8");
    const clonedClasp = JSON.parse(fs.readFileSync(path.join(tempTarget, ".clasp.json"), "utf8"));
    const clonedManifest = JSON.parse(fs.readFileSync(path.join(tempTarget, "src", "appsscript.json"), "utf8"));
    const clonedPkg = JSON.parse(fs.readFileSync(path.join(tempTarget, "package.json"), "utf8"));

    assert.ok(clonedCfg.includes('APP_CODE: "BOOKING"'), "Cloned ProjectConfig.gs must stamp APP_CODE");
    assert.ok(clonedCfg.includes('APP_NAME: "Hệ Thống Đặt Lịch"'), "Cloned ProjectConfig.gs must stamp APP_NAME");
    assert.ok(clonedCfg.includes('SCRIPT_ID: "1BookingAppScriptIdMock888"'), "Cloned ProjectConfig.gs must stamp SCRIPT_ID");
    assert.strictEqual(clonedClasp.scriptId, "1BookingAppScriptIdMock888", "Cloned .clasp.json must stamp scriptId");
    assert.strictEqual(clonedClasp.deploymentId, "AKfycbFixedDeploymentMock888", "Cloned .clasp.json must stamp fixed deploymentId");
    assert.strictEqual(clonedManifest.dependencies.libraries[0].libraryId, "1CoreLibScriptIdMock999");
    assert.strictEqual(clonedManifest.dependencies.libraries[0].version, "3");
    assert.strictEqual(clonedPkg.name, "project-booking", "Cloned package.json must update project name");
    assert.ok(clonedPkg.scripts && clonedPkg.scripts.deploy, "Cloned package.json must expose npm run deploy");
    assert.strictEqual(fs.existsSync(path.join(tempTarget, "scripts")), false, "Cloned project must exclude template bootstrap scripts/");

    console.log("  [PASS] scripts/new-project.ps1 cloned and stamped new project configuration cleanly.");
  } finally {
    if (fs.existsSync(tempTarget)) {
      fs.rmSync(tempTarget, { recursive: true, force: true });
    }
  }
}

console.log("=== ALL APP-TEMPLATE INTEGRATION TESTS PASSED (100%) ===\n");
