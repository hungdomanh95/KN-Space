# Assign Task + Thông báo sự kiện Shared Space — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép Member trong Shared Space gán (assign) Task cho 1/nhiều/tất cả Member, và gửi push notification tức thời khi Task được giao hoặc được đánh dấu hoàn thành.

**Architecture:** Thêm `assigneeIds: string[]` vào `Task` (JSONB, không cần migration DB). Diff assignee/done trước-sau ở `smartDispatch` (đã có sẵn ở `AppStateContext.tsx`) để phát hiện 2 sự kiện `assigned`/`completed`, gọi 1 Edge Function mới (`notify-shared-task-event`) trực tiếp từ client — khác hẳn cơ chế cron "đến hạn" đã có (`send-due-notifications`). Sự kiện `completed` có debounce 15s (module-level, in-memory) để chống spam khi tick nhầm.

**Tech Stack:** React 18 + TypeScript + Vite (frontend), Supabase Postgres + Edge Function (Deno) + Web Push (`npm:web-push@3.6.7`), Vitest (unit test cho logic thuần).

## Global Constraints

- Luôn trả lời/viết comment bằng tiếng Việt (theo `webapp/CLAUDE.md`).
- KHÔNG dùng Supabase Realtime — mọi đồng bộ vẫn theo load-on-open + debounce hiện có, tính năng này không đổi cơ chế đó.
- Chạy `npx tsc --noEmit` và `npm run build` trong `webapp/` sau khi xong mỗi task code — không đợi nhắc.
- Không tự `git commit`/`git push` trừ khi được yêu cầu rõ.
- Spec đầy đủ đã chốt tại `docs/features/shared-space-task-assign-notify.md` — mọi quyết định hành vi (permission, debounce 15s, loại trừ actor...) tham chiếu file đó, không suy diễn lại.
- Field mới (`Task.assigneeIds`, `Settings.pushNotifySharedSpaceEvents`) sống trong cột JSONB đã có (`kn_space_state.spaces`/`settings`, `kn_shared_spaces.tasks`) — **không cần ALTER TABLE nào**.
- Edge Function mới **không dùng service_role để tự tin cậy request** — phải tự verify JWT người gọi + kiểm tra membership trước khi gửi push (khác `send-due-notifications`, vốn chỉ được gọi bởi cron nội bộ).

---

## File Structure

**Mới:**
- `webapp/src/state/sharedTaskNotifyEffects.ts` — hàm thuần (pure) tính "có cần notify không" từ state trước + action, không tự gọi network (dễ unit test).
- `webapp/src/state/completeNotifyDebounce.ts` — debounce module-level cho sự kiện `completed` (schedule/cancel theo `taskId`).
- `webapp/src/storage/notifySharedTaskEvent.ts` — client helper gọi `supabase.functions.invoke('notify-shared-task-event', ...)`, best-effort (không throw).
- `webapp/supabase/functions/notify-shared-task-event/index.ts` — Edge Function mới, xác thực JWT người gọi + gửi Web Push.

**Sửa:**
- `webapp/src/types.ts` — thêm field `assigneeIds`/`pushNotifySharedSpaceEvents`.
- `webapp/src/state/seed.ts` — default cho `pushNotifySharedSpaceEvents`.
- `webapp/src/storage/normalize.ts` — normalize 2 field mới (dữ liệu cũ thiếu field không crash).
- `webapp/src/state/reducers/tasks.ts` — `TASK_CREATE`/`TASK_UPDATE` nhận `assigneeIds`.
- `webapp/src/state/reducers/settings.ts` — action mới `SETTINGS_SET_PUSH_NOTIFY_SHARED_EVENTS`.
- `webapp/src/state/appReducer.ts` — đăng ký action mới vào `SETTINGS_ACTION_TYPES`.
- `webapp/src/state/AppStateContext.tsx` — mở rộng `smartDispatch` gọi notify effect.
- `webapp/src/features/tasks/TaskFormModal.tsx` — UI chọn assignee.
- `webapp/src/features/tasks/TasksBlock.tsx` — hiển thị avatar assignee trên `TaskRow`.
- `webapp/src/features/settings/PushNotificationSettings.tsx` — sub-toggle mới.

---

### Task 1: Data model — `assigneeIds` + `pushNotifySharedSpaceEvents`

**Files:**
- Modify: `webapp/src/types.ts:5-15` (interface `Task`), `webapp/src/types.ts:176-201` (interface `Settings`)
- Modify: `webapp/src/state/seed.ts:37-62` (`defaultSettings`)
- Modify: `webapp/src/storage/normalize.ts:5-41` (`normalizeSpace`), `:169-188` (`normalizeSettings`)
- Modify: `webapp/src/state/reducers/tasks.ts` (toàn bộ file, xem hiện trạng bên dưới)
- Modify: `webapp/src/state/reducers/settings.ts` (toàn bộ file, xem hiện trạng bên dưới)
- Modify: `webapp/src/state/appReducer.ts:55-72` (`SETTINGS_ACTION_TYPES`)
- Test: `webapp/src/state/reducers/tasks.test.ts` (mới)
- Test: `webapp/src/state/reducers/settings.test.ts` (mới)

**Interfaces:**
- Produces: `Task.assigneeIds: string[]` (luôn có mặt sau normalize, mặc định `[]`); `Settings.pushNotifySharedSpaceEvents: boolean` (mặc định `true`); action `SETTINGS_SET_PUSH_NOTIFY_SHARED_EVENTS { enabled: boolean }`; `TaskAction` các payload `TASK_CREATE`/`TASK_UPDATE` nhận thêm `assigneeIds`.

- [ ] **Step 1: Viết test thất bại cho `tasksReducer` (assigneeIds)**

Tạo file `webapp/src/state/reducers/tasks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tasksReducer } from './tasks';
import type { Space } from '../../types';

function emptySpace(): Space {
  return {
    id: 's1',
    name: 'Test',
    order: 0,
    enabledBlocks: { tasks: true, reminder: true, habits: true, notes: true, reminders: true, today: true },
    tasks: [],
    reminders: [],
    habits: [],
    notes: [],
  };
}

describe('tasksReducer — assigneeIds', () => {
  it('TASK_CREATE mặc định assigneeIds rỗng nếu không truyền', () => {
    const next = tasksReducer(emptySpace(), {
      type: 'TASK_CREATE',
      payload: { title: 'A', content: '', date: '', time: '' },
    });
    expect(next.tasks[0].assigneeIds).toEqual([]);
  });

  it('TASK_CREATE lưu đúng assigneeIds được truyền', () => {
    const next = tasksReducer(emptySpace(), {
      type: 'TASK_CREATE',
      payload: { title: 'A', content: '', date: '', time: '', assigneeIds: ['u1', 'u2'] },
    });
    expect(next.tasks[0].assigneeIds).toEqual(['u1', 'u2']);
  });

  it('TASK_UPDATE thay thế toàn bộ assigneeIds', () => {
    const created = tasksReducer(emptySpace(), {
      type: 'TASK_CREATE',
      payload: { title: 'A', content: '', date: '', time: '', assigneeIds: ['u1'] },
    });
    const updated = tasksReducer(created, {
      type: 'TASK_UPDATE',
      payload: { id: created.tasks[0].id, title: 'A', content: '', date: '', time: '', assigneeIds: ['u2', 'u3'] },
    });
    expect(updated.tasks[0].assigneeIds).toEqual(['u2', 'u3']);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd webapp && npx vitest run src/state/reducers/tasks.test.ts`
