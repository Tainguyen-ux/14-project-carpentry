/**
 * ProjectConfig.gs
 * Cấu hình Định danh Dự án Quản lý Xưởng Mộc & Nội thất May đo (`CARPENTRY`)
 * Khai báo 12 Bảng Sheet Nghiệp vụ, 33 Quyền 2 Tầng, 9 Menu Động & 10 Tham số Cấu hình Động.
 */

var PROJECT_CONFIG = {
  APP_CODE: "CARPENTRY",
  APP_NAME: "Hệ Thống Quản Lý Xưởng Mộc & Nội Thất May Đo (MVP)",
  APP_VERSION: "1.0.0",
  ENVIRONMENT: "PROD",
  TIMEZONE: "Asia/Ho_Chi_Minh",
  SESSION_TTL_HOURS: 24,

  // Apps Script ID riêng của dự án (tự động nhận diện qua ScriptApp.getScriptId() khi chạy thực tế)
  SCRIPT_ID: "1cMC9yASVXDq8cFZkyh-4pXLYfp6HP8T1hluBqyTIe8lEMxDqKvqZIvFV",

  // 1. Khai báo 12 Bảng Nghiệp vụ Xưởng Mộc & Nội thất (Readily Production: Chỉ tạo hàng Header, 0 dữ liệu mẫu)
  BUSINESS_SHEETS: {
    CUSTOMERS: {
      NAME: "CUSTOMERS",
      HEADERS: [
        "id", "customer_code", "full_name", "phone", "site_address",
        "project_type", "lead_source", "partner_name", "site_notes",
        "total_orders", "total_contract_value", "total_paid", "debt_balance",
        "notes", "status", "created_at", "updated_at"
      ]
    },
    CARPENTRY_SURVEYS: {
      NAME: "CARPENTRY_SURVEYS",
      HEADERS: [
        "id", "survey_code", "customer_id", "customer_code", "customer_name", "customer_phone",
        "site_address", "survey_area", "measurements_summary", "site_constraints",
        "surveyed_by_id", "surveyed_by_name", "survey_date",
        "linked_order_id", "linked_order_code", "status", "notes", "created_at"
      ]
    },
    MATERIAL_CATALOG: {
      NAME: "MATERIAL_CATALOG",
      HEADERS: [
        "id", "material_code", "catalog_kind", "category", "item_name",
        "spec_material", "calc_mode", "unit", "default_cost_price", "default_sell_price",
        "stock_qty", "min_stock_qty", "notes", "status", "updated_at"
      ]
    },
    FURNITURE_ORDERS: {
      NAME: "FURNITURE_ORDERS",
      HEADERS: [
        "id", "order_code", "customer_id", "customer_code", "customer_name", "customer_phone",
        "site_address", "project_type", "partner_name", "title",
        "designer_id", "designer_name", "foreman_id", "foreman_name",
        "installer_id", "installer_name", "drawing_status", "payment_plan_code",
        "subtotal_amount", "discount_amount", "total_amount", "paid_amount", "debt_amount",
        "material_cost_total", "labor_extra_cost", "gross_profit", "gross_margin_pct",
        "signed_date", "due_date", "completed_at", "warranty_months", "warranty_until_date",
        "completion_pct", "current_stage_summary", "acceptance_signer", "acceptance_notes",
        "status", "notes", "created_at", "updated_at"
      ]
    },
    ORDER_ITEMS: {
      NAME: "ORDER_ITEMS",
      HEADERS: [
        "id", "order_id", "order_code", "item_no", "category", "item_name",
        "spec_material", "calc_mode", "length_m", "height_or_width_m", "quantity",
        "computed_qty", "unit", "unit_price", "line_total",
        "production_stage", "stage_order", "stage_label", "delivered_ok",
        "notes", "updated_at"
      ]
    },
    PRODUCTION_PROGRESS: {
      NAME: "PRODUCTION_PROGRESS",
      HEADERS: [
        "id", "progress_code", "order_id", "order_code", "order_item_id", "item_name",
        "from_stage", "to_stage", "stage_label", "completion_pct_after",
        "worker_id", "worker_name", "notes", "created_at"
      ]
    },
    ORDER_PAYMENTS: {
      NAME: "ORDER_PAYMENTS",
      HEADERS: [
        "id", "payment_code", "order_id", "order_code", "customer_id", "customer_name",
        "stage_no", "stage_name", "due_trigger", "percent_share",
        "due_amount", "paid_amount", "payment_channel", "expected_date", "paid_at",
        "status", "collected_by_name", "notes", "updated_at"
      ]
    },
    ORDER_MATERIALS: {
      NAME: "ORDER_MATERIALS",
      HEADERS: [
        "id", "issue_code", "order_id", "order_code", "material_id", "material_code",
        "material_name", "unit", "estimated_qty", "issued_qty", "unit_cost", "total_cost",
        "performed_by", "performed_by_name", "notes", "created_at"
      ]
    },
    ORDER_FILES_PHOTOS: {
      NAME: "ORDER_FILES_PHOTOS",
      HEADERS: [
        "id", "file_code", "order_id", "order_code", "survey_id", "customer_name",
        "file_category", "title_or_room", "file_name", "mime_type", "file_size",
        "drive_file_id", "drive_url", "uploaded_by", "uploaded_by_name", "notes", "created_at"
      ]
    },
    PACKAGE_QR: {
      NAME: "PACKAGE_QR",
      HEADERS: [
        "id", "qr_code", "order_id", "order_code", "order_item_id",
        "room_or_item", "package_index", "total_packages", "contents_desc",
        "status", "scanned_at", "scanned_by_name", "created_at"
      ]
    },
    WARRANTY_TICKETS: {
      NAME: "WARRANTY_TICKETS",
      HEADERS: [
        "id", "ticket_code", "order_id", "order_code", "customer_id", "customer_name",
        "customer_phone", "site_address", "issue_desc",
        "assigned_tech_id", "assigned_tech_name", "before_drive_url", "after_drive_url",
        "repair_notes", "cost_incurred", "status", "reported_at", "resolved_at", "created_at"
      ]
    },
    CASH_TRANSACTIONS: {
      NAME: "CASH_TRANSACTIONS",
      HEADERS: [
        "id", "tx_code", "tx_type", "category", "payment_channel", "amount",
        "order_id", "order_code", "customer_name", "description",
        "performed_by", "performed_by_name", "tx_date", "created_at"
      ]
    }
  },

  // 2. Phân quyền 2 Tầng (9 Menu + 24 Action = 33 Quyền)
  BUSINESS_PERMISSIONS: [
    // Tầng 1: Menu điều hướng
    { code: "menu.surveys", name: "Menu Khảo sát & Đo đạc công trình", module_group: "Thiết Kế & Khảo Sát", perm_type: "MENU", description: "Nhập kích thước đo đạc thực tế, vướng mắc công trình & chụp ảnh mặt bằng Drive" },
    { code: "menu.orders", name: "Menu Báo giá & Hợp đồng may đo", module_group: "Thiết Kế & Khảo Sát", perm_type: "MENU", description: "Bóc tách hạng mục theo md/m2/cái, cấu hình 3 đợt thanh toán & chốt đơn" },
    { code: "menu.drawings", name: "Menu Chi tiết Đơn, Bản vẽ & QR Kiện", module_group: "Thiết Kế & Khảo Sát", perm_type: "MENU", description: "Quản lý bản vẽ 2D/3D Drive, ảnh hiện trạng/QC & in/quét tem QR kiện hàng" },
    { code: "menu.production", name: "Menu Tiến độ Xưởng (CNC → Sơn → QC)", module_group: "Xưởng Sản Xuất & Kho", perm_type: "MENU", description: "Cập nhật công đoạn sản xuất từng hạng mục, tính % hoàn thành & cảnh báo trễ hạn" },
    { code: "menu.materials", name: "Menu Vật tư & Giá vốn Công trình", module_group: "Xưởng Sản Xuất & Kho", perm_type: "MENU", description: "Dự trù & xuất kho ván MDF/phụ kiện theo đơn để tính giá vốn và lợi nhuận" },
    { code: "menu.payments", name: "Menu Thanh toán Đợt 1-2-3 & Công nợ", module_group: "Tài Chính & Lắp Đặt", perm_type: "MENU", description: "Thu cọc Đợt 1, nhắc thu Đợt 2 trước khi xuất xưởng & thu Đợt 3 bàn giao" },
    { code: "menu.install_warranty", name: "Menu Lắp đặt, Nghiệm thu & Bảo hành", module_group: "Tài Chính & Lắp Đặt", perm_type: "MENU", description: "Giao hàng lắp đặt, ký nghiệm thu, kích hoạt bảo hành & xử lý sự cố" },
    { code: "menu.customers", name: "Menu Chủ đầu tư & Đối tác KTS", module_group: "Quản Trị Xưởng", perm_type: "MENU", description: "Hồ sơ chủ đầu tư, công trình, KTS đối tác & tiến độ thanh toán từng khách" },
    { code: "menu.reports_cash", name: "Menu Báo cáo Lãi/Lỗ & Sổ quỹ", module_group: "Quản Trị Xưởng", perm_type: "MENU", description: "Thống kê lợi nhuận từng đơn, danh mục ván/hạng mục & sổ quỹ thu chi xưởng" },

    // Tầng 2: Quyền Thao tác Chức năng
    { code: "customer.view", name: "Xem hồ sơ khách hàng & công trình", module_group: "Thiết Kế & Khảo Sát", perm_type: "ACTION", description: "Tìm kiếm chủ đầu tư, địa chỉ thi công và tình trạng công nợ" },
    { code: "customer.manage", name: "Thêm / Sửa hồ sơ khách hàng", module_group: "Thiết Kế & Khảo Sát", perm_type: "ACTION", description: "Tạo mới hoặc cập nhật thông tin chủ đầu tư và ghi chú thi công" },
    { code: "survey.create", name: "Lập phiếu khảo sát đo đạc", module_group: "Thiết Kế & Khảo Sát", perm_type: "ACTION", description: "Ghi nhận kích thước đo đạc công trình và hiện trạng mặt bằng" },
    { code: "order.view", name: "Xem đơn hàng sản xuất & hạng mục", module_group: "Xưởng Sản Xuất & Kho", perm_type: "ACTION", description: "Xem danh sách đơn hàng và chi tiết công đoạn sản xuất" },
    { code: "order.view_all", name: "Xem toàn bộ đơn hàng & giá trị HĐ", module_group: "Quản Trị Xưởng", perm_type: "ACTION", description: "Xem toàn bộ đơn hàng và báo giá/công nợ toàn xưởng" },
    { code: "quotation.create", name: "Lập báo giá & Tạo đơn hàng may đo", module_group: "Thiết Kế & Khảo Sát", perm_type: "ACTION", description: "Bóc tách hạng mục theo md/m2/cái và chia lịch thanh toán nhiều đợt" },
    { code: "quotation.approve", name: "Duyệt báo giá & Bản vẽ sản xuất", module_group: "Quản Trị Xưởng", perm_type: "ACTION", description: "Phê duyệt báo giá và chốt bản vẽ kỹ thuật trước khi đưa xuống xưởng" },
    { code: "order.approve", name: "Ra lệnh sản xuất / Hủy đơn & Sửa danh mục", module_group: "Quản Trị Xưởng", perm_type: "ACTION", description: "Chuyển lệnh sản xuất tại xưởng hoặc cấu hình danh mục vật tư mẫu" },
    { code: "drawing.view", name: "Xem bản vẽ 2D/3D & Thư viện ảnh", module_group: "Xưởng Sản Xuất & Kho", perm_type: "ACTION", description: "Mở file bản vẽ Drive ngay trên điện thoại tại xưởng và công trình" },
    { code: "drawing.upload", name: "Upload bản vẽ kỹ thuật 2D/3D Drive", module_group: "Thiết Kế & Khảo Sát", perm_type: "ACTION", description: "Tải lên file phối cảnh 3D và bản vẽ bóc tách 2D theo Mã đơn hàng" },
    { code: "photo.upload", name: "Chụp ảnh hiện trạng / QC / Bàn giao", module_group: "Xưởng Sản Xuất & Kho", perm_type: "ACTION", description: "Upload ảnh đo đạc, ảnh QC tại xưởng và ảnh nghiệm thu công trình lên Drive" },
    { code: "production.stage_update", name: "Cập nhật công đoạn sản xuất (CNC/Sơn/QC)", module_group: "Xưởng Sản Xuất & Kho", perm_type: "ACTION", description: "Chuyển công đoạn từng hạng mục tại xưởng và tính % tiến độ đơn hàng" },
    { code: "package.qr_print", name: "Tạo & In tem QR kiện hàng", module_group: "Xưởng Sản Xuất & Kho", perm_type: "ACTION", description: "Đánh mã QR từng kiện tủ để bốc xếp và đối chiếu bản vẽ tại nhà khách" },
    { code: "material.estimate", name: "Nhập bảng dự trù vật tư công trình", module_group: "Thiết Kế & Khảo Sát", perm_type: "ACTION", description: "Lập định mức ván MDF, chỉ cạnh, bản lề, ray trượt theo đơn hàng" },
    { code: "material.issue", name: "Xuất kho vật tư ván & phụ kiện theo đơn", module_group: "Xưởng Sản Xuất & Kho", perm_type: "ACTION", description: "Xuất thực tế ván/phụ kiện trừ tồn kho và tính thẳng vào giá vốn công trình" },
    { code: "material.expense_create", name: "Ghi chi mua vật tư / Lắp đặt & Nhập kho", module_group: "Tài Chính & Lắp Đặt", perm_type: "ACTION", description: "Ghi phiếu chi nhập ván gỗ (tự cộng kho) và chi phí vận chuyển lắp đặt" },
    { code: "payment.create", name: "Thu tiền đợt 1-2-3 & Công nợ HĐ", module_group: "Tài Chính & Lắp Đặt", perm_type: "ACTION", description: "Xác nhận thu tiền cọc, đợt giao hàng, đợt nghiệm thu và ghi sổ quỹ" },
    { code: "debt.view", name: "Theo dõi công nợ & Nhắc thu trước giao", module_group: "Tài Chính & Lắp Đặt", perm_type: "ACTION", description: "Xem lịch các đợt thanh toán đến hạn và kiểm soát xuất xưởng" },
    { code: "delivery.update", name: "Cập nhật vận chuyển & Quét QR lắp đặt", module_group: "Tài Chính & Lắp Đặt", perm_type: "ACTION", description: "Điều phối xe giao hàng đi công trình và quét kiểm đếm kiện hàng" },
    { code: "acceptance.sign", name: "Ký nghiệm thu bàn giao & Kích hoạt BH", module_group: "Tài Chính & Lắp Đặt", perm_type: "ACTION", description: "Chốt nghiệm thu hoàn thiện các hạng mục và tính ngày hết hạn bảo hành" },
    { code: "warranty.manage", name: "Quản lý phiếu bảo hành & Sửa chữa", module_group: "Tài Chính & Lắp Đặt", perm_type: "ACTION", description: "Tiếp nhận yêu cầu bảo hành xệ cánh/kẹt ray và phân công thợ xử lý" },
    { code: "cash.view", name: "Xem sổ quỹ tiền mặt & Chuyển khoản", module_group: "Quản Trị Xưởng", perm_type: "ACTION", description: "Tra cứu dòng tiền thu/chi của xưởng mộc" },
    { code: "report.view", name: "Xem báo cáo vận hành & Đúng hạn", module_group: "Quản Trị Xưởng", perm_type: "ACTION", description: "Xem báo cáo hiệu suất xưởng và doanh số đối tác KTS" },
    { code: "profit_report.view", name: "Xem báo cáo Lãi/Lỗ từng công trình", module_group: "Quản Trị Xưởng", perm_type: "ACTION", description: "Xem chi tiết giá vốn vật tư và biên lợi nhuận gộp theo từng đơn hàng" }
  ],

  // 3. Khai báo 9 Menu Điều hướng Động
  BUSINESS_MENUS: [
    { id: "MNU_CRP_SURVEYS", code: "surveys", name: "Khảo sát & Đo đạc", group_name: "1. Thiết Kế & Báo Giá", icon: "ruler", route_module: "surveys", permission_code: "menu.surveys", badge_text: "", sort_order: 110, status: "ACTIVE", description: "Ghi kích thước đo đạc công trình, vướng mắc kỹ thuật & ảnh mặt bằng Drive" },
    { id: "MNU_CRP_ORDERS", code: "orders", name: "Báo giá & Đơn hàng", group_name: "1. Thiết Kế & Báo Giá", icon: "file-text", route_module: "orders", permission_code: "menu.orders", badge_text: "", sort_order: 120, status: "ACTIVE", description: "Bóc tách md/m2/cái, cấu hình 3 đợt thanh toán & ra lệnh sản xuất" },
    { id: "MNU_CRP_DRAWINGS", code: "drawings", name: "Bản vẽ & Tem QR Kiện", group_name: "1. Thiết Kế & Báo Giá", icon: "layers", route_module: "drawings", permission_code: "menu.drawings", badge_text: "", sort_order: 130, status: "ACTIVE", description: "Lưu trữ bản vẽ 2D/3D, ảnh QC/nghiệm thu & in/quét QR từng kiện hàng" },
    { id: "MNU_CRP_PRODUCTION", code: "production", name: "Tiến độ Xưởng (CNC)", group_name: "2. Sản Xuất & Vật Tư", icon: "wrench", route_module: "production", permission_code: "menu.production", badge_text: "", sort_order: 140, status: "ACTIVE", description: "Cập nhật công đoạn từng hạng mục (Cắt CNC → Dán cạnh → Sơn PU → QC)" },
    { id: "MNU_CRP_MATERIALS", code: "materials", name: "Vật tư & Giá vốn đơn", group_name: "2. Sản Xuất & Vật Tư", icon: "package", route_module: "materials", permission_code: "menu.materials", badge_text: "", sort_order: 150, status: "ACTIVE", description: "Dự trù & xuất kho ván MDF/phụ kiện trừ tồn và tính lãi gộp từng công trình" },
    { id: "MNU_CRP_PAYMENTS", code: "payments", name: "Thu tiền Đợt & Công nợ", group_name: "3. Lắp Đặt & Tài Chính", icon: "credit-card", route_module: "payments", permission_code: "menu.payments", badge_text: "", sort_order: 160, status: "ACTIVE", description: "Thu Đợt 1 Cọc - Đợt 2 Trước giao - Đợt 3 Nghiệm thu & nhắc nợ" },
    { id: "MNU_CRP_INSTALL", code: "install-warranty", name: "Lắp đặt & Bảo hành", group_name: "3. Lắp Đặt & Tài Chính", icon: "truck", route_module: "install-warranty", permission_code: "menu.install_warranty", badge_text: "", sort_order: 170, status: "ACTIVE", description: "Vận chuyển, ký nghiệm thu bàn giao, kích hoạt bảo hành & xử lý sự cố" },
    { id: "MNU_CRP_CUSTOMERS", code: "customers", name: "Khách hàng & KTS", group_name: "4. Quản Trị Xưởng", icon: "users", route_module: "customers", permission_code: "menu.customers", badge_text: "", sort_order: 180, status: "ACTIVE", description: "Quản lý chủ đầu tư, công trình thi công & kiến trúc sư đối tác" },
    { id: "MNU_CRP_REPORTS", code: "reports-cash", name: "Lãi/Lỗ, Danh mục & Quỹ", group_name: "4. Quản Trị Xưởng", icon: "bar-chart", route_module: "reports-cash", permission_code: "menu.reports_cash", badge_text: "", sort_order: 190, status: "ACTIVE", description: "Báo cáo lãi/lỗ theo đơn, cấu hình danh mục vật tư mẫu & sổ quỹ xưởng" }
  ],

  // 4. Phân quyền mặc định theo Vai trò (Admin mặc định *)
  BUSINESS_ROLE_PERMISSIONS: {
    Manager: [
      "menu.surveys", "menu.orders", "menu.drawings", "menu.production",
      "menu.materials", "menu.payments", "menu.install_warranty", "menu.customers", "menu.reports_cash",
      "customer.view", "customer.manage", "survey.create",
      "order.view", "order.view_all", "quotation.create", "quotation.approve", "order.approve",
      "drawing.view", "drawing.upload", "photo.upload",
      "production.stage_update", "package.qr_print",
      "material.estimate", "material.issue", "material.expense_create",
      "payment.create", "debt.view", "delivery.update", "acceptance.sign", "warranty.manage",
      "cash.view", "report.view", "profit_report.view", "users.view"
    ],
    Staff: [
      "menu.surveys", "menu.orders", "menu.drawings", "menu.production",
      "menu.materials", "menu.payments", "menu.install_warranty", "menu.customers",
      "customer.view", "customer.manage", "survey.create",
      "order.view", "quotation.create", "drawing.view", "drawing.upload", "photo.upload",
      "production.stage_update", "package.qr_print",
      "material.estimate", "material.issue",
      "payment.create", "debt.view", "delivery.update", "acceptance.sign", "warranty.manage"
    ]
  },

  // 5. 10 Tham số Cấu hình Động (Không hard-code công đoạn, đợt thanh toán hay định mức)
  BUSINESS_CONFIGS: [
    { key: "DEFAULT_PAGE_SIZE", value: "10", group_name: "business", label: "Số dòng mặc định mỗi trang", data_type: "SELECT", options_json: '["10","25","50","100"]', is_public: "TRUE", description: "Phân trang chuẩn trên toàn hệ thống" },
    { key: "UPCOMING_DELIVERY_DAYS", value: "7", group_name: "business", label: "Ngưỡng cảnh báo sắp đến hạn giao (ngày)", data_type: "NUMBER", options_json: "", is_public: "TRUE", description: "Đơn còn <= số ngày này sẽ hiển thị danh sách sắp bàn giao trên Dashboard" },
    { key: "URGENT_DELAY_ALERT_DAYS", value: "3", group_name: "business", label: "Ngưỡng khẩn đẩy nhanh tiến độ (ngày)", data_type: "NUMBER", options_json: "", is_public: "TRUE", description: "Đơn chưa xong tại xưởng và còn <= số ngày này bị đánh dấu cảnh báo gấp" },
    { key: "PAYMENT_INSTALLMENT_SCHEDULE", value: "40-40-20", group_name: "business", label: "Tỷ lệ chia đợt thanh toán mặc định (%)", data_type: "STRING", options_json: "", is_public: "TRUE", description: "Định dạng Đợt 1-Đợt 2-Đợt 3 (VD: 40-40-20 hoặc 50-30-20)" },
    { key: "DEFAULT_WARRANTY_MONTHS", value: "24", group_name: "business", label: "Thời hạn bảo hành gỗ & phụ kiện (tháng)", data_type: "NUMBER", options_json: "", is_public: "TRUE", description: "Số tháng bảo hành tự kích hoạt sau khi ký nghiệm thu lắp đặt xong" },
    { key: "REQUIRE_STAGE2_PAY_BEFORE_SHIP", value: "TRUE", group_name: "business", label: "Cảnh báo thu Đợt 2 trước khi xuất xưởng", data_type: "SELECT", options_json: '["TRUE","FALSE"]', is_public: "TRUE", description: "Kiểm tra thanh toán Đợt 2 khi chuyển hàng đi lắp đặt tại công trình" },
    { key: "PRODUCTION_STAGES_JSON", value: '[{"code":"MATERIALS_READY","order":1,"name":"1️⃣ Nhập vật tư ván & PK"},{"code":"CNC_CUTTING","order":2,"name":"2️⃣ Cắt ván CNC"},{"code":"EDGE_BANDING","order":3,"name":"3️⃣ Dán cạnh & Khoan cam"},{"code":"ASSEMBLY","order":4,"name":"4️⃣ Lắp ráp thô"},{"code":"PU_PAINTING","order":5,"name":"5️⃣ Sơn PU / Hoàn thiện"},{"code":"QC_PACKED","order":6,"name":"6️⃣ QC & Đóng gói"}]', group_name: "business", label: "Cấu hình chuỗi công đoạn xưởng (JSON)", data_type: "TEXTAREA", options_json: "", is_public: "TRUE", description: "Danh sách công đoạn sản xuất động của xưởng (thứ tự 1..N)" },
    { key: "LOW_STOCK_THRESHOLD_DEFAULT", value: "5", group_name: "business", label: "Ngưỡng cảnh báo ván & phụ kiện sắp hết", data_type: "NUMBER", options_json: "", is_public: "TRUE", description: "Áp dụng nếu vật tư chưa cài mức tồn tối thiểu riêng" },
    { key: "OPENING_CASH_BALANCE", value: "0", group_name: "business", label: "Tồn đầu kỳ Sổ quỹ Xưởng (VNĐ)", data_type: "NUMBER", options_json: "", is_public: "FALSE", description: "Số dư đầu kỳ quỹ tiền mặt & chuyển khoản của xưởng" },
    { key: "CARPENTRY_DRIVE_FOLDER_NAME", value: "CARPENTRY_DRAWINGS_PHOTOS", group_name: "business", label: "Thư mục Google Drive lưu bản vẽ & ảnh", data_type: "STRING", options_json: "", is_public: "FALSE", description: "Thư mục gốc Drive lưu ảnh khảo sát, bản vẽ 2D/3D & ảnh nghiệm thu theo Mã đơn" }
  ]
};

