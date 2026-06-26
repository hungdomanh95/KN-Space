import React from 'react';
import { createPortal } from 'react-dom';
import { useKeyboardAwareHeight } from '../layout/useKeyboardAwareHeight';

interface ModalProps {
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}

/**
 * Overlay nền đặc + đóng khi click ra ngoài (mousedown trên overlay, không phải modal).
 * Render qua portal vào document.body: .topbar/.main-block/.sub-block dùng backdrop-filter
 * (kính mờ) nên tự tạo containing block cho mọi descendant position:fixed — nếu modal nằm
 * lồng trong cây DOM của các khối đó, "fixed" sẽ bị kẹt trong khung khối cha thay vì phủ
 * toàn viewport. Portal thoát hẳn ra ngoài cây đó để fixed luôn tính theo viewport.
 *
 * `height: keyboardAwareHeight` (thay `inset-0` thuần) — Safari iOS không tự co
 * `position:fixed` theo bàn phím ảo (bug WebKit đã xác nhận qua test thật), nên modal full-
 * screen mobile (`max-md:h-full`) cứ giữ chiều cao gốc dù bàn phím che mất 1 phần — input/nút
 * Lưu phía dưới có thể nằm sau bàn phím, buộc Safari phải tự zoom thật để kéo lên cho thấy
 * được. Co theo `window.visualViewport.height` để modal luôn vừa khít phần màn hình còn thấy.
 */
export function Modal({ onClose, className, children }: ModalProps) {
  const keyboardAwareHeight = useKeyboardAwareHeight();
  return createPortal(
    <div
      className="overlay fixed left-0 right-0 top-0 z-50 flex items-center justify-center bg-[rgba(20,20,30,.45)] backdrop-blur-[2px] animate-overlayFadeIn"
      style={{ height: keyboardAwareHeight }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal max-h-[85vh] w-[440px] max-w-[90vw] overflow-y-auto rounded-2xl border border-[color:var(--border-hairline)] bg-[var(--modal-bg)] p-[22px] shadow-[0_20px_60px_rgba(0,0,0,.16)] animate-modalPopIn max-md:h-full max-md:max-h-full max-md:w-full max-md:max-w-full max-md:rounded-none ${className ?? ''}`.trim()}
        onFocus={(e) => {
          // Bàn phím ảo mobile có thể che field đang nhập (đặc biệt textarea dài) — cuộn nó
          // vào giữa vùng nhìn thấy. Delay nhẹ để chờ bàn phím bắt đầu đẩy viewport trước.
          const target = e.target;
          if (target.matches('input, textarea, select')) {
            setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
          }
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