Expected: FAIL — lỗi kiểu TypeScript (`assigneeIds` không tồn tại trên payload type) hoặc `expect(undefined).toEqual([])`.

- [ ] **Step 3: Thêm field vào `types.ts`**

Trong `webapp/src/types.ts`, sửa `interface Task` (dòng 5-15):

```ts
export interface Task {
  id: string;
  title: string;
  content: string; // nội dung chi tiết tuỳ chọn (textarea), '' nếu không đặt
  date: string; // yyyy-mm-dd, '' nếu không đặt
  time: string; // HH:mm, '' nếu không đặt
  done: boolean;
  order: number; // thứ tự sắp xếp thủ công (kéo-thả qua icon grip)
  createdBy?: string; // userId — chỉ set trong shared space
  createdAt?: string; // ISO timestamp lúc tạo — dùng hiện giờ gửi trong MobileChatScreen
  /** user_id được giao việc — chỉ có ý nghĩa ở Shared Space, rỗng = chưa giao ai */
  assigneeIds: string[];
}
```

Sửa `interface Settings` (dòng 176-201), thêm field cuối cùng trước dấu `}`:

```ts
  dashboardLayout: DashboardLayout;
  /** Bật/tắt thông báo push cho sự kiện Shared Space (giao việc/hoàn thành) — độc lập với thông báo đến hạn. */
  pushNotifySharedSpaceEvents: boolean;
}
```

- [ ] **Step 4: Default trong `seed.ts`**

Trong `webapp/src/state/seed.ts`, hàm `defaultSettings()` (dòng 37-62), thêm dòng trước `};` đóng object:

```ts
    dashboardLayout: defaultDashboardLayout(),
    pushNotifySharedSpaceEvents: true,
  };
}
```

- [ ] **Step 5: Normalize 2 field mới**

Trong `webapp/src/storage/normalize.ts`, sửa dòng 20-22 (`normalizeSpace`, phần `tasks`):

```ts
    tasks: Array.isArray(space.tasks)
      ? space.tasks.map((t, idx) => ({
          ...t,
          content: t.content ?? '',
          order: t.order ?? idx,
          assigneeIds: Array.isArray(t.assigneeIds) ? t.assigneeIds : [],
        }))
      : [],
```

Sửa `normalizeSettings` (dòng 169-188), thêm trước dòng `dashboardLayout: normalizeDashboardLayout(...)`:

```ts
    pushNotifySharedSpaceEvents:
      typeof settings.pushNotifySharedSpaceEvents === 'boolean'
        ? settings.pushNotifySharedSpaceEvents
        : fallback.pushNotifySharedSpaceEvents,
    dashboardLayout: normalizeDashboardLayout(settings.dashboardLayout ?? legacyDashboardLayout),
```

- [ ] **Step 6: Cập nhật `tasksReducer`**

Thay toàn bộ nội dung `webapp/src/state/reducers/tasks.ts`:

```ts
import type { Space, Task } from '../../types';

/** Actions tác động lên dữ liệu Task trong 1 Space. TASK_SET_FILTER là UI-only, xử lý ở appReducer. */
export type TaskAction =
  | { type: 'TASK_CREATE'; payload: { title: string; content: string; date: string; time: string; createdBy?: string; assigneeIds?: string[] } }
  | { type: 'TASK_UPDATE'; payload: { id: string; title: string; content: string; date: string; time: string; assigneeIds: string[] } }
  | { type: 'TASK_DELETE'; payload: { id: string } }
  | { type: 'TASK_TOGGLE_DONE'; payload: { id: string } }
  | { type: 'TASK_REORDER'; payload: { draggedId: string; targetId: string } };

export function tasksReducer(space: Space, action: TaskAction): Space {
  switch (action.type) {
    case 'TASK_CREATE': {
      // `order` nhỏ hơn mọi task hiện có (không phải lớn hơn) — sortTasksForDisplay sort tăng
      // dần theo order, nên việc mới luôn nổi lên ĐẦU danh sách (chưa-xong) ngay khi tạo, đúng
      // yêu cầu thực tế: vừa thêm là thấy ngay, không phải cuộn xuống cuối mới thấy.
      const minOrder = space.tasks.reduce((min, t) => Math.min(min, t.order), 0);
      const newTask: Task = {
        id: crypto.randomUUID(),
        title: action.payload.title.trim() || 'Việc chưa đặt tên',
        content: action.payload.content,
        date: action.payload.date,
        time: action.payload.time,
        done: false,
        order: minOrder - 1,
        createdAt: new Date().toISOString(),
        assigneeIds: action.payload.assigneeIds ?? [],
        ...(action.payload.createdBy ? { createdBy: action.payload.createdBy } : {}),
      };
      return { ...space, tasks: [...space.tasks, newTask] };
    }
    case 'TASK_UPDATE': {
      return {
        ...space,
        tasks: space.tasks.map((t) =>
          t.id === action.payload.id
            ? {
                ...t,
                title: action.payload.title.trim() || 'Việc chưa đặt tên',
                content: action.payload.content,
                date: action.payload.date,
                time: action.payload.time,
                assigneeIds: action.payload.assigneeIds,
              }
            : t,
        ),
      };
    }
    case 'TASK_DELETE':
      return { ...space, tasks: space.tasks.filter((t) => t.id !== action.payload.id) };
    case 'TASK_TOGGLE_DONE':
      return {
        ...space,
        tasks: space.tasks.map((t) => (t.id === action.payload.id ? { ...t, done: !t.done } : t)),
      };
    case 'TASK_REORDER': {
      const { draggedId, targetId } = action.payload;
      if (draggedId === targetId) return space;
      // Cùng pattern NOTE_REORDER: sort theo order hiện tại -> mảng tuyến tính -> re-assign 0..n-1.
      // Luôn chèn TRƯỚC targetId (đơn giản hơn bản note có insertAfter — danh sách task chỉ 1 cột,
      // không cần phân biệt nửa trên/nửa dưới của row).
      const ordered = [...space.tasks].sort((a, b) => a.order - b.order);
      const fromIdx = ordered.findIndex((t) => t.id === draggedId);
      if (fromIdx === -1) return space;
      const [moved] = ordered.splice(fromIdx, 1);
      const toIdx = ordered.findIndex((t) => t.id === targetId);
      if (toIdx === -1) return space;
      ordered.splice(toIdx, 0, moved);
      const reindexed = ordered.map((t, idx) => ({ ...t, order: idx }));
      return { ...space, tasks: reindexed };
    }
    default:
      return space;
  }
}
```

- [ ] **Step 7: Chạy lại test Task, xác nhận PASS**

Run: `cd webapp && npx vitest run src/state/reducers/tasks.test.ts`
Expected: PASS (3/3 test).

- [ ] **Step 8: Viết test cho `settingsReducer` (action mới)**

Tạo file `webapp/src/state/reducers/settings.test.ts`:

