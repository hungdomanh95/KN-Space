import { useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import * as Checkbox from '@radix-ui/react-checkbox';
import { Check, ChevronDown, ChevronRight, FileText, Search, UserPlus } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { DatePicker } from '../../components/DatePicker';
import { TimePicker } from '../../components/TimePicker';
import { MemberAvatar } from '../../components/MemberAvatar';
import { useAppState } from '../../state/AppStateContext';
import { useCurrentUserId } from '../../state/useCurrentUserId';
import { useCurrentSpace } from '../../state/AppStateContext';
import { useSpaceMembers } from '../../state/useSpaceMembers';
import { useMediaQuery } from '../../layout/useMediaQuery';
import { getMemberColor, getMemberDisplayName } from '../../utils/memberColors';
import type { SharedSpaceMember, Task } from '../../types';

interface TaskFormModalProps {
  task: Task | null; // null = tạo mới
  onClose: () => void;
}

// Số avatar tối đa hiển thị chồng lấn trên nút trigger trước khi rút gọn "+N" — cố định 4 ở mọi
// breakpoint theo bảng spec mục 5.1.A (khác số 3/2 dùng cho cụm avatar trên TaskRow, mục 5.2).
const TRIGGER_MAX_AVATARS = 4;

/** 1 avatar trong cụm chồng lấn (avatar-stack) trên nút trigger — viền `2px solid var(--modal-bg)`
 * mô phỏng qua box-shadow (không đổi kích thước layout như border thật) để tạo hiệu ứng "cắt lớp"
 * kiểu ClickUp/Trello mà không cần sửa `MemberAvatar` (giữ component đó đơn giản như hiện tại). */
function StackedAvatar({ name, color, size, isFirst }: { name: string; color: string; size: number; isFirst: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        borderRadius: '50%',
        boxShadow: '0 0 0 2px var(--modal-bg)',
        marginLeft: isFirst ? 0 : -6,
      }}
    >
      <MemberAvatar name={name} color={color} size={size} />
    </span>
  );
}

/** 1 dòng member trong popover — checkbox tuỳ biến (Radix) + avatar + tên, toàn bộ hàng click được
 * (label bọc Checkbox.Root là 1 `<button>` — labelable element, browser tự forward click). */
function AssigneeMemberRow({
  member,
  members,
  checked,
  isMobile,
  isCurrentUser,
  onToggle,
}: {
  member: SharedSpaceMember;
  members: SharedSpaceMember[];
  checked: boolean;
  isMobile: boolean;
  isCurrentUser: boolean;
  onToggle: () => void;
}) {
  const name = getMemberDisplayName(member.userId, members, 40);
  return (
    <label
      className="flex min-h-[32px] cursor-pointer items-center gap-2 rounded-[8px] px-1.5 py-1 text-[0.875rem]
        max-md:min-h-[44px] max-md:-mx-1 max-md:rounded-[8px] max-md:px-1 max-md:py-2 max-md:active:bg-[var(--raised)]"
    >
      <Checkbox.Root
        checked={checked}
        onCheckedChange={onToggle}
        className="flex h-4 w-4 flex-none items-center justify-center rounded-[5px] border-solid border-[1.5px]
          border-[color:var(--border-control)] transition-colors duration-150 data-[state=checked]:border-[var(--accent)]
          data-[state=checked]:bg-[var(--accent)] max-md:h-5 max-md:w-5"
      >
        <Checkbox.Indicator>
          <Check className="icon text-white max-md:!h-[13px] max-md:!w-[13px]" size={10} strokeWidth={3} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <MemberAvatar name={name} color={getMemberColor(member.userId, members)} size={isMobile ? 22 : 18} />
      <span className="min-w-0 flex-1 truncate">
        {name}
        {isCurrentUser ? ' (bạn)' : ''}
      </span>
    </label>
  );
}

/** Assignee Picker dạng popover (mục 5.1, `docs/features/shared-space-task-assign-notify.md`) —
 * dùng `@radix-ui/react-popover` cho khung mở/đóng/flip/focus-return/Escape/click-ngoài, xem quyết
 * định thư viện ở `docs/plan/ui-primitive-library-decision.md`. */
