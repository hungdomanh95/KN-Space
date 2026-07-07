import type { Screen } from '../types';

const KEY = 'kn-space:last-screen';

const VALID: Set<Screen> = new Set(['home', 'dashboard']);

/**
 * "Màn đang mở" là trạng thái điều hướng của riêng từng máy — không đồng bộ qua Supabase
 * (giống currentSpaceId). Lưu localStorage để tránh HYDRATE từ Realtime đè lên lựa chọn
 * màn hình của máy khác (machine A ở dashboard không nên kéo machine B nhảy sang dashboard).
 */
export function readLocalLastScreen(): Screen | null {
  try {
    const v = localStorage.getItem(KEY);
    return v && VALID.has(v as Screen) ? (v as Screen) : null;
  } catch {
    return null;
  }
}

export function writeLocalLastScreen(screen: Screen): void {
  try {
    localStorage.setItem(KEY, screen);
  } catch {
    // Im lặng bỏ qua — không có localStorage thì máy này không nhớ được màn hình, không nghiêm trọng.
  }
}