```ts
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
```

- [ ] **Step 9: Chạy test, xác nhận FAIL**

Run: `cd webapp && npx vitest run src/state/reducers/settings.test.ts`
Expected: FAIL — action type không tồn tại.

- [ ] **Step 10: Thêm action + case vào `settings.ts`**

Trong `webapp/src/state/reducers/settings.ts`, thêm vào union type `SettingsAction` (sau dòng `| { type: 'SETTINGS_RESET_DASHBOARD_LAYOUT' };` — đổi dấu `;` thành `|` nối tiếp):

```ts
  | { type: 'SETTINGS_SET_DASHBOARD_LAYOUT'; payload: { layout: DashboardLayout } }
  | { type: 'SETTINGS_RESET_DASHBOARD_LAYOUT' }
  | { type: 'SETTINGS_SET_PUSH_NOTIFY_SHARED_EVENTS'; payload: { enabled: boolean } };
```

Thêm case vào `switch` (trước `default:`):

```ts
    case 'SETTINGS_SET_PUSH_NOTIFY_SHARED_EVENTS':
      return { ...settings, pushNotifySharedSpaceEvents: action.payload.enabled };
```

- [ ] **Step 11: Đăng ký action mới trong `appReducer.ts`**

Trong `webapp/src/state/appReducer.ts`, thêm vào `SETTINGS_ACTION_TYPES` (dòng 55-72):

```ts
const SETTINGS_ACTION_TYPES = new Set([
  'SETTINGS_SET_THEME',
  'SETTINGS_SET_ACCENT',
  'SETTINGS_SET_HOME_BG_INDEX',
  'SETTINGS_SET_HOME_BG_IMAGE',
  'SETTINGS_SET_HOME_BG_UPLOAD',
  'SETTINGS_HOME_BG_USE_LINK_MODE',
  'SETTINGS_SET_HOME_BG_AUTO_ROTATE',
  'SETTINGS_HOME_BG_ROTATE_NEXT',
  'BLOCK_TOGGLE_COLLAPSED',
  'SETTINGS_SET_HOME_QUOTE_TEXT',
  'SETTINGS_SET_HOME_QUOTE_INDEX',
  'SETTINGS_SET_QUOTE_ROTATE_MODE',
  'SETTINGS_HOME_QUOTE_ROTATE_NEXT',
  'NOTE_SET_VIEW',
  'SETTINGS_SET_DASHBOARD_LAYOUT',
  'SETTINGS_RESET_DASHBOARD_LAYOUT',
  'SETTINGS_SET_PUSH_NOTIFY_SHARED_EVENTS',
]);
```

- [ ] **Step 12: Chạy lại toàn bộ test + typecheck**

Run: `cd webapp && npx vitest run src/state/reducers/ && npx tsc --noEmit`
Expected: Tất cả test PASS, `tsc` không lỗi.

- [ ] **Step 13: Commit**

```bash
git add webapp/src/types.ts webapp/src/state/seed.ts webapp/src/storage/normalize.ts webapp/src/state/reducers/tasks.ts webapp/src/state/reducers/tasks.test.ts webapp/src/state/reducers/settings.ts webapp/src/state/reducers/settings.test.ts webapp/src/state/appReducer.ts
git commit -m "feat: thêm data model assigneeIds + pushNotifySharedSpaceEvents"
```

---

### Task 2: Debounce module + pure notify-effect calculator

**Files:**
- Create: `webapp/src/state/completeNotifyDebounce.ts`
- Create: `webapp/src/state/completeNotifyDebounce.test.ts`
- Create: `webapp/src/state/sharedTaskNotifyEffects.ts`
- Create: `webapp/src/state/sharedTaskNotifyEffects.test.ts`

**Interfaces:**
- Consumes: `Task`/`Space` từ `../types` (đã có `assigneeIds` từ Task 1).
- Produces: `scheduleCompletedNotify(taskId, fn, delayMs?)`, `cancelCompletedNotify(taskId)`, `COMPLETE_NOTIFY_DEBOUNCE_MS`; `computeTaskCreateNotifyEffect(createdTask, currentUserId)`, `computeTaskUpdateNotifyEffect(prevSpace, action, currentUserId)`, `computeTaskToggleDoneNotifyEffect(prevSpace, action)` — dùng ở Task 4.

- [ ] **Step 1: Viết test thất bại cho debounce module**

Tạo `webapp/src/state/completeNotifyDebounce.test.ts`:

```ts
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
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd webapp && npx vitest run src/state/completeNotifyDebounce.test.ts`
Expected: FAIL — module chưa tồn tại (lỗi import).

- [ ] **Step 3: Viết `completeNotifyDebounce.ts`**

```ts
// Debounce module-level (chỉ tồn tại trong bộ nhớ tab đang mở) cho sự kiện "task hoàn thành"
// trong Shared Space — xem docs/features/shared-space-task-assign-notify.md mục 6.1.
// Mục đích: tick nhầm rồi tick lại/untick trong vài giây không bắn noti mỗi lần.

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const COMPLETE_NOTIFY_DEBOUNCE_MS = 15_000;

/** Huỷ lịch gọi đang chờ (nếu có) của `taskId`, không làm gì nếu không có lịch nào. */
export function cancelCompletedNotify(taskId: string): void {
  const existing = timers.get(taskId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(taskId);
  }
}

/** Lên lịch gọi `fn` sau `delayMs` — tự huỷ lịch cũ (nếu có) của cùng `taskId` trước khi đặt lịch mới. */
export function scheduleCompletedNotify(taskId: string, fn: () => void, delayMs: number = COMPLETE_NOTIFY_DEBOUNCE_MS): void {
  cancelCompletedNotify(taskId);
  const timer = setTimeout(() => {
    timers.delete(taskId);
    fn();
  }, delayMs);
  timers.set(taskId, timer);
}
```

- [ ] **Step 4: Chạy lại test debounce, xác nhận PASS**

Run: `cd webapp && npx vitest run src/state/completeNotifyDebounce.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Viết test thất bại cho `sharedTaskNotifyEffects`**

Tạo `webapp/src/state/sharedTaskNotifyEffects.test.ts`:

```ts
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
```

- [ ] **Step 6: Chạy test, xác nhận FAIL**

Run: `cd webapp && npx vitest run src/state/sharedTaskNotifyEffects.test.ts`
Expected: FAIL — module chưa tồn tại.

- [ ] **Step 7: Viết `sharedTaskNotifyEffects.ts`**

```ts
import type { Space } from '../types';
import type { AppAction } from './appReducer';

// Hàm THUẦN (pure) — tính "có nên notify không" từ state TRƯỚC khi action áp dụng, không tự gọi
// network. Caller (AppStateContext.smartDispatch) chịu trách nhiệm gọi notifyTaskAssigned/
// notifyTaskCompleted/scheduleCompletedNotify tương ứng với effect trả về.
// Xem docs/features/shared-space-task-assign-notify.md mục 3.2/3.3 cho quy tắc gốc.

export type SharedTaskNotifyEffect =
  | { kind: 'assigned'; taskId: string; taskTitle: string; recipientUserIds: string[] }
  | { kind: 'completed-schedule'; taskId: string; taskTitle: string }
  | { kind: 'completed-cancel'; taskId: string };

