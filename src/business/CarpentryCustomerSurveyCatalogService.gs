/**
 * CarpentryCustomerSurveyCatalogService.gs
 * - Meta Xưởng (`apiGetCarpentryMeta`)
 * - Quản lý Khách hàng / Chủ đầu tư / KTS đối tác & Công trình (`apiGetCustomers`, `apiSaveCustomer`, `apiGetCustomerDetail`)
 * - Khảo sát & Đo đạc kích thước công trình (`apiGetSurveys`, `apiSaveSurvey`)
 * - Danh mục Hạng mục Báo giá mẫu (md/m2/cái) & Kho Ván gỗ / Phụ kiện (`apiGetMaterialCatalog`, `apiSaveMaterialCatalog`)
 */

function apiGetCarpentryMeta(token, options) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.requireAny([
      "customer.view", "customer.manage", "survey.create", "quotation.create", "order.view",
      "order.view_all", "drawing.view", "drawing.upload", "photo.upload",
      "production.stage_update", "package.qr_print", "material.estimate", "material.issue",
      "material.expense_create", "payment.create", "debt.view", "delivery.update",
      "acceptance.sign", "warranty.manage", "cash.view", "report.view", "profit_report.view",
      "menu.surveys", "menu.orders", "menu.drawings", "menu.production",
      "menu.materials", "menu.payments", "menu.install_warranty", "menu.customers", "menu.reports_cash"
    ]);
    options = options || {};
    var reqSections = Array.isArray(options.sections) && options.sections.length > 0 ? options.sections : null;
    var want = function(name) { return !reqSections || reqSections.indexOf(name) !== -1; };

    var policy = getCarpentryPolicyConfig_(app);
    var canReadCustomers = actorHasAnyPerm_(actor, [
      "customer.view", "customer.manage", "survey.create", "quotation.create",
      "order.view", "order.view_all", "menu.customers", "menu.surveys", "menu.orders"
    ]);
    var canReadCatalog = actorHasAnyPerm_(actor, [
      "quotation.create", "material.estimate", "material.issue", "material.expense_create",
      "order.approve", "menu.materials", "menu.reports_cash", "menu.orders"
    ]);
    var canSeeCost = actorHasAnyPerm_(actor, ["profit_report.view", "material.expense_create", "order.approve", "material.issue"]);
    var canReadStaff = actorHasAnyPerm_(actor, ["order.approve", "quotation.approve", "warranty.manage", "delivery.update", "users.view"]);

    var customers = (want("customers") && canReadCustomers)
      ? app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.CUSTOMERS.NAME)
          .filter(function(c) { return c && c.id && c.status !== "INACTIVE"; })
          .map(function(c) {
            return {
              id: c.id,
              customer_code: c.customer_code,
              full_name: c.full_name,
              phone: formatCarpentryPhone_(c.phone),
              site_address: c.site_address,
              project_type: c.project_type,
              partner_name: c.partner_name
            };
          })
      : [];

    var catalog = (want("catalog") && canReadCatalog)
      ? app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.MATERIAL_CATALOG.NAME)
          .filter(function(m) { return m && m.id && m.status !== "INACTIVE"; })
          .map(function(m) {
            return Object.assign({}, m, {
              default_cost_price: canSeeCost ? (Number(m.default_cost_price) || 0) : null,
              default_sell_price: Number(m.default_sell_price) || 0,
              stock_qty: Number(m.stock_qty) || 0,
              min_stock_qty: Number(m.min_stock_qty) || policy.lowStockThresholdDefault
            });
          })
      : [];

    var staffList = (want("staff_list") && canReadStaff)
      ? app.Data.getAll("USERS")
          .filter(function(u) { return u && u.id && u.status !== "LOCKED"; })
          .map(function(u) { return { id: u.id, username: u.username, full_name: u.full_name || u.username }; })
      : [];

    return toRpcJson_(app.Utils.buildResponse(true, {
      today: getCarpentryTodayYmd_(app),
      policy: policy,
      project_types: CARPENTRY_CONSTANTS.PROJECT_TYPES,
      lead_sources: CARPENTRY_CONSTANTS.LEAD_SOURCES,
      item_categories: CARPENTRY_CONSTANTS.ITEM_CATEGORIES,
      calc_modes: CARPENTRY_CONSTANTS.CALC_MODES,
      order_statuses: CARPENTRY_CONSTANTS.ORDER_STATUSES,
      file_categories: CARPENTRY_CONSTANTS.FILE_CATEGORIES,
      payment_channels: CARPENTRY_CONSTANTS.PAYMENT_CHANNELS,
      customers: customers,
      catalog: catalog,
      staff_list: staffList
    }, "Tải dữ liệu cấu hình xưởng mộc thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "CARPENTRY_META_ERROR"));
  }
}

