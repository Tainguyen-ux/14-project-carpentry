/**
 * 14-project-carpentry/tests/run_template_integration.js
 * Bộ kiểm thử tích hợp đầu-cuối (End-to-End Integration Test) cho Hệ Thống Quản Lý Xưởng Mộc & Nội Thất May Đo (MVP)
 * trên nền BaseAppScript Core Library (2 VM độc lập).
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const projectRoot = path.resolve(__dirname, "..");
const projectSrcDir = path.join(projectRoot, "src");
const coreSrcCandidates = [
  process.env.APP_CORE_SRC_DIR ? path.resolve(process.env.APP_CORE_SRC_DIR) : "",
  path.resolve(projectRoot, "..", "app-core", "src"),
  path.resolve(projectRoot, "..", "BaseAppScript", "app-core", "src")
].filter(Boolean);
const coreSrcDir = coreSrcCandidates.find((p) => fs.existsSync(p)) || coreSrcCandidates[0];

// =========================================================================
// 1. MÔI TRƯỜNG GIẢ LẬP GOOGLE APPS SCRIPT CHO CẢ 2 VM (SHEETS + DRIVE)
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

class MockDriveFolder {
  constructor(name) {
    this.id = "FLD_" + crypto.randomUUID().slice(0, 8);
    this.name = name;
    this.folders = [];
    this.files = [];
  }
  getId() { return this.id; }
  getName() { return this.name; }
  getFoldersByName(name) {
    const matches = this.folders.filter((f) => f.name === name);
    let idx = 0;
    return { hasNext: () => idx < matches.length, next: () => matches[idx++] };
  }
  createFolder(name) {
    const child = new MockDriveFolder(name);
    this.folders.push(child);
    return child;
  }
  createFile(blob) {
    const fid = "DRV_CRP_" + crypto.randomUUID().slice(0, 8);
    const f = {
      id: fid,
      name: blob && blob.getName ? blob.getName() : "file.jpg",
      mimeType: blob && blob.getContentType ? blob.getContentType() : "image/jpeg",
      getId: () => fid,
      getName: () => f.name,
      getUrl: () => "https://drive.google.com/uc?export=view&id=" + fid,
      setSharing: () => f
    };
    this.files.push(f);
    return f;
  }
}

const mockDriveRoot = new MockDriveFolder("ROOT");
const MockDriveApp = {
  Access: { ANYONE_WITH_LINK: "ANYONE_WITH_LINK" },
  Permission: { VIEW: "VIEW" },
  getFoldersByName: (name) => mockDriveRoot.getFoldersByName(name),
  createFolder: (name) => mockDriveRoot.createFolder(name)
};

function makeScopedServices() {
  const props = new Map();
  const cache = new Map();
  return {
    _propsMap: props,
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
    formatDate(date, _tz, fmt) {
      const d = new Date(date);
      const pad = (n) => String(n).padStart(2, "0");
      const yyyy = d.getFullYear();
      const MM = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const HH = pad(d.getHours());
      const mm = pad(d.getMinutes());
      const ss = pad(d.getSeconds());
      if (fmt === "yyyy-MM-dd") return `${yyyy}-${MM}-${dd}`;
      if (fmt === "yyyyMMdd") return `${yyyy}${MM}${dd}`;
      return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
    },
    base64EncodeWebSafe: (str) => Buffer.from(String(str), "utf8").toString("base64url"),
    base64DecodeWebSafe: (b64) => Buffer.from(String(b64), "base64url"),
    base64Decode: (b64) => Array.from(Buffer.from(String(b64), "base64")),
    newBlob: (buf, mimeType, name) => ({
      getBytes: () => buf,
      getContentType: () => mimeType || "application/octet-stream",
      getName: () => name || "file.bin",
      getDataAsString: () => Buffer.from(buf).toString("utf8")
    })
  };
}

const projectSpreadsheet = new MockSpreadsheet("SS_CARPENTRY_001", "Carpentry MVP DB");
const coreOwnServices = makeScopedServices();
const projectOwnServices = makeScopedServices();

// --- VM #1: Core Library ---
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

const ExportedCoreLibrary = Object.freeze({
  VERSION: coreVm.VERSION,
  init: coreVm.init
});

// --- VM #2: Project (`14-project-carpentry/src`) ---
let htmlLookupMissCount = 0;
function resolveClaspHtmlFile(gasName) {
  const normalized = String(gasName).replace(/\\/g, "/");
  const fullPath = path.join(projectSrcDir, normalized + ".html");
  if (!fs.existsSync(fullPath)) {
    htmlLookupMissCount++;
    throw new Error("No HTML file with name: " + gasName);
  }
  return fs.readFileSync(fullPath, "utf8");
}

const projectVm = {
  console, Date, Math, JSON, Object, Array, String, Number, Boolean, RegExp, Error, parseInt, parseFloat, isNaN,
  Core: ExportedCoreLibrary,
  Logger: { log() {} },
  ScriptApp: {
    getScriptId: () => "1CarpentryProjectScriptIdMock014"
  },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => projectSpreadsheet,
    openById: (id) => (id === projectSpreadsheet.getId() ? projectSpreadsheet : null)
  },
  DriveApp: MockDriveApp,
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
            .replace(/<\?!=\s*include\(['"]([^'"]+)['"]\);?\s*\?>/g, (_, incName) => projectVm.include(incName));
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
vm.createContext(projectVm);

console.log("=== [14-PROJECT-CARPENTRY E2E INTEGRATION TEST SUITE] ===");

const projectGsFiles = [
  "config/ProjectConfig.gs",
  "Code.gs",
  "RpcGateway.gs",
  "business/CarpentryCoreHelper.gs",
  "business/CarpentryCustomerSurveyCatalogService.gs",
  "business/CarpentryOrderProductionMaterialService.gs",
  "business/CarpentryPaymentInstallWarrantyReportService.gs"
];
for (const f of projectGsFiles) {
  vm.runInContext(fs.readFileSync(path.join(projectSrcDir, f), "utf8"), projectVm, { filename: "carpentry/" + f });
}
console.log(`  [PASS] Loaded all ${projectGsFiles.length} .gs files linked to Core v${ExportedCoreLibrary.VERSION}.`);

// =========================================================================
// TEST 1: `doGet({})`, 11 BẢNG CORE + 12 BẢNG XƯỞNG MỘC AUTO-INIT (0 DÒNG RÁC)
// =========================================================================
const renderedHtml = projectVm.doGet({}).getContent();
{
  assert.strictEqual(htmlLookupMissCount, 0, `doGet() must resolve all HTML templates/includes on first attempt (0 misses, got ${htmlLookupMissCount})`);
  assert.ok(!renderedHtml.includes("Lỗi khởi động ứng dụng"), "doGet() must render cleanly without errors");
  [
    "view-dashboard", "view-surveys", "view-orders", "view-drawings",
    "view-production", "view-materials", "view-payments",
    "view-install-warranty", "view-customers", "view-reports-cash",
    "mobile-bottom-nav", "modal-crp-qr-scan"
  ].forEach((viewId) => {
    assert.ok(renderedHtml.includes(`id="${viewId}"`), `Rendered HTML must include #${viewId}`);
  });

  const businessSheets = [
    "CUSTOMERS", "CARPENTRY_SURVEYS", "MATERIAL_CATALOG",
    "FURNITURE_ORDERS", "ORDER_ITEMS", "PRODUCTION_PROGRESS",
    "ORDER_PAYMENTS", "ORDER_MATERIALS", "ORDER_FILES_PHOTOS",
    "PACKAGE_QR", "WARRANTY_TICKETS", "CASH_TRANSACTIONS"
  ];
  const coreSheets = [
    "USERS", "ROLES", "USER_ROLES", "PERMISSIONS", "ROLE_PERMISSIONS",
    "MENUS", "ROLE_MENUS", "USER_MENUS", "CONFIG", "SESSIONS", "AUDIT_LOG"
  ];
  [...coreSheets, ...businessSheets].forEach((s) => {
    assert.ok(projectSpreadsheet.getSheetByName(s), `Expected sheet '${s}' auto-created`);
  });

  // Readily Production: 0 mock/seed rows in all 12 business sheets
  businessSheets.forEach((s) => {
    assert.strictEqual(projectSpreadsheet.getSheetByName(s).getLastRow(), 1, `Sheet ${s} must contain only header row (0 seed rows)`);
  });

  assert.strictEqual(coreOwnServices._propsMap.size, 0, "Core Library VM must store zero project properties");
  console.log("  [PASS] TEST 1: doGet() + 11 Core + 12 Carpentry Business sheets auto-initialized (0 mock rows) & VM isolated.");
}

// =========================================================================
// TEST 2: ADMIN LOGIN, 9 MENU ĐỘNG & 10 THAM SỐ ĐỘNG CONFIG
// =========================================================================
const adminLogin = projectVm.apiLogin({ username: "admin", password: "admin123" });
assert.strictEqual(adminLogin.success, true, adminLogin.message);
const adminToken = adminLogin.data.token;
assert.strictEqual(coreOwnServices._propsMap.size, 0, "Core Library VM must remain empty after login");
assert.ok(projectOwnServices._propsMap.size > 0, "Project PropertiesService must hold isolated project properties");

const sessRes = projectVm.apiCheckSession(adminToken);
assert.strictEqual(sessRes.success, true, sessRes.message);
assert.strictEqual(sessRes.data.is_admin, true);
assert.strictEqual(sessRes.data.menus.filter((m) => String(m.id).startsWith("MNU_CRP_")).length, 9, "Expected 9 dynamic Carpentry menus");

const settingsRes = projectVm.apiGetAppSettings(adminToken);
assert.strictEqual(settingsRes.success, true);
const cfgKeys = new Set(settingsRes.data.list.map((d) => d.key));
[
  "DEFAULT_PAGE_SIZE", "UPCOMING_DELIVERY_DAYS", "URGENT_DELAY_ALERT_DAYS",
  "PAYMENT_INSTALLMENT_SCHEDULE", "DEFAULT_WARRANTY_MONTHS",
  "REQUIRE_STAGE2_PAY_BEFORE_SHIP", "PRODUCTION_STAGES_JSON",
  "LOW_STOCK_THRESHOLD_DEFAULT", "OPENING_CASH_BALANCE", "CARPENTRY_DRIVE_FOLDER_NAME"
].forEach((k) => assert.ok(cfgKeys.has(k), `CONFIG must contain '${k}'`));

console.log("  [PASS] TEST 2: Admin USR001 authenticated, 9 menus & 10 dynamic Carpentry CONFIG keys verified.");

// =========================================================================
// TEST 3: MA TRẬN PHÂN QUYỀN 4 VAI TRÒ XƯỞNG MỘC (KỸ THUẬT / XƯỞNG / LẮP ĐẶT / KẾ TOÁN)
// =========================================================================
let techToken, foremanToken, installerToken, accountantToken;
{
  const permsResp = projectVm.apiGetRolePermissions(adminToken, "ROLE_STAFF");
  assert.strictEqual(permsResp.success, true);
  const permCodeToId = {};
  (permsResp.data.module_groups || []).forEach((grp) => {
    (grp.permissions || []).forEach((p) => { permCodeToId[p.code] = p.id; });
  });

  function createRoleAndUser(code, roleName, permCodes, username, fullName) {
    const cr = projectVm.apiCreateRole(adminToken, { code, name: roleName, description: roleName });
    assert.strictEqual(cr.success, true, cr.message);
    const permIds = permCodes.map((c) => permCodeToId[c]).filter(Boolean);
    assert.strictEqual(permIds.length, permCodes.length, `All perm codes for ${code} must resolve`);
    const sp = projectVm.apiSaveRolePermissions(adminToken, cr.data.id, permIds);
    assert.strictEqual(sp.success, true, sp.message);

    const cu = projectVm.apiCreateUser(adminToken, {
      username, password: "Crp@2026", full_name: fullName, email: `${username}@carpentry.vn`,
      role_ids: [cr.data.id], status: "ACTIVE"
    });
    assert.strictEqual(cu.success, true, cu.message);
    const lg = projectVm.apiLogin({ username, password: "Crp@2026" });
    assert.strictEqual(lg.success, true, lg.message);
    return lg.data.token;
  }

  techToken = createRoleAndUser(
    "TECH_DESIGN", "Kỹ thuật viên & Thiết kế",
    ["menu.surveys", "menu.orders", "menu.drawings", "menu.materials", "menu.customers", "customer.view", "customer.manage", "survey.create", "order.view", "quotation.create", "drawing.view", "drawing.upload", "photo.upload", "material.estimate"],
    "kythuat1", "Lê Văn Sơn (Thiết kế)"
  );

  foremanToken = createRoleAndUser(
    "FOREMAN", "Tổ trưởng Xưởng & Thợ SX",
    ["menu.production", "menu.drawings", "menu.materials", "order.view", "drawing.view", "production.stage_update", "photo.upload", "package.qr_print", "material.issue"],
    "toxuong1", "Nguyễn Hùng (Tổ trưởng xưởng)"
  );

  installerToken = createRoleAndUser(
    "INSTALLER", "Đội trưởng Lắp đặt & Bảo hành",
    ["menu.install_warranty", "menu.drawings", "order.view", "drawing.view", "delivery.update", "acceptance.sign", "photo.upload", "warranty.manage"],
    "lapdat1", "Phạm Trung Hiếu (Lắp đặt)"
  );

  accountantToken = createRoleAndUser(
    "ACCOUNTANT", "Kế toán & Thu ngân",
    ["menu.payments", "menu.reports_cash", "order.view", "order.view_all", "payment.create", "debt.view", "material.expense_create", "cash.view", "report.view"],
    "ketoan1", "Trần Mai Anh (Kế toán)"
  );

  assert.strictEqual(projectVm.apiGetCarpentryReports(foremanToken, {}).success, false, "Foreman must NOT access P&L reports");
  assert.strictEqual(projectVm.apiApproveQuotationAndStartOrder(techToken, { order_id: "X" }).success, false, "Tech must NOT approve orders");
  assert.strictEqual(projectVm.apiUpdateItemProductionStage(accountantToken, { order_item_id: "X", to_stage: "CNC_CUTTING" }).success, false, "Accountant must NOT update production stage");

  console.log("  [PASS] TEST 3: Created & verified Tech/Design, Foreman, Installer & Accountant RBAC matrices.");
}

// =========================================================================
// TEST 4: DANH MỤC VÁN GỖ & PHỤ KIỆN (`MATERIAL_CATALOG`) + RBAC GUARD
// =========================================================================
let mdfMatId, hingeMatId;
{
  const denyMat = projectVm.apiSaveMaterialCatalog(foremanToken, { item_name: "Test" });
  assert.strictEqual(denyMat.success, false, "Foreman must NOT configure Material Catalog");

  const m1 = projectVm.apiSaveMaterialCatalog(adminToken, {
    catalog_kind: "RAW_MATERIAL",
    category: "BOARD_WOOD",
    item_name: "Ván MDF chống ẩm 17mm An Cường (Mã 388 EV)",
    spec_material: "MDF lõi xanh chống ẩm 1220x2440",
    unit: "Tấm",
    default_cost_price: 520000,
    stock_qty: 25,
    min_stock_qty: 8
  });
  assert.strictEqual(m1.success, true, m1.message);
  assert.strictEqual(m1.data.material_code, "VT0001");
  mdfMatId = m1.data.id;

  const m2 = projectVm.apiSaveMaterialCatalog(adminToken, {
    catalog_kind: "RAW_MATERIAL",
    category: "HARDWARE",
    item_name: "Bản lề giảm chấn Inox 304 Hafele",
    unit: "Cái",
    default_cost_price: 45000,
    stock_qty: 50,
    min_stock_qty: 10
  });
  assert.strictEqual(m2.success, true, m2.message);
  assert.strictEqual(m2.data.material_code, "VT0002");
  hingeMatId = m2.data.id;

  console.log("  [PASS] TEST 4: Raw Materials & Hardware Catalog (`VT0001`, `VT0002`) configured with RBAC guard.");
}

// =========================================================================
// TEST 5: LUỒNG NGHIỆP VỤ KHÉP KÍN XƯỞNG MỘC (KHẢO SÁT -> ĐƠN MD/M2/CÁI ->
//         BẢN VẼ DRIVE -> CỌC ĐỢT 1 -> XUẤT VÁN -> 6 CÔNG ĐOẠN CNC..QC ->
//         TEM QR KIỆN -> ĐỢT 2 -> LẮP ĐẶT & NGHIỆM THU -> BẢO HÀNH -> LÃI/LỖ)
// =========================================================================
{
  // 5.1 Thêm Chủ đầu tư
  const cu = projectVm.apiSaveCustomer(techToken, {
    full_name: "Anh Trần Quốc Bảo",
    phone: "0909888777",
    site_address: "Căn hộ B12-08, Chung cư Cara River Park",
    project_type: "APARTMENT",
    lead_source: "ARCHITECT_PARTNER",
    partner_name: "KTS Minh Khoa",
    site_notes: "Chung cư chỉ thi công giờ hành chính, đăng ký thang hàng trước 1 ngày"
  });
  assert.strictEqual(cu.success, true, cu.message);
  assert.strictEqual(cu.data.customer_code, "KH-00001");
  assert.strictEqual(cu.data.phone, "0909888777", "Leading zero preserved");

  // 5.2 Khảo sát đo đạc & chụp ảnh hiện trạng mặt bằng đẩy thẳng MockDriveApp
  const dummyB64 = Buffer.from("FAKE_SITE_MEASUREMENT_IMAGE").toString("base64");
  const srvRes = projectVm.apiSaveSurvey(techToken, {
    customer_id: cu.data.id,
    survey_area: "Phòng Bếp & Phòng Ngủ Master",
    measurements_summary: "Tủ bếp trên/dưới: D3.2m; Tủ áo Master kịch trần: 2.4m x 2.6m",
    site_constraints: "Vướng hộp kỹ thuật góc trái, chừa ổ cắm bếp từ",
    photo_base64: dummyB64,
    photo_file_name: "bep_hien_trang.jpg"
  });
  assert.strictEqual(srvRes.success, true, srvRes.message);
  assert.ok(srvRes.data.survey.survey_code.startsWith("KS-"));
  assert.ok(srvRes.data.photo && srvRes.data.photo.drive_url.includes("https://drive.google.com/uc?export=view&id="));

  // 5.3 Lập Báo giá chi tiết hỗ trợ cả 3 đơn vị (md / m2 / cái) -> Tổng đúng 50.612.000đ + 3 đợt thanh toán 40-40-20
  const ordCreate = projectVm.apiSaveQuotationOrder(techToken, {
    survey_id: srvRes.data.survey.id,
    customer_id: cu.data.id,
    title: "Nội thất Căn hộ B12-08 (Bếp & Ngủ Master)",
    payment_plan_code: "40-40-20",
    warranty_months: 24,
    items: [
      { category: "KITCHEN", item_name: "Tủ bếp dưới MDF chống ẩm phủ Melamine", spec_material: "MDF 17mm 388 EV", calc_mode: "MD", length_m: 3.2, quantity: 1, unit_price: 3500000 },
      { category: "KITCHEN", item_name: "Tủ bếp trên MDF chống ẩm phủ Acrylic", spec_material: "Acrylic bóng gương", calc_mode: "MD", length_m: 3.2, quantity: 1, unit_price: 4200000 },
      { category: "BEDROOM", item_name: "Tủ quần áo Master kịch trần", spec_material: "MDF Melamine", calc_mode: "M2", length_m: 2.4, height_or_width_m: 2.6, quantity: 1, unit_price: 2800000 },
      { category: "BEDROOM", item_name: "Giường ngủ bọc nỉ 1m8 x 2m", spec_material: "MDF bọc nỉ", calc_mode: "UNIT", quantity: 1, unit_price: 8500000 }
    ]
  });
  assert.strictEqual(ordCreate.success, true, ordCreate.message);
  const ord = ordCreate.data.order;
  const ordItems = ordCreate.data.items;
  const ordPays = ordCreate.data.payments;
  assert.ok(ord.order_code.startsWith("NT-"));
  assert.strictEqual(ord.total_amount, 50612000, "Expected 11.2M + 13.44M + 17.472M + 8.5M = 50,612,000 VND");
  assert.strictEqual(ordPays.length, 3, "Expected 3 installment stages");
  assert.strictEqual(ordPays.reduce((s, p) => s + p.due_amount, 0), 50612000, "Installments must sum to 100%");

  // 5.4 Upload Bản vẽ kỹ thuật 2D/3D lên Drive
  const upDraw = projectVm.apiUploadOrderFileOrPhoto(techToken, {
    order_id: ord.id,
    file_category: "DRAWING_2D",
    title_or_room: "Bản vẽ kỹ thuật bóc tách Tủ bếp + Tủ áo",
    file_name: "ban_ve_2d_NT001.pdf",
    mime_type: "application/pdf",
    base64: dummyB64
  });
  assert.strictEqual(upDraw.success, true, upDraw.message);
  assert.ok(upDraw.data.drive_url.includes("DRV_CRP_"));

  // 5.5 Kế toán thu Cọc Đợt 1 (40% = 20.244.800đ) -> Chuyển đơn sang DEPOSITED
  const stage1Due = ordPays[0].due_amount;
  const pay1 = projectVm.apiCollectOrderPayment(accountantToken, {
    payment_id: ordPays[0].id,
    amount: stage1Due,
    payment_channel: "BANK_TRANSFER",
    notes: "Khách chuyển khoản cọc Đợt 1"
  });
  assert.strictEqual(pay1.success, true, pay1.message);
  assert.strictEqual(pay1.data.order.status, "DEPOSITED");

  // 5.6 Quản lý duyệt Bản vẽ & Ra lệnh sản xuất tại xưởng
  const startProd = projectVm.apiApproveQuotationAndStartOrder(adminToken, {
    order_id: ord.id,
    action: "START_PRODUCTION"
  });
  assert.strictEqual(startProd.success, true, startProd.message);
  assert.strictEqual(startProd.data.status, "IN_PRODUCTION");
  assert.strictEqual(startProd.data.drawing_status, "APPROVED");

  // 5.7 Dự trù & Xuất kho vật tư ván gỗ/bản lề (kiểm tra chặn vượt tồn & tính giá vốn công trình)
  const overStock = projectVm.apiEstimateOrIssueMaterial(foremanToken, {
    order_id: ord.id,
    material_id: mdfMatId,
    issued_qty: 99
  });
  assert.strictEqual(overStock.success, false);
  assert.strictEqual(overStock.errorCode, "INSUFFICIENT_MATERIAL_STOCK");

  const issMdf = projectVm.apiEstimateOrIssueMaterial(foremanToken, {
    order_id: ord.id,
    material_id: mdfMatId,
    estimated_qty: 18,
    issued_qty: 18
  });
  assert.strictEqual(issMdf.success, true, issMdf.message);
  assert.strictEqual(issMdf.data.order_financials.material_cost_total, 9360000); // 18 * 520k

  const issHinge = projectVm.apiEstimateOrIssueMaterial(foremanToken, {
    order_id: ord.id,
    material_id: hingeMatId,
    estimated_qty: 34,
    issued_qty: 34
  });
  assert.strictEqual(issHinge.success, true, issHinge.message);
  assert.strictEqual(issHinge.data.order_financials.material_cost_total, 10890000); // 9.36M + 34*45k (1.53M)

  // 5.8 Tổ trưởng cập nhật toàn bộ 4 hạng mục qua các công đoạn tới QC_PACKED (6/6) -> 100%, tự mở khóa thu Đợt 2!
  const stages = ["CNC_CUTTING", "EDGE_BANDING", "ASSEMBLY", "PU_PAINTING", "QC_PACKED"];
  let lastStageRes = null;
  for (const it of ordItems) {
    for (const stCode of stages) {
      lastStageRes = projectVm.apiUpdateItemProductionStage(foremanToken, { order_item_id: it.id, to_stage: stCode });
      assert.strictEqual(lastStageRes.success, true, lastStageRes.message);
    }
  }
  assert.strictEqual(lastStageRes.data.completion_pct, 100);
  assert.strictEqual(lastStageRes.data.order_status, "READY_TO_SHIP");
  assert.strictEqual(lastStageRes.data.stage2_payment_due, true, "Stage 2 payment must turn DUE when order reaches READY_TO_SHIP");

  // 5.9 Tạo 2 Tem QR Kiện hàng & Quét QR tại công trình mở ngay link bản vẽ Drive
  const genQr = projectVm.apiGenerateOrScanPackageQr(foremanToken, {
    mode: "GENERATE",
    order_id: ord.id,
    room_or_item: "Phòng Bếp (Tủ Bếp Trên & Dưới)",
    total_packages: 2,
    contents_desc: "Thùng & Cánh Acrylic"
  });
  assert.strictEqual(genQr.success, true, genQr.message);
  const qrCode1 = genQr.data[0].qr_code;
  const scanRes = projectVm.apiGenerateOrScanPackageQr(installerToken, { mode: "SCAN", qr_code: qrCode1, mark_status: "DELIVERED_SITE" });
  assert.strictEqual(scanRes.success, true, scanRes.message);
  assert.strictEqual(scanRes.data.drawings_and_photos.length, 1);

  // 5.10 Đội lắp đặt bị cảnh báo/chặn xuất xưởng khi chưa thu Đợt 2! Không được tự override; sau khi thu Đợt 2 -> Xuất xưởng thành công
  const blockedShip = projectVm.apiUpdateDeliveryInstallStatus(installerToken, { order_id: ord.id, status: "INSTALLING" });
  assert.strictEqual(blockedShip.success, false);
  assert.strictEqual(blockedShip.errorCode, "STAGE2_UNPAID");

  const illegalOverride = projectVm.apiUpdateDeliveryInstallStatus(installerToken, { order_id: ord.id, status: "INSTALLING", override_payment_check: true });
  assert.strictEqual(illegalOverride.success, false, "Installer must NOT bypass Stage 2 payment gate");
  assert.strictEqual(illegalOverride.errorCode, "OVERRIDE_FORBIDDEN");

  const stage2Due = ordPays[1].due_amount;
  const pay2 = projectVm.apiCollectOrderPayment(accountantToken, { payment_id: ordPays[1].id, amount: stage2Due, payment_channel: "BANK_QR" });
  assert.strictEqual(pay2.success, true, pay2.message);

  const okShip = projectVm.apiUpdateDeliveryInstallStatus(installerToken, { order_id: ord.id, status: "INSTALLING" });
  assert.strictEqual(okShip.success, true, okShip.message);
  assert.strictEqual(okShip.data.status, "INSTALLING");

  // Kiểm tra RBAC tách quyền & tải dữ liệu không N+1 trước khi chốt nghiệm thu
  const foremanBoard = projectVm.apiGetFurnitureOrders(foremanToken, { include_items: true }, 1, 10);
  assert.strictEqual(foremanBoard.success, true);
  assert.ok(Array.isArray(foremanBoard.data.items[0].items) && foremanBoard.data.items[0].items.length === 4, "include_items must embed order items inline to prevent N+1 RPCs");
  assert.strictEqual(foremanBoard.data.items[0].total_amount, null, "Foreman (without order.view_all) must NOT receive contract value");
  assert.strictEqual(foremanBoard.data.items[0].gross_profit, null, "Foreman (without profit_report.view) must NOT receive gross profit");

  const selectiveDetail = projectVm.apiGetFurnitureOrderDetail(foremanToken, ord.id, { sections: ["materials"] });
  assert.strictEqual(selectiveDetail.success, true);
  assert.strictEqual(selectiveDetail.data.materials.length, 2, "Selective detail must return requested materials section");
  assert.strictEqual(selectiveDetail.data.files_photos.length, 0, "Unrequested sections must not be loaded");
  assert.strictEqual(selectiveDetail.data.order.gross_profit, null, "Detail must mask gross_profit for foreman");

  const installFilterRes = projectVm.apiGetFurnitureOrders(installerToken, { statuses: "READY_TO_SHIP,INSTALLING,COMPLETED" }, 1, 10);
  assert.strictEqual(installFilterRes.success, true);
  assert.strictEqual(installFilterRes.data.items.length, 1);

  const foremanDash = projectVm.apiGetCarpentryDashboard(foremanToken);
  assert.strictEqual(foremanDash.success, true);
  assert.strictEqual(foremanDash.data.kpi.active_orders_value, null, "Dashboard must hide active_orders_value for foreman");
  assert.strictEqual(foremanDash.data.kpi.total_debt_receivable, null, "Dashboard must hide debt for foreman");
  assert.strictEqual(foremanDash.data.due_payments.length, 0, "Dashboard must hide due_payments for foreman");

  const accReport = projectVm.apiGetCarpentryReports(accountantToken, {});
  assert.strictEqual(accReport.success, true);
  assert.strictEqual(accReport.data.can_see_profit, false);
  assert.strictEqual(accReport.data.summary.estimated_gross_profit, null, "Accountant without profit_report.view must not see gross profit");

  // 5.11 Nghiệm thu: Installer không có payment.create không được kèm thu tiền đợt cuối; Admin chốt nghiệm thu + thu Đợt 3 -> COMPLETED
  const stage3Due = ordPays[2].due_amount;
  const denyInstallerPay = projectVm.apiCompleteOrderAcceptance(installerToken, {
    order_id: ord.id,
    acceptance_signer: "Trần Quốc Bảo",
    final_payment_amount: stage3Due
  });
  assert.strictEqual(denyInstallerPay.success, false, "Installer without payment.create must be rejected when passing final_payment_amount > 0");
  assert.strictEqual(denyInstallerPay.errorCode, "AUTH_FORBIDDEN");

  const accRes = projectVm.apiCompleteOrderAcceptance(adminToken, {
    order_id: ord.id,
    acceptance_signer: "Trần Quốc Bảo",
    final_payment_amount: stage3Due
  });
  assert.strictEqual(accRes.success, true, accRes.message);
  assert.strictEqual(accRes.data.order.status, "COMPLETED");
  assert.strictEqual(accRes.data.order.debt_amount, 0);
  assert.ok(accRes.data.warranty_until_date, "Warranty expiration date must be set");

  // 5.12 Mở & Xử lý Phiếu Bảo Hành gắn đơn gốc
  const wrnOpen = projectVm.apiSaveWarrantyTicket(installerToken, {
    order_code: ord.order_code,
    issue_desc: "Khách báo hơi xệ nhẹ bản lề cánh tủ bếp trên bên phải"
  });
  assert.strictEqual(wrnOpen.success, true, wrnOpen.message);
  assert.ok(wrnOpen.data.ticket_code.startsWith("BH-"));
  assert.strictEqual(projectVm.apiSaveWarrantyTicket(installerToken, { id: wrnOpen.data.id, status: "RESOLVED", repair_notes: "Đã cân chỉnh ốc bản lề êm" }).success, true);

  // 5.13 Ghi chi nhập kho 10 tấm MDF qua Sổ quỹ (`MATERIAL_PURCHASE`: tồn 7 -> 17) & Báo cáo Lãi/Lỗ
  const cashBuy = projectVm.apiCreateCashTransaction(accountantToken, {
    tx_type: "OUT",
    category: "MATERIAL_PURCHASE",
    material_id: mdfMatId,
    qty: 10,
    amount: 5200000,
    payment_channel: "BANK_TRANSFER",
    description: "Nhập thêm 10 tấm MDF 17mm An Cường"
  });
  assert.strictEqual(cashBuy.success, true, cashBuy.message);
  const mdfAfter = projectVm.apiGetMaterialCatalog(adminToken, { keyword: "VT0001" }, 1, 10).data.items[0];
  assert.strictEqual(mdfAfter.stock_qty, 17, "MDF stock must drop 25->7 on issue and increment 7->17 on cash stock-in");

  const rep = projectVm.apiGetCarpentryReports(adminToken, {});
  assert.strictEqual(rep.success, true);
  assert.strictEqual(rep.data.summary.total_contract_signed, 50612000);
  assert.strictEqual(rep.data.summary.total_collected, 50612000);
  assert.strictEqual(rep.data.summary.estimated_gross_profit, 50612000 - 10890000);

  const dash = projectVm.apiGetCarpentryDashboard(adminToken);
  assert.strictEqual(dash.success, true);
  assert.strictEqual(dash.data.kpi.total_debt_receivable, 0);

  console.log("  [PASS] TEST 5: Full Closed-Loop Carpentry Workflow (Survey+Drive -> md/m2/unit Order -> 40-40-20 -> Stock Issue -> 6 Prod Stages -> QR Scan -> Stage2 Ship Gate -> Acceptance+Warranty -> P&L Reports) passed!");
}

// =========================================================================
// TEST 6: PHÂN TRANG BẮT BUỘC (10 + 2 KHÁCH HÀNG TRÊN 2 TRANG)
// =========================================================================
{
  for (let i = 2; i <= 12; i++) {
    const res = projectVm.apiSaveCustomer(techToken, {
      full_name: `Chủ đầu tư ${i}`,
      phone: `09770000${String(i).padStart(2, "0")}`,
      site_address: `Căn hộ ${i}01`,
      project_type: "APARTMENT"
    });
    assert.strictEqual(res.success, true, res.message);
  }
  const p1 = projectVm.apiGetCustomers(techToken, {}, 1, 10);
  assert.strictEqual(p1.success, true);
  assert.strictEqual(p1.data.items.length, 10);
  assert.strictEqual(p1.data.pagination.total, 12);
  assert.strictEqual(p1.data.pagination.totalPages, 2);
  assert.strictEqual(p1.data.pagination.hasNext, true);

  const p2 = projectVm.apiGetCustomers(techToken, {}, 2, 10);
  assert.strictEqual(p2.success, true);
  assert.strictEqual(p2.data.items.length, 2);
  assert.strictEqual(p2.data.pagination.hasPrev, true);
  console.log("  [PASS] TEST 6: Mandatory pagination (10 + 2 items across 2 pages) verified.");
}

// =========================================================================
// TEST 7: KIỂM TRA CÚ PHÁP FRONTEND JS, STATIC DOM ID, RPC PARITY & RBAC GUARD
// =========================================================================
{
  const uiFiles = fs.readdirSync(path.join(projectSrcDir, "ui")).filter((f) => f.endsWith(".html")).map((f) => path.join("ui", f));
  const pageFiles = fs.readdirSync(path.join(projectSrcDir, "pages")).filter((f) => f.endsWith(".html")).map((f) => path.join("pages", f));
  const htmlFiles = [...uiFiles, ...pageFiles];

  const allKnownPerms = projectSpreadsheet.getSheetByName("PERMISSIONS")
    .getRange(1, 1, projectSpreadsheet.getSheetByName("PERMISSIONS").getLastRow(), 5)
    .getValues().map((r) => String(r[1] || ""));

  let scriptBlocksChecked = 0;
  const missingRpcTargets = [];
  for (const relHtml of htmlFiles) {
    const raw = fs.readFileSync(path.join(projectSrcDir, relHtml), "utf8");
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(raw)) !== null) {
      new vm.Script(match[1], { filename: relHtml });
      scriptBlocksChecked++;
    }

    const rpcCallRegex = /\.(api[A-Z][a-zA-Z0-9_]*)\s*\(/g;
    let rpcMatch;
    while ((rpcMatch = rpcCallRegex.exec(raw)) !== null) {
      if (typeof projectVm[rpcMatch[1]] !== "function") {
        missingRpcTargets.push(`${relHtml} -> ${rpcMatch[1]}()`);
      }
    }

    if (relHtml.startsWith("pages")) {
      assert.ok(!/ROLE_ADMIN|role\s*===\s*["']ADMIN["']|\.is_admin/.test(raw), `${relHtml} must not hardcode Admin role checks`);
    }

    const permCallRegex = /\.hasPermission\(\s*["']([a-zA-Z0-9_.-]+)["']\s*\)/g;
    let pMatch;
    while ((pMatch = permCallRegex.exec(raw)) !== null) {
      assert.ok(allKnownPerms.includes(pMatch[1]), `${relHtml} references unknown permission '${pMatch[1]}'`);
    }
  }
  assert.ok(scriptBlocksChecked >= 15, `Expected >= 15 <script> blocks, found ${scriptBlocksChecked}`);
  assert.deepStrictEqual(missingRpcTargets, [], "Missing backend RPC targets: " + missingRpcTargets.join(", "));

  const definedIds = new Set();
  const idDefRegex = /\bid=["']([^"'+]+)["']/g;
  let idMatch;
  while ((idMatch = idDefRegex.exec(renderedHtml)) !== null) {
    definedIds.add(idMatch[1]);
  }

  const missingDomIds = [];
  for (const relHtml of htmlFiles) {
    const raw = fs.readFileSync(path.join(projectSrcDir, relHtml), "utf8");
    const callRegex = /getElementById\(\s*["']([a-zA-Z0-9_-]+)["']\s*\)/g;
    let cm;
    while ((cm = callRegex.exec(raw)) !== null) {
      const fullSnippet = raw.slice(Math.max(0, cm.index - 5), cm.index + cm[0].length + 5);
      if (fullSnippet.includes("+")) continue;
      if (!definedIds.has(cm[1])) missingDomIds.push(`${relHtml} -> #${cm[1]}`);
    }
  }
  assert.deepStrictEqual(missingDomIds, [], "Missing static DOM IDs: " + missingDomIds.join(", "));
  assert.ok(renderedHtml.includes("toggleSidebar: function"), "APP.toggleSidebar() must be defined for mobile nav");
  for (const relHtml of pageFiles) {
    const raw = fs.readFileSync(path.join(projectSrcDir, relHtml), "utf8");
    assert.ok(!/\(res\s*&&\s*res\.error\)/.test(raw), `${relHtml} must read res.message before res.error`);
  }
  console.log(`  [PASS] TEST 7: Verified JS syntax (${scriptBlocksChecked} blocks), 100% static DOM IDs, 100% RPC parity, permission-only UI guards & zero-miss HTML includes.`);
}

console.log("=== ALL 14-PROJECT-CARPENTRY INTEGRATION TESTS PASSED (100%) ===\n");
