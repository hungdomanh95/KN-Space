// =============================================================================
// migrateLegacyNotes.ts — di trú Ghi chú (Note) từ mảng jsonb CŨ (`notes` trong
// `kn_private_spaces`/`kn_shared_spaces`) sang bảng RIÊNG MỚI
// (`kn_private_notes`/`kn_shared_notes`, xem docs/features/
// item-level-note-schema.sql). Bước 5, sub-bước 5 của docs/features/
// item-level-entity-tables.md.
// =============================================================================
// CHỈ MỚI VIẾT SẴN SCRIPT — CHƯA chạy `item-level-note-schema.sql` trên
// Supabase Dashboard, CHƯA gọi `.run()` cho bất kỳ tài khoản nào. Mirror CHÍNH
// XÁC `migrateLegacyTasks.ts` (Note CÓ bản Shared, giống Task/Log/Reminder —
// khác Habit):
//   - THUẦN THEO USER ĐANG ĐĂNG NHẬP (RLS + filter tường minh cho private,
//     RLS `is_space_member` cho shared) — mỗi user tự migrate đúng dữ liệu họ
//     truy cập được, không cần service-role key.
//   - IDEMPOTENT — id đã có trên bảng mới LUÔN bị bỏ qua, không ghi đè.
//   - TÁCH BẠCH đọc-trước/ghi-sau: `previewLegacyNotesMigration()` (dry-run,
//     chỉ SELECT) và `runLegacyNotesMigration()` (thực thi, có INSERT) độc lập.
//   - `order` -> `item_order` GIỮ NGUYÊN giá trị số nguyên cũ làm giá trị
//     fractional ban đầu (số nguyên vẫn là số thực hợp lệ, không cần convert).
//   - `updatedAt` -> `content_updated_at` GIỮ NGUYÊN giá trị epoch ms cũ —
//     KHÔNG tính lại "now" (mốc "sửa nội dung lần cuối" phải giữ đúng lịch sử
//     đã có, xem giải thích đầy đủ ở header `item-level-note-schema.sql`).
//   - `created_at` — CHỈ set tường minh khi `Note.createdAt` có giá trị thật
//     (field optional ở tầng app — xem giải thích đầy đủ ở header
//     `item-level-note-schema.sql`/`noteStore.ts`, mirror Task). Note thiếu
//     field này (tạo trước khi field ra đời) để cột DB NULL, không set
//     `now()` giả.
//
// ĐIỀU KIỆN TIÊN QUYẾT trước khi gọi `run()` cho bất kỳ tài khoản nào: đã chạy
// `docs/features/item-level-note-schema.sql` trên Supabase Dashboard. Nếu
// chưa, mọi lệnh SELECT/INSERT ở đây trả lỗi "relation does not exist" — an
// toàn (không có gì để ghi sai), chỉ là báo lỗi rõ ràng thay vì chạy được.
// =============================================================================

import type { Note, Space } from '../types';
import { loadPrivateSpaces } from './privateSpaceStore';
import { loadSharedSpaces } from './sharedSpaceStore';
import { insertNotesBulk, listExistingNoteIds, type NoteScope } from './noteStore';

export interface LegacyNoteSummary {
  id: string;
  spaceId: string;
  spaceName: string;
  scope: NoteScope;
  title: string; // đủ để nhận diện note khi xem preview() ở console
}

export interface LegacyNotesMigrationPreview {
  /** Note SẼ được migrate nếu gọi `runLegacyNotesMigration()` ngay sau đó — id chưa có ở bảng mới. */
  toMigrate: LegacyNoteSummary[];
  /** Số note BỎ QUA (id đã tồn tại ở bảng mới — đã migrate từ trước, hoặc note tạo mới sau khi bật
   * `NOTE_ITEM_PERSIST_ENABLED`). Không liệt kê chi tiết từng cái, chỉ đếm. */
  toSkipCount: number;
}

function toSummary(scope: NoteScope, space: Space, note: Note): LegacyNoteSummary {
  return {
    id: note.id,
    spaceId: scope === 'shared' ? (space.sharedSpaceId ?? space.id) : space.id,
    spaceName: space.name,
    scope,
    title: note.title,
  };
}

