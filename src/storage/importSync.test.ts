import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Space } from '../types';

// Mock cả 5 store item-level — `importSync.ts` chỉ orchestrate, hành vi DB thật đã có test riêng ở
// từng store (`reminderStore.test.ts`...). Test này CHỈ quan tâm: có gọi đúng hàm xoá/insert của
// ĐÚNG 5 entity, đúng thứ tự (xoá TRƯỚC insert), với payload map đúng shape hay không.
const {
  deleteAllTasksForSpace,
  insertTasksBulk,
  deleteAllNotesForSpace,
  insertNotesBulk,
  deleteAllHabitsForSpace,
  insertHabitsBulk,
  deleteAllRemindersForSpace,
  insertRemindersBulk,
  deleteAllLogsForSpace,
  insertLogsBulk,
} = vi.hoisted(() => ({
  deleteAllTasksForSpace: vi.fn(),
  insertTasksBulk: vi.fn(),
  deleteAllNotesForSpace: vi.fn(),
  insertNotesBulk: vi.fn(),
  deleteAllHabitsForSpace: vi.fn(),
  insertHabitsBulk: vi.fn(),
  deleteAllRemindersForSpace: vi.fn(),
  insertRemindersBulk: vi.fn(),
  deleteAllLogsForSpace: vi.fn(),
  insertLogsBulk: vi.fn(),
}));

vi.mock('./taskStore', () => ({ deleteAllTasksForSpace, insertTasksBulk }));
vi.mock('./noteStore', () => ({ deleteAllNotesForSpace, insertNotesBulk }));
vi.mock('./habitStore', () => ({ deleteAllHabitsForSpace, insertHabitsBulk }));
vi.mock('./reminderStore', () => ({ deleteAllRemindersForSpace, insertRemindersBulk }));
vi.mock('./logStore', () => ({ deleteAllLogsForSpace, insertLogsBulk }));

import { syncImportedSpaceItems } from './importSync';

function makeImportedSpace(overrides: Partial<Space> = {}): Space {
  return {
    id: 'space-1',
    name: 'Cá nhân (import)',
    order: 0,
    enabledBlocks: {
      tasks: true,
      reminder: true,
      habits: true,
      notes: true,
      reminders: true,
      logs: true,
      expenseTracking: true,
    },
    tasks: [
      { id: 't1', title: 'Task 1', content: '', date: '', time: '', done: false, order: 0, assigneeIds: [] },
    ],
    reminders: [{ id: 'r1', type: 'once', title: 'Reminder 1', date: '2026-07-11', time: '' }],
    habits: [{ id: 'h1', title: 'Habit 1', completedDates: [] }],
    notes: [{ id: 'n1', title: 'Note 1', content: '', color: '#fff', updatedAt: 0, order: 0, hidden: false }],
    logs: [{ id: 'l1', content: 'Log 1', createdAt: '2026-07-11T00:00:00.000Z' }],
    ...overrides,
  };
}

