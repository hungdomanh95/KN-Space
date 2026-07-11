import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  computeHabitPersistDescriptors,
  computeLogPersistDescriptors,
  handleHabitActionForPersist,
  handleLogActionForPersist,
  hasPendingHabitsForSpace,
  hasPendingLogsForSpace,
  mergeHabitPendingOp,
  mergeLogPendingOp,
  type HabitPendingOp,
  type LogPendingOp,
} from './itemPersist';
import type { Habit, LogEntry, Space } from '../types';

// Mock logStore.ts (thay vì để `hasPendingLogsForSpace` test dưới đây gọi network Supabase THẬT) —
// chỉ cần biết CÓ gọi hàm ghi nào không và điều khiển được thời điểm resolve, không cần hành vi
// DB thật. `../storage/supabaseStore` KHÔNG cần mock — `setPrivateFallbackActive`/
// `setSharedFallbackActive` chỉ đổi biến module-level cục bộ, không có side-effect network.
vi.mock('../storage/logStore', () => ({
  createLog: vi.fn(),
  updateLogExpense: vi.fn(),
  deleteLog: vi.fn(),
  deleteLogs: vi.fn(),
}));
import { createLog, deleteLogs } from '../storage/logStore';

// Mock habitStore.ts — mirror logStore.ts ở trên, dùng cho `hasPendingHabitsForSpace` (Giai đoạn B).
vi.mock('../storage/habitStore', () => ({
  createHabit: vi.fn(),
  updateHabit: vi.fn(),
  deleteHabit: vi.fn(),
}));
import { createHabit, deleteHabit } from '../storage/habitStore';

function emptySpace(logs: LogEntry[] = []): Space {
  return {
    id: 's1',
    name: 'Test',
    order: 0,
    enabledBlocks: { tasks: true, reminder: true, habits: true, notes: true, reminders: true, logs: true, expenseTracking: true },
    tasks: [],
    reminders: [],
    habits: [],
    notes: [],
    logs,
  };
}

function makeLog(overrides: Partial<LogEntry> = {}): LogEntry {
  return { id: 'log-1', content: 'Nội dung', createdAt: '2026-07-10T00:00:00.000Z', ...overrides };
}

describe('computeLogPersistDescriptors', () => {
  it('LOG_CREATE — trả đúng 1 descriptor insert khi id đã gắn và log xuất hiện trong nextSpace', () => {
    const log = makeLog();
    const nextSpace = emptySpace([log]);
    const result = computeLogPersistDescriptors(
      { type: 'LOG_CREATE', payload: { content: 'Nội dung', id: 'log-1' } },
      nextSpace,
    );
    expect(result).toEqual([{ itemId: 'log-1', op: { kind: 'insert', log } }]);
  });

  it('LOG_CREATE — trả mảng rỗng nếu thiếu id (phòng thủ, không nên xảy ra thực tế)', () => {
    const result = computeLogPersistDescriptors({ type: 'LOG_CREATE', payload: { content: 'X' } }, emptySpace());
    expect(result).toEqual([]);
  });

  it('LOG_CREATE — trả mảng rỗng nếu reducer từ chối tạo (log không có trong nextSpace)', () => {
    // Giả lập reducer từ chối (content rỗng sau trim) -> nextSpace.logs không chứa id này.
    const result = computeLogPersistDescriptors(
      { type: 'LOG_CREATE', payload: { content: '   ', id: 'log-1' } },
      emptySpace([]),
    );
    expect(result).toEqual([]);
  });

  it('LOG_DELETE — trả đúng 1 descriptor delete', () => {
    const result = computeLogPersistDescriptors({ type: 'LOG_DELETE', payload: { id: 'log-1' } }, emptySpace());
    expect(result).toEqual([{ itemId: 'log-1', op: { kind: 'delete' } }]);
  });

  it('LOG_DELETE_MANY — trả 1 descriptor delete cho MỖI id (không gộp)', () => {
    const result = computeLogPersistDescriptors(
      { type: 'LOG_DELETE_MANY', payload: { ids: ['a', 'b', 'c'] } },
      emptySpace(),
    );
    expect(result).toEqual([
      { itemId: 'a', op: { kind: 'delete' } },
      { itemId: 'b', op: { kind: 'delete' } },
      { itemId: 'c', op: { kind: 'delete' } },
    ]);
  });

  it('LOG_PATCH_EXPENSE — trả đúng 1 descriptor update với đúng patch', () => {
    const result = computeLogPersistDescriptors(
      { type: 'LOG_PATCH_EXPENSE', payload: { id: 'log-1', excluded: true } },
      emptySpace(),
    );
    expect(result).toEqual([{ itemId: 'log-1', op: { kind: 'update', patch: { excluded: true } } }]);
  });
});

