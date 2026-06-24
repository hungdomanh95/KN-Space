import { useEffect, useState } from 'react';
import { useAppState } from '../../state/AppStateContext';
import type { QuoteRotateMode } from '../../types';

const QUOTE_ROTATE_OPTIONS: { value: QuoteRotateMode; label: string }[] = [
  { value: 'daily', label: 'Mỗi ngày' },
  { value: 'onopen', label: 'Mỗi lần mở Home' },
  { value: 'every15m', label: 'Mỗi 15 phút' },
  { value: 'every1h', label: 'Mỗi 1 giờ' },
];

/**
 * Lưới 10 slot quote Home CỐ ĐỊNH (không CRUD thêm/xoá) — mỗi ô là 1 textarea sửa nội dung
 * trực tiếp, nút "Dùng câu này" áp dụng ngay slot đó làm quote hiện tại trên Home. Cùng tinh
 * thần HomeBackgroundSettings.tsx (slot cố định + sửa tại chỗ) nhưng không cần upload/link.
 */
export function HomeQuoteSettings() {
  const { state, dispatch } = useAppState();
  const { homeQuotes } = state.settings;
  // Giá trị đang gõ từng ô (cho phép gõ tự do trước khi blur mới lưu, cùng pattern drafts ở
  // HomeBackgroundSettings) — tránh dispatch trên từng keystroke.
  const [drafts, setDrafts] = useState<string[]>(homeQuotes.texts);

  useEffect(() => {
    setDrafts(homeQuotes.texts);
  }, [homeQuotes.texts]);

  function saveDraft(index: number) {
    const text = drafts[index] ?? '';
    if (text.trim() === homeQuotes.texts[index]) return;
    dispatch({ type: 'SETTINGS_SET_HOME_QUOTE_TEXT', payload: { index, text } });
  }

  return (
    <div className="setting-block span-2">
      {/* Tần suất đổi quote đặt ở ĐẦU tab, cùng vị trí + style segmented-options với "Tự động
          đổi ảnh" (tab Ảnh nền) — đúng thứ tự trong mockup (#quoterotate-options render TRƯỚC
          #home-quote-grid). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ marginBottom: 0, fontWeight: 600, fontSize: 13 }}>Tần suất đổi quote</label>
        <div className="segmented-options" role="group" aria-label="Chọn tần suất đổi câu quote">
          {QUOTE_ROTATE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={o.value === homeQuotes.rotateMode ? 'active' : ''}
              aria-pressed={o.value === homeQuotes.rotateMode}
              onClick={() => dispatch({ type: 'SETTINGS_SET_QUOTE_ROTATE_MODE', payload: { mode: o.value } })}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <label>Câu quote Home (10 ô cố định, sửa nội dung trực tiếp)</label>
      <div className="home-quote-grid">
        {homeQuotes.texts.map((text, i) => (
          <div className={`home-quote-item ${i === homeQuotes.index ? 'active-slot' : ''}`} key={i}>
            <div className="home-quote-index">
              <span>Ô {i + 1}</span>
              <button
                type="button"
                className="home-quote-use-btn"
                onClick={() => dispatch({ type: 'SETTINGS_SET_HOME_QUOTE_INDEX', payload: { index: i } })}
              >
                Dùng câu này
              </button>
            </div>
            <textarea
              aria-label={`Nội dung câu quote ô ${i + 1}`}
              value={drafts[i] ?? text}
              onChange={(e) => {
                const next = [...drafts];
                next[i] = e.target.value;
                setDrafts(next);
              }}
              onBlur={() => saveDraft(i)}
            />
          </div>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Sửa nội dung trực tiếp trong từng ô (click ra ngoài để lưu). Bấm &quot;Dùng câu này&quot; để hiển thị ngay trên màn
        Home.
      </p>
    </div>
  );
}
