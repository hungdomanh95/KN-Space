import type { LogEntry, Space } from '../../types';

/**
 * Actions cho Nhật ký nhanh (`docs/features/nhat-ky-nhanh.md`). `content`/`createdAt`/`createdBy`
 * BẤT BIẾN (mục 6.1 tài liệu gốc) — không có action sửa 3 field đó, chỉ tạo và xoá (đơn + hàng loạt).
 *
 * `LOG_DELETE_MANY` phục vụ bulk-select-delete (mục 3.3 tài liệu) — xoá N id trong 1 lần
 * cập nhật state thay vì dispatch N lần riêng lẻ (tránh N lần re-render + N lần trigger effect
 * debounce-save không cần thiết).
 *
 * `LOG_PATCH_EXPENSE` (tính năng Quản lý chi tiêu, `docs/features/quan-ly-chi-tieu.md` mục 9) mở
 * đúng 1 khe hẹp: chỉ patch `expenseDate`/`categoryOverride`/`excluded` — KHÔNG đụng
 * `content`/`createdAt`/`createdBy`, giữ nguyên tính bất biến của phần lõi log. `categoryOverride`
 * dùng `string | null` (khác `expenseDate`/`excluded` dùng optional thường): `null` = xoá override
 * (quay lại auto-detect), `undefined` = không đổi field này trong lần patch — cần phân biệt rõ 2
 * trạng thái vì đây là field có thể "xoá về mặc định", không chỉ "đổi giá trị".
 *
 * `LOG_CREATE.payload.id` (optional) — mirror TASK_CREATE (`reducers/tasks.ts`): cho phép caller
 * (`state/itemPersist.ts` qua `smartDispatch`) tự sinh id TRƯỚC khi gọi reducer, dùng chung đúng id
 * đó cho cả lượt tính descriptor persist item-level lẫn lượt dispatch thật — tránh 2 lần
 * `crypto.randomUUID()` ra 2 id khác nhau cho cùng 1 log vừa tạo (xem docs/features/
 * item-level-entity-tables.md mục 4.2). Absent = reducer tự sinh như cũ (mọi caller khác, vd test).
 */
export type LogAction =
  | { type: 'LOG_CREATE'; payload: { content: string; createdBy?: string; id?: string } }
  | { type: 'LOG_DELETE'; payload: { id: string } }
  | { type: 'LOG_DELETE_MANY'; payload: { ids: string[] } }
  | {
      type: 'LOG_PATCH_EXPENSE';
      payload: { id: string; expenseDate?: string; categoryOverride?: string | null; excluded?: boolean };
    };

export function logsReducer(space: Space, action: LogAction): Space {
  switch (action.type) {
    case 'LOG_CREATE': {
      // Validate lại ở tầng reducer (không chỉ ở UI) — phòng trường hợp dispatch trực tiếp
      // (test, hoặc code khác gọi sau này) gửi content rỗng/toàn khoảng trắng.
      const content = action.payload.content.trim();
      if (!content) return space;
      const newLog: LogEntry = {
        id: action.payload.id ?? crypto.randomUUID(),
        content,
        createdAt: new Date().toISOString(),
        ...(action.payload.createdBy ? { createdBy: action.payload.createdBy } : {}),
      };
      return { ...space, logs: [...space.logs, newLog] };
    }
    case 'LOG_DELETE':
      return { ...space, logs: space.logs.filter((l) => l.id !== action.payload.id) };
    case 'LOG_DELETE_MANY': {
      if (action.payload.ids.length === 0) return space;
      const idsToDelete = new Set(action.payload.ids);
      return { ...space, logs: space.logs.filter((l) => !idsToDelete.has(l.id)) };
    }
    case 'LOG_PATCH_EXPENSE': {
      const { id, expenseDate, categoryOverride, excluded } = action.payload;
      return {
        ...space,
        logs: space.logs.map((l) => {
          if (l.id !== id) return l;
          const next: LogEntry = { ...l };
          if (expenseDate !== undefined) next.expenseDate = expenseDate;
          if (categoryOverride !== undefined) {
            if (categoryOverride === null) delete next.categoryOverride;
            else next.categoryOverride = categoryOverride;
          }
          if (excluded !== undefined) next.excluded = excluded;
          return next;
        }),
      };
    }
    default:
      return space;
  }
}
