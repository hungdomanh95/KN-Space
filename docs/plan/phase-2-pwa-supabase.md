# Phase 2 — PWA + Supabase (mobile + cloud sync) ⏸ HOÃN

> Mở khoá sau khi Phase 1 (Extension) chạy ổn cho cá nhân. Nội dung gốc từ requirements vòng 23.

## Mục tiêu
Đưa dashboard từ extension lên **web app chạy được cả desktop lẫn điện thoại** qua 1 URL, dữ liệu lưu cloud (không còn phụ thuộc Chrome account). **Vẫn là bản cá nhân** — chưa chia sẻ.

## Vì sao cần
Extension (Phase 1) không chạy trên Chrome mobile, mà nhu cầu thật là **note nhanh trên điện thoại**. Phase này giải quyết điều đó.

## Nền tảng
- **React + Vite** từ Phase 1, bổ sung **`vite-plugin-pwa`** (manifest + service worker, cài lên màn hình chính) — F35.
- **Supabase** (Postgres) làm nguồn dữ liệu cloud thay `chrome.storage`; **Google OAuth** đăng nhập — F33.
- **Offline-first**: optimistic update + IndexedDB queue + replay — F10.
- **Mobile redesign có chủ đích** (khối xếp dọc, masonry 1 cột, modal full-screen, touch target) — F34.
- Hosting **Vercel**, HTTPS bắt buộc.

## Việc chính
- Tái dùng UI/logic React dashboard đã ổn định ở Phase 1, tách phần extension-specific khỏi web/PWA shell.
- Migrate dữ liệu người dùng từ `chrome.storage` → Supabase (export JSON từ Phase 1 import lên).
- Schema cá nhân (gắn `user_id`) + RLS `auth.uid() = user_id`. *(Lưu ý: nếu muốn Phase 3 không phải migrate, cân nhắc dựng sẵn model space-centric + `space_members` đơn-thành-viên ngay từ đây.)*
- Sync realtime giữa các thiết bị của chính user.

## Carry over từ Phase 1
Toàn bộ UX 5 khối + đa Space + settings đã chốt; chỉ đổi storage layer + thêm auth + mobile variant.