var CARPENTRY_CONSTANTS = {
  PROJECT_TYPES: [
    { code: "APARTMENT", name: "🏢 Căn hộ Chung cư" },
    { code: "TOWNHOUSE", name: "🏠 Nhà phố" },
    { code: "VILLA", name: "🏡 Biệt thự / Villa" },
    { code: "OFFICE", name: "💼 Văn phòng / Co-working" },
    { code: "SHOWROOM", name: "🏪 Showroom / Cửa hàng" }
  ],
  LEAD_SOURCES: [
    { code: "DIRECT_REFERRAL", name: "Khách giới thiệu" },
    { code: "ARCHITECT_PARTNER", name: "KTS / Nhà thầu đối tác" },
    { code: "FACEBOOK_TIKTOK", name: "Facebook / TikTok" },
    { code: "SHOWROOM", name: "Showroom / Vãng lai" }
  ],
  ITEM_CATEGORIES: [
    { code: "KITCHEN", name: "🍳 Tủ bếp & Thiết bị bếp" },
    { code: "BEDROOM", name: "🛏️ Nội thất Phòng ngủ (Tủ áo, Giường)" },
    { code: "LIVING", name: "🛋️ Phòng khách (Kệ Tivi, Vách ốp, Tủ giày)" },
    { code: "OFFICE", name: "🏢 Nội thất Văn phòng / Cửa hàng" },
    { code: "HARDWARE", name: "🔩 Phụ kiện thông minh (Bản lề, Ray, Tay nâng)" },
    { code: "BOARD_WOOD", name: "🪵 Ván MDF / Gỗ tự nhiên / Chỉ cạnh" }
  ],
  CALC_MODES: [
    { code: "MD", name: "Mét dài (md) — Tủ bếp / Phào chỉ" },
    { code: "M2", name: "Mét vuông (m2) — Tủ áo / Vách ốp" },
    { code: "UNIT", name: "Cái / Bộ / Chiếc — Giường / Bàn / Phụ kiện" }
  ],
  ORDER_STATUSES: [
    { code: "SURVEYING", name: "Khảo sát đo đạc", emoji: "📐", color: "#0284c7", bg: "#e0f2fe" },
    { code: "QUOTED", name: "Đã gửi báo giá", emoji: "📋", color: "#d97706", bg: "#fffbeb" },
    { code: "DEPOSITED", name: "Chốt cọc / Chờ bản vẽ", emoji: "🔵", color: "#2563eb", bg: "#eff6ff" },
    { code: "IN_PRODUCTION", name: "Đang sản xuất tại xưởng", emoji: "🟣", color: "#7c3aed", bg: "#f5f3ff" },
    { code: "READY_TO_SHIP", name: "Xong tại xưởng - Chờ giao", emoji: "🟠", color: "#ea580c", bg: "#ffedd5" },
    { code: "INSTALLING", name: "Đang vận chuyển & lắp đặt", emoji: "🚚", color: "#0d9488", bg: "#f0fdfa" },
    { code: "COMPLETED", name: "Hoàn tất bàn giao", emoji: "🟢", color: "#059669", bg: "#ecfdf5" },
    { code: "WARRANTY", name: "Đang bảo hành", emoji: "🛠️", color: "#be123c", bg: "#fff1f2" },
    { code: "CANCELLED", name: "Đã hủy", emoji: "⚫", color: "#64748b", bg: "#f8fafc" }
  ],
  FILE_CATEGORIES: [
    { code: "SURVEY_PHOTO", name: "📷 Ảnh hiện trạng đo đạc" },
    { code: "DRAWING_3D", name: "📐 Bản vẽ 3D phối cảnh duyệt" },
    { code: "DRAWING_2D", name: "📐 Bản vẽ kỹ thuật bóc tách 2D" },
    { code: "PRODUCTION_PROGRESS", name: "🏭 Ảnh tiến độ tại xưởng" },
    { code: "QC_WORKSHOP", name: "✅ Ảnh QC nghiệm thu tại xưởng" },
    { code: "HANDOVER_DONE", name: "🏠 Ảnh lắp đặt bàn giao hoàn thiện" },
    { code: "WARRANTY_PROOF", name: "🛠️ Ảnh trước/sau bảo hành" }
  ],
  PAYMENT_CHANNELS: [
    { code: "BANK_TRANSFER", name: "Chuyển khoản ngân hàng" },
    { code: "BANK_QR", name: "Chuyển khoản QR" },
    { code: "CASH", name: "Tiền mặt" }
  ]
};

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

function toRpcJson_(result) {
  return JSON.parse(JSON.stringify(result));
}
