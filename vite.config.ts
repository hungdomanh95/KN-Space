import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // `manifest: false` — repo đã có sẵn public/manifest.webmanifest + toàn bộ meta tag
      // apple-* trong index.html (đọc kỹ lý do trong index.html), không để plugin tự sinh/ghi
      // đè manifest, tránh phá vỡ cấu hình icons/display:standalone đang chạy đúng.
      manifest: false,
      // injectManifest — cần service worker tự viết (src/sw.ts) để xử lý sự kiện `push` và
      // `notificationclick` theo docs/features/push-notification.md mục 9.1, khác với mode
      // `generateSW` (plugin tự sinh toàn bộ SW, không cho viết custom event handler).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        // Không có asset nào cần precache bắt buộc ở Phần 1 (chưa làm offline cache) — chỉ cần
        // entry point tồn tại để workbox-build không lỗi khi tìm self.__WB_MANIFEST.
        globPatterns: [],
      },
      // Không dùng auto-register script của plugin (virtual:pwa-register) — đăng ký SW thủ công
      // trong src/main.tsx để kiểm soát rõ thời điểm/điều kiện đăng ký, dễ log lỗi khi debug.
      injectRegister: false,
      // SW chỉ hoạt động ở bản build (dist/sw.js qua `npm run build` + `npm run preview`), KHÔNG
      // bật ở `vite dev` — bật devOptions cho injectManifest cần build SW dạng ES module riêng,
      // dễ vỡ và không cần thiết cho mục tiêu Phần 1 (nền tảng PWA + push cơ bản). Xem ghi chú
      // test cục bộ ở docs/features/push-notification-progress.md.
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
});
