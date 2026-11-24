/**
 * CarpentryPaymentInstallWarrantyReportService.gs
 * - Thanh toán nhiều đợt Đợt 1 (Cọc) - Đợt 2 (Trước giao) - Đợt 3 (Nghiệm thu) (`apiGetOrderPayments`, `apiCollectOrderPayment`)
 * - Vận chuyển & Lắp đặt tận nhà kiểm soát Đợt 2 (`apiUpdateDeliveryInstallStatus`)
 * - Nghiệm thu bàn giao & Tự kích hoạt bảo hành (`apiCompleteOrderAcceptance`)
 * - Phiếu Bảo hành & Sửa chữa (`apiGetWarrantyTickets`, `apiSaveWarrantyTicket`)
 * - Sổ quỹ thu chi & Nhập vật tư ván/phụ kiện (`apiGetCashTransactions`, `apiCreateCashTransaction`)
 * - Dashboard Xưởng & Báo cáo Lãi/Lỗ công trình (`apiGetCarpentryDashboard`, `apiGetCarpentryReports`)
 */

function apiGetOrderPayments(token, filters, page, pageSize) {
  var app = getCore_(token);
  try {
    app.Authorization.requireAny(["payment.create", "debt.view", "order.view_all", "menu.payments"]);
    filters = filters || {};
    var policy = getCarpentryPolicyConfig_(app);
    var st = String(filters.status || "").trim().toUpperCase();
    var kw = String(filters.keyword || "").trim().toLowerCase();

    var rows = app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_PAYMENTS.NAME);
    var out = rows.filter(function(p) {
      if (!p || !p.id) return false;
      if (st && st !== "ALL" && String(p.status || "").toUpperCase() !== st) return false;
      if (!kw) return true;
      return String(p.payment_code || "").toLowerCase().indexOf(kw) !== -1 ||
             String(p.order_code || "").toLowerCase().indexOf(kw) !== -1 ||
             String(p.customer_name || "").toLowerCase().indexOf(kw) !== -1;
    }).map(function(p) {
      return Object.assign({}, p, {
        stage_no: Number(p.stage_no) || 1,
        percent_share: Number(p.percent_share) || 0,
        due_amount: Number(p.due_amount) || 0,
        paid_amount: Number(p.paid_amount) || 0
      });
    });

    var paged = app.Data.paginate(out, page || 1, pageSize || policy.defaultPageSize);
    return toRpcJson_(app.Utils.buildResponse(true, { items: paged.items, pagination: paged.pagination, total: paged.pagination.total }, "Tải lịch thanh toán các đợt thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "PAYMENT_LIST_ERROR"));
  }
}

function collectOrderPaymentCore_(app, actor, dto, preloadedOrder) {
  dto = dto || {};
  var payId = String(dto.payment_id || "").trim();
  var ordKey = String(dto.order_id || "").trim();
  var amtInput = Math.max(0, Number(dto.amount) || 0);
  if (amtInput <= 0) return app.Utils.buildResponse(false, null, "Số tiền thanh toán phải lớn hơn 0.", "INVALID_AMOUNT");

  var policy = getCarpentryPolicyConfig_(app);
  var todayYmd = getCarpentryTodayYmd_(app);
  var nowStr = getCarpentryNowStr_(app);
  var paySheet = PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_PAYMENTS.NAME;
  var ordSheet = PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME;

  var payRow = payId
    ? app.Data.findRow(paySheet, function(p) { return String(p.id) === payId || String(p.payment_code) === payId; })
    : app.Data.findRow(paySheet, function(p) {
        return (String(p.order_id) === ordKey || String(p.order_code) === ordKey) && p.status !== "PAID";
      });

  if (!payRow) return app.Utils.buildResponse(false, null, "Không tìm thấy đợt thanh toán cần thu.", "PAYMENT_NOT_FOUND");
  var ord = (preloadedOrder && String(preloadedOrder.id) === String(payRow.order_id))
    ? preloadedOrder
    : app.Data.findRow(ordSheet, function(o) { return String(o.id) === String(payRow.order_id); });
  if (!ord) return app.Utils.buildResponse(false, null, "Không tìm thấy đơn hàng liên kết.", "ORDER_NOT_FOUND");

  var curPaidStage = Number(payRow.paid_amount) || 0;
  var dueStage = Number(payRow.due_amount) || 0;
  var stageRemaining = Math.max(0, dueStage - curPaidStage);
  var actualCollect = Math.min(amtInput, Math.max(stageRemaining, Number(ord.debt_amount) || 0));
  if (actualCollect <= 0) actualCollect = amtInput;

  var newStagePaid = curPaidStage + actualCollect;
  var stageStatus = newStagePaid >= dueStage ? "PAID" : "PARTIAL";
  var channel = String(dto.payment_channel || "BANK_TRANSFER").toUpperCase();

  app.Data.updateById(paySheet, payRow.id, {
    paid_amount: newStagePaid,
    payment_channel: channel,
    paid_at: nowStr,
    status: stageStatus,
    collected_by_name: String(actor.full_name || actor.username),
    notes: String(dto.notes || "").trim(),
    updated_at: nowStr
  });

  var newOrderPaid = (Number(ord.paid_amount) || 0) + actualCollect;
  var newOrderDebt = Math.max(0, (Number(ord.total_amount) || 0) - newOrderPaid);
  var newOrdStatus = ord.status;
  if ((ord.status === "SURVEYING" || ord.status === "QUOTED") && Number(payRow.stage_no) === 1 && stageStatus === "PAID") {
    newOrdStatus = "DEPOSITED";
  }

  app.Data.updateById(ordSheet, ord.id, {
    paid_amount: newOrderPaid,
    debt_amount: newOrderDebt,
    status: newOrdStatus,
    updated_at: nowStr
  });

  var cust = app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.CUSTOMERS.NAME, function(c) { return String(c.id) === String(ord.customer_id); });
  if (cust) {
    app.Data.updateById(PROJECT_CONFIG.BUSINESS_SHEETS.CUSTOMERS.NAME, cust.id, {
      total_paid: (Number(cust.total_paid) || 0) + actualCollect,
      debt_balance: Math.max(0, (Number(cust.debt_balance) || 0) - actualCollect),
      updated_at: nowStr
    });
  }

  var txSheet = PROJECT_CONFIG.BUSINESS_SHEETS.CASH_TRANSACTIONS.NAME;
  app.Data.insertOne(txSheet, {
    id: app.Utils.generateUUID(),
    tx_code: generateDailyCarpentryCode_(app.Data.getAll(txSheet), "tx_code", "TC", todayYmd),
    tx_type: "IN",
    category: "ORDER_PAYMENT",
    payment_channel: channel,
    amount: actualCollect,
    order_id: ord.id,
    order_code: ord.order_code,
    customer_name: ord.customer_name,
    description: "Thu tiền " + payRow.stage_name + " (" + ord.order_code + ")",
    performed_by: String(actor.id),
    performed_by_name: String(actor.full_name || actor.username),
    tx_date: todayYmd,
    created_at: nowStr
  });

  app.Audit.log({ actor: actor, action: "COLLECT_PAYMENT", entity_type: paySheet, entity_id: payRow.id, entity_number: ord.order_code, after: { paid_amount: actualCollect, new_order_debt: newOrderDebt }, message: "Thu " + actualCollect + "đ " + payRow.stage_name + " đơn " + ord.order_code });
  var updatedOrdRaw = Object.assign({}, ord, { paid_amount: newOrderPaid, debt_amount: newOrderDebt, status: newOrdStatus });
  return app.Utils.buildResponse(true, {
    payment_status: stageStatus,
    collected_amount: actualCollect,
    raw_order: updatedOrdRaw,
    order: sanitizeOrderForActor_(enrichFurnitureOrderRow_(updatedOrdRaw, todayYmd, policy), actor)
  }, "Đã thu " + actualCollect.toLocaleString("en-US") + "đ (" + payRow.stage_name + ")!");
}

