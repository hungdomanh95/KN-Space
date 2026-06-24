import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Link2, Upload } from 'lucide-react';
import { useAppState } from '../../state/AppStateContext';
import type { HomeBgAutoRotateMs } from '../../types';

const AUTO_ROTATE_OPTIONS: { value: HomeBgAutoRotateMs; label: string }[] = [
  { value: 0, label: 'Tắt' },
  { value: 60_000, label: 'Mỗi 1 phút' },
  { value: 900_000, label: 'Mỗi 15 phút' },
  { value: 3_600_000, label: 'Mỗi 1 giờ' },
];

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;

/** Resize ảnh xuống cạnh dài tối đa MAX_DIMENSION qua canvas, xuất JPEG ~85% — không lưu file gốc. */
function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File không phải ảnh hợp lệ.'));
      img.onload = () => {
        const { width, height } = img;
        const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
        const targetW = Math.round(width * scale);
        const targetH = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Không tạo được canvas để xử lý ảnh.'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Lưới preview 6 ô ảnh nền Home/Dashboard: click để áp dụng ngay, input sửa link trực
 * tiếp (áp dụng khi blur/Enter, validate bằng tải thử ảnh trước khi lưu — không lưu
 * link lỗi, hiện cảnh báo "Link lỗi" đè lên thumbnail), hoặc upload ảnh từ máy (resize/nén
 * trước khi lưu base64 vào chrome.storage.local — xem chromeStorage.ts).
 */
export function HomeBackgroundSettings() {
  const { state, dispatch } = useAppState();
  const { homeBackground } = state.settings;
  // Theo dõi ô nào đang có link lỗi (chỉ ephemeral trong Settings, không cần persist).
  const [brokenSlots, setBrokenSlots] = useState<Set<number>>(new Set());
  // Giá trị input đang sửa từng ô (cho phép gõ tự do trước khi blur/Enter mới validate).
  const [drafts, setDrafts] = useState<string[]>(homeBackground.images.map((slot) => (slot.type === 'url' ? slot.value : '')));
  const [uploadError, setUploadError] = useState('');
  const [autoRotateOpen, setAutoRotateOpen] = useState(false);
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const autoRotateWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDrafts(homeBackground.images.map((slot) => (slot.type === 'url' ? slot.value : '')));
  }, [homeBackground.images]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (autoRotateWrapRef.current && !autoRotateWrapRef.current.contains(e.target as Node)) setAutoRotateOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

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
    const current = homeBackground.images[index];
    if (!url || (current.type === 'url' && url === current.value)) return;
    const img = new Image();
    img.onload = () => {
      setBroken(index, false);
      // Lưu link mới; nếu đang là ảnh đang dùng (`index === homeBackground.index`), ảnh nền
      // tự re-render theo URL mới — không cần đổi `index`. Gõ link mới vào ô đang upload sẽ
      // tự chuyển slot đó về dạng `url` (action SETTINGS_SET_HOME_BG_IMAGE luôn set type:'url').
      dispatch({ type: 'SETTINGS_SET_HOME_BG_IMAGE', payload: { index, url } });
    };
    img.onerror = () => setBroken(index, true);
    img.src = url;
  }

  async function handleUploadFile(index: number, file: File) {
    setUploadError('');
    try {
      const dataUrl = await resizeImageFile(file);
      setBroken(index, false);
      dispatch({ type: 'SETTINGS_SET_HOME_BG_UPLOAD', payload: { index, dataUrl } });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload ảnh thất bại.');
    }
  }

  /** Quay ô đang ở dạng upload trở lại dạng link — không xoá ảnh hiện tại cho tới khi user gõ link mới. */
  function useLinkForSlot(index: number) {
    dispatch({ type: 'SETTINGS_HOME_BG_USE_LINK_MODE', payload: { index } });
  }

  return (
    <div className="setting-block span-2">
      <label>Ảnh nền Home</label>
      <div className="home-bg-grid">
        {homeBackground.images.map((slot, i) => {
          const isUpload = slot.type === 'upload';
          return (
            <div className="home-bg-item" key={i}>
              <button
                type="button"
                className={`home-bg-thumb ${i === homeBackground.index ? 'active-slot' : ''} ${brokenSlots.has(i) ? 'broken' : ''}`}
                style={{ backgroundImage: `url('${slot.value}')` }}
                title="Dùng ảnh này ngay"
                aria-label={`Dùng ảnh nền số ${i + 1}`}
                onClick={() => dispatch({ type: 'SETTINGS_SET_HOME_BG_INDEX', payload: { index: i } })}
              />
              <div className="home-bg-row">
                <input
                  type="url"
                  value={isUpload ? '' : drafts[i] ?? ''}
                  disabled={isUpload}
                  placeholder={isUpload ? 'Đang dùng ảnh đã upload' : ''}
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
                <button
                  type="button"
                  className="home-bg-upload-btn"
                  title="Upload ảnh từ máy"
                  aria-label={`Upload ảnh từ máy cho ô số ${i + 1}`}
                  onClick={() => fileInputRefs.current[i]?.click()}
                >
                  <Upload className="icon" size={13} />
                </button>
                <input
                  ref={(el) => {
                    fileInputRefs.current[i] = el;
                  }}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleUploadFile(i, file);
                  }}
                />
              </div>
              {isUpload && (
                <button type="button" className="home-bg-use-link-btn" onClick={() => useLinkForSlot(i)}>
                  <Link2 className="icon" size={11} /> Dùng link
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="hint">
        Click vào ảnh để áp dụng ngay. Sửa link rồi nhấn Enter/click ra ngoài để áp dụng — link lỗi sẽ không được lưu.
        Upload ảnh từ máy sẽ tự resize/nén trước khi lưu, và chỉ hiển thị đúng trên máy đã upload (không đồng bộ).
      </p>
      {uploadError && (
        <p className="hint" style={{ color: 'var(--reminder-color)' }}>
          {uploadError}
        </p>
      )}

      <div className="size-row" style={{ marginTop: 14 }}>
        <label>Tự động đổi ảnh</label>
        <div className="sort-switcher" ref={autoRotateWrapRef}>
          <button type="button" className="sort-switcher-btn" onClick={() => setAutoRotateOpen((v) => !v)}>
            <span>{AUTO_ROTATE_OPTIONS.find((o) => o.value === homeBackground.autoRotateMs)?.label}</span>
            <ChevronDown className="icon" size={11} />
          </button>
          {autoRotateOpen && (
            <div className="space-menu" id="autorotate-menu">
              {AUTO_ROTATE_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className={`space-menu-item ${opt.value === homeBackground.autoRotateMs ? 'active' : ''}`}
                  onClick={() => {
                    dispatch({ type: 'SETTINGS_SET_HOME_BG_AUTO_ROTATE', payload: { ms: opt.value } });
                    setAutoRotateOpen(false);
                  }}
                >
                  <span className="space-name">{opt.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