function apiGetCustomers(token, filters, page, pageSize) {
  var app = getCore_(token);
  try {
    app.Authorization.requireAny(["customer.view", "survey.create", "quotation.create", "order.view", "menu.customers"]);
    filters = filters || {};
    var policy = getCarpentryPolicyConfig_(app);
    var kw = String(filters.keyword || "").trim().toLowerCase();
    var pType = String(filters.project_type || "").trim().toUpperCase();

    var rows = app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.CUSTOMERS.NAME);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i];
      if (!c || !c.id) continue;
      if (pType && pType !== "ALL" && String(c.project_type || "").toUpperCase() !== pType) continue;
      var phoneDisp = formatCarpentryPhone_(c.phone);
      if (kw) {
        var hit = String(c.customer_code || "").toLowerCase().indexOf(kw) !== -1 ||
                  String(c.full_name || "").toLowerCase().indexOf(kw) !== -1 ||
                  phoneDisp.toLowerCase().indexOf(kw) !== -1 ||
                  String(c.site_address || "").toLowerCase().indexOf(kw) !== -1 ||
                  String(c.partner_name || "").toLowerCase().indexOf(kw) !== -1;
        if (!hit) continue;
      }
      out.push(Object.assign({}, c, {
        phone: phoneDisp,
        total_orders: Number(c.total_orders) || 0,
        total_contract_value: Number(c.total_contract_value) || 0,
        total_paid: Number(c.total_paid) || 0,
        debt_balance: Number(c.debt_balance) || 0
      }));
    }
    out.reverse();

    var paged = app.Data.paginate(out, page || 1, pageSize || policy.defaultPageSize);
    return toRpcJson_(app.Utils.buildResponse(true, { items: paged.items, pagination: paged.pagination, total: paged.pagination.total }, "Tải danh sách chủ đầu tư thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "CUSTOMER_LIST_ERROR"));
  }
}

function apiSaveCustomer(token, dto) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.require("customer.manage");
    dto = dto || {};
    var fullName = String(dto.full_name || "").trim();
    var phoneRaw = String(dto.phone || "").trim();
    if (!fullName || !phoneRaw) {
      return toRpcJson_(app.Utils.buildResponse(false, null, "Tên chủ đầu tư và Số điện thoại là bắt buộc.", "MISSING_REQUIRED"));
    }

    var sheet = PROJECT_CONFIG.BUSINESS_SHEETS.CUSTOMERS.NAME;
    var allRows = app.Data.getAll(sheet);
    var isUpdate = !!String(dto.id || "").trim();
    var dup = allRows.find(function(r) {
      return r && String(r.id) !== String(dto.id || "") && formatCarpentryPhone_(r.phone) === formatCarpentryPhone_(phoneRaw);
    });
    if (dup) {
      return toRpcJson_(app.Utils.buildResponse(false, null, "SĐT '" + formatCarpentryPhone_(phoneRaw) + "' đã thuộc khách hàng " + dup.customer_code + " (" + dup.full_name + ").", "DUPLICATE_PHONE"));
    }

    var nowStr = getCarpentryNowStr_(app);
    var normPhone = normalizeCarpentryPhone_(phoneRaw);
    var phoneDisp = formatCarpentryPhone_(normPhone);

    var fields = {
      full_name: fullName,
      phone: normPhone,
      site_address: String(dto.site_address || "").trim(),
      project_type: String(dto.project_type || "APARTMENT").trim().toUpperCase(),
      lead_source: String(dto.lead_source || "DIRECT_REFERRAL").trim().toUpperCase(),
      partner_name: String(dto.partner_name || "").trim(),
      site_notes: String(dto.site_notes || "").trim(),
      notes: String(dto.notes || "").trim(),
      status: String(dto.status || "ACTIVE").trim().toUpperCase(),
      updated_at: nowStr
    };

    if (isUpdate) {
      var ok = app.Data.updateById(sheet, dto.id, fields);
      if (!ok) return toRpcJson_(app.Utils.buildResponse(false, null, "Không tìm thấy khách hàng.", "NOT_FOUND"));
      app.Audit.log({ actor: actor, action: "UPDATE", entity_type: sheet, entity_id: dto.id, after: fields, message: "Cập nhật chủ đầu tư " + fullName });
      return toRpcJson_(app.Utils.buildResponse(true, Object.assign({ id: dto.id }, fields, { phone: phoneDisp }), "Đã cập nhật hồ sơ chủ đầu tư!"));
    }

    var newRow = Object.assign({
      id: app.Utils.generateUUID(),
      customer_code: app.Utils.nextCode(allRows, "customer_code", "KH-", 5),
      total_orders: 0,
      total_contract_value: 0,
      total_paid: 0,
      debt_balance: 0,
      created_at: nowStr
    }, fields);
    app.Data.insertOne(sheet, newRow);
    app.Audit.log({ actor: actor, action: "CREATE", entity_type: sheet, entity_id: newRow.id, entity_number: newRow.customer_code, after: newRow, message: "Thêm chủ đầu tư " + fullName });
    return toRpcJson_(app.Utils.buildResponse(true, Object.assign({}, newRow, { phone: phoneDisp }), "Đã thêm chủ đầu tư " + newRow.customer_code + "!"));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "CUSTOMER_SAVE_ERROR"));
  }
}

