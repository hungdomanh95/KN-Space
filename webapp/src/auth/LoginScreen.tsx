import { useState } from 'react';
import { Mail, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || status === 'sending') return;
    setStatus('sending');
    setErrorMessage('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }
    setStatus('sent');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 text-[var(--text)]">
      <div className="w-full max-w-[360px] rounded-2xl border border-[var(--border)] bg-[var(--modal-bg)] p-8 shadow-[var(--shadow)]">
        <h1 className="mb-1 text-xl font-semibold">KN-Space</h1>
        <p className="mb-6 text-sm text-[var(--text-dim)]">Đăng nhập bằng email để mở dashboard của bạn.</p>

        {status === 'sent' ? (
          <div className="flex items-start gap-2 rounded-xl bg-[color:rgba(34,197,94,0.12)] px-4 py-3 text-sm text-[var(--text)]">
            <CheckCircle2 className="icon mt-px flex-none text-green-500" size={16} />
            <span>
              Đã gửi link đăng nhập tới <strong>{email}</strong>. Mở email và bấm vào link để vào dashboard — chỉ cần
              làm 1 lần trên mỗi thiết bị.
            </span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5">
              <Mail className="icon flex-none text-[var(--text-dim)]" size={16} />
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@email.com"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            {status === 'error' && <p className="text-xs text-[var(--reminder-color)]">{errorMessage}</p>}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {status === 'sending' ? 'Đang gửi...' : 'Gửi link đăng nhập'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
