import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ScrollText, SendHorizontal } from 'lucide-react';
import { useAppState, useCurrentSpace } from '../state/AppStateContext';
import { useCurrentUserId } from '../state/useCurrentUserId';
import { useSpaceMembers } from '../state/useSpaceMembers';
import { getMemberColor, getMemberDisplayName } from '../utils/memberColors';
import { formatBubbleTime } from '../utils/formatTime';
import { MemberAvatar } from '../components/MemberAvatar';

type ChatBubble =
  | { id: string; type: 'task'; title: string; done: boolean; createdBy?: string; createdAt?: string }
  | { id: string; type: 'note'; title: string; createdBy?: string; createdAt?: string }
  | { id: string; type: 'log'; content: string; createdBy?: string; createdAt: string };

export function MobileChatScreen() {
  const { dispatch } = useAppState();
  const space = useCurrentSpace();
  const currentUserId = useCurrentUserId();
  const members = useSpaceMembers(space.isShared ? space.sharedSpaceId : undefined);
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Merge task + note + log từ space, sort theo `createdAt` (KHÔNG dùng `order` như trước —
  // `LogEntry` không có field `order`, chỉ có `createdAt`, xem nhat-ky-nhanh.md mục 5.2.1).
  // So sánh chuỗi ISO tăng dần → cũ nhất đứng đầu mảng, mới nhất cuối mảng (hiện cũ→mới, mới
  // nhất dưới cùng, đúng hành vi cũ). Item thiếu `createdAt` (dữ liệu cũ) coi như cũ nhất.
  const bubbles = useMemo<ChatBubble[]>(() => {
    const all = [
      ...space.tasks.slice(0, 30).map((t) => ({ ...t, _type: 'task' as const })),
      ...space.notes.slice(0, 30).map((n) => ({ ...n, _type: 'note' as const })),
      ...space.logs.slice(0, 30).map((l) => ({ ...l, _type: 'log' as const })),
    ]
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
      .slice(0, 75); // tăng từ 50 → 75 (nhat-ky-nhanh.md mục 6.5, đủ chỗ cho 30 task+30 note+30 log)

    return all.map((item) => {
      if (item._type === 'task') {
        return { id: item.id, type: 'task', title: item.title, done: item.done, createdBy: item.createdBy, createdAt: item.createdAt } satisfies ChatBubble;
      }
      if (item._type === 'note') {
        return { id: item.id, type: 'note', title: item.title, createdBy: item.createdBy, createdAt: item.createdAt } satisfies ChatBubble;
      }
      return { id: item.id, type: 'log', content: item.content, createdBy: item.createdBy, createdAt: item.createdAt } satisfies ChatBubble;
    });
  }, [space.tasks, space.notes, space.logs]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles.length]);

  useLayoutEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function onViewportResize() {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
    vv.addEventListener('resize', onViewportResize);
    return () => vv.removeEventListener('resize', onViewportResize);
  }, []);

  // Cơ chế tiền tố (thay cho segmented picker cũ, theo yêu cầu đổi ngược của chủ dự án
  // 2026-07-07 — xem docs/features/nhat-ky-nhanh-progress.md mục Phần 3):
  // - Gõ trơn (không tiền tố) + Enter → mặc định tạo LOG (KHÁC bản gốc trước Nhật ký nhanh,
  //   lúc đó gõ trơn tạo Task).
  // - "/task " → tạo Task (tiền tố MỚI, trước đây gõ trơn mới ra Task).
  // - "/note " → tạo Note (giữ nguyên như bản gốc).
  function handleSubmit() {
    const raw = text.trim();
    if (!raw) return;

    const createdBy = currentUserId ?? undefined;
    if (raw.startsWith('/task')) {
      const title = raw.slice('/task'.length).trim();
      if (!title) return;
      dispatch({ type: 'TASK_CREATE', payload: { title, content: '', date: '', time: '', createdBy } });
    } else if (raw.startsWith('/note')) {
      const title = raw.slice('/note'.length).trim();
      if (!title) return;
      dispatch({ type: 'NOTE_CREATE', payload: { title, content: '', color: '', createdBy } });
    } else {
      dispatch({ type: 'LOG_CREATE', payload: { content: raw, createdBy } });
    }
    setText('');
  }

  // Highlight viền ô nhập theo tiền tố đang gõ (live, giống cơ chế `isNoteMode` ở bản gốc) —
  // gõ trơn (mặc định Log) giữ viền trung tính, chỉ đổi màu khi phát hiện tiền tố rõ ràng.
  const trimmedStart = text.trimStart();
  const isTaskMode = trimmedStart.startsWith('/task');
  const isNoteMode = trimmedStart.startsWith('/note');

  // Trong shared space: phân biệt bubble của mình (phải) vs người khác (trái).
  // Nếu createdBy trống → coi là của mình (data cũ, graceful fallback).
  const isShared = !!space.isShared;

  function isMine(bubble: ChatBubble): boolean {
    if (!isShared) return true;
    if (!bubble.createdBy || !currentUserId) return true;
    return bubble.createdBy === currentUserId;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex-1" />
        {bubbles.length === 0 ? (
          <div className="py-2 text-center text-[0.875rem] text-[var(--text-dim)] opacity-70">
            Gõ 1 dòng để ghi log nhanh — hoặc &quot;/task &quot; để tạo việc, &quot;/note &quot; để ghi chú.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {bubbles.map((b, idx) => {
              const mine = isMine(b);
              const prevBubble = bubbles[idx - 1];
              const samePersonAsPrev = prevBubble && !isMine(prevBubble) && !mine && prevBubble.createdBy === b.createdBy;
              // Không cắt cứng theo ký tự — chip tên bên dưới tự ellipsis bằng CSS theo chỗ trống thật.
              const memberName = (!mine && b.createdBy) ? getMemberDisplayName(b.createdBy, members, Infinity) : '';
              const memberColor = (!mine && b.createdBy) ? getMemberColor(b.createdBy, members) : '';

              return (
                <div key={b.id} className={`flex items-end gap-1.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                  {/* Avatar bên trái cho bubble người khác */}
                  {!mine && (
                    <div className="flex-none" style={{ width: 24 }}>
                      {!samePersonAsPrev && memberColor && (
                        <MemberAvatar name={memberName} color={memberColor} size={24} />
                      )}
                    </div>
                  )}

                  <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'} max-w-[80%]`}>
                    {/* Tên người gửi (chỉ bubble đầu trong cụm) — chip nền ĐẶC nhỏ (không xuyên
                        thấu ảnh) để luôn đọc được, dù span này nằm ngoài bubble chính. */}
                    {!mine && !samePersonAsPrev && memberName && (
                      <span
                        className="mb-0.5 max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded px-1.5 py-0.5 text-[0.75rem] font-semibold"
                        style={{
                          color: memberColor || 'var(--text-dim)',
                          background: `color-mix(in srgb, ${memberColor || 'var(--text-dim)'} 14%, var(--raised))`,
                        }}
                        title={memberName}
                      >
                        {memberName}
                      </span>
                    )}

                    {/* Bubble content — nền ĐẶC (không blur/xuyên thấu), pastel theo màu member,
                        giống chuẩn Messenger/Zalo: ảnh nền chỉ lộ ra ở khoảng trống giữa các bubble. */}
                    {b.type === 'log' ? (
                      // Log: style trung tính riêng biệt — dùng CHUNG cho cả mình lẫn người khác
                      // (khác Task/Note tô đặc theo accent/note-color/member), viền dashed +
                      // nền --raised, icon ScrollText (nhat-ky-nhanh.md mục 5.2.1).
                      <div
                        className="flex items-center gap-2 rounded-2xl border border-dashed border-[color:var(--border)]
                          bg-[var(--raised)] px-3.5 py-2.5 text-[0.875rem] text-[var(--text)]"
                      >
                        <ScrollText className="icon h-3.5 w-3.5 flex-none text-[var(--text-dim)]" size={14} />
                        <span>{b.content}</span>
                      </div>
                    ) : mine ? (
                      <div
                        className={`flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[0.875rem] text-white ${
                          b.type === 'note' ? 'bg-[var(--note-color)]' : 'bg-[var(--accent)]'
                        } ${b.type === 'task' && b.done ? 'opacity-60' : ''}`}
                      >
                        {b.type === 'note' && <BookOpen className="icon h-3.5 w-3.5 flex-none" size={14} />}
                        {b.type === 'task' && b.done && <Check className="icon h-3.5 w-3.5 flex-none" size={14} />}
                        <span className={b.type === 'task' && b.done ? 'line-through' : ''}>{b.title}</span>
                      </div>
                    ) : (
                      <div
                        className={`flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-[0.875rem] text-[var(--text)] ${
                          b.type === 'task' && b.done ? 'opacity-60' : ''
                        }`}
                        style={{
                          borderColor: memberColor || 'var(--border)',
                          background: `color-mix(in srgb, ${memberColor || 'var(--text-dim)'} 20%, var(--raised))`,
                        }}
                      >
                        {b.type === 'note' && (
                          <BookOpen className="icon h-3.5 w-3.5 flex-none text-[var(--text-dim)]" size={14} />
                        )}
                        {b.type === 'task' && b.done && (
                          <Check className="icon h-3.5 w-3.5 flex-none text-[var(--text-dim)]" size={14} />
                        )}
                        <span className={b.type === 'task' && b.done ? 'line-through text-[var(--text-dim)]' : ''}>
                          {b.title}
                        </span>
                      </div>
                    )}

                    {/* Giờ gửi — chip nền ĐẶC nhỏ như tên, bỏ qua nếu item cũ chưa có createdAt */}
                    {formatBubbleTime(b.createdAt) && (
                      <span
                        className="mt-0.5 rounded px-1.5 py-0.5 text-[0.6875rem] font-medium"
                        style={{
                          color: !mine && memberColor ? memberColor : 'var(--text-dim)',
                          background: 'color-mix(in srgb, var(--raised) 92%, transparent)',
                        }}
                      >
                        {formatBubbleTime(b.createdAt)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex flex-none items-center gap-2 border-t border-[color:var(--border-hairline)] px-3 py-2.5">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder='Gõ 1 dòng log, hoặc "/task " để tạo việc, "/note " để ghi chú'
          className={`min-w-0 flex-1 rounded-full border bg-[var(--raised)] px-4 py-2.5 text-[16px] text-[var(--text)]
            transition-[border-color] duration-150 focus:outline-none ${
              isNoteMode
                ? 'border-[var(--note-color)] focus:border-[var(--note-color)]'
                : isTaskMode
                  ? 'border-[color:var(--accent)] focus:border-[color:var(--accent)]'
                  : 'border-[color:var(--border)] focus:border-[color:var(--accent)]'
            }`}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleSubmit}
          disabled={!text.trim()}
          title="Gửi"
          aria-label="Gửi"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[var(--accent)] text-white
            transition-opacity duration-150 disabled:opacity-40"
        >
          <SendHorizontal className="icon h-4 w-4" size={16} />
        </button>
      </div>
    </div>
  );
}
