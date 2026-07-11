import { describe, it, expect } from 'vitest';
import { remindersReducer } from './reminders';
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

describe('remindersReducer — REMINDER_CREATE id', () => {
  it('tự sinh id nếu không truyền (hành vi cũ, mọi caller khác itemPersist.ts)', () => {
    const next = remindersReducer(emptySpace(), {
      type: 'REMINDER_CREATE',
      payload: { type: 'once', title: 'Uống nước', date: '2026-07-11' },
    });
    expect(next.reminders[0].id).toEqual(expect.any(String));
    expect(next.reminders[0].id.length).toBeGreaterThan(0);
  });

  it('dùng đúng id được truyền vào (không tự sinh id mới) — mirror TASK_CREATE/LOG_CREATE/HABIT_CREATE', () => {
    const next = remindersReducer(emptySpace(), {
      type: 'REMINDER_CREATE',
      payload: { type: 'once', title: 'Uống nước', date: '2026-07-11', id: 'fixed-id-123' },
    });
    expect(next.reminders[0].id).toBe('fixed-id-123');
  });

  it('title rỗng sau trim vẫn được thay bằng tên mặc định, giữ nguyên id truyền sẵn', () => {
    const next = remindersReducer(emptySpace(), {
      type: 'REMINDER_CREATE',
      payload: { type: 'once', title: '   ', date: '2026-07-11', id: 'fixed-id-123' },
    });
    expect(next.reminders[0].id).toBe('fixed-id-123');
    expect(next.reminders[0].title).toBe('Việc chưa đặt tên');
  });

  it('unshift vào ĐẦU mảng (không phải cuối) — reminder mới nhất luôn ở index 0', () => {
    const first = remindersReducer(emptySpace(), {
      type: 'REMINDER_CREATE',
      payload: { type: 'once', title: 'A', date: '2026-07-11', id: 'id-a' },
    });
    const second = remindersReducer(first, {
      type: 'REMINDER_CREATE',
      payload: { type: 'once', title: 'B', date: '2026-07-11', id: 'id-b' },
    });
    expect(second.reminders.map((r) => r.id)).toEqual(['id-b', 'id-a']);
  });
});

describe('remindersReducer — REMINDER_UPDATE giữ đúng mốc createdAt (chu kỳ lặp lại)', () => {
  it('recurring -> recurring: giữ NGUYÊN createdAt cũ (mốc chu kỳ không đổi)', () => {
    const created = remindersReducer(emptySpace(), {
      type: 'REMINDER_CREATE',
      payload: { type: 'recurring', title: 'Uống thuốc', freqN: 2, freqUnit: 'day' },
    });
    const originalCreatedAt =
      created.reminders[0].type === 'recurring' ? created.reminders[0].createdAt : '';
    expect(originalCreatedAt).toBeTruthy();

    const updated = remindersReducer(created, {
      type: 'REMINDER_UPDATE',
      payload: { id: created.reminders[0].id, type: 'recurring', title: 'Uống thuốc 2 lần', freqN: 3, freqUnit: 'day' },
    });
    const reminder = updated.reminders[0];
    expect(reminder.type).toBe('recurring');
    if (reminder.type === 'recurring') {
      expect(reminder.createdAt).toBe(originalCreatedAt);
      expect(reminder.freqN).toBe(3);
    }
  });

  it('once -> recurring: LÀM MỚI createdAt (mốc chu kỳ mới, không dùng lại thời điểm tạo lúc còn "once")', () => {
    const created = remindersReducer(emptySpace(), {
      type: 'REMINDER_CREATE',
      payload: { type: 'once', title: 'Việc 1 lần', date: '2020-01-01' },
    });

    const updated = remindersReducer(created, {
      type: 'REMINDER_UPDATE',
      payload: { id: created.reminders[0].id, type: 'recurring', title: 'Đổi thành lặp lại', freqN: 1, freqUnit: 'day' },
    });
    const reminder = updated.reminders[0];
    expect(reminder.type).toBe('recurring');
    if (reminder.type === 'recurring') {
      // Không phải chuỗi cố định ngày xưa — phải là mốc "vừa tạo" (parse được thành Date hợp lệ, gần hiện tại).
      expect(reminder.createdAt).not.toBe('2020-01-01');
      expect(Number.isNaN(new Date(reminder.createdAt).getTime())).toBe(false);
    }
  });
});
