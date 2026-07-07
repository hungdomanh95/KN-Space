import { useEffect, useState } from 'react';

/** Dưới mốc này (kể cả desktop resize cửa sổ hẹp lại) chuyển sang UI mobile — xem AppLayout.tsx. */
export const MOBILE_ENTER_MAX = 999;
/** Chỉ thoát khỏi UI mobile khi vượt HẲN qua mốc này — lệch ra so với MOBILE_ENTER_MAX có chủ
 * đích (hysteresis): nếu dùng đúng 1 mốc duy nhất, kéo cửa sổ dao động đúng quanh ranh giới
 * (vd tay run khi resize) sẽ làm UI nhảy qua lại liên tục giữa 2 mô hình hoàn toàn khác nhau
 * (cột tự do desktop <-> Chat-first mobile) — giật hơn nhiều so với resize layout thường vì 2
 * bên có cấu trúc DOM khác hẳn. Vùng đệm 1000-1010px giữ nguyên trạng thái hiện tại, không đổi. */
const MOBILE_EXIT_MIN = 1010;

/**
 * true = đang ở UI mobile (Chat-first), false = desktop. Có hysteresis (xem 2 hằng số trên) —
 * dùng thay cho `useMediaQuery` thuần ở đúng breakpoint chuyển-mô-hình-UI này.
 */
export function useMobileLayout(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_ENTER_MAX);

  useEffect(() => {
    let frame: number | null = null;
    function check() {
      const width = window.innerWidth;
      setIsMobile((prev) => {
        if (prev) return width < MOBILE_EXIT_MIN; // đang mobile — chỉ thoát khi vượt hẳn qua
        return width <= MOBILE_ENTER_MAX; // đang desktop — chỉ vào mobile khi xuống hẳn dưới
      });
    }
    function onResize() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        check();
      });
    }
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return isMobile;
}
