/**
 * RpcGateway.gs
 * Cổng RPC mỏng (Thin Delegation Layer) nối `google.script.run` từ giao diện HTML sang Public API của `Core` Library.
 * TUYỆT ĐỐI KHÔNG viết lại logic Xác thực, Phân quyền, Người dùng, Vai trò, Menu, Cấu hình hay Audit tại đây.
 */

// =========================================================================
// 1. XÁC THỰC & PHIÊN LÀM VIỆC (Core.Auth)
// =========================================================================

function apiLogin(payload) {
  return toRpcJson_(getCore_("").Auth.login(payload));
}

function apiCheckSession(token) {
  return toRpcJson_(getCore_(token).Auth.checkSession(token));
}

function apiLogout(token) {
  return toRpcJson_(getCore_(token).Auth.logout(token));
}

function apiChangePassword(token, oldPassword, newPassword) {
  return toRpcJson_(getCore_(token).Auth.changePassword(oldPassword, newPassword));
}

// =========================================================================
// 2. NGƯỜI DÙNG & PHÂN QUYỀN MENU CÁ NHÂN (Core.User & Core.Menu)
// =========================================================================

function apiGetUsersList(token, filters, page, pageSize) {
  return toRpcJson_(getCore_(token).User.list(filters, page, pageSize));
}

function apiCreateUser(token, userData) {
  return toRpcJson_(getCore_(token).User.create(userData));
}

function apiUpdateUser(token, userData) {
  return toRpcJson_(getCore_(token).User.update(userData));
}

function apiToggleUserStatus(token, userId) {
  return toRpcJson_(getCore_(token).User.toggleStatus(userId));
}

function apiResetUserPassword(token, userId, newPassword) {
  return toRpcJson_(getCore_(token).User.resetPassword(userId, newPassword));
}

function apiGetUserMenus(token, userId) {
  return toRpcJson_(getCore_(token).Menu.getUserOverrides(userId));
}

function apiSaveUserMenus(token, userId, overrides) {
  return toRpcJson_(getCore_(token).Menu.saveUserOverrides(userId, overrides));
}

// =========================================================================
// 3. VAI TRÒ & MA TRẬN PHÂN QUYỀN 2 TẦNG (Core.Role & Core.Permission)
// =========================================================================

function apiGetRolesList(token, filters, page, pageSize) {
  return toRpcJson_(getCore_(token).Role.list(filters, page, pageSize));
}

function apiGetRolePermissions(token, roleId) {
  return toRpcJson_(getCore_(token).Permission.getForRole(roleId));
}

function apiSaveRolePermissions(token, roleId, permissionIds) {
  return toRpcJson_(getCore_(token).Permission.saveForRole(roleId, permissionIds));
}

function apiCreateRole(token, roleData) {
  return toRpcJson_(getCore_(token).Role.create(roleData));
}

function apiUpdateRole(token, roleData) {
  return toRpcJson_(getCore_(token).Role.update(roleData));
}

function apiToggleRoleStatus(token, roleId) {
  return toRpcJson_(getCore_(token).Role.toggleStatus(roleId));
}

// =========================================================================
// 4. QUẢN LÝ DANH MỤC MENU ĐIỀU HƯỚNG ĐỘNG (Core.Menu)
// =========================================================================

function apiGetMenusList(token, filters, page, pageSize) {
  return toRpcJson_(getCore_(token).Menu.list(filters, page, pageSize));
}

function apiSaveMenu(token, menuDto) {
  return toRpcJson_(getCore_(token).Menu.save(menuDto));
}

function apiToggleMenuStatus(token, menuId) {
  return toRpcJson_(getCore_(token).Menu.toggleStatus(menuId));
}

// =========================================================================
// 5. CẤU HÌNH HỆ THỐNG, THAM SỐ ĐỘNG & BỘ NHỚ ĐỆM (Core.Config)
// =========================================================================

function apiGetAppSettings(token) {
  return toRpcJson_(getCore_(token).Config.getAll());
}

function apiSaveAppSettings(token, settingsData) {
  return toRpcJson_(getCore_(token).Config.saveBatch(settingsData));
}

function apiUpsertConfigDef(token, defObj) {
  return toRpcJson_(getCore_(token).Config.upsertMeta(defObj));
}

function apiClearSystemCache(token, options) {
  return toRpcJson_(getCore_(token).Config.clearCache(options));
}

// =========================================================================
// 6. NHẬT KÝ HỆ THỐNG & KIỂM TOÁN (Core.Audit)
// =========================================================================

function apiGetAuditLogs(token, filters, page, pageSize) {
  return toRpcJson_(getCore_(token).Audit.list(filters, page, pageSize));
}

function apiGetAuditLogDetail(token, logId) {
  return toRpcJson_(getCore_(token).Audit.getDetail(logId));
}
