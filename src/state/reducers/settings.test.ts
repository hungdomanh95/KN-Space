import { describe, it, expect } from 'vitest';
import { settingsReducer } from './settings';
import { defaultSettings } from '../seed';

describe('settingsReducer — SETTINGS_SET_PUSH_NOTIFY_SHARED_EVENTS', () => {
  it('bật/tắt đúng field pushNotifySharedSpaceEvents, không đụng field khác', () => {
    const initial = defaultSettings();
    const next = settingsReducer(initial, {
      type: 'SETTINGS_SET_PUSH_NOTIFY_SHARED_EVENTS',
      payload: { enabled: false },
    });
    expect(next.pushNotifySharedSpaceEvents).toBe(false);
    expect(next.theme).toBe(initial.theme);
  });
});
