# `14-project-carpentry` — Hệ Thống Quản Lý Xưởng Mộc & Nội Thất May Đo (MVP)

Ứng dụng quản lý toàn trình **Xưởng Mộc / Nội Thất May Đo Công Trình**, xây dựng trên nền **BaseAppScript Framework** (Google Sheets + Google Apps Script + Responsive Web App Mobile-First).

- **Mã dự án (`APP_CODE`)**: `CARPENTRY`
- **Tên hiển thị (`APP_NAME`)**: `Hệ Thống Quản Lý Xưởng Mộc & Nội Thất May Đo (MVP)`
- **Kiến trúc**: Kế thừa toàn bộ Core Library (`Core.init(context)` gồm Auth/JWT Session, 2-Tier RBAC Permissions, Dynamic Menus, Config động, Pagination, Audit Log) — **không chỉnh sửa `BaseAppScript`**, cô lập tài nguyên dự án theo `ScriptApp.getScriptId()`.
- **Chuẩn Readily Production**: Tự khởi tạo **11 bảng Core + 12 bảng Nghiệp vụ** chỉ có hàng tiêu đề đóng băng (**0 dữ liệu mẫu rác**); tài khoản quản trị khởi tạo duy nhất là `admin` / `admin123` (`USR001`).

---

## 1. Luồng Nghiệp Vụ Khép Kín Xưởng Mộc & Công Trình

1. **Khảo sát & Đo đạc công trình (`menu.surveys`)**:
   - Kỹ thuật viên đi công trình chọn Chủ đầu tư, ghi khu vực đo, kích thước thực tế, lưu ý vướng hộp kỹ thuật / ổ cắm và chụp ảnh mặt bằng đẩy thẳng Google Drive (`CARPENTRY_DRAWINGS_PHOTOS/KS-.../`).
   - Hỗ trợ chuyển trực tiếp Phiếu khảo sát (`KS-YYYYMMDD-001`) thành Báo giá / Đơn hàng.
2. **Báo giá & Lập đơn hàng may đo (`menu.orders`)**:
   - Bóc tách hạng mục hỗ trợ linh hoạt **3 cách tính giá**:
     - `MD` (Mét dài): Tủ bếp trên/dưới, phào chỉ...
     - `M2` (Mét vuông = Dài × Cao/Rộng × SL): Tủ áo kịch trần, vách ốp...
     - `UNIT` (Cái / Bộ / Chiếc): Giường ngủ, bàn ăn, bộ phụ kiện...
   - Tự chia lịch thanh toán nhiều đợt trên `ORDER_PAYMENTS` theo cấu hình `PAYMENT_INSTALLMENT_SCHEDULE` (mặc định `40-40-20`: Đợt 1 Cọc - Đợt 2 Xong QC trước giao - Đợt 3 Nghiệm thu).
3. **Bản vẽ kỹ thuật 2D/3D & Tem QR Kiện hàng (`menu.drawings`)**:
   - Upload file phối cảnh 3D, bản vẽ kỹ thuật 2D, ảnh tiến độ/QC/nghiệm thu lên Google Drive theo Mã đơn hàng (`NT-YYYYMMDD-001`).
   - Tạo & quét Tem QR từng kiện hàng (`PK-NT-...-01`) để đội bốc xếp kiểm kiện và mở ngay file bản vẽ 2D/3D trên điện thoại tại nhà khách.
4. **Cập nhật Tiến độ Xưởng (`menu.production`)**:
   - Tổ trưởng xưởng cập nhật từng hạng mục qua chuỗi 6 công đoạn cấu hình động (`PRODUCTION_STAGES_JSON`: Nhập vật tư → Cắt ván CNC → Dán cạnh & Khoan cam → Lắp ráp thô → Sơn PU → QC & Đóng gói).
   - Tự động tính `% hoàn thành` đơn hàng; khi mọi hạng mục đạt QC (`100%`), đơn chuyển sang `READY_TO_SHIP` và **tự động bật Đợt thanh toán 2 sang trạng thái `DUE` nhắc thu tiền**.
5. **Dự trù, Xuất Vật tư & Giá vốn Công trình (`menu.materials`)**:
   - Lập bảng dự trù & xuất thực tế ván MDF An Cường / bản lề / ray trượt trừ thẳng tồn kho `MATERIAL_CATALOG`, tự tính Giá vốn vật tư và **Biên lợi nhuận gộp (`gross_profit`, `gross_margin_pct`)** cho từng đơn hàng.
6. **Thu tiền Đợt 1-2-3, Lắp đặt, Nghiệm thu & Bảo hành (`menu.payments`, `menu.install_warranty`)**:
   - Kiểm soát cảnh báo/chặn xuất xưởng nếu Đợt 2 chưa thanh toán (`REQUIRE_STAGE2_PAY_BEFORE_SHIP = TRUE`).
   - Ký biên bản nghiệm thu bàn giao (`apiCompleteOrderAcceptance`), thu đợt cuối & tự động kích hoạt thời hạn bảo hành (`DEFAULT_WARRANTY_MONTHS`).
   - Mở và xử lý Phiếu bảo hành (`BH-YYYYMMDD-001`) gắn đơn hàng gốc.
7. **Báo cáo Lãi/Lỗ công trình & Sổ quỹ (`menu.reports_cash`)**:
   - Thống kê doanh thu ký mới, thực thu, chi phí vật tư/lắp đặt, lãi gộp từng công trình và doanh số theo KTS đối tác.
   - Ghi chi nhập ván gỗ (`MATERIAL_PURCHASE`) gắn `material_id` + `qty` tự động cộng thẳng tồn kho.

---

## 2. Cấu Trúc 12 Bảng Nghiệp Vụ & 10 Tham Số `CONFIG` Động

