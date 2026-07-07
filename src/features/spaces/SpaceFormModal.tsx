import { useState } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { useAppState } from '../../state/AppStateContext';
import { defaultEnabledBlocks } from '../../state/reducers/spaces';
import type { EnabledBlocks, Space } from '../../types';

// Khối Thông báo KHÔNG nằm trong danh sách chọn bật/tắt — luôn hiện ở mọi Space
// (xem requirements mục 4.1/5.5/6/8, forceRemindersEnabled() ở reducers/spaces.ts).
const BLOCK_DEFS: { key: keyof EnabledBlocks; label: string }[] = [
  { key: 'tasks', label: 'Việc cần làm' },
  { key: 'reminder', label: 'Nhắc việc' },
  { key: 'habits', label: 'Thói quen' },
  { key: 'notes', label: 'Ghi chú' },
  { key: 'today', label: 'Hôm nay' },
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
    // Chỉ kiểm tra 4 khối có thể tắt (BLOCK_DEFS) — `reminders` luôn `true` trong `blocks`
    // (ép ở reducer) nên không được tính vào điều kiện "phải bật ít nhất 1 khối", nếu không
    // validation sẽ luôn pass dù user tắt hết 4 khối còn lại.
    if (!BLOCK_DEFS.some((b) => blocks[b.key])) {
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
                <Checkbox.Root
                  checked={blocks[b.key]}
                  onCheckedChange={() => toggleBlock(b.key)}
                  className="flex h-4 w-4 flex-none items-center justify-center rounded-[5px] border-solid border-[1.5px]
                    border-[color:var(--border-control)] transition-colors duration-150 data-[state=checked]:border-[var(--accent)]
                    data-[state=checked]:bg-[var(--accent)]"
                >
                  <Checkbox.Indicator>
                    <Check className="icon text-white" size={10} strokeWidth={3} />
                  </Checkbox.Indicator>
                </Checkbox.Root>
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
