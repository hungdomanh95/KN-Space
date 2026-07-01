import { supabase } from '../lib/supabaseClient';
import type { Settings, Space } from '../types';
import { createSeedSpaces, defaultSettings } from '../state/seed';
import { findLegacyDashboardLayout, normalizeSettings, normalizeSpace } from './normalize';
import { readLocalCurrentSpaceId, writeLocalCurrentSpaceId } from './localCurrentSpace';
import { readLocalLastScreen, writeLocalLastScreen } from './localLastScreen';
import type { LoadResult, SaveSnapshot } from './types';

// ============================================================================
// Schema Supabase: 1 hàng/user trong bảng `kn_space_state` (PK = user_id), gồm
// `spaces` (jsonb), `current_space_id` (text), `settings` (jsonb). KHÔNG tách key
// theo space/settings như bản chrome.storage cũ — đó là workaround riêng cho giới
// hạn ~8KB/item của chrome.storage.sync, không tồn tại với Postgres jsonb (giới hạn
// thực tế là kích thước row/toast, hàng GB) — gộp lại cho đơn giản, đúng quy mô 1-2
// người dùng hiện tại. Xem schema.sql (RLS auth.uid() = user_id) để chạy trên Supabase.
//
// `current_space_id` vẫn còn TỒN TẠI trong bảng (NOT NULL) nhưng KHÔNG còn dùng để xác định
// Space hiện tại nữa — đó là trạng thái riêng từng máy, đọc/ghi qua localCurrentSpace.ts
// (localStorage). Cột này giờ chỉ là "giá trị cuối cùng máy nào đó từng ghi", không ai đọc lại
// có ý nghĩa — giữ để khỏi phải sửa schema/cột NOT NULL, không cần migration.
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
  // `lastScreen` và `currentSpaceId` là trạng thái điều hướng riêng từng máy (xem localLastScreen.ts,
  // localCurrentSpace.ts) — đọc từ localStorage thay vì từ server để tránh HYDRATE từ Realtime của
  // máy khác đè lên lựa chọn màn hình / Space của máy này.
  const rawSettings = normalizeSettings(data.settings, undefined, findLegacyDashboardLayout(rawSpaces));
  const localScreen = readLocalLastScreen();
  const settings = localScreen ? { ...rawSettings, lastScreen: localScreen } : rawSettings;
  const localId = readLocalCurrentSpaceId();
  const currentSpaceId = localId && spaces.some((s) => s.id === localId) ? localId : spaces[0].id;
  writeLocalCurrentSpaceId(currentSpaceId);

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
// Debounce save (giữ nguyên cơ chế từ bản chrome.storage — tránh ghi network dồn
// dập theo từng keystroke/tick checkbox).
// ============================================================================

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSnapshot: SaveSnapshot | null = null;
let isFlushInProgress = false;
let onFallbackChange: ((active: boolean) => void) | null = null;

export function setFallbackListener(listener: (active: boolean) => void): void {
  onFallbackChange = listener;
}

export function scheduleSave(snapshot: SaveSnapshot, debounceMs = 600): void {
  pendingSnapshot = snapshot;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void flushPendingSave();
  }, debounceMs);
}

/**
 * true nếu còn thay đổi cục bộ CHƯA lưu lên Supabase (đang trong 600ms debounce hoặc đang
 * gửi). Dùng để bỏ qua sự kiện Realtime tới trong lúc này — nếu không, GET lại dữ liệu lúc
 * này sẽ trả về bản CŨ hơn state cục bộ đang có (state cục bộ đã đổi tiếp sau lần lưu trước,
 * chưa kịp lưu lần mới) và HYDRATE đè lên, làm thao tác vừa làm (kéo-thả sắp xếp lại, mở rộng
 * note...) bị "rollback" ngược 1 nhịp — đúng hiện tượng đã gặp khi test thật.
 */
export function hasPendingSave(): boolean {
  return pendingSnapshot !== null || isFlushInProgress;
}

async function flushPendingSave(): Promise<void> {
  if (!pendingSnapshot) return;
  const snapshot = pendingSnapshot;
  pendingSnapshot = null;
  isFlushInProgress = true;
  try {
    const { fellBack } = await flushSave(snapshot);
    onFallbackChange?.(fellBack);
  } finally {
    isFlushInProgress = false;
  }
}

/** Đảm bảo lưu ngay, không đợi debounce — gọi trước khi rời trang (xem AppStateContext). */
export async function forceFlush(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await flushPendingSave();
}

/**
 * Normalize raw Realtime payload.new (giống cấu trúc Row, đọc thẳng từ WAL) thành LoadResult.
 * Logic giống loadAppState nhưng không cần network — tránh stale-read qua PostgREST.
 */
function normalizeRealtimeRow(row: Row): LoadResult {
  const rawSpaces = row.spaces ?? [];
  const spaces = rawSpaces.map((s) => normalizeSpace(s as Space));
  const rawSettings = normalizeSettings(row.settings, undefined, findLegacyDashboardLayout(rawSpaces));
  const localScreen = readLocalLastScreen();
  const settings = localScreen ? { ...rawSettings, lastScreen: localScreen } : rawSettings;
  const localId = readLocalCurrentSpaceId();
  const currentSpaceId = localId && spaces.some((s) => s.id === localId) ? localId : (spaces[0]?.id ?? '');
  return { spaces, currentSpaceId, settings, storageFallbackActive: false };
}

/**
 * Đăng ký lắng nghe thay đổi từ Supabase Realtime (đổi từ máy khác) để đồng bộ UI.
 * Callback nhận LoadResult chuẩn hoá thẳng từ WAL payload — không SELECT lại, không stale-read.
 * Trả về hàm hủy đăng ký.
 */
export function subscribeStorageChanges(callback: (loaded: LoadResult) => void): () => void {
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let unsubscribed = false;

  void getUserId().then((userId) => {
    if (unsubscribed) return;
    channel = supabase
      .channel(`kn-space-state-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Partial<Row>;
          if (!row || !Array.isArray(row.spaces) || row.spaces.length === 0) return;
          callback(normalizeRealtimeRow(row as Row));
        },
      )
      .subscribe();
  });

  return () => {
    unsubscribed = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
