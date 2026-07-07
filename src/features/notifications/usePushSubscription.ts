import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../auth/AuthContext';
import { getDeferredInstallEvent, promptInstall as promptInstallEvent, subscribeInstallPrompt } from './installPromptStore';

/**
 * Push Notification — Phần 2 (VAPID + Subscription) + Phần 4 (Settings UI, thêm
 * `isStandalone`/`canInstall`/`promptInstall`).
 * Xem docs/features/push-notification.md mục 9.2/5 và
 * docs/features/push-notification-progress.md (Phần 2/4) cho bối cảnh/quyết định kỹ thuật.
 */

export type PushSupportState = 'unsupported' | 'default' | 'denied' | 'granted';

export interface UsePushSubscriptionResult {
  /** Trình duyệt/thiết bị có hỗ trợ Push API + Notification API không. */
  isSupported: boolean;
  /** Trạng thái quyền Notification hiện tại (đồng bộ lại mỗi khi gọi refresh()). */
  permission: NotificationPermission | 'unsupported';
  /** Đã có subscription hợp lệ (đăng ký ở trình duyệt này) hay chưa. */
  isSubscribed: boolean;
  /** Đang xử lý subscribe()/unsubscribe(), dùng để disable UI trong lúc chờ. */
  isBusy: boolean;
  /** Lỗi gần nhất (nếu có) khi subscribe/unsubscribe, để UI hiển thị. */
  error: string | null;
  /** Xin quyền Notification (nếu cần) rồi đăng ký push subscription + lưu vào Supabase. */
  subscribe: () => Promise<void>;
  /** Huỷ đăng ký push subscription ở trình duyệt này + xoá khỏi Supabase. */
  unsubscribe: () => Promise<void>;
  /** Đọc lại `Notification.permission` + trạng thái subscription (gọi khi mở lại tab Settings). */
  refresh: () => Promise<void>;
  /** App đang chạy ở chế độ PWA standalone (đã cài) hay không — bắt buộc trước khi bật thông báo (mục 3.1). */
  isStandalone: boolean;
  /** Trình duyệt vừa bắn sự kiện `beforeinstallprompt` (Android/Chrome) — có thể gọi `promptInstall()` để cài 1 chạm. */
  canInstall: boolean;
  /** Gọi `prompt()` của sự kiện `beforeinstallprompt` đã bắt được (no-op nếu `canInstall` false, ví dụ iOS Safari). */
  promptInstall: () => Promise<void>;
}

function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Phát hiện app đang chạy standalone (đã "Add to Home Screen"/cài PWA) hay chưa.
 * `display-mode: standalone` là chuẩn chung (Android/desktop); `navigator.standalone`
 * là API riêng của iOS Safari (không nằm trong `matchMedia`) — cần check cả 2.
 */
function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mediaStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mediaStandalone || iosStandalone;
}

/**
 * Convert base64url VAPID public key sang Uint8Array — định dạng
 * `PushManager.subscribe()` yêu cầu cho `applicationServerKey`.
 * Chuẩn quen thuộc của Web Push (xem web.dev/push-notifications).
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Convert `PushSubscriptionKeys` (ArrayBuffer) sang base64 string để lưu Postgres text column. */
function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function usePushSubscription(): UsePushSubscriptionResult {
  const { session } = useAuth();
  const supported = isPushSupported();

  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported',
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(() => detectStandalone());
  const [canInstall, setCanInstall] = useState(() => getDeferredInstallEvent() !== null);

  // `beforeinstallprompt` có thể bắn ra bất cứ lúc nào (kể cả trước khi Settings mở) — lắng nghe
  // qua store dùng chung ở module-level (đăng ký listener ngay từ lúc app load, xem
  // installPromptStore.ts) thay vì tự attach listener ở đây (sẽ lỡ mất sự kiện nếu bắn sớm).
  useEffect(() => {
    return subscribeInstallPrompt(() => {
      setCanInstall(getDeferredInstallEvent() !== null);
      // Cài xong app tự chuyển sang standalone — đọc lại ngay để UI cập nhật không cần user thao tác gì thêm.
      setIsStandalone(detectStandalone());
    });
  }, []);

  const refresh = useCallback(async () => {
    setIsStandalone(detectStandalone());
    if (!supported) {
      setPermission('unsupported');
      setIsSubscribed(false);
      return;
    }
    setPermission(Notification.permission);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setIsSubscribed(existing !== null);
    } catch {
      // Service worker chưa sẵn sàng (ví dụ đang chạy dev server, SW không bật ở dev)
      // — coi như chưa subscribe, không phải lỗi cần báo người dùng.
      setIsSubscribed(false);
    }
  }, [supported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setError(null);
    if (!supported) {
      setError('Trình duyệt/thiết bị không hỗ trợ thông báo đẩy.');
      return;
    }
    const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      setError('Thiếu VITE_VAPID_PUBLIC_KEY — chưa cấu hình khoá VAPID.');
      return;
    }
    if (!session?.user?.id) {
      setError('Chưa đăng nhập — không thể lưu subscription.');
      return;
    }

    setIsBusy(true);
    try {
      // Xin quyền Notification thật — trình duyệt sẽ hiện popup Allow/Cho phép ở đây.
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      const json = subscription.toJSON();
      const endpoint = json.endpoint ?? subscription.endpoint;
      const p256dh = json.keys?.p256dh ?? arrayBufferToBase64(subscription.getKey('p256dh'));
      const authKey = json.keys?.auth ?? arrayBufferToBase64(subscription.getKey('auth'));

      const { error: upsertError } = await supabase.from('kn_push_subscriptions').upsert(
        {
          user_id: session.user.id,
          endpoint,
          p256dh,
          auth_key: authKey,
          user_agent: navigator.userAgent,
        },
        { onConflict: 'endpoint' },
      );
      if (upsertError) throw upsertError;

      setIsSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể bật thông báo đẩy.');
    } finally {
      setIsBusy(false);
    }
  }, [session?.user?.id, supported]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    if (!supported) return;

    setIsBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        const { error: deleteError } = await supabase
          .from('kn_push_subscriptions')
          .delete()
          .eq('endpoint', endpoint);
        if (deleteError) throw deleteError;
      }
      setIsSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tắt thông báo đẩy.');
    } finally {
      setIsBusy(false);
    }
  }, [supported]);

  const promptInstall = useCallback(async () => {
    const outcome = await promptInstallEvent();
    setCanInstall(getDeferredInstallEvent() !== null);
    if (outcome === 'accepted') {
      // `appinstalled` cũng sẽ bắn qua installPromptStore, nhưng cập nhật ngay ở đây cho mượt UI.
      setIsStandalone(detectStandalone());
    }
  }, []);

  return {
    isSupported: supported,
    permission,
    isSubscribed,
    isBusy,
    error,
    subscribe,
    unsubscribe,
    refresh,
    isStandalone,
    canInstall,
    promptInstall,
  };
}
