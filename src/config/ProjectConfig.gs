/**
 * ProjectConfig.gs
 * Cấu hình Định danh Dự án, Khai báo Mở rộng Nghiệp vụ (Bảng Sheet, Quyền 2 tầng, Menu, Tham số Động)
 * và Hàm khởi tạo Context `getCore_(token)` kết nối sang thư viện `Core` (Apps Script Library).
 *
 * LƯU Ý KIẾN TRÚC ĐA DỰ ÁN:
 * 1. Mỗi dự án có Apps Script ID riêng (`SCRIPT_ID` / `.clasp.json` -> `scriptId`).
 *    Apps Script của dự án gắn trực tiếp với Google Sheet (Container-bound), nên tự động biết Sheet nào
 *    qua `SpreadsheetApp.getActiveSpreadsheet()` — hoàn toàn KHÔNG cần cấu hình hay quan tâm `sheetId`.
 * 2. Mọi tài nguyên nhạy cảm với phạm vi dự án (`PropertiesService`, `CacheService`, `LockService`, `Spreadsheet`)
 *    đều được khởi tạo từ phía Dự án và truyền vào `Core.init(...)` để cô lập tuyệt đối giữa các dự án.
 */

var PROJECT_CONFIG = {
  APP_CODE: "CARPENTRY",
  APP_NAME: "Hệ Thống Quản Lý Xưởng Mộc & Nội Thất May Đo (MVP)",
  APP_VERSION: "1.0.0",
  ENVIRONMENT: "PROD",
  TIMEZONE: "Asia/Ho_Chi_Minh",
  SESSION_TTL_HOURS: 24,

  // Apps Script ID riêng của dự án (tự động nhận diện qua ScriptApp.getScriptId() khi chạy thực tế)
  SCRIPT_ID: "YOUR_PROJECT_SCRIPT_ID_HERE",

  // 1. Khai báo các Bảng dữ liệu Nghiệp vụ của riêng dự án (Core sẽ tự động khởi tạo Header lũy thừa, KHÔNG seed dữ liệu test)
  BUSINESS_SHEETS: {
    SAMPLE_ITEMS: {
      NAME: "SAMPLE_ITEMS",
      HEADERS: ["id", "item_code", "item_name", "category", "status", "notes", "created_at", "updated_at", "created_by_id"]
    }
  },

  // 2. Khai báo Quyền hạn 2 tầng của các Module Nghiệp vụ dự án
  BUSINESS_PERMISSIONS: [
    { code: "menu.sample", name: "Menu Nghiệp vụ Mẫu", module_group: "Nghiệp vụ mẫu", perm_type: "MENU", description: "Hiển thị menu Module Nghiệp vụ Mẫu" },
    { code: "sample.view", name: "Xem danh sách dữ liệu mẫu", module_group: "Nghiệp vụ mẫu", perm_type: "ACTION", description: "Quyền tra cứu danh sách bản ghi mẫu" },
    { code: "sample.create", name: "Thêm mới dữ liệu mẫu", module_group: "Nghiệp vụ mẫu", perm_type: "ACTION", description: "Quyền tạo mới bản ghi dữ liệu mẫu" },
    { code: "sample.update", name: "Cập nhật dữ liệu mẫu", module_group: "Nghiệp vụ mẫu", perm_type: "ACTION", description: "Quyền chỉnh sửa bản ghi dữ liệu mẫu" },
    { code: "sample.delete", name: "Xóa dữ liệu mẫu", module_group: "Nghiệp vụ mẫu", perm_type: "ACTION", description: "Quyền xóa bản ghi dữ liệu mẫu" }
  ],

  // 3. Khai báo Menu điều hướng của các Module Nghiệp vụ (sort_order 100..800 nằm giữa Tổng quan [10] và Quản trị hệ thống [900+])
  BUSINESS_MENUS: [
    {
      id: "MNU_SAMPLE",
      code: "sample",
      name: "Nghiệp vụ mẫu",
      group_name: "Nghiệp vụ mẫu",
      icon: "layers",
      route_module: "sample",
      permission_code: "menu.sample",
      badge_text: "",
      sort_order: 100,
      status: "ACTIVE",
      description: "Module khởi đầu mẫu minh họa cách gọi Core Library (Authorization, Data, Pagination)"
    }
  ],

  // 4. Quyền nghiệp vụ mặc định gán cho vai trò Manager và Staff khi khởi tạo dự án lần đầu
  BUSINESS_ROLE_PERMISSIONS: {
    Manager: ["menu.sample", "sample.view", "sample.create", "sample.update", "sample.delete"],
    Staff: ["menu.sample", "sample.view", "sample.create", "sample.update"]
  },

  // 5. Tham số cấu hình động đặc thù của dự án (tự động xuất hiện trong tab "Tham số Dự án" của màn hình Cấu hình)
  BUSINESS_CONFIGS: [
    {
      key: "DEFAULT_PAGE_SIZE",
      value: "10",
      group_name: "business",
      label: "Số dòng mặc định trên mỗi trang",
      data_type: "SELECT",
      options_json: '["10","25","50","100"]',
      is_public: "TRUE",
      description: "Số lượng bản ghi hiển thị mặc định khi tải danh sách"
    },
    {
      key: "SAMPLE_CODE_PREFIX",
      value: "SMP",
      group_name: "business",
      label: "Tiền tố sinh mã Nghiệp vụ mẫu",
      data_type: "STRING",
      options_json: "",
      is_public: "FALSE",
      description: "Tiền tố tự động khi tạo bản ghi mới trong bảng SAMPLE_ITEMS"
    }
  ]
};

