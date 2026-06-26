import { useEffect, useState } from 'react';

/**
 * Chiều cao CỐ ĐỊNH theo `window.innerHeight` (layout viewport) — KHÔNG dùng `100vh`/`inset:0`
 * trực tiếp cho khung `position:fixed` chứa input. Trên Safari iOS, mở bàn phím ảo co lại
 * VISUAL viewport (không co LAYOUT viewport) — nếu khung `fixed` bám theo visual viewport
 * (qua `inset:0`/`100vh`), nó co lại theo bàn phím, ép nội dung bên trong bị nén/cắt và (nếu
 * có ảnh `bg-cover` ở dưới) làm ảnh nhìn như bị ZOOM vào (đã gặp khi test thật, xem
 * AppBackground.tsx/App.tsx). `window.innerHeight` không đổi khi bàn phím mở/đóng trên iOS
 * Safari — dùng nó khoá chiều cao thật, chỉ đổi theo xoay màn hình/resize cửa sổ thật.
 */
export function useStableViewportHeight(): number {
  const [height, setHeight] = useState(() => window.innerHeight);

  useEffect(() => {
    function update() {
      setHeight(window.innerHeight);
    }
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return height;
}
