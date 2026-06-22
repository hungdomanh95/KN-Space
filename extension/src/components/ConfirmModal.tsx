import { Modal } from './Modal';

export interface ConfirmModalState {
  title: string;
  message: string;
  onConfirm: () => void;
}

interface ConfirmModalProps {
  state: ConfirmModalState;
  onClose: () => void;
}

/** Modal xác nhận xoá dùng chung cho mọi tính năng (không dùng window.confirm()). */
export function ConfirmModal({ state, onClose }: ConfirmModalProps) {
  return (
    <Modal onClose={onClose} className="confirm-modal">
      <div style={{ width: 380 - 44 }}>
        <h2>{state.title}</h2>
        <p style={{ fontSize: 14.5, color: 'var(--text-dim)', margin: '0 0 18px' }}>{state.message}</p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <button
            className="btn-primary"
            style={{ background: 'var(--reminder-color)' }}
            onClick={() => {
              state.onConfirm();
              onClose();
            }}
          >
            Xoá
          </button>
        </div>
      </div>
    </Modal>
  );
}
