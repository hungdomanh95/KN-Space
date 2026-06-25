import React, { useEffect, useRef, useState } from 'react';
import { useAppState, useCurrentSpace } from '../state/AppStateContext';
import { TasksBlock } from '../features/tasks/TasksBlock';
import { RemindersBlock } from '../features/reminders/RemindersBlock';
import { HabitsBlock } from '../features/habits/HabitsBlock';
import { NotesBlock } from '../features/notes/NotesBlock';
import { NotificationsBlock } from '../features/notifications/NotificationsBlock';
import { DashboardCorner } from '../components/DashboardCorner';
import { computeBlockFlexValues } from './computeBlockFlexValues';
import type { MainBlockKey } from '../types';

interface AppLayoutProps {
  onGoHome: () => void;
}

/** 2 khối được phép kéo-thả đổi thứ tự — khối Thông báo cố định cuối, không tham gia. */
type ReorderableBlockKey = Exclude<MainBlockKey, 'reminders'>;

/**
 * Drag-reorder CHỈ 2 khối: combined/notes (HTML5 DnD gốc). Khối Thông báo (`reminders`)
 * cố định vị trí cuối #main-row, nằm trong .reminders-col cùng DashboardCorner (widget
 * điều hướng Về Home/Space-switcher/Settings) — không tham gia kéo-thả đổi thứ tự, không
 * có slider width riêng (xem computeBlockFlexValues/requirements mục 4/4.1).
 *
 * Mỗi khối chính có 1 ref riêng; "arm" draggable=true khi mousedown đúng vào block-head,
 * "disarm" lúc mouseup ở document — làm imperatively qua ref, KHÔNG qua state (tránh race
 * batched/async). Khi xử lý dragstart/dragend ở cấp khối cha, guard `e.target !== block`
 * để chặn event nổi bọt từ card con (vd. note).
 */
export function AppLayout({ onGoHome }: AppLayoutProps) {
  const { state, dispatch } = useAppState();
  const space = useCurrentSpace();
  const blockRefs = useRef<Record<ReorderableBlockKey, HTMLDivElement | null>>({
    combined: null,
    notes: null,
  });
  const [draggedKey, setDraggedKey] = useState<ReorderableBlockKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<ReorderableBlockKey | null>(null);

  useEffect(() => {
    function disarmAll() {
      Object.values(blockRefs.current).forEach((el) => {
        if (el) el.draggable = false;
      });
    }
    document.addEventListener('mouseup', disarmAll);
    return () => document.removeEventListener('mouseup', disarmAll);
  }, []);

  function armBlock(key: ReorderableBlockKey, e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest('.block-head')) return;
    const el = blockRefs.current[key];
    if (el) el.draggable = true;
  }

  function handleDragStart(key: ReorderableBlockKey, e: React.DragEvent<HTMLDivElement>) {
    if (e.target !== blockRefs.current[key]) return;
    setDraggedKey(key);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd(key: ReorderableBlockKey, e: React.DragEvent<HTMLDivElement>) {
    if (e.target !== blockRefs.current[key]) return;
    const el = blockRefs.current[key];
    if (el) el.draggable = false;
    setDraggedKey(null);
    setDragOverKey(null);
  }

  function handleDragOver(key: ReorderableBlockKey, e: React.DragEvent<HTMLDivElement>) {
    if (!draggedKey) return;
    e.preventDefault();
    setDragOverKey(key);
  }

  function handleDragLeave(key: ReorderableBlockKey) {
    setDragOverKey((prev) => (prev === key ? null : prev));
  }

  function handleDrop(key: ReorderableBlockKey, e: React.DragEvent<HTMLDivElement>) {
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

  const blockModifierClass = (key: ReorderableBlockKey) =>
    `${draggedKey === key ? 'dragging' : ''} ${dragOverKey === key && draggedKey !== key ? 'drag-over' : ''}`.trim();
  const blockClass = (key: ReorderableBlockKey) => `main-block ${blockModifierClass(key)}`.trim();

  function dragHandlers(key: ReorderableBlockKey) {
    return {
      onMouseDownCapture: (e: React.MouseEvent<HTMLDivElement>) => armBlock(key, e),
      onDragStart: (e: React.DragEvent<HTMLDivElement>) => handleDragStart(key, e),
      onDragEnd: (e: React.DragEvent<HTMLDivElement>) => handleDragEnd(key, e),
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => handleDragOver(key, e),
      onDragLeave: () => handleDragLeave(key),
      onDrop: (e: React.DragEvent<HTMLDivElement>) => handleDrop(key, e),
    };
  }

  const blockNodes: Record<ReorderableBlockKey, React.ReactNode> = {
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
  };

  const reorderableOrder = state.settings.mainBlockOrder.filter(
    (key): key is ReorderableBlockKey => key !== 'reminders',
  );

  return (
    <div id="dashboard">
      <div id="main-row">
        {reorderableOrder.map((key) => blockNodes[key])}
        {/* Cột Thông báo CỐ ĐỊNH cuối #main-row, không tham gia kéo-thả đổi thứ tự, width
            luôn = phần còn lại (không slider riêng) — widget điều hướng nằm ngay TRÊN nó,
            cùng cột nên width khớp đúng (xem requirements mục 4/4.1). */}
        {flex.remindersDisplay && (
          <div className="reminders-col" style={{ flex: flex.reminders }}>
            <DashboardCorner onGoHome={onGoHome} />
            <NotificationsBlock style={{ flex: 1, minHeight: 0 }} />
          </div>
        )}
      </div>
    </div>
  );
}
