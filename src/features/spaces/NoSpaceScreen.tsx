import { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { SpaceFormModal } from './SpaceFormModal';

/**
 * Màn hình thân thiện khi `state.spaces` rỗng (không có Space cá nhân LẪN Space chung nào) —
 * thay cho crash trắng màn hình trước đây do `useCurrentSpace()` throw cứng (xem
 * docs/features/storage-architecture-fix-progress.md mục Bước 3b). Xảy ra khi:
 * - User cũ có hàng `kn_space_state` nhưng chưa migrate dữ liệu Space sang `kn_private_spaces`
 *   (Bước 4, chưa chạy).
 * - Về lâu dài: user lỡ xoá hết Space chung, tự nó không phải lỗi migration.
 *
 * Chỉ render ở `AppLayout` — nơi DUY NHẤT thực sự cần 1 Space "đang mở" để dựng layout Dashboard.
 * Không cần điều hướng gì thêm ở đây (Home/Settings đều không cần Space nào để hoạt động) — chỉ
 * cần 1 lối thoát duy nhất: tạo Space mới. `SPACE_CREATE` tự set `currentSpaceId` sang Space vừa
 * tạo (xem appReducer.ts) nên sau khi tạo xong, `AppLayout` tự re-render sang layout Dashboard
 * bình thường, không cần xử lý điều hướng thủ công ở đây.
 */
export function NoSpaceScreen() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div id="dashboard" className="flex min-h-0 flex-1 items-center justify-center bg-transparent p-3.5">
      <div className="flex max-w-[360px] flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgba(var(--accent-rgb),.1)] text-[var(--accent)]">
          <FolderPlus className="icon" size={26} />
        </span>
        <h2 className="text-[1.0625rem] font-bold text-[var(--text)]">Chưa có Space nào</h2>
        <p className="text-[0.875rem] leading-[1.5] text-[var(--text-dim)]">
          Tài khoản của bạn hiện chưa có Space cá nhân hay Space chung nào để làm việc. Tạo 1 Space
          mới để bắt đầu — Việc cần làm, Ghi chú, Thói quen... đều gắn với 1 Space cụ thể.
        </p>
        <button type="button" className="btn-primary mt-1" onClick={() => setShowForm(true)}>
          <FolderPlus className="icon" size={15} />
          Tạo Space mới
        </button>
      </div>

      {showForm && <SpaceFormModal space={null} onClose={() => setShowForm(false)} />}
    </div>
  );
}
