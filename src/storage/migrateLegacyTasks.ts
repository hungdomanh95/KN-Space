// =============================================================================
// migrateLegacyTasks.ts — di trú Việc cần làm (Task) từ mảng jsonb CŨ
// (`tasks` trong `kn_private_spaces`/`kn_shared_spaces`) sang bảng RIÊNG MỚI
// (`kn_private_tasks`/`kn_shared_tasks`, xem docs/features/
// item-level-task-schema.sql). Bước 4, sub-bước 5 của docs/features/
// item-level-entity-tables.md.
// =============================================================================
// CHỈ MỚI VIẾT SẴN SCRIPT — CHƯA chạy `item-level-task-schema.sql` trên
// Supabase Dashboard, CHƯA gọi `.run()` cho bất kỳ tài khoản nào. Mirror CHÍNH
// XÁC `migrateLegacyLogs.ts` (Task CÓ bản Shared, giống Log/Reminder — khác
// Habit):
//   - THUẦN THEO USER ĐANG ĐĂNG NHẬP (RLS + filter tường minh cho private,
//     RLS `is_space_member` cho shared) — mỗi user tự migrate đúng dữ liệu họ
//     truy cập được, không cần service-role key.
//   - IDEMPOTENT — id đã có trên bảng mới LUÔN bị bỏ qua, không ghi đè.
//   - TÁCH BẠCH đọc-trước/ghi-sau: `previewLegacyTasksMigration()` (dry-run,
//     chỉ SELECT) và `runLegacyTasksMigration()` (thực thi, có INSERT) độc lập.
//   - `order` -> `item_order` GIỮ NGUYÊN giá trị số nguyên cũ làm giá trị
//     fractional ban đầu (số nguyên vẫn là số thực hợp lệ, không cần convert).
//   - `created_at` — CHỈ set tường minh khi `Task.createdAt` có giá trị thật
//     (field optional ở tầng app — xem giải thích đầy đủ ở header
//     `item-level-task-schema.sql`/`taskStore.ts`, KHÁC Log — Log LUÔN set vì
//     `LogEntry.createdAt` bắt buộc). Task thiếu field này (tạo trước khi field
//     ra đời) để cột DB NULL, không set `now()` giả.
//
// ĐIỀU KIỆN TIÊN QUYẾT trước khi gọi `run()` cho bất kỳ tài khoản nào: đã chạy
// `docs/features/item-level-task-schema.sql` trên Supabase Dashboard. Nếu
// chưa, mọi lệnh SELECT/INSERT ở đây trả lỗi "relation does not exist" — an
// toàn (không có gì để ghi sai), chỉ là báo lỗi rõ ràng thay vì chạy được.
// =============================================================================

import type { Space, Task } from '../types';
import { loadPrivateSpaces } from './privateSpaceStore';
import { loadSharedSpaces } from './sharedSpaceStore';
import { insertTasksBulk, listExistingTaskIds, type TaskScope } from './taskStore';

export interface LegacyTaskSummary {
  id: string;
  spaceId: string;
  spaceName: string;
  scope: TaskScope;
  title: string; // đủ để nhận diện task khi xem preview() ở console
}

export interface LegacyTasksMigrationPreview {
  /** Task SẼ được migrate nếu gọi `runLegacyTasksMigration()` ngay sau đó — id chưa có ở bảng mới. */
  toMigrate: LegacyTaskSummary[];
  /** Số task BỎ QUA (id đã tồn tại ở bảng mới — đã migrate từ trước, hoặc task tạo mới sau khi bật
   * `TASK_ITEM_PERSIST_ENABLED`). Không liệt kê chi tiết từng cái, chỉ đếm. */
  toSkipCount: number;
}

function toSummary(scope: TaskScope, space: Space, task: Task): LegacyTaskSummary {
  return {
    id: task.id,
    spaceId: scope === 'shared' ? (space.sharedSpaceId ?? space.id) : space.id,
    spaceName: space.name,
    scope,
    title: task.title,
  };
}

/**
 * DRY-RUN — CHỈ ĐỌC, không ghi bất cứ gì. Dùng để xem trước kết quả migration (User B trước, User A
 * sau khi User B sạch — xem docs/features/item-level-entity-tables-progress.md).
 */
