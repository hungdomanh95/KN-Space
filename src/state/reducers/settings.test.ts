import { describe, it, expect } from 'vitest';
import { settingsReducer } from './settings';
import { defaultSettings, defaultDashboardLayout } from '../seed';
import type { LayoutSlot } from '../../types';

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

// ─── SETTINGS_SET_COL_WIDTHS / SETTINGS_SET_DASHBOARD_COLS / SETTINGS_RESET_DASHBOARD_COLS ──
// MỚI (2026-07-08, xem docs/features/layout-theo-space.md mục 11) — tách colWidths (dùng chung
// mọi Space, không kèm spaceId) khỏi cols (riêng theo từng Space, kèm spaceId).

describe('settingsReducer — SETTINGS_SET_COL_WIDTHS', () => {
  it('ghi thẳng dashboardColWidths, không kèm spaceId, không đụng dashboardCols', () => {
    const initial = defaultSettings();
    const next = settingsReducer(initial, {
      type: 'SETTINGS_SET_COL_WIDTHS',
      payload: { colWidths: [20, 50, 30] },
    });
    expect(next.dashboardColWidths).toEqual([20, 50, 30]);
    expect(next.dashboardCols).toBe(initial.dashboardCols);
  });
});

describe('settingsReducer — SETTINGS_SET_DASHBOARD_COLS', () => {
  it('chỉ ghi đúng 1 entry theo spaceId, không đụng entry Space khác (AC-11.2/11.3)', () => {
    const cols: LayoutSlot[][] = defaultDashboardLayout().cols;
    const withSpaceA = settingsReducer(defaultSettings(), {
      type: 'SETTINGS_SET_DASHBOARD_COLS',
      payload: { spaceId: 'space-a', cols },
    });
    const withSpaceB = settingsReducer(withSpaceA, {
      type: 'SETTINGS_SET_DASHBOARD_COLS',
      payload: { spaceId: 'space-b', cols: [[{ type: 'single', id: 'notes', h: 99 }], [], []] },
    });
    expect(withSpaceB.dashboardCols['space-a']).toBe(cols); // không bị đè khi set Space khác
    expect(withSpaceB.dashboardCols['space-b']).not.toBe(cols);
    expect(withSpaceB.dashboardColWidths).toEqual(defaultSettings().dashboardColWidths); // colWidths không đổi
  });
});

describe('settingsReducer — SETTINGS_SET_CORNER_HEIGHT (mục 11.10, ngoại lệ h khối settings)', () => {
  it('ghi thẳng dashboardCornerHeight, không kèm spaceId, không đụng dashboardCols/colWidths', () => {
    const initial = defaultSettings();
    const next = settingsReducer(initial, { type: 'SETTINGS_SET_CORNER_HEIGHT', payload: { h: 40 } });
    expect(next.dashboardCornerHeight).toBe(40);
    expect(next.dashboardCols).toBe(initial.dashboardCols);
    expect(next.dashboardColWidths).toBe(initial.dashboardColWidths);
  });

  it('đổi dashboardCornerHeight không phụ thuộc Space nào — 1 giá trị duy nhất, ghi đè lần sau thắng lần trước', () => {
    let state = settingsReducer(defaultSettings(), { type: 'SETTINGS_SET_CORNER_HEIGHT', payload: { h: 30 } });
    state = settingsReducer(state, { type: 'SETTINGS_SET_CORNER_HEIGHT', payload: { h: 50 } });
    expect(state.dashboardCornerHeight).toBe(50);
  });
});

// MỚI (2026-07-09, mục 11.10 MỞ RỘNG) — cặp đôi với SETTINGS_SET_CORNER_HEIGHT, cho khối
// `reminders` (Thông báo) cũng LUÔN hiển thị mọi Space, không tắt được (y hệt lý do `settings`).
describe('settingsReducer — SETTINGS_SET_REMINDER_HEIGHT (mục 11.10 mở rộng, ngoại lệ h khối reminders)', () => {
  it('ghi thẳng dashboardReminderHeight, không kèm spaceId, không đụng dashboardCols/colWidths/dashboardCornerHeight', () => {
    const initial = defaultSettings();
    const next = settingsReducer(initial, { type: 'SETTINGS_SET_REMINDER_HEIGHT', payload: { h: 80 } });
    expect(next.dashboardReminderHeight).toBe(80);
    expect(next.dashboardCols).toBe(initial.dashboardCols);
    expect(next.dashboardColWidths).toBe(initial.dashboardColWidths);
    expect(next.dashboardCornerHeight).toBe(initial.dashboardCornerHeight);
  });

  it('đổi dashboardReminderHeight không phụ thuộc Space nào — 1 giá trị duy nhất, ghi đè lần sau thắng lần trước', () => {
    let state = settingsReducer(defaultSettings(), { type: 'SETTINGS_SET_REMINDER_HEIGHT', payload: { h: 60 } });
    state = settingsReducer(state, { type: 'SETTINGS_SET_REMINDER_HEIGHT', payload: { h: 75 } });
    expect(state.dashboardReminderHeight).toBe(75);
  });

  it('SETTINGS_SET_CORNER_HEIGHT và SETTINGS_SET_REMINDER_HEIGHT độc lập nhau, không đè lẫn nhau', () => {
    let state = settingsReducer(defaultSettings(), { type: 'SETTINGS_SET_CORNER_HEIGHT', payload: { h: 30 } });
    state = settingsReducer(state, { type: 'SETTINGS_SET_REMINDER_HEIGHT', payload: { h: 60 } });
    expect(state.dashboardCornerHeight).toBe(30);
    expect(state.dashboardReminderHeight).toBe(60);
  });
});

describe('settingsReducer — SETTINGS_RESET_DASHBOARD_COLS', () => {
  it('chỉ reset dashboardCols[spaceId] về default, không đụng colWidths lẫn Space khác (AC-11.9)', () => {
    const customCols: LayoutSlot[][] = [[{ type: 'single', id: 'notes', h: 99 }], [], []];
    let state = settingsReducer(defaultSettings(), { type: 'SETTINGS_SET_COL_WIDTHS', payload: { colWidths: [10, 10, 80] } });
    state = settingsReducer(state, { type: 'SETTINGS_SET_DASHBOARD_COLS', payload: { spaceId: 'space-a', cols: customCols } });
    state = settingsReducer(state, { type: 'SETTINGS_SET_DASHBOARD_COLS', payload: { spaceId: 'space-b', cols: customCols } });

    const result = settingsReducer(state, { type: 'SETTINGS_RESET_DASHBOARD_COLS', payload: { spaceId: 'space-a' } });

    expect(result.dashboardCols['space-a']).toEqual(defaultDashboardLayout().cols);
    expect(result.dashboardCols['space-b']).toBe(customCols); // Space khác không bị reset theo
    expect(result.dashboardColWidths).toEqual([10, 10, 80]); // colWidths không bị đụng
  });
});