function apiCollectOrderPayment(token, dto) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.require("payment.create");
    var result = app.Utils.withLock(function() {
      var res = collectOrderPaymentCore_(app, actor, dto, null);
      if (res && res.success && res.data && res.data.raw_order) {
        delete res.data.raw_order;
      }
      return res;
    }, 10000);

    return toRpcJson_(result);
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "COLLECT_PAYMENT_ERROR"));
  }
}

function apiUpdateDeliveryInstallStatus(token, dto) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.require("delivery.update");
    dto = dto || {};
    var ordKey = String(dto.order_id || "").trim();
    var targetStatus = String(dto.status || "INSTALLING").trim().toUpperCase();
    var policy = getCarpentryPolicyConfig_(app);
    var todayYmd = getCarpentryTodayYmd_(app);
    var nowStr = getCarpentryNowStr_(app);

    var ordSheet = PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME;
    var ord = app.Data.findRow(ordSheet, function(o) { return String(o.id) === ordKey || String(o.order_code) === ordKey; });
    if (!ord) return toRpcJson_(app.Utils.buildResponse(false, null, "Không tìm thấy đơn hàng.", "NOT_FOUND"));

    // Kiểm tra Đợt 2 trước khi xuất xưởng giao đi lắp đặt (nếu bật REQUIRE_STAGE2_PAY_BEFORE_SHIP)
    if (targetStatus === "INSTALLING" && policy.requireStage2PayBeforeShip) {
      var orderPays = app.Data.findRows(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_PAYMENTS.NAME, function(p) {
        return String(p.order_id) === String(ord.id);
      });
      var stage2Pay = orderPays.find(function(p) { return p.due_trigger === "READY_TO_SHIP"; });
      if (stage2Pay && stage2Pay.status !== "PAID" && Number(stage2Pay.due_amount) > 0) {
        if (!dto.override_payment_check) {
          return toRpcJson_(app.Utils.buildResponse(false, null, "Cảnh báo xuất xưởng: Khách chưa thanh toán đủ " + stage2Pay.stage_name + " (" + Number(stage2Pay.due_amount).toLocaleString("en-US") + "đ). Vui lòng thu Đợt 2 hoặc nhờ Quản lý xác nhận bỏ qua!", "STAGE2_UNPAID"));
        }
        if (!actorHasAnyPerm_(actor, ["order.approve", "payment.create"])) {
          return toRpcJson_(app.Utils.buildResponse(false, null, "Bạn không có quyền bỏ qua kiểm soát thanh toán Đợt 2 (cần quyền order.approve hoặc payment.create).", "OVERRIDE_FORBIDDEN"));
        }
      }
      // Bật Đợt 3 thành DUE khi xe bắt đầu đi lắp đặt tại nhà khách (tái sử dụng orderPays, không đọc lại Sheet)
      var stage3 = orderPays.find(function(p) { return p.due_trigger === "ON_HANDOVER" && p.status === "NOT_DUE"; });
      if (stage3) {
        app.Data.updateById(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_PAYMENTS.NAME, stage3.id, { status: "DUE", updated_at: nowStr });
      }
    } else if (targetStatus === "INSTALLING") {
      var stage3NoGate = app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_PAYMENTS.NAME, function(p) {
        return String(p.order_id) === String(ord.id) && p.due_trigger === "ON_HANDOVER" && p.status === "NOT_DUE";
      });
      if (stage3NoGate) {
        app.Data.updateById(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_PAYMENTS.NAME, stage3NoGate.id, { status: "DUE", updated_at: nowStr });
      }
    }

    var upd = { status: targetStatus, updated_at: nowStr };
    if (dto.installer_id) {
      var iUser = app.Data.findRow("USERS", function(u) { return String(u.id) === String(dto.installer_id); });
      if (iUser) { upd.installer_id = iUser.id; upd.installer_name = iUser.full_name || iUser.username; }
    }
    app.Data.updateById(ordSheet, ord.id, upd);

    app.Audit.log({ actor: actor, action: "DELIVERY_STATUS", entity_type: ordSheet, entity_id: ord.id, entity_number: ord.order_code, after: upd, message: "Đơn " + ord.order_code + " -> " + targetStatus + (dto.override_payment_check ? " (Override Đợt 2)" : "") });
    return toRpcJson_(app.Utils.buildResponse(true, sanitizeOrderForActor_(enrichFurnitureOrderRow_(Object.assign({}, ord, upd), todayYmd, policy), actor), "Đã cập nhật trạng thái giao hàng / lắp đặt đơn " + ord.order_code + "!"));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "DELIVERY_ERROR"));
  }
}

