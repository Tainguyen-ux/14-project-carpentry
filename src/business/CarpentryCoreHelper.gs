/**
 * CarpentryCoreHelper.gs
 * Tiện ích Nghiệp vụ Dùng chung cho Xưởng Mộc & Nội thất May đo:
 * - Đọc cấu hình động từ `CONFIG` (công đoạn sản xuất JSON, tỷ lệ thanh toán Đợt 1-2-3, bảo hành...)
 * - Tính kích thước & thành tiền linh hoạt theo 3 chế độ (`MD`, `M2`, `UNIT`)
 * - Tính trạng thái tiến độ, % hoàn thành & cảnh báo trễ hạn / sắp giao
 * - Lưu Bản vẽ kỹ thuật 2D/3D & Ảnh hiện trạng/QC lên Google Drive phân thư mục theo Mã đơn hàng
 */

function parseCarpentryProductionStages_(rawJson) {
  var fallback = [
    { code: "MATERIALS_READY", order: 1, name: "1️⃣ Nhập vật tư ván & PK" },
    { code: "CNC_CUTTING", order: 2, name: "2️⃣ Cắt ván CNC" },
    { code: "EDGE_BANDING", order: 3, name: "3️⃣ Dán cạnh & Khoan cam" },
    { code: "ASSEMBLY", order: 4, name: "4️⃣ Lắp ráp thô" },
    { code: "PU_PAINTING", order: 5, name: "5️⃣ Sơn PU / Hoàn thiện" },
    { code: "QC_PACKED", order: 6, name: "6️⃣ QC & Đóng gói" }
  ];
  try {
    var parsed = typeof rawJson === "string" ? JSON.parse(rawJson) : rawJson;
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (e) {}
  return fallback;
}

function parsePaymentSchedulePcts_(schedStr) {
  var raw = String(schedStr || "40-40-20").trim();
  var parts = raw.split(/[^0-9]+/).map(function(x) { return Number(x) || 0; }).filter(function(x) { return x > 0; });
  if (parts.length < 2) return [40, 40, 20];
  var sum = parts.reduce(function(a, b) { return a + b; }, 0);
  if (sum !== 100 && parts.length >= 2) {
    parts[parts.length - 1] = Math.max(0, 100 - parts.slice(0, -1).reduce(function(a, b) { return a + b; }, 0));
  }
  return parts;
}

function getCarpentryPolicyConfig_(app) {
  var stagesRaw = app.Config.get("PRODUCTION_STAGES_JSON", "");
  var schedStr = String(app.Config.get("PAYMENT_INSTALLMENT_SCHEDULE", "40-40-20")).trim() || "40-40-20";
  return {
    defaultPageSize: Number(app.Config.get("DEFAULT_PAGE_SIZE", 10)) || 10,
    upcomingDeliveryDays: Math.max(1, Number(app.Config.get("UPCOMING_DELIVERY_DAYS", 7)) || 7),
    urgentDelayAlertDays: Math.max(1, Number(app.Config.get("URGENT_DELAY_ALERT_DAYS", 3)) || 3),
    paymentScheduleStr: schedStr,
    paymentInstallmentPcts: parsePaymentSchedulePcts_(schedStr),
    defaultWarrantyMonths: Math.max(1, Number(app.Config.get("DEFAULT_WARRANTY_MONTHS", 24)) || 24),
    requireStage2PayBeforeShip: String(app.Config.get("REQUIRE_STAGE2_PAY_BEFORE_SHIP", "TRUE")).toUpperCase() !== "FALSE",
    productionStages: parseCarpentryProductionStages_(stagesRaw),
    lowStockThresholdDefault: Math.max(1, Number(app.Config.get("LOW_STOCK_THRESHOLD_DEFAULT", 5)) || 5),
    openingCashBalance: Number(app.Config.get("OPENING_CASH_BALANCE", 0)) || 0,
    driveRootFolderName: String(app.Config.get("CARPENTRY_DRIVE_FOLDER_NAME", "CARPENTRY_DRAWINGS_PHOTOS")).trim() || "CARPENTRY_DRAWINGS_PHOTOS"
  };
}

function getCarpentryTodayYmd_(app) {
  return app.Utils.formatDate(new Date());
}

function getCarpentryNowStr_(app) {
  return app.Utils.formatDateTime(new Date());
}

function addCarpentryDaysYmd_(ymdStr, daysToAdd) {
  var s = String(ymdStr || "").trim().substring(0, 10);
  var p = s.split("-");
  var baseMs = p.length === 3
    ? Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10))
    : Date.now();
  var dt = new Date(baseMs + (Number(daysToAdd) || 0) * 86400000);
  var pad = function(n) { return (n < 10 ? "0" : "") + String(n); };
  return dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate());
}

