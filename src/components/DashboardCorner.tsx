import { useState } from 'react';
import type React from 'react';
import { Home, Settings as SettingsIcon } from 'lucide-react';
import { SpaceSwitcher } from '../features/spaces/SpaceSwitcher';
import { SettingsModal } from '../features/settings/SettingsModal';

interface DashboardCornerNavProps {
  onGoHome: () => void;
  /** Mobile: không cần nút về Home (xem AppLayout) — ẩn riêng nút đó. */
  compact?: boolean;
  /** Bật khi hàng nav nổi trực tiếp trên ảnh nền (DashboardCornerBlock, desktop) thay vì trên 1
   * card nền ổn định như mọi nơi khác — đổi 2 nút icon + trigger Space-switcher sang "ghost
   * control" (thay cho "dark glass pill" — bị bác vì vẫn đọc như hộp dán lên ảnh): ở trạng thái
   * nghỉ KHÔNG có nền/viền gì cả, chỉ icon/chữ trắng nổi bằng double drop-shadow; nền mờ + blur
   * chỉ xuất hiện khi hover/focus/active. Không dùng cho `DashboardCorner` compact (mobile
   * top-bar) vì nơi đó đã nằm trong thanh nền glass theo theme, không lỗi tông màu — giữ nguyên
   * `--raised` mặc định.
   */
  onPhoto?: boolean;
}

/**
 * Nội dung THUẦN của hàng nav (nút Home, Space-switcher, nút Settings + modal) — KHÔNG có chrome
 * ngoài (id/role/background/border/rounded/shadow/drag-handlers). Tách riêng để dùng chung ở 2
 * nơi cần đúng 1 nội dung nhưng khác chrome bao quanh:
 * - `DashboardCorner` (dưới đây) — thanh top-bar cố định trên mobile (`compact`, full-width).
 * - `DashboardCornerBlock.tsx` — hàng nav bên trong khối gộp "Widget điều hướng + Hôm nay" trên
 *   desktop (chrome do component đó tự quản, xem docs/requirements.md mục 4.1).
 */
export function DashboardCornerNav({ onGoHome, compact, onPhoto }: DashboardCornerNavProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const iconBtnClass = onPhoto
    ? `touch-target-44 flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px]
       bg-transparent text-white opacity-[.92] outline-none
       transition-[background-color,opacity,transform] duration-150 [transition-timing-function:var(--ease-standard)]
       hover:bg-[rgba(0,0,0,.22)] hover:opacity-100 hover:scale-[1.05] hover:[backdrop-filter:blur(6px)_saturate(1.1)]
       active:bg-[rgba(0,0,0,.30)] active:scale-[.96]
       focus-visible:bg-[rgba(0,0,0,.22)] focus-visible:opacity-100 focus-visible:[backdrop-filter:blur(6px)_saturate(1.1)]
       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(255,255,255,.92)]
       focus-visible:shadow-[0_0_0_4px_rgba(0,0,0,.28)]`
    : `touch-target-44 flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] border
       border-[color:var(--border)] bg-[var(--raised)] text-[var(--text-dim)] transition-[color,border-color]
       duration-150 hover:border-[color:var(--accent)] hover:text-[var(--accent)]`;
  const iconClass = onPhoto
    ? 'icon h-4 w-4 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,.65))_drop-shadow(0_2px_5px_rgba(0,0,0,.35))]'
    : 'icon h-4 w-4';

  return (
    <>
      {/* Cụm trái (Home + Space-switcher) — chỉ cụm này chiếm khoảng trống co giãn (`flex-1`) trên
       * desktop, để tên Space neo sát nút Home thay vì tự canh giữa "trôi nổi" giữa Home và Settings
       * (trước đây SpaceSwitcher tự `flex-1` + `w-full justify-center` chiếm hết khoảng trống còn
       * lại nên tạo 2 khoảng trống đối xứng không neo vào đâu). Trên mobile compact, Home bị ẩn nên
       * KHÔNG dùng `flex-1` ở đây nữa — hàng ngoài compact dùng `justify-center` (không phải
       * `justify-between`), nếu wrapper vẫn co giãn thì switcher sẽ bị đẩy dính sát mép trái. */}
      <div className={`flex min-w-0 items-center gap-1.5 ${compact ? '' : 'flex-1'}`}>
        {!compact && (
          <button
            id="dashboard-corner-home-btn"
            type="button"
            onClick={onGoHome}
            title="Về Home"
            aria-label="Về Home"
            style={{ '--touch-inset': '-5px' } as React.CSSProperties}
            className={iconBtnClass}
          >
            <Home className={iconClass} size={16} />
          </button>
        )}
        <SpaceSwitcher compact={compact} onPhoto={onPhoto} />
      </div>
      <button
        id="dashboard-corner-settings-btn"
        type="button"
        onClick={() => setSettingsOpen(true)}
        title="Cài đặt"
        aria-label="Cài đặt"
        style={{ '--touch-inset': '-5px' } as React.CSSProperties}
        className={iconBtnClass}
      >
        <SettingsIcon className={iconClass} size={16} />
      </button>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

interface DashboardCornerProps {
  onGoHome: () => void;
  /** Thanh trên cùng cố định trên mobile (`<DashboardCorner compact />`, xem AppLayout) — tách
   * khỏi hệ layout tự do, luôn full-width dính đầu màn hình, chỉ hiện hàng nav (không có hàng
   * ambient đồng hồ/ngày/quote — hành vi này không đổi kể từ khi gộp `today` vào `settings`, xem
   * docs/requirements.md mục 4.1 AC6). Đây là nơi DUY NHẤT còn dùng `DashboardCorner` — trên
   * desktop, `AppLayout.renderBlock()` case `'settings'` dùng `DashboardCornerBlock` (khối gộp 2
   * hàng) thay vì component này.
   */
  compact?: boolean;
}

export function DashboardCorner({ onGoHome, compact }: DashboardCornerProps) {
  return (
    <div
      id="dashboard-corner"
      role="group"
      aria-label="Chuyển space và cài đặt"
      className="relative z-[5] flex flex-none items-center gap-2 border-b border-[color:var(--border-hairline)]
        bg-[color-mix(in_srgb,var(--panel-bg)_88%,transparent)] [backdrop-filter:blur(14px)_saturate(1.15)]
        dark:bg-[color-mix(in_srgb,var(--panel-bg)_90%,transparent)] w-full justify-center px-3 py-2.5"
    >
      <DashboardCornerNav onGoHome={onGoHome} compact={compact} />
    </div>
  );
}