function apiCompleteOrderAcceptance(token, dto) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.require("acceptance.sign");
    dto = dto || {};
    var ordKey = String(dto.order_id || "").trim();
    var finalAmt = Math.max(0, Number(dto.final_payment_amount) || 0);

    if (finalAmt > 0 && !actorHasPerm_(actor, "payment.create")) {
      return toRpcJson_(app.Utils.buildResponse(false, null, "Bạn không có quyền thu tiền (payment.create). Vui lòng để trống số tiền thu đợt cuối hoặc nhờ Kế toán thu tiền.", "AUTH_FORBIDDEN"));
    }

    var result = app.Utils.withLock(function() {
      var policy = getCarpentryPolicyConfig_(app);
      var todayYmd = getCarpentryTodayYmd_(app);
      var nowStr = getCarpentryNowStr_(app);

      var ordSheet = PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME;
      var ord = app.Data.findRow(ordSheet, function(o) { return String(o.id) === ordKey || String(o.order_code) === ordKey; });
      if (!ord) return app.Utils.buildResponse(false, null, "Không tìm thấy đơn hàng.", "NOT_FOUND");

      // Đánh dấu hàng loạt các hạng mục đã giao xong (1 lần replaceByColumn thay vì N lần updateById)
      var itemSheet = PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_ITEMS.NAME;
      var items = app.Data.findRows(itemSheet, function(x) { return String(x.order_id) === String(ord.id); });
      if (items.length > 0) {
        var updatedItems = items.map(function(it) {
          return Object.assign({}, it, { delivered_ok: "TRUE", updated_at: nowStr });
        });
        app.Data.replaceByColumn(itemSheet, "order_id", ord.id, updatedItems);
      }

      // Nếu kèm thu tiền đợt cuối ngay tại biên bản nghiệm thu (chạy nội bộ, không lặp getCore_/verifyActor_)
      var paidAdd = 0;
      if (finalAmt > 0) {
        var colRes = collectOrderPaymentCore_(app, actor, {
          order_id: ord.id,
          amount: finalAmt,
          payment_channel: dto.payment_channel || "BANK_QR",
          notes: "Thu đợt cuối khi ký nghiệm thu bàn giao"
        }, ord);
        if (colRes && colRes.success && colRes.data) {
          paidAdd = colRes.data.collected_amount || 0;
          if (colRes.data.raw_order) ord = colRes.data.raw_order;
        }
      }

      var wMonths = Number(ord.warranty_months) || policy.defaultWarrantyMonths;
      var warrantyUntil = addCarpentryMonthsYmd_(todayYmd, wMonths);
      var upd = {
        status: "COMPLETED",
        completion_pct: 100,
        completed_at: nowStr,
        warranty_months: wMonths,
        warranty_until_date: warrantyUntil,
        acceptance_signer: String(dto.acceptance_signer || ord.customer_name).trim(),
        acceptance_notes: String(dto.acceptance_notes || "Khách hàng đã kiểm tra & ký nghiệm thu hoàn thiện").trim(),
        updated_at: nowStr
      };
      app.Data.updateById(ordSheet, ord.id, upd);

      app.Audit.log({ actor: actor, action: "ACCEPTANCE_COMPLETE", entity_type: ordSheet, entity_id: ord.id, entity_number: ord.order_code, after: upd, message: "Nghiệm thu bàn giao " + ord.order_code + " - Bảo hành đến " + warrantyUntil });
      return app.Utils.buildResponse(true, {
        order: sanitizeOrderForActor_(enrichFurnitureOrderRow_(Object.assign({}, ord, upd), todayYmd, policy), actor),
        final_collected: paidAdd,
        warranty_until_date: warrantyUntil
      }, "Đã hoàn tất nghiệm thu đơn " + ord.order_code + " & kích hoạt bảo hành đến " + warrantyUntil + "!");
    }, 15000);

    return toRpcJson_(result);
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "ACCEPTANCE_ERROR"));
  }
}

