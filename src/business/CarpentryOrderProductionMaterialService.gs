/**
 * CarpentryOrderProductionMaterialService.gs
 * - Báo giá & Đơn hàng may đo (tính linh hoạt theo md / m2 / cái & tự chia Đợt thanh toán)
 * - Duyệt bản vẽ & Ra lệnh sản xuất tại xưởng
 * - Upload Bản vẽ 2D/3D & Ảnh hiện trạng/QC/Nghiệm thu lên Google Drive (`ORDER_FILES_PHOTOS`)
 * - Dự trù & Xuất kho vật tư ván/phụ kiện trừ tồn & tự tính Biên lợi nhuận công trình (`ORDER_MATERIALS`)
 * - Cập nhật 6 công đoạn sản xuất tại xưởng & tự kích hoạt nhắc thu Đợt 2 khi xong QC
 * - Tạo & Quét Tem QR Kiện hàng (`PACKAGE_QR`) gắn thẳng link Bản vẽ Drive cho thợ lắp đặt
 */

function recalculateOrderFinancials_(app, orderId, nowStr, preloadedOrder) {
  var ordSheet = PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME;
  var ord = preloadedOrder || app.Data.findRow(ordSheet, function(o) { return String(o.id) === String(orderId); });
  if (!ord) return null;

  var mats = app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_MATERIALS.NAME, function(m) { return String(m.order_id) === String(orderId); });
  var matCost = 0;
  for (var i = 0; i < mats.length; i++) {
    matCost += Number(mats[i].total_cost) || 0;
  }

  var txs = app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.CASH_TRANSACTIONS.NAME, function(t) {
    return String(t.order_id) === String(orderId) && t.tx_type === "OUT";
  });
  var extraCost = 0;
  for (var j = 0; j < txs.length; j++) {
    extraCost += Number(txs[j].amount) || 0;
  }

  var totalAmt = Number(ord.total_amount) || 0;
  var grossProfit = totalAmt - matCost - extraCost;
  var marginPct = totalAmt > 0 ? Number(((grossProfit / totalAmt) * 100).toFixed(1)) : 0;

  app.Data.updateById(ordSheet, ord.id, {
    material_cost_total: matCost,
    labor_extra_cost: extraCost,
    gross_profit: grossProfit,
    gross_margin_pct: marginPct,
    updated_at: nowStr
  });
  return { material_cost_total: matCost, labor_extra_cost: extraCost, gross_profit: grossProfit, gross_margin_pct: marginPct };
}

function apiGetFurnitureOrders(token, filters, page, pageSize) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.requireAny([
      "order.view", "order.view_all", "quotation.create", "production.stage_update",
      "drawing.view", "material.estimate", "material.issue",
      "payment.create", "debt.view", "delivery.update", "acceptance.sign",
      "menu.orders", "menu.production", "menu.drawings", "menu.materials", "menu.install_warranty"
    ]);
    filters = filters || {};
    var policy = getCarpentryPolicyConfig_(app);
    var todayYmd = getCarpentryTodayYmd_(app);
    var st = String(filters.status || "").trim().toUpperCase();
    var statusList = null;
    if (Array.isArray(filters.statuses) && filters.statuses.length > 0) {
      statusList = filters.statuses.map(function(x) { return String(x || "").trim().toUpperCase(); }).filter(Boolean);
    } else if (typeof filters.statuses === "string" && filters.statuses.trim()) {
      statusList = filters.statuses.split(",").map(function(x) { return String(x || "").trim().toUpperCase(); }).filter(Boolean);
    }
    var kw = String(filters.keyword || "").trim().toLowerCase();
    var urgentOnly = String(filters.urgent_only || "").toUpperCase() === "TRUE";
    var awaitingDraw = String(filters.awaiting_drawing || "").toUpperCase() === "TRUE";
    var includeItems = filters.include_items === true || String(filters.include_items || "").toUpperCase() === "TRUE";

    var rows = app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var raw = rows[i];
      if (!raw || !raw.id) continue;
      var eo = enrichFurnitureOrderRow_(raw, todayYmd, policy);
      if (statusList && statusList.length > 0) {
        if (statusList.indexOf(eo.status) === -1) continue;
      } else if (st && st !== "ALL" && eo.status !== st) {
        continue;
      }
      if (urgentOnly && !eo.is_urgent_delay && !eo.is_late) continue;
      if (awaitingDraw && eo.drawing_status === "APPROVED") continue;
      if (kw) {
        var hit = String(eo.order_code || "").toLowerCase().indexOf(kw) !== -1 ||
                  String(eo.customer_name || "").toLowerCase().indexOf(kw) !== -1 ||
                  String(eo.customer_phone || "").toLowerCase().indexOf(kw) !== -1 ||
                  String(eo.site_address || "").toLowerCase().indexOf(kw) !== -1 ||
                  String(eo.title || "").toLowerCase().indexOf(kw) !== -1;
        if (!hit) continue;
      }
      out.push(sanitizeOrderForActor_(eo, actor));
    }
    out.reverse();

    var paged = app.Data.paginate(out, page || 1, pageSize || policy.defaultPageSize);
    var pagedItems = paged.items;
    if (includeItems && pagedItems.length > 0) {
      var idSet = {};
      for (var pi = 0; pi < pagedItems.length; pi++) idSet[String(pagedItems[pi].id)] = true;
      var allOrdItems = app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_ITEMS.NAME);
      var byOrderId = {};
      for (var ai = 0; ai < allOrdItems.length; ai++) {
        var it = allOrdItems[ai];
        if (!it || !it.id) continue;
        var oidKey = String(it.order_id);
        if (!idSet[oidKey]) continue;
        if (!byOrderId[oidKey]) byOrderId[oidKey] = [];
        byOrderId[oidKey].push(it);
      }
      pagedItems = pagedItems.map(function(o) {
        return Object.assign({}, o, { items: byOrderId[String(o.id)] || [] });
      });
    }

    return toRpcJson_(app.Utils.buildResponse(true, { items: pagedItems, pagination: paged.pagination, total: paged.pagination.total }, "Tải danh sách đơn hàng xưởng thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "ORDER_LIST_ERROR"));
  }
}

