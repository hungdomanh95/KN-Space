import React, { useRef, useState } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, ListChecks, Pencil, ScrollText, SendHorizontal, Settings2, Trash2, X } from 'lucide-react';
import { BlockShell } from '../../components/BlockShell';
import { DatePicker } from '../../components/DatePicker';
import { EmptyState } from '../../components/EmptyState';
import { useAppState, useCurrentSpace } from '../../state/AppStateContext';
import { useConfirm } from '../../components/ConfirmContext';
import { useCurrentUserId } from '../../state/useCurrentUserId';
import { useSpaceMembers } from '../../state/useSpaceMembers';
import { getMemberColor, getMemberDisplayName } from '../../utils/memberColors';
import { formatBubbleTime, formatHHmm } from '../../utils/formatTime';
import { ExpenseSummaryPanel } from './ExpenseSummaryPanel';
import { formatExpenseDateLabel, getLogExpenseDate, isLogBackdated, isOwnExpenseLog } from './expenseUtils';
import type { LogEntry } from '../../types';

type LogsViewMode = 'list' | 'summary';

interface LogsBlockProps {
  style?: React.CSSProperties;
  className?: string;
  rootRef?: React.Ref<HTMLDivElement>;
  draggable?: boolean;
  onMouseDownCapture?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement>) => void;
}

type LogSortBy = 'newest' | 'oldest';

const SORT_OPTIONS: { value: LogSortBy; label: string }[] = [
  { value: 'newest', label: 'Mới nhất' },
  { value: 'oldest', label: 'Cũ nhất' },
];

const LONG_PRESS_MS = 500;

