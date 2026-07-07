import type { Settings, Space } from '../types';

export interface LoadResult {
  spaces: Space[];
  currentSpaceId: string;
  settings: Settings;
  /** true nếu lần lưu gần nhất lên Supabase thất bại (mất mạng/lỗi) — dữ liệu chỉ còn ở state cục bộ. */
  storageFallbackActive: boolean;
}

export interface SaveSnapshot {
  spaces: Space[];
  currentSpaceId: string;
  settings: Settings;
}
