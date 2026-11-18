/**
 * SampleService.gs
 * Module Nghiệp vụ Mẫu chuẩn mực minh họa cách phát triển tính năng dự án trên nền `Core` Library:
 * - Kiểm tra quyền 2 tầng bằng `app.Authorization.require(...)` / `requireAny(...)`
 * - Lấy thông tin người thao tác bằng `app.Auth.getCurrentUser()`
 * - Đọc/ghi dữ liệu Batch qua `app.Data.*` và khóa giao dịch `app.Utils.withLock(...)`
 * - Phân trang bắt buộc bằng `app.Data.paginate(...)`
 * - Ghi vết kiểm toán qua `app.Audit.log(...)`
 */

var SAMPLE_SHEET_NAME_ = (typeof PROJECT_CONFIG !== "undefined" && PROJECT_CONFIG.BUSINESS_SHEETS && PROJECT_CONFIG.BUSINESS_SHEETS.SAMPLE_ITEMS)
  ? PROJECT_CONFIG.BUSINESS_SHEETS.SAMPLE_ITEMS.NAME
  : "SAMPLE_ITEMS";

/**
 * Lấy danh sách bản ghi mẫu có lọc từ khóa, trạng thái và phân trang bắt buộc
 */
function apiGetSampleItems(token, filters, page, pageSize) {
  var app = getCore_(token);
  try {
    app.Authorization.requireAny(["sample.view", "menu.sample"]);

    filters = filters || {};
    var keyword = String(filters.keyword || "").trim().toLowerCase();
    var statusFilter = String(filters.status || "").trim().toUpperCase();
    var curPage = page || filters.page || 1;
    var curPageSize = pageSize || filters.pageSize || Number(app.Config.get("DEFAULT_PAGE_SIZE", 10)) || 10;

    var rows = app.Data.getAll(SAMPLE_SHEET_NAME_);
    var filtered = [];

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r.id) continue;

      if (keyword) {
        var match = String(r.item_code || "").toLowerCase().indexOf(keyword) !== -1 ||
                    String(r.item_name || "").toLowerCase().indexOf(keyword) !== -1 ||
                    String(r.category || "").toLowerCase().indexOf(keyword) !== -1 ||
                    String(r.notes || "").toLowerCase().indexOf(keyword) !== -1;
        if (!match) continue;
      }

      if (statusFilter && String(r.status || "ACTIVE").toUpperCase() !== statusFilter) {
        continue;
      }

      filtered.push({
        id: String(r.id),
        item_code: String(r.item_code || ""),
        item_name: String(r.item_name || ""),
        category: String(r.category || "Chung"),
        status: String(r.status || "ACTIVE"),
        notes: String(r.notes || ""),
        created_at: String(r.created_at || ""),
        updated_at: String(r.updated_at || ""),
        created_by_id: String(r.created_by_id || "")
      });
    }

    // Mới nhất lên đầu
    filtered.reverse();

    var paged = app.Data.paginate(filtered, curPage, curPageSize);
    return toRpcJson_(app.Utils.buildResponse(true, {
      items: paged.items,
      pagination: paged.pagination,
      total: paged.pagination.total
    }, "Tải danh sách dữ liệu mẫu thành công."));
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "AUTH_OR_SERVER_ERROR"));
  }
}

/**
 * Thêm mới hoặc Cập nhật bản ghi nghiệp vụ mẫu
 */
