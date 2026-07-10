import { describe, it, expect } from 'vitest';
import { logsReducer } from './logs';
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

describe('logsReducer — LOG_CREATE id', () => {
  it('tự sinh id nếu không truyền (hành vi cũ, mọi caller khác itemPersist.ts)', () => {
    const next = logsReducer(emptySpace(), { type: 'LOG_CREATE', payload: { content: 'A' } });
    expect(next.logs[0].id).toEqual(expect.any(String));
    expect(next.logs[0].id.length).toBeGreaterThan(0);
  });

  it('dùng đúng id được truyền vào (không tự sinh id mới) — mirror TASK_CREATE', () => {
    const next = logsReducer(emptySpace(), {
      type: 'LOG_CREATE',
      payload: { content: 'A', id: 'fixed-id-123' },
    });
    expect(next.logs[0].id).toBe('fixed-id-123');
  });

  it('content rỗng sau trim vẫn bị từ chối dù có id truyền sẵn', () => {
    const next = logsReducer(emptySpace(), {
      type: 'LOG_CREATE',
      payload: { content: '   ', id: 'fixed-id-123' },
    });
    expect(next.logs).toHaveLength(0);
  });
});
