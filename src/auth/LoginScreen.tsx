import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function LoginScreen() {
  const [status, setStatus] = useState<'idle' | 'redirecting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleGoogleLogin() {
    setStatus('redirecting');
    setErrorMessage('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
    }
    // Thành công: trình duyệt redirect sang Google ngay, không cần xử lý gì thêm ở đây.
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 text-[var(--text)]">
      <div className="w-full max-w-[360px] rounded-2xl border border-[var(--border)] bg-[var(--modal-bg)] p-8 shadow-[var(--shadow)]">
        <h1 className="mb-1 text-xl font-semibold">KN-Space</h1>
        <p className="mb-6 text-sm text-[var(--text-dim)]">Đăng nhập để mở dashboard của bạn.</p>

        {status === 'error' && <p className="mb-3 text-xs text-[var(--reminder-color)]">{errorMessage}</p>}

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={status === 'redirecting'}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm font-medium text-[var(--text)] disabled:opacity-60"
        >
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C39.205 36.696 44 30.5 44 24c0-1.341-.138-2.65-.389-3.917z" />
          </svg>
          {status === 'redirecting' ? 'Đang chuyển sang Google...' : 'Đăng nhập bằng Google'}
        </button>
      </div>
    </div>
  );
}
