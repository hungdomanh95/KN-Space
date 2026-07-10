// =============================================================================
// migrateLegacyLogs.ts — di trú Nhật ký nhanh (Log) từ mảng jsonb CŨ (`logs`
// trong `kn_private_spaces`/`kn_shared_spaces`) sang bảng RIÊNG MỚI
// (`kn_private_logs`/`kn_shared_logs`, xem docs/features/item-level-log-schema.sql).
// Bước 1, sub-bước 4/5 của docs/features/item-level-entity-tables.md.
// =============================================================================
// ĐÃ CHẠY THẬT (schema + migrate dữ liệu cũ xong, `LOG_ITEM_PERSIST_ENABLED`
// đã bật — "Giai đoạn A", xem -progress.md). Vẫn giữ nguyên idempotent, có thể
// gọi lại `preview()`/`run()` an toàn bất cứ lúc nào (vd đối chiếu lệch dữ liệu
// trong lúc Giai đoạn A đang chạy). Mirror CHÍNH XÁC `migrateLegacySpaces.ts`
// (đã dùng thành công ở lần tách bảng Space):
//   - THUẦN THEO USER ĐANG ĐĂNG NHẬP (RLS + filter tường minh cho private,
//     RLS `is_space_member` cho shared) — mỗi user tự migrate đúng dữ liệu họ
//     truy cập được, không cần service-role key.
//   - IDEMPOTENT — id đã có trên bảng mới LUÔN bị bỏ qua, không ghi đè.
//   - TÁCH BẠCH đọc-trước/ghi-sau: `previewLegacyLogsMigration()` (dry-run,
//     chỉ SELECT) và `runLegacyLogsMigration()` (thực thi, có INSERT) độc lập.
//   - `created_at` LUÔN gửi tường minh = `LogEntry.createdAt` cũ (qua
//     `insertLogsBulk()`, xem `logStore.ts`) — KHÔNG để DB tự `now()`, giữ
//     đúng mốc thời gian gốc của log đã tạo từ trước.
//
// ĐIỀU KIỆN TIÊN QUYẾT trước khi gọi `run()` cho bất kỳ tài khoản nào: đã chạy
// `docs/features/item-level-log-schema.sql` trên Supabase Dashboard. Nếu chưa,
// mọi lệnh SELECT/INSERT ở đây trả lỗi "relation does not exist" — an toàn
// (không có gì để ghi sai), chỉ là báo lỗi rõ ràng thay vì chạy được.
// =============================================================================

import type { LogEntry, Space } from '../types';
import { loadPrivateSpaces } from './privateSpaceStore';
import { loadSharedSpaces } from './sharedSpaceStore';
import { insertLogsBulk, listExistingLogIds, type LogScope } from './logStore';

export interface LegacyLogSummary {
  id: string;
  spaceId: string;
  spaceName: string;
  scope: LogScope;
  contentPreview: string; // content.slice(0, 60) — đủ để nhận diện log khi xem log preview() ở console
  createdAt: string;
}

export interface LegacyLogsMigrationPreview {
  /** Log SẼ được migrate nếu gọi `runLegacyLogsMigration()` ngay sau đó — id chưa có ở bảng mới. */
  toMigrate: LegacyLogSummary[];
  /** Số log BỎ QUA (id đã tồn tại ở bảng mới — đã migrate từ trước, hoặc log tạo mới sau khi bật
   * `LOG_ITEM_PERSIST_ENABLED`). Không liệt kê chi tiết từng cái (có thể rất nhiều), chỉ đếm. */
  toSkipCount: number;
}

function toSummary(scope: LogScope, space: Space, log: LogEntry): LegacyLogSummary {
  return {
    id: log.id,
    spaceId: scope === 'shared' ? (space.sharedSpaceId ?? space.id) : space.id,
    spaceName: space.name,
    scope,
    contentPreview: log.content.length > 60 ? `${log.content.slice(0, 60)}…` : log.content,
    createdAt: log.createdAt,
  };
}

/**
 * DRY-RUN — CHỈ ĐỌC, không ghi bất cứ gì. Dùng để xem trước kết quả migration (đặc biệt cho tài
 * khoản phụ User B trước, rồi tài khoản chính User A sau khi User B sạch — xem
 * docs/features/item-level-entity-tables-progress.md).
 */
