import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  computeHabitPersistDescriptors,
  computeLogPersistDescriptors,
  computeNotePersistDescriptors,
  computeReminderPersistDescriptors,
  computeTaskPersistDescriptors,
  handleHabitActionForPersist,
  handleLogActionForPersist,
  handleReminderActionForPersist,
  hasPendingHabitsForSpace,
  hasPendingLogsForSpace,
  hasPendingRemindersForSpace,
  mergeHabitPendingOp,
  mergeLogPendingOp,
  mergeNotePendingOp,
  mergeReminderPendingOp,
  mergeTaskPendingOp,
  type HabitPendingOp,
  type LogPendingOp,
  type NotePendingOp,
  type ReminderPendingOp,
  type TaskPendingOp,
} from './itemPersist';
import type { Habit, LogEntry, Note, ReminderDefinition, Space, Task } from '../types';

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

// Mock reminderStore.ts — mirror logStore.ts ở trên, dùng cho `hasPendingRemindersForSpace` (Giai
// đoạn B).
vi.mock('../storage/reminderStore', () => ({
  createReminder: vi.fn(),
  updateReminder: vi.fn(),
  deleteReminder: vi.fn(),
}));
import { createReminder, deleteReminder } from '../storage/reminderStore';

// Mock taskStore.ts — mirror logStore.ts ở trên. `TASK_ITEM_PERSIST_ENABLED` đang `false` ở lượt
// này (chỉ mới chuẩn bị) nên các hàm này chưa thực sự được `handleTaskActionForPersist()` gọi, mock
// chỉ để tránh phụ thuộc `createClient()` thật khi import module (mirror các entity khác).
vi.mock('../storage/taskStore', () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

// Mock noteStore.ts — mirror taskStore.ts ở trên. `NOTE_ITEM_PERSIST_ENABLED` đang `false` ở lượt
// này (chỉ mới chuẩn bị) nên các hàm này chưa thực sự được `handleNoteActionForPersist()` gọi, mock
// chỉ để tránh phụ thuộc `createClient()` thật khi import module (mirror các entity khác).
vi.mock('../storage/noteStore', () => ({
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
}));

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

// =============================================================================
// Reminder (Bước 3, docs/features/item-level-entity-tables.md) — Giai đoạn A+B
// đã bật (2026-07-11). Gồm phần thuần logic (descriptor + merge, không gọi
// Supabase thật) + `describe('hasPendingRemindersForSpace', ...)` ở cuối file
// (mirror CHÍNH XÁC `hasPendingLogsForSpace`, network-mock qua `reminderStore.ts`).
// =============================================================================

function makeOnceReminder(overrides: Partial<Extract<ReminderDefinition, { type: 'once' }>> = {}): ReminderDefinition {
  return { id: 'reminder-1', type: 'once', title: 'Uống nước', date: '2026-07-11', time: '', ...overrides };
}

function makeRecurringReminder(
  overrides: Partial<Extract<ReminderDefinition, { type: 'recurring' }>> = {},
): ReminderDefinition {
  return {
    id: 'reminder-1',
    type: 'recurring',
    title: 'Uống thuốc',
    freqN: 1,
    freqUnit: 'day',
    dayOfMonth: null,
    time: '',
    createdAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

function reminderSpace(reminders: ReminderDefinition[] = []): Space {
  return { ...emptySpace(), reminders };
}

describe('computeReminderPersistDescriptors', () => {
  it('REMINDER_CREATE — trả đúng 1 descriptor insert khi id đã gắn và reminder xuất hiện trong nextSpace', () => {
    const reminder = makeOnceReminder();
    const nextSpace = reminderSpace([reminder]);
    const result = computeReminderPersistDescriptors(
      { type: 'REMINDER_CREATE', payload: { type: 'once', title: 'Uống nước', date: '2026-07-11', id: 'reminder-1' } },
      nextSpace,
    );
    expect(result).toEqual([{ itemId: 'reminder-1', op: { kind: 'insert', reminder } }]);
  });

  it('REMINDER_CREATE — trả mảng rỗng nếu thiếu id (phòng thủ, không nên xảy ra thực tế)', () => {
    const result = computeReminderPersistDescriptors(
      { type: 'REMINDER_CREATE', payload: { type: 'once', title: 'X', date: '2026-07-11' } },
      reminderSpace(),
    );
    expect(result).toEqual([]);
  });

  it('REMINDER_UPDATE — trả đúng 1 descriptor update với TOÀN BỘ reminder mới (không phải patch hẹp)', () => {
    const updatedReminder = makeRecurringReminder({ title: 'Uống thuốc 2 lần/ngày', freqN: 2 });
    const nextSpace = reminderSpace([updatedReminder]);
    const result = computeReminderPersistDescriptors(
      { type: 'REMINDER_UPDATE', payload: { id: 'reminder-1', type: 'recurring', title: 'Uống thuốc 2 lần/ngày', freqN: 2, freqUnit: 'day' } },
      nextSpace,
    );
    expect(result).toEqual([{ itemId: 'reminder-1', op: { kind: 'update', reminder: updatedReminder } }]);
  });

  it('REMINDER_UPDATE — trả mảng rỗng nếu reminder không còn trong nextSpace (đã bị xoá, race hiếm)', () => {
    const result = computeReminderPersistDescriptors(
      { type: 'REMINDER_UPDATE', payload: { id: 'reminder-1', type: 'once', title: 'X', date: '2026-07-11' } },
      reminderSpace([]),
    );
    expect(result).toEqual([]);
  });

  it('REMINDER_DELETE — trả đúng 1 descriptor delete', () => {
    const result = computeReminderPersistDescriptors(
      { type: 'REMINDER_DELETE', payload: { id: 'reminder-1' } },
      reminderSpace(),
    );
    expect(result).toEqual([{ itemId: 'reminder-1', op: { kind: 'delete' } }]);
  });
});

describe('mergeReminderPendingOp', () => {
  it('không có pending trước -> trả thẳng op mới', () => {
    const incoming: ReminderPendingOp = { kind: 'delete' };
    expect(mergeReminderPendingOp(undefined, incoming)).toBe(incoming);
  });

  it('insert + update (cùng cửa sổ debounce) -> vẫn là insert, nhưng đổi sang bản reminder mới nhất', () => {
    const existing: ReminderPendingOp = { kind: 'insert', reminder: makeOnceReminder() };
    const newReminder = makeOnceReminder({ title: 'Uống nước ấm' });
    const merged = mergeReminderPendingOp(existing, { kind: 'update', reminder: newReminder });
    expect(merged).toEqual({ kind: 'insert', reminder: newReminder });
  });

  it('insert + delete (cùng cửa sổ debounce) -> huỷ hẳn, trả null (không gửi gì lên server)', () => {
    const existing: ReminderPendingOp = { kind: 'insert', reminder: makeOnceReminder() };
    const merged = mergeReminderPendingOp(existing, { kind: 'delete' });
    expect(merged).toBeNull();
  });

  it('update + update -> đổi thẳng sang bản reminder mới nhất (không cần merge field)', () => {
    const existing: ReminderPendingOp = { kind: 'update', reminder: makeRecurringReminder({ freqN: 1 }) };
    const incoming: ReminderPendingOp = { kind: 'update', reminder: makeRecurringReminder({ freqN: 5 }) };
    const merged = mergeReminderPendingOp(existing, incoming);
    expect(merged).toEqual(incoming);
  });

  it('update + delete -> đè thành delete (bỏ update đang chờ)', () => {
    const existing: ReminderPendingOp = { kind: 'update', reminder: makeOnceReminder() };
    const merged = mergeReminderPendingOp(existing, { kind: 'delete' });
    expect(merged).toEqual({ kind: 'delete' });
  });

  it('delete + bất kỳ -> giữ nguyên delete (không hồi sinh item đã yêu cầu xoá)', () => {
    const existing: ReminderPendingOp = { kind: 'delete' };
    const merged = mergeReminderPendingOp(existing, { kind: 'update', reminder: makeOnceReminder() });
    expect(merged).toEqual({ kind: 'delete' });
  });
});

// Giai đoạn B (item-level-entity-tables-progress.md, Bước 3) — `hasPendingRemindersForSpace()`
// mirror CHÍNH XÁC `hasPendingLogsForSpace()` (Reminder CÓ `scope`, giống Log — khác Habit). Không
// có test tương đương LOG_DELETE_MANY vì Reminder không có action "xoá hàng loạt". Tái dùng
// `sharedSpace()`/`wait()` đã định nghĩa ở phần Log phía trên (helper chung, không riêng entity nào).
describe('hasPendingRemindersForSpace', () => {
  beforeEach(() => {
    vi.mocked(createReminder).mockReset();
    vi.mocked(deleteReminder).mockReset();
  });

  it('Space chưa từng có action Reminder nào -> luôn false', () => {
    expect(hasPendingRemindersForSpace('shared', 'space-never-touched-reminder')).toBe(false);
  });

  it('REMINDER_CREATE: true ngay khi queue (đang debounce), true suốt lúc network đang bay, false khi resolve xong', async () => {
    let resolveCreate!: (v: { ok: boolean }) => void;
    vi.mocked(createReminder).mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );

    const space = sharedSpace({ sharedSpaceId: 'space-reminder-create' });
    handleReminderActionForPersist(space, {
      type: 'REMINDER_CREATE',
      payload: { type: 'once', title: 'Test', date: '2026-07-11', id: 'reminder-create-1' },
    });

    expect(hasPendingRemindersForSpace('shared', 'space-reminder-create')).toBe(true); // còn trong 600ms debounce

    await wait(650); // hết debounce -> flushReminderItem() gọi createReminder() (đang treo, chưa resolve)
    expect(hasPendingRemindersForSpace('shared', 'space-reminder-create')).toBe(true); // network chưa resolve

    resolveCreate({ ok: true });
    await wait(0); // setTimeout(0) chạy SAU khi mọi microtask (.then/.finally) đã xử lý xong
    expect(hasPendingRemindersForSpace('shared', 'space-reminder-create')).toBe(false);
  }, 2000);

  it('REMINDER_CREATE rồi REMINDER_DELETE cùng id TRONG cửa sổ debounce -> huỷ hẳn, không còn pending, KHÔNG gọi network', async () => {
    const space = sharedSpace({ sharedSpaceId: 'space-reminder-create-delete' });
    handleReminderActionForPersist(space, {
      type: 'REMINDER_CREATE',
      payload: { type: 'once', title: 'Test', date: '2026-07-11', id: 'reminder-create-2' },
    });
    expect(hasPendingRemindersForSpace('shared', 'space-reminder-create-delete')).toBe(true);

    handleReminderActionForPersist(space, { type: 'REMINDER_DELETE', payload: { id: 'reminder-create-2' } });
    expect(hasPendingRemindersForSpace('shared', 'space-reminder-create-delete')).toBe(false); // insert+delete = huỷ

    await wait(650);
    expect(createReminder).not.toHaveBeenCalled();
  }, 2000);

  it('REMINDER_DELETE (reminder đã tồn tại từ trước): true lúc debounce, true lúc network đang bay, false sau khi resolve', async () => {
    let resolveDelete!: () => void;
    vi.mocked(deleteReminder).mockImplementation(() => new Promise((resolve) => { resolveDelete = resolve; }));

    const space = sharedSpace({ sharedSpaceId: 'space-reminder-delete' });
    handleReminderActionForPersist(space, { type: 'REMINDER_DELETE', payload: { id: 'reminder-existing-1' } });

    expect(hasPendingRemindersForSpace('shared', 'space-reminder-delete')).toBe(true);

    await wait(650);
    expect(hasPendingRemindersForSpace('shared', 'space-reminder-delete')).toBe(true); // network chưa resolve

    resolveDelete();
    await wait(0);
    expect(hasPendingRemindersForSpace('shared', 'space-reminder-delete')).toBe(false);
  }, 2000);
});

// =============================================================================
// Task (Bước 4, docs/features/item-level-entity-tables.md) — CHỈ MỚI CHUẨN BỊ
// (`TASK_ITEM_PERSIST_ENABLED = false`, xem itemPersist.ts). Gồm phần thuần logic (descriptor +
// merge, không gọi Supabase thật) — mirror đúng mức độ test đã làm cho Reminder/Habit ở giai đoạn
// TRƯỚC Giai đoạn B (chưa viết test `hasPendingTasksForSpace` ở lượt này, dù hàm/hàng đợi
// `activeTaskSpaceRefs` đã viết sẵn trong itemPersist.ts — mirror bài học áp dụng cho Habit/Reminder,
// Giai đoạn B sẽ thêm test riêng khi tới lượt, như đã làm với Log/Habit/Reminder).
// =============================================================================

function makeTask(overrides: Partial<Task> = {}): Task {
  return { id: 'task-1', title: 'Việc A', content: '', date: '', time: '', done: false, order: 0, assigneeIds: [], ...overrides };
}

function taskSpace(tasks: Task[] = []): Space {
  return { ...emptySpace(), tasks };
}

describe('computeTaskPersistDescriptors', () => {
  it('TASK_CREATE — trả đúng 1 descriptor insert khi id đã gắn và task xuất hiện trong nextSpace', () => {
    const task = makeTask();
    const nextSpace = taskSpace([task]);
    const result = computeTaskPersistDescriptors(
      { type: 'TASK_CREATE', payload: { title: 'Việc A', content: '', date: '', time: '', id: 'task-1' } },
      nextSpace,
    );
    expect(result).toEqual([{ itemId: 'task-1', op: { kind: 'insert', task } }]);
  });

  it('TASK_CREATE — trả mảng rỗng nếu thiếu id (phòng thủ, không nên xảy ra thực tế)', () => {
    const result = computeTaskPersistDescriptors(
      { type: 'TASK_CREATE', payload: { title: 'X', content: '', date: '', time: '' } },
      taskSpace(),
    );
    expect(result).toEqual([]);
  });

  it('TASK_CREATE — trả mảng rỗng nếu reducer từ chối tạo (task không có trong nextSpace)', () => {
    const result = computeTaskPersistDescriptors(
      { type: 'TASK_CREATE', payload: { title: 'X', content: '', date: '', time: '', id: 'task-ghost' } },
      taskSpace([]),
    );
    expect(result).toEqual([]);
  });

  it('TASK_UPDATE — trả đúng 1 descriptor update với 5 field (title/content/date/time/assigneeIds), lấy từ nextSpace (đã qua trim/fallback của reducer)', () => {
    const updated = makeTask({ title: 'Việc A sửa', content: 'chi tiết', date: '2026-07-11', time: '09:00', assigneeIds: ['u1'] });
    const nextSpace = taskSpace([updated]);
    const result = computeTaskPersistDescriptors(
      {
        type: 'TASK_UPDATE',
        payload: { id: 'task-1', title: 'Việc A sửa', content: 'chi tiết', date: '2026-07-11', time: '09:00', assigneeIds: ['u1'] },
      },
      nextSpace,
    );
    expect(result).toEqual([
      {
        itemId: 'task-1',
        op: { kind: 'update', patch: { title: 'Việc A sửa', content: 'chi tiết', date: '2026-07-11', time: '09:00', assigneeIds: ['u1'] } },
      },
    ]);
  });

  it('TASK_UPDATE — trả mảng rỗng nếu task không còn trong nextSpace (đã bị xoá, race hiếm)', () => {
    const result = computeTaskPersistDescriptors(
      { type: 'TASK_UPDATE', payload: { id: 'task-1', title: 'X', content: '', date: '', time: '', assigneeIds: [] } },
      taskSpace([]),
    );
    expect(result).toEqual([]);
  });

  it('TASK_TOGGLE_DONE — trả đúng 1 descriptor update CHỈ patch field done (không kèm field khác)', () => {
    const nextSpace = taskSpace([makeTask({ done: true })]);
    const result = computeTaskPersistDescriptors({ type: 'TASK_TOGGLE_DONE', payload: { id: 'task-1' } }, nextSpace);
    expect(result).toEqual([{ itemId: 'task-1', op: { kind: 'update', patch: { done: true } } }]);
  });

  it('TASK_TOGGLE_DONE — trả mảng rỗng nếu task không còn trong nextSpace (race hiếm)', () => {
    const result = computeTaskPersistDescriptors({ type: 'TASK_TOGGLE_DONE', payload: { id: 'task-1' } }, taskSpace([]));
    expect(result).toEqual([]);
  });

  it('TASK_DELETE — trả đúng 1 descriptor delete', () => {
    const result = computeTaskPersistDescriptors({ type: 'TASK_DELETE', payload: { id: 'task-1' } }, taskSpace());
    expect(result).toEqual([{ itemId: 'task-1', op: { kind: 'delete' } }]);
  });

  it('TASK_REORDER — trả đúng 1 descriptor update CHỈ patch field order, itemId = draggedId (không phải targetId)', () => {
    const nextSpace = taskSpace([makeTask({ id: 'task-1', order: 1.5 }), makeTask({ id: 'task-2', order: 2 })]);
    const result = computeTaskPersistDescriptors(
      { type: 'TASK_REORDER', payload: { draggedId: 'task-1', targetId: 'task-2' } },
      nextSpace,
    );
    expect(result).toEqual([{ itemId: 'task-1', op: { kind: 'update', patch: { order: 1.5 } } }]);
  });

  it('TASK_REORDER — trả mảng rỗng nếu draggedId không còn trong nextSpace (race hiếm)', () => {
    const result = computeTaskPersistDescriptors(
      { type: 'TASK_REORDER', payload: { draggedId: 'ghost', targetId: 'task-2' } },
      taskSpace([makeTask({ id: 'task-2' })]),
    );
    expect(result).toEqual([]);
  });
});

describe('mergeTaskPendingOp', () => {
  it('không có pending trước -> trả thẳng op mới', () => {
    const incoming: TaskPendingOp = { kind: 'delete' };
    expect(mergeTaskPendingOp(undefined, incoming)).toBe(incoming);
  });

  it('insert + update (cùng cửa sổ debounce) -> merge patch THẲNG vào task đang chờ insert, vẫn là insert', () => {
    const task = makeTask();
    const existing: TaskPendingOp = { kind: 'insert', task };
    const incoming: TaskPendingOp = { kind: 'update', patch: { done: true } };
    const merged = mergeTaskPendingOp(existing, incoming);
    expect(merged).toEqual({ kind: 'insert', task: { ...task, done: true } });
  });

  it('insert + delete (cùng cửa sổ debounce) -> huỷ hẳn, trả null (không gửi gì lên server)', () => {
    const existing: TaskPendingOp = { kind: 'insert', task: makeTask() };
    const merged = mergeTaskPendingOp(existing, { kind: 'delete' });
    expect(merged).toBeNull();
  });

  it('update + update -> gộp patch, field patch SAU đè field patch TRƯỚC (vd TOGGLE_DONE rồi REORDER liên tiếp)', () => {
    const existing: TaskPendingOp = { kind: 'update', patch: { done: true } };
    const incoming: TaskPendingOp = { kind: 'update', patch: { order: 3.5 } };
    const merged = mergeTaskPendingOp(existing, incoming);
    expect(merged).toEqual({ kind: 'update', patch: { done: true, order: 3.5 } });
  });

  it('update + delete -> đè thành delete (bỏ patch đang chờ)', () => {
    const existing: TaskPendingOp = { kind: 'update', patch: { done: true } };
    const merged = mergeTaskPendingOp(existing, { kind: 'delete' });
    expect(merged).toEqual({ kind: 'delete' });
  });

  it('delete + bất kỳ -> giữ nguyên delete (không hồi sinh item đã yêu cầu xoá)', () => {
    const existing: TaskPendingOp = { kind: 'delete' };
    const merged = mergeTaskPendingOp(existing, { kind: 'update', patch: { done: true } });
    expect(merged).toEqual({ kind: 'delete' });
  });
});

// =============================================================================
// Note (Bước 5, entity CUỐI CÙNG, docs/features/item-level-entity-tables.md) — CHỈ MỚI CHUẨN BỊ
// (`NOTE_ITEM_PERSIST_ENABLED = false`, xem itemPersist.ts). Gồm phần thuần logic (descriptor +
// merge, không gọi Supabase thật) — mirror đúng mức độ test đã làm cho Task ở giai đoạn TRƯỚC Giai
// đoạn B (chưa viết test `hasPendingNotesForSpace` ở lượt này, dù hàm/hàng đợi `activeNoteSpaceRefs`
// đã viết sẵn trong itemPersist.ts — mirror bài học áp dụng cho Habit/Reminder/Task, Giai đoạn B sẽ
// thêm test riêng khi tới lượt).
// =============================================================================

function makeNote(overrides: Partial<Note> = {}): Note {
  return { id: 'note-1', title: 'Note A', content: '', color: '#8b5cf6', updatedAt: 1000, order: 0, hidden: false, ...overrides };
}

function noteSpace(notes: Note[] = []): Space {
  return { ...emptySpace(), notes };
}

describe('computeNotePersistDescriptors', () => {
  it('NOTE_CREATE — trả đúng 1 descriptor insert khi id đã gắn và note xuất hiện trong nextSpace', () => {
    const note = makeNote();
    const nextSpace = noteSpace([note]);
    const result = computeNotePersistDescriptors(
      { type: 'NOTE_CREATE', payload: { title: 'Note A', content: '', color: '#8b5cf6', id: 'note-1' } },
      nextSpace,
    );
    expect(result).toEqual([{ itemId: 'note-1', op: { kind: 'insert', note } }]);
  });

  it('NOTE_CREATE — trả mảng rỗng nếu thiếu id (phòng thủ, không nên xảy ra thực tế)', () => {
    const result = computeNotePersistDescriptors(
      { type: 'NOTE_CREATE', payload: { title: 'X', content: '', color: '#8b5cf6' } },
      noteSpace(),
    );
    expect(result).toEqual([]);
  });

  it('NOTE_CREATE — trả mảng rỗng nếu reducer từ chối tạo (note không có trong nextSpace)', () => {
    const result = computeNotePersistDescriptors(
      { type: 'NOTE_CREATE', payload: { title: 'X', content: '', color: '#8b5cf6', id: 'note-ghost' } },
      noteSpace([]),
    );
    expect(result).toEqual([]);
  });

  it('NOTE_UPDATE — trả đúng 1 descriptor update với 4 field (title/content/color/updatedAt), lấy từ nextSpace (đã qua trim/fallback của reducer)', () => {
    const updated = makeNote({ title: 'Note A sửa', content: 'nội dung mới', color: '#0ea5e9', updatedAt: 2000 });
    const nextSpace = noteSpace([updated]);
    const result = computeNotePersistDescriptors(
      { type: 'NOTE_UPDATE', payload: { id: 'note-1', title: 'Note A sửa', content: 'nội dung mới', color: '#0ea5e9' } },
      nextSpace,
    );
    expect(result).toEqual([
      {
        itemId: 'note-1',
        op: { kind: 'update', patch: { title: 'Note A sửa', content: 'nội dung mới', color: '#0ea5e9', updatedAt: 2000 } },
      },
    ]);
  });

  it('NOTE_UPDATE — trả mảng rỗng nếu note không còn trong nextSpace (đã bị xoá, race hiếm)', () => {
    const result = computeNotePersistDescriptors(
      { type: 'NOTE_UPDATE', payload: { id: 'note-1', title: 'X', content: '', color: '#8b5cf6' } },
      noteSpace([]),
    );
    expect(result).toEqual([]);
  });

  it('NOTE_DELETE — trả đúng 1 descriptor delete', () => {
    const result = computeNotePersistDescriptors({ type: 'NOTE_DELETE', payload: { id: 'note-1' } }, noteSpace());
    expect(result).toEqual([{ itemId: 'note-1', op: { kind: 'delete' } }]);
  });

  it('NOTE_REORDER — trả đúng 1 descriptor update CHỈ patch field order (KHÔNG kèm updatedAt), itemId = draggedId (không phải targetId)', () => {
    const nextSpace = noteSpace([makeNote({ id: 'note-1', order: 1.5 }), makeNote({ id: 'note-2', order: 2 })]);
    const result = computeNotePersistDescriptors(
      { type: 'NOTE_REORDER', payload: { draggedId: 'note-1', targetId: 'note-2', insertAfter: false } },
      nextSpace,
    );
    expect(result).toEqual([{ itemId: 'note-1', op: { kind: 'update', patch: { order: 1.5 } } }]);
  });

  it('NOTE_REORDER — trả mảng rỗng nếu draggedId không còn trong nextSpace (race hiếm)', () => {
    const result = computeNotePersistDescriptors(
      { type: 'NOTE_REORDER', payload: { draggedId: 'ghost', targetId: 'note-2', insertAfter: false } },
      noteSpace([makeNote({ id: 'note-2' })]),
    );
    expect(result).toEqual([]);
  });

  it('NOTE_TOGGLE_CONTENT_HIDDEN — trả đúng 1 descriptor update CHỈ patch field hidden (KHÔNG kèm updatedAt, không kèm field khác)', () => {
    const nextSpace = noteSpace([makeNote({ hidden: true })]);
    const result = computeNotePersistDescriptors({ type: 'NOTE_TOGGLE_CONTENT_HIDDEN', payload: { id: 'note-1' } }, nextSpace);
    expect(result).toEqual([{ itemId: 'note-1', op: { kind: 'update', patch: { hidden: true } } }]);
  });

  it('NOTE_TOGGLE_CONTENT_HIDDEN — trả mảng rỗng nếu note không còn trong nextSpace (race hiếm)', () => {
    const result = computeNotePersistDescriptors({ type: 'NOTE_TOGGLE_CONTENT_HIDDEN', payload: { id: 'note-1' } }, noteSpace([]));
    expect(result).toEqual([]);
  });
});

describe('mergeNotePendingOp', () => {
  it('không có pending trước -> trả thẳng op mới', () => {
    const incoming: NotePendingOp = { kind: 'delete' };
    expect(mergeNotePendingOp(undefined, incoming)).toBe(incoming);
  });

  it('insert + update (cùng cửa sổ debounce) -> merge patch THẲNG vào note đang chờ insert, vẫn là insert', () => {
    const note = makeNote();
    const existing: NotePendingOp = { kind: 'insert', note };
    const incoming: NotePendingOp = { kind: 'update', patch: { hidden: true } };
    const merged = mergeNotePendingOp(existing, incoming);
    expect(merged).toEqual({ kind: 'insert', note: { ...note, hidden: true } });
  });

  it('insert + delete (cùng cửa sổ debounce) -> huỷ hẳn, trả null (không gửi gì lên server)', () => {
    const existing: NotePendingOp = { kind: 'insert', note: makeNote() };
    const merged = mergeNotePendingOp(existing, { kind: 'delete' });
    expect(merged).toBeNull();
  });

  it('update + update -> gộp patch, field patch SAU đè field patch TRƯỚC (vd TOGGLE_CONTENT_HIDDEN rồi REORDER liên tiếp)', () => {
    const existing: NotePendingOp = { kind: 'update', patch: { hidden: true } };
    const incoming: NotePendingOp = { kind: 'update', patch: { order: 3.5 } };
    const merged = mergeNotePendingOp(existing, incoming);
    expect(merged).toEqual({ kind: 'update', patch: { hidden: true, order: 3.5 } });
  });

  it('update + delete -> đè thành delete (bỏ patch đang chờ)', () => {
    const existing: NotePendingOp = { kind: 'update', patch: { hidden: true } };
    const merged = mergeNotePendingOp(existing, { kind: 'delete' });
    expect(merged).toEqual({ kind: 'delete' });
  });

  it('delete + bất kỳ -> giữ nguyên delete (không hồi sinh item đã yêu cầu xoá)', () => {
    const existing: NotePendingOp = { kind: 'delete' };
    const merged = mergeNotePendingOp(existing, { kind: 'update', patch: { hidden: true } });
    expect(merged).toEqual({ kind: 'delete' });
  });
});