describe('syncImportedSpaceItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteAllTasksForSpace.mockResolvedValue(undefined);
    deleteAllNotesForSpace.mockResolvedValue(undefined);
    deleteAllHabitsForSpace.mockResolvedValue(undefined);
    deleteAllRemindersForSpace.mockResolvedValue(undefined);
    deleteAllLogsForSpace.mockResolvedValue(undefined);
    insertTasksBulk.mockResolvedValue({ ok: true });
    insertNotesBulk.mockResolvedValue({ ok: true });
    insertHabitsBulk.mockResolvedValue({ ok: true });
    insertRemindersBulk.mockResolvedValue({ ok: true });
    insertLogsBulk.mockResolvedValue({ ok: true });
  });

  it('xoá ĐÚNG 5 entity theo scope "private" + spaceId, rồi bulk-insert lại đúng dữ liệu import', async () => {
    const space = makeImportedSpace();
    const result = await syncImportedSpaceItems(space);

    expect(result).toEqual({ ok: true });

    expect(deleteAllTasksForSpace).toHaveBeenCalledWith('private', 'space-1');
    expect(deleteAllNotesForSpace).toHaveBeenCalledWith('private', 'space-1');
    expect(deleteAllHabitsForSpace).toHaveBeenCalledWith('space-1');
    expect(deleteAllRemindersForSpace).toHaveBeenCalledWith('private', 'space-1');
    expect(deleteAllLogsForSpace).toHaveBeenCalledWith('private', 'space-1');

    expect(insertTasksBulk).toHaveBeenCalledWith('private', [{ spaceId: 'space-1', task: space.tasks[0] }]);
    expect(insertNotesBulk).toHaveBeenCalledWith('private', [{ spaceId: 'space-1', note: space.notes[0] }]);
    expect(insertHabitsBulk).toHaveBeenCalledWith([{ spaceId: 'space-1', habit: space.habits[0] }]);
    expect(insertRemindersBulk).toHaveBeenCalledWith('private', [{ spaceId: 'space-1', reminder: space.reminders[0] }]);
    expect(insertLogsBulk).toHaveBeenCalledWith('private', [{ spaceId: 'space-1', log: space.logs[0] }]);
  });

  it('xoá xong HẾT rồi mới bắt đầu insert (không insert xen giữa lúc còn đang xoá)', async () => {
    const callOrder: string[] = [];
    deleteAllTasksForSpace.mockImplementation(async () => {
      callOrder.push('delete:task');
    });
    insertTasksBulk.mockImplementation(async () => {
      callOrder.push('insert:task');
      return { ok: true };
    });
    deleteAllLogsForSpace.mockImplementation(async () => {
      callOrder.push('delete:log');
    });
    insertLogsBulk.mockImplementation(async () => {
      callOrder.push('insert:log');
      return { ok: true };
    });

    await syncImportedSpaceItems(makeImportedSpace());

    const firstInsertIdx = callOrder.findIndex((c) => c.startsWith('insert:'));
    const lastDeleteIdx = callOrder.map((c, i) => (c.startsWith('delete:') ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
    expect(firstInsertIdx).toBeGreaterThan(lastDeleteIdx);
  });

  it('1 entity xoá lỗi KHÔNG chặn các entity khác (vẫn insert bình thường, kết quả vẫn ok nếu insert đều thành công)', async () => {
    deleteAllHabitsForSpace.mockRejectedValueOnce(new Error('lỗi giả lập xoá habit'));

    const result = await syncImportedSpaceItems(makeImportedSpace());

    expect(result).toEqual({ ok: true });
    expect(insertTasksBulk).toHaveBeenCalled();
    expect(insertHabitsBulk).toHaveBeenCalled();
    expect(insertLogsBulk).toHaveBeenCalled();
  });

  it('1 entity insert lỗi -> trả ok:false (dù 4 entity còn lại vẫn được insert đầy đủ)', async () => {
    insertNotesBulk.mockResolvedValueOnce({ ok: false, error: 'lỗi giả lập insert note' });

    const result = await syncImportedSpaceItems(makeImportedSpace());

    expect(result).toEqual({ ok: false });
    expect(insertTasksBulk).toHaveBeenCalled();
    expect(insertHabitsBulk).toHaveBeenCalled();
    expect(insertRemindersBulk).toHaveBeenCalled();
    expect(insertLogsBulk).toHaveBeenCalled();
  });

  it('Space rỗng (không có entity nào) -> vẫn gọi xoá đủ 5 entity, insert với mảng rỗng', async () => {
    const emptySpace = makeImportedSpace({ tasks: [], notes: [], habits: [], reminders: [], logs: [] });

    const result = await syncImportedSpaceItems(emptySpace);

    expect(result).toEqual({ ok: true });
    expect(insertTasksBulk).toHaveBeenCalledWith('private', []);
    expect(insertNotesBulk).toHaveBeenCalledWith('private', []);
    expect(insertHabitsBulk).toHaveBeenCalledWith([]);
    expect(insertRemindersBulk).toHaveBeenCalledWith('private', []);
    expect(insertLogsBulk).toHaveBeenCalledWith('private', []);
  });
});
