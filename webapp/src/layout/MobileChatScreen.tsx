import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, SendHorizontal } from 'lucide-react';
import { useAppState, useCurrentSpace } from '../state/AppStateContext';

type ChatBubble = { id: string; type: 'task'; title: string; done: boolean } | { id: string; type: 'note'; title: string };

/**
 * Màn hình chính mobile (thay Home) — gõ 1 câu, Enter, thành Task ngay; gõ bắt đầu bằng
 * "/note " thành Note. KHÔNG lưu thêm dữ liệu "lịch sử chat" nào mới — phần bong bóng phía
 * trên ô nhập là Task THẬT đã có (lấy `title`, sắp theo `order`) hiển thị lại dưới dạng bong
 * bóng để màn hình không trống trơn lúc mới mở, không phải 1 bảng chat log riêng. Note tạo
 * trong phiên hiện tại cũng hiện thêm vào ngay (qua `sessionBubbles`) nhưng không persist —
 * mở lại app thì danh sách "lịch sử" sẽ tính lại từ Task thật hiện có lúc đó.
 */
export function MobileChatScreen() {
  const { dispatch } = useAppState();
  const space = useCurrentSpace();
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Merge task + note từ space, sort theo order (lớn = cũ hơn → hiện cũ→mới, mới nhất dưới cùng).
  // order nhỏ = item mới hơn (TASK_CREATE/NOTE_CREATE đều prepend với order nhỏ nhất).
  const bubbles = useMemo<ChatBubble[]>(() => {
    const all = [
      ...space.tasks.slice(0, 30).map((t) => ({ ...t, _type: 'task' as const })),
      ...space.notes.slice(0, 30).map((n) => ({ ...n, _type: 'note' as const })),
    ]
      .sort((a, b) => b.order - a.order)
      .slice(0, 50);

    return all.map((item) =>
      item._type === 'task'
        ? ({ id: item.id, type: 'task', title: item.title, done: (item as typeof space.tasks[0]).done } as ChatBubble)
        : ({ id: item.id, type: 'note', title: item.title } as ChatBubble),
    );
  }, [space.tasks, space.notes]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles.length]);

  // Khi keyboard iOS mở/đóng, visualViewport thu hẹp — scroll bubble list xuống bottom
  // để nội dung cũ không bị che bởi keyboard.
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

    if (isNote) {
      dispatch({ type: 'NOTE_CREATE', payload: { title, content: '', color: '' } });
    } else {
      dispatch({ type: 'TASK_CREATE', payload: { title, content: '', date: '', time: '' } });
    }
    setText('');
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Zalo/Messenger style: spacer đẩy bubble xuống đáy; khi nhiều tin thì spacer co về 0 và scroll bình thường */}
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="flex-1" />
        {bubbles.length === 0 ? (
          <div className="py-2 text-center text-[0.8125rem] text-[var(--text-dim)] opacity-70">
            Gõ 1 việc cần làm rồi Enter — hoặc &quot;/note &quot; để ghi chú nhanh.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {bubbles.map((b) => (
              <div key={b.id} className="flex justify-end">
                <div
                  className={`flex max-w-[85%] items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[0.875rem] text-white ${
                    b.type === 'note' ? 'bg-[var(--note-color)]' : 'bg-[var(--accent)]'
                  } ${b.type === 'task' && b.done ? 'opacity-60' : ''}`}
                >
                  {b.type === 'note' && <BookOpen className="icon h-3.5 w-3.5 flex-none" size={14} />}
                  {b.type === 'task' && b.done && <Check className="icon h-3.5 w-3.5 flex-none" size={14} />}
                  <span className={b.type === 'task' && b.done ? 'line-through' : ''}>{b.title}</span>
                </div>
              </div>
            ))}
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
