import { useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, ChevronUp, Pencil, Plus, Share2, Trash2, UserPlus } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { SpaceFormModal } from './SpaceFormModal';
import { SharedSpaceFormModal } from './SharedSpaceFormModal';
import { SpaceInviteModal } from './SpaceInviteModal';
import { NOTE_PALETTE } from '../../state/reducers/notes';
import { spaceShortcutLabel } from './spaceShortcuts';
import { useSpaceMembers } from '../../state/useSpaceMembers';
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
// SpaceMenuItem — 1 dòng space trong dropdown (private hoặc shared)
// ---------------------------------------------------------------------------
function SpaceMenuItem({
  space,
  globalIdx,
  isActive,
  today,
  extraControls,
  onSelect,
}: {
  space: Space;
  globalIdx: number;
  isActive: boolean;
  today: string;
  extraControls?: React.ReactNode;
  onSelect: () => void;
}) {
  const members = useSpaceMembers(space.isShared ? space.sharedSpaceId : undefined);
  const taskCount = space.tasks.filter((t) => t.date === today && !t.done).length;
  const noteCount = space.notes.length;

  // Toạ độ lúc touchstart — dùng để phân biệt "chạm để chọn" với "vuốt để scroll" list. Trước đây
  // onTouchEnd chọn space bất kể ngón tay đã di chuyển bao xa, nên vuốt scroll qua item nào cũng
  // vô tình chọn luôn space đó, rất khó cuộn danh sách trên mobile.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const TAP_MOVE_THRESHOLD = 10; // px

  return (
    <div
      role="button"
      tabIndex={0}
      className={`space-menu-item group items-start ${isActive ? 'active' : ''}`}
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchStartRef.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        const start = touchStartRef.current;
        const end = e.changedTouches[0];
        touchStartRef.current = null;
        if (start && end) {
          const dx = Math.abs(end.clientX - start.x);
          const dy = Math.abs(end.clientY - start.y);
          if (dx > TAP_MOVE_THRESHOLD || dy > TAP_MOVE_THRESHOLD) return; // vừa vuốt/scroll, không phải tap
        }
        e.preventDefault();
        onSelect();
      }}
      onClick={onSelect}
    >
      {space.isShared ? (
        <Share2 className="icon mt-[3px] h-3 w-3 flex-none text-[var(--accent)]" size={12} />
      ) : (
        <span
          className="mt-[7px] h-2 w-2 flex-none rounded-full"
          aria-hidden="true"
          style={{ background: spaceDotColor(globalIdx) }}
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-px py-px">
        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{space.name}</span>
        {space.isShared ? (
          <span className="text-[0.6875rem] font-medium leading-snug text-[var(--text-dim)] opacity-[.85]">
            {taskCount} việc hôm nay · {noteCount} note · {members.length} thành viên
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

// ---------------------------------------------------------------------------
// SpaceSwitcher
// ---------------------------------------------------------------------------
interface SpaceSwitcherProps {
  /** Truyền từ DashboardCorner — mobile compact bar có gap thật 8px với khối dưới (từ `py-2`
   * của accordion), khác 12px (`gap-3`) của desktop free-layout. Dùng lại đúng tín hiệu
   * DashboardCorner đã tính sẵn, không tự gọi `useMobileLayout()` riêng (tránh 2 instance hook
   * lệch pha do hysteresis nội bộ mỗi hook độc lập). */
  compact?: boolean;
  /** Truyền từ `DashboardCornerNav` khi hàng nav nổi trực tiếp trên ảnh nền (desktop
   * DashboardCornerBlock) — đổi trigger sang "ghost control" cùng bảng token với 2 nút
   * Home/Settings (xem `DashboardCornerNavProps.onPhoto`), trừ 2 khác biệt: (1) không scale() khi
   * hover vì đây là thanh ngang rộng `w-full`, scale gây giật layout; (2) giữ nền sáng khi popover
   * đang mở (`aria-expanded`), không tắt ngay khi rời chuột. */
  onPhoto?: boolean;
}

export function SpaceSwitcher({ compact, onPhoto }: SpaceSwitcherProps) {
  const { state, dispatch } = useAppState();
  const showConfirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [formSpace, setFormSpace] = useState<Space | null | 'new'>(null);
  const [showSharedForm, setShowSharedForm] = useState(false);
  const [inviteModalSpaceId, setInviteModalSpaceId] = useState<string | null>(null);
  // Virtual anchor cho Popover: đo trực tiếp hàng nav (Home + switcher + Settings) mỗi lần Radix
  // cần định vị lại — không lưu rect tĩnh nên luôn đúng dù layout đổi (resize, kéo-thả khối).
  // SpaceSwitcher không có ref sẵn tới div cha đó nên tra qua id.
  // Ưu tiên #dashboard-corner-nav (chỉ đúng hàng nav, bên trong DashboardCornerBlock.tsx trên
  // desktop — khối gộp 2 hàng nav+ambient, xem docs/requirements.md mục 4.1). Fallback
  // #dashboard-corner cho thanh compact mobile (DashboardCorner.tsx) — nơi đó chỉ có 1 hàng nav
  // nên id đó vẫn đúng, không có id -nav riêng.
  const cornerAnchorRef = useRef({
    getBoundingClientRect: () =>
      (document.getElementById('dashboard-corner-nav') ?? document.getElementById('dashboard-corner'))
        ?.getBoundingClientRect() ?? new DOMRect(),
  });

  const currentSpace = state.spaces.find((s) => s.id === state.currentSpaceId);

  // Tất cả spaces đã sort theo order — dùng để tính dot màu (index toàn cục)
  const orderedSpaces = [...state.spaces].sort((a, b) => a.order - b.order);
  const currentIdx = orderedSpaces.findIndex((s) => s.id === state.currentSpaceId);

  // Tách 2 section
  const orderedPrivateSpaces = orderedSpaces.filter((s) => !s.isShared);
  const orderedSharedSpaces = orderedSpaces.filter((s) => s.isShared);

  const today = todayStr();

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
    return (
      <SpaceMenuItem
        key={space.id}
        space={space}
        globalIdx={globalIdx}
        isActive={space.id === state.currentSpaceId}
        today={today}
        extraControls={extraControls}
        onSelect={() => {
          dispatch({ type: 'SPACE_SWITCH', payload: { id: space.id } });
          setOpen(false);
        }}
      />
    );
  }

  return (
    <div className="min-w-0">
      <Popover.Root open={open} onOpenChange={setOpen}>
        {/* Anchor "ảo" trỏ tới hàng nav (Home + switcher + Settings) — dropdown cần khớp độ rộng cả
            hàng nav này, không chỉ riêng nút trigger hẹp hơn bên trong. */}
        <Popover.Anchor virtualRef={cornerAnchorRef} />
        <Popover.Trigger asChild>
          <button
            className={
              onPhoto
                ? `flex w-full max-w-[200px] items-center justify-center gap-1.5 rounded-[10px] bg-transparent px-3 py-[7px]
                   text-[0.8125rem] font-semibold text-white outline-none
                   transition-[background-color] duration-150 [transition-timing-function:var(--ease-standard)]
                   hover:bg-[rgba(0,0,0,.22)] hover:[backdrop-filter:blur(6px)_saturate(1.1)]
                   active:bg-[rgba(0,0,0,.30)]
                   aria-expanded:bg-[rgba(0,0,0,.22)] aria-expanded:[backdrop-filter:blur(6px)_saturate(1.1)]
                   focus-visible:bg-[rgba(0,0,0,.22)] focus-visible:[backdrop-filter:blur(6px)_saturate(1.1)]
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgba(255,255,255,.92)]
                   focus-visible:shadow-[0_0_0_4px_rgba(0,0,0,.28)]
                   max-sm:[&_span]:inline-block max-sm:[&_span]:max-w-[90px] max-sm:[&_span]:overflow-hidden
                   max-sm:[&_span]:text-ellipsis max-sm:[&_span]:whitespace-nowrap`
                : `flex w-full max-w-[200px] items-center justify-center gap-1.5 rounded-[9px] border border-[color:var(--border)] bg-[var(--raised)]
                   px-3 py-[7px] text-[0.8125rem] font-semibold text-[var(--text)] transition-[border-color,color] duration-150
                   hover:border-[color:var(--accent)] hover:text-[var(--accent)] max-sm:[&_span]:inline-block max-sm:[&_span]:max-w-[90px]
                   max-sm:[&_span]:overflow-hidden max-sm:[&_span]:text-ellipsis max-sm:[&_span]:whitespace-nowrap`
            }
            title="Đổi space"
            aria-label="Đổi space hiện tại"
            aria-haspopup="true"
            aria-expanded={open}
          >
            {currentSpace?.isShared ? (
              <Share2
                className={`icon h-3 w-3 flex-none text-[var(--accent)] ${onPhoto ? '[filter:drop-shadow(0_1px_1px_rgba(0,0,0,.65))_drop-shadow(0_2px_5px_rgba(0,0,0,.35))]' : ''}`}
                size={12}
                aria-hidden="true"
              />
            ) : (
              <span
                className={`h-2 w-2 flex-none rounded-full ${onPhoto ? '[filter:drop-shadow(0_1px_1px_rgba(0,0,0,.65))_drop-shadow(0_2px_5px_rgba(0,0,0,.35))]' : ''}`}
                aria-hidden="true"
                style={{ background: spaceDotColor(currentIdx) }}
              />
            )}
            <span
              id="space-switcher-label"
              className={
                onPhoto
                  ? 'overflow-hidden text-ellipsis whitespace-nowrap [text-shadow:0_1px_1px_rgba(0,0,0,.65),0_2px_5px_rgba(0,0,0,.35)]'
                  : 'overflow-hidden text-ellipsis whitespace-nowrap'
              }
            >
              {currentSpace?.name ?? ''}
            </span>
            <ChevronDown
              className={`icon h-3 w-3 ${onPhoto ? 'text-[rgba(255,255,255,.75)] [filter:drop-shadow(0_1px_1px_rgba(0,0,0,.65))_drop-shadow(0_2px_5px_rgba(0,0,0,.35))]' : 'text-[var(--text-dim)]'}`}
              size={12}
            />
          </button>
        </Popover.Trigger>

        <Popover.Portal>
          {/* align="start" (không phải "center") — đã test thật bằng Playwright + đo getBoundingClientRect:
              "center" kết hợp width tính động qua var(--radix-popover-trigger-width) bị lệch đúng bằng
              1/2 chiều rộng content trong bản Radix Popover 1.1.19 đang dùng (bug định vị, không phải do
              CSS class cũ) — "start" luôn khớp chính xác content.left === trigger.left bất kể width.
              Không dùng alignOffset âm để giả lập "tràn 2 bên" nữa (cũng bị bug tương tự, alignOffset âm
              không có tác dụng trong bản này) — thay bằng min-width 240px, neo trái theo trigger. */}
          <Popover.Content
            align="start"
            sideOffset={compact ? 8 : 12}
            collisionPadding={8}
            className="space-menu-surface"
            style={{ width: 'var(--radix-popover-trigger-width)' }}
          >
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
                {/* up/down ẩn trên mobile — kéo thả không khả thi trên touch */}
                <span className="mr-0.5 flex flex-none flex-col gap-px max-md:hidden">
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
                  className="icon-btn opacity-0 transition-opacity duration-150 group-hover:opacity-100 max-md:opacity-100"
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
                    className="icon-btn opacity-0 transition-opacity duration-150 group-hover:opacity-100 max-md:opacity-100"
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
                    className="icon-btn opacity-0 transition-opacity duration-150 group-hover:opacity-100 max-md:opacity-100"
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
                    className="icon-btn opacity-0 transition-opacity duration-150 group-hover:opacity-100 max-md:opacity-100"
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
                    className="icon-btn opacity-0 transition-opacity duration-150 group-hover:opacity-100 max-md:opacity-100"
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
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

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
