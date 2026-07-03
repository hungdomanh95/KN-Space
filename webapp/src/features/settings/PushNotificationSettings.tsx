import { useEffect } from 'react';
import { BellRing, Download } from 'lucide-react';
import { usePushSubscription } from '../notifications/usePushSubscription';

/**
 * Push Notification — Phần 4 (Settings UI).
 * Xem docs/features/push-notification.md mục 3.1/5 và docs/features/push-notification-progress.md (Phần 4).
 */

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const classicIOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ báo UA giống macOS — phân biệt bằng maxTouchPoints (Mac thật không có touch).
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return classicIOS || iPadOS;
}

export function PushNotificationSettings() {
  const push = usePushSubscription();
  const { isSupported, isStandalone, permission, isSubscribed, isBusy, error, canInstall } = push;

  // Mục 3.3: không có API chủ động phát hiện quyền bị thu hồi — chỉ tự kiểm tra lại mỗi khi
  // người dùng mở lại tab Settings (component này chỉ mount khi tab "Chung" đang hiện).
  useEffect(() => {
    push.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let statusText = 'Trình duyệt/thiết bị không hỗ trợ.';
  if (isSupported) {
    if (!isStandalone) statusText = 'Chưa cài ứng dụng.';
    else if (permission === 'denied') statusText = 'Đã cài, quyền thông báo đã bị từ chối.';
    else if (permission !== 'granted') statusText = 'Đã cài, chưa cấp quyền.';
    else statusText = isSubscribed ? 'Đã bật.' : 'Đã cấp quyền, chưa bật.';
  }

  const canToggleOn = isSupported && isStandalone && permission !== 'denied';
  const checked = isSubscribed && permission === 'granted';

  async function handleToggle() {
    if (isBusy) return;
    if (checked) {
      await push.unsubscribe();
      return;
    }
    if (!canToggleOn) return;
    await push.subscribe();
  }

  return (
    <div className="setting-block span-2 col-span-2 mb-5">
      <label className="mb-2.5 flex items-center gap-[7px] text-[0.8438rem] font-bold uppercase tracking-[.03em] text-[var(--text-dim)]">
        <BellRing className="icon h-[13px] w-[13px]" size={13} /> Thông báo đẩy
      </label>

      <div className="flex items-center justify-between gap-3 rounded-[10px] border-[1.5px] border-[color:var(--border)] bg-[var(--raised)] p-3">
        <div className="min-w-0">
          <p className="m-0 text-[0.9062rem] font-semibold text-[var(--text)]">
            Nhận thông báo khi Nhắc việc/Việc cần làm đến hạn
          </p>
          <p className="hint mt-1">{statusText}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label="Bật/tắt thông báo đẩy"
          disabled={isBusy || (!checked && !canToggleOn)}
          onClick={handleToggle}
          className={`relative h-6 w-[42px] flex-none rounded-full border-[1.5px] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
            checked
              ? 'border-[color:var(--accent)] bg-[var(--accent)]'
              : 'border-[color:var(--border-control)] bg-[var(--bg)]'
          }`}
        >
          <span
            className={`absolute top-1/2 h-[17px] w-[17px] -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-150 ${
              checked ? 'translate-x-[21px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
      </div>

      {error && (
        <p className="hint mt-2" style={{ color: 'var(--reminder-color)' }}>
          {error}
        </p>
      )}

      {isSupported && !isStandalone && (
        <div className="mt-2.5 rounded-[10px] border border-dashed border-[color:var(--border)] p-3">
          {canInstall ? (
            <>
              <p className="hint mb-2">
                Cài KN-Space vào máy/điện thoại để nhận thông báo đẩy kể cả khi đã đóng ứng dụng.
              </p>
              <button type="button" className="btn-ghost" onClick={() => push.promptInstall()}>
                <Download className="icon h-3.5 w-3.5" size={14} /> Cài ứng dụng
              </button>
            </>
          ) : isIOSDevice() ? (
            <p className="hint">
              Trên iPhone/iPad: mở KN-Space bằng Safari, nhấn icon <strong>Chia sẻ</strong>, chọn{' '}
              <strong>"Thêm vào Màn hình chính"</strong>, rồi mở lại KN-Space từ icon vừa thêm để bật thông báo.
            </p>
          ) : (
            <p className="hint">
              Mở menu trình duyệt và chọn "Cài đặt ứng dụng"/"Thêm vào Màn hình chính" để cài KN-Space, sau đó quay
              lại đây để bật thông báo.
            </p>
          )}
        </div>
      )}

      {isSupported && isStandalone && permission === 'denied' && (
        <p className="hint mt-2.5">
          Thông báo đang bị chặn ở cấp trình duyệt/hệ điều hành cho KN-Space. Vào Cài đặt hệ thống (hoặc Cài đặt
          trang web của trình duyệt) → Thông báo → bật lại cho KN-Space, rồi quay lại đây.
        </p>
      )}
    </div>
  );
}
