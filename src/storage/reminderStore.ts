// =============================================================================
// reminderStore.ts — item-level storage cho Nhắc việc (Reminder), Bước 3 của kế
// hoạch tách bảng theo entity (docs/features/item-level-entity-tables.md).
// =============================================================================
// Đọc/ghi 2 bảng MỚI `kn_private_reminders`/`kn_shared_reminders` (xem
// docs/features/item-level-reminder-schema.sql — CHƯA chạy thật trên
// Supabase, dữ liệu cũ CHƯA migrate). Các hàm GHI (`createReminder`/
// `updateReminder`/`deleteReminder`) được gọi từ `state/itemPersist.ts`
// (dual-write, cờ `REMINDER_ITEM_PERSIST_ENABLED = false` — xem comment đầu
// file đó, KHÔNG network call nào chạy thật cho tới khi bật cờ). Hàm ĐỌC
// (`loadPrivateReminders`/`loadSharedReminders`) CHƯA được nối vào đâu
// (`AppStateContext.tsx` bootstrap/`refreshStaleSpaces()`) — đó là Giai đoạn
// B, làm ở lượt sau, mirror đúng cách đã áp dụng cho Log/Habit.
//
// Cơ chế cố ý MIRROR CHÍNH XÁC `logStore.ts` (Reminder CÓ bản Shared, khác
// Habit):
//   - KHÔNG version-check/retry — ghi thẳng blind write (`WHERE id =
//     reminderId`), last-write-wins (docs/features/
//     conflict-handling-simplification.md mục 4.3). Cột `version`/trigger vẫn
//     giữ trên DB (miễn phí `updated_at`), tầng app không đọc/dùng để chặn
//     ghi.
//   - `id` do CLIENT tự sinh (`crypto.randomUUID()`, xem
//     `state/reducers/reminders.ts`).
//   - `REMINDER_UPDATE` thay NGUYÊN item (không phải patch hẹp như
//     `LOG_PATCH_EXPENSE`/`HABIT_UPDATE`) — `ReminderFormModal.tsx` cho phép
//     đổi cả `type` (once <-> recurring) khi sửa. Vì vậy `toRow()` LUÔN trả
//     FULL bộ cột theo type MỚI, null tường minh các cột không dùng của type
//     kia — tránh để lại giá trị "mồ côi" (vd `freq_n` cũ còn sau khi đổi
//     recurring -> once).
//   - `created_at` — nguồn DUY NHẤT của `ReminderRecurring.createdAt` (mốc
//     tính chu kỳ lặp lại). CHỈ set tường minh khi reminder đang là
//     'recurring' (cả lúc INSERT lẫn UPDATE) — giá trị đã được
//     `remindersReducer` tính đúng sẵn (giữ nguyên hoặc làm mới, xem
//     `state/reducers/reminders.ts`). KHÔNG set khi type là 'once' (không có
//     ý nghĩa gì, giữ nguyên giá trị DB gốc, tránh reset vô nghĩa).
// =============================================================================

import { supabase } from '../lib/supabaseClient';
import type { ReminderDefinition, ReminderFreqUnit } from '../types';

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Chưa đăng nhập');
  return data.user.id;
}

/** Reminder thuộc Space cá nhân (`kn_private_reminders`) hay Shared Space (`kn_shared_reminders`) —
 * 2 bảng tách riêng hoàn toàn (Phương án B, không polymorphic FK), mirror `LogScope`. */
export type ReminderScope = 'private' | 'shared';

/** Định danh Space cha khi tạo mới 1 Reminder — cần biết cả scope (chọn bảng) lẫn spaceId (giá trị FK). */
export interface ReminderSpaceRef {
  scope: ReminderScope;
  spaceId: string; // = kn_private_spaces.id (private) hoặc kn_shared_spaces.id (shared)
}

function tableFor(scope: ReminderScope): 'kn_private_reminders' | 'kn_shared_reminders' {
  return scope === 'private' ? 'kn_private_reminders' : 'kn_shared_reminders';
}

interface ReminderRow {
  id: string;
  reminder_type: 'once' | 'recurring';
  title: string;
  date: string | null;
  time: string | null;
  freq_n: number | null;
  freq_unit: ReminderFreqUnit | null;
  day_of_month: number | null;
  created_at: string;
}

const REMINDER_SELECT_COLUMNS = 'id,reminder_type,title,date,time,freq_n,freq_unit,day_of_month,created_at';

/** Map 1 hàng DB -> `ReminderDefinition` (frontend type). */
function rowToReminder(row: ReminderRow): ReminderDefinition {
  if (row.reminder_type === 'once') {
    return {
      id: row.id,
      type: 'once',
      title: row.title,
      date: row.date ?? '',
      time: row.time ?? '',
    };
  }
  return {
    id: row.id,
    type: 'recurring',
    title: row.title,
    freqN: row.freq_n ?? 1,
    freqUnit: row.freq_unit ?? 'day',
    dayOfMonth: row.day_of_month ?? null,
    time: row.time ?? '',
    createdAt: row.created_at,
  };
}

