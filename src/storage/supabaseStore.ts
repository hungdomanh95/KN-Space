import { supabase } from '../lib/supabaseClient';
import type { Settings, Space } from '../types';
import { createSeedSpaces, defaultSettings } from '../state/seed';
import { normalizeSettings } from './normalize';
import { readLocalCurrentSpaceId, writeLocalCurrentSpaceId } from './localCurrentSpace';
import { readLocalLastScreen, writeLocalLastScreen } from './localLastScreen';
import { upsertPrivateSpaces } from './privateSpaceStore';
import type { SettingsSnapshot } from './types';

// ============================================================================
// Schema Supabase: 1 hàng/user trong bảng `kn_space_state` (PK = user_id).
//
// **Từ Bước 3 (docs/features/storage-architecture-fix.md mục 4):** bảng này CHỈ còn giữ
// `current_space_id` (text, không dùng để xác định Space hiện tại nữa — xem comment dưới) và
// `settings` (jsonb). Cột `spaces` (jsonb) VẪN CÒN TỒN TẠI trên DB (chưa xoá — Bước 4 migration
// vẫn cần ĐỌC dữ liệu cũ từ đó) nhưng KHÔNG còn được code ứng dụng đọc/ghi nữa — Space cá nhân giờ
// đọc/ghi qua bảng `kn_private_spaces` (mỗi hàng = 1 Space, có `version` + optimistic locking), xem
// `privateSpaceStore.ts`. `AppStateContext.tsx` gọi `loadPrivateSpaces()`/`savePrivateSpace()` trực
// tiếp, KHÔNG qua module này nữa.
//
// `current_space_id`: cột NOT NULL nhưng đã là "cột chết" từ trước Bước 3 — Space đang mở là trạng
// thái RIÊNG TỪNG MÁY, đọc/ghi qua `localCurrentSpace.ts` (localStorage), không đọc lại từ đây.
// Bước 3 CHỈ còn ghi cột này ở lần tạo hàng đầu tiên (`seedAndPersist`, user mới) rồi để nguyên —
// không tốn thêm 1 luồng ghi riêng cho 1 cột vốn đã không ai đọc lại, tránh thêm độ phức tạp không
// cần thiết cho 1 giá trị không ảnh hưởng hành vi ứng dụng.
// ============================================================================

const TABLE = 'kn_space_state';

interface Row {
  current_space_id: string;
  settings: Settings;
}

type FlushResult = { fellBack: boolean; error?: string };

async function getUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Chưa đăng nhập');
  return data.user.id;
}

export interface StateLoadResult {
  currentSpaceId: string;
  settings: Settings;
}

/**
 * Load `current_space_id`/`settings` từ Supabase. Trả về `null` nếu chưa có hàng nào (user mới) —
 * caller (`AppStateContext`) cần seed dữ liệu demo (cả settings lẫn Space cá nhân) trong trường
 * hợp này. Space cá nhân KHÔNG còn đọc ở đây — xem `loadPrivateSpaces()` (`privateSpaceStore.ts`),
 * gọi riêng ở `AppStateContext.tsx`, cùng cấp với `loadSharedSpaces()`.
 */
export async function loadAppState(): Promise<StateLoadResult | null> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from(TABLE)
    .select('current_space_id,settings')
    .eq('user_id', userId)
    .maybeSingle<Row>();

  if (error) {
    console.warn('[KN-Space] Đọc dữ liệu từ Supabase lỗi:', error.message);
    throw error;
  }
  if (!data) return null;

  const rawSettings = normalizeSettings(data.settings);
  // lastScreen là trạng thái điều hướng riêng từng máy — đọc từ localStorage.
  const localScreen = readLocalLastScreen();
  const settings = localScreen ? { ...rawSettings, lastScreen: localScreen } : rawSettings;
  // currentSpaceId: ưu tiên localStorage (riêng từng máy); cột DB chỉ còn là fallback cho máy mới
  // (chưa từng mở app này) — AppStateContext sẽ tự validate lại sau khi có đủ private + shared
  // spaces (id gợi ý ở đây có thể không còn tồn tại, kể cả là shared space chưa load xong).
  const localId = readLocalCurrentSpaceId();
  const currentSpaceId = localId || data.current_space_id || '';

  return { currentSpaceId, settings };
}

function handleFlushError(err: unknown): FlushResult {
  const message = err instanceof Error ? err.message : String(err);
  console.warn('[KN-Space] Lưu dữ liệu lên Supabase lỗi:', message);
  return { fellBack: true, error: message };
}

/**
 * Ghi `current_space_id` + `settings` — CHỈ dùng cho lần đầu tạo hàng của user mới
 * (`seedAndPersist`), vì lúc đó hàng chưa tồn tại. Cố ý KHÔNG gửi `spaces` trong payload (cột vẫn
 * NOT NULL nhưng có `default '[]'::jsonb` nên bỏ qua vẫn hợp lệ) — Space cá nhân của user mới được
 * tạo RIÊNG qua `upsertPrivateSpaces()` (bảng `kn_private_spaces`), xem `seedAndPersist()` dưới.
 */
