import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { SpaceFormModal } from './SpaceFormModal';
import { NOTE_PALETTE } from '../../state/reducers/notes';
import { spaceShortcutLabel } from './spaceShortcuts';
import type { Space } from '../../types';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Dot màu riêng từng Space — xoay vòng theo index trong `orderedSpaces` (theo NOTE_PALETTE
 * có sẵn, không thêm field màu mới vào Space type). Không đổi khi sắp xếp lại thứ tự Space
 * vì gán theo index hiện tại trong danh sách đã sort theo `order`, không gán theo id cố định —
 * đơn giản hơn, đủ đáp ứng yêu cầu "1 màu cố định/space theo index". */
function spaceDotColor(idx: number): string {
  return NOTE_PALETTE[idx % NOTE_PALETTE.length];
}

export function SpaceSwitcher() {
  const { state, dispatch } = useAppState();
  const showConfirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [formSpace, setFormSpace] = useState<Space | null | 'new'>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const currentSpace = state.spaces.find((s) => s.id === state.currentSpaceId);
  const orderedSpaces = [...state.spaces].sort((a, b) => a.order - b.order);
  const currentIdx = orderedSpaces.findIndex((s) => s.id === state.currentSpaceId);
  const today = todayStr();

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  function handleDelete(space: Space) {
    if (state.spaces.length <= 1) return;
    showConfirm(
      'Xoá space?',
      `Xoá space "${space.name}"? Toàn bộ Việc cần làm/Nhắc việc/Thói quen/Ghi chú trong space này sẽ mất. Hành động không thể hoàn tác.`,
      () => dispatch({ type: 'SPACE_DELETE', payload: { id: space.id } }),
    );
  }

  return (
    <div className="relative min-w-0 flex-1" ref={wrapRef}>
      <button
        className="flex w-full items-center justify-center gap-1.5 rounded-[9px] border border-[color:var(--border)] bg-[var(--raised)]
          px-3 py-[7px] text-[0.8125rem] font-semibold text-[var(--text)] transition-[border-color,color] duration-150
          hover:border-[color:var(--accent)] hover:text-[var(--accent)] max-sm:[&_span]:inline-block max-sm:[&_span]:max-w-[90px]
          max-sm:[&_span]:overflow-hidden max-sm:[&_span]:text-ellipsis max-sm:[&_span]:whitespace-nowrap"
        onClick={() => setOpen((v) => !v)}
        title="Đổi space"
        aria-label="Đổi space hiện tại"
      >
        <span
          className="h-2 w-2 flex-none rounded-full"
          aria-hidden="true"
          style={{ background: spaceDotColor(currentIdx) }}
        />
        <span id="space-switcher-label" className="overflow-hidden text-ellipsis whitespace-nowrap">
          {currentSpace?.name ?? ''}
        </span>
        <ChevronDown className="icon h-3 w-3 text-[var(--text-dim)]" size={12} />
      </button>
      {open && (
        <div className="space-menu !left-[-42px] !right-[-42px] !min-w-[240px]">
          {orderedSpaces.map((space, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === orderedSpaces.length - 1;
            const taskCount = space.tasks.filter((t) => t.date === today && !t.done).length;
            const noteCount = space.notes.length;
            const shortcut = spaceShortcutLabel(idx);
            return (
              <div
                key={space.id}
                className={`space-menu-item group ${space.id === state.currentSpaceId ? 'active' : ''}`}
                onClick={() => {
                  dispatch({ type: 'SPACE_SWITCH', payload: { id: space.id } });
                  setOpen(false);
                }}
              >
                <span
                  className="h-2 w-2 flex-none rounded-full"
                  aria-hidden="true"
                  style={{ background: spaceDotColor(idx) }}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{space.name}</span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.6875rem] font-medium text-[var(--text-dim)] opacity-[.85]">
                    {taskCount} việc hôm nay · {noteCount} note
                  </span>
                </span>
                {shortcut && (
                  <span className="flex-none rounded-[5px] border border-[color:var(--border)] bg-[var(--bg)] px-[5px] py-px text-[0.6563rem] font-bold tracking-[.01em] text-[var(--text-dim)] opacity-75">
                    {shortcut}
                  </span>
                )}
                <span className="flex flex-none items-center gap-[3px]">
                  <span className="mr-0.5 flex flex-none flex-col gap-px">
                    <button
                      className="icon-btn h-[13px] w-[18px] rounded-[5px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 [&_.icon]:h-[11px] [&_.icon]:w-[11px]"
                      disabled={isFirst}
                      title="Di chuyển lên"
                      aria-label="Di chuyển lên"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'SPACE_MOVE', payload: { id: space.id, direction: -1 } });
                      }}
                    >
                      <ChevronUp className="icon" size={11} />
                    </button>
                    <button
                      className="icon-btn h-[13px] w-[18px] rounded-[5px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 [&_.icon]:h-[11px] [&_.icon]:w-[11px]"
                      disabled={isLast}
                      title="Di chuyển xuống"
                      aria-label="Di chuyển xuống"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'SPACE_MOVE', payload: { id: space.id, direction: 1 } });
                      }}
                    >
                      <ChevronDown className="icon" size={11} />
                    </button>
                  </span>
                  <button
                    className="icon-btn opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    title="Đổi tên space"
                    aria-label="Đổi tên space"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      setFormSpace(space);
                    }}
                  >
                    <Pencil className="icon" size={13} />
                  </button>
                  {state.spaces.length > 1 && (
                    <button
                      className="icon-btn opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                      title="Xoá space"
                      aria-label="Xoá space"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(space);
                      }}
                    >
                      <Trash2 className="icon" size={13} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          <div className="my-1.5 mx-0.5 h-px bg-[var(--border)]" />
          <div
            className="flex cursor-pointer items-center gap-2 rounded-lg px-[9px] py-2 text-[0.8438rem] font-semibold text-[var(--accent)] hover:bg-[var(--raised)]"
            onClick={() => {
              setOpen(false);
              setFormSpace('new');
            }}
          >
            <Plus className="icon" size={15} />
            <span>Thêm space mới</span>
          </div>
        </div>
      )}
      {formSpace && <SpaceFormModal space={formSpace === 'new' ? null : formSpace} onClose={() => setFormSpace(null)} />}
    </div>
  );
}