function apiGetCustomerDetail(token, idOrCode) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.requireAny(["customer.view", "order.view", "order.view_all", "debt.view"]);
    var key = String(idOrCode || "").trim();
    var policy = getCarpentryPolicyConfig_(app);
    var todayYmd = getCarpentryTodayYmd_(app);

    var cust = app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.CUSTOMERS.NAME, function(c) {
      return String(c.id) === key || String(c.customer_code || "").toUpperCase() === key.toUpperCase();
    });
    if (!cust) return toRpcJson_(app.Utils.buildResponse(false, null, "Không tìm thấy hồ sơ khách hàng.", "NOT_FOUND"));

    var orders = app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME, function(o) {
      return String(o.customer_id) === String(cust.id);
    }).map(function(o) { return sanitizeOrderForActor_(enrichFurnitureOrderRow_(o, todayYmd, policy), actor); }).reverse();

    var surveys = app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.CARPENTRY_SURVEYS.NAME, function(s) {
      return String(s.customer_id) === String(cust.id);
    }).reverse();

    return toRpcJson_(app.Utils.buildResponse(true, {
      customer: Object.assign({}, cust, { phone: formatCarpentryPhone_(cust.phone) }),
      orders: orders,
      surveys: surveys
    }, "Tải hồ sơ chủ đầu tư thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "CUSTOMER_DETAIL_ERROR"));
  }
}

