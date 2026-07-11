// =============================================================================
// migrateLegacyHabits.ts — di trú Thói quen (Habit) từ mảng jsonb CŨ (`habits`
// trong `kn_private_spaces`) sang bảng RIÊNG MỚI (`kn_private_habits`, xem
// docs/features/item-level-habit-schema.sql). Bước 2, sub-bước 5 của
// docs/features/item-level-entity-tables.md.
// =============================================================================
// ĐÃ CHẠY XONG (2026-07-11) — User B (tài khoản phụ) test sạch trước, sau đó
// User A (tài khoản chính) migrate thật, đối chiếu 3/3 khớp, không lệch. Giữ
// nguyên script này (idempotent, an toàn chạy lại) làm tài liệu tham khảo —
// mirror `migrateLegacyLogs.ts` đã áp dụng thành công trước đó.
//
// Khác `migrateLegacyLogs.ts` — Habit KHÔNG có bản Shared (không có
// `kn_shared_habits`, xem `docs/features/item-level-habit-schema.sql`): chỉ
// đọc/ghi `kn_private_spaces`/`kn_private_habits`, không có nhánh shared nào
// để xử lý.
//   - THUẦN THEO USER ĐANG ĐĂNG NHẬP (RLS + filter tường minh) — mỗi user tự
//     migrate đúng dữ liệu của họ, không cần service-role key.
//   - IDEMPOTENT — id đã có trên bảng mới LUÔN bị bỏ qua, không ghi đè.
//   - TÁCH BẠCH đọc-trước/ghi-sau: `previewLegacyHabitsMigration()` (dry-run,
//     chỉ SELECT) và `runLegacyHabitsMigration()` (thực thi, có INSERT) độc lập.
//
// ĐIỀU KIỆN TIÊN QUYẾT trước khi gọi `run()` cho bất kỳ tài khoản nào: đã chạy
// `docs/features/item-level-habit-schema.sql` trên Supabase Dashboard (đã chạy
// xong). Nếu bảng chưa tồn tại, mọi lệnh SELECT/INSERT ở đây trả lỗi "relation
// does not exist" — an toàn (không có gì để ghi sai), chỉ là báo lỗi rõ ràng
// thay vì chạy được.
// =============================================================================

import type { Habit, Space } from '../types';
import { loadPrivateSpaces } from './privateSpaceStore';
import { insertHabitsBulk, listExistingHabitIds } from './habitStore';

export interface LegacyHabitSummary {
  id: string;
  spaceId: string;
  spaceName: string;
  title: string;
}

export interface LegacyHabitsMigrationPreview {
  /** Habit SẼ được migrate nếu gọi `runLegacyHabitsMigration()` ngay sau đó — id chưa có ở bảng mới. */
  toMigrate: LegacyHabitSummary[];
  /** Số habit BỎ QUA (id đã tồn tại ở bảng mới — đã migrate từ trước, hoặc habit tạo mới sau khi bật
   * `HABIT_ITEM_PERSIST_ENABLED`). Không liệt kê chi tiết từng cái, chỉ đếm. */
  toSkipCount: number;
}

function toSummary(space: Space, habit: Habit): LegacyHabitSummary {
  return { id: habit.id, spaceId: space.id, spaceName: space.name, title: habit.title };
}

/**
 * DRY-RUN — CHỈ ĐỌC, không ghi bất cứ gì. Dùng để xem trước kết quả migration (User B trước, User A
 * sau khi User B sạch — xem docs/features/item-level-entity-tables-progress.md).
 */
export async function previewLegacyHabitsMigration(): Promise<LegacyHabitsMigrationPreview> {
  const [privateSpaces, existingIds] = await Promise.all([loadPrivateSpaces(), listExistingHabitIds()]);

  const toMigrate: LegacyHabitSummary[] = [];
  let toSkipCount = 0;

  privateSpaces.forEach((space) => {
    space.habits.forEach((habit) => {
      if (existingIds.has(habit.id)) {
        toSkipCount += 1;
        return;
      }
      toMigrate.push(toSummary(space, habit));
    });
  });

  return { toMigrate, toSkipCount };
}

export interface LegacyHabitsMigrationResult {
  migratedCount: number;
  skippedCount: number;
  error?: string;
}

/**
 * THỰC THI migrate — INSERT các Habit trong `habits[]` (cũ, jsonb) mà `id` CHƯA tồn tại ở bảng mới.
 * Tự đọc lại state MỚI NHẤT tại thời điểm gọi (không tái dùng kết quả `previewLegacyHabitsMigration()`
 * gọi trước đó) — an toàn hơn nếu có habit được tạo/migrate xen giữa.
 *
 * An toàn gọi lại nhiều lần (idempotent): habit đã có trên bảng mới luôn bị lọc khỏi payload gửi đi.
 * Ghi qua 1 lượt `insertHabitsBulk()` duy nhất cho TOÀN BỘ habit cần migrate (mục 4.3,
 * item-level-entity-tables.md), không phải N call riêng lẻ theo từng Space/từng habit.
 */
export async function runLegacyHabitsMigration(): Promise<LegacyHabitsMigrationResult> {
  const [privateSpaces, existingIds] = await Promise.all([loadPrivateSpaces(), listExistingHabitIds()]);

  let totalLegacy = 0;
  const rows: { spaceId: string; habit: Habit }[] = [];
  privateSpaces.forEach((space) => {
    space.habits.forEach((habit) => {
      totalLegacy += 1;
      if (!existingIds.has(habit.id)) rows.push({ spaceId: space.id, habit });
    });
  });

  const skippedCount = totalLegacy - rows.length;
  if (rows.length === 0) {
    return { migratedCount: 0, skippedCount };
  }

  const result = await insertHabitsBulk(rows);
  if (!result.ok) {
    return { migratedCount: 0, skippedCount, error: `Lỗi migrate Habit: ${result.error}` };
  }

  return { migratedCount: rows.length, skippedCount };
}
