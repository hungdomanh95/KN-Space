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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          borderRadius: '20px',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--modal-bg)',
          padding: '40px 32px',
          boxShadow: 'var(--shadow)',
          textAlign: 'center',
        }}
      >
        {/* Logo / wordmark */}
        <p
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--accent)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: '24px',
          }}
        >
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
            icon={
              <span style={{ fontSize: '2.5rem', lineHeight: 1 }}>
                🎉
              </span>
            }
            title={`Bạn đã tham gia Space "${status.spaceName}"!`}
            subtitle="Space đã được thêm vào danh sách của bạn."
          >
            <button
              type="button"
              onClick={onCancel}
              style={btnPrimaryStyle}
            >
              Vào Space ngay
            </button>
          </StatusView>
        )}

        {status.phase === 'error' && (
          <StatusView
            icon={
              <span style={{ fontSize: '2rem', lineHeight: 1, color: 'var(--reminder-color)' }}>
                ✕
              </span>
            }
            title="Lời mời không hợp lệ hoặc đã hết hạn"
            subtitle={status.message}
          >
            <button
              type="button"
              onClick={onCancel}
              style={btnSecondaryStyle}
            >
              Về trang chủ
            </button>
          </StatusView>
        )}

        {status.phase === 'no-token' && (
          <StatusView
            icon={
              <span style={{ fontSize: '2rem', lineHeight: 1, color: 'var(--text-dim)' }}>
                ?
              </span>
            }
            title="Không tìm thấy lời mời"
            subtitle="Link có vẻ không đúng. Hãy thử yêu cầu người mời gửi lại link."
          >
            <button
              type="button"
              onClick={onCancel}
              style={btnSecondaryStyle}
            >
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
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <h2
        style={{
          fontSize: '1.0625rem',
          fontWeight: 600,
          marginBottom: '8px',
          lineHeight: 1.4,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: '0.875rem',
          color: 'var(--text-dim)',
          marginBottom: children ? '24px' : 0,
          lineHeight: 1.5,
        }}
      >
        {subtitle}
      </p>
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
      style={{
        animation: 'kn-spin 0.8s linear infinite',
        color: 'var(--accent)',
      }}
    >
      <style>{`@keyframes kn-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
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
// Styles — inline để không phụ thuộc class CSS global
// ---------------------------------------------------------------------------

const btnPrimaryStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '100%',
  padding: '11px 24px',
  borderRadius: '12px',
  backgroundColor: 'var(--accent)',
  color: '#fff',
  fontWeight: 600,
  fontSize: '0.9375rem',
  cursor: 'pointer',
  border: 'none',
  fontFamily: 'inherit',
};

const btnSecondaryStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '100%',
  padding: '11px 24px',
  borderRadius: '12px',
  backgroundColor: 'transparent',
  color: 'var(--text-dim)',
  fontWeight: 500,
  fontSize: '0.9375rem',
  cursor: 'pointer',
  border: '1px solid var(--border)',
  fontFamily: 'inherit',
};

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