/**
 * Map `ReminderDefinition` (FE) -> object cột DB — LUÔN trả FULL bộ cột theo type hiện tại (null
 * tường minh field không dùng của type kia). `created_at` CHỈ có mặt khi `type === 'recurring'` (xem
 * giải thích ở header file) — caller (`createReminder`/`updateReminder`) tự quyết định có gộp thêm
 * `id`/`space_id`/`user_id` hay không.
 */
function toRow(reminder: ReminderDefinition): Record<string, unknown> {
  if (reminder.type === 'once') {
    return {
      reminder_type: 'once',
      title: reminder.title,
      date: reminder.date,
      time: reminder.time,
      freq_n: null,
      freq_unit: null,
      day_of_month: null,
    };
  }
  return {
    reminder_type: 'recurring',
    title: reminder.title,
    date: null,
    time: reminder.time,
    freq_n: reminder.freqN,
    freq_unit: reminder.freqUnit,
    day_of_month: reminder.dayOfMonth,
    // Mốc tính chu kỳ — set tường minh, KHÔNG để DB tự `now()` (xem header file + `types.ts`).
    created_at: reminder.createdAt,
  };
}

function toInsertRow(scope: ReminderScope, spaceId: string, reminder: ReminderDefinition, userId: string | null): Record<string, unknown> {
  const row: Record<string, unknown> = { id: reminder.id, space_id: spaceId, ...toRow(reminder) };
  if (scope === 'private') row.user_id = userId;
  return row;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load toàn bộ Reminder của 1 Space cá nhân, sort theo `created_at` GIẢM DẦN (mới nhất trước) —
 * khớp hành vi cũ (`REMINDER_CREATE` unshift vào ĐẦU mảng, `RemindersBlock` hiển thị thẳng theo thứ
 * tự mảng, không tự sort) — NGƯỢC HƯỚNG với `loadPrivateLogs`/`loadPrivateHabits` (2 entity đó
 * append/push vào CUỐI mảng nên sort TĂNG DẦN). */
export async function loadPrivateReminders(spaceId: string): Promise<ReminderDefinition[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('kn_private_reminders')
    .select(REMINDER_SELECT_COLUMNS)
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[KN-Space] loadPrivateReminders lỗi:', error.message);
    throw error;
  }
  return ((data ?? []) as ReminderRow[]).map(rowToReminder);
}

/** Load toàn bộ Reminder của 1 Shared Space — RLS (`is_space_member`) tự giới hạn đúng phạm vi. */
export async function loadSharedReminders(sharedSpaceId: string): Promise<ReminderDefinition[]> {
  const { data, error } = await supabase
    .from('kn_shared_reminders')
    .select(REMINDER_SELECT_COLUMNS)
    .eq('space_id', sharedSpaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[KN-Space] loadSharedReminders lỗi:', error.message);
    throw error;
  }
  return ((data ?? []) as ReminderRow[]).map(rowToReminder);
}

