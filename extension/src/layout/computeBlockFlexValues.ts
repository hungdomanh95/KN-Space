import type { EnabledBlocks, LayoutSizes } from '../types';

export interface FlexValues {
  combined: string | number;
  notes: string | number;
  reminders: string | number;
  tasks: string | number;
  bottomRow: string | number;
  reminderSub: string | number;
  habitsSub: string | number;
  combinedDisplay: boolean;
  notesDisplay: boolean;
  remindersDisplay: boolean;
  tasksDisplay: boolean;
  bottomRowDisplay: boolean;
  reminderSubDisplay: boolean;
  habitsSubDisplay: boolean;
}

/**
 * Hàm thuần — tính flex value cho 3 khối chính + khối con tổng hợp, theo
 * enabledBlocks + layoutSizes hiện tại. Port logic applyEnabledBlocksLayout() từ mockup.
 */
export function computeBlockFlexValues(enabledBlocks: EnabledBlocks, sizes: LayoutSizes): FlexValues {
  const tasksOn = enabledBlocks.tasks;
  const reminderOn = enabledBlocks.reminder;
  const habitsOn = enabledBlocks.habits;
  const notesOn = enabledBlocks.notes;
  const remindersOn = enabledBlocks.reminders;
  const combinedOn = tasksOn || reminderOn || habitsOn;

  let tasksFlex: string | number = sizes.tasks;
  let bottomRowFlex: string | number = Math.max(10, 100 - sizes.tasks);
  if (tasksOn && (reminderOn || habitsOn)) {
    tasksFlex = sizes.tasks;
    bottomRowFlex = Math.max(10, 100 - sizes.tasks);
  } else if (tasksOn) {
    tasksFlex = 1;
    bottomRowFlex = 0;
  } else if (reminderOn || habitsOn) {
    bottomRowFlex = 1;
  }

  let reminderSubFlex: string | number = sizes.reminder;
  let habitsSubFlex: string | number = Math.max(10, 100 - sizes.reminder);
  if (reminderOn && habitsOn) {
    reminderSubFlex = sizes.reminder;
    habitsSubFlex = Math.max(10, 100 - sizes.reminder);
  } else if (reminderOn || habitsOn) {
    reminderSubFlex = reminderOn ? 1 : 0;
    habitsSubFlex = habitsOn ? 1 : 0;
  }

  const visibleMainCount = [combinedOn, notesOn, remindersOn].filter(Boolean).length;
  let combinedFlex: string | number = sizes.combined;
  let notesFlex: string | number = sizes.notes;
  let remindersFlex: string | number = Math.max(10, 100 - sizes.combined - sizes.notes);
  if (visibleMainCount > 0 && visibleMainCount < 3) {
    combinedFlex = combinedOn ? 1 : 0;
    notesFlex = notesOn ? 1 : 0;
    remindersFlex = remindersOn ? 1 : 0;
  }

  return {
    combined: combinedFlex,
    notes: notesFlex,
    reminders: remindersFlex,
    tasks: tasksFlex,
    bottomRow: bottomRowFlex,
    reminderSub: reminderSubFlex,
    habitsSub: habitsSubFlex,
    combinedDisplay: combinedOn,
    notesDisplay: notesOn,
    remindersDisplay: remindersOn,
    tasksDisplay: tasksOn,
    bottomRowDisplay: reminderOn || habitsOn,
    reminderSubDisplay: reminderOn,
    habitsSubDisplay: habitsOn,
  };
}