function apiGetFurnitureOrderDetail(token, idOrCode, options) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.requireAny([
      "order.view", "order.view_all", "drawing.view", "production.stage_update",
      "material.estimate", "material.issue", "payment.create", "debt.view",
      "delivery.update", "acceptance.sign", "warranty.manage"
    ]);
    options = options || {};
    var reqSections = Array.isArray(options.sections) && options.sections.length > 0 ? options.sections : null;
    var want = function(name) { return !reqSections || reqSections.indexOf(name) !== -1; };

    var key = String(idOrCode || "").trim();
    var policy = getCarpentryPolicyConfig_(app);
    var todayYmd = getCarpentryTodayYmd_(app);

    var ord = app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME, function(o) {
      return String(o.id) === key || String(o.order_code || "").toUpperCase() === key.toUpperCase();
    });
    if (!ord) return toRpcJson_(app.Utils.buildResponse(false, null, "Không tìm thấy đơn hàng.", "NOT_FOUND"));

    var oid = String(ord.id);
    var canSeePayments = actorHasAnyPerm_(actor, ["order.view_all", "payment.create", "debt.view", "quotation.create", "acceptance.sign"]);
    var canSeeFiles = actorHasAnyPerm_(actor, ["drawing.view", "drawing.upload", "photo.upload", "order.view", "order.view_all", "delivery.update", "package.qr_print"]);
    var canSeeMaterials = actorHasAnyPerm_(actor, ["material.estimate", "material.issue", "material.expense_create", "profit_report.view", "order.view_all"]);
    var canSeeMatCost = actorHasAnyPerm_(actor, ["profit_report.view", "material.issue", "material.estimate", "material.expense_create"]);

    var items = want("items")
      ? app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_ITEMS.NAME, function(x) { return String(x.order_id) === oid; })
      : [];
    var payments = (want("payments") && canSeePayments)
      ? app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_PAYMENTS.NAME, function(p) { return String(p.order_id) === oid; })
      : [];
    var materials = (want("materials") && canSeeMaterials)
      ? app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_MATERIALS.NAME, function(m) { return String(m.order_id) === oid; }).map(function(m) {
          return canSeeMatCost ? m : Object.assign({}, m, { unit_cost: null, total_cost: null });
        }).reverse()
      : [];
    var filesPhotos = (want("files_photos") && canSeeFiles)
      ? app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_FILES_PHOTOS.NAME, function(f) { return String(f.order_id) === oid; }).reverse()
      : [];
    var logs = want("progress_logs")
      ? app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.PRODUCTION_PROGRESS.NAME, function(l) { return String(l.order_id) === oid; }).reverse()
      : [];
    var pkgQrs = want("packages_qr")
      ? app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.PACKAGE_QR.NAME, function(q) { return String(q.order_id) === oid; })
      : [];
    var warranties = want("warranty_tickets")
      ? app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.WARRANTY_TICKETS.NAME, function(w) { return String(w.order_id) === oid; }).reverse()
      : [];
    var cust = want("customer")
      ? app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.CUSTOMERS.NAME, function(c) { return String(c.id) === String(ord.customer_id); })
      : null;

    return toRpcJson_(app.Utils.buildResponse(true, {
      order: sanitizeOrderForActor_(enrichFurnitureOrderRow_(ord, todayYmd, policy), actor),
      items: items,
      payments: payments,
      materials: materials,
      files_photos: filesPhotos,
      progress_logs: logs,
      packages_qr: pkgQrs,
      warranty_tickets: warranties,
      customer: cust ? Object.assign({}, cust, { phone: formatCarpentryPhone_(cust.phone) }) : null
    }, "Tải chi tiết đơn hàng thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "ORDER_DETAIL_ERROR"));
  }
}