/** Tạo mới 1 Reminder (INSERT) — dùng cho action `REMINDER_CREATE` qua `itemPersist.ts`. */
export async function createReminder(ref: ReminderSpaceRef, reminder: ReminderDefinition): Promise<{ ok: boolean; error?: string }> {
  try {
    const userId = ref.scope === 'private' ? await getCurrentUserId() : null;
    const row = toInsertRow(ref.scope, ref.spaceId, reminder, userId);
    const { error } = await supabase.from(tableFor(ref.scope)).insert(row);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[KN-Space] createReminder (${ref.scope}) lỗi:`, message);
    return { ok: false, error: message };
  }
}

/**
 * INSERT hàng loạt (dùng cho migration, `migrateLegacyReminders.ts`) — tối đa 2 network call (1 cho
 * mỗi type) thay vì N call riêng lẻ theo từng reminder (mục 4.3, item-level-entity-tables.md).
 *
 * TÁCH RIÊNG 2 LÔ theo `reminder.type` ('once' / 'recurring') trước khi insert — BẮT BUỘC, không
 * phải tối ưu tuỳ chọn: `toRow()` trả 2 bộ khoá object KHÁC NHAU theo type ('once' không có
 * `created_at`, 'recurring' có — xem header file). PostgREST (Supabase REST API) yêu cầu MỌI object
 * trong 1 lần `insert()` hàng loạt phải cùng bộ khoá; gộp chung 1 mảng 2 type khác khoá bị PostgREST
 * từ chối thẳng `400 Bad Request` (bug thật, xem docs/features/item-level-entity-tables-progress.md
 * — phát hiện khi chạy `migrateLegacyReminders` trên tài khoản chính 2026-07-11).
 *
 * Lô nào rỗng thì bỏ qua (không gọi `insert([])` — không cần thiết, tránh network call thừa). Lô
 * 'once' insert TRƯỚC: nếu lỗi, dừng ngay (không insert tiếp lô 'recurring'), trả lỗi để caller
 * (`migrateLegacyReminders.ts`, đã idempotent) tự retry đúng phần còn thiếu ở lần gọi kế tiếp. Nếu
 * lô 'once' đã insert thành công nhưng lô 'recurring' lỗi — vẫn trả `ok: false` (không phải thành
 * công một phần), nhưng dữ liệu 'once' đã ghi không sao: `listExistingReminderIds()` ở lần retry sau
 * sẽ thấy các id đó đã tồn tại và tự bỏ qua, chỉ gửi lại phần 'recurring' còn thiếu.
 */
export async function insertRemindersBulk(
  scope: ReminderScope,
  rows: { spaceId: string; reminder: ReminderDefinition }[],
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };
  try {
    const userId = scope === 'private' ? await getCurrentUserId() : null;
    const onceRows = rows.filter(({ reminder }) => reminder.type === 'once');
    const recurringRows = rows.filter(({ reminder }) => reminder.type === 'recurring');

    if (onceRows.length > 0) {
      const payload = onceRows.map(({ spaceId, reminder }) => toInsertRow(scope, spaceId, reminder, userId));
      const { error } = await supabase.from(tableFor(scope)).insert(payload);
      if (error) throw error;
    }

    if (recurringRows.length > 0) {
      const payload = recurringRows.map(({ spaceId, reminder }) => toInsertRow(scope, spaceId, reminder, userId));
      const { error } = await supabase.from(tableFor(scope)).insert(payload);
      if (error) throw error;
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[KN-Space] insertRemindersBulk (${scope}) lỗi:`, message);
    return { ok: false, error: message };
  }
}

/**
 * Sửa 1 Reminder (`REMINDER_UPDATE`) — ghi thẳng blind write, KHÔNG version-check. Thay NGUYÊN bộ
 * cột theo `toRow()` (không phải patch hẹp) vì REMINDER_UPDATE luôn thay cả object, kể cả đổi type.
 */
export async function updateReminder(scope: ReminderScope, reminderId: string, reminder: ReminderDefinition): Promise<void> {
  const { error } = await supabase.from(tableFor(scope)).update(toRow(reminder)).eq('id', reminderId);
  if (error) {
    console.warn(`[KN-Space] updateReminder (${scope}) lỗi:`, error.message);
    throw error;
  }
}

/** Xoá 1 Reminder (`REMINDER_DELETE`). Reminder KHÔNG có action xoá hàng loạt (khác Log). */
export async function deleteReminder(scope: ReminderScope, reminderId: string): Promise<void> {
  const { error } = await supabase.from(tableFor(scope)).delete().eq('id', reminderId);
  if (error) {
    console.warn(`[KN-Space] deleteReminder (${scope}) lỗi:`, error.message);
    throw error;
  }
}

/**
 * Xoá TOÀN BỘ Reminder của 1 Space (theo `space_id`) — dùng cho luồng Import JSON (`IMPORT_DATA`,
 * `syncImportedSpaceItems()` ở `AppStateContext.tsx`), mirror `deleteAllTasksForSpace()`. KHÔNG
 * dùng cho CRUD thường (xoá 1 reminder luôn qua `deleteReminder()`).
 */
export async function deleteAllRemindersForSpace(scope: ReminderScope, spaceId: string): Promise<void> {
  const { error } = await supabase.from(tableFor(scope)).delete().eq('space_id', spaceId);
  if (error) {
    console.warn(`[KN-Space] deleteAllRemindersForSpace (${scope}) lỗi:`, error.message);
    throw error;
  }
}

/** id của mọi Reminder hiện có trên bảng mới (theo scope) — dùng để phát hiện Reminder NÀO trong
 * `reminders[]` jsonb cũ CHƯA được migrate (xem `migrateLegacyReminders.ts`). RLS tự giới hạn đúng
 * phạm vi user/space hiện tại, không cần filter thêm (private thêm `.eq('user_id', ...)` để nhất
 * quán với `listExistingLogIds()`, phòng thủ 2 lớp). */
export async function listExistingReminderIds(scope: ReminderScope): Promise<Set<string>> {
  let query = supabase.from(tableFor(scope)).select('id');
  if (scope === 'private') {
    const userId = await getCurrentUserId();
    query = query.eq('user_id', userId);
  }
  const { data, error } = await query;
  if (error) {
    console.warn(`[KN-Space] listExistingReminderIds (${scope}) lỗi:`, error.message);
    throw error;
  }
  return new Set((data ?? []).map((r) => (r as { id: string }).id));
}
