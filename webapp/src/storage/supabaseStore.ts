import { supabase } from '../lib/supabaseClient';
import type { Settings, Space } from '../types';
import { createSeedSpaces, defaultSettings } from '../state/seed';
import { findLegacyDashboardLayout, normalizeSettings, normalizeSpace } from './normalize';
import { readLocalCurrentSpaceId, writeLocalCurrentSpaceId } from './localCurrentSpace';
import { readLocalLastScreen, writeLocalLastScreen } from './localLastScreen';
import type { LoadResult, SaveSnapshot } from './types';

// ============================================================================
// Schema Supabase: 1 hàng/user trong bảng `kn_space_state` (PK = user_id), gồm
// `spaces` (jsonb), `current_space_id` (text), `settings` (jsonb).
// Xem schema.sql (RLS auth.uid() = user_id) để chạy trên Supabase.
//
// `current_space_id` vẫn còn trong bảng (NOT NULL) nhưng không dùng để xác định
// Space hiện tại — đó là trạng thái riêng từng máy, đọc/ghi qua localCurrentSpace.ts.
// ============================================================================

const TABLE = 'kn_space_state';

interface Row {
  spaces: unknown[];
  current_space_id: string;
  settings: Settings;
}

async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Chưa đăng nhập');
  return data.user.id;
}

/**
 * Load toàn bộ app state từ Supabase. Trả về `null` nếu chưa có hàng nào (user mới)
 * — caller cần seed dữ liệu demo trong trường hợp này.
 */
export async function loadAppState(): Promise<LoadResult | null> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from(TABLE)
    .select('spaces,current_space_id,settings')
    .eq('user_id', userId)
    .maybeSingle<Row>();

  if (error) {
    console.warn('[KN-Space] Đọc dữ liệu từ Supabase lỗi:', error.message);
    throw error;
  }
  if (!data || !Array.isArray(data.spaces) || data.spaces.length === 0) {
    return null;
  }

  const rawSpaces = data.spaces;
  const spaces = rawSpaces.map((s) => normalizeSpace(s as Space));
  const rawSettings = normalizeSettings(data.settings, undefined, findLegacyDashboardLayout(rawSpaces));
  // lastScreen và currentSpaceId là trạng thái điều hướng riêng từng máy — đọc từ localStorage.
  const localScreen = readLocalLastScreen();
  const settings = localScreen ? { ...rawSettings, lastScreen: localScreen } : rawSettings;
  const localId = readLocalCurrentSpaceId();
  // Không validate localId chỉ trong private spaces — có thể là shared space chưa load.
  // AppStateContext sẽ validate lại sau khi merge private + shared spaces.
  const currentSpaceId = localId || spaces[0].id;

  return { spaces, currentSpaceId, settings, storageFallbackActive: false };
}

/** Ghi snapshot lên Supabase (upsert 1 hàng theo user_id). */
export async function flushSave(snapshot: SaveSnapshot): Promise<{ fellBack: boolean }> {
  try {
    const userId = await getUserId();
    const { error } = await supabase.from(TABLE).upsert({
      user_id: userId,
      spaces: snapshot.spaces,
      current_space_id: snapshot.currentSpaceId,
      settings: snapshot.settings,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { fellBack: false };
  } catch (err) {
    console.warn('[KN-Space] Lưu dữ liệu lên Supabase lỗi:', err instanceof Error ? err.message : err);
    return { fellBack: true };
  }
}

/** Seed dữ liệu demo + lưu ngay lên Supabase (chỉ gọi khi user mới, chưa có hàng nào). */
export async function seedAndPersist(): Promise<LoadResult> {
  const spaces = createSeedSpaces();
  const settings = defaultSettings();
  const currentSpaceId = spaces[0].id;
  writeLocalCurrentSpaceId(currentSpaceId);
  writeLocalLastScreen(settings.lastScreen);
  const { fellBack } = await flushSave({ spaces, currentSpaceId, settings });
  return { spaces, currentSpaceId, settings, storageFallbackActive: fellBack };
}

// ============================================================================
// Debounce save — tránh ghi network dồn dập theo từng keystroke/tick checkbox.
// ============================================================================

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshot: SaveSnapshot | null = null;
let onFallbackChange: ((active: boolean) => void) | null = null;

export function setFallbackListener(listener: (active: boolean) => void): void {
  onFallbackChange = listener;
}

export function scheduleSave(snapshot: SaveSnapshot, debounceMs = 600): void {
  pendingSnapshot = snapshot;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushPendingSave();
  }, debounceMs);
}

async function flushPendingSave(): Promise<void> {
  if (!pendingSnapshot) return;
  const snapshot = pendingSnapshot;
  pendingSnapshot = null;
  const { fellBack } = await flushSave(snapshot);
  if (fellBack && pendingSnapshot === null) {
    // Save thất bại, không có snapshot mới hơn — khôi phục để forceFlush() có thể retry khi đóng tab.
    pendingSnapshot = snapshot;
  }
  onFallbackChange?.(fellBack);
}

/** Đảm bảo lưu ngay, không đợi debounce — gọi trước khi rời trang. */
export async function forceFlush(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await flushPendingSave();
}
