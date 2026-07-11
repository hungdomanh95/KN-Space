// =============================================================================
// migrateLegacyReminders.ts — di trú Nhắc việc (Reminder) từ mảng jsonb CŨ
// (`reminders` trong `kn_private_spaces`/`kn_shared_spaces`) sang bảng RIÊNG
// MỚI (`kn_private_reminders`/`kn_shared_reminders`, xem docs/features/
// item-level-reminder-schema.sql). Bước 3, sub-bước 5 của docs/features/
// item-level-entity-tables.md.
// =============================================================================
// CHỈ MỚI VIẾT SẴN SCRIPT — CHƯA chạy `item-level-reminder-schema.sql` trên
// Supabase Dashboard, CHƯA gọi `.run()` cho bất kỳ tài khoản nào. Mirror CHÍNH
// XÁC `migrateLegacyLogs.ts` (Reminder CÓ bản Shared, giống Log — khác
// Habit):
//   - THUẦN THEO USER ĐANG ĐĂNG NHẬP (RLS + filter tường minh cho private,
//     RLS `is_space_member` cho shared) — mỗi user tự migrate đúng dữ liệu họ
//     truy cập được, không cần service-role key.
//   - IDEMPOTENT — id đã có trên bảng mới LUÔN bị bỏ qua, không ghi đè.
//   - TÁCH BẠCH đọc-trước/ghi-sau: `previewLegacyRemindersMigration()`
//     (dry-run, chỉ SELECT) và `runLegacyRemindersMigration()` (thực thi, có
//     INSERT) độc lập.
//   - `created_at` — CHỈ set tường minh cho reminder `type === 'recurring'`
//     (= `ReminderRecurring.createdAt` cũ, mốc tính chu kỳ — PHẢI giữ đúng
//     nguyên giá trị, kể cả dữ liệu CŨ chỉ có dạng "yyyy-mm-dd" không có giờ,
//     xem `supabase/functions/send-due-notifications/index.ts` xử lý fallback
//     riêng cho trường hợp này). Reminder `type === 'once'` KHÔNG có field
//     tương đương ở tầng app (`ReminderOnce` không có `createdAt`) — để DB tự
//     `now()` khi migrate, không có gì để giữ lại (mirror cách
//     `migrateLegacyHabits.ts` xử lý — Habit cũng không có field này).
//
// ĐIỀU KIỆN TIÊN QUYẾT trước khi gọi `run()` cho bất kỳ tài khoản nào: đã chạy
// `docs/features/item-level-reminder-schema.sql` trên Supabase Dashboard. Nếu
// chưa, mọi lệnh SELECT/INSERT ở đây trả lỗi "relation does not exist" — an
// toàn (không có gì để ghi sai), chỉ là báo lỗi rõ ràng thay vì chạy được.
// =============================================================================

import type { ReminderDefinition, Space } from '../types';
import { loadPrivateSpaces } from './privateSpaceStore';
import { loadSharedSpaces } from './sharedSpaceStore';
import { insertRemindersBulk, listExistingReminderIds, type ReminderScope } from './reminderStore';

export interface LegacyReminderSummary {
  id: string;
  spaceId: string;
  spaceName: string;
  scope: ReminderScope;
  type: 'once' | 'recurring';
  title: string; // đủ để nhận diện reminder khi xem preview() ở console
}

export interface LegacyRemindersMigrationPreview {
  /** Reminder SẼ được migrate nếu gọi `runLegacyRemindersMigration()` ngay sau đó — id chưa có ở
   * bảng mới. */
  toMigrate: LegacyReminderSummary[];
  /** Số reminder BỎ QUA (id đã tồn tại ở bảng mới — đã migrate từ trước, hoặc reminder tạo mới sau
   * khi bật `REMINDER_ITEM_PERSIST_ENABLED`). Không liệt kê chi tiết từng cái, chỉ đếm. */
  toSkipCount: number;
}

function toSummary(scope: ReminderScope, space: Space, reminder: ReminderDefinition): LegacyReminderSummary {
  return {
    id: reminder.id,
    spaceId: scope === 'shared' ? (space.sharedSpaceId ?? space.id) : space.id,
    spaceName: space.name,
    scope,
    type: reminder.type,
    title: reminder.title,
  };
}

/**
 * DRY-RUN — CHỈ ĐỌC, không ghi bất cứ gì. Dùng để xem trước kết quả migration (User B trước, User A
 * sau khi User B sạch — xem docs/features/item-level-entity-tables-progress.md).
 */
