import type { Settings } from '../types';

/**
 * Snapshot cho luồng lưu `settings` — cột duy nhất của `kn_space_state` còn được ghi lại sau lần
 * khởi tạo hàng (xem `supabaseStore.ts`). Space cá nhân (`spaces`) từ Bước 3
 * (docs/features/storage-architecture-fix.md mục 4) đã chuyển hẳn sang bảng `kn_private_spaces`,
 * đọc/ghi theo TỪNG HÀNG qua `privateSpaceStore.ts` — không còn khái niệm "snapshot cả mảng
 * spaces" nữa.
 */
export interface SettingsSnapshot {
  settings: Settings;
}