/** Task vừa tạo (đã có id thật do reducer sinh) — chỉ cần đúng 3 field này để tính effect. */
interface CreatedTaskLike {
  id: string;
  title: string;
  assigneeIds: string[];
}

export function computeTaskCreateNotifyEffect(
  createdTask: CreatedTaskLike,
  currentUserId: string,
): SharedTaskNotifyEffect | null {
  const recipientUserIds = createdTask.assigneeIds.filter((id) => id !== currentUserId);
  if (recipientUserIds.length === 0) return null;
  return { kind: 'assigned', taskId: createdTask.id, taskTitle: createdTask.title, recipientUserIds };
}

export function computeTaskUpdateNotifyEffect(
  prevSpace: Space,
  action: Extract<AppAction, { type: 'TASK_UPDATE' }>,
  currentUserId: string,
): SharedTaskNotifyEffect | null {
  const prevTask = prevSpace.tasks.find((t) => t.id === action.payload.id);
  const prevAssignees = new Set(prevTask?.assigneeIds ?? []);
  const newlyAdded = action.payload.assigneeIds.filter((id) => !prevAssignees.has(id) && id !== currentUserId);
  if (newlyAdded.length === 0) return null;
  return { kind: 'assigned', taskId: action.payload.id, taskTitle: action.payload.title, recipientUserIds: newlyAdded };
}

export function computeTaskToggleDoneNotifyEffect(
  prevSpace: Space,
  action: Extract<AppAction, { type: 'TASK_TOGGLE_DONE' }>,
): SharedTaskNotifyEffect | null {
  const prevTask = prevSpace.tasks.find((t) => t.id === action.payload.id);
  if (!prevTask) return null;
  if (!prevTask.done) {
    return { kind: 'completed-schedule', taskId: prevTask.id, taskTitle: prevTask.title };
  }
  return { kind: 'completed-cancel', taskId: prevTask.id };
}
```

- [ ] **Step 8: Chạy lại test, xác nhận PASS + typecheck**

Run: `cd webapp && npx vitest run src/state/sharedTaskNotifyEffects.test.ts && npx tsc --noEmit`
Expected: Tất cả PASS, `tsc` không lỗi.

- [ ] **Step 9: Commit**

```bash
git add webapp/src/state/completeNotifyDebounce.ts webapp/src/state/completeNotifyDebounce.test.ts webapp/src/state/sharedTaskNotifyEffects.ts webapp/src/state/sharedTaskNotifyEffects.test.ts
git commit -m "feat: thêm debounce module + pure notify-effect calculator cho shared task event"
```

---

### Task 3: Client notify helper (gọi Edge Function)

**Files:**
- Create: `webapp/src/storage/notifySharedTaskEvent.ts`

**Interfaces:**
- Consumes: `supabase` từ `../lib/supabaseClient`.
- Produces: `notifyTaskAssigned(spaceId, taskId, taskTitle, recipientUserIds)`, `notifyTaskCompleted(spaceId, taskId, taskTitle, excludeUserId)` — dùng ở Task 4. Cả 2 đều **best-effort**, không throw ra ngoài.

- [ ] **Step 1: Viết `notifySharedTaskEvent.ts`**

```ts
import { supabase } from '../lib/supabaseClient';

// Gọi Edge Function `notify-shared-task-event` — sự kiện (assign/complete) trong Shared Space,
// KHÁC cơ chế cron "đến hạn" (send-due-notifications). Xem
// docs/features/shared-space-task-assign-notify.md mục 4 (Kiến trúc kỹ thuật).
//
// Best-effort: lỗi mạng/lỗi function không throw ra ngoài, không chặn luồng lưu task
// (mục 6.3 spec — "chấp nhận best-effort, không Realtime").

interface NotifyPayload {
  spaceId: string;
  taskId: string;
  taskTitle: string;
  event: 'assigned' | 'completed';
  recipientUserIds?: string[];
  excludeUserId?: string;
}

async function callNotify(payload: NotifyPayload): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('notify-shared-task-event', { body: payload });
    if (error) console.warn('[KN-Space] notify-shared-task-event lỗi:', error.message);
  } catch (err) {
    console.warn('[KN-Space] notify-shared-task-event lỗi mạng:', err);
  }
}

/** Task vừa tạo/sửa có assignee MỚI — gọi ngay, không debounce (xem spec mục 6.1). */
export function notifyTaskAssigned(spaceId: string, taskId: string, taskTitle: string, recipientUserIds: string[]): void {
  if (recipientUserIds.length === 0) return;
  void callNotify({ spaceId, taskId, taskTitle, event: 'assigned', recipientUserIds });
}