export async function previewLegacyTasksMigration(): Promise<LegacyTasksMigrationPreview> {
  const [privateSpaces, sharedSpaces, existingPrivateIds, existingSharedIds] = await Promise.all([
    loadPrivateSpaces(),
    loadSharedSpaces(),
    listExistingTaskIds('private'),
    listExistingTaskIds('shared'),
  ]);

  const toMigrate: LegacyTaskSummary[] = [];
  let toSkipCount = 0;

  privateSpaces.forEach((space) => {
    space.tasks.forEach((task) => {
      if (existingPrivateIds.has(task.id)) {
        toSkipCount += 1;
        return;
      }
      toMigrate.push(toSummary('private', space, task));
    });
  });

  sharedSpaces.forEach((space) => {
    space.tasks.forEach((task) => {
      if (existingSharedIds.has(task.id)) {
        toSkipCount += 1;
        return;
      }
      toMigrate.push(toSummary('shared', space, task));
    });
  });

  return { toMigrate, toSkipCount };
}

export interface LegacyTasksMigrationResult {
  migratedCount: number;
  skippedCount: number;
  error?: string;
}

/**
 * THỰC THI migrate — INSERT các Task trong `tasks[]` (cũ, jsonb) mà `id` CHƯA tồn tại ở bảng mới
 * tương ứng (private/shared). Tự đọc lại state MỚI NHẤT tại thời điểm gọi (không tái dùng kết quả
 * `previewLegacyTasksMigration()` gọi trước đó) — an toàn hơn nếu có task được tạo/migrate xen giữa.
 *
 * An toàn gọi lại nhiều lần (idempotent): task đã có trên bảng mới luôn bị lọc khỏi payload gửi đi.
 * Ghi theo 2 lượt `insertTasksBulk()` riêng (private, shared) — mỗi lượt 1 network call duy nhất cho
 * TOÀN BỘ task cần migrate của scope đó (mục 4.3, item-level-entity-tables.md), không phải N call
 * riêng lẻ theo từng Space/từng task.
 */
export async function runLegacyTasksMigration(): Promise<LegacyTasksMigrationResult> {
  const [privateSpaces, sharedSpaces, existingPrivateIds, existingSharedIds] = await Promise.all([
    loadPrivateSpaces(),
    loadSharedSpaces(),
    listExistingTaskIds('private'),
    listExistingTaskIds('shared'),
  ]);

  let totalLegacy = 0;
  const privateRows: { spaceId: string; task: Task }[] = [];
  privateSpaces.forEach((space) => {
    space.tasks.forEach((task) => {
      totalLegacy += 1;
      if (!existingPrivateIds.has(task.id)) privateRows.push({ spaceId: space.id, task });
    });
  });

  const sharedRows: { spaceId: string; task: Task }[] = [];
  sharedSpaces.forEach((space) => {
    const sid = space.sharedSpaceId ?? space.id;
    space.tasks.forEach((task) => {
      totalLegacy += 1;
      if (!existingSharedIds.has(task.id)) sharedRows.push({ spaceId: sid, task });
    });
  });

  const totalToMigrate = privateRows.length + sharedRows.length;
  const skippedCount = totalLegacy - totalToMigrate;

  if (totalToMigrate === 0) {
    return { migratedCount: 0, skippedCount };
  }

  if (privateRows.length > 0) {
    const result = await insertTasksBulk('private', privateRows);
    if (!result.ok) {
      return { migratedCount: 0, skippedCount, error: `Lỗi migrate Task Space cá nhân: ${result.error}` };
    }
  }

  if (sharedRows.length > 0) {
    const result = await insertTasksBulk('shared', sharedRows);
    if (!result.ok) {
      // Private đã ghi xong (nếu có) — báo rõ phần nào xong, gọi lại run() sẽ tự bỏ qua phần đã
      // migrate (idempotent) và chỉ retry phần shared còn lỗi.
      return {
        migratedCount: privateRows.length,
        skippedCount,
        error: `Đã migrate ${privateRows.length} task Space cá nhân, nhưng lỗi migrate Task Shared Space: ${result.error}`,
      };
    }
  }

  return { migratedCount: totalToMigrate, skippedCount };
}
