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
  const [sessionBubbles, setSessionBubbles] = useState<ChatBubble[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lấy LIVE từ space.tasks (không lưu state riêng) — tự phản ánh đúng trạng thái done ngay
  // cả khi tick xong ở tab Chi tiết, không bị "đông cứng" theo lúc tạo.
  const taskBubbles = useMemo<ChatBubble[]>(
    () =>
      [...space.tasks]
        .sort((a, b) => a.order - b.order)
        .slice(-30)
        .map((t) => ({ id: t.id, type: 'task' as const, title: t.title, done: t.done })),
    [space.tasks],
  );

  // Note KHÔNG có chỗ hiển thị live nào trong màn này — chỉ track Note tạo trong PHIÊN hiện
  // tại (sessionBubbles), Task thì để taskBubbles tự lo, tránh hiện trùng 2 lần.
  const bubbles = [...taskBubbles, ...sessionBubbles];

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [bubbles.length]);

  const isNoteMode = text.trimStart().startsWith('/note');

  function handleSubmit() {
    const raw = text.trim();
    const isNote = raw.startsWith('/note');
    const title = (isNote ? raw.slice(5) : raw).trim();
    if (!title) return;

    if (isNote) {
      dispatch({ type: 'NOTE_CREATE', payload: { title, content: '', color: '' } });
      setSessionBubbles((prev) => [...prev, { id: crypto.randomUUID(), type: 'note', title }]);
    } else {
      // KHÔNG tự thêm bubble ở đây — taskBubbles (live từ space.tasks) sẽ tự hiện task này
      // ngay khi reducer thêm xong, tránh hiện trùng 2 lần (1 từ đây + 1 từ taskBubbles).
      dispatch({ type: 'TASK_CREATE', payload: { title, content: '', date: '', time: '' } });
    }
    setText('');
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
        {bubbles.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center text-[0.8438rem] text-[var(--text-dim)]">
            <span>Gõ 1 việc cần làm rồi Enter — hoặc gõ &quot;/note &quot; để ghi chú nhanh.</span>
          </div>
        ) : (
          bubbles.map((b) => (
            <div key={b.id} className="flex justify-end">
              <div
                className={`flex max-w-[85%] items-center gap-2 rounded-2xl px-3.5 py-2.5 text-[0.875rem] text-white ${
                  b.type === 'note' ? 'bg-[var(--note-color)]' : 'bg-[var(--accent)]'
                } ${b.type === 'task' && b.done ? 'opacity-60' : ''}`}
              >
                {b.type === 'note' && <BookOpen className="icon h-3.5 w-3.5 flex-none" size={14} />}
                {/* Chỉ Task ĐÃ XONG mới có icon check — Task chưa xong không hiện icon gì, tránh
                    nhìn như đã hoàn thành hết (đúng phản hồi thực tế khi test). */}
                {b.type === 'task' && b.done && <Check className="icon h-3.5 w-3.5 flex-none" size={14} />}
                <span className={b.type === 'task' && b.done ? 'line-through' : ''}>{b.title}</span>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex flex-none items-center gap-2 border-t border-[color:var(--border-hairline)] px-3 py-2.5">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder='Gõ việc cần làm, hoặc "/note " để ghi chú nhanh'
          className={`min-w-0 flex-1 rounded-full border bg-[var(--raised)] px-4 py-2.5 text-[0.875rem] text-[var(--text)]
            transition-[border-color] duration-150 focus:outline-none ${
              isNoteMode
                ? 'border-[var(--note-color)] focus:border-[var(--note-color)]'
                : 'border-[color:var(--border)] focus:border-[color:var(--accent)]'
            }`}
        />
        <button
          type="button"
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
