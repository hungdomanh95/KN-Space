import type { AppState, Settings, Space, UiState } from '../types';
import { createSeedSpaces, defaultSettings } from '../state/seed';

// ============================================================================
// Chiến lược key
// - 1 key nhỏ "kn-space:space-index" LUÔN ở sync — lưu thứ tự Space + map
//   storageLocations (sync/local) từng space, dùng để tự phục hồi khi load.
// - 1 key "kn-space:settings" — settings dùng chung mọi Space.
// - 1 key "kn-space:space:<id>" cho MỖI Space — tách riêng để né giới hạn ~8KB/item.
// ============================================================================

const SETTINGS_KEY = 'kn-space:settings';
const SPACE_INDEX_KEY = 'kn-space:space-index';
const spaceKey = (id: string) => `kn-space:space:${id}`;

type StorageArea = 'sync' | 'local';

interface SpaceIndexEntry {
  id: string;
  storageArea: StorageArea;
}

interface SpaceIndex {
  schemaVersion: number;
  currentSpaceId: string;
  order: string[]; // space ids theo thứ tự
  locations: SpaceIndexEntry[];
}

const SCHEMA_VERSION = 1;

function getArea(area: StorageArea): chrome.storage.StorageArea {
  return area === 'sync' ? chrome.storage.sync : chrome.storage.local;
}

/** Đọc 1 key từ 1 khu vực cụ thể, trả về undefined nếu không có hoặc lỗi. */
function readFromArea<T>(area: StorageArea, key: string): Promise<T | undefined> {
  return new Promise((resolve) => {
    getArea(area).get([key], (result) => {
      if (chrome.runtime.lastError) {
        resolve(undefined);
        return;
      }
      resolve(result[key] as T | undefined);
    });
  });
}

