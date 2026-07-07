import type { CSSProperties, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

interface ModalProps {
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

// Ẩn khỏi hiển thị nhưng vẫn đọc được bởi screen reader — dùng cho Dialog.Title bắt buộc
// của Radix. Mọi modal gọi component này đều tự render <h2> riêng trong children, nên title
// thật (visible) là cái children tự vẽ; title ẩn ở đây chỉ để tắt warning + khai báo a11y.
const visuallyHiddenStyle: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/**
 * Overlay nền đặc + đóng khi click ra ngoài, Escape, hoặc bất kỳ tương tác nào Radix Dialog
 * coi là "đóng" (onOpenChange(false)). Dialog.Portal render ra ngoài document.body: tương tự
 * lý do dùng createPortal trước đây — .topbar/.main-block/.sub-block dùng backdrop-filter
 * (kính mờ) nên tự tạo containing block cho mọi descendant position:fixed — nếu modal nằm
 * lồng trong cây DOM của các khối đó, "fixed" sẽ bị kẹt trong khung khối cha thay vì phủ
 * toàn viewport. Portal thoát hẳn ra ngoài cây đó để fixed luôn tính theo viewport.
 *
 * `open` luôn true: component này chỉ được render khi cha muốn hiện modal, và unmount khi
 * đóng (pattern có sẵn của 10 modal gọi Modal) — không đổi cách gọi, chỉ dùng onOpenChange
 * để bắt mọi lý do đóng (click nền, Escape) rồi gọi lại đúng onClose có sẵn.
 */
export function Modal({ onClose, className, children }: ModalProps) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,20,30,.45)] backdrop-blur-[2px] animate-overlayFadeIn">
          <Dialog.Content
            className={`modal max-h-[85vh] w-[440px] max-w-[90vw] overflow-y-auto rounded-2xl border border-[color:var(--border-hairline)] bg-[var(--modal-bg)] p-[22px] shadow-[0_20px_60px_rgba(0,0,0,.16)] animate-modalPopIn max-md:h-full max-md:max-h-full max-md:w-full max-md:max-w-full max-md:rounded-none ${className ?? ''}`.trim()}
            aria-describedby={undefined}
            onFocus={(e) => {
              // Bàn phím ảo mobile có thể che field đang nhập (đặc biệt textarea dài) — cuộn nó
              // vào giữa vùng nhìn thấy. Delay nhẹ để chờ bàn phím bắt đầu đẩy viewport trước.
              const target = e.target;
              if (target.matches('input, textarea, select')) {
                setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
              }
            }}
          >
            <Dialog.Title style={visuallyHiddenStyle}>Hộp thoại</Dialog.Title>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
