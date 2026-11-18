# BaseAppScript — `app-template` (Cloneable Project Skeleton)

Bộ khung dự án mẫu (UI Layout, Sidebar động, Login, `RpcGateway`, `ProjectConfig`, Module nghiệp vụ mẫu, cơ chế `npm run deploy` giữ link cố định) dùng để **clone tạo nhanh các dự án mới** (`CRM`, `Inventory`, `Booking`, `HR`...) mà **không cần copy mã nguồn Core**.

> 📖 **Cẩm nang toàn diện**: Xem chi tiết tại [**`BaseAppScript/HUONG_DAN_TOAN_DIEN.md`**](../HUONG_DAN_TOAN_DIEN.md) để xem đầy đủ mẫu code Backend, Frontend, Router và hướng dẫn deploy.

---

## 1. Cấu trúc Thư mục

```text
app-template/
├── src/
│   ├── appsscript.json             # Tham chiếu Core Library theo libraryId & version cố định
│   ├── Code.gs                     # doGet(e) & include() đa đường dẫn (ui/, pages/)
│   ├── RpcGateway.gs               # Tầng ủy quyền mỏng sang Core Library
│   ├── config/
│   │   └── ProjectConfig.gs        # Định danh dự án (APP_CODE, SCRIPT_ID), khai báo Sheet/Quyền/Menu/Config nghiệp vụ & getCore_()
│   ├── business/
│   │   └── SampleService.gs        # Dịch vụ nghiệp vụ mẫu (gọi Core.Authorization, Core.Data, Core.Audit)
│   ├── ui/
│   │   ├── Index.html              # Khung giao diện Master + các màn hình quản trị Core
│   │   ├── Css.html                # Design System CSS
│   │   └── Js_*.html               # Điều khiển Frontend (App, Auth, Users+UserMenus, Roles, Menus, Settings, Audit)
│   └── pages/
│       └── Page_Sample.html        # Trang giao diện nghiệp vụ mẫu tự đăng ký qua APP.registerModule()
├── scripts/
│   └── new-project.ps1             # Script khởi tạo dự án mới trong 5 giây
├── tests/
│   └── run_template_integration.js # Kiểm thử tích hợp End-to-End qua Node CLI
├── .clasp.json                     # Lưu scriptId riêng của dự án & deploymentId cố định
├── deploy.ps1                      # Script đẩy code & cập nhật Web App giữ nguyên link cố định
└── package.json                    # Cung cấp lệnh: npm run deploy, npm run push, npm test
```

---

## 2. Cơ Chế Nhận Diện Dự Án & Giữ Link Web App Cố Định

### 2.1. Nhận diện bằng Apps Script ID (`scriptId`) — Không cần quan tâm `sheetId`
- Mỗi dự án được tạo từ một file Google Sheet (**Tiện ích mở rộng -> Apps Script**).
- Bản thân **Apps Script ID (`scriptId`)** của dự án đã gắn chặt với Google Sheet đó, nên hàm `getCore_(token)` trong `src/config/ProjectConfig.gs` tự động lấy Sheet qua `SpreadsheetApp.getActiveSpreadsheet()` và định danh dự án qua `ScriptApp.getScriptId()` — bạn **không cần lấy hay cấu hình `sheetId` (`SPREADSHEET_ID`)**.

### 2.2. Chạy `npm run deploy` luôn giữ Link Web App (`/exec`) cố định
- File `.clasp.json` trong mỗi dự án có cấu trúc:
  ```json
  {
    "scriptId": "<APPS_SCRIPT_ID_CUA_DU_AN>",
    "rootDir": "src",
    "deploymentId": "<DEPLOYMENT_ID_CO_DINH>"
  }
  ```
- Khi bạn chạy `npm run deploy`:
  1. Hệ thống chạy `npx @google/clasp push -f` để đẩy toàn bộ code trong `src/` lên Google Apps Script.
  2. Nếu `deploymentId` trong `.clasp.json` đã có, hệ thống chạy `npx @google/clasp deploy -i <deploymentId>` để cập nhật trực tiếp vào Deployment đó.
  3. Nếu `deploymentId` đang trống (lần đầu tiên deploy), script tự động kiểm tra các Deployment hiện có trên Google Apps Script (hoặc tạo mới nếu chưa có) và **tự động ghi khóa `deploymentId` vào `.clasp.json`**.
  4. Nhờ đó, đường link `https://script.google.com/macros/s/<deploymentId>/exec` **luôn giữ nguyên cố định** qua mọi lần cập nhật.

---

## 3. Quy Trình 6 Bước Tạo & Triển Khai Dự Án Mới

1. **Tạo Google Sheet & Lấy Apps Script ID của dự án**:
   - Tạo Google Sheet mới cho dự án (ví dụ: `CRM - Database`).
   - Chọn **Tiện ích mở rộng -> Apps Script**, vào **Cài đặt dự án (Project Settings)** và copy **ID tập lệnh (Script ID)**.
2. **Nhân bản dự án từ `app-template`**:
   ```powershell
   .\BaseAppScript\app-template\scripts\new-project.ps1 `
     -AppCode "CRM" `
     -AppName "Hệ thống Quản lý Khách hàng CRM" `
     -TargetDir "d:\NewAppScript\project-crm" `
     -ScriptId "<PROJECT_APPS_SCRIPT_ID>" `
     -CoreLibraryId "<CORE_LIBRARY_SCRIPT_ID>" `
     -CoreVersion "1"
   ```
3. **Khai báo Bảng, Quyền, Menu & Config Nghiệp vụ**:
   - Mở `src/config/ProjectConfig.gs` của dự án mới, khai báo `BUSINESS_SHEETS`, `BUSINESS_PERMISSIONS`, `BUSINESS_MENUS`, `BUSINESS_ROLE_PERMISSIONS`, `BUSINESS_CONFIGS`.
4. **Code Logic Nghiệp vụ (Backend)**:
   - Tạo các file tại `src/business/` (theo mẫu `SampleService.gs`), gọi `var app = getCore_(token);`.
5. **Code Trang Giao diện Nghiệp vụ (Frontend)**:
   - Tạo các file tại `src/pages/Page_*.html` (theo mẫu `Page_Sample.html`) và nhúng `<?!= include('Page_TenModule'); ?>` vào `src/ui/Index.html`.
6. **Triển khai bằng `npm run deploy` (Giữ link cố định)**:
   ```powershell
   cd d:\NewAppScript\project-crm
   npm run deploy
   ```
   Mở đường link Web App hiển thị trên màn hình. Ngay lần mở đầu tiên, hệ thống tự động tạo 11 bảng Core + các bảng nghiệp vụ trong Google Sheet và tài khoản quản trị `admin` / `admin123`.
