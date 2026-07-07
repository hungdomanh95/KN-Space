import { useEffect, useState } from 'react';

/**
 * Chiều cao CỐ ĐỊNH theo `window.innerHeight` đo lúc mount — KHÔNG dùng `100vh`/`inset:0` trực
 * tiếp cho khung `position:fixed` chứa input. Trên Safari iOS, mở bàn phím ảo co lại VISUAL
 * viewport — nếu khung `fixed` bám theo nó (qua `inset:0`/`100vh`), nó co theo bàn phím, ép nội
 * dung bị nén/cắt và (nếu có ảnh `bg-cover` ở dưới) làm ảnh nhìn như bị ZOOM (đã gặp khi test).
 *
 * CỐ Ý KHÔNG lắng nghe `resize` — trên một số phiên bản iOS Safari, `window.innerHeight` CŨNG
 * đổi theo khi bàn phím mở/đóng (không ổn định như tài liệu mô tả), nên nếu cập nhật lại theo
 * `resize` thì vẫn bị "ăn" theo bàn phím qua đường này, fix coi như vô nghĩa. Chỉ đo 1 LẦN lúc
 * mount + cập nhật lại khi xoay màn hình thật (orientationchange — tín hiệu rõ ràng hơn, không
 * lẫn với bàn phím). Đánh đổi: nếu người dùng resize cửa sổ desktop thật (hiếm, vì component
 * này chủ yếu phục vụ mobile) sẽ không tự cập nhật theo — chấp nhận được.
 */
export function useStableViewportHeight(): number {
  const [height, setHeight] = useState(() => window.innerHeight);

  useEffect(() => {
    function update() {
      // Đợi 1 tick cho UI ổn định sau khi xoay màn hình trước khi đo lại.
      setTimeout(() => setHeight(window.innerHeight), 50);
    }
    window.addEventListener('orientationchange', update);
    return () => window.removeEventListener('orientationchange', update);
  }, []);

  return height;
}
