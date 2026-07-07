interface LoadingScreenProps {
  message: string;
}

/** Màn loading dùng chung (kiểm tra đăng nhập / tải dữ liệu lần đầu) — logo + spinner,
 * thay cho chữ trơn trên nền trắng trước đây. */
export function LoadingScreen({ message }: LoadingScreenProps) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[var(--bg)]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)] text-xl font-extrabold text-white shadow-[0_8px_24px_rgba(var(--accent-rgb),.35)]">
        KN
      </div>
      <div
        className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--accent)]"
        aria-hidden="true"
      />
      <p className="text-sm text-[var(--text-dim)]">{message}</p>
    </div>
  );
}
