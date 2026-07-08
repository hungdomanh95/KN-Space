import type { LogEntry, Space } from '../../types';

/**
 * Actions cho Nhật ký nhanh (`docs/features/nhat-ky-nhanh.md`). Khác Task/Note: LogEntry BẤT
 * BIẾN (mục 6.1 tài liệu) — không có action update/reorder, chỉ tạo và xoá (đơn + hàng loạt).
 *
 * `LOG_DELETE_MANY` phục vụ bulk-select-delete (mục 3.3 tài liệu) — xoá N id trong 1 lần
 * cập nhật state thay vì dispatch N lần riêng lẻ (tránh N lần re-render + N lần trigger effect
 * debounce-save không cần thiết).
 */
export type LogAction =
  | { type: 'LOG_CREATE'; payload: { content: string; createdBy?: string } }
  | { type: 'LOG_DELETE'; payload: { id: string } }
  | { type: 'LOG_DELETE_MANY'; payload: { ids: string[] } };

export function logsReducer(space: Space, action: LogAction): Space {
  switch (action.type) {
    case 'LOG_CREATE': {
      // Validate lại ở tầng reducer (không chỉ ở UI) — phòng trường hợp dispatch trực tiếp
      // (test, hoặc code khác gọi sau này) gửi content rỗng/toàn khoảng trắng.
      const content = action.payload.content.trim();
      if (!content) return space;
      const newLog: LogEntry = {
        id: crypto.randomUUID(),
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
    default:
      return space;
  }
}