function apiSaveQuotationOrder(token, dto) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.require("quotation.create");
    dto = dto || {};

    var result = app.Utils.withLock(function() {
      var policy = getCarpentryPolicyConfig_(app);
      var todayYmd = getCarpentryTodayYmd_(app);
      var nowStr = getCarpentryNowStr_(app);

      var custKey = String(dto.customer_id || "").trim();
      var cust = app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.CUSTOMERS.NAME, function(c) {
        return String(c.id) === custKey || String(c.customer_code || "").toUpperCase() === custKey.toUpperCase();
      });
      if (!cust) return app.Utils.buildResponse(false, null, "Vui lòng chọn Chủ đầu tư trước khi lập báo giá.", "CUSTOMER_NOT_FOUND");

      var rawItems = Array.isArray(dto.items) ? dto.items : [];
      if (rawItems.length === 0) return app.Utils.buildResponse(false, null, "Đơn hàng phải có ít nhất 1 hạng mục nội thất.", "MISSING_ITEMS");

      var ordSheet = PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME;
      var itemSheet = PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_ITEMS.NAME;
      var paySheet = PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_PAYMENTS.NAME;

      var ordId = String(dto.id || "").trim() || app.Utils.generateUUID();
      var existingOrd = String(dto.id || "").trim()
        ? app.Data.findRow(ordSheet, function(o) { return String(o.id) === ordId; })
        : null;
      var ordCode = existingOrd ? existingOrd.order_code : generateDailyCarpentryCode_(app.Data.getAll(ordSheet), "order_code", "NT", todayYmd);

      var stages = policy.productionStages;
      var firstStage = stages[0] || { code: "MATERIALS_READY", order: 1, name: "1️⃣ Nhập vật tư ván & PK" };

      var subtotal = 0;
      var itemRows = [];
      for (var i = 0; i < rawItems.length; i++) {
        var r = rawItems[i] || {};
        if (!r.item_name) continue;
        var calc = computeOrderItemMetrics_(r);
        subtotal += calc.line_total;
        itemRows.push({
          id: app.Utils.generateUUID(),
          order_id: ordId,
          order_code: ordCode,
          item_no: itemRows.length + 1,
          category: String(r.category || "KITCHEN").toUpperCase(),
          item_name: String(r.item_name).trim(),
          spec_material: String(r.spec_material || "").trim(),
          calc_mode: calc.calc_mode,
          length_m: calc.length_m,
          height_or_width_m: calc.height_or_width_m,
          quantity: calc.quantity,
          computed_qty: calc.computed_qty,
          unit: calc.unit,
          unit_price: calc.unit_price,
          line_total: calc.line_total,
          production_stage: firstStage.code,
          stage_order: firstStage.order,
          stage_label: firstStage.name,
          delivered_ok: "FALSE",
          notes: String(r.notes || "").trim(),
          updated_at: nowStr
        });
      }
      if (itemRows.length === 0) return app.Utils.buildResponse(false, null, "Không có hạng mục hợp lệ.", "MISSING_ITEMS");

      var discAmt = Math.min(subtotal, Math.max(0, Number(dto.discount_amount) || 0));
      var totalAmt = Math.max(0, subtotal - discAmt);
      var dueDate = String(dto.due_date || addCarpentryDaysYmd_(todayYmd, 18)).substring(0, 10);
      var schedStr = String(dto.payment_plan_code || policy.paymentScheduleStr).trim();
      var schedPcts = parsePaymentSchedulePcts_(schedStr);

      var ordRow = {
        id: ordId,
        order_code: ordCode,
        customer_id: cust.id,
        customer_code: cust.customer_code,
        customer_name: cust.full_name,
        customer_phone: cust.phone,
        site_address: String(dto.site_address || cust.site_address || "").trim(),
        project_type: String(dto.project_type || cust.project_type || "APARTMENT").toUpperCase(),
        partner_name: String(dto.partner_name || cust.partner_name || "").trim(),
        title: String(dto.title || ("Nội thất " + (itemRows[0].item_name || "may đo"))).trim(),
        designer_id: String(dto.designer_id || actor.id),
        designer_name: String(dto.designer_name || actor.full_name || actor.username),
        foreman_id: String(dto.foreman_id || ""),
        foreman_name: String(dto.foreman_name || ""),
        installer_id: String(dto.installer_id || ""),
        installer_name: String(dto.installer_name || ""),
        drawing_status: existingOrd ? existingOrd.drawing_status : "PENDING",
        payment_plan_code: schedStr,
        subtotal_amount: subtotal,
        discount_amount: discAmt,
        total_amount: totalAmt,
        paid_amount: existingOrd ? (Number(existingOrd.paid_amount) || 0) : 0,
        debt_amount: existingOrd ? Math.max(0, totalAmt - (Number(existingOrd.paid_amount) || 0)) : totalAmt,
        material_cost_total: existingOrd ? (Number(existingOrd.material_cost_total) || 0) : 0,
        labor_extra_cost: existingOrd ? (Number(existingOrd.labor_extra_cost) || 0) : 0,
        gross_profit: totalAmt - (existingOrd ? (Number(existingOrd.material_cost_total) || 0) : 0),
        gross_margin_pct: 100,
        signed_date: String(dto.signed_date || todayYmd).substring(0, 10),
        due_date: dueDate,
        completed_at: "",
        warranty_months: Number(dto.warranty_months) || policy.defaultWarrantyMonths,
        warranty_until_date: "",
        completion_pct: 0,
        current_stage_summary: firstStage.name,
        acceptance_signer: "",
        acceptance_notes: "",
        status: existingOrd ? existingOrd.status : "QUOTED",
        notes: String(dto.notes || "").trim(),
        created_at: existingOrd ? existingOrd.created_at : nowStr,
        updated_at: nowStr
      };

      var returnedPayments = [];
      if (existingOrd) {
        app.Data.updateById(ordSheet, ordId, ordRow);
        app.Data.replaceByColumn(itemSheet, "order_id", ordId, itemRows);
        returnedPayments = app.Data.findRows(paySheet, function(x) { return String(x.order_id) === ordId; });
      } else {
        app.Data.insertOne(ordSheet, ordRow);
        app.Data.insertBatch(itemSheet, itemRows);

        // Tạo các đợt thanh toán chia theo cấu hình (VD 40-40-20) — đọc bảng ORDER_PAYMENTS 1 lần ngoài vòng lặp + ghi batch
        var stageTitles = ["Đợt 1 — Ký HĐ chốt cọc", "Đợt 2 — Xong QC tại xưởng (Trước giao)", "Đợt 3 — Nghiệm thu lắp đặt hoàn tất"];
        var triggers = ["ON_SIGN", "READY_TO_SHIP", "ON_HANDOVER"];
        var existingPayRows = app.Data.getAll(paySheet);
        var allocated = 0;
        var payRows = [];
        for (var p = 0; p < schedPcts.length; p++) {
          var pct = schedPcts[p];
          var amt = (p === schedPcts.length - 1) ? Math.max(0, totalAmt - allocated) : Math.round((totalAmt * pct) / 100);
          allocated += amt;
          payRows.push({
            id: app.Utils.generateUUID(),
            payment_code: generateDailyCarpentryCode_(existingPayRows.concat(payRows), "payment_code", "TT", todayYmd),
            order_id: ordId,
            order_code: ordCode,
            customer_id: cust.id,
            customer_name: cust.full_name,
            stage_no: p + 1,
            stage_name: stageTitles[p] || ("Đợt " + (p + 1)),
            due_trigger: triggers[p] || "ON_HANDOVER",
            percent_share: pct,
            due_amount: amt,
            paid_amount: 0,
            payment_channel: "",
            expected_date: p === 0 ? todayYmd : (p === 1 ? addCarpentryDaysYmd_(dueDate, -2) : dueDate),
            paid_at: "",
            status: p === 0 ? "DUE" : "NOT_DUE",
            collected_by_name: "",
            notes: "",
            updated_at: nowStr
          });
        }
        app.Data.insertBatch(paySheet, payRows);
        returnedPayments = payRows;

        app.Data.updateById(PROJECT_CONFIG.BUSINESS_SHEETS.CUSTOMERS.NAME, cust.id, {
          total_orders: (Number(cust.total_orders) || 0) + 1,
          total_contract_value: (Number(cust.total_contract_value) || 0) + totalAmt,
          debt_balance: (Number(cust.debt_balance) || 0) + totalAmt,
          updated_at: nowStr
        });

        if (dto.survey_id) {
          app.Data.updateById(PROJECT_CONFIG.BUSINESS_SHEETS.CARPENTRY_SURVEYS.NAME, dto.survey_id, {
            linked_order_id: ordId,
            linked_order_code: ordCode,
            status: "CONVERTED"
          });
        }
      }

      app.Audit.log({ actor: actor, action: existingOrd ? "UPDATE_QUOTATION" : "CREATE_QUOTATION", entity_type: ordSheet, entity_id: ordId, entity_number: ordCode, after: ordRow, message: "Lập báo giá " + ordCode + " (" + totalAmt.toLocaleString("en-US") + "đ)" });
      return app.Utils.buildResponse(true, {
        order: sanitizeOrderForActor_(enrichFurnitureOrderRow_(ordRow, todayYmd, policy), actor),
        items: itemRows,
        payments: returnedPayments
      }, "Đã lưu đơn hàng / báo giá " + ordCode + " (" + totalAmt.toLocaleString("en-US") + "đ)!");
    }, 15000);

    return toRpcJson_(result);
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "QUOTATION_SAVE_ERROR"));
  }
}

