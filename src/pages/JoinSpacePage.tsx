// =============================================================================
// JoinSpacePage.tsx — trang xác nhận lời mời tham gia Shared Space
// =============================================================================
// Render khi URL có `?token=<...>` hoặc pathname bắt đầu bằng `/join`.
//
// Flow:
//   1. Đọc token từ URL search params.
//   2. Kiểm tra session qua supabase.auth.getUser():
//      - Chưa đăng nhập → lưu token vào sessionStorage('kn_pending_invite_token'),
//        rồi trigger Google OAuth với redirectTo = origin (Supabase standard flow).
//      - Đã đăng nhập → gọi acceptInvite(token).
//   3. Sau khi accept thành công:
//      - loadSharedSpaces() để lấy full Space object vừa join.
//      - dispatch SPACE_ADD_SHARED.
//      - Xoá token khỏi URL và sessionStorage.
//      - Chuyển về dashboard (dispatch SCREEN_NAVIGATE + replaceState).
// =============================================================================

import { useEffect, useState } from 'react';
import { PartyPopper, XCircle, HelpCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { acceptInvite, loadSharedSpaces } from '../storage/sharedSpaceStore';
import type { Space } from '../types';

export const PENDING_INVITE_KEY = 'kn_pending_invite_token';

// ---------------------------------------------------------------------------
// Helpers — tách riêng để App.tsx import mà không cần import cả component
// ---------------------------------------------------------------------------

/** Đọc token từ URL hiện tại (search params hoặc hash). */
export function readInviteTokenFromUrl(): string | null {
  // Ưu tiên search params (?token=xxx) — đây là format createInviteLink() tạo ra.
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) return token;

  // Fallback: hash mode (#/join?token=xxx) — phòng khi SPA dùng hash routing.
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#\/?/, '').split('?')[1] ?? '');
  return hashParams.get('token');
}

/** Kiểm tra URL hiện tại có phải là trang join không. */
export function isJoinRoute(): boolean {
  const pathname = window.location.pathname;
  const hasTokenParam = new URLSearchParams(window.location.search).has('token');
  const isJoinPath = pathname === '/join' || pathname.startsWith('/join/');
  return isJoinPath || hasTokenParam;
}

/** Xoá token khỏi URL mà không reload trang. */
function clearTokenFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('token');
  // Nếu sau khi xoá token thì pathname là /join và không còn param nào → về /
  const remainingParams = [...url.searchParams.keys()];
  if (url.pathname === '/join' && remainingParams.length === 0) {
    url.pathname = '/';
  }
  window.history.replaceState({}, '', url.toString());
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JoinStatus =
  | { phase: 'checking' }
  | { phase: 'logging-in' }
  | { phase: 'processing' }
  | { phase: 'success'; spaceName: string; spaceId: string }
  | { phase: 'error'; message: string }
  | { phase: 'no-token' };