/** Task vừa chuyển sang hoàn thành — caller (AppStateContext) tự debounce trước khi gọi hàm này. */
export function notifyTaskCompleted(spaceId: string, taskId: string, taskTitle: string, excludeUserId: string): void {
  void callNotify({ spaceId, taskId, taskTitle, event: 'completed', excludeUserId });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd webapp && npx tsc --noEmit`
Expected: Không lỗi.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/storage/notifySharedTaskEvent.ts
git commit -m "feat: thêm client helper gọi Edge Function notify-shared-task-event"
```

---

### Task 4: Wire vào `AppStateContext.smartDispatch`

**Files:**
- Modify: `webapp/src/state/AppStateContext.tsx:1-17` (imports), `:241-253` (`smartDispatch`)

**Interfaces:**
- Consumes: `computeTaskCreateNotifyEffect`/`computeTaskUpdateNotifyEffect`/`computeTaskToggleDoneNotifyEffect` (Task 2), `scheduleCompletedNotify`/`cancelCompletedNotify` (Task 2), `notifyTaskAssigned`/`notifyTaskCompleted` (Task 3), `tasksReducer` (đã có, `./reducers/tasks`), `useAuth` (đã có, `../auth/AuthContext`).
- Produces: `smartDispatch` tự động gọi notify khi cần — không thay đổi interface `useAppState()` (vẫn `{ state, dispatch, isLoading, saveNow }`).

- [ ] **Step 1: Thêm import**

Trong `webapp/src/state/AppStateContext.tsx`, thêm vào khối import đầu file (sau dòng `import { appReducer } from './appReducer';`):

```ts
import { useAuth } from '../auth/AuthContext';
import { tasksReducer } from './reducers/tasks';
import { notifyTaskAssigned, notifyTaskCompleted } from '../storage/notifySharedTaskEvent';
import { scheduleCompletedNotify, cancelCompletedNotify } from './completeNotifyDebounce';
import {
  computeTaskCreateNotifyEffect,
  computeTaskUpdateNotifyEffect,
  computeTaskToggleDoneNotifyEffect,
} from './sharedTaskNotifyEffects';
```

- [ ] **Step 2: Lấy `session` trong `AppStateProvider`**

Ngay sau dòng `const hydratedRef = useRef(false);` (trong `AppStateProvider`), thêm:

```ts
  const { session } = useAuth();
```

- [ ] **Step 3: Mở rộng `smartDispatch`**

Thay toàn bộ khối `smartDispatch` hiện tại:

```ts
  const smartDispatch = React.useCallback((action: AppAction) => {
    if (action.type === 'SPACE_DELETE') {
      const space = state.spaces.find((s) => s.id === action.payload.id);
      if (space?.isShared && space.sharedSpaceId) {
        void deleteSharedSpace(space.sharedSpaceId).catch((err) =>
          console.warn('[KN-Space] Xoá shared space trên DB thất bại:', err),
        );
      }
    }

    dispatch(action);
  }, [state.spaces]);
```

thành:

```ts
  /**
   * Ngoài việc dispatch bình thường, chặn thêm 1 số action để bắn notify sự kiện Shared Space
   * (assign/hoàn thành task — xem docs/features/shared-space-task-assign-notify.md). Tính effect
   * TRƯỚC khi gọi dispatch() thật (dựa trên state hiện tại) vì cần biết giá trị "trước đó" để
   * so sánh (assigneeIds cũ, done cũ) — sau dispatch() thì state cũ đã mất.
   */
  const smartDispatch = React.useCallback((action: AppAction) => {
    if (action.type === 'SPACE_DELETE') {
      const space = state.spaces.find((s) => s.id === action.payload.id);
      if (space?.isShared && space.sharedSpaceId) {
        void deleteSharedSpace(space.sharedSpaceId).catch((err) =>
          console.warn('[KN-Space] Xoá shared space trên DB thất bại:', err),
        );
      }
    }

    const currentUserId = session?.user?.id;
    const currentSpace = state.spaces.find((s) => s.id === state.currentSpaceId);

    if (currentSpace?.isShared && currentSpace.sharedSpaceId && currentUserId) {
      const sharedSpaceId = currentSpace.sharedSpaceId;

      if (action.type === 'TASK_CREATE') {
        // Task chưa có id thật ở payload (reducer tự sinh crypto.randomUUID()) — tính trước
        // bằng chính tasksReducer (pure) rồi diff với tasks cũ để tìm đúng task vừa tạo.
        const nextTasks = tasksReducer(currentSpace, action).tasks;
        const prevIds = new Set(currentSpace.tasks.map((t) => t.id));
        const created = nextTasks.find((t) => !prevIds.has(t.id));
        if (created) {
          const effect = computeTaskCreateNotifyEffect(created, currentUserId);
          if (effect) notifyTaskAssigned(sharedSpaceId, effect.taskId, effect.taskTitle, effect.recipientUserIds);
        }
      }

      if (action.type === 'TASK_UPDATE') {
        const effect = computeTaskUpdateNotifyEffect(currentSpace, action, currentUserId);
        if (effect) notifyTaskAssigned(sharedSpaceId, effect.taskId, effect.taskTitle, effect.recipientUserIds);
      }

      if (action.type === 'TASK_TOGGLE_DONE') {
        const effect = computeTaskToggleDoneNotifyEffect(currentSpace, action);
        if (effect?.kind === 'completed-schedule') {
          const { taskId, taskTitle } = effect;
          scheduleCompletedNotify(taskId, () => notifyTaskCompleted(sharedSpaceId, taskId, taskTitle, currentUserId));
        } else if (effect?.kind === 'completed-cancel') {
          cancelCompletedNotify(effect.taskId);
        }
      }

      if (action.type === 'TASK_DELETE') {
        // Task bị xoá trước khi debounce 15s kịp chạy — huỷ lịch, tránh notify về task không còn tồn tại.
        cancelCompletedNotify(action.payload.id);
      }
    }

    dispatch(action);
  }, [state.spaces, state.currentSpaceId, session?.user?.id]);
```

- [ ] **Step 4: Typecheck + build**

Run: `cd webapp && npx tsc --noEmit && npm run build`
Expected: Không lỗi.

- [ ] **Step 5: Test thủ công (chưa có UI assign — dùng DevTools console)**

Vì UI chọn assignee chưa có (Task 6), test bằng cách tạm thời gọi dispatch qua console để xác nhận notify được gọi (kiểm tra Network tab thấy request `notify-shared-task-event` — sẽ lỗi 404 vì Edge Function chưa deploy, đó là **kỳ vọng đúng** ở bước này, chỉ cần xác nhận request ĐƯỢC GỌI đúng lúc, đúng payload):
1. `npm run dev`, mở app, vào 1 Shared Space đã có sẵn (hoặc tạo mới + tự invite bằng tài khoản phụ nếu có).
2. Mở DevTools → Network, lọc `notify-shared-task-event`.
3. Tick 1 task từ chưa-xong → xong. Đợi 15 giây (mục 6.1 debounce) → thấy 1 request POST `notify-shared-task-event` với body `{"event":"completed",...}`.
4. Tick lại (untick) trong vòng 15s của 1 task khác → xác nhận **không** thấy request nào cho task đó.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/state/AppStateContext.tsx
git commit -m "feat: wire smartDispatch gọi notify sự kiện shared task (assign/complete)"
```

---

### Task 5: Edge Function `notify-shared-task-event`

**Files:**
- Create: `webapp/supabase/functions/notify-shared-task-event/index.ts`

**Interfaces:**
- Consumes: request `POST` JSON `{ spaceId, taskId, taskTitle, event: 'assigned'|'completed', recipientUserIds?, excludeUserId? }`, header `Authorization: Bearer <user JWT>` (tự động do `supabase.functions.invoke()` đính kèm — xem Task 3).
- Produces: response JSON `{ ok: true, pushSent, pushFailed, recipients? }` hoặc `{ error: string }` (4xx/5xx).

- [ ] **Step 1: Viết Edge Function**

```ts
// =============================================================================
// notify-shared-task-event — Supabase Edge Function (Deno)
// =============================================================================
// Phần "Assign Task + Thông báo sự kiện" — xem
// docs/features/shared-space-task-assign-notify.md mục 4 (Kiến trúc kỹ thuật).
//
// KHÁC send-due-notifications: function này được gọi TRỰC TIẾP từ client (không qua cron),
// nên PHẢI tự xác thực JWT người gọi + verify membership trước khi gửi push — không dùng
// service_role để tin cậy request ngay từ đầu.
// =============================================================================

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
// Cùng secret VAPID đã set cho send-due-notifications — không cần set lại (secret là project-level).
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@kn-space.io.vn';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestBody {
  spaceId: string;
  taskId: string;
  taskTitle: string;
  event: 'assigned' | 'completed';
  recipientUserIds?: string[];
  excludeUserId?: string;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return jsonResponse({ error: 'Thiếu secret VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY.' }, 500);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Body không phải JSON hợp lệ.' }, 400);
  }

  const { spaceId, taskId, taskTitle, event, recipientUserIds, excludeUserId } = body;
  if (!spaceId || !taskId || !taskTitle || (event !== 'assigned' && event !== 'completed')) {
    return jsonResponse({ error: 'Thiếu field bắt buộc hoặc event không hợp lệ.' }, 400);
  }

  // 1) Xác thực caller qua JWT trong header Authorization (client tự đính kèm qua functions.invoke()).
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ error: 'Không xác thực được người gọi (JWT không hợp lệ).' }, 401);
  }
  const callerId = userData.user.id;

  // 2) service_role để verify caller là Member thật của space + lấy toàn bộ member.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: memberRows, error: memberErr } = await admin
    .from('kn_space_members')
    .select('user_id')
    .eq('space_id', spaceId);

  if (memberErr) {
    return jsonResponse({ error: `kn_space_members: ${memberErr.message}` }, 500);
  }
  const memberIds = new Set((memberRows ?? []).map((r) => r.user_id as string));
  if (!memberIds.has(callerId)) {
    return jsonResponse({ error: 'Bạn không phải thành viên của space này.' }, 403);
  }

  // 3) Tính danh sách người nhận theo event (xem spec mục 3.2/3.3).
  let recipients: string[];
  if (event === 'completed') {
    recipients = Array.from(memberIds).filter((id) => id !== excludeUserId);
  } else {
    recipients = (recipientUserIds ?? []).filter((id) => memberIds.has(id) && id !== callerId);
  }

  if (recipients.length === 0) {
    return jsonResponse({ ok: true, pushSent: 0, pushFailed: 0, note: 'Không có người nhận hợp lệ.' }, 200);
  }

  // 4) Lọc người đã tắt sub-toggle "Thông báo hoạt động Space chung" (settings.pushNotifySharedSpaceEvents === false).
  const { data: stateRows, error: stateErr } = await admin
    .from('kn_space_state')
    .select('user_id, settings')
    .in('user_id', recipients);
  if (stateErr) {
    return jsonResponse({ error: `kn_space_state: ${stateErr.message}` }, 500);
  }
  const optedOut = new Set(
    (stateRows ?? [])
      .filter((r) => (r.settings as { pushNotifySharedSpaceEvents?: boolean } | null)?.pushNotifySharedSpaceEvents === false)
      .map((r) => r.user_id as string),
  );
  const finalRecipients = recipients.filter((id) => !optedOut.has(id));

  if (finalRecipients.length === 0) {
    return jsonResponse({ ok: true, pushSent: 0, pushFailed: 0, note: 'Toàn bộ người nhận đã tắt loại thông báo này.' }, 200);
  }

  // 5) Lấy subscription của người nhận + gửi push (cùng pattern send-due-notifications).
  const { data: subRows, error: subErr } = await admin
    .from('kn_push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth_key')
    .in('user_id', finalRecipients);
  if (subErr) {
    return jsonResponse({ error: `kn_push_subscriptions: ${subErr.message}` }, 500);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const title = event === 'completed' ? `✅ ${taskTitle} đã hoàn thành` : `📌 Bạn được giao "${taskTitle}"`;
  const payload = JSON.stringify({ title, url: `/?open=task:${taskId}` });

  let pushSent = 0;
  let pushFailed = 0;
  for (const sub of subRows ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint as string, keys: { p256dh: sub.p256dh as string, auth: sub.auth_key as string } },
        payload,
      );
      pushSent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await admin.from('kn_push_subscriptions').delete().eq('id', sub.id as string);
      } else {
        pushFailed += 1;
      }
    }
  }

  return jsonResponse({ ok: true, pushSent, pushFailed, recipients: finalRecipients.length }, 200);
});
```

- [ ] **Step 2: Deploy thủ công (chủ dự án tự làm — cần credentials `supabase` CLI đã login/link)**

Không thể tự deploy trong phiên làm việc này (không có credentials project thật) — chủ dự án tự chạy:

```bash
cd webapp
supabase functions deploy notify-shared-task-event
```

Không cần set thêm secret nào — dùng chung `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` đã set từ Phần 3 Push Notification (`supabase secrets list` để xác nhận vẫn còn).

- [ ] **Step 3: Test thủ công sau khi deploy**

Từ máy có `supabase` CLI đã login, hoặc bất kỳ máy nào có `curl`:

```bash
curl -i -X POST 'https://<project-ref>.supabase.co/functions/v1/notify-shared-task-event' \
  -H "Authorization: Bearer <access_token của 1 user thật đang là Member 1 shared space>" \
  -H "Content-Type: application/json" \
  -d '{"spaceId":"<uuid shared space thật>","taskId":"test-1","taskTitle":"Test task","event":"completed","excludeUserId":"<user_id đang gọi>"}'
