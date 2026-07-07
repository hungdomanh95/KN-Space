import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { createSharedSpace } from '../../storage/sharedSpaceStore';
import type { Space } from '../../types';

interface SharedSpaceFormModalProps {
  onClose: () => void;
  onCreated: (space: Space) => void;
}

export function SharedSpaceFormModal({ onClose, onCreated }: SharedSpaceFormModalProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const newSpace = await createSharedSpace(name.trim());
      onCreated(newSpace);
      onClose();
    } catch (err) {
      setError('Tạo Space chung thất bại. Kiểm tra kết nối và thử lại.');
      console.error('[KN-Space] Tạo shared space lỗi:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div style={{ width: 380 - 44 }}>
        <h2>Space chung mới</h2>
        <div className="field">
          <label>Tên space</label>
          <input
            type="text"
            value={name}
            placeholder="Vd: Gia đình, Nhóm công việc..."
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !saving) void handleSave(); }}
            autoFocus
          />
        </div>
        <p className="hint">
          Sau khi tạo, mời thành viên bằng cách bấm icon <strong>mời</strong> trong danh sách Space chung.
        </p>
        {error && (
          <p className="hint" style={{ color: 'var(--reminder-color)', marginTop: 4 }}>
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button className="btn-primary" onClick={() => void handleSave()} disabled={saving || !name.trim()}>
            {saving ? 'Đang tạo...' : 'Tạo Space'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
