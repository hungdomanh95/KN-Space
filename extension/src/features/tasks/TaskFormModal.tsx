import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { useAppState } from '../../state/AppStateContext';
import type { Task } from '../../types';

interface TaskFormModalProps {
  task: Task | null; // null = tạo mới
  onClose: () => void;
}

export function TaskFormModal({ task, onClose }: TaskFormModalProps) {
  const { dispatch } = useAppState();
  const [title, setTitle] = useState(task?.title ?? '');
  const [date, setDate] = useState(task?.date ?? '');
  const [time, setTime] = useState(task?.time ?? '');

  function handleSave() {
    if (task) {
      dispatch({ type: 'TASK_UPDATE', payload: { id: task.id, title, date, time } });
    } else {
      dispatch({ type: 'TASK_CREATE', payload: { title, date, time } });
    }
    onClose();
  }

  return (
    <Modal onClose={onClose}>
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
      <div className="modal-actions">
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
