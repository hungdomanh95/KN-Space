import { useEffect, useState } from 'react';

/**
 * Chiều cao THẬT đang hiển thị được (tự co khi bàn phím ảo mở) — dùng cho khung chứa INPUT.
 *
 * Bug WebKit đã xác nhận qua test thật: `position: fixed` trên Safari iOS KHÔNG tự co theo
 * bàn phím ảo như trực giác thông thường — nó giữ nguyên kích thước gốc (layout viewport),
 * khiến input/nội dung nằm gần đáy bị bàn phím che mất (ngoài tầm nhìn). Khi input bị che,
 * Safari tự ZOOM THẬT vào để "kéo" input lên cho thấy được — đây chính là hiện tượng "bấm
 * vào input bị zoom" đã gặp khi test (xác nhận: pinch-out tự thu zoom lại được = zoom thật
 * của trình duyệt, không phải ảo giác CSS).
 *
 * `window.visualViewport.height` là API DUY NHẤT phản ánh đúng phần màn hình đang thấy được
 * (co lại khi bàn phím mở) — dùng nó làm `height` thật cho khung chứa input để input luôn tự
 * nổi lên trên bàn phím, Safari không cần phải zoom giúp nữa.
 */
export function useKeyboardAwareHeight(): number {
  const [height, setHeight] = useState(() => window.visualViewport?.height ?? window.innerHeight);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      setHeight(vv!.height);
    }
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  return height;
}
