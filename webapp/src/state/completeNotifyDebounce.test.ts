import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleCompletedNotify, cancelCompletedNotify } from './completeNotifyDebounce';

describe('completeNotifyDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('gọi fn sau đúng delay nếu không bị huỷ', () => {
    const fn = vi.fn();
    scheduleCompletedNotify('t1', fn, 1000);
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('KHÔNG gọi fn nếu bị cancel trước khi hết delay', () => {
    const fn = vi.fn();
    scheduleCompletedNotify('t2', fn, 1000);
    vi.advanceTimersByTime(500);
    cancelCompletedNotify('t2');
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('schedule lại (tick-untick-tick) reset lại đúng delay từ lần cuối', () => {
    const fn = vi.fn();
    scheduleCompletedNotify('t3', fn, 1000);
    vi.advanceTimersByTime(500);
    cancelCompletedNotify('t3'); // untick
    scheduleCompletedNotify('t3', fn, 1000); // tick lại
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
