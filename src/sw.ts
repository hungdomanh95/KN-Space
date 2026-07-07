/// <reference lib="webworker" />

// Service Worker của KN-Space (PWA + Push Notification).
//
// Build bằng vite-plugin-pwa ở mode `injectManifest` — output ra `dist/sw.js`, được đăng ký
// thủ công từ `src/main.tsx` (không dùng auto-register của plugin để giữ luồng rõ ràng, dễ debug).
//
// `precacheAndRoute(self.__WB_MANIFEST)` là điểm bắt buộc: workbox-build (bên trong
// vite-plugin-pwa) sẽ tìm chuỗi `self.__WB_MANIFEST` trong file này lúc build để tiêm danh sách
// asset cần precache vào — thiếu dòng này build sẽ lỗi. Ở bản này chưa cần chiến lược cache
// offline phức tạp (ngoài phạm vi Phần 1 — chỉ cần PWA cài được + nhận push), nên chỉ precache
// tối thiểu, không thêm runtime caching route nào khác.

import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

// Kích hoạt SW mới ngay lập tức thay vì chờ mọi tab cũ đóng — phù hợp app cá nhân/nhóm nhỏ,
// ưu tiên luôn chạy bản mới nhất hơn là giữ chặt vòng đời SW kiểu "waiting".
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------
// Push Notification
// ---------------------------------------------------------------------------
// Phần gửi thật (Edge Function + VAPID + subscribe) thuộc Phần 2/3 — ở Phần 1 này chỉ cần
// service worker đã sẵn sàng nhận sự kiện `push` chuẩn của trình duyệt và hiển thị notification
// đúng định dạng đã chốt ở docs/features/push-notification.md mục 3.2 và 5.3.

interface KnPushPayload {
  title: string;
  body?: string;
  icon?: string;
  url?: string;
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: KnPushPayload = { title: 'KN-Space' };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // Payload không phải JSON hợp lệ (không nên xảy ra với payload do Edge Function tự gửi) —
    // rơi về title mặc định, không để lỗi parse làm crash sự kiện push.
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const title = payload.title || 'KN-Space';
  const options: NotificationOptions = {
    body: payload.body,
    icon: payload.icon || '/icons/icon192.png',
    badge: '/icons/icon192.png',
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const targetUrl: string = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // Ưu tiên focus + điều hướng tab KN-Space đang mở sẵn (cùng origin) thay vì mở tab mới,
      // đỡ rác tab. Việc app tự đọc query `?open=task:<id>`/`?open=reminder:<id>` để chuyển
      // Space + cuộn tới item thuộc Phần 2/3/4 (logic phía app, ngoài phạm vi Phần 1 này).
      const existing = clientsList.find((c) => 'focus' in c) as WindowClient | undefined;
      if (existing) {
        await existing.focus();
        if ('navigate' in existing) {
          await existing.navigate(targetUrl);
        }
        return;
      }

      await self.clients.openWindow(targetUrl);
    })(),
  );
});