function apiGetWarrantyTickets(token, filters, page, pageSize) {
  var app = getCore_(token);
  try {
    app.Authorization.requireAny(["warranty.manage", "order.view", "order.view_all", "menu.install_warranty"]);
    filters = filters || {};
    var policy = getCarpentryPolicyConfig_(app);
    var st = String(filters.status || "").trim().toUpperCase();
    var kw = String(filters.keyword || "").trim().toLowerCase();

    var rows = app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.WARRANTY_TICKETS.NAME);
    var out = rows.filter(function(r) {
      if (!r || !r.id) return false;
      if (st && st !== "ALL" && String(r.status || "").toUpperCase() !== st) return false;
      var ph = formatCarpentryPhone_(r.customer_phone);
      if (!kw) return true;
      return String(r.ticket_code || "").toLowerCase().indexOf(kw) !== -1 ||
             String(r.order_code || "").toLowerCase().indexOf(kw) !== -1 ||
             String(r.customer_name || "").toLowerCase().indexOf(kw) !== -1 ||
             ph.toLowerCase().indexOf(kw) !== -1;
    }).map(function(r) {
      return Object.assign({}, r, { customer_phone: formatCarpentryPhone_(r.customer_phone), cost_incurred: Number(r.cost_incurred) || 0 });
    }).reverse();

    var paged = app.Data.paginate(out, page || 1, pageSize || policy.defaultPageSize);
    return toRpcJson_(app.Utils.buildResponse(true, { items: paged.items, pagination: paged.pagination, total: paged.pagination.total }, "Tải danh sách phiếu bảo hành thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "WARRANTY_LIST_ERROR"));
  }
}

function apiSaveWarrantyTicket(token, dto) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.require("warranty.manage");
    dto = dto || {};
    var todayYmd = getCarpentryTodayYmd_(app);
    var nowStr = getCarpentryNowStr_(app);
    var sheet = PROJECT_CONFIG.BUSINESS_SHEETS.WARRANTY_TICKETS.NAME;
    var isUpdate = !!String(dto.id || "").trim();

    if (isUpdate) {
      var upd = {
        status: String(dto.status || "IN_PROGRESS").trim().toUpperCase(),
        repair_notes: String(dto.repair_notes || "").trim(),
        cost_incurred: Math.max(0, Number(dto.cost_incurred) || 0),
        resolved_at: (String(dto.status || "").toUpperCase() === "RESOLVED" || String(dto.status || "").toUpperCase() === "CLOSED") ? nowStr : ""
      };
      if (dto.assigned_tech_id) {
        var tu = app.Data.findRow("USERS", function(u) { return String(u.id) === String(dto.assigned_tech_id); });
        if (tu) { upd.assigned_tech_id = tu.id; upd.assigned_tech_name = tu.full_name || tu.username; }
      }
      if (dto.after_base64) {
        var drvA = saveCarpentryFileToDrive_(app, dto.after_base64, "WARRANTY_AFTER_" + Date.now() + ".jpg", dto.mime_type, String(dto.order_code || "WARRANTY"));
        upd.after_drive_url = drvA.drive_url;
      }
      app.Data.updateById(sheet, dto.id, upd);
      return toRpcJson_(app.Utils.buildResponse(true, Object.assign({ id: dto.id }, upd), "Đã cập nhật phiếu bảo hành!"));
    }

    var ordKey = String(dto.order_id || dto.order_code || "").trim();
    var ord = app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME, function(o) {
      return String(o.id) === ordKey || String(o.order_code || "").toUpperCase() === ordKey.toUpperCase();
    });
    if (!ord) return toRpcJson_(app.Utils.buildResponse(false, null, "Vui lòng chọn đơn hàng gốc cần bảo hành.", "ORDER_NOT_FOUND"));
    var issueDesc = String(dto.issue_desc || "").trim();
    if (!issueDesc) return toRpcJson_(app.Utils.buildResponse(false, null, "Vui lòng mô tả sự cố cần bảo hành.", "MISSING_DESC"));

    var techName = "";
    if (dto.assigned_tech_id) {
      var tUser = app.Data.findRow("USERS", function(u) { return String(u.id) === String(dto.assigned_tech_id); });
      if (tUser) techName = tUser.full_name || tUser.username;
    }

    var beforeUrl = "";
    if (dto.before_base64) {
      beforeUrl = saveCarpentryFileToDrive_(app, dto.before_base64, "WARRANTY_BEFORE_" + Date.now() + ".jpg", dto.mime_type, ord.order_code).drive_url;
    }

    var row = {
      id: app.Utils.generateUUID(),
      ticket_code: generateDailyCarpentryCode_(app.Data.getAll(sheet), "ticket_code", "BH", todayYmd),
      order_id: ord.id,
      order_code: ord.order_code,
      customer_id: ord.customer_id,
      customer_name: ord.customer_name,
      customer_phone: ord.customer_phone,
      site_address: ord.site_address,
      issue_desc: issueDesc,
      assigned_tech_id: String(dto.assigned_tech_id || ""),
      assigned_tech_name: techName,
      before_drive_url: beforeUrl,
      after_drive_url: "",
      repair_notes: "",
      cost_incurred: 0,
      status: "OPEN",
      reported_at: nowStr,
      resolved_at: "",
      created_at: nowStr
    };
    app.Data.insertOne(sheet, row);
    app.Audit.log({ actor: actor, action: "WARRANTY_OPEN", entity_type: sheet, entity_id: row.id, entity_number: row.ticket_code, after: row, message: "Mở phiếu bảo hành " + row.ticket_code + " cho đơn " + ord.order_code });
    return toRpcJson_(app.Utils.buildResponse(true, Object.assign({}, row, { customer_phone: formatCarpentryPhone_(row.customer_phone) }), "Đã mở phiếu bảo hành " + row.ticket_code + "!"));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "WARRANTY_SAVE_ERROR"));
  }
}

