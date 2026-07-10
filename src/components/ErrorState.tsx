import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  title: string;
  hint: string;
  onRetry?: () => void;
}

/**
 * Error state có icon + tiêu đề + hướng dẫn + nút "Thử lại" — thay cho fail âm thầm
 * (console.error) khi thao tác Supabase lỗi. Cùng bố cục với EmptyState, dùng
 * --reminder-color làm màu báo lỗi (đúng convention xoá/nguy hiểm đã dùng ở ConfirmModal).
 */
export function ErrorState({ title, hint, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2.5 px-4 py-7 text-center text-[var(--text-dim)] animate-fadeInPop"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[rgba(226,86,111,.1)] text-[var(--reminder-color)]">
        <AlertTriangle className="icon opacity-[.85]" size={21} />
      </span>
      <span className="text-[0.8438rem] font-bold text-[var(--text)]">{title}</span>
      <span className="max-w-[240px] text-[0.7812rem] leading-[1.5]">{hint}</span>
      {onRetry && (
        <button type="button" className="btn-ghost mt-1" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}