describe('mergeLogPendingOp', () => {
  it('không có pending trước -> trả thẳng op mới', () => {
    const incoming: LogPendingOp = { kind: 'delete' };
    expect(mergeLogPendingOp(undefined, incoming)).toBe(incoming);
  });

  it('insert + update (cùng cửa sổ debounce) -> merge patch THẲNG vào log đang chờ insert, vẫn là insert', () => {
    const log = makeLog();
    const existing: LogPendingOp = { kind: 'insert', log };
    const incoming: LogPendingOp = { kind: 'update', patch: { excluded: true } };
    const merged = mergeLogPendingOp(existing, incoming);
    expect(merged).toEqual({ kind: 'insert', log: { ...log, excluded: true } });
  });

  it('insert + delete (cùng cửa sổ debounce) -> huỷ hẳn, trả null (không gửi gì lên server)', () => {
    const existing: LogPendingOp = { kind: 'insert', log: makeLog() };
    const merged = mergeLogPendingOp(existing, { kind: 'delete' });
    expect(merged).toBeNull();
  });

  it('update + update -> gộp patch, field patch SAU đè field patch TRƯỚC', () => {
    const existing: LogPendingOp = { kind: 'update', patch: { excluded: true, expenseDate: '2026-07-01' } };
    const incoming: LogPendingOp = { kind: 'update', patch: { expenseDate: '2026-07-10' } };
    const merged = mergeLogPendingOp(existing, incoming);
    expect(merged).toEqual({ kind: 'update', patch: { excluded: true, expenseDate: '2026-07-10' } });
  });

  it('update + delete -> đè thành delete (bỏ patch đang chờ)', () => {
    const existing: LogPendingOp = { kind: 'update', patch: { excluded: true } };
    const merged = mergeLogPendingOp(existing, { kind: 'delete' });
    expect(merged).toEqual({ kind: 'delete' });
  });

  it('delete + bất kỳ -> giữ nguyên delete (không hồi sinh item đã yêu cầu xoá)', () => {
    const existing: LogPendingOp = { kind: 'delete' };
    const merged = mergeLogPendingOp(existing, { kind: 'update', patch: { excluded: true } });
    expect(merged).toEqual({ kind: 'delete' });
  });

  it('categoryOverride: null trong patch xoá đúng field khỏi log khi merge vào insert', () => {
    const log = makeLog({ categoryOverride: 'Ăn uống' });
    const existing: LogPendingOp = { kind: 'insert', log };
    const merged = mergeLogPendingOp(existing, { kind: 'update', patch: { categoryOverride: null } });
    expect(merged).toEqual({ kind: 'insert', log: makeLog() });
  });
});

// =============================================================================
// Habit (Bước 2, docs/features/item-level-entity-tables.md) — mirror CHÍNH XÁC
// mức độ test đã làm cho Log ở trên (descriptor + merge, phần thuần logic
// không phụ thuộc mạng, cộng thêm `hasPendingHabitsForSpace` ở cuối file —
// Giai đoạn B đã bật, mirror `hasPendingLogsForSpace`).
// =============================================================================

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return { id: 'habit-1', title: 'Đọc sách', completedDates: [], ...overrides };
}

function habitSpace(habits: Habit[] = []): Space {
  return { ...emptySpace(), habits };
}

