import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { useAppState } from '../../state/AppStateContext';
import type { Habit } from '../../types';

interface HabitFormModalProps {
  habit: Habit | null;
  onClose: () => void;
}

export function HabitFormModal({ habit, onClose }: HabitFormModalProps) {
  const { dispatch } = useAppState();
  const [title, setTitle] = useState(habit?.title ?? '');

  function handleSave() {
    if (habit) {
      dispatch({ type: 'HABIT_UPDATE', payload: { id: habit.id, title } });
    } else {
      dispatch({ type: 'HABIT_CREATE', payload: { title } });
    }
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <h2>{habit ? 'Sửa thói quen' : 'Thói quen mới'}</h2>
      <div className="field">
        <label>Tên thói quen</label>
        <input
          type="text"
          value={title}
          placeholder="Vd: Đọc sách 20 phút"
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
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