/**
 * Khởi tạo đối tượng `Core` gắn với Context cô lập của dự án hiện tại
 * @param {string} [token] Session token từ phía Client gửi lên
 * @returns {Object} Bound Core Facade Instance
 */
function getCore_(token) {
  if (typeof Core === "undefined" || !Core || typeof Core.init !== "function") {
    throw new Error("Chưa kết nối thư viện Core! Vui lòng kiểm tra dependencies.libraries ('Core') trong appsscript.json.");
  }

  var runtimeScriptId = "";
  if (typeof ScriptApp !== "undefined" && ScriptApp && typeof ScriptApp.getScriptId === "function") {
    try {
      runtimeScriptId = String(ScriptApp.getScriptId() || "").trim();
    } catch (e) {}
  }
  if (!runtimeScriptId && PROJECT_CONFIG.SCRIPT_ID && PROJECT_CONFIG.SCRIPT_ID !== "YOUR_PROJECT_SCRIPT_ID_HERE") {
    runtimeScriptId = String(PROJECT_CONFIG.SCRIPT_ID).trim();
  }

  var activeSs = null;
  if (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp && typeof SpreadsheetApp.getActiveSpreadsheet === "function") {
    try {
      activeSs = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e2) {}
  }

  return Core.init({
    appCode: PROJECT_CONFIG.APP_CODE,
    scriptId: runtimeScriptId,
    appName: PROJECT_CONFIG.APP_NAME,
    appVersion: PROJECT_CONFIG.APP_VERSION,
    environment: PROJECT_CONFIG.ENVIRONMENT,
    timezone: PROJECT_CONFIG.TIMEZONE,
    sessionTtlHours: PROJECT_CONFIG.SESSION_TTL_HOURS,
    spreadsheet: activeSs,
    spreadsheetId: PROJECT_CONFIG.SPREADSHEET_ID || "",
    token: token || "",
    hostProperties: PropertiesService.getScriptProperties(),
    hostCache: CacheService.getScriptCache(),
    hostLock: LockService.getScriptLock(),
    businessSheets: PROJECT_CONFIG.BUSINESS_SHEETS,
    businessPermissions: PROJECT_CONFIG.BUSINESS_PERMISSIONS,
    businessMenus: PROJECT_CONFIG.BUSINESS_MENUS,
    businessRolePermissions: PROJECT_CONFIG.BUSINESS_ROLE_PERMISSIONS,
    businessConfigs: PROJECT_CONFIG.BUSINESS_CONFIGS
  });
}

/**
 * Chuẩn hóa dữ liệu trả về qua google.script.run (đảm bảo tuần tự hóa JSON an toàn)
 */
function toRpcJson_(result) {
  return JSON.parse(JSON.stringify(result));
}
