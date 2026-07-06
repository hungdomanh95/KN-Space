import { describe, it, expect } from 'vitest';
import {
  computeTaskCreateNotifyEffect,
  computeTaskUpdateNotifyEffect,
  computeTaskToggleDoneNotifyEffect,
} from './sharedTaskNotifyEffects';
import type { Space } from '../types';

function spaceWithTask(assigneeIds: string[], done = false): Space {
  return {
    id: 's1',
    name: 'Test',
    order: 0,
    enabledBlocks: { tasks: true, reminder: true, habits: true, notes: true, reminders: true, today: true },
    tasks: [{ id: 't1', title: 'Việc A', content: '', date: '', time: '', done, order: 0, assigneeIds }],
    reminders: [],
    habits: [],
    notes: [],
  };
}

describe('computeTaskCreateNotifyEffect', () => {
  it('trả về effect assigned nếu có assignee khác actor', () => {
    const effect = computeTaskCreateNotifyEffect({ id: 't1', title: 'A', assigneeIds: ['u2', 'u3'] }, 'u1');
    expect(effect).toEqual({ kind: 'assigned', taskId: 't1', taskTitle: 'A', recipientUserIds: ['u2', 'u3'] });
  });

  it('loại bỏ actor khỏi recipient nếu tự assign cho mình', () => {
    const effect = computeTaskCreateNotifyEffect({ id: 't1', title: 'A', assigneeIds: ['u1'] }, 'u1');
    expect(effect).toBeNull();
  });

  it('trả về null nếu không có assignee', () => {
    const effect = computeTaskCreateNotifyEffect({ id: 't1', title: 'A', assigneeIds: [] }, 'u1');
    expect(effect).toBeNull();
  });
});

describe('computeTaskUpdateNotifyEffect', () => {
  it('chỉ báo assignee MỚI được thêm, không báo lại assignee cũ', () => {
    const prevSpace = spaceWithTask(['u2']);
    const effect = computeTaskUpdateNotifyEffect(
      prevSpace,
      { type: 'TASK_UPDATE', payload: { id: 't1', title: 'Việc A', content: '', date: '', time: '', assigneeIds: ['u2', 'u3'] } },
      'u1',
    );
    expect(effect).toEqual({ kind: 'assigned', taskId: 't1', taskTitle: 'Việc A', recipientUserIds: ['u3'] });
  });

  it('trả về null nếu không thêm assignee mới nào', () => {
    const prevSpace = spaceWithTask(['u2', 'u3']);
    const effect = computeTaskUpdateNotifyEffect(
      prevSpace,
      { type: 'TASK_UPDATE', payload: { id: 't1', title: 'Việc A', content: '', date: '', time: '', assigneeIds: ['u3'] } },
      'u1',
    );
    expect(effect).toBeNull();
  });

  it('title rỗng/toàn khoảng trắng → fallback "Việc chưa đặt tên" (không gửi taskTitle rỗng)', () => {
    const prevSpace = spaceWithTask(['u2']);
    const effect = computeTaskUpdateNotifyEffect(
      prevSpace,
      { type: 'TASK_UPDATE', payload: { id: 't1', title: '   ', content: '', date: '', time: '', assigneeIds: ['u2', 'u3'] } },
      'u1',
    );
    expect(effect).toEqual({ kind: 'assigned', taskId: 't1', taskTitle: 'Việc chưa đặt tên', recipientUserIds: ['u3'] });
  });
});

describe('computeTaskToggleDoneNotifyEffect', () => {
  it('done false→true → completed-schedule', () => {
    const prevSpace = spaceWithTask([], false);
    const effect = computeTaskToggleDoneNotifyEffect(prevSpace, { type: 'TASK_TOGGLE_DONE', payload: { id: 't1' } });
    expect(effect).toEqual({ kind: 'completed-schedule', taskId: 't1', taskTitle: 'Việc A' });
  });

  it('done true→false → completed-cancel', () => {
    const prevSpace = spaceWithTask([], true);
    const effect = computeTaskToggleDoneNotifyEffect(prevSpace, { type: 'TASK_TOGGLE_DONE', payload: { id: 't1' } });
    expect(effect).toEqual({ kind: 'completed-cancel', taskId: 't1' });
  });
});