function apiApproveQuotationAndStartOrder(token, dto) {
  var app = getCore_(token);
  try {
    dto = dto || {};
    var actionMode = String(dto.action || "START_PRODUCTION").toUpperCase();
    var actor = (actionMode === "APPROVE_DRAWING_ONLY")
      ? app.Authorization.requireAny(["quotation.approve", "order.approve"])
      : app.Authorization.require("order.approve");

    var ordKey = String(dto.order_id || "").trim();
    var ordSheet = PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME;
    var ord = app.Data.findRow(ordSheet, function(o) { return String(o.id) === ordKey || String(o.order_code) === ordKey; });
    if (!ord) return toRpcJson_(app.Utils.buildResponse(false, null, "Không tìm thấy đơn hàng.", "NOT_FOUND"));

    var policy = getCarpentryPolicyConfig_(app);
    var todayYmd = getCarpentryTodayYmd_(app);
    var nowStr = getCarpentryNowStr_(app);

    var upd;
    var auditAction = "APPROVE_ORDER";
    var msg;
    if (actionMode === "CANCEL_ORDER") {
      upd = { status: "CANCELLED", updated_at: nowStr };
      if (dto.notes) upd.notes = String(dto.notes).trim();
      auditAction = "CANCEL_ORDER";
      msg = "Đã hủy đơn hàng " + ord.order_code + ".";
    } else {
      upd = {
        drawing_status: "APPROVED",
        status: actionMode === "APPROVE_DRAWING_ONLY" ? (ord.status === "QUOTED" ? "DEPOSITED" : ord.status) : "IN_PRODUCTION",
        updated_at: nowStr
      };
      msg = actionMode === "APPROVE_DRAWING_ONLY"
        ? ("Đã duyệt báo giá & bản vẽ đơn " + ord.order_code + "!")
        : ("Đã duyệt bản vẽ & chuyển đơn " + ord.order_code + " sang Đang sản xuất!");
    }

    if (dto.foreman_id || dto.installer_id) {
      var allUsers = app.Data.getAll("USERS");
      if (dto.foreman_id) {
        var fUser = allUsers.find(function(u) { return String(u.id) === String(dto.foreman_id); });
        if (fUser) { upd.foreman_id = fUser.id; upd.foreman_name = fUser.full_name || fUser.username; }
      }
      if (dto.installer_id) {
        var iUser = allUsers.find(function(u) { return String(u.id) === String(dto.installer_id); });
        if (iUser) { upd.installer_id = iUser.id; upd.installer_name = iUser.full_name || iUser.username; }
      }
    }

    app.Data.updateById(ordSheet, ord.id, upd);
    app.Audit.log({ actor: actor, action: auditAction, entity_type: ordSheet, entity_id: ord.id, entity_number: ord.order_code, after: upd, message: msg });
    return toRpcJson_(app.Utils.buildResponse(true, sanitizeOrderForActor_(enrichFurnitureOrderRow_(Object.assign({}, ord, upd), todayYmd, policy), actor), msg));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "APPROVE_ORDER_ERROR"));
  }
}

