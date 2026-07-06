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
