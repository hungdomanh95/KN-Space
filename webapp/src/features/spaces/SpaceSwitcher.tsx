import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Share2, Trash2, UserPlus } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { SpaceFormModal } from './SpaceFormModal';
import { SharedSpaceFormModal } from './SharedSpaceFormModal';
import { SpaceInviteModal } from './SpaceInviteModal';
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

// ---------------------------------------------------------------------------
// Section header cho dropdown
// ---------------------------------------------------------------------------
function SectionHeader({
  label,
  onAdd,
  addTitle,
}: {
  label: string;
  onAdd: () => void;
  addTitle: string;
}) {
  return (
    <div className="flex items-center justify-between px-2 pt-2 pb-1">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--text-dim)]">
        {label}
      </span>
      <button
        className="icon-btn flex h-5 w-5 items-center justify-center rounded-[5px]"
        title={addTitle}
        aria-label={addTitle}
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
      >
        <Plus className="icon" size={13} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SpaceSwitcher
// ---------------------------------------------------------------------------
export function SpaceSwitcher() {
  const { state, dispatch } = useAppState();
  const showConfirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [formSpace, setFormSpace] = useState<Space | null | 'new'>(null);
  const [showSharedForm, setShowSharedForm] = useState(false);
  const [inviteModalSpaceId, setInviteModalSpaceId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const currentSpace = state.spaces.find((s) => s.id === state.currentSpaceId);

  // Tất cả spaces đã sort theo order — dùng để tính dot màu (index toàn cục)
  const orderedSpaces = [...state.spaces].sort((a, b) => a.order - b.order);
  const currentIdx = orderedSpaces.findIndex((s) => s.id === state.currentSpaceId);

  // Tách 2 section
  const orderedPrivateSpaces = orderedSpaces.filter((s) => !s.isShared);
  const orderedSharedSpaces = orderedSpaces.filter((s) => s.isShared);

  const today = todayStr();

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  function handleDelete(space: Space) {
    // Chỉ cản xoá nếu đây là private space duy nhất còn lại (shared space có thể xoá tự do)
    const privateCount = state.spaces.filter((s) => !s.isShared).length;
    if (!space.isShared && privateCount <= 1) return;
    showConfirm(
      'Xoá space?',
      `Xoá space "${space.name}"? Toàn bộ Việc cần làm/Nhắc việc/Thói quen/Ghi chú trong space này sẽ mất. Hành động không thể hoàn tác.`,
      () => dispatch({ type: 'SPACE_DELETE', payload: { id: space.id } }),
    );
  }

  function handleCreatePrivateSpace() {
    setOpen(false);
    setFormSpace('new');
  }

  function handleCreateSharedSpace() {
    setOpen(false);
    setShowSharedForm(true);
  }

  // Render 1 space item — dùng chung cho cả private lẫn shared
  function renderSpaceItem(space: Space, globalIdx: number, extraControls?: React.ReactNode) {
    const taskCount = space.tasks.filter((t) => t.date === today && !t.done).length;
    const noteCount = space.notes.length;

    return (
      <div
        key={space.id}
        role="button"
        tabIndex={0}
        className={`space-menu-item group ${space.id === state.currentSpaceId ? 'active' : ''}`}
        onTouchEnd={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          e.preventDefault();
          dispatch({ type: 'SPACE_SWITCH', payload: { id: space.id } });
          setOpen(false);
        }}
        onClick={() => {
          dispatch({ type: 'SPACE_SWITCH', payload: { id: space.id } });
          setOpen(false);
        }}
      >
        {space.isShared ? (
          <Share2 className="icon h-3 w-3 flex-none text-[var(--accent)]" size={12} />
        ) : (
          <span
            className="h-2 w-2 flex-none rounded-full"
            aria-hidden="true"
            style={{ background: spaceDotColor(globalIdx) }}
          />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{space.name}</span>
          {space.isShared ? (
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.6875rem] font-medium text-[var(--text-dim)] opacity-[.85]">
              {noteCount} note
            </span>
          ) : (
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.6875rem] font-medium text-[var(--text-dim)] opacity-[.85]">
              {taskCount} việc hôm nay · {noteCount} note
            </span>
          )}
        </span>
        {extraControls}
      </div>
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
        {currentSpace?.isShared ? (
          <Share2 className="icon h-3 w-3 flex-none text-[var(--accent)]" size={12} aria-hidden="true" />
        ) : (
          <span
            className="h-2 w-2 flex-none rounded-full"
            aria-hidden="true"
            style={{ background: spaceDotColor(currentIdx) }}
          />
        )}
        <span id="space-switcher-label" className="overflow-hidden text-ellipsis whitespace-nowrap">
          {currentSpace?.name ?? ''}
        </span>
        <ChevronDown className="icon h-3 w-3 text-[var(--text-dim)]" size={12} />
      </button>

      {/* -42px mỗi bên để mở rộng dropdown khi parent là khung hẹp kẹp giữa nút Home/Settings
          (bản desktop) — trên mobile (DashboardCorner compact) parent đã gần full-width, cộng
          thêm -42px sẽ tràn ra ngoài viewport. max-md: reset về khớp đúng parent. */}
      {open && (
        <div className="space-menu !left-[-42px] !right-[-42px] !min-w-[240px] max-md:!inset-x-0 max-md:!min-w-0">
          {/* ── Section: Space của tôi ── */}
          <SectionHeader
            label="Space của tôi"
            onAdd={handleCreatePrivateSpace}
            addTitle="Tạo space cá nhân"
          />

          {orderedPrivateSpaces.map((space, privateIdx) => {
            const globalIdx = orderedSpaces.findIndex((s) => s.id === space.id);
            const isFirst = privateIdx === 0;
            const isLast = privateIdx === orderedPrivateSpaces.length - 1;
            const shortcut = spaceShortcutLabel(privateIdx);
            const privateCount = orderedPrivateSpaces.length;

            const controls = (
              <span className="flex flex-none items-center gap-[3px]">
                {shortcut && (
                  <span className="flex-none rounded-[5px] border border-[color:var(--border)] bg-[var(--bg)] px-[5px] py-px text-[0.6563rem] font-bold tracking-[.01em] text-[var(--text-dim)] opacity-75">
                    {shortcut}
                  </span>
                )}
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
                {privateCount > 1 && (
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
            );

            return renderSpaceItem(space, globalIdx, controls);
          })}

          {/* ── Divider ── */}
          <div className="my-1.5 mx-0.5 h-px bg-[var(--border)]" />

          {/* ── Section: Space chung ── */}
          <SectionHeader
            label="Space chung"
            onAdd={handleCreateSharedSpace}
            addTitle="Tạo space chung"
          />

          {orderedSharedSpaces.length === 0 ? (
            <div className="px-2 py-1.5 text-[0.75rem] text-[var(--text-dim)] italic">
              Chưa có space chung nào
            </div>
          ) : (
            orderedSharedSpaces.map((space) => {
              const globalIdx = orderedSpaces.findIndex((s) => s.id === space.id);

              const controls = (
                <span className="flex flex-none items-center gap-[3px]">
                  <button
                    className="icon-btn opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    title="Mời thành viên"
                    aria-label="Mời thành viên"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      setInviteModalSpaceId(space.id);
                    }}
                  >
                    <UserPlus className="icon" size={13} />
                  </button>
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
                </span>
              );

              return renderSpaceItem(space, globalIdx, controls);
            })
          )}

          {/* Padding cuối dropdown */}
          <div className="h-1" />
        </div>
      )}

      {formSpace && (
        <SpaceFormModal space={formSpace === 'new' ? null : formSpace} onClose={() => setFormSpace(null)} />
      )}

      {showSharedForm && (
        <SharedSpaceFormModal
          onClose={() => setShowSharedForm(false)}
          onCreated={(space) => {
            dispatch({ type: 'SPACE_ADD_SHARED', payload: { space } });
            setShowSharedForm(false);
            setInviteModalSpaceId(space.id);
          }}
        />
      )}

      {inviteModalSpaceId && (() => {
        const space = state.spaces.find((s) => s.id === inviteModalSpaceId);
        if (!space) return null;
        return (
          <SpaceInviteModal
            spaceId={inviteModalSpaceId}
            spaceName={space.name}
            onClose={() => setInviteModalSpaceId(null)}
          />
        );
      })()}
    </div>
  );
}