/**
 * DRY-RUN — CHỈ ĐỌC, không ghi bất cứ gì. Dùng để xem trước kết quả migration (User B trước, User A
 * sau khi User B sạch — xem docs/features/item-level-entity-tables-progress.md).
 */
export async function previewLegacyNotesMigration(): Promise<LegacyNotesMigrationPreview> {
  const [privateSpaces, sharedSpaces, existingPrivateIds, existingSharedIds] = await Promise.all([
    loadPrivateSpaces(),
    loadSharedSpaces(),
    listExistingNoteIds('private'),
    listExistingNoteIds('shared'),
  ]);

  const toMigrate: LegacyNoteSummary[] = [];
  let toSkipCount = 0;

  privateSpaces.forEach((space) => {
    space.notes.forEach((note) => {
      if (existingPrivateIds.has(note.id)) {
        toSkipCount += 1;
        return;
      }
      toMigrate.push(toSummary('private', space, note));
    });
  });

  sharedSpaces.forEach((space) => {
    space.notes.forEach((note) => {
      if (existingSharedIds.has(note.id)) {
        toSkipCount += 1;
        return;
      }
      toMigrate.push(toSummary('shared', space, note));
    });
  });

  return { toMigrate, toSkipCount };
}

export interface LegacyNotesMigrationResult {
  migratedCount: number;
  skippedCount: number;
  error?: string;
}

/**
 * THỰC THI migrate — INSERT các Note trong `notes[]` (cũ, jsonb) mà `id` CHƯA tồn tại ở bảng mới
 * tương ứng (private/shared). Tự đọc lại state MỚI NHẤT tại thời điểm gọi (không tái dùng kết quả
 * `previewLegacyNotesMigration()` gọi trước đó) — an toàn hơn nếu có note được tạo/migrate xen giữa.
 *
 * An toàn gọi lại nhiều lần (idempotent): note đã có trên bảng mới luôn bị lọc khỏi payload gửi đi.
 * Ghi theo 2 lượt `insertNotesBulk()` riêng (private, shared) — mỗi lượt 1 network call duy nhất cho
 * TOÀN BỘ note cần migrate của scope đó (mục 4.3, item-level-entity-tables.md), không phải N call
 * riêng lẻ theo từng Space/từng note.
 */
export async function runLegacyNotesMigration(): Promise<LegacyNotesMigrationResult> {
  const [privateSpaces, sharedSpaces, existingPrivateIds, existingSharedIds] = await Promise.all([
    loadPrivateSpaces(),
    loadSharedSpaces(),
    listExistingNoteIds('private'),
    listExistingNoteIds('shared'),
  ]);

  let totalLegacy = 0;
  const privateRows: { spaceId: string; note: Note }[] = [];
  privateSpaces.forEach((space) => {
    space.notes.forEach((note) => {
      totalLegacy += 1;
      if (!existingPrivateIds.has(note.id)) privateRows.push({ spaceId: space.id, note });
    });
  });

  const sharedRows: { spaceId: string; note: Note }[] = [];
  sharedSpaces.forEach((space) => {
    const sid = space.sharedSpaceId ?? space.id;
    space.notes.forEach((note) => {
      totalLegacy += 1;
      if (!existingSharedIds.has(note.id)) sharedRows.push({ spaceId: sid, note });
    });
  });

  const totalToMigrate = privateRows.length + sharedRows.length;
  const skippedCount = totalLegacy - totalToMigrate;

  if (totalToMigrate === 0) {
    return { migratedCount: 0, skippedCount };
  }

  if (privateRows.length > 0) {
    const result = await insertNotesBulk('private', privateRows);
    if (!result.ok) {
      return { migratedCount: 0, skippedCount, error: `Lỗi migrate Note Space cá nhân: ${result.error}` };
    }
  }

  if (sharedRows.length > 0) {
    const result = await insertNotesBulk('shared', sharedRows);
    if (!result.ok) {
      // Private đã ghi xong (nếu có) — báo rõ phần nào xong, gọi lại run() sẽ tự bỏ qua phần đã
      // migrate (idempotent) và chỉ retry phần shared còn lỗi.
      return {
        migratedCount: privateRows.length,
        skippedCount,
        error: `Đã migrate ${privateRows.length} note Space cá nhân, nhưng lỗi migrate Note Shared Space: ${result.error}`,
      };
    }
  }

  return { migratedCount: totalToMigrate, skippedCount };
}
