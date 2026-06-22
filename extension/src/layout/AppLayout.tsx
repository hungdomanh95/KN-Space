import React, { useEffect, useRef, useState } from 'react';
import { useAppState, useCurrentSpace } from '../state/AppStateContext';
import { TasksBlock } from '../features/tasks/TasksBlock';
import { RemindersBlock } from '../features/reminders/RemindersBlock';
import { HabitsBlock } from '../features/habits/HabitsBlock';
import { NotesBlock } from '../features/notes/NotesBlock';
import { NotificationsBlock } from '../features/notifications/NotificationsBlock';
import { computeBlockFlexValues } from './computeBlockFlexValues';
import type { MainBlockKey } from '../types';

/**
 * Drag-reorder 3 khối chính (combined/notes/reminders) bằng HTML5 DnD gốc.
 * Mỗi khối chính có 1 ref riêng; "arm" draggable=true khi mousedown đúng vào
 * block-head, "disarm" lúc mouseup ở document — làm imperatively qua ref,
 * KHÔNG qua state (tránh race batched/async). Khi xử lý dragstart/dragend ở cấp
 * khối cha, guard `e.target !== block` để chặn event nổi bọt từ card con (vd. note).
 */
export function AppLayout() {
  const { state, dispatch } = useAppState();
  const space = useCurrentSpace();
  const blockRefs = useRef<Record<MainBlockKey, HTMLDivElement | null>>({
    combined: null,
    notes: null,
    reminders: null,
  });
  const [draggedKey, setDraggedKey] = useState<MainBlockKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<MainBlockKey | null>(null);

  useEffect(() => {
    function disarmAll() {
      Object.values(blockRefs.current).forEach((el) => {
        if (el) el.draggable = false;
      });
    }
    document.addEventListener('mouseup', disarmAll);
    return () => document.removeEventListener('mouseup', disarmAll);
  }, []);

  function armBlock(key: MainBlockKey, e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.block-head')) return;
    const el = blockRefs.current[key];
    if (el) el.draggable = true;
  }

  function handleDragStart(key: MainBlockKey, e: React.DragEvent<HTMLDivElement>) {
    if (e.target !== blockRefs.current[key]) return;
    setDraggedKey(key);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd(key: MainBlockKey, e: React.DragEvent<HTMLDivElement>) {
    if (e.target !== blockRefs.current[key]) return;
    const el = blockRefs.current[key];
    if (el) el.draggable = false;
    setDraggedKey(null);
    setDragOverKey(null);
  }

  function handleDragOver(key: MainBlockKey, e: React.DragEvent<HTMLDivElement>) {
    if (!draggedKey) return;
    e.preventDefault();
    setDragOverKey(key);
  }

  function handleDragLeave(key: MainBlockKey) {
    setDragOverKey((prev) => (prev === key ? null : prev));
  }

  function handleDrop(key: MainBlockKey, e: React.DragEvent<HTMLDivElement>) {
    if (!draggedKey) return;
    e.preventDefault();
    setDragOverKey(null);
    if (draggedKey === key) return;
    const order = [...state.settings.mainBlockOrder];
    const fromIdx = order.indexOf(draggedKey);
    const toIdx = order.indexOf(key);
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, draggedKey);
    dispatch({ type: 'SETTINGS_SET_MAIN_BLOCK_ORDER', payload: { order } });
    setDraggedKey(null);
  }

  const flex = computeBlockFlexValues(space.enabledBlocks, state.settings.layoutSizes);

  const blockModifierClass = (key: MainBlockKey) =>
    `${draggedKey === key ? 'dragging' : ''} ${dragOverKey === key && draggedKey !== key ? 'drag-over' : ''}`.trim();
  const blockClass = (key: MainBlockKey) => `main-block ${blockModifierClass(key)}`.trim();

  function dragHandlers(key: MainBlockKey) {
    return {
      onMouseDownCapture: (e: React.MouseEvent<HTMLDivElement>) => armBlock(key, e),
      onDragStart: (e: React.DragEvent<HTMLDivElement>) => handleDragStart(key, e),
      onDragEnd: (e: React.DragEvent<HTMLDivElement>) => handleDragEnd(key, e),
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => handleDragOver(key, e),
      onDragLeave: () => handleDragLeave(key),
      onDrop: (e: React.DragEvent<HTMLDivElement>) => handleDrop(key, e),
    };
  }

  const blockNodes: Record<MainBlockKey, React.ReactNode> = {
    combined: flex.combinedDisplay ? (
      <div
        key="combined"
        id="block-combined"
        ref={(el) => {
          blockRefs.current.combined = el;
        }}
        className={blockClass('combined')}
        style={{ flex: flex.combined }}
        draggable={false}
        {...dragHandlers('combined')}
      >
        <div id="combined-sub">
          {flex.tasksDisplay && <TasksBlock style={{ flex: flex.tasks }} />}
          {flex.bottomRowDisplay && (
            <div id="combined-bottom-row" style={{ flex: flex.bottomRow, display: 'flex', gap: 12, minHeight: 0 }}>
              {flex.reminderSubDisplay && <RemindersBlock style={{ flex: flex.reminderSub }} />}
              {flex.habitsSubDisplay && <HabitsBlock style={{ flex: flex.habitsSub }} />}
            </div>
          )}
        </div>
      </div>
    ) : null,
    notes: flex.notesDisplay ? (
      <NotesBlock
        key="notes"
        rootRef={(el) => {
          blockRefs.current.notes = el;
        }}
        className={blockModifierClass('notes')}
        style={{ flex: flex.notes }}
        draggable={false}
        {...dragHandlers('notes')}
      />
    ) : null,
    reminders: flex.remindersDisplay ? (
      <NotificationsBlock
        key="reminders"
        rootRef={(el) => {
          blockRefs.current.reminders = el;
        }}
        className={blockModifierClass('reminders')}
        style={{ flex: flex.reminders }}
        draggable={false}
        {...dragHandlers('reminders')}
      />
    ) : null,
  };

  return (
    <div id="dashboard">
      <div id="main-row">{state.settings.mainBlockOrder.map((key) => blockNodes[key])}</div>
    </div>
  );
}