function AssigneePicker({
  members,
  assigneeIds,
  toggleAssignee,
  toggleSelectAll,
  currentUserId,
  isMobile,
}: {
  members: SharedSpaceMember[];
  assigneeIds: string[];
  toggleAssignee: (userId: string) => void;
  toggleSelectAll: () => void;
  currentUserId: string | null;
  isMobile: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const showSearch = members.length > 6;
  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => getMemberDisplayName(m.userId, members, Infinity).toLowerCase().includes(q));
  }, [members, query]);

  const allSelected = members.length > 0 && members.every((m) => assigneeIds.includes(m.userId));

  const selectedMembers = members.filter((m) => assigneeIds.includes(m.userId));
  const fullNames = selectedMembers.map((m) => getMemberDisplayName(m.userId, members, Infinity)).join(', ');
  const triggerLabel = assigneeIds.length === 0 ? 'Giao cho (chưa chọn ai)' : `Giao cho: ${fullNames}`;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery('');
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          title={triggerLabel}
          aria-label={triggerLabel}
          className="inline-flex h-[34px] items-center gap-2 rounded-[10px] border-[1.5px] border-[color:var(--border)]
            bg-[var(--raised)] px-3 text-[0.875rem] font-medium text-[var(--text)] transition-[border-color,color]
            duration-150 hover:border-[color:var(--accent)] hover:text-[var(--accent)]
            max-md:flex max-md:h-[40px] max-md:w-full max-md:justify-between"
        >
          {assigneeIds.length === 0 ? (
            <>
              <UserPlus className="icon flex-none" size={isMobile ? 18 : 16} />
              <span>+ Giao cho</span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center">
                {selectedMembers.slice(0, TRIGGER_MAX_AVATARS).map((m, i) => (
                  <StackedAvatar
                    key={m.userId}
                    name={getMemberDisplayName(m.userId, members, 40)}
                    color={getMemberColor(m.userId, members)}
                    size={isMobile ? 22 : 20}
                    isFirst={i === 0}
                  />
                ))}
              </span>
              {selectedMembers.length > TRIGGER_MAX_AVATARS && (
                <span className="text-[0.8125rem] font-semibold text-[var(--text-dim)]">
                  +{selectedMembers.length - TRIGGER_MAX_AVATARS}
                </span>
              )}
              <ChevronDown className="icon flex-none text-[var(--text-dim)]" size={12} />
            </>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          collisionPadding={8}
          className="z-[70] rounded-xl border border-[color:var(--border)] bg-[var(--modal-bg)] p-2
            shadow-[0_14px_40px_rgba(0,0,0,.18)] animate-fadeInPop"
          style={isMobile ? { width: 'var(--radix-popover-trigger-width)' } : { minWidth: 260, maxWidth: 320 }}
        >
          {showSearch && (
            <div className="relative mb-1.5">
              <Search className="icon pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" size={14} />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm thành viên..."
                className="w-full rounded-[8px] border border-[color:var(--border)] bg-[var(--raised)] py-1.5 pl-7 pr-2
                  text-[0.8438rem] text-[var(--text)]"
              />
            </div>
          )}
          <button
            type="button"
            className="btn-ghost mb-1.5 w-full !py-1 text-[0.8125rem]"
            onClick={toggleSelectAll}
          >
            {allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          </button>
          <div className="max-h-[224px] overflow-y-auto">
            {filteredMembers.length === 0 ? (
              <p className="px-1 py-3 text-center text-[0.8125rem] italic text-[var(--text-dim)]">
                Không tìm thấy thành viên phù hợp
              </p>
            ) : (
              filteredMembers.map((m) => (
                <AssigneeMemberRow
                  key={m.userId}
                  member={m}
                  members={members}
                  checked={assigneeIds.includes(m.userId)}
                  isMobile={isMobile}
                  isCurrentUser={m.userId === currentUserId}
                  onToggle={() => toggleAssignee(m.userId)}
                />
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function TaskFormModal({ task, onClose }: TaskFormModalProps) {
  const { dispatch } = useAppState();
  const space = useCurrentSpace();
  const currentUserId = useCurrentUserId();
  const members = useSpaceMembers(space.isShared ? space.sharedSpaceId : undefined);
  const isMobile = useMediaQuery('(max-width: 639px)');
  const [title, setTitle] = useState(task?.title ?? '');
  const [content, setContent] = useState(task?.content ?? '');
  const [date, setDate] = useState(task?.date ?? '');
  const [time, setTime] = useState(task?.time ?? '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assigneeIds ?? []);

  // Field "Nội dung" dạng collapsible (mục 5.6) — mặc định đóng, trừ khi Sửa việc đã có sẵn
  // nội dung (mở sẵn để không "giấu" dữ liệu đã nhập trước đó).
  const [contentOpen, setContentOpen] = useState(() => content.trim().length > 0);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  // Chỉ autoFocus textarea khi user vừa tự bấm mở (đóng→mở bằng tay) — không áp dụng khi
  // contentOpen mặc định true lúc mount (tránh giật focus khỏi field "Tên việc" đang autoFocus).
  const autoFocusContentRef = useRef(false);

  useEffect(() => {
    if (contentOpen && autoFocusContentRef.current) {
      contentTextareaRef.current?.focus();
      autoFocusContentRef.current = false;
    }
  }, [contentOpen]);

  function handleToggleContent() {
    setContentOpen((prev) => {
      const next = !prev;
      if (next) autoFocusContentRef.current = true;
      return next;
    });
  }

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

  const trimmedContent = content.trim();

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
        <button
          type="button"
          aria-expanded={contentOpen}
          onClick={handleToggleContent}
          className="flex w-full items-center gap-1.5 rounded-[8px] px-1 py-2 text-left transition-colors
            duration-150 hover:bg-[var(--raised)] max-md:py-2.5"
        >
          {contentOpen ? (
            <ChevronDown
              className="icon flex-none text-[var(--text-dim)] transition-transform duration-150"
              size={isMobile ? 16 : 14}
            />
          ) : (
            <ChevronRight
              className="icon flex-none text-[var(--text-dim)] transition-transform duration-150"
              size={isMobile ? 16 : 14}
            />
          )}
          {contentOpen ? (
            <span className="text-[0.8438rem] font-semibold text-[var(--text-dim)]">Nội dung (tuỳ chọn)</span>
          ) : trimmedContent === '' ? (
            <span className="text-[0.8438rem] font-semibold text-[var(--accent)]">+ Thêm nội dung</span>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="flex-none text-[0.8438rem] font-semibold text-[var(--text-dim)]">
                Nội dung (tuỳ chọn)
              </span>
              <FileText className="icon flex-none text-[var(--text-dim)]" size={13} />
              <span className="min-w-0 flex-1 truncate text-[0.8438rem] text-[var(--text-dim)]">
                {content.split('\n')[0]}
              </span>
            </span>
          )}
        </button>
        {contentOpen && (
          <textarea
            ref={contentTextareaRef}
            className="note-content-field mt-1.5 animate-fadeInPop max-md:min-h-[120px]"
            value={content}
            placeholder="Vd: nội dung cần chuẩn bị, link tài liệu..."
            onChange={(e) => setContent(e.target.value)}
          />
        )}
      </div>
      <div className="field-row">
        <div className="field">
          <label>Ngày (tuỳ chọn)</label>
          <DatePicker value={date} onChange={setDate} />
        </div>
        <div className="field">
          <label>Giờ (tuỳ chọn)</label>
          <TimePicker value={time} onChange={setTime} />
        </div>
      </div>
      {space.isShared && members.length > 0 && (
        <div className="field">
          <AssigneePicker
            members={members}
            assigneeIds={assigneeIds}
            toggleAssignee={toggleAssignee}
            toggleSelectAll={toggleSelectAll}
            currentUserId={currentUserId}
            isMobile={isMobile}
          />
        </div>
      )}
      <div className="modal-actions sticky bottom-0 bg-[var(--modal-bg)] pt-2">
        <button className="btn-ghost" onClick={onClose}>
          Hủy
        </button>
        <button className="btn-primary" onClick={handleSave} disabled={!title.trim()}>
          Lưu
        </button>
      </div>
    </Modal>
  );
}
