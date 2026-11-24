/**
 * Code.gs
 * Điểm vào chính của Web App (doGet) và trình nạp giao diện HTML phân tách (include).
 * Dự án: Base AppScript Project Template
 */

function doGet(e) {
  try {
    var app = getCore_("");
    var forceInit = !!(e && e.parameter && (e.parameter.init === "true" || e.parameter.forceInit === "true"));
    if (!app.isInitialized() || forceInit) {
      app.ensureInitialized(forceInit);
    }

    var template = createHtmlTemplate_("Index");
    template.appCode = PROJECT_CONFIG.APP_CODE;
    template.appName = PROJECT_CONFIG.APP_NAME;
    template.appVersion = PROJECT_CONFIG.APP_VERSION;
    template.coreVersion = app.version || "1.0.0";

    return template.evaluate()
      .setTitle(PROJECT_CONFIG.APP_NAME)
      .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      "<div style='font-family:sans-serif;padding:30px;color:#b91c1c;'>" +
      "<h2>Lỗi khởi động ứng dụng (" + PROJECT_CONFIG.APP_CODE + ")</h2>" +
      "<p>" + String(err && err.message ? err.message : err) + "</p>" +
      "</div>"
    );
  }
}

/**
 * Điểm vào POST quản trị có xác thực Admin (hỗ trợ nạp dữ liệu demo từ CLI sau deploy)
 */
function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    if (body && body.action === "seed_demo") {
      var app = getCore_("");
      if (!app.isInitialized()) app.ensureInitialized(false);
      var loginRes = app.Auth.login({ username: body.username || "", password: body.password || "" });
      if (!loginRes || !loginRes.success || !loginRes.data || !loginRes.data.token) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Xác thực quản trị thất bại." })).setMimeType(ContentService.MimeType.JSON);
      }
      var res = apiSeedCarpentryDemoData(loginRes.data.token, { reset: body.reset !== false });
      return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Unsupported action." })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: String(err && err.message ? err.message : err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

function resolveHtmlCandidates_(filename) {
  var name = String(filename || "").trim();
  if (name.indexOf("/") !== -1) {
    return [name];
  }
  if (name.indexOf("Page_") === 0) {
    return ["pages/" + name, name, "ui/" + name];
  }
  return ["ui/" + name, name, "pages/" + name];
}

/**
 * Tìm nạp Template HTML hỗ trợ cả đường dẫn thư mục con của clasp (ui/..., pages/...) và tên phẳng
 */
function createHtmlTemplate_(filename) {
  var candidates = resolveHtmlCandidates_(filename);
  var lastErr = null;
  for (var i = 0; i < candidates.length; i++) {
    try {
      return HtmlService.createTemplateFromFile(candidates[i]);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Không tìm thấy file HTML: " + filename);
}

/**
 * Nhúng các thành phần CSS, JS và trang con vào Index.html
 * Ví dụ: <?!= include('ui/Css') ?>, <?!= include('ui/Js_App') ?>, <?!= include('pages/Page_Surveys') ?>
 */
function include(filename) {
  var candidates = resolveHtmlCandidates_(filename);
  var lastErr = null;
  for (var i = 0; i < candidates.length; i++) {
    try {
      return HtmlService.createHtmlOutputFromFile(candidates[i]).getContent();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Không tìm thấy partial HTML: " + filename);
}