describe('computeHabitPersistDescriptors', () => {
  it('HABIT_CREATE — trả đúng 1 descriptor insert khi id đã gắn và habit xuất hiện trong nextSpace', () => {
    const habit = makeHabit();
    const nextSpace = habitSpace([habit]);
    const result = computeHabitPersistDescriptors(
      { type: 'HABIT_CREATE', payload: { title: 'Đọc sách', id: 'habit-1' } },
      nextSpace,
    );
    expect(result).toEqual([{ itemId: 'habit-1', op: { kind: 'insert', habit } }]);
  });

  it('HABIT_CREATE — trả mảng rỗng nếu thiếu id (phòng thủ, không nên xảy ra thực tế)', () => {
    const result = computeHabitPersistDescriptors({ type: 'HABIT_CREATE', payload: { title: 'X' } }, habitSpace());
    expect(result).toEqual([]);
  });

  it('HABIT_UPDATE — trả đúng 1 descriptor update với title mới (đã qua trim/fallback của reducer)', () => {
    const nextSpace = habitSpace([makeHabit({ title: 'Đọc sách mỗi ngày' })]);
    const result = computeHabitPersistDescriptors(
      { type: 'HABIT_UPDATE', payload: { id: 'habit-1', title: 'Đọc sách mỗi ngày' } },
      nextSpace,
    );
    expect(result).toEqual([{ itemId: 'habit-1', op: { kind: 'update', patch: { title: 'Đọc sách mỗi ngày' } } }]);
  });

  it('HABIT_UPDATE — trả mảng rỗng nếu habit không còn trong nextSpace (đã bị xoá, race hiếm)', () => {
    const result = computeHabitPersistDescriptors(
      { type: 'HABIT_UPDATE', payload: { id: 'habit-1', title: 'X' } },
      habitSpace([]),
    );
    expect(result).toEqual([]);
  });

  it('HABIT_DELETE — trả đúng 1 descriptor delete', () => {
    const result = computeHabitPersistDescriptors({ type: 'HABIT_DELETE', payload: { id: 'habit-1' } }, habitSpace());
    expect(result).toEqual([{ itemId: 'habit-1', op: { kind: 'delete' } }]);
  });

  it('HABIT_TOGGLE_TODAY — trả đúng 1 descriptor update với completedDates mới nhất', () => {
    const nextSpace = habitSpace([makeHabit({ completedDates: ['2026-07-11'] })]);
    const result = computeHabitPersistDescriptors(
      { type: 'HABIT_TOGGLE_TODAY', payload: { id: 'habit-1' } },
      nextSpace,
    );
    expect(result).toEqual([
      { itemId: 'habit-1', op: { kind: 'update', patch: { completedDates: ['2026-07-11'] } } },
    ]);
  });
});

describe('mergeHabitPendingOp', () => {
  it('không có pending trước -> trả thẳng op mới', () => {
    const incoming: HabitPendingOp = { kind: 'delete' };
    expect(mergeHabitPendingOp(undefined, incoming)).toBe(incoming);
  });

  it('insert + update (cùng cửa sổ debounce) -> merge patch THẲNG vào habit đang chờ insert, vẫn là insert', () => {
    const habit = makeHabit();
    const existing: HabitPendingOp = { kind: 'insert', habit };
    const incoming: HabitPendingOp = { kind: 'update', patch: { completedDates: ['2026-07-11'] } };
    const merged = mergeHabitPendingOp(existing, incoming);
    expect(merged).toEqual({ kind: 'insert', habit: { ...habit, completedDates: ['2026-07-11'] } });
  });

  it('insert + delete (cùng cửa sổ debounce) -> huỷ hẳn, trả null (không gửi gì lên server)', () => {
    const existing: HabitPendingOp = { kind: 'insert', habit: makeHabit() };
    const merged = mergeHabitPendingOp(existing, { kind: 'delete' });
    expect(merged).toBeNull();
  });

  it('update + update -> gộp patch, field patch SAU đè field patch TRƯỚC', () => {
    const existing: HabitPendingOp = { kind: 'update', patch: { title: 'A', completedDates: ['2026-07-10'] } };
    const incoming: HabitPendingOp = { kind: 'update', patch: { completedDates: ['2026-07-11'] } };
    const merged = mergeHabitPendingOp(existing, incoming);
    expect(merged).toEqual({ kind: 'update', patch: { title: 'A', completedDates: ['2026-07-11'] } });
  });

  it('update + delete -> đè thành delete (bỏ patch đang chờ)', () => {
    const existing: HabitPendingOp = { kind: 'update', patch: { title: 'A' } };
    const merged = mergeHabitPendingOp(existing, { kind: 'delete' });
    expect(merged).toEqual({ kind: 'delete' });
  });

  it('delete + bất kỳ -> giữ nguyên delete (không hồi sinh item đã yêu cầu xoá)', () => {
    const existing: HabitPendingOp = { kind: 'delete' };
    const merged = mergeHabitPendingOp(existing, { kind: 'update', patch: { title: 'A' } });
    expect(merged).toEqual({ kind: 'delete' });
  });
});

