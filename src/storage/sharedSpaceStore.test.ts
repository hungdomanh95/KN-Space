import { describe, expect, it } from 'vitest';
import { normalizeSharedEnabledBlocks } from './sharedSpaceStore';

// Regression test cho bug: enabledBlocks của Shared Space bị hard-code cứng ở rowToSpace()
// (xem docs/features/fix-shared-space-enabled-blocks.sql). normalizeSharedEnabledBlocks() là
// hàm chuẩn hoá dữ liệu đọc từ cột `enabled_blocks` (kn_shared_spaces) — export riêng để test
// độc lập, không cần mock Supabase client (rowToSpace/loadSharedSpaces gọi network thật).
describe('normalizeSharedEnabledBlocks', () => {
  it('đọc đúng giá trị hợp lệ từ DB, giữ nguyên tuỳ chỉnh của user', () => {
    const result = normalizeSharedEnabledBlocks({
      tasks: false,
      reminder: false,
      habits: false,
      notes: true,
      reminders: true,
      logs: false,
      expenseTracking: false,
    });
    expect(result).toEqual({
      tasks: false,
      reminder: false,
      habits: false,
      notes: true,
      reminders: true,
      logs: false,
      expenseTracking: false,
    });
  });

  it('LUÔN ép habits: false dù DB lỡ lưu habits: true (invariant Shared Space)', () => {
    const result = normalizeSharedEnabledBlocks({
      tasks: true,
      reminder: true,
      habits: true, // dữ liệu bẩn/không nên xảy ra — vẫn phải bị ép về false
      notes: true,
      reminders: true,
      logs: true,
    });
    expect(result.habits).toBe(false);
  });

  it('fallback hợp lý khi thiếu hẳn cột (Space tạo trước khi có migration mới)', () => {
    const result = normalizeSharedEnabledBlocks(undefined);
    expect(result).toEqual({
      tasks: true,
      reminder: true,
      habits: false,
      notes: true,
      reminders: true,
      logs: true,
      expenseTracking: true,
    });
  });

  it('fallback từng field riêng lẻ khi JSON thiếu 1 phần (không phải toàn bộ null)', () => {
    const result = normalizeSharedEnabledBlocks({ tasks: false });
    expect(result).toEqual({
      tasks: false,
      reminder: true,
      habits: false,
      notes: true,
      reminders: true,
      logs: true,
      expenseTracking: true,
    });
  });

  it('bỏ qua giá trị sai kiểu (không phải boolean), rơi về fallback', () => {
    const result = normalizeSharedEnabledBlocks({ tasks: 'yes', notes: null });
    expect(result.tasks).toBe(true);
    expect(result.notes).toBe(true);
  });
});