function apiGetCashTransactions(token, filters, page, pageSize) {
  var app = getCore_(token);
  try {
    app.Authorization.requireAny(["cash.view", "material.expense_create", "report.view", "menu.reports_cash"]);
    filters = filters || {};
    var policy = getCarpentryPolicyConfig_(app);
    var todayYmd = getCarpentryTodayYmd_(app);
    var txTypeFilter = String(filters.tx_type || "").trim().toUpperCase();

    var all = app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.CASH_TRANSACTIONS.NAME);
    var totalIn = 0, totalOut = 0, todayIn = 0, todayOut = 0;
    var out = [];

    for (var i = 0; i < all.length; i++) {
      var t = all[i];
      if (!t || !t.id) continue;
      var amt = Number(t.amount) || 0;
      if (t.tx_type === "IN") {
        totalIn += amt;
        if (String(t.tx_date || "").substring(0, 10) === todayYmd) todayIn += amt;
      } else {
        totalOut += amt;
        if (String(t.tx_date || "").substring(0, 10) === todayYmd) todayOut += amt;
      }
      if (txTypeFilter && txTypeFilter !== "ALL" && t.tx_type !== txTypeFilter) continue;
      out.push(Object.assign({}, t, { amount: amt }));
    }
    out.reverse();

    var opening = policy.openingCashBalance;
    var paged = app.Data.paginate(out, page || 1, pageSize || policy.defaultPageSize);
    return toRpcJson_(app.Utils.buildResponse(true, {
      items: paged.items,
      pagination: paged.pagination,
      total: paged.pagination.total,
      summary: {
        opening_balance: opening,
        today_in: todayIn,
        today_out: todayOut,
        total_in: totalIn,
        total_out: totalOut,
        closing_balance: opening + totalIn - totalOut
      }
    }, "Tải sổ quỹ xưởng thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "CASH_LIST_ERROR"));
  }
}

function apiCreateCashTransaction(token, dto) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.require("material.expense_create");
    dto = dto || {};
    var txType = String(dto.tx_type || "OUT").toUpperCase() === "IN" ? "IN" : "OUT";
    var category = String(dto.category || (txType === "OUT" ? "MATERIAL_PURCHASE" : "OTHER_IN")).toUpperCase();
    var amount = Math.max(0, Number(dto.amount) || 0);
    if (amount <= 0) return toRpcJson_(app.Utils.buildResponse(false, null, "Số tiền giao dịch phải lớn hơn 0.", "INVALID_AMOUNT"));

    var todayYmd = getCarpentryTodayYmd_(app);
    var nowStr = getCarpentryNowStr_(app);
    var stockUpdatedNote = "";

    // Nếu chi nhập kho vật tư (`MATERIAL_PURCHASE`) gắn `material_id` + `qty` -> tự cộng tồn kho!
    if (dto.material_id && Number(dto.qty) > 0 && category === "MATERIAL_PURCHASE") {
      var matSheet = PROJECT_CONFIG.BUSINESS_SHEETS.MATERIAL_CATALOG.NAME;
      var mat = app.Data.findRow(matSheet, function(m) { return String(m.id) === String(dto.material_id); });
      if (mat) {
        var addQty = Number(dto.qty) || 0;
        var newStock = (Number(mat.stock_qty) || 0) + addQty;
        app.Data.updateById(matSheet, mat.id, { stock_qty: newStock, updated_at: nowStr });
        stockUpdatedNote = " (+Nhập " + addQty + " " + mat.unit + " " + mat.item_name + " → Tồn " + newStock + ")";
      }
    }

    var linkedOrd = null;
    if (dto.order_id) {
      linkedOrd = app.Data.findRow(PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME, function(o) {
        return String(o.id) === String(dto.order_id) || String(o.order_code) === String(dto.order_id);
      });
    }

    var txSheet = PROJECT_CONFIG.BUSINESS_SHEETS.CASH_TRANSACTIONS.NAME;
    var row = {
      id: app.Utils.generateUUID(),
      tx_code: generateDailyCarpentryCode_(app.Data.getAll(txSheet), "tx_code", "TC", todayYmd),
      tx_type: txType,
      category: category,
      payment_channel: String(dto.payment_channel || "BANK_TRANSFER").toUpperCase(),
      amount: amount,
      order_id: linkedOrd ? linkedOrd.id : "",
      order_code: linkedOrd ? linkedOrd.order_code : "",
      customer_name: linkedOrd ? linkedOrd.customer_name : "",
      description: String(dto.description || "Giao dịch quỹ xưởng mộc").trim() + stockUpdatedNote,
      performed_by: String(actor.id),
      performed_by_name: String(actor.full_name || actor.username),
      tx_date: String(dto.tx_date || todayYmd).substring(0, 10),
      created_at: nowStr
    };
    app.Data.insertOne(txSheet, row);

    if (linkedOrd) recalculateOrderFinancials_(app, linkedOrd.id, nowStr, linkedOrd);

    return toRpcJson_(app.Utils.buildResponse(true, row, "Đã ghi sổ quỹ " + row.tx_code + "!" + stockUpdatedNote));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "CASH_CREATE_ERROR"));
  }
}