export async function previewLegacyLogsMigration(): Promise<LegacyLogsMigrationPreview> {
  const [privateSpaces, sharedSpaces, existingPrivateIds, existingSharedIds] = await Promise.all([
    loadPrivateSpaces(),
    loadSharedSpaces(),
    listExistingLogIds('private'),
    listExistingLogIds('shared'),
  ]);

  const toMigrate: LegacyLogSummary[] = [];
  let toSkipCount = 0;

  privateSpaces.forEach((space) => {
    space.logs.forEach((log) => {
      if (existingPrivateIds.has(log.id)) {
        toSkipCount += 1;
        return;
      }
      toMigrate.push(toSummary('private', space, log));
    });
  });

  sharedSpaces.forEach((space) => {
    space.logs.forEach((log) => {
      if (existingSharedIds.has(log.id)) {
        toSkipCount += 1;
        return;
      }
      toMigrate.push(toSummary('shared', space, log));
    });
  });

  return { toMigrate, toSkipCount };
}

export interface LegacyLogsMigrationResult {
  migratedCount: number;
  skippedCount: number;
  error?: string;
}

/**
 * THỰC THI migrate — INSERT các Log trong `logs[]` (cũ, jsonb) mà `id` CHƯA tồn tại ở bảng mới
 * tương ứng (private/shared). Tự đọc lại state MỚI NHẤT tại thời điểm gọi (không tái dùng kết quả
 * `previewLegacyLogsMigration()` gọi trước đó) — an toàn hơn nếu có log được tạo/migrate xen giữa.
 *
 * An toàn gọi lại nhiều lần (idempotent): log đã có trên bảng mới luôn bị lọc khỏi payload gửi đi.
 * Ghi theo 2 lượt `insertLogsBulk()` riêng (private, shared) — mỗi lượt 1 network call duy nhất cho
 * TOÀN BỘ log cần migrate của scope đó (mục 4.3, item-level-entity-tables.md), không phải N call
 * riêng lẻ theo từng Space/từng log.
 */
export async function runLegacyLogsMigration(): Promise<LegacyLogsMigrationResult> {
  const [privateSpaces, sharedSpaces, existingPrivateIds, existingSharedIds] = await Promise.all([
    loadPrivateSpaces(),
    loadSharedSpaces(),
    listExistingLogIds('private'),
    listExistingLogIds('shared'),
  ]);

  let totalLegacy = 0;
  const privateRows: { spaceId: string; log: LogEntry }[] = [];
  privateSpaces.forEach((space) => {
    space.logs.forEach((log) => {
      totalLegacy += 1;
      if (!existingPrivateIds.has(log.id)) privateRows.push({ spaceId: space.id, log });
    });
  });

  const sharedRows: { spaceId: string; log: LogEntry }[] = [];
  sharedSpaces.forEach((space) => {
    const sid = space.sharedSpaceId ?? space.id;
    space.logs.forEach((log) => {
      totalLegacy += 1;
      if (!existingSharedIds.has(log.id)) sharedRows.push({ spaceId: sid, log });
    });
  });

  const totalToMigrate = privateRows.length + sharedRows.length;
  const skippedCount = totalLegacy - totalToMigrate;

  if (totalToMigrate === 0) {
    return { migratedCount: 0, skippedCount };
  }

  if (privateRows.length > 0) {
    const result = await insertLogsBulk('private', privateRows);
    if (!result.ok) {
      return { migratedCount: 0, skippedCount, error: `Lỗi migrate Log Space cá nhân: ${result.error}` };
    }
  }

  if (sharedRows.length > 0) {
    const result = await insertLogsBulk('shared', sharedRows);
    if (!result.ok) {
      // Private đã ghi xong (nếu có) — báo rõ phần nào xong, gọi lại run() sẽ tự bỏ qua phần đã
      // migrate (idempotent) và chỉ retry phần shared còn lỗi.
      return {
        migratedCount: privateRows.length,
        skippedCount,
        error: `Đã migrate ${privateRows.length} log Space cá nhân, nhưng lỗi migrate Log Shared Space: ${result.error}`,
      };
    }
  }

  return { migratedCount: totalToMigrate, skippedCount };
}