```

Expected: `200 {"ok":true,"pushSent":<n>,"pushFailed":0,"recipients":<n>}` — và các Member khác (đã bật push) nhận được thông báo "✅ Test task đã hoàn thành" trên thiết bị.

Test case lỗi 403 (không phải member): gọi với `spaceId` của 1 space mà user JWT đó KHÔNG phải member → expect `403 {"error":"Bạn không phải thành viên của space này."}`.

- [ ] **Step 4: Commit**

```bash
git add webapp/supabase/functions/notify-shared-task-event/index.ts
git commit -m "feat: thêm Edge Function notify-shared-task-event"
```

---

### Task 6: UI chọn assignee trong `TaskFormModal`

**Files:**
- Modify: `webapp/src/features/tasks/TaskFormModal.tsx` (toàn bộ file)

**Interfaces:**
- Consumes: `useSpaceMembers` (đã có, `../../state/useSpaceMembers`), `getMemberColor`/`getMemberDisplayName` (đã có, `../../utils/memberColors`), `MemberAvatar` (đã có, `../../components/MemberAvatar`).
- Produces: dispatch `TASK_CREATE`/`TASK_UPDATE` kèm `assigneeIds` (khớp payload đã mở rộng ở Task 1).

- [ ] **Step 1: Thay toàn bộ nội dung `TaskFormModal.tsx`**

```tsx
import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { MemberAvatar } from '../../components/MemberAvatar';
import { useAppState } from '../../state/AppStateContext';
import { useCurrentUserId } from '../../state/useCurrentUserId';
import { useCurrentSpace } from '../../state/AppStateContext';
import { useSpaceMembers } from '../../state/useSpaceMembers';
import { getMemberColor, getMemberDisplayName } from '../../utils/memberColors';
import type { Task } from '../../types';

interface TaskFormModalProps {
  task: Task | null; // null = tạo mới
  onClose: () => void;
}