function apiUploadOrderFileOrPhoto(token, dto) {
  var app = getCore_(token);
  try {
    dto = dto || {};
    var cat = String(dto.file_category || "PRODUCTION_PROGRESS").trim().toUpperCase();
    var isDrawing = cat === "DRAWING_2D" || cat === "DRAWING_3D";
    var actor = app.Authorization.require(isDrawing ? "drawing.upload" : "photo.upload");

    var ordKey = String(dto.order_id || dto.order_code || "").trim();
    var ord = app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME, function(o) {
      return String(o.id) === ordKey || String(o.order_code || "").toUpperCase() === ordKey.toUpperCase();
    });
    if (!ord) return toRpcJson_(app.Utils.buildResponse(false, null, "Không tìm thấy đơn hàng liên kết.", "ORDER_NOT_FOUND"));
    if (!dto.base64 && !dto.drive_url) return toRpcJson_(app.Utils.buildResponse(false, null, "Thiếu dữ liệu file bản vẽ hoặc hình ảnh.", "MISSING_FILE"));

    var todayYmd = getCarpentryTodayYmd_(app);
    var nowStr = getCarpentryNowStr_(app);
    var drv = dto.base64
      ? saveCarpentryFileToDrive_(app, dto.base64, cat + "_" + (dto.file_name || ("doc_" + Date.now() + ".jpg")), dto.mime_type, ord.order_code)
      : { drive_file_id: String(dto.drive_file_id || ""), drive_url: String(dto.drive_url), file_name: String(dto.file_name || "document"), mime_type: String(dto.mime_type || "application/pdf"), file_size: Number(dto.file_size) || 0 };

    var sheet = PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_FILES_PHOTOS.NAME;
    var row = {
      id: app.Utils.generateUUID(),
      file_code: generateDailyCarpentryCode_(app.Data.getAll(sheet), "file_code", "TL", todayYmd),
      order_id: ord.id,
      order_code: ord.order_code,
      survey_id: "",
      customer_name: ord.customer_name,
      file_category: cat,
      title_or_room: String(dto.title_or_room || "Hồ sơ công trình").trim(),
      file_name: drv.file_name,
      mime_type: drv.mime_type,
      file_size: drv.file_size,
      drive_file_id: drv.drive_file_id,
      drive_url: drv.drive_url,
      uploaded_by: String(actor.id),
      uploaded_by_name: String(actor.full_name || actor.username),
      notes: String(dto.notes || "").trim(),
      created_at: nowStr
    };
    app.Data.insertOne(sheet, row);
    app.Audit.log({ actor: actor, action: "UPLOAD_FILE", entity_type: sheet, entity_id: row.id, entity_number: row.file_code, after: row, message: "Upload " + cat + " lên Drive cho đơn " + ord.order_code });
    return toRpcJson_(app.Utils.buildResponse(true, row, "Đã lưu file/ảnh (" + row.title_or_room + ") lên Google Drive!"));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "UPLOAD_FILE_ERROR"));
  }
}

