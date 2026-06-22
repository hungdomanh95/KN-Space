import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { useAppState } from '../../state/AppStateContext';
import { defaultEnabledBlocks } from '../../state/reducers/spaces';
import type { EnabledBlocks, Space } from '../../types';

const BLOCK_DEFS: { key: keyof EnabledBlocks; label: string }[] = [
  { key: 'tasks', label: 'Việc cần làm' },
  { key: 'reminder', label: 'Nhắc việc' },
  { key: 'habits', label: 'Thói quen' },
  { key: 'notes', label: 'Ghi chú' },
  { key: 'reminders', label: 'Thông báo' },
];

interface SpaceFormModalProps {
  space: Space | null; // null = tạo mới
  onClose: () => void;
}

export function SpaceFormModal({ space, onClose }: SpaceFormModalProps) {
  const { dispatch } = useAppState();
  const [name, setName] = useState(space?.name ?? '');
  const [blocks, setBlocks] = useState<EnabledBlocks>(space?.enabledBlocks ?? defaultEnabledBlocks());
  const [showError, setShowError] = useState(false);

  function toggleBlock(key: keyof EnabledBlocks) {
    setBlocks((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSave() {
    if (!Object.values(blocks).some(Boolean)) {
      setShowError(true);
      return;
    }
    if (space) {
      dispatch({ type: 'SPACE_RENAME', payload: { id: space.id, name } });
      dispatch({ type: 'SPACE_SET_ENABLED_BLOCKS', payload: { id: space.id, enabledBlocks: blocks } });
    } else {
      dispatch({ type: 'SPACE_CREATE', payload: { name, enabledBlocks: blocks } });
    }
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ width: 380 - 44 }}>
        <h2>{space ? 'Sửa space' : 'Space mới'}</h2>
        <div className="field">
          <label>Tên space</label>
          <input
            type="text"
            value={name}
            placeholder="Vd: Công ty"
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label>Khối hiển thị</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {BLOCK_DEFS.map((b) => (
              <label key={b.key} className="block-check-row">
                <input type="checkbox" checked={blocks[b.key]} onChange={() => toggleBlock(b.key)} />
                <span>{b.label}</span>
              </label>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Bật ít nhất 1 khối để space hoạt động. <strong>(Khuyến nghị)</strong>
          </p>
          {showError && (
            <p className="hint" style={{ color: 'var(--reminder-color)', marginTop: 4 }}>
              Phải bật ít nhất 1 khối để lưu.
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>
            Hủy
          </button>
          <button className="btn-primary" onClick={handleSave}>
            Lưu
          </button>
        </div>
      </div>
    </Modal>
  );
}
