import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { useAppState } from '../../state/AppStateContext';
import { defaultEnabledBlocks } from '../../state/reducers/spaces';
import { ensureBlocksPresent } from '../../layout/dashboardLayoutUtils';
import type { EnabledBlocks, LayoutBlockKey, Space } from '../../types';

// Khối Thông báo KHÔNG nằm trong danh sách chọn bật/tắt — luôn hiện ở mọi Space
// (xem requirements mục 4.1/5.5/6/8, forceRemindersEnabled() ở reducers/spaces.ts).
const BLOCK_DEFS: { key: keyof EnabledBlocks; label: string }[] = [
  { key: 'tasks', label: 'Việc cần làm' },
  { key: 'reminder', label: 'Nhắc việc' },
  { key: 'habits', label: 'Thói quen' },
  { key: 'notes', label: 'Ghi chú' },
  { key: 'today', label: 'Today' },
];

interface SpaceFormModalProps {
  space: Space | null; // null = tạo mới
  onClose: () => void;
}

export function SpaceFormModal({ space, onClose }: SpaceFormModalProps) {
  const { state, dispatch } = useAppState();
  const [name, setName] = useState(space?.name ?? '');
  const [blocks, setBlocks] = useState<EnabledBlocks>(space?.enabledBlocks ?? defaultEnabledBlocks());
  const [showError, setShowError] = useState(false);
  // Sao chép bố cục Dashboard (vị trí/kích thước khối) từ 1 Space khác — áp dụng NGAY (không
  // đợi bấm "Lưu"). KHÔNG ràng buộc phải cùng "Khối hiển thị" với Space nguồn — bố cục lưu
  // theo từng khối độc lập, khối nào Space đích không bật thì bị `deriveVisibleLayout` tự ẩn
  // lúc render (không lỗi gì), còn khối Space đích CÓ bật mà bản copy thiếu (Space nguồn không
  // có) thì `ensureBlocksPresent` tự chèn vào cuối cột đầu để không bị mất hẳn khỏi Dashboard.
  const otherSpaces = space ? state.spaces.filter((s) => s.id !== space.id) : [];
  const [copyFromId, setCopyFromId] = useState(otherSpaces[0]?.id ?? '');

  function handleCopyLayout() {
    if (!space || !copyFromId) return;
    const source = state.spaces.find((s) => s.id === copyFromId);
    if (!source) return;
    const requiredIds: LayoutBlockKey[] = [
      'reminders',
      'settings',
      ...BLOCK_DEFS.filter((b) => blocks[b.key]).map((b) => b.key as LayoutBlockKey),
    ];
    const layout = ensureBlocksPresent(source.dashboardLayout, requiredIds);
    dispatch({ type: 'SPACE_SET_DASHBOARD_LAYOUT', payload: { spaceId: space.id, layout } });
  }

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
        {otherSpaces.length > 0 && (
          <div className="field">
            <label>Bố cục Dashboard</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)} style={{ flex: 1 }}>
                {otherSpaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-ghost" onClick={handleCopyLayout}>
                Áp dụng bố cục này
              </button>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Sao chép vị trí/kích thước khối từ Space đã chọn sang Space này — áp dụng ngay, không cần bấm "Lưu". Khối nào Space này không bật sẽ tự ẩn; khối có bật mà bản sao chép thiếu sẽ tự thêm vào. Có thể chỉnh lại bằng kéo-thả/resize bất kỳ lúc nào.
            </p>
          </div>
        )}
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