export function TaskFormModal({ task, onClose }: TaskFormModalProps) {
  const { dispatch } = useAppState();
  const space = useCurrentSpace();
  const currentUserId = useCurrentUserId();
  const members = useSpaceMembers(space.isShared ? space.sharedSpaceId : undefined);
  const [title, setTitle] = useState(task?.title ?? '');
  const [content, setContent] = useState(task?.content ?? '');
  const [date, setDate] = useState(task?.date ?? '');
  const [time, setTime] = useState(task?.time ?? '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assigneeIds ?? []);

  function toggleAssignee(userId: string) {
    setAssigneeIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  function toggleSelectAll() {
    const allIds = members.map((m) => m.userId);
    const allSelected = allIds.length > 0 && allIds.every((id) => assigneeIds.includes(id));
    setAssigneeIds(allSelected ? [] : allIds);
  }

  function handleSave() {
    if (task) {
      dispatch({ type: 'TASK_UPDATE', payload: { id: task.id, title, content, date, time, assigneeIds } });
    } else {
      const createdBy = space.isShared && currentUserId ? currentUserId : undefined;
      dispatch({ type: 'TASK_CREATE', payload: { title, content, date, time, assigneeIds, createdBy } });
    }
    onClose();
  }

  return (
    <Modal onClose={onClose} className="modal-note w-[620px] max-w-[92vw] max-md:w-[94vw]">
      <h2>{task ? 'Sửa việc' : 'Việc mới'}</h2>
      <div className="field">
        <label>Tên việc</label>
        <input
          type="text"
          value={title}
          placeholder="Vd: Họp với khách hàng"
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>
      <div className="field">
        <label>Nội dung (tuỳ chọn)</label>
        <textarea
          className="note-content-field max-md:min-h-[120px]"
          value={content}
          placeholder="Vd: nội dung cần chuẩn bị, link tài liệu..."
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Ngày (tuỳ chọn)</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Giờ (tuỳ chọn)</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      {space.isShared && members.length > 0 && (
        <div className="field">
          <div className="flex items-center justify-between">
            <label>Giao cho (tuỳ chọn)</label>
            <button type="button" className="btn-ghost" onClick={toggleSelectAll}>
              {members.length > 0 && members.every((m) => assigneeIds.includes(m.userId)) ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          </div>
          <div className="flex max-h-[160px] flex-col gap-1.5 overflow-y-auto rounded-[10px] border-[1.5px] border-[color:var(--border)] p-2">
            {members.map((m) => {
              const checked = assigneeIds.includes(m.userId);
              const name = getMemberDisplayName(m.userId, members, 40);
              return (
                <label key={m.userId} className="flex items-center gap-2 text-[0.875rem]">
                  <input type="checkbox" checked={checked} onChange={() => toggleAssignee(m.userId)} />
                  <MemberAvatar name={name} color={getMemberColor(m.userId, members)} size={18} />
                  <span>
                    {name}
                    {m.userId === currentUserId ? ' (bạn)' : ''}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
      <div className="modal-actions sticky bottom-0 bg-[var(--modal-bg)] pt-2">
        <button className="btn-ghost" onClick={onClose}>
          Hủy
        </button>
        <button className="btn-primary" onClick={handleSave}>
          Lưu
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `cd webapp && npx tsc --noEmit && npm run build`
Expected: Không lỗi.

- [ ] **Step 3: Test thủ công trên browser**

1. `npm run dev`, mở app, vào 1 Shared Space có ít nhất 2 Member (owner + 1 người khác — dùng 2 tài khoản Google khác nhau, hoặc 2 trình duyệt/profile khác nhau nếu chỉ có 1 tài khoản test).
2. Bấm "+ Thêm" tạo task mới → xác nhận thấy khối "Giao cho (tuỳ chọn)" với checklist đúng danh sách Member.
3. Tick 1 Member → bấm "Chọn tất cả" → xác nhận tick hết → bấm lại → xác nhận label đổi thành "Bỏ chọn tất cả" và bấm lần nữa bỏ tick hết.
4. Tick 1 Member cụ thể → Lưu → mở lại (bấm bút chì) task đó → xác nhận đúng Member đã tick vẫn còn được chọn.
5. Vào 1 Space **cá nhân** (không phải Shared) → tạo/sửa task → xác nhận khối "Giao cho" **không hiển thị**.

- [ ] **Step 4: Commit**

```bash
git add webapp/src/features/tasks/TaskFormModal.tsx
git commit -m "feat: thêm UI chọn assignee trong TaskFormModal"
```

---

### Task 7: Hiển thị assignee trên `TaskRow`

**Files:**
- Modify: `webapp/src/features/tasks/TasksBlock.tsx:42-51` (`TaskRowProps`), `:54-185` (`TaskRow`), `:187-309` (`TasksBlock`, đoạn render `list.map`)

**Interfaces:**
- Consumes: `MemberAvatar`, `useSpaceMembers`, `getMemberColor`/`getMemberDisplayName` (đã import sẵn trong file này).
- Produces: không đổi export nào — chỉ thêm UI hiển thị.

- [ ] **Step 1: Thêm prop `assignees` vào `TaskRowProps`**

Sửa `interface TaskRowProps` (dòng 42-51):

```ts
interface TaskRowProps {
  task: Task;
  draggedId: string | null;
  onDragStartId: (id: string) => void;
  onDragEndAll: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  memberDotColor?: string; // màu avatar nếu task của người khác trong shared space
  memberDotName?: string;  // tên hiện trong avatar + chip bên dưới tiêu đề
  assignees?: { name: string; color: string }[]; // avatar assignee, hiển thị cạnh chip meta
}
```

- [ ] **Step 2: Nhận prop trong destructure + render**

Sửa dòng khai báo function (dòng 54):

```tsx
function TaskRow({ task, draggedId, onDragStartId, onDragEndAll, onEdit, onDelete, memberDotColor, memberDotName, assignees }: TaskRowProps) {
```

Sửa điều kiện hiển thị khối meta (dòng 157) và thêm render assignee ngay sau chip `memberDotName` (dòng 157-173):

```tsx
        {(meta || memberDotName || (assignees && assignees.length > 0)) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {meta && (
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--raised)] px-[7px] py-0.5 text-[0.7188rem] font-semibold text-[var(--text-dim)]">
                {meta}
              </span>
            )}
            {memberDotName && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-[7px] py-0.5 text-[0.7188rem] font-semibold"
                style={{ color: memberDotColor, background: `color-mix(in srgb, ${memberDotColor} 14%, var(--raised))` }}
              >
                {memberDotName}
              </span>
            )}
            {assignees && assignees.length > 0 && (
              <span className="inline-flex items-center gap-1" title={`Giao cho: ${assignees.map((a) => a.name).join(', ')}`}>
                {assignees.slice(0, 3).map((a, i) => (
                  <MemberAvatar key={i} name={a.name} color={a.color} size={16} />
                ))}
                {assignees.length > 3 && (
                  <span className="text-[0.7188rem] font-semibold text-[var(--text-dim)]">+{assignees.length - 3}</span>
                )}
              </span>
            )}
          </div>
        )}
```

- [ ] **Step 3: Tính `assignees` trong `TasksBlock` + truyền prop**

Sửa đoạn `list.map` (dòng 288-304):

```tsx
          list.map((task) => {
            const isOther = space.isShared && task.createdBy && task.createdBy !== currentUserId;
            const assignees =
              space.isShared && task.assigneeIds.length > 0
                ? task.assigneeIds.map((uid) => ({
                    name: getMemberDisplayName(uid, members, 20),
                    color: getMemberColor(uid, members),
                  }))
                : undefined;
            return (
              <TaskRow
                key={task.id}
                task={task}
                draggedId={draggedId}
                onDragStartId={setDraggedId}
                onDragEndAll={() => setDraggedId(null)}
                onEdit={setEditingTask}
                onDelete={handleDelete}
                memberDotColor={isOther ? getMemberColor(task.createdBy!, members) : undefined}
                memberDotName={isOther ? getMemberDisplayName(task.createdBy!, members, 40) : undefined}
                assignees={assignees}
              />
            );
          })
```

- [ ] **Step 4: Thêm import `MemberAvatar` (đã có sẵn ở dòng 5, không cần thêm)**

Kiểm tra lại dòng 5 file đã có `import { MemberAvatar } from '../../components/MemberAvatar';` — không cần sửa gì thêm ở phần import.

- [ ] **Step 5: Typecheck + build**

Run: `cd webapp && npx tsc --noEmit && npm run build`
Expected: Không lỗi.

- [ ] **Step 6: Test thủ công trên browser**

1. Từ Task 6 đã gán 1-2 assignee cho 1 task trong Shared Space → xác nhận thấy avatar tròn nhỏ (initials) cạnh chip ngày/tên người tạo, dưới tiêu đề task.
2. Gán 4+ assignee cho 1 task (nếu space đủ member — nếu không đủ, tạm sửa code test giả lập mảng dài hơn rồi revert) → xác nhận chỉ hiện tối đa 3 avatar + chữ "+N".
3. Hover vào cụm avatar → xác nhận tooltip hiện đủ tên tất cả assignee.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/features/tasks/TasksBlock.tsx
git commit -m "feat: hiển thị avatar assignee trên TaskRow"
```

---

### Task 8: Sub-toggle Settings "Thông báo hoạt động Space chung"

**Files:**
- Modify: `webapp/src/features/settings/PushNotificationSettings.tsx` (toàn bộ file)

**Interfaces:**
- Consumes: `useAppState` (đã có pattern dùng ở `HomeQuoteSettings.tsx`), action `SETTINGS_SET_PUSH_NOTIFY_SHARED_EVENTS` (Task 1).
- Produces: không đổi export — chỉ thêm UI + dispatch mới.

- [ ] **Step 1: Thêm import + đọc state**

Thêm import ở đầu file (sau dòng `import { usePushSubscription } from '../notifications/usePushSubscription';`):

```ts
import { useAppState } from '../../state/AppStateContext';
```

Trong function `PushNotificationSettings()`, thêm ngay sau dòng khai báo `push`:

```ts
  const { state, dispatch } = useAppState();
```

- [ ] **Step 2: Thêm sub-toggle vào JSX**

Chèn khối mới ngay sau `div` toggle chính (sau đoạn đóng `</div>` của khối toggle "Nhận thông báo khi Nhắc việc/Việc cần làm đến hạn", trước khối `{error && (...)}`):

```tsx
      <div className="mt-2.5 flex items-center justify-between gap-3 rounded-[10px] border-[1.5px] border-[color:var(--border)] bg-[var(--raised)] p-3">
        <div className="min-w-0">
          <p className="m-0 text-[0.9062rem] font-semibold text-[var(--text)]">Thông báo hoạt động Space chung</p>
          <p className="hint mt-1">Báo khi task trong Space chung được giao cho bạn hoặc được hoàn thành.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.settings.pushNotifySharedSpaceEvents}
          aria-label="Bật/tắt thông báo hoạt động Space chung"
          onClick={() =>
            dispatch({
              type: 'SETTINGS_SET_PUSH_NOTIFY_SHARED_EVENTS',
              payload: { enabled: !state.settings.pushNotifySharedSpaceEvents },
            })
          }
          className={`relative h-6 w-[42px] flex-none rounded-full border-[1.5px] transition-colors duration-150 ${
            state.settings.pushNotifySharedSpaceEvents
              ? 'border-[color:var(--accent)] bg-[var(--accent)]'
              : 'border-[color:var(--border-control)] bg-[var(--bg)]'
          }`}
        >
          <span
            className={`absolute top-1/2 h-[17px] w-[17px] -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-150 ${
              state.settings.pushNotifySharedSpaceEvents ? 'translate-x-[21px]' : 'translate-x-[3px]'
            }`}
          />
        </button>
      </div>
```

Sub-toggle này **luôn hiển thị** (không điều kiện theo `checked`/`isStandalone`/có Shared Space hay không) — đúng quyết định Q-B trong spec.

- [ ] **Step 3: Typecheck + build**

Run: `cd webapp && npx tsc --noEmit && npm run build`
Expected: Không lỗi.

- [ ] **Step 4: Test thủ công trên browser**

1. `npm run dev` → Settings → tab "Chung" → khối "Thông báo đẩy" → xác nhận thấy sub-toggle mới "Thông báo hoạt động Space chung", mặc định bật (accent color).
2. Tắt sub-toggle → reload trang → xác nhận vẫn tắt (đã lưu qua debounce + Supabase).
3. Kiểm tra sub-toggle **hiện cả khi chưa có Shared Space nào** (vào 1 tài khoản test chưa join/tạo Shared Space nào).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/features/settings/PushNotificationSettings.tsx
git commit -m "feat: thêm sub-toggle Thông báo hoạt động Space chung"
```

---

### Task 9: End-to-end verification + dọn tài liệu tiến độ

**Files:**
- Modify: `docs/features/shared-space-task-assign-notify.md` (thêm mục trạng thái triển khai, nếu cần)

**Interfaces:**
- Không có interface code mới — task này chỉ verify toàn bộ luồng thật + chốt tài liệu.

- [ ] **Step 1: Chạy toàn bộ test + build 1 lượt cuối**

Run: `cd webapp && npx vitest run && npx tsc --noEmit && npm run build`
Expected: Toàn bộ test PASS, không lỗi build.

- [ ] **Step 2: Test end-to-end thật (2 tài khoản, sau khi Edge Function đã deploy — Task 5 Step 2)**

Cần 2 tài khoản Google khác nhau (hoặc 2 trình duyệt/profile), cả 2 đã cài PWA + bật push (theo hướng dẫn có sẵn trong `docs/features/push-notification.md` mục 3.1):

1. Tài khoản A tạo 1 Shared Space, mời tài khoản B qua invite link, B join.
2. A tạo 1 task, giao (assign) cho B → xác nhận B nhận được push "📌 Bạn được giao "..."" trong vài giây, A **không** nhận gì.
3. B tick task đó thành hoàn thành → đợi 15 giây → xác nhận A nhận được push "✅ ... đã hoàn thành", B **không** nhận gì.
4. B tick lại thành chưa-xong rồi tick lại thành xong trong vòng 15 giây → xác nhận A chỉ nhận **đúng 1** push (không bị spam).
5. A vào Settings tắt sub-toggle "Thông báo hoạt động Space chung" → B tick xong 1 task khác → xác nhận A **không** nhận push sự kiện này nhưng vẫn nhận push "đến hạn" bình thường nếu có Reminder/Task deadline khác đang chờ (kiểm tra không ảnh hưởng toggle chính).

- [ ] **Step 3: Cập nhật trạng thái trong spec doc**

Thêm vào cuối `docs/features/shared-space-task-assign-notify.md` (dòng cuối file, sau mục 10):

```markdown

---

## 11. Trạng thái triển khai

✅ Code hoàn chỉnh (data model, UI assign, Edge Function, wiring notify) — xem plan
`docs/superpowers/plans/2026-07-06-shared-space-task-assign-notify.md`.
Đã verify end-to-end thật với 2 tài khoản (ngày điền khi chủ dự án tự test xong Task 9 Step 2).
```

- [ ] **Step 4: Commit tài liệu**

```bash
git add docs/features/shared-space-task-assign-notify.md
git commit -m "docs: chốt trạng thái triển khai Assign Task + Notify sự kiện Shared Space"
```