interface JoinSpacePageProps {
  token: string;
  /** Gọi khi join thành công — App.tsx dùng để dispatch SPACE_ADD_SHARED + navigate dashboard */
  onJoined: (space: Space) => void;
  /** Gọi khi huỷ / về trang chủ mà không cần join */
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JoinSpacePage({ token, onJoined, onCancel }: JoinSpacePageProps) {
  const [status, setStatus] = useState<JoinStatus>({ phase: 'checking' });

  useEffect(() => {
    if (!token) {
      setStatus({ phase: 'no-token' });
      return;
    }

    let cancelled = false;

    (async () => {
      // Bước 1: kiểm tra đã đăng nhập chưa.
      const { data: userData } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!userData.user) {
        // Chưa đăng nhập — lưu token, trigger Google OAuth.
        sessionStorage.setItem(PENDING_INVITE_KEY, token);
        setStatus({ phase: 'logging-in' });

        // Đưa người dùng vào Google OAuth. Sau khi đăng nhập xong, Supabase
        // redirect về `origin` (không kèm /join?token=...) — App.tsx sẽ check
        // sessionStorage('kn_pending_invite_token') để tiếp tục flow.
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        // Không xử lý gì thêm — trình duyệt redirect ngay sau lệnh này.
        return;
      }

      // Bước 2: đã đăng nhập → gọi acceptInvite.
      setStatus({ phase: 'processing' });

      const result = await acceptInvite(token);

      if (cancelled) return;

      if ('error' in result) {
        setStatus({ phase: 'error', message: friendlyError(result.error) });
        return;
      }

      // Bước 3: load lại shared spaces để lấy full Space object.
      let joinedSpace: Space | undefined;
      try {
        const allShared = await loadSharedSpaces();
        joinedSpace = allShared.find((s) => s.sharedSpaceId === result.spaceId || s.id === result.spaceId);
      } catch (err) {
        console.warn('[JoinSpacePage] loadSharedSpaces sau accept lỗi:', err);
      }

      if (cancelled) return;

      if (!joinedSpace) {
        // Hiếm gặp — accept thành công nhưng không fetch được space. Vẫn báo thành công
        // vì user đã là member, lần mở app tiếp theo sẽ load được.
        setStatus({
          phase: 'success',
          spaceName: 'Space mới',
          spaceId: result.spaceId,
        });
        // Xoá token khỏi URL và sessionStorage ngay cả khi không có space object.
        clearTokenFromUrl();
        sessionStorage.removeItem(PENDING_INVITE_KEY);
        return;
      }

      setStatus({
        phase: 'success',
        spaceName: joinedSpace.name,
        spaceId: joinedSpace.id,
      });

      clearTokenFromUrl();
      sessionStorage.removeItem(PENDING_INVITE_KEY);

      // Thông báo ngược lên App.tsx để dispatch + navigate.
      onJoined(joinedSpace);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-6 text-[var(--text)]">
      <div className="w-full max-w-[400px] rounded-2xl border border-[color:var(--border)] bg-[var(--modal-bg)] px-8 py-10 text-center shadow-[var(--shadow)]">
        {/* Logo / wordmark */}
        <p className="mb-6 text-[0.8125rem] font-semibold uppercase tracking-[.06em] text-[var(--accent)]">
          KN-Space
        </p>

        {status.phase === 'checking' && (
          <StatusView
            icon={<Spinner />}
            title="Đang xác nhận lời mời..."
            subtitle="Vui lòng chờ trong giây lát."
          />
        )}

        {status.phase === 'processing' && (
          <StatusView
            icon={<Spinner />}
            title="Đang tham gia Space..."
            subtitle="Đang xử lý lời mời của bạn."
          />
        )}

        {status.phase === 'logging-in' && (
          <StatusView
            icon={<Spinner />}
            title="Đang chuyển sang đăng nhập..."
            subtitle="Bạn cần đăng nhập trước để tham gia Space. Đang mở Google..."
          />
        )}

        {status.phase === 'success' && (
          <StatusView
            icon={<PartyPopper size={40} strokeWidth={1.75} className="text-[var(--accent)]" aria-hidden="true" />}
            title={`Bạn đã tham gia Space "${status.spaceName}"!`}
            subtitle="Space đã được thêm vào danh sách của bạn."
          >
            <button type="button" onClick={onCancel} className="btn-primary w-full justify-center py-[11px] text-[0.9375rem]">
              Vào Space ngay
            </button>
          </StatusView>
        )}

        {status.phase === 'error' && (
          <StatusView
            icon={<XCircle size={32} className="text-[var(--reminder-color)]" aria-hidden="true" />}
            title="Lời mời không hợp lệ hoặc đã hết hạn"
            subtitle={status.message}
          >
            <button type="button" onClick={onCancel} className="btn-ghost w-full justify-center py-[11px] text-[0.9375rem]">
              Về trang chủ
            </button>
          </StatusView>
        )}

        {status.phase === 'no-token' && (
          <StatusView
            icon={<HelpCircle size={32} className="text-[var(--text-dim)]" aria-hidden="true" />}
            title="Không tìm thấy lời mời"
            subtitle="Link có vẻ không đúng. Hãy thử yêu cầu người mời gửi lại link."
          >
            <button type="button" onClick={onCancel} className="btn-ghost w-full justify-center py-[11px] text-[0.9375rem]">
              Về trang chủ
            </button>
          </StatusView>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusView({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex justify-center">{icon}</div>
      <h2 className="mb-2 text-[1.0625rem] font-semibold leading-[1.4]">{title}</h2>
      <p className={`text-[0.875rem] leading-[1.5] text-[var(--text-dim)] ${children ? 'mb-6' : 'mb-0'}`}>{subtitle}</p>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="animate-spin text-[var(--accent)]"
    >
      <circle
        cx="16"
        cy="16"
        r="12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="56"
        strokeDashoffset="40"
        opacity="0.9"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Error message mapping
// ---------------------------------------------------------------------------

function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('expired') || lower.includes('hết hạn')) {
    return 'Lời mời này đã hết hạn. Hãy yêu cầu người mời tạo link mới.';
  }
  if (lower.includes('already') || lower.includes('đã là')) {
    return 'Bạn đã là thành viên của Space này rồi.';
  }
  if (lower.includes('not found') || lower.includes('không tìm thấy') || lower.includes('invalid')) {
    return 'Link mời không tồn tại hoặc đã được dùng trước đó.';
  }
  // Fallback: hiển thị message gốc (tiếng Anh từ DB) nhưng thêm context.
  return raw || 'Có lỗi xảy ra khi xác nhận lời mời. Vui lòng thử lại.';
}