function apiGetSurveys(token, filters, page, pageSize) {
  var app = getCore_(token);
  try {
    app.Authorization.requireAny(["survey.create", "quotation.create", "order.view", "order.view_all", "menu.surveys"]);
    filters = filters || {};
    var policy = getCarpentryPolicyConfig_(app);
    var kw = String(filters.keyword || "").trim().toLowerCase();
    var st = String(filters.status || "").trim().toUpperCase();

    var rows = app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.CARPENTRY_SURVEYS.NAME);
    var out = rows.filter(function(r) {
      if (!r || !r.id) return false;
      if (st && st !== "ALL" && String(r.status || "").toUpperCase() !== st) return false;
      var phoneDisp = formatCarpentryPhone_(r.customer_phone);
      if (!kw) return true;
      return String(r.survey_code || "").toLowerCase().indexOf(kw) !== -1 ||
             String(r.customer_name || "").toLowerCase().indexOf(kw) !== -1 ||
             phoneDisp.toLowerCase().indexOf(kw) !== -1 ||
             String(r.site_address || "").toLowerCase().indexOf(kw) !== -1 ||
             String(r.survey_area || "").toLowerCase().indexOf(kw) !== -1;
    }).map(function(r) {
      return Object.assign({}, r, { customer_phone: formatCarpentryPhone_(r.customer_phone) });
    }).reverse();

    var paged = app.Data.paginate(out, page || 1, pageSize || policy.defaultPageSize);
    return toRpcJson_(app.Utils.buildResponse(true, { items: paged.items, pagination: paged.pagination, total: paged.pagination.total }, "Tải danh sách phiếu khảo sát thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "SURVEY_LIST_ERROR"));
  }
}

function apiSaveSurvey(token, dto) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.require("survey.create");
    dto = dto || {};
    var custKey = String(dto.customer_id || "").trim();
    var cust = app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.CUSTOMERS.NAME, function(c) {
      return String(c.id) === custKey || String(c.customer_code || "").toUpperCase() === custKey.toUpperCase();
    });
    if (!cust) return toRpcJson_(app.Utils.buildResponse(false, null, "Vui lòng chọn Chủ đầu tư trước khi lưu phiếu khảo sát.", "CUSTOMER_NOT_FOUND"));

    var area = String(dto.survey_area || "").trim();
    var meas = String(dto.measurements_summary || "").trim();
    if (!area || !meas) return toRpcJson_(app.Utils.buildResponse(false, null, "Vui lòng nhập Khu vực đo và Kích thước ghi nhận.", "MISSING_REQUIRED"));

    var todayYmd = getCarpentryTodayYmd_(app);
    var nowStr = getCarpentryNowStr_(app);
    var sheet = PROJECT_CONFIG.BUSINESS_SHEETS.CARPENTRY_SURVEYS.NAME;
    var code = generateDailyCarpentryCode_(app.Data.getAll(sheet), "survey_code", "KS", todayYmd);

    var row = {
      id: app.Utils.generateUUID(),
      survey_code: code,
      customer_id: cust.id,
      customer_code: cust.customer_code,
      customer_name: cust.full_name,
      customer_phone: cust.phone,
      site_address: String(dto.site_address || cust.site_address || "").trim(),
      survey_area: area,
      measurements_summary: meas,
      site_constraints: String(dto.site_constraints || "").trim(),
      surveyed_by_id: String(actor.id),
      surveyed_by_name: String(actor.full_name || actor.username),
      survey_date: String(dto.survey_date || todayYmd).substring(0, 10),
      linked_order_id: "",
      linked_order_code: "",
      status: "DRAFT",
      notes: String(dto.notes || "").trim(),
      created_at: nowStr
    };
    app.Data.insertOne(sheet, row);

    var savedPhoto = null;
    if (dto.photo_base64) {
      var drv = saveCarpentryFileToDrive_(app, dto.photo_base64, "SURVEY_" + (dto.photo_file_name || (code + ".jpg")), dto.photo_mime_type, code);
      savedPhoto = {
        id: app.Utils.generateUUID(),
        file_code: generateDailyCarpentryCode_(app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_FILES_PHOTOS.NAME), "file_code", "TL", todayYmd),
        order_id: "",
        order_code: "",
        survey_id: row.id,
        customer_name: cust.full_name,
        file_category: "SURVEY_PHOTO",
        title_or_room: area,
        file_name: drv.file_name,
        mime_type: drv.mime_type,
        file_size: drv.file_size,
        drive_file_id: drv.drive_file_id,
        drive_url: drv.drive_url,
        uploaded_by: String(actor.id),
        uploaded_by_name: String(actor.full_name || actor.username),
        notes: "Ảnh đo đạc từ phiếu " + code,
        created_at: nowStr
      };
      app.Data.insertOne(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_FILES_PHOTOS.NAME, savedPhoto);
    }

    app.Audit.log({ actor: actor, action: "CREATE_SURVEY", entity_type: sheet, entity_id: row.id, entity_number: code, after: row, message: "Khảo sát đo đạc " + area + " cho " + cust.full_name });
    return toRpcJson_(app.Utils.buildResponse(true, {
      survey: Object.assign({}, row, { customer_phone: formatCarpentryPhone_(cust.phone) }),
      photo: savedPhoto
    }, "Đã lưu phiếu khảo sát đo đạc " + code + "!"));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "SURVEY_SAVE_ERROR"));
  }
}

