import { describe, it, expect } from 'vitest';
import { habitsReducer } from './habits';
import type { Space } from '../../types';

function emptySpace(): Space {
  return {
    id: 's1',
    name: 'Test',
    order: 0,
    enabledBlocks: { tasks: true, reminder: true, habits: true, notes: true, reminders: true, logs: true, expenseTracking: true },
    tasks: [],
    reminders: [],
    habits: [],
    notes: [],
    logs: [],
  };
}

describe('habitsReducer — HABIT_CREATE id', () => {
  it('tự sinh id nếu không truyền (hành vi cũ, mọi caller khác itemPersist.ts)', () => {
    const next = habitsReducer(emptySpace(), { type: 'HABIT_CREATE', payload: { title: 'Đọc sách' } });
    expect(next.habits[0].id).toEqual(expect.any(String));
    expect(next.habits[0].id.length).toBeGreaterThan(0);
  });

  it('dùng đúng id được truyền vào (không tự sinh id mới) — mirror TASK_CREATE/LOG_CREATE', () => {
    const next = habitsReducer(emptySpace(), {
      type: 'HABIT_CREATE',
      payload: { title: 'Đọc sách', id: 'fixed-id-123' },
    });
    expect(next.habits[0].id).toBe('fixed-id-123');
  });

  it('title rỗng sau trim vẫn được thay bằng tên mặc định, giữ nguyên id truyền sẵn', () => {
    const next = habitsReducer(emptySpace(), {
      type: 'HABIT_CREATE',
      payload: { title: '   ', id: 'fixed-id-123' },
    });
    expect(next.habits[0].id).toBe('fixed-id-123');
    expect(next.habits[0].title).toBe('Thói quen chưa đặt tên');
  });
});
