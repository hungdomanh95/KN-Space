import { useState } from 'react';
import type React from 'react';
import { Home, Settings as SettingsIcon } from 'lucide-react';
import { SpaceSwitcher } from '../features/spaces/SpaceSwitcher';
import { SettingsModal } from '../features/settings/SettingsModal';

interface DashboardCornerProps {
  onGoHome: () => void;
  /** Mobile: chỉ cần chuyển Space, không cần về Home/mở Settings (xem AppLayout) — ẩn 2 nút đó,
   * chỉ còn SpaceSwitcher, và đổi sang dạng thanh full-width dính đáy màn hình thay vì card nổi. */
  compact?: boolean;
  className?: string;
  rootRef?: React.Ref<HTMLDivElement>;
  draggable?: boolean;
  onMouseDownCapture?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
}

/**
 * Widget điều hướng — kéo-thả tự do được như mọi khối khác trong hệ thống layout
 * (xem AppLayout/useDashboardLayout), nhưng chiều cao LUÔN cố định theo nội dung thật
 * ('settings' nằm trong HEIGHT_LOCKED_IDS) vì chỉ có 1 dòng icon, không có gì co giãn thêm.
 * 3 phần ngang: nút Home icon-only, Space-switcher (flex:1, nội dung căn giữa), nút Settings
 * icon-only. Luôn hiện, không phụ thuộc enabledBlocks của Space nào (xem requirements mục 4.1).
 */
export function DashboardCorner({
  onGoHome,
  compact,
  className,
  rootRef,
  draggable,
  onMouseDownCapture,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: DashboardCornerProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div
      id="dashboard-corner"
      ref={rootRef}
      role="group"
      aria-label={compact ? 'Chuyển space' : 'Về Home, chuyển space và cài đặt'}
      draggable={draggable}
      onMouseDownCapture={onMouseDownCapture}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative z-[5] flex flex-none items-center gap-2 border-[color:var(--border-hairline)]
        bg-[color-mix(in_srgb,var(--panel-bg)_88%,transparent)] [backdrop-filter:blur(14px)_saturate(1.15)]
        dark:bg-[color-mix(in_srgb,var(--panel-bg)_90%,transparent)] ${
          compact
            ? 'w-full justify-center border-b px-3 py-2.5'
            : 'justify-between rounded-xl border px-[9px] py-[7px] shadow-[0_4px_16px_rgba(10,12,40,.10),0_1px_4px_rgba(10,12,40,.08)]'
        } ${className ?? ''}`.trim()}
    >
      {!compact && (
        <button
          id="dashboard-corner-home-btn"
          type="button"
          onClick={onGoHome}
          title="Về Home"
          aria-label="Về Home"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] border
            border-[color:var(--border)] bg-[var(--raised)] text-[var(--text-dim)] transition-[color,border-color]
            duration-150 hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
        >
          <Home className="icon h-4 w-4" size={16} />
        </button>
      )}
      <SpaceSwitcher />
      {!compact && (
        <button
          id="dashboard-corner-settings-btn"
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Cài đặt"
          aria-label="Cài đặt"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] border
            border-[color:var(--border)] bg-[var(--raised)] text-[var(--text-dim)] transition-[color,border-color]
            duration-150 hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
        >
          <SettingsIcon className="icon h-4 w-4" size={16} />
        </button>
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