function apiEstimateOrIssueMaterial(token, dto) {
  var app = getCore_(token);
  try {
    dto = dto || {};
    var issuedQty = Math.max(0, Number(dto.issued_qty) || 0);
    var estQty = Math.max(0, Number(dto.estimated_qty) || 0);
    var actor = app.Authorization.require(issuedQty > 0 ? "material.issue" : "material.estimate");

    var result = app.Utils.withLock(function() {
      var todayYmd = getCarpentryTodayYmd_(app);
      var nowStr = getCarpentryNowStr_(app);

      var ordKey = String(dto.order_id || "").trim();
      var ord = app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME, function(o) {
        return String(o.id) === ordKey || String(o.order_code) === ordKey;
      });
      if (!ord) return app.Utils.buildResponse(false, null, "Không tìm thấy đơn hàng.", "ORDER_NOT_FOUND");

      var catSheet = PROJECT_CONFIG.BUSINESS_SHEETS.MATERIAL_CATALOG.NAME;
      var mat = dto.material_id
        ? app.Data.findRow(catSheet, function(m) { return String(m.id) === String(dto.material_id) || String(m.material_code) === String(dto.material_id); })
        : null;

      var matName = String(dto.material_name || (mat && mat.item_name) || "").trim();
      if (!matName) return app.Utils.buildResponse(false, null, "Tên vật tư không được để trống.", "MISSING_MATERIAL");

      if (mat && issuedQty > 0) {
        var stockBefore = Number(mat.stock_qty) || 0;
        if (stockBefore < issuedQty) {
          return app.Utils.buildResponse(false, null, "Tồn kho '" + mat.item_name + "' chỉ còn " + stockBefore + " " + mat.unit + ", không đủ xuất " + issuedQty + "!", "INSUFFICIENT_MATERIAL_STOCK");
        }
        app.Data.updateById(catSheet, mat.id, { stock_qty: stockBefore - issuedQty, updated_at: nowStr });
      }

      var qtyForCost = issuedQty > 0 ? issuedQty : estQty;
      var unitCost = dto.unit_cost !== undefined && dto.unit_cost !== "" ? Math.max(0, Number(dto.unit_cost) || 0) : (mat ? Number(mat.default_cost_price) || 0 : 0);
      var totalCost = Math.round(qtyForCost * unitCost);

      var mSheet = PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_MATERIALS.NAME;
      var row = {
        id: app.Utils.generateUUID(),
        issue_code: generateDailyCarpentryCode_(app.Data.getAll(mSheet), "issue_code", "VT", todayYmd),
        order_id: ord.id,
        order_code: ord.order_code,
        material_id: mat ? mat.id : "",
        material_code: mat ? mat.material_code : "",
        material_name: matName,
        unit: String(dto.unit || (mat && mat.unit) || "Cái"),
        estimated_qty: estQty || issuedQty,
        issued_qty: issuedQty,
        unit_cost: unitCost,
        total_cost: totalCost,
        performed_by: String(actor.id),
        performed_by_name: String(actor.full_name || actor.username),
        notes: String(dto.notes || "").trim(),
        created_at: nowStr
      };
      app.Data.insertOne(mSheet, row);

      var profitSummary = recalculateOrderFinancials_(app, ord.id, nowStr, ord);
      var safeFinancials = profitSummary;
      if (profitSummary && !actorHasPerm_(actor, "profit_report.view")) {
        safeFinancials = {
          material_cost_total: profitSummary.material_cost_total,
          labor_extra_cost: null,
          gross_profit: null,
          gross_margin_pct: null
        };
      }
      app.Audit.log({ actor: actor, action: issuedQty > 0 ? "ISSUE_MATERIAL" : "ESTIMATE_MATERIAL", entity_type: mSheet, entity_id: row.id, entity_number: row.issue_code, after: row, message: (issuedQty > 0 ? "Xuất kho " : "Dự trù ") + qtyForCost + " " + row.unit + " " + matName + " cho " + ord.order_code });
      return app.Utils.buildResponse(true, { material_row: row, order_financials: safeFinancials }, "Đã ghi nhận vật tư " + matName + " (" + row.issue_code + ")!");
    }, 10000);

    return toRpcJson_(result);
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "MATERIAL_ISSUE_ERROR"));
  }
}

