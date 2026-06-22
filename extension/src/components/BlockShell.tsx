import React from 'react';
import { Eye, EyeOff, GripVertical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconChip } from './IconChip';

interface BlockShellProps {
  /** id DOM dùng cho áp flex từ layout — không bắt buộc nếu component tự quản lý flex qua style. */
  domId?: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  headerActions?: React.ReactNode;
  /** Render khi không collapsed: toolbar phụ (filter/search/...) — tự ẩn theo collapsed ở caller nếu cần. */
  children: React.ReactNode;
  /** Render LUÔN bất kể collapsed (vd. modal sửa/tạo đang mở từ trước khi ẩn khối). */
  modals?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  /** Gắn vào block-head cho drag-reorder khối chính (chỉ dùng ở 3 khối chính). */
  headRef?: React.Ref<HTMLDivElement>;
  onHeadMouseDown?: () => void;
  /**
   * Khi BlockShell ĐÓNG VAI khối chính (Ghi chú/Thông báo) thay vì khối phụ trong combined,
   * các prop dưới đây gắn thẳng vào root div của BlockShell — KHÔNG bọc thêm 1 div .main-block
   * ngoài nữa, vì BlockShell đã tự thêm class "main-block" qua `className`. Bọc thêm sẽ tạo 2
   * panel border/shadow lồng nhau ("card chồng card"), trong khi div trong chỉ cao theo nội
   * dung (không có flex riêng) nên lộ ra như 1 card nhỏ nổi trong 1 card to.
   */
  rootRef?: React.Ref<HTMLDivElement>;
  draggable?: boolean;
  onMouseDownCapture?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
}

export function BlockShell({
  domId,
  icon,
  iconBg,
  iconColor,
  title,
  collapsed,
  onToggleCollapsed,
  headerActions,
  children,
  modals,
  style,
  className,
  headRef,
  onHeadMouseDown,
  rootRef,
  draggable,
  onMouseDownCapture,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: BlockShellProps) {
  return (
    <div
      id={domId}
      ref={rootRef}
      className={`sub-block ${className ?? ''}`.trim()}
      style={style}
      draggable={draggable}
      onMouseDownCapture={onMouseDownCapture}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="block-head" ref={headRef} onMouseDown={onHeadMouseDown}>
        <h2>
          <span className="grip-handle" aria-hidden="true">
            <GripVertical className="icon" size={13} />
          </span>
          <IconChip icon={icon} background={iconBg} color={iconColor} />
          <span className="title-text">{title}</span>
        </h2>
        <div className="head-actions">
          {!collapsed && headerActions}
          {headerActions && <span className="head-divider" />}
          <button
            className="head-eye-btn"
            onClick={onToggleCollapsed}
            title={collapsed ? `Hiện nội dung ${title}` : `Ẩn nội dung ${title}`}
            aria-label={collapsed ? `Hiện nội dung ${title}` : `Ẩn nội dung ${title}`}
          >
            {collapsed ? <EyeOff className="icon" size={14} /> : <Eye className="icon" size={14} />}
          </button>
        </div>
      </div>
      {collapsed ? (
        <div className="collapsed-placeholder">
          <EyeOff className="icon" size={18} />
          <span>Đã ẩn nội dung &quot;{title}&quot;</span>
        </div>
      ) : (
        children
      )}
      {modals}
    </div>
  );
}
