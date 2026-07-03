import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Đăng ký Service Worker (PWA + Push Notification — Phần 1, xem docs/features/push-notification.md).
// Chỉ đăng ký ở bản build production (`import.meta.env.PROD`): SW này bị tắt ở `vite dev`
// (devOptions.enabled: false trong vite.config.ts), gọi register() trong dev sẽ 404.
// Test cục bộ: chạy `npm run build && npm run preview`, xem chi tiết cách test giả lập
// showNotification trong docs/features/push-notification-progress.md.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.error('KN-Space: đăng ký Service Worker thất bại', err);
    });
  });
}