### 2.1. 12 Bảng Google Sheet Nghiệp vụ
| STT | Tên Sheet | Mô tả |
|---:|---|---|
| 1 | `CUSTOMERS` | Danh bạ chủ đầu tư, địa chỉ thi công, đối tác KTS, ghi chú thang hàng & công nợ |
| 2 | `CARPENTRY_SURVEYS` | Phiếu khảo sát đo đạc ngoài công trình & vướng mắc kỹ thuật |
| 3 | `MATERIAL_CATALOG` | Danh mục Ván gỗ / Phụ kiện (`VT0001`, tồn kho thực tế) & Mẫu hạng mục báo giá (`HM0001`) |
| 4 | `FURNITURE_ORDERS` | Đơn hàng sản xuất (`NT-YYYYMMDD-001`), ngày hẹn giao, cảnh báo trễ hạn, lãi gộp & bảo hành |
| 5 | `ORDER_ITEMS` | Hạng mục chi tiết (`MD`/`M2`/`UNIT`), tiến độ công đoạn từng hạng mục |
| 6 | `PRODUCTION_PROGRESS` | Nhật ký chuyển công đoạn sản xuất tại xưởng |
| 7 | `ORDER_PAYMENTS` | Lịch các đợt thanh toán (Đợt 1 Cọc - Đợt 2 Trước giao - Đợt 3 Nghiệm thu) |
| 8 | `ORDER_MATERIALS` | Bảng kê dự trù & xuất kho ván/phụ kiện theo đơn để tính giá vốn công trình |
| 9 | `ORDER_FILES_PHOTOS` | Bản vẽ 2D/3D & Ảnh đo đạc/QC/Nghiệm thu lưu Google Drive |
| 10 | `PACKAGE_QR` | Tem QR từng kiện hàng đóng gói (`PK-NT-...-01`) gắn bản vẽ lắp ráp |
| 11 | `WARRANTY_TICKETS` | Phiếu tiếp nhận & xử lý bảo hành sau bàn giao (`BH-YYYYMMDD-001`) |
| 12 | `CASH_TRANSACTIONS` | Sổ quỹ thu cọc/thanh toán, chi nhập vật tư (tự cộng kho) & chi vận chuyển lắp đặt |

### 2.2. 10 Tham số Cấu hình Động (`CONFIG`)
| Key | Giá trị mặc định | Ý nghĩa |
|---|---|---|
| `DEFAULT_PAGE_SIZE` | `10` | Số dòng phân trang mặc định |
| `UPCOMING_DELIVERY_DAYS` | `7` | Ngưỡng cảnh báo đơn sắp đến hạn bàn giao (ngày) |
| `URGENT_DELAY_ALERT_DAYS` | `3` | Ngưỡng cảnh báo đơn cần đẩy nhanh tiến độ (ngày) |
| `PAYMENT_INSTALLMENT_SCHEDULE` | `40-40-20` | Tỷ lệ chia đợt thanh toán mặc định (Đợt 1-2-3) |
| `DEFAULT_WARRANTY_MONTHS` | `24` | Thời hạn bảo hành mặc định cho gỗ & phụ kiện (tháng) |
| `REQUIRE_STAGE2_PAY_BEFORE_SHIP` | `TRUE` | Kiểm tra thu Đợt 2 trước khi cho xe xuất xưởng giao hàng |
| `PRODUCTION_STAGES_JSON` | *(6 công đoạn JSON)* | Chuỗi công đoạn sản xuất động (CNC → Dán cạnh → Lắp → Sơn → QC) |
| `LOW_STOCK_THRESHOLD_DEFAULT` | `5` | Ngưỡng cảnh báo ván & phụ kiện sắp hết tồn kho |
| `OPENING_CASH_BALANCE` | `0` | Tồn đầu kỳ Sổ quỹ Xưởng |
| `CARPENTRY_DRIVE_FOLDER_NAME` | `CARPENTRY_DRAWINGS_PHOTOS` | Thư mục gốc Google Drive lưu bản vẽ & ảnh công trình |

---

## 3. Phân Quyền 2 Tầng (33 Quyền & 9 Menu Động)

- **9 Menu Động (`menu.*`)**: `menu.surveys`, `menu.orders`, `menu.drawings`, `menu.production`, `menu.materials`, `menu.payments`, `menu.install_warranty`, `menu.customers`, `menu.reports_cash`.
- **24 Quyền Thao tác (`ACTION`)**:
  - Khách hàng & Khảo sát: `customer.view`, `customer.manage`, `survey.create`
  - Báo giá, Đơn hàng & Bản vẽ: `order.view`, `order.view_all`, `quotation.create`, `quotation.approve`, `order.approve`, `drawing.view`, `drawing.upload`, `photo.upload`
  - Xưởng & Vật tư: `production.stage_update`, `package.qr_print`, `material.estimate`, `material.issue`, `material.expense_create`
  - Thanh toán, Lắp đặt & Bảo hành: `payment.create`, `debt.view`, `delivery.update`, `acceptance.sign`, `warranty.manage`
  - Báo cáo & Quỹ: `cash.view`, `report.view`, `profit_report.view`

---

## 4. Kiểm Thử & Triển Khai

### Chạy kiểm thử tích hợp End-to-End (Node CLI — 2 VM + MockDriveApp)
```powershell
cd d:\Project\NewAppScript\14-project-carpentry
npm test
```

### Đẩy code & Deploy giữ link Web App (`/exec`) cố định
```powershell
cd d:\Project\NewAppScript\14-project-carpentry
npm run deploy
```
*(Điền `scriptId` Apps Script gắn với Google Sheet của bạn vào `.clasp.json` và `src/config/ProjectConfig.gs` trước lần `npm run deploy` đầu tiên.)*