export async function previewLegacyRemindersMigration(): Promise<LegacyRemindersMigrationPreview> {
  const [privateSpaces, sharedSpaces, existingPrivateIds, existingSharedIds] = await Promise.all([
    loadPrivateSpaces(),
    loadSharedSpaces(),
    listExistingReminderIds('private'),
    listExistingReminderIds('shared'),
  ]);

  const toMigrate: LegacyReminderSummary[] = [];
  let toSkipCount = 0;

  privateSpaces.forEach((space) => {
    space.reminders.forEach((reminder) => {
      if (existingPrivateIds.has(reminder.id)) {
        toSkipCount += 1;
        return;
      }
      toMigrate.push(toSummary('private', space, reminder));
    });
  });

  sharedSpaces.forEach((space) => {
    space.reminders.forEach((reminder) => {
      if (existingSharedIds.has(reminder.id)) {
        toSkipCount += 1;
        return;
      }
      toMigrate.push(toSummary('shared', space, reminder));
    });
  });

  return { toMigrate, toSkipCount };
}

export interface LegacyRemindersMigrationResult {
  migratedCount: number;
  skippedCount: number;
  error?: string;
}

/**
 * THỰC THI migrate — INSERT các Reminder trong `reminders[]` (cũ, jsonb) mà `id` CHƯA tồn tại ở
 * bảng mới tương ứng (private/shared). Tự đọc lại state MỚI NHẤT tại thời điểm gọi (không tái dùng
 * kết quả `previewLegacyRemindersMigration()` gọi trước đó) — an toàn hơn nếu có reminder được
 * tạo/migrate xen giữa.
 *
 * An toàn gọi lại nhiều lần (idempotent): reminder đã có trên bảng mới luôn bị lọc khỏi payload gửi
 * đi. Ghi theo 2 lượt `insertRemindersBulk()` riêng (private, shared) — mỗi lượt 1 network call duy
 * nhất cho TOÀN BỘ reminder cần migrate của scope đó (mục 4.3, item-level-entity-tables.md), không
 * phải N call riêng lẻ theo từng Space/từng reminder.
 */
export async function runLegacyRemindersMigration(): Promise<LegacyRemindersMigrationResult> {
  const [privateSpaces, sharedSpaces, existingPrivateIds, existingSharedIds] = await Promise.all([
    loadPrivateSpaces(),
    loadSharedSpaces(),
    listExistingReminderIds('private'),
    listExistingReminderIds('shared'),
  ]);

  let totalLegacy = 0;
  const privateRows: { spaceId: string; reminder: ReminderDefinition }[] = [];
  privateSpaces.forEach((space) => {
    space.reminders.forEach((reminder) => {
      totalLegacy += 1;
      if (!existingPrivateIds.has(reminder.id)) privateRows.push({ spaceId: space.id, reminder });
    });
  });

  const sharedRows: { spaceId: string; reminder: ReminderDefinition }[] = [];
  sharedSpaces.forEach((space) => {
    const sid = space.sharedSpaceId ?? space.id;
    space.reminders.forEach((reminder) => {
      totalLegacy += 1;
      if (!existingSharedIds.has(reminder.id)) sharedRows.push({ spaceId: sid, reminder });
    });
  });

  const totalToMigrate = privateRows.length + sharedRows.length;
  const skippedCount = totalLegacy - totalToMigrate;

  if (totalToMigrate === 0) {
    return { migratedCount: 0, skippedCount };
  }

  if (privateRows.length > 0) {
    const result = await insertRemindersBulk('private', privateRows);
    if (!result.ok) {
      return { migratedCount: 0, skippedCount, error: `Lỗi migrate Nhắc việc Space cá nhân: ${result.error}` };
    }
  }

  if (sharedRows.length > 0) {
    const result = await insertRemindersBulk('shared', sharedRows);
    if (!result.ok) {
      // Private đã ghi xong (nếu có) — báo rõ phần nào xong, gọi lại run() sẽ tự bỏ qua phần đã
      // migrate (idempotent) và chỉ retry phần shared còn lỗi.
      return {
        migratedCount: privateRows.length,
        skippedCount,
        error: `Đã migrate ${privateRows.length} nhắc việc Space cá nhân, nhưng lỗi migrate Nhắc việc Shared Space: ${result.error}`,
      };
    }
  }

  return { migratedCount: totalToMigrate, skippedCount };
}
