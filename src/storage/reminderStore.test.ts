import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderDefinition } from '../types';

// Mock '../lib/supabaseClient' — reminderStore.ts gọi `supabase.from(...).insert(...)` và
// `supabase.auth.getUser()` thật, không mock sẽ khởi tạo Supabase client thật (đọc
// VITE_SUPABASE_URL/ANON_KEY từ .env.local) và có nguy cơ chạm network thật nếu lỡ quên assert.
// Test này CHỈ quan tâm `insertRemindersBulk()` gọi `insert()` đúng bao nhiêu lần, với payload nào
// — không cần hành vi DB thật.
// `vi.mock` bị hoisted lên đầu file — dùng `vi.hoisted()` để khai báo mock trước khi hoisting xảy
// ra, tránh lỗi "Cannot access '...' before initialization".
const { insertMock, fromMock, getUserMock } = vi.hoisted(() => {
  const insert = vi.fn();
  return {
    insertMock: insert,
    fromMock: vi.fn(() => ({ insert })),
    getUserMock: vi.fn(),
  };
});

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: fromMock,
    auth: { getUser: getUserMock },
  },
}));

import { insertRemindersBulk } from './reminderStore';

function makeOnceReminder(overrides: Partial<Extract<ReminderDefinition, { type: 'once' }>> = {}): ReminderDefinition {
  return { id: 'once-1', type: 'once', title: 'Uống nước', date: '2026-07-11', time: '', ...overrides };
}

function makeRecurringReminder(
  overrides: Partial<Extract<ReminderDefinition, { type: 'recurring' }>> = {},
): ReminderDefinition {
  return {
    id: 'recurring-1',
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

// Regression test cho bug thật (docs/features/item-level-entity-tables-progress.md, 2026-07-11):
// `insertRemindersBulk()` từng gộp CHUNG 1 mảng cả reminder 'once' lẫn 'recurring' vào 1 lần
// insert() — 2 loại object có bộ khoá khác nhau (`toRow()`), PostgREST từ chối thẳng 400 Bad
// Request khi 1 mảng insert có object không đồng nhất khoá. Test dưới xác nhận đã tách đúng 2 lô.
describe('insertRemindersBulk', () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockClear();
    getUserMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  });

  it('rows rỗng -> trả ok ngay, không gọi insert/from', async () => {
    const result = await insertRemindersBulk('private', []);
    expect(result).toEqual({ ok: true });
    expect(fromMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('chỉ toàn reminder "once" -> gọi insert ĐÚNG 1 LẦN, không gọi insert cho lô "recurring" rỗng', async () => {
    const rows = [
      { spaceId: 'space-1', reminder: makeOnceReminder({ id: 'once-1' }) },
      { spaceId: 'space-1', reminder: makeOnceReminder({ id: 'once-2', title: 'Đi ngủ' }) },
    ];
    const result = await insertRemindersBulk('private', rows);

    expect(result).toEqual({ ok: true });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>[];
    expect(payload).toHaveLength(2);
    payload.forEach((row) => {
      expect(row.reminder_type).toBe('once');
      expect('created_at' in row).toBe(false); // 'once' KHÔNG có khoá created_at, để DB tự now()
    });
  });

  it('chỉ toàn reminder "recurring" -> gọi insert ĐÚNG 1 LẦN, không gọi insert cho lô "once" rỗng', async () => {
    const rows = [
      { spaceId: 'space-1', reminder: makeRecurringReminder({ id: 'recurring-1' }) },
    ];
    const result = await insertRemindersBulk('private', rows);

    expect(result).toEqual({ ok: true });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>[];
    expect(payload).toHaveLength(1);
    expect(payload[0].reminder_type).toBe('recurring');
    expect(payload[0].created_at).toBe('2026-07-10T00:00:00.000Z');
  });

  it('trộn lẫn 2 loại -> tách đúng 2 lô, insert gọi 2 LẦN, lô "once" đi trước lô "recurring"', async () => {
    const onceReminder = makeOnceReminder({ id: 'once-1' });
    const recurringReminder = makeRecurringReminder({ id: 'recurring-1' });
    const rows = [
      { spaceId: 'space-1', reminder: onceReminder },
      { spaceId: 'space-1', reminder: recurringReminder },
    ];
    const result = await insertRemindersBulk('private', rows);

    expect(result).toEqual({ ok: true });
    expect(insertMock).toHaveBeenCalledTimes(2);

    const firstPayload = insertMock.mock.calls[0][0] as Record<string, unknown>[];
    const secondPayload = insertMock.mock.calls[1][0] as Record<string, unknown>[];
    expect(firstPayload).toHaveLength(1);
    expect(firstPayload[0].reminder_type).toBe('once');
    expect('created_at' in firstPayload[0]).toBe(false);
    expect(secondPayload).toHaveLength(1);
    expect(secondPayload[0].reminder_type).toBe('recurring');
    expect(secondPayload[0].created_at).toBe('2026-07-10T00:00:00.000Z');
  });

  it('lô "once" insert lỗi -> trả ok:false NGAY, KHÔNG gọi insert cho lô "recurring"', async () => {
    // Supabase trả về `PostgrestError` (extends `Error` thật — xem
    // node_modules/@supabase/postgrest-js/src/PostgrestError.ts) khi insert() lỗi, không phải
    // plain object — dùng `new Error(...)` để mock đúng hành vi thật (reminderStore.ts check
    // `err instanceof Error` khi build message).
    insertMock.mockResolvedValueOnce({ error: new Error('lỗi giả lập once') });
    const rows = [
      { spaceId: 'space-1', reminder: makeOnceReminder({ id: 'once-1' }) },
      { spaceId: 'space-1', reminder: makeRecurringReminder({ id: 'recurring-1' }) },
    ];
    const result = await insertRemindersBulk('private', rows);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('lỗi giả lập once');
    expect(insertMock).toHaveBeenCalledTimes(1); // dừng ngay, không thử tiếp lô recurring
  });

  it('lô "once" thành công nhưng lô "recurring" lỗi -> vẫn trả ok:false (không phải "ok" giả)', async () => {
    insertMock
      .mockResolvedValueOnce({ error: null }) // lô 'once' ok
      .mockResolvedValueOnce({ error: new Error('lỗi giả lập recurring') }); // lô 'recurring' lỗi
    const rows = [
      { spaceId: 'space-1', reminder: makeOnceReminder({ id: 'once-1' }) },
      { spaceId: 'space-1', reminder: makeRecurringReminder({ id: 'recurring-1' }) },
    ];
    const result = await insertRemindersBulk('private', rows);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('lỗi giả lập recurring');
    expect(insertMock).toHaveBeenCalledTimes(2); // cả 2 lô đều đã được thử
  });

  it('scope "shared" -> KHÔNG gọi supabase.auth.getUser(), payload không có user_id', async () => {
    const rows = [{ spaceId: 'shared-space-1', reminder: makeOnceReminder({ id: 'once-1' }) }];
    const result = await insertRemindersBulk('shared', rows);

    expect(result).toEqual({ ok: true });
    expect(getUserMock).not.toHaveBeenCalled();
    const payload = insertMock.mock.calls[0][0] as Record<string, unknown>[];
    expect('user_id' in payload[0]).toBe(false);
    expect(payload[0].space_id).toBe('shared-space-1');
  });
});