async function flushInitialStateRow(currentSpaceId: string, settings: Settings): Promise<FlushResult> {
  try {
    const userId = await getUserId();
    const { error } = await supabase.from(TABLE).upsert({
      user_id: userId,
      current_space_id: currentSpaceId,
      settings,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { fellBack: false };
  } catch (err) {
    return handleFlushError(err);
  }
}

/** Ghi riêng `settings` — hàng đã tồn tại nên KHÔNG đụng cột `spaces`/`current_space_id`. */
async function flushSettings(snapshot: SettingsSnapshot): Promise<FlushResult> {
  try {
    const userId = await getUserId();
    const { error } = await supabase.from(TABLE).upsert({
      user_id: userId,
      settings: snapshot.settings,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { fellBack: false };
  } catch (err) {
    return handleFlushError(err);
  }
}

export interface SeedResult {
  spaces: Space[];
  currentSpaceId: string;
  settings: Settings;
  storageFallbackActive: boolean;
}

/**
 * Seed dữ liệu demo + lưu ngay lên Supabase (chỉ gọi khi user mới, chưa có hàng `kn_space_state`
 * nào). Ghi song song 2 đích ĐỘC LẬP — hàng `kn_space_state` (current_space_id + settings) và các
 * hàng `kn_private_spaces` (Space cá nhân demo, qua `upsertPrivateSpaces` — không có conflict thật
 * ở đây vì bảng đang rỗng cho user này, dùng chung hàm với luồng import cho gọn).
 */
export async function seedAndPersist(): Promise<SeedResult> {
  const seedSpaces = createSeedSpaces();
  const settings = defaultSettings();
  const currentSpaceId = seedSpaces[0].id;
  writeLocalCurrentSpaceId(currentSpaceId);
  writeLocalLastScreen(settings.lastScreen);

  const [stateFlush, spacesFlush] = await Promise.all([
    flushInitialStateRow(currentSpaceId, settings),
    upsertPrivateSpaces(seedSpaces),
  ]);

  return {
    spaces: spacesFlush.ok && spacesFlush.spaces ? spacesFlush.spaces : seedSpaces,
    currentSpaceId,
    settings,
    storageFallbackActive: stateFlush.fellBack || !spacesFlush.ok,
  };
}

// ============================================================================
// Debounce save — tránh ghi network dồn dập theo từng keystroke/tick checkbox.
// Chỉ còn 1 kênh (`settings`) ở module này — debounce riêng cho TỪNG Space cá nhân (bảng
// `kn_private_spaces`) đã chuyển sang `AppStateContext.tsx` (mirror cơ chế debounce-theo-Map đã có
// sẵn cho Shared Space — mỗi Space 1 timer/pending riêng, xem comment ở đó), KHÔNG còn ở đây.
// ============================================================================

function createSaveChannel<T>(flush: (snapshot: T) => Promise<FlushResult>, onFallback: (active: boolean) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;

  async function flushPending(): Promise<void> {
    if (pending === null) return;
    const snapshot = pending;
    pending = null;
    const { fellBack } = await flush(snapshot);
    if (fellBack && pending === null) {
      // Save thất bại, không có snapshot mới hơn — khôi phục để forceFlush() có thể retry khi đóng tab.
      pending = snapshot;
    }
    onFallback(fellBack);
  }

  return {
    schedule(snapshot: T, debounceMs = 600): void {
      pending = snapshot;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void flushPending();
      }, debounceMs);
    },
    /** Đảm bảo lưu ngay, không đợi debounce — gọi trước khi rời trang. */
    async forceFlush(): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await flushPending();
    },
  };
}

// Banner lỗi lưu (`storageFallbackActive`) — active nếu kênh `settings` (module này) HOẶC kênh
// per-Space (private/shared, AppStateContext) đang có lỗi lưu. `setPrivateFallbackActive()` /
// `setSharedFallbackActive()` cho phép AppStateContext báo trạng thái lỗi của các kênh nó tự quản,
// gộp OR vào cùng 1 banner duy nhất — không để kênh này "xoá" banner do lỗi của kênh khác. Từ
// docs/features/conflict-handling-simplification.md mục 3/A1 (2026-07-10): cả 2 hàm này giờ được
// nối vào ĐÚNG nhánh lỗi thật (catch) của `attemptSavePrivate`/`attemptSaveShared` — thay cho khái
// niệm "hết lượt retry" (A1 gốc) đã không còn tồn tại sau khi bỏ version-check.
let settingsFallbackActive = false;
let privateFallbackActive = false;
let sharedFallbackActive = false;
let onFallbackChange: ((active: boolean) => void) | null = null;

export function setFallbackListener(listener: (active: boolean) => void): void {
  onFallbackChange = listener;
}

function notifyFallback(): void {
  onFallbackChange?.(settingsFallbackActive || privateFallbackActive || sharedFallbackActive);
}

/** AppStateContext gọi khi 1 lượt save Space cá nhân (per-row, kn_private_spaces) thất bại/hồi phục. */
export function setPrivateFallbackActive(active: boolean): void {
  privateFallbackActive = active;
  notifyFallback();
}

/** AppStateContext gọi khi 1 lượt save Shared Space (per-row, kn_shared_spaces) thất bại/hồi phục. */
export function setSharedFallbackActive(active: boolean): void {
  sharedFallbackActive = active;
  notifyFallback();
}

const settingsChannel = createSaveChannel<SettingsSnapshot>(flushSettings, (active) => {
  settingsFallbackActive = active;
  notifyFallback();
});

export function scheduleSettingsSave(snapshot: SettingsSnapshot, debounceMs = 600): void {
  settingsChannel.schedule(snapshot, debounceMs);
}

/** Đảm bảo lưu ngay kênh `settings`, không đợi debounce — gọi trước khi rời trang (tab ẩn/đóng). */
export async function forceFlush(): Promise<void> {
  await settingsChannel.forceFlush();
}
