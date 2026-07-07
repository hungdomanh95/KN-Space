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
    <div className="flex flex-col items-center justify-center gap-2.5 px-4 py-7 text-center text-[var(--text-dim)] animate-fadeInPop">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(var(--accent-rgb),.08)] text-[var(--accent)]">
        <Icon className="icon opacity-[.85]" size={21} />
      </span>
      <span className="text-[0.8438rem] font-bold text-[var(--text)]">{title}</span>
      <span className="max-w-[240px] text-[0.7812rem] leading-[1.5]">{hint}</span>
    </div>
  );
}
