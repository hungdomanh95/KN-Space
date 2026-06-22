import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { SpaceFormModal } from './SpaceFormModal';
import type { Space } from '../../types';

export function SpaceSwitcher() {
  const { state, dispatch } = useAppState();
  const showConfirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [formSpace, setFormSpace] = useState<Space | null | 'new'>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const currentSpace = state.spaces.find((s) => s.id === state.currentSpaceId);
  const orderedSpaces = [...state.spaces].sort((a, b) => a.order - b.order);

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
    <div className="space-switcher" ref={wrapRef}>
      <button className="space-switcher-btn" onClick={() => setOpen((v) => !v)}>
        <Layers className="icon" size={12} />
        <span>{currentSpace?.name ?? ''}</span>
        <ChevronDown className="icon" size={12} />
      </button>
      {open && (
        <div className="space-menu">
          {orderedSpaces.map((space, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === orderedSpaces.length - 1;
            return (
              <div
                key={space.id}
                className={`space-menu-item ${space.id === state.currentSpaceId ? 'active' : ''}`}
                onClick={() => {
                  dispatch({ type: 'SPACE_SWITCH', payload: { id: space.id } });
                  setOpen(false);
                }}
              >
                <Layers className="icon" size={15} />
                <span className="space-name">{space.name}</span>
                <span className="space-tools">
                  <span className="space-move">
                    <button
                      className="icon-btn icon-btn-mini"
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
                      className="icon-btn icon-btn-mini"
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
                    className="icon-btn"
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
                      className="icon-btn"
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
          <div className="space-menu-divider" />
          <div
            className="space-menu-add"
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