function apiGetMaterialCatalog(token, filters, page, pageSize) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.requireAny([
      "quotation.create", "material.estimate", "material.issue",
      "material.expense_create", "order.approve", "menu.materials", "menu.reports_cash"
    ]);
    var canSeeCost = actorHasAnyPerm_(actor, ["profit_report.view", "material.expense_create", "order.approve", "material.issue"]);
    filters = filters || {};
    var policy = getCarpentryPolicyConfig_(app);
    var kind = String(filters.catalog_kind || "").trim().toUpperCase();
    var cat = String(filters.category || "").trim().toUpperCase();
    var kw = String(filters.keyword || "").trim().toLowerCase();
    var lowOnly = String(filters.low_stock || "").toUpperCase() === "TRUE";

    var rows = app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.MATERIAL_CATALOG.NAME);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var m = rows[i];
      if (!m || !m.id) continue;
      if (kind && kind !== "ALL" && String(m.catalog_kind || "").toUpperCase() !== kind) continue;
      if (cat && cat !== "ALL" && String(m.category || "").toUpperCase() !== cat) continue;
      var qty = Number(m.stock_qty) || 0;
      var minQ = Number(m.min_stock_qty) || policy.lowStockThresholdDefault;
      if (lowOnly && (m.catalog_kind === "ITEM_TEMPLATE" || qty > minQ)) continue;
      if (kw) {
        var hit = String(m.material_code || "").toLowerCase().indexOf(kw) !== -1 ||
                  String(m.item_name || "").toLowerCase().indexOf(kw) !== -1 ||
                  String(m.spec_material || "").toLowerCase().indexOf(kw) !== -1;
        if (!hit) continue;
      }
      out.push(Object.assign({}, m, {
        default_cost_price: canSeeCost ? (Number(m.default_cost_price) || 0) : null,
        default_sell_price: Number(m.default_sell_price) || 0,
        stock_qty: qty,
        min_stock_qty: minQ,
        is_low_stock: m.catalog_kind !== "ITEM_TEMPLATE" && qty <= minQ
      }));
    }

    var paged = app.Data.paginate(out, page || 1, pageSize || policy.defaultPageSize);
    return toRpcJson_(app.Utils.buildResponse(true, { items: paged.items, pagination: paged.pagination, total: paged.pagination.total }, "Tải danh mục vật tư & hạng mục thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "CATALOG_LIST_ERROR"));
  }
}

function apiSaveMaterialCatalog(token, dto) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.requireAny(["order.approve", "material.expense_create"]);
    dto = dto || {};
    var name = String(dto.item_name || "").trim();
    if (!name) return toRpcJson_(app.Utils.buildResponse(false, null, "Tên vật tư / hạng mục không được để trống.", "MISSING_NAME"));

    var kind = String(dto.catalog_kind || "RAW_MATERIAL").trim().toUpperCase() === "ITEM_TEMPLATE" ? "ITEM_TEMPLATE" : "RAW_MATERIAL";
    var sheet = PROJECT_CONFIG.BUSINESS_SHEETS.MATERIAL_CATALOG.NAME;
    var allRows = app.Data.getAll(sheet);
    var nowStr = getCarpentryNowStr_(app);
    var isUpdate = !!String(dto.id || "").trim();

    var fields = {
      catalog_kind: kind,
      category: String(dto.category || (kind === "ITEM_TEMPLATE" ? "KITCHEN" : "BOARD_WOOD")).trim().toUpperCase(),
      item_name: name,
      spec_material: String(dto.spec_material || "").trim(),
      calc_mode: String(dto.calc_mode || (kind === "ITEM_TEMPLATE" ? "MD" : "UNIT")).trim().toUpperCase(),
      unit: String(dto.unit || (kind === "ITEM_TEMPLATE" ? "md" : "Tấm")).trim(),
      default_cost_price: Math.max(0, Number(dto.default_cost_price) || 0),
      default_sell_price: Math.max(0, Number(dto.default_sell_price) || 0),
      stock_qty: Math.max(0, Number(dto.stock_qty) || 0),
      min_stock_qty: Math.max(0, Number(dto.min_stock_qty) || 5),
      notes: String(dto.notes || "").trim(),
      status: String(dto.status || "ACTIVE").trim().toUpperCase(),
      updated_at: nowStr
    };

    if (isUpdate) {
      app.Data.updateById(sheet, dto.id, fields);
      app.Audit.log({ actor: actor, action: "UPDATE", entity_type: sheet, entity_id: dto.id, after: fields, message: "Cập nhật danh mục " + name });
      return toRpcJson_(app.Utils.buildResponse(true, Object.assign({ id: dto.id }, fields), "Đã cập nhật danh mục '" + name + "'!"));
    }

    var prefix = kind === "ITEM_TEMPLATE" ? "HM" : "VT";
    var newRow = Object.assign({
      id: app.Utils.generateUUID(),
      material_code: String(dto.material_code || "").trim().toUpperCase() || app.Utils.nextCode(allRows, "material_code", prefix, 4)
    }, fields);
    app.Data.insertOne(sheet, newRow);
    app.Audit.log({ actor: actor, action: "CREATE", entity_type: sheet, entity_id: newRow.id, entity_number: newRow.material_code, after: newRow, message: "Thêm mới " + newRow.material_code + " - " + name });
    return toRpcJson_(app.Utils.buildResponse(true, newRow, "Đã thêm '" + name + "' (" + newRow.material_code + ")!"));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "CATALOG_SAVE_ERROR"));
  }
}