/** Ghi 1 key vào 1 khu vực cụ thể. Reject nếu lỗi (kể cả lastError). */
function writeToArea(area: StorageArea, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    getArea(area).set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function removeFromArea(area: StorageArea, key: string): Promise<void> {
  return new Promise((resolve) => {
    getArea(area).remove([key], () => resolve());
  });
}

/**
 * `chrome.storage.sync` có 2 LOẠI giới hạn rất khác nhau:
 * - Giới hạn DUNG LƯỢNG (QUOTA_BYTES, QUOTA_BYTES_PER_ITEM, MAX_ITEMS): dữ liệu thật sự
 *   quá lớn/nhiều — cần fallback sang local lâu dài, đúng theo thiết kế ban đầu.
 * - Giới hạn TẦN SUẤT GHI (MAX_WRITE_OPERATIONS_PER_MINUTE/HOUR): chỉ là ghi quá nhanh
 *   trong thời gian ngắn (vd. test/sửa liên tục), KHÔNG liên quan tới kích thước dữ liệu —
 *   chỉ cần thử lại ở lần ghi sau, không nên fallback/xoá bản sync hiện có.
 * Gộp 2 loại này từng khiến banner báo sai "dữ liệu vượt giới hạn" trong khi thực ra chỉ
 * đang ghi dồn lúc test, và còn xoá oan bản sync đang tốt.
 */
function isByteQuotaError(message: string): boolean {
  return /QUOTA_BYTES|MAX_ITEMS/i.test(message);
}
function isRateLimitError(message: string): boolean {
  return /MAX_WRITE_OPERATIONS|WRITE_OPERATIONS_PER/i.test(message);
}

/**
 * Ghi key, thử `sync` trước.
 * - Lỗi do ghi quá nhanh (rate limit): bỏ qua lần ghi này, KHÔNG fallback/xoá sync —
 *   coi như giữ nguyên giá trị cũ trên sync, lần debounce-save kế tiếp sẽ tự thử lại.
 * - Lỗi do vượt dung lượng thật (byte quota) hoặc lỗi khác: fallback sang `local`.
 */
async function writeKeyWithFallback(
  key: string,
  value: unknown,
): Promise<{ area: StorageArea; fellBack: boolean }> {
  try {
    await writeToArea('sync', key, value);
    return { area: 'sync', fellBack: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[KN-Space] Ghi "${key}" vào chrome.storage.sync lỗi: ${message}`);

    if (isRateLimitError(message) && !isByteQuotaError(message)) {
      // Chỉ là ghi dồn quá nhanh — không phải dữ liệu quá lớn. Bỏ qua, không đổi khu vực.
      return { area: 'sync', fellBack: false };
    }

    // Vượt dung lượng thật hoặc lỗi không xác định khác — fallback sang local.
    await writeToArea('local', key, value);
    // Dọn dẹp key cũ trên sync nếu có, tránh dữ liệu rác/song trùng.
    await removeFromArea('sync', key);
    return { area: 'local', fellBack: true };
  }
}

/** Đọc theo khu vực ghi nhận trong index trước; nếu không có thì tự kiểm tra khu vực còn lại (self-heal). */
async function readKeySelfHeal<T>(key: string, knownArea: StorageArea | undefined): Promise<{ value: T | undefined; area: StorageArea | undefined }> {
  if (knownArea) {
    const value = await readFromArea<T>(knownArea, key);
    if (value !== undefined) return { value, area: knownArea };
    // Không có ở khu vực ghi nhận — tự kiểm tra khu vực còn lại.
    const otherArea: StorageArea = knownArea === 'sync' ? 'local' : 'sync';
    const otherValue = await readFromArea<T>(otherArea, key);
    return { value: otherValue, area: otherValue !== undefined ? otherArea : undefined };
  }
  // Không biết khu vực — thử sync rồi local.
  const syncValue = await readFromArea<T>('sync', key);
  if (syncValue !== undefined) return { value: syncValue, area: 'sync' };
  const localValue = await readFromArea<T>('local', key);
  return { value: localValue, area: localValue !== undefined ? 'local' : undefined };
}

export interface LoadResult {
  spaces: Space[];
  currentSpaceId: string;
  settings: Settings;
  storageFallbackActive: boolean;
}

/**
 * Load toàn bộ app state từ storage. Trả về `null` nếu storage rỗng ở cả 2 khu vực
 * (không có space-index) — caller cần seed dữ liệu demo trong trường hợp này.
 */
export async function loadAppState(): Promise<LoadResult | null> {
  const indexResult = await readKeySelfHeal<SpaceIndex>(SPACE_INDEX_KEY, undefined);
  const index = indexResult.value;

  if (!index || index.order.length === 0) {
    return null;
  }

  let fallbackActive = false;
  const locationMap = new Map<string, StorageArea>();
  for (const loc of index.locations) {
    locationMap.set(loc.id, loc.storageArea);
  }

  const spaces: Space[] = [];
  for (const id of index.order) {
    const known = locationMap.get(id);
    const { value, area } = await readKeySelfHeal<Space>(spaceKey(id), known);
    if (value) {
      spaces.push(normalizeSpace(value));
      if (area === 'local') fallbackActive = true;
    }
  }

  if (spaces.length === 0) {
    return null;
  }

  const settingsResult = await readKeySelfHeal<Settings>(SETTINGS_KEY, undefined);
  const settings = settingsResult.value ? normalizeSettings(settingsResult.value) : defaultSettings();
  if (settingsResult.area === 'local') fallbackActive = true;

  const currentSpaceId = spaces.some((s) => s.id === index.currentSpaceId)
    ? index.currentSpaceId
    : spaces[0].id;

  return { spaces, currentSpaceId, settings, storageFallbackActive: fallbackActive };
}

/** Đảm bảo field thiếu (do import cũ/schema cũ) có giá trị mặc định hợp lệ, không crash. */
function normalizeSpace(space: Space): Space {
  return {
    id: space.id,
    name: space.name ?? 'Space chưa đặt tên',
    order: space.order ?? 0,
    enabledBlocks: {
      tasks: space.enabledBlocks?.tasks ?? true,
      reminder: space.enabledBlocks?.reminder ?? true,
      habits: space.enabledBlocks?.habits ?? true,
      notes: space.enabledBlocks?.notes ?? true,
      reminders: space.enabledBlocks?.reminders ?? true,
    },
    tasks: Array.isArray(space.tasks) ? space.tasks : [],
    reminders: Array.isArray(space.reminders) ? space.reminders : [],
    habits: Array.isArray(space.habits) ? space.habits : [],
    notes: Array.isArray(space.notes) ? space.notes : [],
  };
}

function normalizeSettings(settings: Settings): Settings {
  const fallback = defaultSettings();
  return {
    theme: settings.theme ?? fallback.theme,
    accent: settings.accent ?? fallback.accent,
    background: settings.background ?? fallback.background,
    layoutSizes: { ...fallback.layoutSizes, ...settings.layoutSizes },
    mainBlockOrder: Array.isArray(settings.mainBlockOrder) && settings.mainBlockOrder.length === 3
      ? settings.mainBlockOrder
      : fallback.mainBlockOrder,
    collapsedBlocks: { ...fallback.collapsedBlocks, ...settings.collapsedBlocks },
  };
}

/** Seed dữ liệu demo + lưu ngay xuống storage (chỉ gọi khi storage rỗng lần đầu). */
export async function seedAndPersist(): Promise<LoadResult> {
  const spaces = createSeedSpaces();
  const settings = defaultSettings();
  const currentSpaceId = spaces[0].id;
  const { fellBack } = await flushSave({ spaces, currentSpaceId, settings });
  return { spaces, currentSpaceId, settings, storageFallbackActive: fellBack };
}

export interface SaveSnapshot {
  spaces: Space[];
  currentSpaceId: string;
  settings: Settings;
}

/** Ghi settings + từng space qua writeKeyWithFallback, rồi ghi space-index sau cùng. */
export async function flushSave(snapshot: SaveSnapshot): Promise<{ fellBack: boolean }> {
  let fellBack = false;

  const settingsWrite = await writeKeyWithFallback(SETTINGS_KEY, snapshot.settings);
  if (settingsWrite.fellBack) fellBack = true;

  const locations: SpaceIndexEntry[] = [];
  for (const space of snapshot.spaces) {
    const result = await writeKeyWithFallback(spaceKey(space.id), space);
    if (result.fellBack) fellBack = true;
    locations.push({ id: space.id, storageArea: result.area });
  }

  const index: SpaceIndex = {
    schemaVersion: SCHEMA_VERSION,
    currentSpaceId: snapshot.currentSpaceId,
    order: snapshot.spaces.map((s) => s.id),
    locations,
  };
  // space-index luôn ở sync (nhỏ, không cần fallback) — nhưng vẫn dùng helper để an toàn.
  await writeToArea('sync', SPACE_INDEX_KEY, index);

  return { fellBack };
}

/** Xoá hẳn 1 space khỏi cả 2 khu vực storage (gọi khi xoá space). */
export async function removeSpaceKey(id: string): Promise<void> {
  await removeFromArea('sync', spaceKey(id));
  await removeFromArea('local', spaceKey(id));
}

// ============================================================================
// Debounce save
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
    void flushPendingSave();
  }, debounceMs);
}

async function flushPendingSave(): Promise<void> {
  if (!pendingSnapshot) return;
  const snapshot = pendingSnapshot;
  pendingSnapshot = null;
  const { fellBack } = await flushSave(snapshot);
  onFallbackChange?.(fellBack);
}

/** Dùng khi muốn đảm bảo lưu ngay (vd. trước khi đóng tab) — không đợi debounce. */
export async function forceFlush(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await flushPendingSave();
}

export function buildUiInitialState(): UiState {
  return {
    taskFilter: 'all',
    noteSearch: '',
    noteSortBy: 'order',
    noteView: 'grid',
    hiddenNoteContentIds: new Set(),
  };
}

/** Đăng ký lắng nghe chrome.storage.onChanged để đồng bộ UI giữa các máy. */
export function subscribeStorageChanges(
  callback: (changes: chrome.storage.StorageChange & { key: string; area: StorageArea }) => void,
): () => void {
  const handler = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string,
  ) => {
    if (areaName !== 'sync' && areaName !== 'local') return;
    for (const key of Object.keys(changes)) {
      callback({ ...changes[key], key, area: areaName as StorageArea });
    }
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

export type { AppState };
