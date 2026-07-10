// =============================================================================
// migrateLegacySpaces.ts — Phần B Bước 4 (storage-architecture-fix): migration data
// =============================================================================
// Chuyển Space cá nhân từ mảng jsonb CŨ (`kn_space_state.spaces[]`, ngừng đọc/ghi từ Bước 3 —
// xem `supabaseStore.ts`) sang các HÀNG RIÊNG trên `kn_private_spaces` (mới, xem
// `privateSpaceStore.ts`). Xem docs/features/storage-architecture-fix.md mục 4 Bước 4.
//
// Nguyên tắc bắt buộc của module này:
//   - THUẦN THEO USER ĐANG ĐĂNG NHẬP — mọi query đều lọc `user_id = auth.uid()` (qua RLS + filter
//     tường minh), không có service-role key nên KHÔNG THỂ (và không cần) chạy cho user khác — mỗi
//     user tự migrate đúng dữ liệu của chính họ khi gọi hàm này trong phiên đăng nhập của họ.
//   - IDEMPOTENT — gọi lại nhiều lần an toàn: Space đã có hàng trên `kn_private_spaces` (id trùng)
//     LUÔN bị bỏ qua, KHÔNG BAO GIỜ ghi đè bằng dữ liệu cũ hơn từ `spaces[]`.
//   - TÁCH BẠCH đọc-trước/ghi-sau: `previewLegacySpacesMigration()` (dry-run, chỉ SELECT) và
//     `runLegacySpacesMigration()` (thực thi, có INSERT) là 2 hàm độc lập — gọi preview không bao
//     giờ làm thay đổi dữ liệu.
//   - Không đụng `loadAppState()` (`supabaseStore.ts`, đã ngừng đọc cột `spaces` từ Bước 3) — hàm
//     đọc cột cũ ở đây (`readLegacySpacesColumn`) là hàm MỚI, riêng biệt, chỉ phục vụ migration.
// =============================================================================

import { supabase } from '../lib/supabaseClient';
import { normalizeSpace } from './normalize';
import { upsertPrivateSpaces } from './privateSpaceStore';
import type { Space } from '../types';

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Chưa đăng nhập');
  return data.user.id;
}

/**
 * Đọc RIÊNG cột `spaces` (jsonb, cũ) của user hiện tại từ `kn_space_state` — KHÔNG dùng chung với
 * `loadAppState()` (module `supabaseStore.ts`, cố ý đã ngừng đọc cột này từ Bước 3). Shape phần tử
 * mảng cũ trùng `interface Space` trước khi tách bảng (id/name/order/enabledBlocks/tasks/reminders/
 * habits/notes/logs) — tái dùng `normalizeSpace()` để vá field thiếu/hỏng, giống cách IMPORT_DATA
 * (file export JSON) đã làm, không viết lại logic chuẩn hoá riêng.
 */
async function readLegacySpacesColumn(): Promise<Space[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('kn_space_state')
    .select('spaces')
    .eq('user_id', userId)
    .maybeSingle<{ spaces: unknown }>();

  if (error) {
    console.warn('[KN-Space] readLegacySpacesColumn lỗi:', error.message);
    throw error;
  }
  const raw = data?.spaces;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Space => !!s && typeof s === 'object' && typeof (s as Space).id === 'string')
    .map((s) => normalizeSpace(s));
}

/** id các Space cá nhân ĐÃ tồn tại trên `kn_private_spaces` của user hiện tại — dùng để phân biệt
 * Space nào trong `spaces[]` cũ CẦN migrate (id chưa có) và Space nào BỎ QUA (id đã có sẵn). */
async function listExistingPrivateSpaceIds(): Promise<Set<string>> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('kn_private_spaces')
    .select('id')
    .eq('user_id', userId);
  if (error) {
    console.warn('[KN-Space] listExistingPrivateSpaceIds lỗi:', error.message);
    throw error;
  }
  return new Set((data ?? []).map((r) => r.id as string));
}

export interface LegacySpaceSummary {
  id: string;
  name: string;
}

export interface LegacyMigrationPreview {
  /** Space SẼ được migrate nếu gọi `runLegacySpacesMigration()` ngay sau đó — id chưa có ở `kn_private_spaces`. */
  toMigrate: LegacySpaceSummary[];
  /** Space BỎ QUA — id đã tồn tại ở `kn_private_spaces` (đã migrate từ trước, hoặc Space tạo mới sau Bước 3). */
  toSkip: LegacySpaceSummary[];
}

/**
 * DRY-RUN — CHỈ ĐỌC, không ghi bất cứ gì. Dùng để xem trước kết quả migration trước khi tin tưởng
 * chạy thật (`runLegacySpacesMigration()`), đặc biệt cho Bước 5 (chủ dự án tự xác nhận trước khi
 * chạy trên dữ liệu thật của họ).
 */
export async function previewLegacySpacesMigration(): Promise<LegacyMigrationPreview> {
  const [legacySpaces, existingIds] = await Promise.all([
    readLegacySpacesColumn(),
    listExistingPrivateSpaceIds(),
  ]);
  const toMigrate: LegacySpaceSummary[] = [];
  const toSkip: LegacySpaceSummary[] = [];
  for (const space of legacySpaces) {
    const summary = { id: space.id, name: space.name };
    if (existingIds.has(space.id)) toSkip.push(summary);
    else toMigrate.push(summary);
  }
  return { toMigrate, toSkip };
}

export interface LegacyMigrationResult {
  migratedCount: number;
  skippedCount: number;
  migratedNames: string[];
  error?: string;
}

/**
 * THỰC THI migrate — INSERT các Space trong `kn_space_state.spaces` (cũ) mà `id` CHƯA tồn tại ở
 * `kn_private_spaces` (mới). Tự đọc lại `listExistingPrivateSpaceIds()` ngay tại thời điểm gọi
 * (KHÔNG tái dùng kết quả từ 1 lần `previewLegacySpacesMigration()` gọi trước đó) — an toàn hơn nếu
 * có Space được tạo/migrate xen giữa lúc preview và lúc thực thi.
 *
 * An toàn gọi lại nhiều lần (idempotent): Space đã có hàng trên `kn_private_spaces` luôn bị lọc bỏ
 * khỏi payload gửi đi, không bao giờ bị ghi đè bằng dữ liệu cũ hơn.
 */
export async function runLegacySpacesMigration(): Promise<LegacyMigrationResult> {
  const [legacySpaces, existingIds] = await Promise.all([
    readLegacySpacesColumn(),
    listExistingPrivateSpaceIds(),
  ]);
  const toMigrate = legacySpaces.filter((s) => !existingIds.has(s.id));
  const skippedCount = legacySpaces.length - toMigrate.length;

  if (toMigrate.length === 0) {
    return { migratedCount: 0, skippedCount, migratedNames: [] };
  }

  // `upsertPrivateSpaces` an toàn dùng ở đây vì `toMigrate` đã được lọc CHỈ còn id chưa tồn tại —
  // upsert tương đương insert thuần cho tập này (không có hàng nào bị "đè"). Tái dùng hàm đã có
  // (đã test ở Bước 3) thay vì viết lại logic insert hàng loạt.
  const result = await upsertPrivateSpaces(toMigrate);
  if (!result.ok) {
    return { migratedCount: 0, skippedCount, migratedNames: [], error: result.error };
  }

  return { migratedCount: toMigrate.length, skippedCount, migratedNames: toMigrate.map((s) => s.name) };
}