// Giai đoạn B (item-level-entity-tables-progress.md, câu hỏi mở #2) — `hasPendingLogsForSpace()`
// là điểm nối quan trọng nhất cho `refreshStaleSpaces()` (AppStateContext.tsx): phải trả `true`
// xuyên suốt từ lúc action được queue (còn debounce) tới khi network call THẬT SỰ resolve xong
// (không chỉ tới khi rời khỏi cửa sổ debounce) — nếu không, `refreshStaleSpaces()` có thể đè mất
// log đang bay lên server.
function sharedSpace(overrides: Partial<Space> = {}): Space {
  return {
    ...emptySpace(),
    id: 'shared-local-id',
    isShared: true,
    ...overrides,
  };
}

// Đợi qua hết 1 vòng debounce 600ms bằng TIMER THẬT (không dùng fake timers) — đơn giản/đáng tin
// cậy hơn cho module này vì `flushLogItem` là 1 chuỗi async thật (setTimeout -> await network mock
// -> .then/.finally), fake timers của vitest chỉ đảm bảo flush microtask "tại mỗi tick timer", dễ
// sai khác thời điểm thật với debounce 600ms hard-code trong `itemPersist.ts`.
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('hasPendingLogsForSpace', () => {
  beforeEach(() => {
    vi.mocked(createLog).mockReset();
    vi.mocked(deleteLogs).mockReset();
  });

  it('Space chưa từng có action Log nào -> luôn false', () => {
    expect(hasPendingLogsForSpace('shared', 'space-never-touched')).toBe(false);
  });

  it('LOG_CREATE: true ngay khi queue (đang debounce), true suốt lúc network đang bay, false khi resolve xong', async () => {
    let resolveCreate!: (v: { ok: boolean }) => void;
    vi.mocked(createLog).mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );

    const space = sharedSpace({ sharedSpaceId: 'space-log-create' });
    handleLogActionForPersist(space, { type: 'LOG_CREATE', payload: { content: 'Test', id: 'log-create-1' } });

    expect(hasPendingLogsForSpace('shared', 'space-log-create')).toBe(true); // còn trong 600ms debounce

    await wait(650); // hết debounce -> flushLogItem() gọi createLog() (đang treo, chưa resolve)
    expect(hasPendingLogsForSpace('shared', 'space-log-create')).toBe(true); // network chưa resolve

    resolveCreate({ ok: true });
    await wait(0); // setTimeout(0) chạy SAU khi mọi microtask (.then/.finally) đã xử lý xong
    expect(hasPendingLogsForSpace('shared', 'space-log-create')).toBe(false);
  }, 2000);

  it('LOG_CREATE rồi LOG_DELETE cùng id TRONG cửa sổ debounce -> huỷ hẳn, không còn pending, KHÔNG gọi network', async () => {
    const space = sharedSpace({ sharedSpaceId: 'space-log-create-delete' });
    handleLogActionForPersist(space, { type: 'LOG_CREATE', payload: { content: 'Test', id: 'log-create-2' } });
    expect(hasPendingLogsForSpace('shared', 'space-log-create-delete')).toBe(true);

    handleLogActionForPersist(space, { type: 'LOG_DELETE', payload: { id: 'log-create-2' } });
    expect(hasPendingLogsForSpace('shared', 'space-log-create-delete')).toBe(false); // insert+delete = huỷ

    await wait(650);
    expect(createLog).not.toHaveBeenCalled();
  }, 2000);

  it('LOG_DELETE_MANY: true ngay lập tức (không qua debounce), false khi deleteLogs resolve xong', async () => {
    let resolveDelete!: () => void;
    vi.mocked(deleteLogs).mockImplementation(() => new Promise((resolve) => { resolveDelete = resolve; }));

    const space = sharedSpace({ sharedSpaceId: 'space-log-delete-many' });
    handleLogActionForPersist(space, { type: 'LOG_DELETE_MANY', payload: { ids: ['log-a', 'log-b'] } });

    expect(hasPendingLogsForSpace('shared', 'space-log-delete-many')).toBe(true);

    resolveDelete();
    await wait(0);
    expect(hasPendingLogsForSpace('shared', 'space-log-delete-many')).toBe(false);
  }, 2000);
});