/** Cắt chuỗi tối đa `maxLen` ký tự + "…" — cùng kiểu cắt dùng ở `getMemberDisplayName`. */
function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function sortLogsForDisplay(logs: LogEntry[], sortBy: LogSortBy): LogEntry[] {
  const sorted = [...logs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return sortBy === 'newest' ? sorted.reverse() : sorted;
}

interface LogRowProps {
  log: LogEntry;
  isSelecting: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onEnterSelectWith: (id: string) => void;
  onDelete: (log: LogEntry) => void;
  creatorName?: string;
  creatorColor?: string;
  isOwn: boolean;
  isEditingDate: boolean;
  onStartEditDate: (id: string) => void;
  onCommitDate: (id: string, date: string) => void;
  onCancelEditDate: () => void;
}

/** 1 dòng log — hairline row, không kéo-thả (Nhật ký nhanh luôn sort theo `createdAt`, mục 6.4).
 * Long-press (~500ms, chỉ cảm ứng) vào chế độ chọn nhiều + tự tick dòng vừa nhấn giữ (mục 5.3).
 *
 * Sửa ngày giao dịch inline (tính năng Quản lý chi tiêu, `docs/features/quan-ly-chi-tieu.md` mục
 * 5.1) — bấm bút chì mở `<DatePicker>` compact ngay tại chỗ (KHÔNG dùng modal). Khác mockup gốc
 * (input + nút xác nhận/huỷ riêng): tái dùng `DatePicker` sẵn có của app (đã thay hẳn
 * `<input type="date">` toàn dự án, xem comment trong `components/DatePicker.tsx`) — chọn ngày
 * trong lịch là hành động xác nhận luôn (tự lưu + tự đóng), không cần nút ✓ riêng; vẫn giữ nút ✕
 * để huỷ sửa mà không đổi gì. */
function LogRow({
  log,
  isSelecting,
  selected,
  onToggleSelect,
  onEnterSelectWith,
  onDelete,
  creatorName,
  creatorColor,
  isOwn,
  isEditingDate,
  onStartEditDate,
  onCommitDate,
  onCancelEditDate,
}: LogRowProps) {
  const pressTimer = useRef<number | null>(null);
  const suppressNextClick = useRef(false);

  function clearPressTimer() {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function handleTouchStart() {
    if (isSelecting) return; // đã ở chế độ chọn — long-press không còn ý nghĩa gì thêm
    suppressNextClick.current = false;
    pressTimer.current = window.setTimeout(() => {
      suppressNextClick.current = true;
      onEnterSelectWith(log.id);
    }, LONG_PRESS_MS);
  }

  function handleTouchEnd() {
    clearPressTimer();
  }

  function handleRowClick() {
    if (suppressNextClick.current) {
      // Click "ma" ngay sau touchend của long-press — bỏ qua đúng 1 lần để không toggle lại dòng
      // vừa được long-press tự tick.
      suppressNextClick.current = false;
      return;
    }
    if (isSelecting) onToggleSelect(log.id);
  }

  const truncatedForAria = truncate(log.content, 40);
  const backdated = isLogBackdated(log);
  const timeLabel = backdated
    ? `${formatExpenseDateLabel(getLogExpenseDate(log))} · ${formatHHmm(log.createdAt)}`
    : formatBubbleTime(log.createdAt);

  return (
    <div
      className={`group flex items-start gap-2.5 border-b border-[color:var(--border)] py-[9px] max-md:py-[13px] text-[0.875rem]
        transition-[background-color] duration-150 [transition-timing-function:var(--ease-standard)] last:border-b-0
        ${isSelecting ? 'cursor-pointer' : ''} ${selected ? 'bg-[rgba(var(--accent-rgb),.08)]' : ''}`.trim()}
      onClick={handleRowClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {isSelecting && (
        <Checkbox.Root
          checked={selected}
          onCheckedChange={() => onToggleSelect(log.id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-px flex h-[17px] w-[17px] flex-none cursor-pointer items-center justify-center rounded-[6px]
            border-solid border-[1.6px] bg-[var(--raised)] border-[color:var(--border-control)] transition-all duration-150
            max-md:h-[24px] max-md:w-[24px] max-md:rounded-[8px]
            data-[state=checked]:bg-[var(--accent)] data-[state=checked]:border-[color:var(--accent)]"
          aria-label={`Chọn log: "${truncatedForAria}"`}
        >
          <Checkbox.Indicator>
            <Check className="icon text-white max-md:!h-[15px] max-md:!w-[15px]" size={11} strokeWidth={3} />
          </Checkbox.Indicator>
        </Checkbox.Root>
      )}
      <span
        className={`mt-px flex-none rounded-md px-[7px] py-0.5 text-[0.75rem] font-semibold ${
          backdated
            ? 'bg-[color-mix(in_srgb,var(--amber)_14%,var(--raised))] text-[var(--amber)]'
            : 'bg-[var(--raised)] text-[var(--text-dim)]'
        }`}
        title={backdated ? 'Ngày giao dịch đã được sửa (khác ngày ghi log gốc)' : undefined}
      >
        {timeLabel}
      </span>
      <span className="line-clamp-2 flex-1 text-[0.875rem] text-[var(--text)]">{log.content}</span>
      {creatorName && (
        <span
          className="min-w-0 max-w-[45%] overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-[7px] py-0.5 text-[0.7188rem] font-semibold max-sm:hidden"
          style={{ color: creatorColor, background: `color-mix(in srgb, ${creatorColor} 14%, var(--raised))` }}
          title={creatorName}
        >
          {creatorName}
        </span>
      )}
      {!isSelecting && isEditingDate && (
        <span className="flex flex-none items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <span className="w-[132px]">
            <DatePicker value={getLogExpenseDate(log)} onChange={(v) => (v ? onCommitDate(log.id, v) : onCancelEditDate())} autoOpen />
          </span>
          <button className="icon-btn flex-none" title="Huỷ sửa ngày" aria-label="Huỷ sửa ngày" onClick={() => onCancelEditDate()}>
            <X className="icon" size={13} />
          </button>
        </span>
      )}
      {!isSelecting && !isEditingDate && (
        <span className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 max-md:opacity-100">
          {isOwn && (
            <button
              className="icon-btn flex-none"
              title="Sửa ngày giao dịch"
              aria-label={`Sửa ngày giao dịch cho log: "${truncatedForAria}"`}
              onClick={(e) => {
                e.stopPropagation();
                onStartEditDate(log.id);
              }}
            >
              <Pencil className="icon" size={13} />
            </button>
          )}
          <button
            className="icon-btn flex-none"
            title={`Xoá log: "${truncatedForAria}"`}
            aria-label={`Xoá log: "${truncatedForAria}"`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(log);
            }}
          >
            <Trash2 className="icon" size={13} />
          </button>
        </span>
      )}
    </div>
  );
}

export function LogsBlock({
  style,
  className,
  rootRef,
  draggable,
  onMouseDownCapture,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: LogsBlockProps) {
  const { state, dispatch } = useAppState();
  const space = useCurrentSpace();
  const showConfirm = useConfirm();
  const currentUserId = useCurrentUserId();
  const members = useSpaceMembers(space.isShared ? space.sharedSpaceId : undefined);

  const collapsed = state.settings.collapsedBlocks.logs;
  const [sortBy, setSortBy] = useState<LogSortBy>('newest');
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [composeText, setComposeText] = useState('');
  const composeInputRef = useRef<HTMLInputElement>(null);
  // Toggle Danh sách/Tổng hợp (docs/features/quan-ly-chi-tieu.md mục 3.2) — ephemeral, không persist.
  const [viewMode, setViewMode] = useState<LogsViewMode>('list');
  // Chỉ 1 dòng được sửa ngày cùng lúc — id log đang mở `<DatePicker>` inline (mục 5.1 tài liệu).
  const [editingDateId, setEditingDateId] = useState<string | null>(null);

  // Tự thoát chế độ chọn khi đổi Space (mục 5.3) — đổi tab mobile/thu gọn khối trong accordion
  // đã tự xử lý bằng cách khác: cả 2 sự kiện đó UNMOUNT hẳn LogsBlock trong AppLayout (xem
  // renderBlock('logs', ...) chỉ được gọi khi tab "Chi tiết" đang mở VÀ khối đang expanded),
  // nên state cục bộ này tự mất theo vòng đời component — không cần theo dõi thêm 2 dependency
  // đó ở đây (đơn giản hơn cách nêu ở nhat-ky-nhanh.md mục 5.3, cùng kết quả quan sát được).
  const spaceIdRef = useRef(space.id);
  if (spaceIdRef.current !== space.id) {
    spaceIdRef.current = space.id;
    if (isSelecting) {
      setIsSelecting(false);
      setSelectedIds(new Set());
    }
    if (editingDateId) setEditingDateId(null);
    // Space mới có thể không bật "Dùng để log chi tiêu" — tránh kẹt ở tab Tổng hợp cho Space
    // không có tab đó (nút đã bị ẩn khỏi segmented control, xem điều kiện render phía dưới).
    if (viewMode === 'summary') setViewMode('list');
  }

  const list = sortLogsForDisplay(space.logs, sortBy);

  function exitSelection() {
    setIsSelecting(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function enterSelectWith(id: string) {
    setIsSelecting(true);
    setSelectedIds(new Set([id]));
  }

  // Chuyển sang Tổng hợp thì thoát hẳn chế độ chọn/sửa ngày đang dở của Danh sách (2 chế độ
  // không có ý nghĩa cùng lúc — mục 3.2 tài liệu chỉ mô tả ẩn/hiện nội dung, phần này là quyết
  // định implementation hợp lý thêm của dev để tránh state kẹt lại khi quay về Danh sách).
  function handleSetViewMode(mode: LogsViewMode) {
    setViewMode(mode);
    if (mode === 'summary') {
      exitSelection();
      setEditingDateId(null);
    }
  }

  // Bật/tắt tab "Tổng hợp" theo Space (không phải Space nào cũng dùng Nhật ký nhanh để log chi
  // tiêu — xem docs/features/quan-ly-chi-tieu.md). Tự chuyển về "Danh sách" nếu đang tắt ngay lúc
  // đang xem Tổng hợp, vì tab đó sắp biến mất khỏi segmented control.
  function handleToggleExpenseTracking() {
    const next = !space.enabledBlocks.expenseTracking;
    dispatch({
      type: 'SPACE_SET_ENABLED_BLOCKS',
      payload: { id: space.id, enabledBlocks: { ...space.enabledBlocks, expenseTracking: next } },
    });
    if (!next && viewMode === 'summary') setViewMode('list');
  }

  function handleCommitDate(id: string, date: string) {
    dispatch({ type: 'LOG_PATCH_EXPENSE', payload: { id, expenseDate: date } });
    setEditingDateId(null);
  }

  function handleDeleteOne(log: LogEntry) {
    showConfirm('Xoá log này?', 'Xoá log này? Không thể hoàn tác.', () =>
      dispatch({ type: 'LOG_DELETE', payload: { id: log.id } }),
    );
  }

  function handleDeleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    showConfirm(
      `Xoá ${ids.length} log đã chọn?`,
      `Xoá ${ids.length} log đã chọn? Không thể hoàn tác.`,
      () => {
        dispatch({ type: 'LOG_DELETE_MANY', payload: { ids } });
        exitSelection();
      },
    );
  }

  // Ô nhập nhanh trên desktop (mục bổ sung sau phản hồi dùng thử — xem
  // docs/features/nhat-ky-nhanh-progress.md): CHỈ tạo Log, không có tiền tố /task /note
  // như ô chat mobile — giữ focus tại input sau khi gửi để gõ liên tục nhiều dòng.
  function handleComposeSubmit() {
    const raw = composeText.trim();
    if (!raw) return;
    dispatch({ type: 'LOG_CREATE', payload: { content: raw, createdBy: currentUserId ?? undefined } });
    setComposeText('');
    composeInputRef.current?.focus();
  }

  function getCreatorInfo(log: LogEntry): { name: string; color: string } | undefined {
    if (!space.isShared || !log.createdBy || log.createdBy === currentUserId) return undefined;
    // Không cắt cứng theo ký tự — badge dưới đây tự ellipsis bằng CSS theo chỗ trống thật của hàng.
    return { name: getMemberDisplayName(log.createdBy, members, Infinity), color: getMemberColor(log.createdBy, members) };
  }

  return (
    <BlockShell
      domId="block-logs"
      icon={ScrollText}
      iconBg="rgba(138,143,152,.14)"
      iconColor="var(--log-color)"
      title="Nhật ký nhanh"
      collapsed={collapsed}
      onToggleCollapsed={() => dispatch({ type: 'BLOCK_TOGGLE_COLLAPSED', payload: { key: 'logs' } })}
      style={style}
      className={`main-block max-sm:min-w-0 ${className ?? ''}`.trim()}
      rootRef={rootRef}
      draggable={draggable}
      onMouseDownCapture={onMouseDownCapture}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      headerActions={
        viewMode === 'summary' ? undefined : isSelecting ? (
          <>
            <span className="text-[0.8125rem] font-semibold text-[var(--text-dim)]">Đã chọn {selectedIds.size}</span>
            <button
              type="button"
              className="rounded-md px-1.5 py-1 text-[0.8438rem] font-semibold text-[var(--text-dim)] transition-colors duration-150 hover:text-[var(--accent)]"
              aria-label="Huỷ chế độ chọn"
              onClick={exitSelection}
            >
              Huỷ
            </button>
            <button
              type="button"
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[0.8438rem] font-semibold transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ color: 'var(--reminder-color)' }}
              disabled={selectedIds.size === 0}
              aria-disabled={selectedIds.size === 0}
              aria-label={`Xoá ${selectedIds.size} log đã chọn`}
              onClick={handleDeleteSelected}
            >
              <Trash2 className="icon" size={13} />
              Xoá ({selectedIds.size})
            </button>
          </>
        ) : (
          <>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] bg-[var(--raised)]
                    px-2.5 py-1.5 text-[0.7812rem] font-semibold text-[var(--text)] transition-[border-color,color] duration-150
                    hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
                >
                  <span>{SORT_OPTIONS.find((o) => o.value === sortBy)?.label}</span>
                  <ChevronDown className="icon h-[11px] w-[11px] text-[var(--text-dim)]" size={11} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={8} className="space-menu-surface" style={{ minWidth: 150 }}>
                  <DropdownMenu.RadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as LogSortBy)}>
                    {SORT_OPTIONS.map((o) => (
                      <DropdownMenu.RadioItem
                        key={o.value}
                        value={o.value}
                        className="space-menu-item data-[state=checked]:font-bold data-[state=checked]:text-[var(--accent)]"
                      >
                        <span className="overflow-hidden text-ellipsis whitespace-nowrap">{o.label}</span>
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <button className="add-link" onClick={() => setIsSelecting(true)}>
              <ListChecks className="icon" size={13} /> Chọn
            </button>
          </>
        )
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border-hairline)] px-4 py-2.5">
        <div className="segmented-options" role="group" aria-label="Chuyển chế độ hiển thị Nhật ký nhanh">
          <button type="button" className={viewMode === 'list' ? 'active' : ''} aria-pressed={viewMode === 'list'} onClick={() => handleSetViewMode('list')}>
            Danh sách
          </button>
          {space.enabledBlocks.expenseTracking && (
            <button type="button" className={viewMode === 'summary' ? 'active' : ''} aria-pressed={viewMode === 'summary'} onClick={() => handleSetViewMode('summary')}>
              Tổng hợp
            </button>
          )}
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Tuỳ chọn Nhật ký nhanh"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border)]
                bg-[var(--raised)] text-[var(--text-dim)] transition-[border-color,color] duration-150
                hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
            >
              <Settings2 className="icon" size={13} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={8} className="space-menu-surface" style={{ minWidth: 240 }}>
              <DropdownMenu.Item
                className="space-menu-item flex items-center justify-between gap-3"
                onSelect={(e) => {
                  e.preventDefault();
                  handleToggleExpenseTracking();
                }}
              >
                <span>Dùng Nhật ký để log chi tiêu</span>
                {space.enabledBlocks.expenseTracking && <Check className="icon shrink-0" size={13} />}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {viewMode === 'summary' ? (
        <div className="block-body">
          <ExpenseSummaryPanel logs={space.logs} members={members} currentUserId={currentUserId} />
        </div>
      ) : (
        <>
          <div className="logs-compose flex items-center gap-2 border-b border-[color:var(--border-hairline)] px-4 py-2.5 max-sm:hidden">
            <input
              ref={composeInputRef}
              type="text"
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleComposeSubmit();
              }}
              placeholder="Gõ 1 dòng log rồi nhấn Enter…"
              aria-label="Nội dung nhật ký mới"
              className="min-w-0 flex-1 rounded-lg border border-[color:var(--border)] bg-[var(--raised)] px-2.5
                py-1.5 text-[0.8125rem] text-[var(--text)] transition-[border-color] duration-150
                hover:border-[color:var(--accent)] focus:border-[color:var(--accent)] focus:outline-none"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleComposeSubmit}
              disabled={!composeText.trim()}
              aria-disabled={!composeText.trim()}
              title="Gửi log (Enter)"
              aria-label="Gửi log"
              className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-lg bg-[var(--accent)]
                text-white transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SendHorizontal className="icon h-3.5 w-3.5" size={14} />
            </button>
          </div>
          <div className="block-body">
            {list.length === 0 ? (
              <EmptyState
                icon={ScrollText}
                title="Chưa có log nào"
                hint="Nhập ở ô phía trên để ghi log (desktop), hoặc gõ nhanh qua tab Trò chuyện trên điện thoại."
              />
            ) : (
              list.map((log) => {
                const creator = getCreatorInfo(log);
                return (
                  <LogRow
                    key={log.id}
                    log={log}
                    isSelecting={isSelecting}
                    selected={selectedIds.has(log.id)}
                    onToggleSelect={toggleSelect}
                    onEnterSelectWith={enterSelectWith}
                    onDelete={handleDeleteOne}
                    creatorName={creator?.name}
                    creatorColor={creator?.color}
                    isOwn={isOwnExpenseLog(log, currentUserId)}
                    isEditingDate={editingDateId === log.id}
                    onStartEditDate={setEditingDateId}
                    onCommitDate={handleCommitDate}
                    onCancelEditDate={() => setEditingDateId(null)}
                  />
                );
              })
            )}
          </div>
        </>
      )}
    </BlockShell>
  );
}
