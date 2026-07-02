import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, SendHorizontal } from 'lucide-react';
import { useAppState, useCurrentSpace } from '../state/AppStateContext';
import { useCurrentUserId } from '../state/useCurrentUserId';
import { useSpaceMembers } from '../state/useSpaceMembers';
import { getMemberColor, getMemberDisplayName } from '../utils/memberColors';
import { MemberAvatar } from '../components/MemberAvatar';

type ChatBubble =
  | { id: string; type: 'task'; title: string; done: boolean; createdBy?: string }
  | { id: string; type: 'note'; title: string; createdBy?: string };

export function MobileChatScreen() {
  const { dispatch } = useAppState();
  const space = useCurrentSpace();
  const currentUserId = useCurrentUserId();
  const members = useSpaceMembers(space.isShared ? space.sharedSpaceId : undefined);
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Merge task + note từ space, sort theo order (lớn = cũ hơn → hiện cũ→mới, mới nhất dưới cùng).
  const bubbles = useMemo<ChatBubble[]>(() => {
    const all = [
      ...space.tasks.slice(0, 30).map((t) => ({ ...t, _type: 'task' as const })),
      ...space.notes.slice(0, 30).map((n) => ({ ...n, _type: 'note' as const })),
    ]
      .sort((a, b) => b.order - a.order)
      .slice(0, 50);

    return all.map((item) =>
      item._type === 'task'
        ? ({ id: item.id, type: 'task', title: item.title, done: (item as typeof space.tasks[0]).done, createdBy: item.createdBy } as ChatBubble)
        : ({ id: item.id, type: 'note', title: item.title, createdBy: item.createdBy } as ChatBubble),
    );
  }, [space.tasks, space.notes]);

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

  const isNoteMode = text.trimStart().startsWith('/note');

  function handleSubmit() {
    const raw = text.trim();
    const isNote = raw.startsWith('/note');
    const title = (isNote ? raw.slice(5) : raw).trim();
    if (!title) return;

    const createdBy = currentUserId ?? undefined;
    if (isNote) {
      dispatch({ type: 'NOTE_CREATE', payload: { title, content: '', color: '', createdBy } });
    } else {
      dispatch({ type: 'TASK_CREATE', payload: { title, content: '', date: '', time: '', createdBy } });
    }
    setText('');
  }

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
            Gõ 1 việc cần làm rồi Enter — hoặc &quot;/note &quot; để ghi chú nhanh.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {bubbles.map((b, idx) => {
              const mine = isMine(b);
              const prevBubble = bubbles[idx - 1];
              const samePersonAsPrev = prevBubble && !isMine(prevBubble) && !mine && prevBubble.createdBy === b.createdBy;
              const memberName = (!mine && b.createdBy) ? getMemberDisplayName(b.createdBy, members) : '';
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
                    {/* Tên người gửi (chỉ bubble đầu trong cụm) */}
                    {!mine && !samePersonAsPrev && memberName && (
                      <span className="mb-0.5 px-1 text-[0.75rem] text-[var(--text-dim)]">{memberName}</span>
                    )}

                    {/* Bubble content */}
                    {mine ? (
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
                        className={`flex items-center gap-2 rounded-2xl border border-[color:var(--border)] bg-[var(--raised)] px-3.5 py-2.5 text-[0.875rem] text-[var(--text)] ${
                          b.type === 'task' && b.done ? 'opacity-60' : ''
                        }`}
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
          placeholder='Gõ việc cần làm, hoặc "/note " để ghi chú nhanh'
          className={`min-w-0 flex-1 rounded-full border bg-[var(--raised)] px-4 py-2.5 text-[16px] text-[var(--text)]
            transition-[border-color] duration-150 focus:outline-none ${
              isNoteMode
                ? 'border-[var(--note-color)] focus:border-[var(--note-color)]'
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