function addCarpentryMonthsYmd_(ymdStr, monthsToAdd) {
  var s = String(ymdStr || "").trim().substring(0, 10);
  var p = s.split("-");
  var dt = p.length === 3
    ? new Date(Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1 + (Number(monthsToAdd) || 0), parseInt(p[2], 10)))
    : new Date();
  var pad = function(n) { return (n < 10 ? "0" : "") + String(n); };
  return dt.getUTCFullYear() + "-" + pad(dt.getUTCMonth() + 1) + "-" + pad(dt.getUTCDate());
}

function diffCarpentryDaysYmd_(fromYmd, toYmd) {
  var s1 = String(fromYmd || "").trim().substring(0, 10).split("-");
  var s2 = String(toYmd || "").trim().substring(0, 10).split("-");
  if (s1.length !== 3 || s2.length !== 3) return 0;
  var ms1 = Date.UTC(parseInt(s1[0], 10), parseInt(s1[1], 10) - 1, parseInt(s1[2], 10));
  var ms2 = Date.UTC(parseInt(s2[0], 10), parseInt(s2[1], 10) - 1, parseInt(s2[2], 10));
  return Math.round((ms2 - ms1) / 86400000);
}

function normalizeCarpentryPhone_(phone) {
  var p = String(phone || "").trim().replace(/\s+/g, "");
  if (!p) return "";
  return p.charAt(0) === "'" ? p : ("'" + p);
}

function formatCarpentryPhone_(phone) {
  var p = String(phone || "").trim();
  return p.charAt(0) === "'" ? p.substring(1) : p;
}

function generateDailyCarpentryCode_(rows, fieldName, prefix, todayYmd) {
  var compactDate = String(todayYmd || "").replace(/-/g, "").substring(0, 8);
  if (compactDate.length !== 8) {
    var d = new Date();
    var pad = function(n) { return (n < 10 ? "0" : "") + String(n); };
    compactDate = String(d.getFullYear()) + pad(d.getMonth() + 1) + pad(d.getDate());
  }
  var head = String(prefix || "NT").toUpperCase() + "-" + compactDate + "-";
  var maxSeq = 0;
  for (var i = 0; i < (rows || []).length; i++) {
    var val = String((rows[i] && rows[i][fieldName]) || "").trim().toUpperCase();
    if (val.indexOf(head) === 0) {
      var seq = parseInt(val.substring(head.length), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  var numStr = String(maxSeq + 1);
  while (numStr.length < 3) numStr = "0" + numStr;
  return head + numStr;
}

function computeOrderItemMetrics_(raw) {
  var mode = String((raw && raw.calc_mode) || "UNIT").trim().toUpperCase();
  if (["MD", "M2", "UNIT"].indexOf(mode) === -1) mode = "UNIT";
  var len = Math.max(0, Number(raw.length_m) || 0);
  var hOrW = Math.max(0, Number(raw.height_or_width_m) || 0);
  var qty = Math.max(1, Number(raw.quantity) || 1);
  var unitPrice = Math.max(0, Number(raw.unit_price) || 0);

  var computedQty = qty;
  var defaultUnit = "Cái";
  if (mode === "MD") {
    computedQty = len > 0 ? Number((len * qty).toFixed(3)) : qty;
    defaultUnit = "md";
  } else if (mode === "M2") {
    computedQty = (len > 0 && hOrW > 0) ? Number((len * hOrW * qty).toFixed(3)) : (len > 0 ? len * qty : qty);
    defaultUnit = "m2";
  }
  var lineTotal = Math.round(computedQty * unitPrice);
  return {
    calc_mode: mode,
    length_m: len,
    height_or_width_m: hOrW,
    quantity: qty,
    computed_qty: computedQty,
    unit: String(raw.unit || defaultUnit).trim() || defaultUnit,
    unit_price: unitPrice,
    line_total: lineTotal
  };
}

function getCarpentryStageInfo_(stages, stageCode) {
  var list = Array.isArray(stages) && stages.length > 0 ? stages : parseCarpentryProductionStages_("");
  var key = String(stageCode || "").trim().toUpperCase();
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].code || "").toUpperCase() === key) return list[i];
  }
  return list[0];
}

