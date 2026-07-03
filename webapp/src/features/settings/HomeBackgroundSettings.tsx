import { useEffect, useRef, useState } from 'react';
import { Link2, Upload } from 'lucide-react';
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
 * trước khi lưu base64 vào `settings.homeBackground`, đồng bộ qua Supabase).
 */
export function HomeBackgroundSettings() {
  const { state, dispatch } = useAppState();
  const { homeBackground } = state.settings;
  // Theo dõi ô nào đang có link lỗi (chỉ ephemeral trong Settings, không cần persist).
  const [brokenSlots, setBrokenSlots] = useState<Set<number>>(new Set());
  // Giá trị input đang sửa từng ô (cho phép gõ tự do trước khi blur/Enter mới validate).
  const [drafts, setDrafts] = useState<string[]>(homeBackground.images.map((slot) => (slot.type === 'url' ? slot.value : '')));
  const [uploadError, setUploadError] = useState('');
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setDrafts(homeBackground.images.map((slot) => (slot.type === 'url' ? slot.value : '')));
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
    <div className="setting-block span-2 col-span-2 mb-5">
      {/* Tần suất tự động đổi ảnh đặt ở ĐẦU tab, cùng style segmented-options với "Tần suất đổi
          quote" (tab Quote) — đúng vị trí + kiểu control trong mockup (#autorotate-options /
          #quoterotate-options dùng chung renderAutoRotateOptions-style), không phải dropdown. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ marginBottom: 0, fontWeight: 600, fontSize: 13 }}>Tự động đổi ảnh</label>
        <div className="segmented-options" role="group" aria-label="Chọn tần suất tự động đổi ảnh nền">
          {AUTO_ROTATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={opt.value === homeBackground.autoRotateMs ? 'active' : ''}
              aria-pressed={opt.value === homeBackground.autoRotateMs}
              onClick={() => dispatch({ type: 'SETTINGS_SET_HOME_BG_AUTO_ROTATE', payload: { ms: opt.value } })}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <label className="mb-2.5 flex items-center gap-[7px] text-[0.8438rem] font-bold uppercase tracking-[.03em] text-[var(--text-dim)]">
        Ảnh nền Home (link ảnh hoặc upload)
      </label>
      <div className="mb-1 grid grid-cols-3 gap-3.5">
        {homeBackground.images.map((slot, i) => {
          const isUpload = slot.type === 'upload';
          const isBroken = brokenSlots.has(i);
          return (
            <div className="flex flex-col gap-[7px]" key={i}>
              <button
                type="button"
                className={`relative w-full cursor-pointer overflow-hidden rounded-[10px] border-2 border-transparent
                  bg-[var(--raised)] bg-cover bg-center p-0 shadow-[0_0_0_1px_var(--border)_inset]
                  transition-[border-color,transform] duration-150 [transition-timing-function:var(--ease-standard)]
                  [aspect-ratio:4/3] hover:scale-[1.02]
                  ${i === homeBackground.index ? 'border-[color:var(--accent)]' : ''}`}
                style={{ backgroundImage: `url('${slot.value}')` }}
                title="Dùng ảnh này ngay"
                aria-label={`Dùng ảnh nền số ${i + 1}`}
                onClick={() => dispatch({ type: 'SETTINGS_SET_HOME_BG_INDEX', payload: { index: i } })}
              >
                {isBroken && (
                  <span className="absolute inset-0 flex items-center justify-center bg-[rgba(220,60,60,.55)] text-[0.6875rem] font-semibold text-white">
                    Link lỗi
                  </span>
                )}
              </button>
              <div className="flex items-center gap-1.5">
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
                  className="min-w-0 w-full rounded-md border border-[color:var(--border)] bg-[var(--raised)] px-[7px]
                    py-[5px] text-[0.7188rem] text-[var(--text)] disabled:cursor-default disabled:text-[var(--text-dim)]"
                />
                <button
                  type="button"
                  className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-md border
                    border-[color:var(--border)] bg-[var(--raised)] text-[var(--text-dim)] transition-[color,border-color]
                    duration-150 [transition-timing-function:var(--ease-standard)] hover:border-[color:var(--accent)] hover:text-[var(--accent)]"
                  title="Upload ảnh từ máy"
                  aria-label={`Upload ảnh từ máy cho ô số ${i + 1}`}
                  onClick={() => fileInputRefs.current[i]?.click()}
                >
                  <Upload className="icon h-[13px] w-[13px]" size={13} />
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
                <button
                  type="button"
                  className="inline-flex w-full items-center gap-1 bg-transparent p-0 text-left text-[0.6562rem]
                    font-semibold text-[var(--accent)]"
                  onClick={() => useLinkForSlot(i)}
                >
                  <Link2 className="icon h-[11px] w-[11px]" size={11} /> Dùng link
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="hint">
        Click vào ảnh để áp dụng ngay. Sửa link rồi nhấn Enter/click ra ngoài để áp dụng — link lỗi sẽ không được lưu.
        Upload ảnh từ máy sẽ tự resize/nén trước khi lưu, đồng bộ qua mọi thiết bị đã đăng nhập.
      </p>
      {uploadError && (
        <p className="hint" style={{ color: 'var(--reminder-color)' }}>
          {uploadError}
        </p>
      )}
    </div>
  );
}
