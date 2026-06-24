import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint: string;
}

/**
 * Empty state có icon + tiêu đề + hướng dẫn ngắn — thay cho placeholder text thuần,
 * áp dụng cho 5 khối (Việc cần làm/Nhắc việc/Thói quen/Ghi chú/Thông báo). Port từ
 * `emptyStateHtml()` trong docs/mockup/index.html.
 */
export function EmptyState({ icon: Icon, title, hint }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon className="icon" size={21} />
      </span>
      <span className="empty-title">{title}</span>
      <span className="empty-hint">{hint}</span>
    </div>
  );
}
