/**
 * CarpentryDemoSeedService.gs
 * Bộ nạp Danh mục & Dữ liệu Mẫu Chuẩn Xưởng Mộc (On-Demand — KHÔNG tự chạy trong doGet()).
 * Chỉ nạp khi Quản trị viên chủ động gọi `seedCarpentryDemoData()` hoặc `apiSeedCarpentryDemoData(token, { reset: true })`.
 * Đảm bảo Readily Production: khởi tạo mặc định luôn sạch 0 dòng rác; khi cần demo/chụp hình thì nạp đủ toàn bộ 12 bảng + 4 vai trò nhân sự.
 */

function clearBusinessSheetsForDemo_(app) {
  var sheetDefs = PROJECT_CONFIG.BUSINESS_SHEETS;
  var keys = Object.keys(sheetDefs);
  var ss = null;
  try {
    if (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp && SpreadsheetApp.getActiveSpreadsheet) {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }
  } catch (e) {}
  if (!ss) return;

  for (var i = 0; i < keys.length; i++) {
    var shName = sheetDefs[keys[i]].NAME;
    var sh = ss.getSheetByName(shName);
    if (sh && sh.getLastRow() > 1) {
      var lastRow = sh.getLastRow();
      var lastCol = sh.getLastColumn();
      if (lastCol > 0) {
        sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
      }
    }
  }
}

function seedCarpentryDemoRolesAndStaff_(app, actor) {
  var createdUsers = [];
  var roleResp = app.Role.list({}, 1, 100);
  var existingRoles = (roleResp && roleResp.success && roleResp.data && roleResp.data.items) ? roleResp.data.items : [];
  var roleByCode = {};
  for (var r = 0; r < existingRoles.length; r++) {
    roleByCode[String(existingRoles[r].code || "").toUpperCase()] = existingRoles[r];
  }

  var permResp = app.Permission.getForRole("ROLE_STAFF");
  var permCodeToId = {};
  if (permResp && permResp.success && permResp.data && Array.isArray(permResp.data.module_groups)) {
    permResp.data.module_groups.forEach(function(grp) {
      (grp.permissions || []).forEach(function(p) {
        permCodeToId[p.code] = p.id;
      });
    });
  }

  var roleSpecs = [
    {
      code: "TECH_DESIGN",
      name: "Kỹ thuật viên & Thiết kế",
      description: "Đo đạc công trình, lập báo giá, thiết kế bản vẽ 2D/3D & dự trù vật tư",
      perms: [
        "menu.dashboard", "menu.surveys", "menu.orders", "menu.drawings", "menu.materials", "menu.customers",
        "customer.view", "customer.manage", "survey.create", "order.view", "quotation.create",
        "drawing.view", "drawing.upload", "photo.upload", "material.estimate"
      ]
    },
    {
      code: "FOREMAN",
      name: "Tổ trưởng Xưởng & Thợ SX",
      description: "Điều phối CNC, dán cạnh, sơn PU, QC đóng gói, in tem QR & xuất kho vật tư",
      perms: [
        "menu.dashboard", "menu.production", "menu.drawings", "menu.materials",
        "order.view", "drawing.view", "production.stage_update", "photo.upload", "package.qr_print", "material.issue"
      ]
    },
    {
      code: "INSTALLER",
      name: "Đội trưởng Lắp đặt & Bảo hành",
      description: "Vận chuyển lắp đặt, quét tem QR xem bản vẽ, ký nghiệm thu & bảo hành",
      perms: [
        "menu.dashboard", "menu.install_warranty", "menu.drawings",
        "order.view", "drawing.view", "delivery.update", "acceptance.sign", "photo.upload", "warranty.manage"
      ]
    },
    {
      code: "ACCOUNTANT",
      name: "Kế toán & Thu ngân Xưởng",
      description: "Thu tiền đợt 1-2-3, quản lý công nợ, nhập kho vật tư, sổ quỹ & báo cáo lãi lỗ",
      perms: [
        "menu.dashboard", "menu.payments", "menu.reports_cash", "menu.orders", "menu.customers",
        "customer.view", "order.view", "order.view_all", "payment.create", "debt.view",
        "material.expense_create", "cash.view", "report.view", "profit_report.view"
      ]
    }
  ];

  for (var i = 0; i < roleSpecs.length; i++) {
    var spec = roleSpecs[i];
    var roleObj = roleByCode[spec.code];
    if (!roleObj) {
      var cr = app.Role.create({ code: spec.code, name: spec.name, description: spec.description });
      if (cr && cr.success && cr.data) {
        roleObj = cr.data;
        roleByCode[spec.code] = roleObj;
      }
    }
    if (roleObj && roleObj.id) {
      var pids = spec.perms.map(function(c) { return permCodeToId[c]; }).filter(Boolean);
      if (pids.length > 0) {
        app.Permission.saveForRole(roleObj.id, pids);
      }
    }
  }

  var existingUsers = app.Data.getAll("USERS");
  var userByUsername = {};
  for (var u = 0; u < existingUsers.length; u++) {
    if (existingUsers[u] && existingUsers[u].username) {
      userByUsername[String(existingUsers[u].username).toLowerCase()] = existingUsers[u];
    }
  }

  var staffSpecs = [
    { username: "thietke01", full_name: "Lê Minh Sơn", phone: "0908112233", email: "son.thietke@xuongmoc.vn", roleCode: "TECH_DESIGN" },
    { username: "toxuong01", full_name: "Nguyễn Văn Hùng", phone: "0908445566", email: "hung.xuong@xuongmoc.vn", roleCode: "FOREMAN" },
    { username: "lapdat01", full_name: "Phạm Trung Hiếu", phone: "0908778899", email: "hieu.lapdat@xuongmoc.vn", roleCode: "INSTALLER" },
    { username: "ketoan01", full_name: "Trần Mai Anh", phone: "0908990011", email: "anh.ketoan@xuongmoc.vn", roleCode: "ACCOUNTANT" }
  ];

  var staffMap = {};
  for (var s = 0; s < staffSpecs.length; s++) {
    var st = staffSpecs[s];
    var existU = userByUsername[st.username];
    if (existU) {
      staffMap[st.roleCode] = existU;
      continue;
    }
    var targetRole = roleByCode[st.roleCode];
    if (!targetRole) continue;
    var cu = app.User.create({
      username: st.username,
      password: "Crp@2026",
      full_name: st.full_name,
      phone: st.phone,
      email: st.email,
      role_ids: [targetRole.id],
      status: "ACTIVE"
    });
    if (cu && cu.success && cu.data) {
      staffMap[st.roleCode] = cu.data;
      createdUsers.push(st.username);
    }
  }

  return { staffMap: staffMap, createdUsers: createdUsers };
}

