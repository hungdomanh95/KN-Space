import type { ReminderDefinition, ReminderFreqUnit, Space } from '../../types';

export interface ReminderFormPayload {
  type: 'once' | 'recurring';
  title: string;
  // once
  date?: string;
  onceTime?: string;
  // recurring
  freqN?: number;
  freqUnit?: ReminderFreqUnit;
  dayOfMonth?: number | null;
  time?: string;
}

/**
 * `REMINDER_CREATE.payload.id` (optional) — mirror TASK_CREATE/LOG_CREATE/HABIT_CREATE
 * (`reducers/tasks.ts`/`reducers/logs.ts`/`reducers/habits.ts`): cho phép caller
 * (`state/itemPersist.ts` qua `smartDispatch`) tự sinh id TRƯỚC khi gọi reducer, dùng chung đúng id
 * đó cho cả lượt tính descriptor persist item-level lẫn lượt dispatch thật — tránh 2 lần
 * `crypto.randomUUID()` ra 2 id khác nhau cho cùng 1 reminder vừa tạo (xem docs/features/
 * item-level-entity-tables.md mục 4.2). Absent = reducer tự sinh như cũ (mọi caller khác, vd test,
 * ReminderFormModal).
 */
export type ReminderAction =
  | { type: 'REMINDER_CREATE'; payload: ReminderFormPayload & { id?: string } }
  | { type: 'REMINDER_UPDATE'; payload: ReminderFormPayload & { id: string } }
  | { type: 'REMINDER_DELETE'; payload: { id: string } };

function buildReminder(payload: ReminderFormPayload, id: string, createdAt: string): ReminderDefinition {
  const title = payload.title.trim() || 'Việc chưa đặt tên';
  if (payload.type === 'once') {
    return {
      id,
      type: 'once',
      title,
      date: payload.date ?? '',
      time: payload.onceTime ?? '',
    };
  }
  const freqUnit = payload.freqUnit ?? 'day';
  const freqN = Math.max(1, payload.freqN ?? 1);
  return {
    id,
    type: 'recurring',
    title,
    freqN,
    freqUnit,
    dayOfMonth: freqUnit === 'month' ? Math.min(31, Math.max(1, payload.dayOfMonth ?? 1)) : null,
    time: freqUnit === 'hour' ? '' : (payload.time ?? ''),
    createdAt,
  };
}

export function remindersReducer(space: Space, action: ReminderAction): Space {
  switch (action.type) {
    case 'REMINDER_CREATE': {
      const nowIso = new Date().toISOString();
      const newReminder = buildReminder(action.payload, action.payload.id ?? crypto.randomUUID(), nowIso);
      // RemindersBlock hiện thị thẳng theo thứ tự mảng (không sort) — thêm vào ĐẦU để nhắc việc
      // mới luôn nổi lên trên cùng, thấy ngay không cần cuộn xuống cuối danh sách.
      return { ...space, reminders: [newReminder, ...space.reminders] };
    }
    case 'REMINDER_UPDATE': {
      return {
        ...space,
        reminders: space.reminders.map((r) => {
          if (r.id !== action.payload.id) return r;
          const createdAt = r.type === 'recurring' ? r.createdAt : new Date().toISOString();
          return buildReminder(action.payload, r.id, createdAt);
        }),
      };
    }
    case 'REMINDER_DELETE':
      return { ...space, reminders: space.reminders.filter((r) => r.id !== action.payload.id) };
    default:
      return space;
  }
}