function getCarpentryOrderStatusMeta_(code) {
  var key = String(code || "SURVEYING").trim().toUpperCase();
  for (var i = 0; i < CARPENTRY_CONSTANTS.ORDER_STATUSES.length; i++) {
    if (CARPENTRY_CONSTANTS.ORDER_STATUSES[i].code === key) return CARPENTRY_CONSTANTS.ORDER_STATUSES[i];
  }
  return CARPENTRY_CONSTANTS.ORDER_STATUSES[0];
}

function enrichFurnitureOrderRow_(o, todayYmd, policy) {
  var st = String(o.status || "SURVEYING").trim().toUpperCase();
  var meta = getCarpentryOrderStatusMeta_(st);
  var dueStr = String(o.due_date || "").substring(0, 10);
  var daysToDue = dueStr ? diffCarpentryDaysYmd_(todayYmd, dueStr) : 9999;
  var isActiveProd = ["DEPOSITED", "IN_PRODUCTION", "READY_TO_SHIP", "INSTALLING"].indexOf(st) !== -1;
  var isLate = !!(dueStr && isActiveProd && daysToDue < 0);
  var isUrgentDelay = !!(dueStr && isActiveProd && daysToDue <= (policy ? policy.urgentDelayAlertDays : 3) && (Number(o.completion_pct) || 0) < 100);

  return Object.assign({}, o, {
    customer_phone: formatCarpentryPhone_(o.customer_phone),
    subtotal_amount: Number(o.subtotal_amount) || 0,
    discount_amount: Number(o.discount_amount) || 0,
    total_amount: Number(o.total_amount) || 0,
    paid_amount: Number(o.paid_amount) || 0,
    debt_amount: Number(o.debt_amount) || 0,
    material_cost_total: Number(o.material_cost_total) || 0,
    labor_extra_cost: Number(o.labor_extra_cost) || 0,
    gross_profit: Number(o.gross_profit) || 0,
    gross_margin_pct: Number(o.gross_margin_pct) || 0,
    completion_pct: Number(o.completion_pct) || 0,
    warranty_months: Number(o.warranty_months) || 0,
    days_to_due: dueStr ? daysToDue : null,
    is_late: isLate,
    is_urgent_delay: isUrgentDelay,
    status: st,
    status_label: meta.name,
    status_emoji: meta.emoji,
    status_color: isLate ? "#dc2626" : meta.color,
    status_bg: isLate ? "#fef2f2" : meta.bg
  });
}

function saveCarpentryFileToDrive_(app, base64Data, fileName, mimeType, subFolderName) {
  var policy = getCarpentryPolicyConfig_(app);
  if (typeof DriveApp === "undefined" || !DriveApp) {
    throw new Error("DriveApp chưa khả dụng để lưu bản vẽ/ảnh.");
  }
  var rootName = policy.driveRootFolderName;
  var rootIter = DriveApp.getFoldersByName(rootName);
  var rootFolder = rootIter.hasNext() ? rootIter.next() : DriveApp.createFolder(rootName);

  var subName = String(subFolderName || "GENERAL").trim();
  var subIter = rootFolder.getFoldersByName(subName);
  var targetFolder = subIter.hasNext() ? subIter.next() : rootFolder.createFolder(subName);

  var cleanB64 = String(base64Data || "");
  if (cleanB64.indexOf(",") !== -1) cleanB64 = cleanB64.split(",")[1];
  var bytes = Utilities.base64Decode(cleanB64);
  var safeName = String(fileName || ("file_" + Date.now() + ".jpg"));
  var safeMime = String(mimeType || "image/jpeg");
  var blob = Utilities.newBlob(bytes, safeMime, safeName);
  var file = targetFolder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}

  var fileId = file.getId();
  return {
    drive_file_id: fileId,
    drive_url: "https://drive.google.com/uc?export=view&id=" + fileId,
    file_name: file.getName ? file.getName() : safeName,
    mime_type: safeMime,
    file_size: bytes.length || 0
  };
}