function apiUpdateItemProductionStage(token, dto) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.require("production.stage_update");
    dto = dto || {};
    var itemId = String(dto.order_item_id || "").trim();
    var targetStage = String(dto.to_stage || "").trim().toUpperCase();
    if (!itemId || !targetStage) return toRpcJson_(app.Utils.buildResponse(false, null, "Thiếu hạng mục hoặc công đoạn đích.", "INVALID_PARAMS"));

    var result = app.Utils.withLock(function() {
      var policy = getCarpentryPolicyConfig_(app);
      var todayYmd = getCarpentryTodayYmd_(app);
      var nowStr = getCarpentryNowStr_(app);
      var stages = policy.productionStages;
      var stageInfo = getCarpentryStageInfo_(stages, targetStage);

      var itemSheet = PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_ITEMS.NAME;
      var allItems = app.Data.getAll(itemSheet);
      var item = null;
      for (var fi = 0; fi < allItems.length; fi++) {
        if (allItems[fi] && String(allItems[fi].id) === itemId) {
          item = allItems[fi];
          break;
        }
      }
      if (!item) return app.Utils.buildResponse(false, null, "Không tìm thấy hạng mục sản xuất.", "ITEM_NOT_FOUND");

      var fromStage = item.production_stage;
      app.Data.updateById(itemSheet, item.id, {
        production_stage: stageInfo.code,
        stage_order: stageInfo.order,
        stage_label: stageInfo.name,
        updated_at: nowStr
      });

      var siblingItems = allItems.filter(function(x) { return x && String(x.order_id) === String(item.order_id); });
      var totalStages = Math.max(1, stages.length);
      var sumRatio = 0;
      var allQcDone = true;
      for (var i = 0; i < siblingItems.length; i++) {
        var curOrder = (String(siblingItems[i].id) === String(item.id)) ? stageInfo.order : (Number(siblingItems[i].stage_order) || 1);
        if (curOrder < totalStages) allQcDone = false;
        var pctItem = totalStages > 1 ? Math.round(((curOrder - 1) / (totalStages - 1)) * 100) : 100;
        sumRatio += Math.min(100, Math.max(0, pctItem));
      }
      var orderPct = siblingItems.length > 0 ? Math.round(sumRatio / siblingItems.length) : 0;

      var ordSheet = PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME;
      var ord = app.Data.findRow(ordSheet, function(o) { return String(o.id) === String(item.order_id); });
      var newOrdStatus = allQcDone ? "READY_TO_SHIP" : "IN_PRODUCTION";
      if (ord && ["INSTALLING", "COMPLETED", "WARRANTY", "CANCELLED"].indexOf(ord.status) === -1) {
        app.Data.updateById(ordSheet, ord.id, {
          completion_pct: orderPct,
          current_stage_summary: allQcDone ? "Đã xong QC — Sẵn sàng xuất xưởng" : stageInfo.name,
          status: newOrdStatus,
          updated_at: nowStr
        });
      }

      // Khi toàn bộ hạng mục xong QC (READY_TO_SHIP), bật trạng thái Đợt 2 thành DUE nhắc thu tiền
      var stage2Activated = false;
      if (allQcDone) {
        var pays = app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_PAYMENTS.NAME, function(p) {
          return String(p.order_id) === String(item.order_id) && p.due_trigger === "READY_TO_SHIP" && p.status === "NOT_DUE";
        });
        for (var pIdx = 0; pIdx < pays.length; pIdx++) {
          app.Data.updateById(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_PAYMENTS.NAME, pays[pIdx].id, {
            status: "DUE",
            updated_at: nowStr
          });
          stage2Activated = true;
        }
      }

      var logSheet = PROJECT_CONFIG.BUSINESS_SHEETS.PRODUCTION_PROGRESS.NAME;
      var logRow = {
        id: app.Utils.generateUUID(),
        progress_code: generateDailyCarpentryCode_(app.Data.getAll(logSheet), "progress_code", "SX", todayYmd),
        order_id: item.order_id,
        order_code: item.order_code,
        order_item_id: item.id,
        item_name: item.item_name,
        from_stage: fromStage,
        to_stage: stageInfo.code,
        stage_label: stageInfo.name,
        completion_pct_after: orderPct,
        worker_id: String(actor.id),
        worker_name: String(actor.full_name || actor.username),
        notes: String(dto.notes || ("Chuyển công đoạn -> " + stageInfo.name)).trim(),
        created_at: nowStr
      };
      app.Data.insertOne(logSheet, logRow);

      app.Audit.log({ actor: actor, action: "PRODUCTION_STAGE", entity_type: itemSheet, entity_id: item.id, entity_number: item.order_code, after: logRow, message: item.order_code + " [" + item.item_name + "] -> " + stageInfo.name + " (" + orderPct + "%)" });
      return app.Utils.buildResponse(true, {
        item: Object.assign({}, item, { production_stage: stageInfo.code, stage_order: stageInfo.order, stage_label: stageInfo.name }),
        completion_pct: orderPct,
        order_status: newOrdStatus,
        stage2_payment_due: stage2Activated
      }, "Đã chuyển '" + item.item_name + "' sang " + stageInfo.name + " (Đơn đạt " + orderPct + "%)!");
    }, 10000);

    return toRpcJson_(result);
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "STAGE_UPDATE_ERROR"));
  }
}

