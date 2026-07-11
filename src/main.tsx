import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { previewLegacySpacesMigration, runLegacySpacesMigration } from './storage/migrateLegacySpaces';
import { previewLegacyLogsMigration, runLegacyLogsMigration } from './storage/migrateLegacyLogs';
import { previewLegacyHabitsMigration, runLegacyHabitsMigration } from './storage/migrateLegacyHabits';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Migration Space cá nhân cũ (kn_space_state.spaces[]) -> kn_private_spaces (Bước 4,
// docs/features/storage-architecture-fix.md mục 4). CHỦ Ý expose qua `window`, không tự chạy khi
// load app — chỉ gọi tay qua Console/Playwright, đúng tinh thần "hành động rõ ràng, 1 lần, không
// phải tính năng lâu dài của app". An toàn theo user đang đăng nhập (RLS + filter user_id), không
// cần service-role key.
//
// Cách dùng (mở DevTools Console khi đã đăng nhập):
//   await window.knMigrateLegacySpaces.preview()  // dry-run, chỉ đọc — xem trước sẽ migrate gì
//   await window.knMigrateLegacySpaces.run()      // thực thi migrate thật (idempotent, gọi lại an toàn)
declare global {
  interface Window {
    knMigrateLegacySpaces: {
      preview: typeof previewLegacySpacesMigration;
      run: typeof runLegacySpacesMigration;
    };
  }
}
window.knMigrateLegacySpaces = {
  preview: previewLegacySpacesMigration,
  run: runLegacySpacesMigration,
};

// Migration Nhật ký nhanh (logs[] cũ, jsonb) -> kn_private_logs/kn_shared_logs (Bước 1 entity Log,
// docs/features/item-level-entity-tables.md). CHỈ chạy được SAU KHI đã chạy
// docs/features/item-level-log-schema.sql trên Supabase Dashboard — trước đó mọi lệnh trả lỗi
// "relation does not exist" (an toàn, không ghi sai gì). Cùng nguyên tắc `knMigrateLegacySpaces` ở
// trên: gọi tay qua Console, không tự chạy khi load app.
//
// Cách dùng (mở DevTools Console khi đã đăng nhập):
//   await window.knMigrateLogs.preview()  // dry-run, chỉ đọc — xem trước sẽ migrate gì
//   await window.knMigrateLogs.run()      // thực thi migrate thật (idempotent, gọi lại an toàn)
declare global {
  interface Window {
    knMigrateLogs: {
      preview: typeof previewLegacyLogsMigration;
      run: typeof runLegacyLogsMigration;
    };
  }
}
window.knMigrateLogs = {
  preview: previewLegacyLogsMigration,
  run: runLegacyLogsMigration,
};

// Migration Thói quen (habits[] cũ, jsonb) -> kn_private_habits (Bước 2 entity Habit,
// docs/features/item-level-entity-tables.md). CHỈ chạy được SAU KHI đã chạy
// docs/features/item-level-habit-schema.sql trên Supabase Dashboard — trước đó mọi lệnh trả lỗi
// "relation does not exist" (an toàn, không ghi sai gì). Cùng nguyên tắc `knMigrateLogs` ở trên: gọi
// tay qua Console, không tự chạy khi load app. Habit KHÔNG có bản Shared — không có tham số scope.
//
// Cách dùng (mở DevTools Console khi đã đăng nhập):
//   await window.knMigrateHabits.preview()  // dry-run, chỉ đọc — xem trước sẽ migrate gì
//   await window.knMigrateHabits.run()      // thực thi migrate thật (idempotent, gọi lại an toàn)
declare global {
  interface Window {
    knMigrateHabits: {
      preview: typeof previewLegacyHabitsMigration;
      run: typeof runLegacyHabitsMigration;
    };
  }
}
window.knMigrateHabits = {
  preview: previewLegacyHabitsMigration,
  run: runLegacyHabitsMigration,
};

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
