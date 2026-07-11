// =============================================================================
// habitStore.ts — item-level storage cho Thói quen (Habit), Bước 2 của kế
// hoạch tách bảng theo entity (docs/features/item-level-entity-tables.md).
// =============================================================================
// Đọc/ghi bảng MỚI `kn_private_habits` (xem
// docs/features/item-level-habit-schema.sql — đã chạy thật trên Supabase
// Dashboard, dữ liệu cũ đã migrate xong). Habit KHÔNG có bản Shared (không có
// bảng `kn_shared_habits`) — Habit block bị ẩn hoàn toàn ở Shared Space (xem
// supabase/schema.sql mục 8, `sharedSpaceStore.ts` ép `habits: []`/
// `enabledBlocks.habits: false` bất kể DB lưu gì) — quyết định đã chốt #1
// (docs/features/item-level-entity-tables-progress.md). Vì vậy, KHÔNG có khái
// niệm `scope` như `logStore.ts` — mọi hàm ở đây chỉ thao tác trên
// `kn_private_habits`.
//
// Các hàm GHI (`createHabit`/`updateHabit`/`deleteHabit`) được gọi từ
// `state/itemPersist.ts` (dual-write, cờ `HABIT_ITEM_PERSIST_ENABLED = true`
// từ 2026-07-11 — Giai đoạn A đã bật, có network call thật tới bảng này song
// song với cột `habits` jsonb cũ). Hàm ĐỌC (`loadPrivateHabits`) CHƯA được nối
// vào đâu (`AppStateContext.tsx` bootstrap/`refreshStaleSpaces()`) — đó là
// Giai đoạn B, làm ở lượt sau, mirror đúng cách đã áp dụng cho Log.
//
// Cơ chế cố ý MIRROR CHÍNH XÁC `logStore.ts`:
//   - KHÔNG version-check/retry — ghi thẳng blind write (`WHERE id = habitId`),
//     last-write-wins (docs/features/conflict-handling-simplification.md mục
//     4.3). Cột `version`/trigger vẫn giữ trên DB (miễn phí `updated_at`), tầng
//     app không đọc/dùng để chặn ghi.
//   - `id` do CLIENT tự sinh (`crypto.randomUUID()`, xem
//     `state/reducers/habits.ts`).
//   - Không có cột `order` (Habit giữ nguyên thứ tự mảng khi tạo — push vào
//     cuối, xem `types.ts`/`state/reducers/habits.ts`) — load sort theo
//     `created_at` tăng dần để giữ đúng thứ tự tạo, KHÔNG cần fractional-index
//     (khác Task/Note sắp tới).
// =============================================================================

import { supabase } from '../lib/supabaseClient';
import type { Habit } from '../types';

async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Chưa đăng nhập');
  return data.user.id;
}

interface HabitRow {
  id: string;
  title: string;
  completed_dates: string[] | null;
}

const HABIT_SELECT_COLUMNS = 'id,title,completed_dates';

/** Map 1 hàng DB -> `Habit` (frontend type). */
function rowToHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    title: row.title,
    completedDates: row.completed_dates ?? [],
  };
}

/** Map `Habit` (FE) -> object cột DB cho INSERT. */
function toInsertRow(spaceId: string, habit: Habit, userId: string): Record<string, unknown> {
  return {
    id: habit.id,
    space_id: spaceId,
    user_id: userId,
    title: habit.title,
    completed_dates: habit.completedDates,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Load toàn bộ Habit của 1 Space cá nhân, sort theo `created_at` tăng dần — giữ đúng thứ tự tạo
 * (Habit push vào cuối mảng khi tạo mới, không có field `order` riêng). */
export async function loadPrivateHabits(spaceId: string): Promise<Habit[]> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('kn_private_habits')
    .select(HABIT_SELECT_COLUMNS)
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[KN-Space] loadPrivateHabits lỗi:', error.message);
    throw error;
  }
  return ((data ?? []) as HabitRow[]).map(rowToHabit);
}

/** Tạo mới 1 Habit (INSERT) — dùng cho action `HABIT_CREATE` qua `itemPersist.ts`. */
export async function createHabit(spaceId: string, habit: Habit): Promise<{ ok: boolean; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    const row = toInsertRow(spaceId, habit, userId);
    const { error } = await supabase.from('kn_private_habits').insert(row);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[KN-Space] createHabit lỗi:', message);
    return { ok: false, error: message };
  }
}

/**
 * INSERT hàng loạt (dùng cho migration, `migrateLegacyHabits.ts`) — 1 network call cho N habit
 * thay vì N call riêng lẻ (mục 4.3, item-level-entity-tables.md).
 */
export async function insertHabitsBulk(
  rows: { spaceId: string; habit: Habit }[],
): Promise<{ ok: boolean; error?: string }> {
  if (rows.length === 0) return { ok: true };
  try {
    const userId = await getCurrentUserId();
    const payload = rows.map(({ spaceId, habit }) => toInsertRow(spaceId, habit, userId));
    const { error } = await supabase.from('kn_private_habits').insert(payload);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[KN-Space] insertHabitsBulk lỗi:', message);
    return { ok: false, error: message };
  }
}

/**
 * Sửa Habit (`HABIT_UPDATE` đổi `title`, `HABIT_TOGGLE_TODAY` đổi `completedDates`) — ghi thẳng
 * blind write, KHÔNG version-check. Cả 2 field optional, chỉ gửi field có mặt trong `patch`.
 */
export async function updateHabit(
  habitId: string,
  patch: { title?: string; completedDates?: string[] },
): Promise<void> {
  const updatePayload: Record<string, unknown> = {};
  if (patch.title !== undefined) updatePayload.title = patch.title;
  if (patch.completedDates !== undefined) updatePayload.completed_dates = patch.completedDates;
  if (Object.keys(updatePayload).length === 0) return;

  const { error } = await supabase.from('kn_private_habits').update(updatePayload).eq('id', habitId);
  if (error) {
    console.warn('[KN-Space] updateHabit lỗi:', error.message);
    throw error;
  }
}

/** Xoá 1 Habit (`HABIT_DELETE`). */
export async function deleteHabit(habitId: string): Promise<void> {
  const { error } = await supabase.from('kn_private_habits').delete().eq('id', habitId);
  if (error) {
    console.warn('[KN-Space] deleteHabit lỗi:', error.message);
    throw error;
  }
}

/** id của mọi Habit hiện có trên bảng mới (của user hiện tại) — dùng để phát hiện Habit NÀO trong
 * `habits[]` jsonb cũ CHƯA được migrate (xem `migrateLegacyHabits.ts`). */
export async function listExistingHabitIds(): Promise<Set<string>> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase.from('kn_private_habits').select('id').eq('user_id', userId);
  if (error) {
    console.warn('[KN-Space] listExistingHabitIds lỗi:', error.message);
    throw error;
  }
  return new Set((data ?? []).map((r) => (r as { id: string }).id));
}