function apiGenerateOrScanPackageQr(token, dto) {
  var app = getCore_(token);
  try {
    dto = dto || {};
    var mode = String(dto.mode || "SCAN").trim().toUpperCase();
    if (mode === "GENERATE") {
      var actor = app.Authorization.require("package.qr_print");
      var ordKey = String(dto.order_id || dto.order_code || "").trim();
      var ord = app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME, function(o) {
        return String(o.id) === ordKey || String(o.order_code) === ordKey;
      });
      if (!ord) return toRpcJson_(app.Utils.buildResponse(false, null, "Không tìm thấy đơn hàng.", "ORDER_NOT_FOUND"));

      var count = Math.max(1, parseInt(dto.total_packages, 10) || 1);
      var room = String(dto.room_or_item || "Kiện nội thất").trim();
      var pkgSheet = PROJECT_CONFIG.BUSINESS_SHEETS.PACKAGE_QR.NAME;
      var existing = app.Data.findRows(pkgSheet, function(q) { return String(q.order_id) === String(ord.id); }).length;
      var nowStr = getCarpentryNowStr_(app);
      var created = [];
      for (var i = 1; i <= count; i++) {
        var idx = existing + i;
        var qr = "PK-" + ord.order_code + "-" + (idx < 10 ? "0" : "") + String(idx);
        var row = {
          id: app.Utils.generateUUID(),
          qr_code: qr,
          order_id: ord.id,
          order_code: ord.order_code,
          order_item_id: String(dto.order_item_id || ""),
          room_or_item: room,
          package_index: idx,
          total_packages: existing + count,
          contents_desc: String(dto.contents_desc || (room + " (Kiện " + idx + ")")).trim(),
          status: "PACKED",
          scanned_at: "",
          scanned_by_name: "",
          created_at: nowStr
        };
        created.push(row);
      }
      app.Data.insertBatch(pkgSheet, created);
      return toRpcJson_(app.Utils.buildResponse(true, created, "Đã tạo " + count + " tem QR kiện hàng cho đơn " + ord.order_code + "!"));
    }

    // SCAN mode
    var actorScan = app.Authorization.requireAny(["delivery.update", "drawing.view", "order.view", "package.qr_print"]);
    var rawCode = String(dto.code || dto.qr_code || "").trim();
    if (!rawCode) return toRpcJson_(app.Utils.buildResponse(false, null, "Vui lòng nhập hoặc quét mã QR kiện hàng / Mã đơn NT-...", "MISSING_CODE"));

    var upCode = rawCode.toUpperCase();
    var pkgSheet2 = PROJECT_CONFIG.BUSINESS_SHEETS.PACKAGE_QR.NAME;
    var allPkgRows = app.Data.getAll(pkgSheet2);
    var matchedPkg = null;
    for (var pi = 0; pi < allPkgRows.length; pi++) {
      if (allPkgRows[pi] && String(allPkgRows[pi].qr_code || "").toUpperCase() === upCode) {
        matchedPkg = allPkgRows[pi];
        break;
      }
    }
    var orderKey = matchedPkg ? String(matchedPkg.order_id) : upCode;

    var policy = getCarpentryPolicyConfig_(app);
    var todayYmd = getCarpentryTodayYmd_(app);
    var ord2 = app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME, function(o) {
      return String(o.id) === orderKey || String(o.order_code || "").toUpperCase() === orderKey.toUpperCase();
    });
    if (!ord2) return toRpcJson_(app.Utils.buildResponse(false, null, "Không tìm thấy kiện hàng hoặc đơn hàng '" + rawCode + "'.", "NOT_FOUND"));

    if (matchedPkg && dto.mark_status) {
      if (!actorHasAnyPerm_(actorScan, ["delivery.update", "package.qr_print"])) {
        return toRpcJson_(app.Utils.buildResponse(false, null, "Bạn không có quyền cập nhật trạng thái kiện hàng (delivery.update).", "AUTH_FORBIDDEN"));
      }
      var newSt = String(dto.mark_status).toUpperCase();
      var scanNow = getCarpentryNowStr_(app);
      app.Data.updateById(pkgSheet2, matchedPkg.id, {
        status: newSt,
        scanned_at: scanNow,
        scanned_by_name: String(actorScan.full_name || actorScan.username)
      });
      matchedPkg = Object.assign({}, matchedPkg, { status: newSt, scanned_at: scanNow, scanned_by_name: String(actorScan.full_name || actorScan.username) });
    }

    var allDrawings = app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_FILES_PHOTOS.NAME, function(f) {
      return String(f.order_id) === String(ord2.id);
    }).reverse();
    var allPackages = allPkgRows.filter(function(q) { return q && String(q.order_id) === String(ord2.id); });

    return toRpcJson_(app.Utils.buildResponse(true, {
      scanned_package: matchedPkg,
      order: sanitizeOrderForActor_(enrichFurnitureOrderRow_(ord2, todayYmd, policy), actorScan),
      packages: allPackages,
      drawings_and_photos: allDrawings
    }, "Đã tra cứu kiện hàng & mở bộ bản vẽ Drive!"));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "QR_PACKAGE_ERROR"));
  }
}
