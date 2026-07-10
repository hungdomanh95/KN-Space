import { describe, it, expect } from 'vitest';
import { computeLogPersistDescriptors, mergeLogPendingOp, type LogPendingOp } from './itemPersist';
import type { LogEntry, Space } from '../types';

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
