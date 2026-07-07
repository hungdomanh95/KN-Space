import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { MemberAvatar } from '../../components/MemberAvatar';
import { useAppState } from '../../state/AppStateContext';
import { useCurrentUserId } from '../../state/useCurrentUserId';
import { useCurrentSpace } from '../../state/AppStateContext';
import { useSpaceMembers } from '../../state/useSpaceMembers';
import { getMemberColor, getMemberDisplayName } from '../../utils/memberColors';
import type { Task } from '../../types';

interface TaskFormModalProps {
  task: Task | null; // null = tạo mới
  onClose: () => void;
}

export function TaskFormModal({ task, onClose }: TaskFormModalProps) {
  const { dispatch } = useAppState();
  const space = useCurrentSpace();
  const currentUserId = useCurrentUserId();
  const members = useSpaceMembers(space.isShared ? space.sharedSpaceId : undefined);
  const [title, setTitle] = useState(task?.title ?? '');
  const [content, setContent] = useState(task?.content ?? '');
  const [date, setDate] = useState(task?.date ?? '');
  const [time, setTime] = useState(task?.time ?? '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assigneeIds ?? []);

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
        <label>Nội dung (tuỳ chọn)</label>
        <textarea
          className="note-content-field max-md:min-h-[120px]"
          value={content}
          placeholder="Vd: nội dung cần chuẩn bị, link tài liệu..."
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Ngày (tuỳ chọn)</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Giờ (tuỳ chọn)</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      {space.isShared && members.length > 0 && (
        <div className="field">
          <div className="flex items-center justify-between">
            <label>Giao cho (tuỳ chọn)</label>
            <button type="button" className="btn-ghost" onClick={toggleSelectAll}>
              {members.length > 0 && members.every((m) => assigneeIds.includes(m.userId)) ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          </div>
          <div className="flex max-h-[160px] flex-col gap-1.5 overflow-y-auto rounded-[10px] border-[1.5px] border-[color:var(--border)] p-2">
            {members.map((m) => {
              const checked = assigneeIds.includes(m.userId);
              const name = getMemberDisplayName(m.userId, members, 40);
              return (
                <label key={m.userId} className="flex items-center gap-2 text-[0.875rem]">
                  <input type="checkbox" checked={checked} onChange={() => toggleAssignee(m.userId)} />
                  <MemberAvatar name={name} color={getMemberColor(m.userId, members)} size={18} />
                  <span>
                    {name}
                    {m.userId === currentUserId ? ' (bạn)' : ''}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
      <div className="modal-actions sticky bottom-0 bg-[var(--modal-bg)] pt-2">
        <button className="btn-ghost" onClick={onClose}>
          Hủy
        </button>
        <button className="btn-primary" onClick={handleSave}>
          Lưu
        </button>
      </div>
    </Modal>
  );
}