function apiSaveSampleItem(token, itemDto) {
  var app = getCore_(token);
  try {
    itemDto = itemDto || {};
    var id = String(itemDto.id || "").trim();
    var isUpdate = !!id;

    var actor = app.Authorization.require(isUpdate ? "sample.update" : "sample.create");

    var itemName = String(itemDto.item_name || "").trim();
    var category = String(itemDto.category || "Chung").trim() || "Chung";
    var status = String(itemDto.status || "ACTIVE").trim().toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE";
    var notes = String(itemDto.notes || "").trim();

    if (!itemName) {
      return toRpcJson_(app.Utils.buildResponse(false, null, "Tên bản ghi không được để trống.", "MISSING_NAME"));
    }

    var result = app.Utils.withLock(function() {
      var nowStr = app.Utils.formatDateTime(new Date());
      var allRows = app.Data.getAll(SAMPLE_SHEET_NAME_);

      if (!isUpdate) {
        var prefix = String(app.Config.get("SAMPLE_CODE_PREFIX", "SMP")).trim() || "SMP";
        var itemCode = String(itemDto.item_code || "").trim().toUpperCase();
        if (!itemCode) {
          itemCode = app.Utils.nextCode(allRows, "item_code", prefix, 4);
        } else {
          var dup = allRows.find(function(r) { return String(r.item_code || "").toUpperCase() === itemCode; });
          if (dup) {
            return app.Utils.buildResponse(false, null, "Mã bản ghi '" + itemCode + "' đã tồn tại.", "DUPLICATE_CODE");
          }
        }

        var newRow = {
          id: app.Utils.generateUUID(),
          item_code: itemCode,
          item_name: itemName,
          category: category,
          status: status,
          notes: notes,
          created_at: nowStr,
          updated_at: nowStr,
          created_by_id: actor.id
        };
        app.Data.insertOne(SAMPLE_SHEET_NAME_, newRow);

        app.Audit.log({
          actor: actor,
          action: "CREATE_SAMPLE",
          entity_type: "SAMPLE_ITEMS",
          entity_id: newRow.id,
          entity_number: newRow.item_code,
          after: newRow,
          message: "Tạo mới bản ghi mẫu: " + newRow.item_code + " - " + newRow.item_name
        });

        return app.Utils.buildResponse(true, newRow, "Thêm mới bản ghi thành công!");
      } else {
        var existing = allRows.find(function(r) { return String(r.id) === id; });
        if (!existing) {
          return app.Utils.buildResponse(false, null, "Không tìm thấy bản ghi cần cập nhật.", "NOT_FOUND");
        }

        var updatedFields = {
          item_name: itemName,
          category: category,
          status: status,
          notes: notes,
          updated_at: nowStr
        };
        app.Data.updateById(SAMPLE_SHEET_NAME_, id, updatedFields);

        app.Audit.log({
          actor: actor,
          action: "UPDATE_SAMPLE",
          entity_type: "SAMPLE_ITEMS",
          entity_id: id,
          entity_number: existing.item_code,
          before: existing,
          after: updatedFields,
          message: "Cập nhật bản ghi mẫu: " + existing.item_code
        });

        return app.Utils.buildResponse(true, Object.assign({}, existing, updatedFields), "Cập nhật bản ghi thành công!");
      }
    }, 12000);

    return toRpcJson_(result);
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "FORBIDDEN_OR_ERROR"));
  }
}

/**
 * Xóa bản ghi nghiệp vụ mẫu
 */
function apiDeleteSampleItem(token, itemId) {
  var app = getCore_(token);
  try {
    var actor = app.Authorization.require("sample.delete");
    itemId = String(itemId || "").trim();
    if (!itemId) {
      return toRpcJson_(app.Utils.buildResponse(false, null, "Mã định danh bản ghi không hợp lệ.", "INVALID_ID"));
    }

    var result = app.Utils.withLock(function() {
      var existing = app.Data.findRow(SAMPLE_SHEET_NAME_, function(r) {
        return String(r.id) === itemId;
      });
      if (!existing) {
        return app.Utils.buildResponse(false, null, "Bản ghi không tồn tại hoặc đã bị xóa.", "NOT_FOUND");
      }

      app.Data.deleteById(SAMPLE_SHEET_NAME_, itemId);

      app.Audit.log({
        actor: actor,
        action: "DELETE_SAMPLE",
        entity_type: "SAMPLE_ITEMS",
        entity_id: itemId,
        entity_number: existing.item_code,
        before: existing,
        message: "Xóa bản ghi mẫu: " + existing.item_code + " - " + existing.item_name
      });

      return app.Utils.buildResponse(true, { id: itemId }, "Đã xóa bản ghi thành công!");
    }, 12000);

    return toRpcJson_(result);
  } catch (err) {
    return toRpcJson_(app.Utils.buildResponse(false, null, err.message, "FORBIDDEN_OR_ERROR"));
  }
}
