/**
 * Push Notification — Phần 4 (Settings UI).
 *
 * Bắt sự kiện `beforeinstallprompt` (Android/Chrome — cho phép cài PWA "1 chạm") ở module-level,
 * ngay khi file này được import lần đầu (side effect lúc app load) — KHÔNG chờ tới lúc user mở
 * Settings mới attach listener, vì trình duyệt có thể bắn sự kiện này rất sớm (trước khi bất kỳ
 * component nào mount) và sự kiện chỉ bắn đúng 1 lần cho tới khi trang reload. Nếu attach listener
 * trong component (ví dụ trong usePushSubscription), sẽ có rủi ro lỡ mất sự kiện.
 *
 * iOS Safari không hỗ trợ `beforeinstallprompt` (không có API cài tự động) — `canInstall` sẽ luôn
 * `false` trên iOS, UI (PushNotificationSettings.tsx) tự fallback sang hướng dẫn thủ công.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredEvent = e as BeforeInstallPromptEvent;
    notify();
  });
  // App đã được cài (qua prompt này hoặc cách khác) — sự kiện cũ không còn dùng lại được nữa.
  window.addEventListener('appinstalled', () => {
    deferredEvent = null;
    notify();
  });
}

export function getDeferredInstallEvent(): BeforeInstallPromptEvent | null {
  return deferredEvent;
}

/** Đăng ký callback mỗi khi trạng thái install-prompt đổi (bắt được sự kiện mới / đã cài xong). */
export function subscribeInstallPrompt(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Gọi `prompt()` thật của trình duyệt (hiện popup cài đặt). Trả về kết quả để caller cập nhật UI. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredEvent) return 'unavailable';
  const event = deferredEvent;
  await event.prompt();
  const choice = await event.userChoice;
  // Sự kiện chỉ dùng được 1 lần — dù accepted hay dismissed, phải chờ `beforeinstallprompt` bắn lại
  // (nếu có) mới prompt tiếp được.
  deferredEvent = null;
  notify();
  return choice.outcome;
}
