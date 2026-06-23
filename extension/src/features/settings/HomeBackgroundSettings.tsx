import { useEffect, useState } from 'react';
import { useAppState } from '../../state/AppStateContext';
import type { HomeBgAutoRotateMs } from '../../types';

const AUTO_ROTATE_OPTIONS: { value: HomeBgAutoRotateMs; label: string }[] = [
  { value: 0, label: 'Tắt' },
  { value: 60_000, label: 'Mỗi 1 phút' },
  { value: 900_000, label: 'Mỗi 15 phút' },
  { value: 3_600_000, label: 'Mỗi 1 giờ' },
];

/**
 * Lưới preview 6 ô ảnh nền Home/Dashboard: click để áp dụng ngay, input sửa link trực
 * tiếp (áp dụng khi blur/Enter, validate bằng tải thử ảnh trước khi lưu — không lưu
 * link lỗi, hiện cảnh báo "Link lỗi" đè lên thumbnail).
 */
export function HomeBackgroundSettings() {
  const { state, dispatch } = useAppState();
  const { homeBackground } = state.settings;
  // Theo dõi ô nào đang có link lỗi (chỉ ephemeral trong Settings, không cần persist).
  const [brokenSlots, setBrokenSlots] = useState<Set<number>>(new Set());
  // Giá trị input đang sửa từng ô (cho phép gõ tự do trước khi blur/Enter mới validate).
  const [drafts, setDrafts] = useState<string[]>(homeBackground.images);

  useEffect(() => {
    setDrafts(homeBackground.images);
  }, [homeBackground.images]);

  function setBroken(index: number, broken: boolean) {
    setBrokenSlots((prev) => {
      const next = new Set(prev);
      if (broken) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  function applySlotUrl(index: number, rawUrl: string) {
    const url = rawUrl.trim();
    if (!url || url === homeBackground.images[index]) return;
    const img = new Image();
    img.onload = () => {
      setBroken(index, false);
      // Lưu link mới; nếu đang là ảnh đang dùng (`index === homeBackground.index`), ảnh nền
      // tự re-render theo URL mới — không cần đổi `index`.
      dispatch({ type: 'SETTINGS_SET_HOME_BG_IMAGE', payload: { index, url } });
    };
    img.onerror = () => setBroken(index, true);
    img.src = url;
  }

  return (
    <div className="setting-block span-2">
      <label>Ảnh nền Home</label>
      <div className="home-bg-grid">
        {homeBackground.images.map((url, i) => (
          <div className="home-bg-item" key={i}>
            <button
              type="button"
              className={`home-bg-thumb ${i === homeBackground.index ? 'active-slot' : ''} ${brokenSlots.has(i) ? 'broken' : ''}`}
              style={{ backgroundImage: `url('${url}')` }}
              title="Dùng ảnh này ngay"
              aria-label={`Dùng ảnh nền số ${i + 1}`}
              onClick={() => dispatch({ type: 'SETTINGS_SET_HOME_BG_INDEX', payload: { index: i } })}
            />
            <input
              type="url"
              value={drafts[i] ?? ''}
              onChange={(e) => {
                const next = [...drafts];
                next[i] = e.target.value;
                setDrafts(next);
              }}
              onBlur={(e) => applySlotUrl(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              aria-label={`Sửa link ảnh nền số ${i + 1}`}
            />
          </div>
        ))}
      </div>
      <p className="hint">
        Click vào ảnh để áp dụng ngay. Sửa link rồi nhấn Enter/click ra ngoài để áp dụng — link lỗi sẽ không được lưu.
      </p>

      <div className="size-row" style={{ marginTop: 14 }}>
        <label>Tự động đổi ảnh</label>
        <select
          value={homeBackground.autoRotateMs}
          onChange={(e) =>
            dispatch({
              type: 'SETTINGS_SET_HOME_BG_AUTO_ROTATE',
              payload: { ms: Number(e.target.value) as HomeBgAutoRotateMs },
            })
          }
        >
          {AUTO_ROTATE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