function apiGetCarpentryDashboard(token) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.requireAny([
      "menu.dashboard", "menu.surveys", "menu.orders", "menu.drawings", "menu.production",
      "menu.materials", "menu.payments", "menu.install_warranty", "menu.customers", "menu.reports_cash",
      "order.view", "order.view_all", "debt.view", "warranty.manage", "report.view", "profit_report.view"
    ]);
    var policy = getCarpentryPolicyConfig_(app);
    var todayYmd = getCarpentryTodayYmd_(app);

    var canViewFinancials = actorHasAnyPerm_(actor, ["order.view_all", "report.view", "profit_report.view", "payment.create", "debt.view"]);
    var canViewDebt = actorHasAnyPerm_(actor, ["debt.view", "payment.create", "order.view_all"]);
    var canViewMaterials = actorHasAnyPerm_(actor, ["material.estimate", "material.issue", "material.expense_create", "menu.materials", "order.view_all"]);

    var orders = app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME);
    var catalog = canViewMaterials ? app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.MATERIAL_CATALOG.NAME) : [];
    var payments = canViewDebt ? app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.ORDER_PAYMENTS.NAME) : [];

    var inProd = 0, installing = 0, upcomingDue = 0, delayedCount = 0, awaitingDrawing = 0;
    var activeValue = 0, totalDebt = 0;
    var alertOrders = [];

    for (var i = 0; i < orders.length; i++) {
      var raw = orders[i];
      if (!raw || !raw.id || raw.status === "CANCELLED") continue;
      var o = enrichFurnitureOrderRow_(raw, todayYmd, policy);
      if (o.status === "DEPOSITED" || o.status === "IN_PRODUCTION" || o.status === "READY_TO_SHIP") {
        inProd++;
        if (canViewFinancials) activeValue += o.total_amount;
      }
      if (o.status === "INSTALLING") {
        installing++;
        if (canViewFinancials) activeValue += o.total_amount;
      }
      if (o.drawing_status !== "APPROVED" && o.status !== "COMPLETED") awaitingDrawing++;
      if (o.days_to_due !== null && o.days_to_due >= 0 && o.days_to_due <= policy.upcomingDeliveryDays && ["DEPOSITED", "IN_PRODUCTION", "READY_TO_SHIP", "INSTALLING"].indexOf(o.status) !== -1) {
        upcomingDue++;
      }
      if (o.is_late || o.is_urgent_delay) {
        delayedCount++;
        alertOrders.push(sanitizeOrderForActor_(o, actor));
      }
      if (canViewDebt) totalDebt += o.debt_amount;
    }

    var dueStagePayments = canViewDebt ? payments.filter(function(p) { return p && p.status === "DUE"; }) : [];
    var lowStockItems = canViewMaterials ? catalog.filter(function(m) {
      if (!m || !m.id || m.catalog_kind === "ITEM_TEMPLATE") return false;
      return (Number(m.stock_qty) || 0) <= (Number(m.min_stock_qty) || policy.lowStockThresholdDefault);
    }) : [];

    return toRpcJson_(app.Utils.buildResponse(true, {
      today: todayYmd,
      permissions: {
        can_view_financials: canViewFinancials,
        can_view_debt: canViewDebt,
        can_view_materials: canViewMaterials
      },
      kpi: {
        in_production_count: inProd,
        installing_count: installing,
        upcoming_due_count: upcomingDue,
        delayed_or_urgent_count: delayedCount,
        awaiting_drawing_count: awaitingDrawing,
        active_orders_value: canViewFinancials ? activeValue : null,
        total_debt_receivable: canViewDebt ? totalDebt : null,
        due_stage_payments_count: canViewDebt ? dueStagePayments.length : null,
        low_stock_materials_count: canViewMaterials ? lowStockItems.length : null
      },
      urgent_orders: alertOrders.slice(0, 8),
      due_payments: dueStagePayments.slice(0, 8),
      low_stock_materials: lowStockItems.slice(0, 8)
    }, "Tải Dashboard Xưởng Mộc thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "DASHBOARD_ERROR"));
  }
}