// Giai đoạn B (Habit, item-level-entity-tables-progress.md, Bước 2) — `hasPendingHabitsForSpace()`
// mirror CHÍNH XÁC `hasPendingLogsForSpace()` ở trên (cùng lý do: phải trả `true` xuyên suốt từ lúc
// action được queue tới khi network call THẬT SỰ resolve xong). Habit chỉ tồn tại ở Space cá nhân
// (`_privateVersion` phải có giá trị — mirror guard "Space chưa từng lưu lên DB" trong
// `handleHabitActionForPersist()`), không có tham số `scope`, không có action "xoá hàng loạt".
function privateHabitSpace(overrides: Partial<Space> = {}): Space {
  return {
    ...emptySpace(),
    id: 'private-local-id',
    _privateVersion: 1,
    ...overrides,
  };
}

describe('hasPendingHabitsForSpace', () => {
  beforeEach(() => {
    vi.mocked(createHabit).mockReset();
    vi.mocked(deleteHabit).mockReset();
  });

  it('Space chưa từng có action Habit nào -> luôn false', () => {
    expect(hasPendingHabitsForSpace('space-never-touched-habit')).toBe(false);
  });

  it('HABIT_CREATE: true ngay khi queue (đang debounce), true suốt lúc network đang bay, false khi resolve xong', async () => {
    let resolveCreate!: (v: { ok: boolean }) => void;
    vi.mocked(createHabit).mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );

    const space = privateHabitSpace({ id: 'space-habit-create' });
    handleHabitActionForPersist(space, { type: 'HABIT_CREATE', payload: { title: 'Test', id: 'habit-create-1' } });

    expect(hasPendingHabitsForSpace('space-habit-create')).toBe(true); // còn trong 600ms debounce

    await wait(650); // hết debounce -> flushHabitItem() gọi createHabit() (đang treo, chưa resolve)
    expect(hasPendingHabitsForSpace('space-habit-create')).toBe(true); // network chưa resolve

    resolveCreate({ ok: true });
    await wait(0); // setTimeout(0) chạy SAU khi mọi microtask (.then/.finally) đã xử lý xong
    expect(hasPendingHabitsForSpace('space-habit-create')).toBe(false);
  }, 2000);

  it('HABIT_CREATE rồi HABIT_DELETE cùng id TRONG cửa sổ debounce -> huỷ hẳn, không còn pending, KHÔNG gọi network', async () => {
    const space = privateHabitSpace({ id: 'space-habit-create-delete' });
    handleHabitActionForPersist(space, { type: 'HABIT_CREATE', payload: { title: 'Test', id: 'habit-create-2' } });
    expect(hasPendingHabitsForSpace('space-habit-create-delete')).toBe(true);

    handleHabitActionForPersist(space, { type: 'HABIT_DELETE', payload: { id: 'habit-create-2' } });
    expect(hasPendingHabitsForSpace('space-habit-create-delete')).toBe(false); // insert+delete = huỷ

    await wait(650);
    expect(createHabit).not.toHaveBeenCalled();
  }, 2000);

  it('HABIT_DELETE (habit đã tồn tại từ trước): true lúc debounce, true lúc network đang bay, false sau khi resolve', async () => {
    let resolveDelete!: () => void;
    vi.mocked(deleteHabit).mockImplementation(() => new Promise((resolve) => { resolveDelete = resolve; }));

    const space = privateHabitSpace({ id: 'space-habit-delete' });
    handleHabitActionForPersist(space, { type: 'HABIT_DELETE', payload: { id: 'habit-existing-1' } });

    expect(hasPendingHabitsForSpace('space-habit-delete')).toBe(true);

    await wait(650);
    expect(hasPendingHabitsForSpace('space-habit-delete')).toBe(true); // network chưa resolve

    resolveDelete();
    await wait(0);
    expect(hasPendingHabitsForSpace('space-habit-delete')).toBe(false);
  }, 2000);
});