function seedCarpentryDemoDataCore_(app, actor, options) {
  options = options || {};
  var shouldReset = options.reset !== false;
  if (!app.isInitialized()) {
    app.ensureInitialized(false);
  }
  if (shouldReset) {
    clearBusinessSheetsForDemo_(app);
  }

  var policy = getCarpentryPolicyConfig_(app);
  var todayYmd = getCarpentryTodayYmd_(app);
  var nowStr = getCarpentryNowStr_(app);
  var stages = policy.productionStages;

  var staffInit = seedCarpentryDemoRolesAndStaff_(app, actor);
  var designer = staffInit.staffMap.TECH_DESIGN || actor;
  var foreman = staffInit.staffMap.FOREMAN || actor;
  var installer = staffInit.staffMap.INSTALLER || actor;
  var accountant = staffInit.staffMap.ACCOUNTANT || actor;

  // Cập nhật tồn đầu kỳ sổ quỹ để số dư quỹ đẹp mắt (150.000.000đ)
  try {
    app.Config.saveBatch({ OPENING_CASH_BALANCE: "150000000" });
  } catch (eCfg) {}

  var S = PROJECT_CONFIG.BUSINESS_SHEETS;
  var monthStartYmd = todayYmd.substring(0, 8) + "01";
  var sameMonthYmd = function(daysOffset) {
    var d = addCarpentryDaysYmd_(todayYmd, daysOffset);
    return d < monthStartYmd ? monthStartYmd : d;
  };
  var dtStr = function(daysOffset, timePart) {
    return sameMonthYmd(daysOffset) + " " + (timePart || "09:30:00");
  };

  // =========================================================================
  // 1. DANH MỤC VÁN GỖ, PHỤ KIỆN & MẪU HẠNG MỤC BÁO GIÁ (14 MÃ)
  // =========================================================================
  var catalogRows = [
    { id: "MAT_DEMO_01", material_code: "VT0001", catalog_kind: "RAW_MATERIAL", category: "BOARD_WOOD", item_name: "Ván MDF lõi xanh chống ẩm 17mm An Cường (388 EV)", spec_material: "MDF lõi xanh HMR 1220x2440 phủ Melamine vân sồi", calc_mode: "UNIT", unit: "Tấm", default_cost_price: 520000, default_sell_price: 680000, stock_qty: 48, min_stock_qty: 10, notes: "Mã vân sồi bán chạy nhất xưởng", status: "ACTIVE", updated_at: nowStr },
    { id: "MAT_DEMO_02", material_code: "VT0002", catalog_kind: "RAW_MATERIAL", category: "BOARD_WOOD", item_name: "Ván MDF chống ẩm phủ Acrylic Noline bóng gương (PARC 01)", spec_material: "Cánh Acrylic không đường line 18mm màu trắng sứ", calc_mode: "UNIT", unit: "Tấm", default_cost_price: 1280000, default_sell_price: 1650000, stock_qty: 18, min_stock_qty: 6, notes: "Chuyên dùng cho cánh tủ bếp trên cao cấp", status: "ACTIVE", updated_at: nowStr },
    { id: "MAT_DEMO_03", material_code: "VT0003", catalog_kind: "RAW_MATERIAL", category: "BOARD_WOOD", item_name: "Gỗ Sồi Mỹ (White Oak) nhập khẩu xẻ sấy 25mm", spec_material: "Gỗ tự nhiên sấy ẩm 10-12%, tiêu chuẩn FAS", calc_mode: "UNIT", unit: "m3", default_cost_price: 18500000, default_sell_price: 23000000, stock_qty: 4, min_stock_qty: 5, notes: "Cần nhập thêm tuần này cho đơn biệt thự", status: "ACTIVE", updated_at: nowStr },
    { id: "MAT_DEMO_04", material_code: "VT0004", catalog_kind: "RAW_MATERIAL", category: "BOARD_WOOD", item_name: "Ván nhựa Picomat chống nước tuyệt đối 17mm", spec_material: "Tấm PVC Foam 1220x2440 khoang chậu rửa bếp", calc_mode: "UNIT", unit: "Tấm", default_cost_price: 860000, default_sell_price: 1150000, stock_qty: 16, min_stock_qty: 5, notes: "Bắt buộc cho khoang chậu rửa tủ bếp dưới", status: "ACTIVE", updated_at: nowStr },
    { id: "MAT_DEMO_05", material_code: "VT0005", catalog_kind: "RAW_MATERIAL", category: "HARDWARE", item_name: "Bản lề giảm chấn Inox 304 Hafele (Thẳng / Cong)", spec_material: "Inox 304 chống gỉ, đóng êm 80.000 chu kỳ", calc_mode: "UNIT", unit: "Cái", default_cost_price: 48000, default_sell_price: 75000, stock_qty: 165, min_stock_qty: 30, notes: "Dùng tiêu chuẩn cho mọi hệ tủ", status: "ACTIVE", updated_at: nowStr },
    { id: "MAT_DEMO_06", material_code: "VT0006", catalog_kind: "RAW_MATERIAL", category: "HARDWARE", item_name: "Ray trượt bi 3 tầng giảm chấn Eurogold 450mm", spec_material: "Thép sơn tĩnh điện tải trọng 45kg", calc_mode: "UNIT", unit: "Bộ", default_cost_price: 135000, default_sell_price: 210000, stock_qty: 6, min_stock_qty: 10, notes: "Tồn thấp — cần đặt bổ sung 50 bộ", status: "ACTIVE", updated_at: nowStr },
    { id: "MAT_DEMO_07", material_code: "VT0007", catalog_kind: "RAW_MATERIAL", category: "HARDWARE", item_name: "Tay nâng cánh tủ bếp đôi Blum Aventos HF", spec_material: "Nhập khẩu Áo, chịu tải cánh đôi 700-900mm", calc_mode: "UNIT", unit: "Bộ", default_cost_price: 2350000, default_sell_price: 3200000, stock_qty: 9, min_stock_qty: 3, notes: "Dùng cho khoang giá bát nâng hạ", status: "ACTIVE", updated_at: nowStr },
    { id: "MAT_DEMO_08", material_code: "VT0008", catalog_kind: "RAW_MATERIAL", category: "BOARD_WOOD", item_name: "Chỉ dán cạnh PVC 1mm đồng màu An Cường (100m/cuộn)", spec_material: "PVC bản 21mm keo nhiệt Đức", calc_mode: "UNIT", unit: "Cuộn", default_cost_price: 240000, default_sell_price: 320000, stock_qty: 22, min_stock_qty: 5, notes: "Đủ màu 388 EV, 421 RL, Trắng 101 SH", status: "ACTIVE", updated_at: nowStr },

    { id: "CAT_DEMO_01", material_code: "HM0001", catalog_kind: "ITEM_TEMPLATE", category: "KITCHEN", item_name: "Tủ bếp dưới MDF chống ẩm phủ Melamine An Cường", spec_material: "Thùng MDF HMR 17mm, khoang chậu nhựa Picomat", calc_mode: "MD", unit: "md", default_cost_price: 1850000, default_sell_price: 3600000, stock_qty: 0, min_stock_qty: 0, notes: "Đơn giá tính theo mét dài chuẩn S600xC810", status: "ACTIVE", updated_at: nowStr },
    { id: "CAT_DEMO_02", material_code: "HM0002", catalog_kind: "ITEM_TEMPLATE", category: "KITCHEN", item_name: "Tủ bếp trên cánh Acrylic Noline bóng gương", spec_material: "Thùng Melamine chống ẩm, cánh Acrylic PARC", calc_mode: "MD", unit: "md", default_cost_price: 2250000, default_sell_price: 4400000, stock_qty: 0, min_stock_qty: 0, notes: "Chiều cao tiêu chuẩn 750-800mm", status: "ACTIVE", updated_at: nowStr },
    { id: "CAT_DEMO_03", material_code: "HM0003", catalog_kind: "ITEM_TEMPLATE", category: "BEDROOM", item_name: "Tủ quần áo kịch trần MDF chống ẩm Melamine", spec_material: "MDF An Cường 17mm, bản lề Hafele, đèn LED thanh", calc_mode: "M2", unit: "m2", default_cost_price: 1450000, default_sell_price: 2850000, stock_qty: 0, min_stock_qty: 0, notes: "Tính theo m2 mặt đứng Dài x Cao", status: "ACTIVE", updated_at: nowStr },
    { id: "CAT_DEMO_04", material_code: "HM0004", catalog_kind: "ITEM_TEMPLATE", category: "LIVING", item_name: "Vách ốp lam sóng kết hợp PVC vân đá sau Tivi", spec_material: "Lam sóng cốt xanh + tấm PVC nano nẹp inox vàng", calc_mode: "M2", unit: "m2", default_cost_price: 720000, default_sell_price: 1450000, stock_qty: 0, min_stock_qty: 0, notes: "Thi công hoàn thiện kèm LED hắt khe", status: "ACTIVE", updated_at: nowStr },
    { id: "CAT_DEMO_05", material_code: "HM0005", catalog_kind: "ITEM_TEMPLATE", category: "BEDROOM", item_name: "Giường ngủ bọc nỉ cao cấp 1m8 x 2m0 có 2 hộc kéo", spec_material: "Khung MDF HMR 17mm bọc nỉ nhập Bỉ, thang sắt hộp", calc_mode: "UNIT", unit: "Cái", default_cost_price: 4800000, default_sell_price: 9500000, stock_qty: 0, min_stock_qty: 0, notes: "Bao gồm dát phản chống ẩm", status: "ACTIVE", updated_at: nowStr },
    { id: "CAT_DEMO_06", material_code: "HM0006", catalog_kind: "ITEM_TEMPLATE", category: "LIVING", item_name: "Bàn ăn gỗ Sồi Mỹ nguyên khối 6 ghế sơn PU mờ", spec_material: "Gỗ Sồi Mỹ FAS dày 40mm, sơn PU Inchem 5 lớp", calc_mode: "UNIT", unit: "Bộ", default_cost_price: 9200000, default_sell_price: 16800000, stock_qty: 0, min_stock_qty: 0, notes: "Kích thước 1m8 x 0m9, đệm ghế da Microfiber", status: "ACTIVE", updated_at: nowStr }
  ];
  app.Data.insertBatch(S.MATERIAL_CATALOG.NAME, catalogRows);

  // =========================================================================
  // 2. CHỦ ĐẦU TƯ, CÔNG TRÌNH & ĐỐI TÁC KTS (8 HỒ SƠ)
  // =========================================================================
  var customers = [
    { id: "CUST_DEMO_01", customer_code: "KH-00001", full_name: "Anh Trần Quốc Bảo", phone: "'0909888777", site_address: "Căn hộ B12-08, Chung cư Cara River Park, Q.2", project_type: "APARTMENT", lead_source: "ARCHITECT_PARTNER", partner_name: "KTS Minh Khoa", site_notes: "Thi công giờ hành chính, đăng ký thang hàng BQL trước 1 ngày", total_orders: 1, total_contract_value: 54820000, total_paid: 54820000, debt_balance: 0, notes: "Khách kỹ tính về đường chỉ cạnh Acrylic", status: "ACTIVE", created_at: dtStr(-18, "09:00:00"), updated_at: nowStr },
    { id: "CUST_DEMO_02", customer_code: "KH-00002", full_name: "Chị Nguyễn Ngọc Hân", phone: "'0918223344", site_address: "Biệt thự số 14, Thảo Điền Pearl, TP. Thủ Đức", project_type: "VILLA", lead_source: "ARCHITECT_PARTNER", partner_name: "KTS Hoàng Nam", site_notes: "Xe tải 2.5 tấn vào tận sân, cần bạt lót sàn gỗ tự nhiên", total_orders: 1, total_contract_value: 142500000, total_paid: 114000000, debt_balance: 28500000, notes: "Yêu cầu phụ kiện Blum + Hafele chính hãng", status: "ACTIVE", created_at: dtStr(-14, "10:15:00"), updated_at: nowStr },
    { id: "CUST_DEMO_03", customer_code: "KH-00003", full_name: "Anh Lê Hoàng Phúc", phone: "'0937556611", site_address: "48 Nguyễn Thị Minh Khai, P. Đa Kao, Q.1", project_type: "TOWNHOUSE", lead_source: "DIRECT_REFERRAL", partner_name: "Khách trực tiếp", site_notes: "Hẻm xe ba gác vào cửa, giao hàng sau 9h sáng tránh giờ cao điểm", total_orders: 1, total_contract_value: 68400000, total_paid: 27360000, debt_balance: 41040000, notes: "Khách anh Bảo giới thiệu", status: "ACTIVE", created_at: dtStr(-11, "14:20:00"), updated_at: nowStr },
    { id: "CUST_DEMO_04", customer_code: "KH-00004", full_name: "Công ty TNHH Kiến Trúc Mộc An", phone: "'0903456789", site_address: "Tầng 8, Tòa nhà Pearl Plaza, Bình Thạnh", project_type: "OFFICE", lead_source: "ARCHITECT_PARTNER", partner_name: "KTS Minh Khoa", site_notes: "Vận chuyển hàng vào thang hàng sau 18h tối, xuất hóa đơn VAT", total_orders: 1, total_contract_value: 86000000, total_paid: 34400000, debt_balance: 51600000, notes: "Đối tác văn phòng — cần đúng tiến độ khai trương", status: "ACTIVE", created_at: dtStr(-9, "08:45:00"), updated_at: nowStr },
    { id: "CUST_DEMO_05", customer_code: "KH-00005", full_name: "Chị Phạm Thu Thảo", phone: "'0978123456", site_address: "Căn hộ S2.05-1904, Vinhomes Grand Park, Thủ Đức", project_type: "APARTMENT", lead_source: "FACEBOOK_TIKTOK", partner_name: "Khách trực tiếp", site_notes: "Đăng ký thẻ nhà thầu tại sảnh S2, không khoan đục 12h-13h30", total_orders: 1, total_contract_value: 74200000, total_paid: 29680000, debt_balance: 44520000, notes: "Tông màu gỗ Sồi sáng phối trắng kem", status: "ACTIVE", created_at: dtStr(-8, "15:10:00"), updated_at: nowStr },
    { id: "CUST_DEMO_06", customer_code: "KH-00006", full_name: "Showroom Mỹ Phẩm Lumiere", phone: "'0902667788", site_address: "215 Lê Văn Sỹ, P.13, Q.3", project_type: "SHOWROOM", lead_source: "ARCHITECT_PARTNER", partner_name: "KTS Hoàng Nam", site_notes: "Mặt tiền rộng, lắp đặt ban đêm từ 21h để kịp khai trương", total_orders: 1, total_contract_value: 92000000, total_paid: 36800000, debt_balance: 55200000, notes: "Toàn bộ tủ kệ gắn đèn LED thanh nhôm cảm biến", status: "ACTIVE", created_at: dtStr(-5, "11:00:00"), updated_at: nowStr },
    { id: "CUST_DEMO_07", customer_code: "KH-00007", full_name: "Anh Đặng Minh Tuấn", phone: "'0945332211", site_address: "112 Phan Xích Long, P.2, Phú Nhuận", project_type: "TOWNHOUSE", lead_source: "ARCHITECT_PARTNER", partner_name: "KTS Thanh Trúc", site_notes: "Cầu thang bộ rộng 1.1m, lưu ý chia modul tủ cao dưới 2.2m", total_orders: 1, total_contract_value: 43600000, total_paid: 0, debt_balance: 43600000, notes: "Đang chờ khách duyệt báo giá đợt cuối", status: "ACTIVE", created_at: dtStr(-2, "16:00:00"), updated_at: nowStr },
    { id: "CUST_DEMO_08", customer_code: "KH-00008", full_name: "Chị Võ Thị Mỹ Linh", phone: "'0919887766", site_address: "Khu Biệt thự Saroma Villa, KĐT Sala, Thủ Đức", project_type: "VILLA", lead_source: "SHOWROOM", partner_name: "KTS Thanh Trúc", site_notes: "Đang hoàn thiện phần thô sơn nước, đo đạc trước hệ tủ bếp & phòng thờ", total_orders: 0, total_contract_value: 0, total_paid: 0, debt_balance: 0, notes: "Khách tiềm năng gói nội thất gỗ Sồi Mỹ nguyên căn", status: "ACTIVE", created_at: dtStr(-1, "10:30:00"), updated_at: nowStr }
  ];
  app.Data.insertBatch(S.CUSTOMERS.NAME, customers);

  // =========================================================================
  // 3. PHIẾU KHẢO SÁT & ĐO ĐẠC CÔNG TRÌNH (6 PHIẾU: 4 CONVERTED + 2 DRAFT)
  // =========================================================================
  var dCompact = function(daysOffset) { return addCarpentryDaysYmd_(todayYmd, daysOffset).replace(/-/g, ""); };
  var surveys = [
    { id: "SRV_DEMO_01", survey_code: "KS-" + dCompact(-17) + "-001", customer_id: "CUST_DEMO_01", customer_code: "KH-00001", customer_name: "Anh Trần Quốc Bảo", customer_phone: "'0909888777", site_address: customers[0].site_address, survey_area: "Phòng Bếp & Phòng Ngủ Master", measurements_summary: "Tủ bếp chữ I dài 3.4m (trên C0.8m, dưới S0.6m); Tủ áo kịch trần D2.4m x C2.65m; Giường 1m8", site_constraints: "Vướng hộp kỹ thuật góc trái bếp 220x250mm, chừa sẵn ổ cắm bếp từ & máy rửa bát", surveyed_by_id: String(designer.id), surveyed_by_name: designer.full_name, survey_date: addCarpentryDaysYmd_(todayYmd, -17), linked_order_id: "ORD_DEMO_01", linked_order_code: "NT-" + dCompact(-16) + "-001", status: "CONVERTED", notes: "Đã chụp hiện trạng & kiểm tra độ vuông tường", created_at: dtStr(-17, "10:00:00") },
    { id: "SRV_DEMO_02", survey_code: "KS-" + dCompact(-13) + "-001", customer_id: "CUST_DEMO_02", customer_code: "KH-00002", customer_name: "Chị Nguyễn Ngọc Hân", customer_phone: "'0918223344", site_address: customers[1].site_address, survey_area: "Bếp đảo Villa & Phòng thay đồ Walk-in", measurements_summary: "Tủ bếp chữ L 4.8m + Đảo bếp 2.2m x 0.9m; Hệ tủ áo kính nhôm Walk-in dài 5.6m x C2.8m", site_constraints: "Ống hút mùi đi âm trần thạch cao, cần khoét lỗ thoát mùi D150 đúng tâm bếp", surveyed_by_id: String(designer.id), surveyed_by_name: designer.full_name, survey_date: addCarpentryDaysYmd_(todayYmd, -13), linked_order_id: "ORD_DEMO_02", linked_order_code: "NT-" + dCompact(-12) + "-001", status: "CONVERTED", notes: "Chốt gỗ Sồi Mỹ kết hợp cánh kính khung nhôm đen", created_at: dtStr(-13, "14:00:00") },
    { id: "SRV_DEMO_03", survey_code: "KS-" + dCompact(-10) + "-001", customer_id: "CUST_DEMO_03", customer_code: "KH-00003", customer_name: "Anh Lê Hoàng Phúc", customer_phone: "'0937556611", site_address: customers[2].site_address, survey_area: "Tầng trệt (Bếp + Vách Tivi Phòng khách)", measurements_summary: "Tủ bếp chữ L 4.2m; Vách ốp lam sóng sau Tivi D3.6m x C2.8m; Kệ Tivi treo 2.6m", site_constraints: "Tường bếp hơi nghiêng 12mm ở góc trong, cần chừa nẹp bù mặt đá", surveyed_by_id: String(designer.id), surveyed_by_name: designer.full_name, survey_date: addCarpentryDaysYmd_(todayYmd, -10), linked_order_id: "ORD_DEMO_03", linked_order_code: "NT-" + dCompact(-9) + "-001", status: "CONVERTED", notes: "Chủ nhà yêu cầu mặt đá trắng vân mây", created_at: dtStr(-10, "09:30:00") },
    { id: "SRV_DEMO_04", survey_code: "KS-" + dCompact(-7) + "-001", customer_id: "CUST_DEMO_05", customer_code: "KH-00005", customer_name: "Chị Phạm Thu Thảo", customer_phone: "'0978123456", site_address: customers[4].site_address, survey_area: "Trọn bộ Căn hộ 2PN (Khách - Bếp - 2 Ngủ)", measurements_summary: "Tủ bếp 3.0m; Tủ áo Master 2.2x2.6m; Tủ áo PN2 1.8x2.6m; Tủ giày kịch trần 1.4x2.6m", site_constraints: "Trần thạch cao giật cấp phòng khách, cửa logia bếp mở quay vào trong cấn cánh tủ", surveyed_by_id: String(designer.id), surveyed_by_name: designer.full_name, survey_date: addCarpentryDaysYmd_(todayYmd, -7), linked_order_id: "ORD_DEMO_05", linked_order_code: "NT-" + dCompact(-6) + "-001", status: "CONVERTED", notes: "Đổi sang cánh lùa gần cửa logia", created_at: dtStr(-7, "15:20:00") },
    { id: "SRV_DEMO_05", survey_code: "KS-" + dCompact(-1) + "-001", customer_id: "CUST_DEMO_08", customer_code: "KH-00008", customer_name: "Chị Võ Thị Mỹ Linh", customer_phone: "'0919887766", site_address: customers[7].site_address, survey_area: "Phòng Bếp Biệt thự & Phòng Thờ tầng 3", measurements_summary: "Tủ bếp gỗ Sồi Mỹ chữ U 6.2md; Vách CNC + Bàn thờ gỗ Sồi 1m97; Tủ rượu cánh kính 2.4x2.7m", site_constraints: "Tầng 3 có dầm bê tông thấp 35cm ngay trên vị trí tủ rượu, cần hạ cốt đỉnh tủ", surveyed_by_id: String(designer.id), surveyed_by_name: designer.full_name, survey_date: addCarpentryDaysYmd_(todayYmd, -1), linked_order_id: "", linked_order_code: "", status: "DRAFT", notes: "Chờ lên bản vẽ sơ bộ và báo giá gửi chị Linh chiều nay", created_at: dtStr(-1, "11:15:00") },
    { id: "SRV_DEMO_06", survey_code: "KS-" + dCompact(0) + "-001", customer_id: "CUST_DEMO_01", customer_code: "KH-00001", customer_name: "Anh Trần Quốc Bảo", customer_phone: "'0909888777", site_address: customers[0].site_address, survey_area: "Phòng Làm việc & Kệ sách ban công (Đợt 2)", measurements_summary: "Hệ bàn làm việc đôi D2.4m x S0.6m; Kệ sách kịch trần D2.4m x C2.6m kết hợp LED", site_constraints: "Chừa lỗ luồn dây điện máy tính + ổ cắm âm mặt bàn", surveyed_by_id: String(designer.id), surveyed_by_name: designer.full_name, survey_date: todayYmd, linked_order_id: "", linked_order_code: "", status: "DRAFT", notes: "Khách làm thêm sau khi rất ưng đợt 1", created_at: dtStr(0, "08:40:00") }
  ];
  app.Data.insertBatch(S.CARPENTRY_SURVEYS.NAME, surveys);

  // =========================================================================
  // 4. ĐƠN HÀNG SẢN XUẤT (7 ĐƠN PHỦ ĐỦ MỌI TRẠNG THÁI, KÝ TRONG THÁNG HIỆN TẠI)
  // =========================================================================
  var ord1Code = "NT-" + dCompact(-16) + "-001";
  var ord2Code = "NT-" + dCompact(-12) + "-001";
  var ord3Code = "NT-" + dCompact(-9) + "-001";
  var ord4Code = "NT-" + dCompact(-8) + "-001";
  var ord5Code = "NT-" + dCompact(-6) + "-001";
  var ord6Code = "NT-" + dCompact(-4) + "-001";
  var ord7Code = "NT-" + dCompact(-1) + "-001";

  var orders = [
    {
      id: "ORD_DEMO_01", order_code: ord1Code, customer_id: "CUST_DEMO_01", customer_code: "KH-00001",
      customer_name: "Anh Trần Quốc Bảo", customer_phone: "'0909888777", site_address: customers[0].site_address,
      project_type: "APARTMENT", partner_name: "KTS Minh Khoa", title: "Nội thất Căn hộ B12-08 (Tủ bếp Acrylic & Phòng ngủ Master)",
      designer_id: String(designer.id), designer_name: designer.full_name,
      foreman_id: String(foreman.id), foreman_name: foreman.full_name,
      installer_id: String(installer.id), installer_name: installer.full_name,
      drawing_status: "APPROVED", payment_plan_code: "40-40-20",
      subtotal_amount: 54820000, discount_amount: 0, total_amount: 54820000, paid_amount: 54820000, debt_amount: 0,
      material_cost_total: 16480000, labor_extra_cost: 2800000, gross_profit: 35540000, gross_margin_pct: 64.8,
      signed_date: sameMonthYmd(-16), due_date: addCarpentryDaysYmd_(todayYmd, -3),
      completed_at: dtStr(-3, "17:30:00"), warranty_months: 24, warranty_until_date: addCarpentryMonthsYmd_(addCarpentryDaysYmd_(todayYmd, -3), 24),
      completion_pct: 100, current_stage_summary: "Đã nghiệm thu bàn giao hoàn tất",
      acceptance_signer: "Trần Quốc Bảo", acceptance_notes: "Khách kiểm tra đường chỉ cạnh, ray bản lề êm & hài lòng 100%",
      status: "COMPLETED", notes: "Đơn chuẩn mẫu căn hộ 2PN", created_at: dtStr(-16, "11:00:00"), updated_at: dtStr(-3, "17:30:00")
    },
    {
      id: "ORD_DEMO_02", order_code: ord2Code, customer_id: "CUST_DEMO_02", customer_code: "KH-00002",
      customer_name: "Chị Nguyễn Ngọc Hân", customer_phone: "'0918223344", site_address: customers[1].site_address,
      project_type: "VILLA", partner_name: "KTS Hoàng Nam", title: "Nội thất Biệt thự Thảo Điền (Bếp đảo gỗ Sồi & Walk-in Closet)",
      designer_id: String(designer.id), designer_name: designer.full_name,
      foreman_id: String(foreman.id), foreman_name: foreman.full_name,
      installer_id: String(installer.id), installer_name: installer.full_name,
      drawing_status: "APPROVED", payment_plan_code: "40-40-20",
      subtotal_amount: 145000000, discount_amount: 2500000, total_amount: 142500000, paid_amount: 114000000, debt_amount: 28500000,
      material_cost_total: 46950000, labor_extra_cost: 6500000, gross_profit: 89050000, gross_margin_pct: 62.5,
      signed_date: sameMonthYmd(-12), due_date: addCarpentryDaysYmd_(todayYmd, 2),
      completed_at: "", warranty_months: 24, warranty_until_date: "",
      completion_pct: 100, current_stage_summary: "Đang lắp đặt hoàn thiện tại biệt thự",
      acceptance_signer: "", acceptance_notes: "",
      status: "INSTALLING", notes: "Đội lắp đặt 4 thợ đang hoàn thiện cánh kính & đảo bếp", created_at: dtStr(-12, "09:30:00"), updated_at: dtStr(0, "08:15:00")
    },
    {
      id: "ORD_DEMO_03", order_code: ord3Code, customer_id: "CUST_DEMO_03", customer_code: "KH-00003",
      customer_name: "Anh Lê Hoàng Phúc", customer_phone: "'0937556611", site_address: customers[2].site_address,
      project_type: "TOWNHOUSE", partner_name: "Khách trực tiếp", title: "Tủ bếp chữ L Acrylic Noline & Vách lam sóng Phòng khách",
      designer_id: String(designer.id), designer_name: designer.full_name,
      foreman_id: String(foreman.id), foreman_name: foreman.full_name,
      installer_id: String(installer.id), installer_name: installer.full_name,
      drawing_status: "APPROVED", payment_plan_code: "40-40-20",
      subtotal_amount: 68400000, discount_amount: 0, total_amount: 68400000, paid_amount: 27360000, debt_amount: 41040000,
      material_cost_total: 22120000, labor_extra_cost: 0, gross_profit: 46280000, gross_margin_pct: 67.7,
      signed_date: sameMonthYmd(-9), due_date: addCarpentryDaysYmd_(todayYmd, 3),
      completed_at: "", warranty_months: 24, warranty_until_date: "",
      completion_pct: 100, current_stage_summary: "Đã xong QC — Sẵn sàng xuất xưởng",
      acceptance_signer: "", acceptance_notes: "",
      status: "READY_TO_SHIP", notes: "Đang nhắc khách thanh toán Đợt 2 (40%) trước khi cho xe xuất xưởng", created_at: dtStr(-9, "10:20:00"), updated_at: dtStr(-1, "16:45:00")
    },
    {
      id: "ORD_DEMO_04", order_code: ord4Code, customer_id: "CUST_DEMO_04", customer_code: "KH-00004",
      customer_name: "Công ty TNHH Kiến Trúc Mộc An", customer_phone: "'0903456789", site_address: customers[3].site_address,
      project_type: "OFFICE", partner_name: "KTS Minh Khoa", title: "Hệ tủ hồ sơ kịch trần, Quầy lễ tân & Bàn họp Văn phòng",
      designer_id: String(designer.id), designer_name: designer.full_name,
      foreman_id: String(foreman.id), foreman_name: foreman.full_name,
      installer_id: String(installer.id), installer_name: installer.full_name,
      drawing_status: "APPROVED", payment_plan_code: "40-40-20",
      subtotal_amount: 88000000, discount_amount: 2000000, total_amount: 86000000, paid_amount: 34400000, debt_amount: 51600000,
      material_cost_total: 27460000, labor_extra_cost: 0, gross_profit: 58540000, gross_margin_pct: 68.1,
      signed_date: sameMonthYmd(-8), due_date: addCarpentryDaysYmd_(todayYmd, 2),
      completed_at: "", warranty_months: 24, warranty_until_date: "",
      completion_pct: 60, current_stage_summary: stages[3] ? stages[3].name : "4️⃣ Lắp ráp thô",
      acceptance_signer: "", acceptance_notes: "",
      status: "IN_PRODUCTION", notes: "Cận hạn bàn giao — ưu tiên tăng ca xưởng sơn PU", created_at: dtStr(-8, "14:00:00"), updated_at: dtStr(0, "07:50:00")
    },
    {
      id: "ORD_DEMO_05", order_code: ord5Code, customer_id: "CUST_DEMO_05", customer_code: "KH-00005",
      customer_name: "Chị Phạm Thu Thảo", customer_phone: "'0978123456", site_address: customers[4].site_address,
      project_type: "APARTMENT", partner_name: "Khách trực tiếp", title: "Trọn bộ Nội thất Căn hộ 2PN Vinhomes Grand Park",
      designer_id: String(designer.id), designer_name: designer.full_name,
      foreman_id: String(foreman.id), foreman_name: foreman.full_name,
      installer_id: String(installer.id), installer_name: installer.full_name,
      drawing_status: "APPROVED", payment_plan_code: "40-40-20",
      subtotal_amount: 74200000, discount_amount: 0, total_amount: 74200000, paid_amount: 29680000, debt_amount: 44520000,
      material_cost_total: 21040000, labor_extra_cost: 0, gross_profit: 53160000, gross_margin_pct: 71.6,
      signed_date: sameMonthYmd(-6), due_date: addCarpentryDaysYmd_(todayYmd, -1),
      completed_at: "", warranty_months: 24, warranty_until_date: "",
      completion_pct: 33, current_stage_summary: stages[2] ? stages[2].name : "3️⃣ Dán cạnh & Khoan cam",
      acceptance_signer: "", acceptance_notes: "",
      status: "IN_PRODUCTION", notes: "Khách đổi màu ván giữa chừng nên trễ 1 ngày — đang đẩy CNC gấp", created_at: dtStr(-6, "16:30:00"), updated_at: dtStr(0, "08:05:00")
    },
    {
      id: "ORD_DEMO_06", order_code: ord6Code, customer_id: "CUST_DEMO_06", customer_code: "KH-00006",
      customer_name: "Showroom Mỹ Phẩm Lumiere", customer_phone: "'0902667788", site_address: customers[5].site_address,
      project_type: "SHOWROOM", partner_name: "KTS Hoàng Nam", title: "Hệ tủ trưng bày mỹ phẩm LED & Quầy thu ngân Showroom Q.3",
      designer_id: String(designer.id), designer_name: designer.full_name,
      foreman_id: "", foreman_name: "",
      installer_id: "", installer_name: "",
      drawing_status: "PENDING", payment_plan_code: "40-40-20",
      subtotal_amount: 92000000, discount_amount: 0, total_amount: 92000000, paid_amount: 36800000, debt_balance: 55200000, debt_amount: 55200000,
      material_cost_total: 0, labor_extra_cost: 0, gross_profit: 92000000, gross_margin_pct: 100,
      signed_date: sameMonthYmd(-4), due_date: addCarpentryDaysYmd_(todayYmd, 6),
      completed_at: "", warranty_months: 24, warranty_until_date: "",
      completion_pct: 0, current_stage_summary: stages[0] ? stages[0].name : "1️⃣ Nhập vật tư ván & PK",
      acceptance_signer: "", acceptance_notes: "",
      status: "DEPOSITED", notes: "Đã nhận cọc Đợt 1 — chờ duyệt bản vẽ 2D bóc tách để ra lệnh SX", created_at: dtStr(-4, "13:15:00"), updated_at: dtStr(-2, "10:00:00")
    },
    {
      id: "ORD_DEMO_07", order_code: ord7Code, customer_id: "CUST_DEMO_07", customer_code: "KH-00007",
      customer_name: "Anh Đặng Minh Tuấn", customer_phone: "'0945332211", site_address: customers[6].site_address,
      project_type: "TOWNHOUSE", partner_name: "KTS Thanh Trúc", title: "Combo Phòng ngủ Master & Hệ tủ giày thông minh",
      designer_id: String(designer.id), designer_name: designer.full_name,
      foreman_id: "", foreman_name: "",
      installer_id: "", installer_name: "",
      drawing_status: "PENDING", payment_plan_code: "40-40-20",
      subtotal_amount: 43600000, discount_amount: 0, total_amount: 43600000, paid_amount: 0, debt_amount: 43600000,
      material_cost_total: 0, labor_extra_cost: 0, gross_profit: 43600000, gross_margin_pct: 100,
      signed_date: sameMonthYmd(-1), due_date: addCarpentryDaysYmd_(todayYmd, 14),
      completed_at: "", warranty_months: 24, warranty_until_date: "",
      completion_pct: 0, current_stage_summary: stages[0] ? stages[0].name : "1️⃣ Nhập vật tư ván & PK",
      acceptance_signer: "", acceptance_notes: "",
      status: "QUOTED", notes: "Đã gửi báo giá chi tiết qua Zalo cho chủ đầu tư", created_at: dtStr(-1, "16:40:00"), updated_at: dtStr(-1, "16:40:00")
    }
  ];
  app.Data.insertBatch(S.FURNITURE_ORDERS.NAME, orders);

  // =========================================================================
  // 5. HẠNG MỤC BÓC TÁCH CHI TIẾT (ORDER_ITEMS — PHỦ ĐỦ MD / M2 / UNIT)
  // =========================================================================
  var stInfo = function(idx) {
    var s = stages[idx] || stages[0];
    return { code: s.code, order: s.order, label: s.name };
  };
  var makeItem = function(id, ordId, ordCode, no, cat, name, spec, mode, l, h, qty, unit, price, stageIdx, delivered) {
    var comp = mode === "MD" ? Number((l * qty).toFixed(3)) : (mode === "M2" ? Number((l * h * qty).toFixed(3)) : qty);
    var st = stInfo(stageIdx);
    return {
      id: id, order_id: ordId, order_code: ordCode, item_no: no, category: cat, item_name: name,
      spec_material: spec, calc_mode: mode, length_m: l, height_or_width_m: h, quantity: qty,
      computed_qty: comp, unit: unit, unit_price: price, line_total: Math.round(comp * price),
      production_stage: st.code, stage_order: st.order, stage_label: st.label,
      delivered_ok: delivered ? "TRUE" : "FALSE", notes: "", updated_at: nowStr
    };
  };

  var orderItems = [
    // ORD 1 (COMPLETED - all QC_PACKED idx 5)
    makeItem("ITM_D01_1", "ORD_DEMO_01", ord1Code, 1, "KITCHEN", "Tủ bếp dưới MDF chống ẩm + khoang chậu Picomat", "MDF HMR 17mm 388 EV", "MD", 3.4, 0.81, 1, "md", 3600000, 5, true),
    makeItem("ITM_D01_2", "ORD_DEMO_01", ord1Code, 2, "KITCHEN", "Tủ bếp trên cánh Acrylic Noline bóng gương", "Acrylic PARC 01 trắng sứ", "MD", 3.4, 0.8, 1, "md", 4400000, 5, true),
    makeItem("ITM_D01_3", "ORD_DEMO_01", ord1Code, 3, "BEDROOM", "Tủ quần áo kịch trần Master có đèn LED", "MDF An Cường 17mm + Hafele", "M2", 2.4, 2.65, 1, "m2", 2850000, 5, true),
    makeItem("ITM_D01_4", "ORD_DEMO_01", ord1Code, 4, "BEDROOM", "Giường ngủ bọc nỉ cao cấp 1m8 x 2m0", "Khung MDF HMR bọc nỉ Bỉ", "UNIT", 2.0, 1.8, 1, "Cái", 9500000, 5, true),

    // ORD 2 (INSTALLING - all QC_PACKED idx 5)
    makeItem("ITM_D02_1", "ORD_DEMO_02", ord2Code, 1, "KITCHEN", "Hệ tủ bếp chữ L gỗ Sồi Mỹ sơn PU mờ", "Gỗ Sồi Mỹ FAS + phụ kiện Blum", "MD", 4.8, 0.85, 1, "md", 9500000, 5, false),
    makeItem("ITM_D02_2", "ORD_DEMO_02", ord2Code, 2, "KITCHEN", "Bàn đảo bếp kết hợp quầy bar mặt đá thạch anh", "Khung Sồi Mỹ + cánh soi pano", "MD", 2.2, 0.9, 1, "md", 8500000, 5, false),
    makeItem("ITM_D02_3", "ORD_DEMO_02", ord2Code, 3, "BEDROOM", "Hệ tủ áo Walk-in Closet cánh kính khung nhôm", "MDF HMR + Kính trà cường lực", "M2", 5.6, 2.8, 1, "m2", 4200000, 5, false),
    makeItem("ITM_D02_4", "ORD_DEMO_02", ord2Code, 4, "LIVING", "Bàn ăn gỗ Sồi Mỹ nguyên khối 6 ghế", "Sồi Mỹ nguyên tấm dày 40mm", "UNIT", 1.8, 0.9, 1, "Bộ", 14880000, 5, false),

    // ORD 3 (READY_TO_SHIP - all QC_PACKED idx 5)
    makeItem("ITM_D03_1", "ORD_DEMO_03", ord3Code, 1, "KITCHEN", "Tủ bếp chữ L trên & dưới cánh Acrylic", "MDF An Cường + Acrylic PARC", "MD", 4.2, 0.8, 1, "md", 8000000, 5, false),
    makeItem("ITM_D03_2", "ORD_DEMO_03", ord3Code, 2, "LIVING", "Vách ốp lam sóng kết hợp PVC vân đá sau Tivi", "Lam sóng cốt xanh + nẹp inox", "M2", 3.6, 2.8, 1, "m2", 1450000, 5, false),
    makeItem("ITM_D03_3", "ORD_DEMO_03", ord3Code, 3, "LIVING", "Kệ Tivi treo tường 4 ngăn kéo giảm chấn", "MDF HMR phủ Melamine 388 EV", "MD", 2.6, 0.4, 1, "md", 3200000, 5, false),
    makeItem("ITM_D03_4", "ORD_DEMO_03", ord3Code, 4, "LIVING", "Tủ rượu cánh kính phòng khách có LED", "Khung nhôm đen + kính cường lực", "M2", 1.4, 2.6, 1, "m2", 3260000, 5, false),

    // ORD 4 (IN_PRODUCTION - Cận hạn! Các công đoạn khác nhau 2, 3, 4 để bảng xưởng cực đẹp!)
    makeItem("ITM_D04_1", "ORD_DEMO_04", ord4Code, 1, "OFFICE", "Hệ tủ hồ sơ kịch trần phòng Giám đốc", "MDF An Cường 17mm phối óc chó", "M2", 4.5, 2.8, 1, "m2", 2600000, 4, false), // Sơn PU
    makeItem("ITM_D04_2", "ORD_DEMO_04", ord4Code, 2, "OFFICE", "Quầy lễ tân uốn cong nan gỗ + LED logo", "MDF uốn cong sơn PU 2K trắng kem", "MD", 3.2, 1.1, 1, "md", 8500000, 3, false), // Lắp ráp thô
    makeItem("ITM_D04_3", "ORD_DEMO_04", ord4Code, 3, "OFFICE", "Bàn họp lớn 12 chỗ tích hợp hộp điện âm", "MDF 34mm phủ veneer Sồi Mỹ", "UNIT", 3.6, 1.4, 1, "Cái", 28040000, 2, false), // Dán cạnh

    // ORD 5 (IN_PRODUCTION - Trễ tiến độ 1 ngày! Công đoạn 0, 1, 2)
    makeItem("ITM_D05_1", "ORD_DEMO_05", ord5Code, 1, "KITCHEN", "Tủ bếp chữ I Căn hộ Vinhomes (trên + dưới)", "MDF HMR Melamine + Picomat", "MD", 3.0, 0.8, 1, "md", 7800000, 2, false), // Dán cạnh
    makeItem("ITM_D05_2", "ORD_DEMO_05", ord5Code, 2, "BEDROOM", "Tủ quần áo phòng ngủ Master cánh lùa", "MDF 17mm An Cường + ray lùa êm", "M2", 2.2, 2.6, 1, "m2", 3100000, 1, false), // Cắt CNC
    makeItem("ITM_D05_3", "ORD_DEMO_05", ord5Code, 3, "BEDROOM", "Tủ quần áo phòng ngủ 2 + Bàn học liền kệ", "MDF 17mm trắng phối vân sồi", "M2", 2.8, 2.6, 1, "m2", 2850000, 1, false), // Cắt CNC
    makeItem("ITM_D05_4", "ORD_DEMO_05", ord5Code, 4, "LIVING", "Tủ giày kịch trần kết hợp ghế ngồi thay giày", "MDF HMR 17mm + đệm da", "M2", 1.4, 2.6, 1, "m2", 3380000, 0, false), // Nhập vật tư

    // ORD 6 (DEPOSITED - Chờ duyệt bản vẽ SX)
    makeItem("ITM_D06_1", "ORD_DEMO_06", ord6Code, 1, "OFFICE", "Hệ tủ trưng bày mỹ phẩm 6 khoang gắn LED thanh", "MDF sơn 2K hồng phấn + kính 8mm", "M2", 8.5, 2.6, 1, "m2", 3100000, 0, false),
    makeItem("ITM_D06_2", "ORD_DEMO_06", ord6Code, 2, "OFFICE", "Quầy thu ngân mặt đá marble & logo nổi", "MDF chống ẩm + đá nhân tạo", "MD", 2.4, 1.05, 1, "md", 9787500, 0, false),

    // ORD 7 (QUOTED)
    makeItem("ITM_D07_1", "ORD_DEMO_07", ord7Code, 1, "BEDROOM", "Tủ quần áo Master kịch trần 4 cánh mở", "MDF HMR 388 EV + Hafele", "M2", 2.6, 2.6, 1, "m2", 2850000, 0, false),
    makeItem("ITM_D07_2", "ORD_DEMO_07", ord7Code, 2, "BEDROOM", "Giường ngủ bọc nỉ 1m8 + 2 Tab đầu giường", "MDF HMR + bọc nỉ xám nhạt", "UNIT", 2.0, 1.8, 1, "Bộ", 12500000, 0, false),
    makeItem("ITM_D07_3", "ORD_DEMO_07", ord7Code, 3, "LIVING", "Tủ giày thông minh kịch trần kèm gương soi", "MDF An Cường 17mm", "M2", 1.5, 2.6, 1, "m2", 3034000, 0, false)
  ];
  app.Data.insertBatch(S.ORDER_ITEMS.NAME, orderItems);

  // =========================================================================
  // 6. NHẬT KÝ CHUYỂN CÔNG ĐOẠN SẢN XUẤT (PRODUCTION_PROGRESS)
  // =========================================================================
  var progressLogs = [
    { id: "PRG_D01", progress_code: "SX-" + dCompact(-4) + "-001", order_id: "ORD_DEMO_03", order_code: ord3Code, order_item_id: "ITM_D03_1", item_name: "Tủ bếp chữ L trên & dưới cánh Acrylic", from_stage: "PU_PAINTING", to_stage: "QC_PACKED", stage_label: stInfo(5).label, completion_pct_after: 100, worker_id: String(foreman.id), worker_name: foreman.full_name, notes: "Đã QC bề mặt Acrylic không trầy, bọc màng PE + bìa carton 6 kiện", created_at: dtStr(-1, "16:30:00") },
    { id: "PRG_D02", progress_code: "SX-" + dCompact(-1) + "-002", order_id: "ORD_DEMO_04", order_code: ord4Code, order_item_id: "ITM_D04_1", item_name: "Hệ tủ hồ sơ kịch trần phòng Giám đốc", from_stage: "ASSEMBLY", to_stage: "PU_PAINTING", stage_label: stInfo(4).label, completion_pct_after: 60, worker_id: String(foreman.id), worker_name: foreman.full_name, notes: "Đã chuyển sang buồng sơn PU hoàn thiện 2 lớp mờ", created_at: dtStr(-1, "15:10:00") },
    { id: "PRG_D03", progress_code: "SX-" + dCompact(-1) + "-003", order_id: "ORD_DEMO_04", order_code: ord4Code, order_item_id: "ITM_D04_2", item_name: "Quầy lễ tân uốn cong nan gỗ + LED logo", from_stage: "EDGE_BANDING", to_stage: "ASSEMBLY", stage_label: stInfo(3).label, completion_pct_after: 50, worker_id: String(foreman.id), worker_name: foreman.full_name, notes: "Đang ghép khung cong và đi rãnh LED âm", created_at: dtStr(-1, "11:45:00") },
    { id: "PRG_D04", progress_code: "SX-" + dCompact(0) + "-001", order_id: "ORD_DEMO_05", order_code: ord5Code, order_item_id: "ITM_D05_1", item_name: "Tủ bếp chữ I Căn hộ Vinhomes (trên + dưới)", from_stage: "CNC_CUTTING", to_stage: "EDGE_BANDING", stage_label: stInfo(2).label, completion_pct_after: 33, worker_id: String(foreman.id), worker_name: foreman.full_name, notes: "Xong cắt CNC toàn bộ thùng tủ, đang dán cạnh PVC tự động", created_at: dtStr(0, "08:05:00") }
  ];
  app.Data.insertBatch(S.PRODUCTION_PROGRESS.NAME, progressLogs);

  // =========================================================================
  // 7. LỊCH THANH TOÁN ĐỢT 1-2-3 (ORDER_PAYMENTS — 21 ĐỢT ĐỦ TRẠNG THÁI)
  // =========================================================================
  var payments = [];
  var paySeq = 1;
  var addOrderPayments = function(ord, st1, st2, st3) {
    var total = ord.total_amount;
    var a1 = Math.round(total * 0.4);
    var a2 = Math.round(total * 0.4);
    var a3 = total - a1 - a2;
    var specs = [
      { no: 1, name: "Đợt 1 — Ký HĐ chốt cọc", trig: "ON_SIGN", pct: 40, amt: a1, st: st1, exp: ord.signed_date, ch: "BANK_TRANSFER" },
      { no: 2, name: "Đợt 2 — Xong QC tại xưởng (Trước giao)", trig: "READY_TO_SHIP", pct: 40, amt: a2, st: st2, exp: addCarpentryDaysYmd_(ord.due_date, -2), ch: "BANK_QR" },
      { no: 3, name: "Đợt 3 — Nghiệm thu lắp đặt hoàn tất", trig: "ON_HANDOVER", pct: 20, amt: a3, st: st3, exp: ord.due_date, ch: "BANK_TRANSFER" }
    ];
    for (var i = 0; i < specs.length; i++) {
      var sp = specs[i];
      var paid = sp.st === "PAID" ? sp.amt : 0;
      var codeNum = String(paySeq++);
      while (codeNum.length < 3) codeNum = "0" + codeNum;
      payments.push({
        id: "PAY_" + ord.id + "_" + sp.no,
        payment_code: "TT-" + dCompact(0) + "-" + codeNum,
        order_id: ord.id, order_code: ord.order_code,
        customer_id: ord.customer_id, customer_name: ord.customer_name,
        stage_no: sp.no, stage_name: sp.name, due_trigger: sp.trig, percent_share: sp.pct,
        due_amount: sp.amt, paid_amount: paid,
        payment_channel: paid > 0 ? sp.ch : "",
        expected_date: sp.exp,
        paid_at: paid > 0 ? (sp.exp + " 14:20:00") : "",
        status: sp.st,
        collected_by_name: paid > 0 ? accountant.full_name : "",
        notes: paid > 0 ? ("Đã nhận đủ " + sp.name) : "",
        updated_at: nowStr
      });
    }
  };
  addOrderPayments(orders[0], "PAID", "PAID", "PAID");      // ORD 1: Đủ 3 đợt
  addOrderPayments(orders[1], "PAID", "PAID", "DUE");       // ORD 2: Đang lắp -> Đợt 3 DUE
  addOrderPayments(orders[2], "PAID", "DUE", "NOT_DUE");    // ORD 3: Xong QC -> Đợt 2 DUE (nhắc thu trước giao!)
  addOrderPayments(orders[3], "PAID", "NOT_DUE", "NOT_DUE");// ORD 4: Đang SX
  addOrderPayments(orders[4], "PAID", "NOT_DUE", "NOT_DUE");// ORD 5: Đang SX
  addOrderPayments(orders[5], "PAID", "NOT_DUE", "NOT_DUE");// ORD 6: Chốt cọc
  addOrderPayments(orders[6], "DUE", "NOT_DUE", "NOT_DUE"); // ORD 7: Báo giá -> Đợt 1 DUE chờ cọc
  app.Data.insertBatch(S.ORDER_PAYMENTS.NAME, payments);

  // =========================================================================
  // 8. DỰ TRÙ & XUẤT KHO VẬT TƯ THEO ĐƠN (ORDER_MATERIALS)
  // =========================================================================
  var orderMaterials = [
    { id: "OM_D01", issue_code: "VT-" + dCompact(-14) + "-001", order_id: "ORD_DEMO_01", order_code: ord1Code, material_id: "MAT_DEMO_01", material_code: "VT0001", material_name: catalogRows[0].item_name, unit: "Tấm", estimated_qty: 16, issued_qty: 16, unit_cost: 520000, total_cost: 8320000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Xuất thùng tủ bếp + tủ áo Master", created_at: dtStr(-14, "08:30:00") },
    { id: "OM_D02", issue_code: "VT-" + dCompact(-14) + "-002", order_id: "ORD_DEMO_01", order_code: ord1Code, material_id: "MAT_DEMO_02", material_code: "VT0002", material_name: catalogRows[1].item_name, unit: "Tấm", estimated_qty: 4, issued_qty: 4, unit_cost: 1280000, total_cost: 5120000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Cánh Acrylic tủ bếp trên", created_at: dtStr(-14, "09:00:00") },
    { id: "OM_D03", issue_code: "VT-" + dCompact(-13) + "-001", order_id: "ORD_DEMO_01", order_code: ord1Code, material_id: "MAT_DEMO_05", material_code: "VT0005", material_name: catalogRows[4].item_name, unit: "Cái", estimated_qty: 40, issued_qty: 40, unit_cost: 48000, total_cost: 1920000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Bản lề Hafele toàn bộ tủ", created_at: dtStr(-13, "10:00:00") },
    { id: "OM_D04", issue_code: "VT-" + dCompact(-13) + "-002", order_id: "ORD_DEMO_01", order_code: ord1Code, material_id: "MAT_DEMO_04", material_code: "VT0004", material_name: catalogRows[3].item_name, unit: "Tấm", estimated_qty: 1.3, issued_qty: 1.3, unit_cost: 860000, total_cost: 1120000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Khoang chậu rửa Picomat", created_at: dtStr(-13, "10:15:00") },

    { id: "OM_D05", issue_code: "VT-" + dCompact(-10) + "-001", order_id: "ORD_DEMO_02", order_code: ord2Code, material_id: "MAT_DEMO_03", material_code: "VT0003", material_name: catalogRows[2].item_name, unit: "m3", estimated_qty: 1.6, issued_qty: 1.6, unit_cost: 18500000, total_cost: 29600000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Xuất gỗ Sồi Mỹ làm tủ bếp đảo & bàn ăn", created_at: dtStr(-10, "08:00:00") },
    { id: "OM_D06", issue_code: "VT-" + dCompact(-10) + "-002", order_id: "ORD_DEMO_02", order_code: ord2Code, material_id: "MAT_DEMO_01", material_code: "VT0001", material_name: catalogRows[0].item_name, unit: "Tấm", estimated_qty: 20, issued_qty: 20, unit_cost: 520000, total_cost: 10400000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Thùng hệ tủ Walk-in Closet", created_at: dtStr(-10, "08:40:00") },
    { id: "OM_D07", issue_code: "VT-" + dCompact(-9) + "-001", order_id: "ORD_DEMO_02", order_code: ord2Code, material_id: "MAT_DEMO_07", material_code: "VT0007", material_name: catalogRows[6].item_name, unit: "Bộ", estimated_qty: 2, issued_qty: 2, unit_cost: 2350000, total_cost: 4700000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Tay nâng Blum Aventos HF", created_at: dtStr(-9, "11:00:00") },
    { id: "OM_D08", issue_code: "VT-" + dCompact(-9) + "-002", order_id: "ORD_DEMO_02", order_code: ord2Code, material_id: "MAT_DEMO_06", material_code: "VT0006", material_name: catalogRows[5].item_name, unit: "Bộ", estimated_qty: 16.6, issued_qty: 16.6, unit_cost: 135000, total_cost: 2250000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Ray trượt ngăn kéo Walk-in", created_at: dtStr(-9, "11:20:00") },

    { id: "OM_D09", issue_code: "VT-" + dCompact(-7) + "-001", order_id: "ORD_DEMO_03", order_code: ord3Code, material_id: "MAT_DEMO_01", material_code: "VT0001", material_name: catalogRows[0].item_name, unit: "Tấm", estimated_qty: 24, issued_qty: 24, unit_cost: 520000, total_cost: 12480000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Xuất ván MDF tủ bếp + vách Tivi", created_at: dtStr(-7, "08:30:00") },
    { id: "OM_D10", issue_code: "VT-" + dCompact(-7) + "-002", order_id: "ORD_DEMO_03", order_code: ord3Code, material_id: "MAT_DEMO_02", material_code: "VT0002", material_name: catalogRows[1].item_name, unit: "Tấm", estimated_qty: 6, issued_qty: 6, unit_cost: 1280000, total_cost: 7680000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Cánh Acrylic Noline chữ L", created_at: dtStr(-7, "09:10:00") },
    { id: "OM_D11", issue_code: "VT-" + dCompact(-6) + "-001", order_id: "ORD_DEMO_03", order_code: ord3Code, material_id: "MAT_DEMO_05", material_code: "VT0005", material_name: catalogRows[4].item_name, unit: "Cái", estimated_qty: 40.8, issued_qty: 40.8, unit_cost: 48000, total_cost: 1960000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Bản lề Hafele + phụ kiện", created_at: dtStr(-6, "09:40:00") },

    { id: "OM_D12", issue_code: "VT-" + dCompact(-6) + "-002", order_id: "ORD_DEMO_04", order_code: ord4Code, material_id: "MAT_DEMO_01", material_code: "VT0001", material_name: catalogRows[0].item_name, unit: "Tấm", estimated_qty: 46, issued_qty: 46, unit_cost: 520000, total_cost: 23920000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Ván MDF cho hệ tủ hồ sơ & bàn họp", created_at: dtStr(-6, "13:30:00") },
    { id: "OM_D13", issue_code: "VT-" + dCompact(-5) + "-001", order_id: "ORD_DEMO_04", order_code: ord4Code, material_id: "MAT_DEMO_08", material_code: "VT0008", material_name: catalogRows[7].item_name, unit: "Cuộn", estimated_qty: 14.75, issued_qty: 14.75, unit_cost: 240000, total_cost: 3540000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Chỉ dán cạnh PVC + phụ kiện văn phòng", created_at: dtStr(-5, "09:15:00") },

    { id: "OM_D14", issue_code: "VT-" + dCompact(-4) + "-001", order_id: "ORD_DEMO_05", order_code: ord5Code, material_id: "MAT_DEMO_01", material_code: "VT0001", material_name: catalogRows[0].item_name, unit: "Tấm", estimated_qty: 36, issued_qty: 36, unit_cost: 520000, total_cost: 18720000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Xuất trọn bộ MDF căn hộ 2PN Vinhomes", created_at: dtStr(-4, "08:20:00") },
    { id: "OM_D15", issue_code: "VT-" + dCompact(-4) + "-002", order_id: "ORD_DEMO_05", order_code: ord5Code, material_id: "MAT_DEMO_05", material_code: "VT0005", material_name: catalogRows[4].item_name, unit: "Cái", estimated_qty: 48.3, issued_qty: 48.3, unit_cost: 48000, total_cost: 2320000, performed_by: String(foreman.id), performed_by_name: foreman.full_name, notes: "Bản lề + ray trượt giảm chấn", created_at: dtStr(-4, "09:00:00") }
  ];
  app.Data.insertBatch(S.ORDER_MATERIALS.NAME, orderMaterials);

  // =========================================================================
  // 9. BẢN VẼ 2D/3D & ẢNH CÔNG TRÌNH (ORDER_FILES_PHOTOS)
  // =========================================================================
  var filesPhotos = [
    { id: "DOC_D01", file_code: "TL-" + dCompact(-15) + "-001", order_id: "ORD_DEMO_01", order_code: ord1Code, survey_id: "SRV_DEMO_01", customer_name: "Anh Trần Quốc Bảo", file_category: "DRAWING_3D", title_or_room: "Phối cảnh 3D Bếp & Ngủ Master (Chốt duyệt)", file_name: "3D_CanHo_B12_08_Final.pdf", mime_type: "application/pdf", file_size: 2450000, drive_file_id: "DEMO_3D_01", drive_url: "https://drive.google.com/drive/my-drive", uploaded_by: String(designer.id), uploaded_by_name: designer.full_name, notes: "Khách duyệt phối cảnh ván 388 EV", created_at: dtStr(-15, "10:00:00") },
    { id: "DOC_D02", file_code: "TL-" + dCompact(-15) + "-002", order_id: "ORD_DEMO_01", order_code: ord1Code, survey_id: "", customer_name: "Anh Trần Quốc Bảo", file_category: "DRAWING_2D", title_or_room: "Bản vẽ bóc tách CNC 2D Tủ bếp + Tủ áo", file_name: "2D_CNC_B12_08_Rev2.pdf", mime_type: "application/pdf", file_size: 1890000, drive_file_id: "DEMO_2D_01", drive_url: "https://drive.google.com/drive/my-drive", uploaded_by: String(designer.id), uploaded_by_name: designer.full_name, notes: "Đã chừa hộp kỹ thuật góc trái 220x250", created_at: dtStr(-15, "15:20:00") },
    { id: "DOC_D03", file_code: "TL-" + dCompact(-3) + "-001", order_id: "ORD_DEMO_01", order_code: ord1Code, survey_id: "", customer_name: "Anh Trần Quốc Bảo", file_category: "HANDOVER_DONE", title_or_room: "Ảnh nghiệm thu bàn giao hoàn thiện", file_name: "BanGiao_B12_08_HoanThien.jpg", mime_type: "image/jpeg", file_size: 840000, drive_file_id: "DEMO_HD_01", drive_url: "https://drive.google.com/drive/my-drive", uploaded_by: String(installer.id), uploaded_by_name: installer.full_name, notes: "Hoàn thiện lắp đặt sạch đẹp", created_at: dtStr(-3, "17:20:00") },

    { id: "DOC_D04", file_code: "TL-" + dCompact(-11) + "-001", order_id: "ORD_DEMO_02", order_code: ord2Code, survey_id: "SRV_DEMO_02", customer_name: "Chị Nguyễn Ngọc Hân", file_category: "DRAWING_3D", title_or_room: "Phối cảnh 3D Bếp đảo gỗ Sồi & Walk-in", file_name: "3D_Villa_ThaoDien_v3.pdf", mime_type: "application/pdf", file_size: 4120000, drive_file_id: "DEMO_3D_02", drive_url: "https://drive.google.com/drive/my-drive", uploaded_by: String(designer.id), uploaded_by_name: designer.full_name, notes: "Duyệt cùng KTS Hoàng Nam", created_at: dtStr(-11, "11:00:00") },
    { id: "DOC_D05", file_code: "TL-" + dCompact(-11) + "-002", order_id: "ORD_DEMO_02", order_code: ord2Code, survey_id: "", customer_name: "Chị Nguyễn Ngọc Hân", file_category: "DRAWING_2D", title_or_room: "Bản vẽ kỹ thuật 2D lắp đặt Bếp đảo + Kính", file_name: "2D_LapDat_Villa_ThaoDien.pdf", mime_type: "application/pdf", file_size: 2740000, drive_file_id: "DEMO_2D_02", drive_url: "https://drive.google.com/drive/my-drive", uploaded_by: String(designer.id), uploaded_by_name: designer.full_name, notes: "Kèm sơ đồ nguồn LED cảm biến", created_at: dtStr(-11, "16:00:00") },
    { id: "DOC_D06", file_code: "TL-" + dCompact(-2) + "-001", order_id: "ORD_DEMO_02", order_code: ord2Code, survey_id: "", customer_name: "Chị Nguyễn Ngọc Hân", file_category: "QC_WORKSHOP", title_or_room: "Ảnh QC kiểm sơn PU & lắp thử tại xưởng", file_name: "QC_DaoBep_SoiMy.jpg", mime_type: "image/jpeg", file_size: 920000, drive_file_id: "DEMO_QC_02", drive_url: "https://drive.google.com/drive/my-drive", uploaded_by: String(foreman.id), uploaded_by_name: foreman.full_name, notes: "Đạt chuẩn độ mịn PU mờ 50%", created_at: dtStr(-2, "14:45:00") },

    { id: "DOC_D07", file_code: "TL-" + dCompact(-8) + "-001", order_id: "ORD_DEMO_03", order_code: ord3Code, survey_id: "SRV_DEMO_03", customer_name: "Anh Lê Hoàng Phúc", file_category: "DRAWING_2D", title_or_room: "Bản vẽ bóc tách 2D Tủ bếp chữ L & Vách Tivi", file_name: "2D_NhaPho_Q1_Final.pdf", mime_type: "application/pdf", file_size: 1650000, drive_file_id: "DEMO_2D_03", drive_url: "https://drive.google.com/drive/my-drive", uploaded_by: String(designer.id), uploaded_by_name: designer.full_name, notes: "Đã xử lý nẹp bù góc nghiêng 12mm", created_at: dtStr(-8, "14:00:00") },
    { id: "DOC_D08", file_code: "TL-" + dCompact(-1) + "-001", order_id: "ORD_DEMO_03", order_code: ord3Code, survey_id: "", customer_name: "Anh Lê Hoàng Phúc", file_category: "QC_WORKSHOP", title_or_room: "Ảnh QC đóng gói 6 kiện chờ xuất xưởng", file_name: "QC_DongGoi_NhaPho_Q1.jpg", mime_type: "image/jpeg", file_size: 780000, drive_file_id: "DEMO_QC_03", drive_url: "https://drive.google.com/drive/my-drive", uploaded_by: String(foreman.id), uploaded_by_name: foreman.full_name, notes: "Sẵn sàng lên xe ngay khi thu Đợt 2", created_at: dtStr(-1, "16:40:00") },

    { id: "DOC_D09", file_code: "TL-" + dCompact(-7) + "-001", order_id: "ORD_DEMO_04", order_code: ord4Code, survey_id: "", customer_name: "Công ty TNHH Kiến Trúc Mộc An", file_category: "DRAWING_3D", title_or_room: "Phối cảnh 3D Văn phòng Pearl Plaza", file_name: "3D_Office_MocAn_T8.pdf", mime_type: "application/pdf", file_size: 3100000, drive_file_id: "DEMO_3D_04", drive_url: "https://drive.google.com/drive/my-drive", uploaded_by: String(designer.id), uploaded_by_name: designer.full_name, notes: "Chốt nan gỗ uốn cong quầy lễ tân", created_at: dtStr(-7, "09:40:00") },
    { id: "DOC_D10", file_code: "TL-" + dCompact(-1) + "-002", order_id: "ORD_DEMO_04", order_code: ord4Code, survey_id: "", customer_name: "Công ty TNHH Kiến Trúc Mộc An", file_category: "PRODUCTION_PROGRESS", title_or_room: "Ảnh tiến độ lắp ráp thô Quầy lễ tân tại xưởng", file_name: "TienDo_QuayLeTan_Xuong.jpg", mime_type: "image/jpeg", file_size: 690000, drive_file_id: "DEMO_PR_04", drive_url: "https://drive.google.com/drive/my-drive", uploaded_by: String(foreman.id), uploaded_by_name: foreman.full_name, notes: "Đang sơn lót chuẩn bị phủ PU", created_at: dtStr(-1, "15:20:00") },

    { id: "DOC_D11", file_code: "TL-" + dCompact(-3) + "-002", order_id: "ORD_DEMO_06", order_code: ord6Code, survey_id: "", customer_name: "Showroom Mỹ Phẩm Lumiere", file_category: "DRAWING_3D", title_or_room: "Phối cảnh 3D Showroom Lumiere (Chờ duyệt 2D)", file_name: "3D_Showroom_Lumiere.pdf", mime_type: "application/pdf", file_size: 2980000, drive_file_id: "DEMO_3D_06", drive_url: "https://drive.google.com/drive/my-drive", uploaded_by: String(designer.id), uploaded_by_name: designer.full_name, notes: "Đợi KTS Hoàng Nam ký bản vẽ kỹ thuật 2D", created_at: dtStr(-3, "11:30:00") }
  ];
  app.Data.insertBatch(S.ORDER_FILES_PHOTOS.NAME, filesPhotos);

  // =========================================================================
  // 10. TEM QR KIỆN HÀNG ĐÓNG GÓI (PACKAGE_QR — 10 KIỆN SẴN SÀNG QUÉT QR)
  // =========================================================================
  var packageQrs = [
    { id: "QR_D01", qr_code: "PK-" + ord3Code + "-01", order_id: "ORD_DEMO_03", order_code: ord3Code, order_item_id: "ITM_D03_1", room_or_item: "Phòng Bếp — Tủ Bếp Dưới", package_index: 1, total_packages: 4, contents_desc: "Thùng tủ dưới MDF + khoang chậu Picomat", status: "PACKED", scanned_at: "", scanned_by_name: "", created_at: dtStr(-1, "16:35:00") },
    { id: "QR_D02", qr_code: "PK-" + ord3Code + "-02", order_id: "ORD_DEMO_03", order_code: ord3Code, order_item_id: "ITM_D03_1", room_or_item: "Phòng Bếp — Cánh Acrylic & Phụ kiện", package_index: 2, total_packages: 4, contents_desc: "12 cánh Acrylic Noline + bản lề Hafele", status: "PACKED", scanned_at: "", scanned_by_name: "", created_at: dtStr(-1, "16:35:00") },
    { id: "QR_D03", qr_code: "PK-" + ord3Code + "-03", order_id: "ORD_DEMO_03", order_code: ord3Code, order_item_id: "ITM_D03_2", room_or_item: "Phòng Khách — Vách Lam sóng & Kệ Tivi", package_index: 3, total_packages: 4, contents_desc: "Lam sóng cốt xanh + kệ Tivi 2.6m", status: "PACKED", scanned_at: "", scanned_by_name: "", created_at: dtStr(-1, "16:35:00") },
    { id: "QR_D04", qr_code: "PK-" + ord3Code + "-04", order_id: "ORD_DEMO_03", order_code: ord3Code, order_item_id: "ITM_D03_4", room_or_item: "Phòng Khách — Tủ Rượu Cánh Kính", package_index: 4, total_packages: 4, contents_desc: "Khung tủ rượu + 2 cánh kính cường lực", status: "PACKED", scanned_at: "", scanned_by_name: "", created_at: dtStr(-1, "16:35:00") },

    { id: "QR_D05", qr_code: "PK-" + ord2Code + "-01", order_id: "ORD_DEMO_02", order_code: ord2Code, order_item_id: "ITM_D02_1", room_or_item: "Bếp Villa — Tủ Bếp Gỗ Sồi Mỹ (Kiện 1/3)", package_index: 1, total_packages: 3, contents_desc: "Thùng tủ & cánh gỗ Sồi sơn PU mờ", status: "DELIVERED_SITE", scanned_at: dtStr(0, "08:00:00"), scanned_by_name: installer.full_name, created_at: dtStr(-2, "16:00:00") },
    { id: "QR_D06", qr_code: "PK-" + ord2Code + "-02", order_id: "ORD_DEMO_02", order_code: ord2Code, order_item_id: "ITM_D02_2", room_or_item: "Bếp Villa — Đảo Bếp & Phụ kiện Blum", package_index: 2, total_packages: 3, contents_desc: "Khung đảo bếp 2.2m + 2 tay nâng Blum HF", status: "DELIVERED_SITE", scanned_at: dtStr(0, "08:05:00"), scanned_by_name: installer.full_name, created_at: dtStr(-2, "16:00:00") },
    { id: "QR_D07", qr_code: "PK-" + ord2Code + "-03", order_id: "ORD_DEMO_02", order_code: ord2Code, order_item_id: "ITM_D02_3", room_or_item: "Walk-in Closet — Hệ Tủ Áo Cánh Kính", package_index: 3, total_packages: 3, contents_desc: "6 khoang tủ áo + 8 cánh kính khung nhôm đen", status: "DELIVERED_SITE", scanned_at: dtStr(0, "08:10:00"), scanned_by_name: installer.full_name, created_at: dtStr(-2, "16:00:00") },

    { id: "QR_D08", qr_code: "PK-" + ord1Code + "-01", order_id: "ORD_DEMO_01", order_code: ord1Code, order_item_id: "ITM_D01_1", room_or_item: "Bếp B12-08 — Trọn bộ Tủ bếp trên/dưới", package_index: 1, total_packages: 2, contents_desc: "Thùng MDF + Cánh Acrylic + Phụ kiện", status: "INSTALLED", scanned_at: dtStr(-3, "10:00:00"), scanned_by_name: installer.full_name, created_at: dtStr(-5, "17:00:00") },
    { id: "QR_D09", qr_code: "PK-" + ord1Code + "-02", order_id: "ORD_DEMO_01", order_code: ord1Code, order_item_id: "ITM_D01_3", room_or_item: "Ngủ Master — Tủ áo kịch trần & Giường 1m8", package_index: 2, total_packages: 2, contents_desc: "Tủ áo 2.4x2.65m + Giường bọc nỉ Bỉ", status: "INSTALLED", scanned_at: dtStr(-3, "10:15:00"), scanned_by_name: installer.full_name, created_at: dtStr(-5, "17:00:00") }
  ];
  app.Data.insertBatch(S.PACKAGE_QR.NAME, packageQrs);

  // =========================================================================
  // 11. PHIẾU BẢO HÀNH & SỬA CHỮA SAU BÀN GIAO (WARRANTY_TICKETS — 3 PHIẾU)
  // =========================================================================
  var warranties = [
    { id: "WRN_D01", ticket_code: "BH-" + dCompact(-1) + "-001", order_id: "ORD_DEMO_01", order_code: ord1Code, customer_id: "CUST_DEMO_01", customer_name: "Anh Trần Quốc Bảo", customer_phone: "'0909888777", site_address: customers[0].site_address, issue_desc: "Cánh tủ bếp trên khoang máy hút mùi hơi xệ nhẹ 2mm, cần cân chỉnh lại bản lề Hafele", assigned_tech_id: String(installer.id), assigned_tech_name: installer.full_name, before_drive_url: "", after_drive_url: "", repair_notes: "", cost_incurred: 0, status: "OPEN", reported_at: dtStr(-1, "14:20:00"), resolved_at: "", created_at: dtStr(-1, "14:20:00") },
    { id: "WRN_D02", ticket_code: "BH-" + dCompact(-2) + "-001", order_id: "ORD_DEMO_01", order_code: ord1Code, customer_id: "CUST_DEMO_01", customer_name: "Anh Trần Quốc Bảo", customer_phone: "'0909888777", site_address: customers[0].site_address, issue_desc: "Bổ sung nắp chụp nhựa thẩm mỹ cho 4 lỗ ốc cam bên hông tủ áo Master", assigned_tech_id: String(installer.id), assigned_tech_name: installer.full_name, before_drive_url: "", after_drive_url: "", repair_notes: "Đang hẹn khách qua xử lý lúc 15h hôm nay", cost_incurred: 0, status: "IN_PROGRESS", reported_at: dtStr(-2, "10:10:00"), resolved_at: "", created_at: dtStr(-2, "10:10:00") },
    { id: "WRN_D03", ticket_code: "BH-" + dCompact(-3) + "-001", order_id: "ORD_DEMO_01", order_code: ord1Code, customer_id: "CUST_DEMO_01", customer_name: "Anh Trần Quốc Bảo", customer_phone: "'0909888777", site_address: customers[0].site_address, issue_desc: "Thay cảm biến vẫy tay đèn LED dưới tủ bếp trên (phản hồi chậm)", assigned_tech_id: String(installer.id), assigned_tech_name: installer.full_name, before_drive_url: "", after_drive_url: "", repair_notes: "Đã thay mới cảm biến vẫy tay 12V miễn phí trong hạn bảo hành", cost_incurred: 180000, status: "RESOLVED", reported_at: dtStr(-3, "19:00:00"), resolved_at: dtStr(-2, "11:00:00"), created_at: dtStr(-3, "19:00:00") }
  ];
  app.Data.insertBatch(S.WARRANTY_TICKETS.NAME, warranties);

  // =========================================================================
  // 12. SỔ QUỸ THU CHI XƯỞNG (CASH_TRANSACTIONS — KHỚP 100% THANH TOÁN & CHI PHÍ)
  // =========================================================================
  var cashRows = [];
  var txSeq = 1;
  var pushTx = function(type, cat, channel, amt, ordId, ordCode, custName, desc, dayOff) {
    var n = String(txSeq++);
    while (n.length < 3) n = "0" + n;
    var txYmd = addCarpentryDaysYmd_(todayYmd, dayOff);
    cashRows.push({
      id: "TX_DEMO_" + n,
      tx_code: "TC-" + txYmd.replace(/-/g, "") + "-" + n,
      tx_type: type, category: cat, payment_channel: channel, amount: amt,
      order_id: ordId || "", order_code: ordCode || "", customer_name: custName || "",
      description: desc, performed_by: String(accountant.id), performed_by_name: accountant.full_name,
      tx_date: txYmd, created_at: txYmd + " 14:30:00"
    });
  };

  // Các phiếu THU khớp các đợt đã thanh toán
  pushTx("IN", "ORDER_PAYMENT", "BANK_TRANSFER", 21928000, "ORD_DEMO_01", ord1Code, "Anh Trần Quốc Bảo", "Thu tiền Đợt 1 — Ký HĐ chốt cọc (" + ord1Code + ")", -16);
  pushTx("IN", "ORDER_PAYMENT", "BANK_QR", 21928000, "ORD_DEMO_01", ord1Code, "Anh Trần Quốc Bảo", "Thu tiền Đợt 2 — Xong QC trước giao (" + ord1Code + ")", -5);
  pushTx("IN", "ORDER_PAYMENT", "BANK_TRANSFER", 10964000, "ORD_DEMO_01", ord1Code, "Anh Trần Quốc Bảo", "Thu tiền Đợt 3 — Nghiệm thu hoàn tất (" + ord1Code + ")", -3);

  pushTx("IN", "ORDER_PAYMENT", "BANK_TRANSFER", 57000000, "ORD_DEMO_02", ord2Code, "Chị Nguyễn Ngọc Hân", "Thu tiền Đợt 1 — Ký HĐ chốt cọc (" + ord2Code + ")", -12);
  pushTx("IN", "ORDER_PAYMENT", "BANK_QR", 57000000, "ORD_DEMO_02", ord2Code, "Chị Nguyễn Ngọc Hân", "Thu tiền Đợt 2 — Xong QC trước giao (" + ord2Code + ")", -2);

  pushTx("IN", "ORDER_PAYMENT", "BANK_TRANSFER", 27360000, "ORD_DEMO_03", ord3Code, "Anh Lê Hoàng Phúc", "Thu tiền Đợt 1 — Ký HĐ chốt cọc (" + ord3Code + ")", -9);
  pushTx("IN", "ORDER_PAYMENT", "BANK_TRANSFER", 34400000, "ORD_DEMO_04", ord4Code, "Công ty TNHH Kiến Trúc Mộc An", "Thu tiền Đợt 1 — Ký HĐ chốt cọc (" + ord4Code + ")", -8);
  pushTx("IN", "ORDER_PAYMENT", "BANK_QR", 29680000, "ORD_DEMO_05", ord5Code, "Chị Phạm Thu Thảo", "Thu tiền Đợt 1 — Ký HĐ chốt cọc (" + ord5Code + ")", -6);
  pushTx("IN", "ORDER_PAYMENT", "BANK_TRANSFER", 36800000, "ORD_DEMO_06", ord6Code, "Showroom Mỹ Phẩm Lumiere", "Thu tiền Đợt 1 — Ký HĐ chốt cọc (" + ord6Code + ")", -4);

  // Các phiếu CHI nhập ván gỗ, phụ kiện & vận chuyển lắp đặt
  pushTx("OUT", "MATERIAL_PURCHASE", "BANK_TRANSFER", 62400000, "", "", "Tổng kho An Cường", "Nhập lô 120 tấm MDF chống ẩm 17mm 388 EV (+Nhập 120 Tấm)", -15);
  pushTx("OUT", "MATERIAL_PURCHASE", "BANK_TRANSFER", 38400000, "", "", "Tổng kho An Cường", "Nhập 30 tấm MDF Acrylic Noline PARC 01 (+Nhập 30 Tấm)", -12);
  pushTx("OUT", "MATERIAL_PURCHASE", "BANK_TRANSFER", 37000000, "", "", "Gỗ Mỹ Nhập Khẩu", "Nhập 2m3 Gỗ Sồi Mỹ xẻ sấy FAS 25mm (+Nhập 2 m3)", -11);
  pushTx("OUT", "MATERIAL_PURCHASE", "BANK_TRANSFER", 18900000, "", "", "Đại lý Hafele / Blum", "Nhập phụ kiện bản lề Inox 304, ray Eurogold & tay nâng Blum", -10);
  pushTx("OUT", "DELIVERY_INSTALL_COST", "CASH", 2800000, "ORD_DEMO_01", ord1Code, "Anh Trần Quốc Bảo", "Chi xe tải vận chuyển & bốc xếp lắp đặt Căn hộ B12-08", -3);
  pushTx("OUT", "DELIVERY_INSTALL_COST", "CASH", 6500000, "ORD_DEMO_02", ord2Code, "Chị Nguyễn Ngọc Hân", "Chi xe tải 2.5T & nhân công lắp đặt Biệt thự Thảo Điền", 0);
  pushTx("OUT", "WORKSHOP_LABOR", "BANK_TRANSFER", 24000000, "", "", "Tổ sản xuất xưởng", "Tạm ứng lương thợ mộc, thợ CNC & tổ sơn PU giữa tháng", -1);

  app.Data.insertBatch(S.CASH_TRANSACTIONS.NAME, cashRows);

  app.Audit.log({
    actor: actor,
    action: "SEED_DEMO_DATA",
    entity_type: "SYSTEM",
    entity_id: "CARPENTRY_DEMO",
    after: {
      catalog: catalogRows.length,
      customers: customers.length,
      surveys: surveys.length,
      orders: orders.length,
      items: orderItems.length,
      payments: payments.length,
      materials: orderMaterials.length,
      files: filesPhotos.length,
      packages_qr: packageQrs.length,
      warranties: warranties.length,
      cash_transactions: cashRows.length
    },
    message: "Nạp bộ danh mục & dữ liệu demo hoàn chỉnh cho 12 bảng Xưởng Mộc"
  });

  return {
    staff_created: staffInit.createdUsers,
    counts: {
      catalog: catalogRows.length,
      customers: customers.length,
      surveys: surveys.length,
      orders: orders.length,
      order_items: orderItems.length,
      production_progress: progressLogs.length,
      order_payments: payments.length,
      order_materials: orderMaterials.length,
      order_files_photos: filesPhotos.length,
      package_qr: packageQrs.length,
      warranty_tickets: warranties.length,
      cash_transactions: cashRows.length
    },
    sample_qr_codes: [packageQrs[0].qr_code, packageQrs[4].qr_code, ord3Code]
  };
}

/**
 * RPC dành riêng cho Quản trị viên (Admin) để nạp dữ liệu mẫu khi cần demo/chụp hình.
 */
function apiSeedCarpentryDemoData(token, options) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.require("*");
    var result = app.Utils.withLock(function() {
      var data = seedCarpentryDemoDataCore_(app, actor, options);
      return app.Utils.buildResponse(true, data, "Đã nạp đầy đủ danh mục & dữ liệu mẫu cho 12 bảng Xưởng Mộc!");
    }, 25000);
    return toRpcJson_(result);
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "SEED_DEMO_ERROR"));
  }
}

/**
 * Hàm chạy trực tiếp trong Google Apps Script Editor (Run -> seedCarpentryDemoData)
 */
function seedCarpentryDemoData() {
  var app = getCore_("");
  var adminActor = { id: "USR001", username: "admin", full_name: "Quản trị viên Hệ thống", is_admin: true, permissions: ["*"] };
  return seedCarpentryDemoDataCore_(app, adminActor, { reset: true });
}