function apiGetCarpentryReports(token, filters) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.requireAny(["report.view", "profit_report.view"]);
    filters = filters || {};
    var todayYmd = getCarpentryTodayYmd_(app);
    var monthKey = String(filters.month_key || todayYmd.substring(0, 7)).trim();
    var canSeeProfit = actorHasPerm_(actor, "profit_report.view");

    var orders = app.Data.getAll(PROJECT_CONFIG.BUSINESS_SHEETS.FURNITURE_ORDERS.NAME);
    var totalContractSigned = 0, totalCollected = 0, totalMatCost = 0, totalExtraCost = 0;
    var projectRows = [];
    var partnerMap = {};

    for (var i = 0; i < orders.length; i++) {
      var o = orders[i];
      if (!o || !o.id || o.status === "CANCELLED") continue;
      if (monthKey && String(o.signed_date || o.created_at || "").substring(0, 7) !== monthKey) continue;

      var tAmt = Number(o.total_amount) || 0;
      var pAmt = Number(o.paid_amount) || 0;
      var mCost = Number(o.material_cost_total) || 0;
      var eCost = Number(o.labor_extra_cost) || 0;
      var gp = tAmt - mCost - eCost;

      totalContractSigned += tAmt;
      totalCollected += pAmt;
      totalMatCost += mCost;
      totalExtraCost += eCost;

      var partner = String(o.partner_name || "Khách trực tiếp").trim();
      partnerMap[partner] = (partnerMap[partner] || 0) + tAmt;

      projectRows.push({
        order_code: o.order_code,
        customer_name: o.customer_name,
        title: o.title,
        status: o.status,
        total_amount: tAmt,
        paid_amount: pAmt,
        material_cost_total: canSeeProfit ? mCost : null,
        labor_extra_cost: canSeeProfit ? eCost : null,
        gross_profit: canSeeProfit ? gp : null,
        gross_margin_pct: (canSeeProfit && tAmt > 0) ? Number(((gp / tAmt) * 100).toFixed(1)) : null
      });
    }

    var totalCostAll = totalMatCost + totalExtraCost;
    var grossProfitAll = totalContractSigned - totalCostAll;
    var marginAll = totalContractSigned > 0 ? Number(((grossProfitAll / totalContractSigned) * 100).toFixed(1)) : 0;

    return toRpcJson_(app.Utils.buildResponse(true, {
      month_key: monthKey,
      can_see_profit: canSeeProfit,
      summary: {
        total_contract_signed: totalContractSigned,
        total_collected: totalCollected,
        total_material_and_extra_cost: canSeeProfit ? totalCostAll : null,
        estimated_gross_profit: canSeeProfit ? grossProfitAll : null,
        gross_margin_pct: canSeeProfit ? marginAll : null,
        orders_count: projectRows.length
      },
      project_profit_list: projectRows.reverse(),
      partner_revenue: Object.keys(partnerMap).map(function(k) { return { partner_name: k, revenue: partnerMap[k] }; })
    }, "Tải báo cáo Lãi/Lỗ xưởng thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "REPORT_ERROR"));
  }
}
