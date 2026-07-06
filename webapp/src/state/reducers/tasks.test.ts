import { describe, it, expect } from 'vitest';
import { tasksReducer } from './tasks';
import type { Space } from '../../types';

function emptySpace(): Space {
  return {
    id: 's1',
    name: 'Test',
    order: 0,
    enabledBlocks: { tasks: true, reminder: true, habits: true, notes: true, reminders: true, today: true },
    tasks: [],
    reminders: [],
    habits: [],
    notes: [],
  };
}

describe('tasksReducer — assigneeIds', () => {
  it('TASK_CREATE mặc định assigneeIds rỗng nếu không truyền', () => {
    const next = tasksReducer(emptySpace(), {
      type: 'TASK_CREATE',
      payload: { title: 'A', content: '', date: '', time: '' },
    });
    expect(next.tasks[0].assigneeIds).toEqual([]);
  });

  it('TASK_CREATE lưu đúng assigneeIds được truyền', () => {
    const next = tasksReducer(emptySpace(), {
      type: 'TASK_CREATE',
      payload: { title: 'A', content: '', date: '', time: '', assigneeIds: ['u1', 'u2'] },
    });
    expect(next.tasks[0].assigneeIds).toEqual(['u1', 'u2']);
  });

  it('TASK_UPDATE thay thế toàn bộ assigneeIds', () => {
    const created = tasksReducer(emptySpace(), {
      type: 'TASK_CREATE',
      payload: { title: 'A', content: '', date: '', time: '', assigneeIds: ['u1'] },
    });
    const updated = tasksReducer(created, {
      type: 'TASK_UPDATE',
      payload: { id: created.tasks[0].id, title: 'A', content: '', date: '', time: '', assigneeIds: ['u2', 'u3'] },
    });
    expect(updated.tasks[0].assigneeIds).toEqual(['u2', 'u3']);
  });

  it('TASK_CREATE dùng đúng id được truyền vào (không tự sinh id mới)', () => {
    const next = tasksReducer(emptySpace(), {
      type: 'TASK_CREATE',
      payload: { title: 'A', content: '', date: '', time: '', id: 'fixed-id-123' },
    });
    expect(next.tasks[0].id).toBe('fixed-id-123');
  });
});
