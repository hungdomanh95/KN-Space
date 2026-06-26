# Phase 2 — Web App + Supabase (mobile + cloud sync) 🚧 ĐANG LÀM — Bước 1 + phần lớn Bước 2 ĐÃ BUILD VÀ CHẠY THẬT

> Đã thay thế hoàn toàn Phase 1 (Extension). Thư mục `extension/` đã bị xoá khỏi repo. Nội dung dưới đây mô tả đúng những gì đã build trong `webapp/` (xác nhận qua đọc code thật, không chỉ theo kế hoạch ban đầu) — các điểm khác biệt so với kế hoạch gốc được ghi rõ ở mục "Khác biệt so với kế hoạch ban đầu" cuối file.

## Mục tiêu
Đưa dashboard từ extension lên **web app chạy được cả desktop lẫn điện thoại** qua 1 URL riêng, dữ liệu lưu cloud (không còn phụ thuộc Chrome account). **Vẫn là bản cá nhân** — chưa chia sẻ/membership.

## Vì sao cần
Extension (Phase 1) không chạy trên Chrome mobile, mà nhu cầu thật là **note nhanh trên điện thoại**. Phase này giải quyết điều đó.

## Nền tảng (đã build)
- **React + TypeScript + Vite + Tailwind CSS** (`webapp/`) — kế thừa logic/UX từ Phase 1, viết lại UI bằng Tailwind thay CSS thủ công.
- **Supabase** (Postgres + Auth + Realtime) làm nguồn dữ liệu cloud duy nhất, thay hoàn toàn `chrome.storage`.
- **Đăng nhập: Google OAuth** (`supabase.auth.signInWithOAuth({ provider: 'google' })`, file `webapp/src/auth/LoginScreen.tsx`) — **không phải magic-link email**. Lý do đổi: đã thử magic-link trước, nhưng bị giới hạn rate-limit gửi mail quá thấp của Supabase free tier, không phù hợp UX đăng nhập. App Google Cloud đang ở chế độ "In production" (không giới hạn số test user) nhưng **chưa qua Google verification** — người dùng sẽ thấy cảnh báo "unverified app" khi đăng nhập lần đầu, được chấp nhận ở quy mô cá nhân/1-2 người.
- **Đồng bộ đa máy:** Supabase Realtime, subscribe `postgres_changes` (event `UPDATE`) trên bảng `kn_space_state` lọc theo `user_id` (`webapp/src/storage/supabaseStore.ts`).
- **Hosting:** Vercel, domain riêng **`kn-space.io.vn`** (mua tại matbao.net), DNS trỏ A record `216.198.79.1` + CNAME `www`.
- **PWA (một phần):** có `webapp/public/manifest.webmanifest` (icon 192/512, `display: standalone`) để "Add to Home Screen" trên iOS/Android, mở full-screen như app gốc. **Chưa có service worker / offline-first** — cố ý chưa làm ở bước này, có thể bổ sung sau nếu phát sinh nhu cầu rõ ràng (vd. cần dùng khi mất mạng).
- **Mobile responsive có chủ đích, KHÔNG phải mobile redesign đầy đủ:**
  - Ở `≤639px` (`webapp/src/layout/AppLayout.tsx`, hằng số `MOBILE_BREAKPOINT_QUERY`), Dashboard **chỉ hiện 2 khối**: Việc cần làm + Ghi chú. Nhắc việc/Thói quen/Thông báo/Hôm nay bị ẩn hoàn toàn trên mobile — quyết định có chủ đích để giảm rối trên màn hẹp, áp dụng như một lớp lọc RENDER riêng, **tách biệt hoàn toàn** với `space.enabledBlocks` (cấu hình ẩn/hiện khối theo từng Space, vẫn áp dụng đồng thời và đồng bộ trên cả desktop/mobile).
  - 2 khối này hoạt động dạng **accordion**: khối đang mở chiếm ~80% chiều cao, khối còn lại thu nhỏ thành thanh tóm tắt (icon + tên + số lượng + 1 dòng preview), bấm vào thanh tóm tắt để đổi chỗ. Mặc định mở "Việc cần làm" (khối hành động, ưu tiên kiểm tra trước khi ghi note — quyết định đã chốt với chủ dự án).
  - Trên mobile **không có nút "Về Home"** — chỉ còn Space-switcher ở trên cùng + nút Settings (khối `DashboardCorner`/`settings` luôn hiện, không tính vào danh sách 2 khối được phép trên mobile vì đây là chrome điều hướng, không phải khối nội dung).
  - Đa Space và toàn bộ Settings (theme, accent, ảnh nền, quote, export/import...) vẫn đầy đủ và hoạt động trên mobile.

## Schema dữ liệu thật (`webapp/supabase/schema.sql`)
Đơn giản hơn nhiều so với dự kiến ban đầu trong plan gốc:

```sql
create table public.kn_space_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  spaces jsonb not null default '[]'::jsonb,
  current_space_id text not null default '',
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
```

- **1 bảng duy nhất, 1 hàng/user** (PK = `user_id`) — gộp toàn bộ `spaces` (mảng JSON, mỗi space tự chứa task/reminder/habit/note của nó) và `settings` vào 2 cột `jsonb`, **KHÔNG tách bảng riêng cho task/note/habit/reminder/space** như mô hình quan hệ "đúng chuẩn" có thể đã nghĩ tới ban đầu.
- **Lý do gộp 1 bảng JSON:** workaround tách-key theo space/settings ở bản `chrome.storage` cũ tồn tại để né giới hạn ~8KB/item của `chrome.storage.sync` — giới hạn này **không tồn tại** với Postgres `jsonb` (giới hạn thực tế là kích thước row/TOAST, tính bằng GB). Ở quy mô 1-2 người dùng hiện tại, gộp 1 bảng JSON đơn giản hơn nhiều để code/maintain (đọc/ghi 1 lần là đủ toàn bộ state), đánh đổi là không query/index được theo từng task/note riêng lẻ — chấp nhận được vì chưa cần tính năng kiểu "tìm task xuyên Space" hay phân trang phía server.
- **RLS:** 4 policy `select/insert/update/delete` đều `using/with check (auth.uid() = user_id)` — đúng tinh thần đã chốt trong `storage-decision.md` gốc, không có khái niệm chia sẻ/membership ở đây (đó là Phase 3).
- **Realtime:** bật qua `alter publication supabase_realtime add table public.kn_space_state`.

## Tầng storage thật (`webapp/src/storage/supabaseStore.ts`)
- `loadAppState()`: đọc đúng 1 hàng theo `user_id`; trả `null` nếu user mới chưa có hàng nào (caller seed dữ liệu demo).
- `flushSave(snapshot)`: `upsert` 1 hàng nguyên `{ user_id, spaces, current_space_id, settings, updated_at }`.
- `scheduleSave()`/`forceFlush()`: giữ nguyên cơ chế **debounce 600ms** từ bản `chrome.storage` cũ, để tránh ghi network dồn dập theo từng keystroke/tick checkbox.
- `subscribeStorageChanges(callback)`: subscribe Realtime `UPDATE` theo `user_id`, dùng để đồng bộ UI khi có thay đổi từ máy khác.
- Không còn khái niệm "fallback local" (đặc thù `chrome.storage.sync → local`) — nếu ghi Supabase lỗi, hàm trả `{ fellBack: true }` nhưng ý nghĩa đã đổi: hiện cảnh báo, không có nơi nào khác để "rơi xuống" như local trước đây (cần làm rõ hành vi UX thật khi mất mạng — xem mục câu hỏi mở).

## Migrate dữ liệu từ bản extension cũ
Dùng đúng cơ chế Export/Import JSON đã có sẵn từ Phase 1 (không cần xây thêm gì mới): export từ bản extension cũ → đăng nhập web app mới → import file JSON đó vào.

## Carry over từ Phase 1
Toàn bộ UX 5 khối + đa Space + settings (theme, accent, ảnh nền, quote, export/import) được giữ nguyên bản chất; chỉ đổi storage layer (`chrome.storage` → Supabase) + thêm auth (Google OAuth) + thêm biến thể mobile (2 khối + accordion, không phải redesign toàn bộ UI mobile).

## Khác biệt so với kế hoạch ban đầu (bản gốc viết ở vòng 23)
1. **Đăng nhập: Google OAuth, không phải magic-link/email** như có thể đã giả định ban đầu — đổi vì rate-limit gửi mail của Supabase free tier quá thấp cho UX đăng nhập thực tế.
2. **Schema 1 bảng JSON, không tách bảng theo từng loại dữ liệu** — đơn giản hơn nhiều so với mô hình quan hệ chuẩn, chấp nhận đánh đổi không query/index theo entity riêng lẻ ở quy mô hiện tại.
3. **PWA mới làm phần "cài lên màn hình chính" (manifest + icon), CHƯA có service worker/offline-first** — khác với mô tả "Offline-first: optimistic update + IndexedDB queue + replay" trong kế hoạch gốc. Đây là phần **chưa làm**, không phải đã làm xong rồi bỏ.
4. **Mobile là "ẩn bớt khối + accordion 2 khối", không phải "mobile redesign đầy đủ" (khối xếp dọc toàn bộ, masonry 1 cột, modal full-screen, touch target riêng)** như mô tả "F34" trong kế hoạch gốc — phạm vi mobile hiện tại hẹp hơn, tập trung vào 2 use-case chính (xem task hôm nay, ghi note nhanh), chưa tối ưu hoá toàn bộ UI cho touch.
5. Domain riêng (`kn-space.io.vn` qua matbao.net) là chi tiết triển khai cụ thể, kế hoạch gốc chỉ ghi "Hosting Vercel, HTTPS bắt buộc" — đã hiện thực hoá đúng hướng đó, không có gì trái kế hoạch.

## Việc còn lại / chưa làm (để tiếp tục Phase 2 hoặc đẩy sang phase sau)
- Service worker / offline-first thật cho PWA (nếu xác nhận cần).
- Mobile redesign sâu hơn cho 4 khối còn lại (Nhắc việc/Thói quen/Thông báo/Hôm nay) nếu sau này quyết định không ẩn nữa.
- Xử lý UX rõ ràng khi mất mạng giữa lúc đang sửa dữ liệu (hiện chỉ có cảnh báo nhẹ qua `fellBack`, chưa rõ có giữ lại thay đổi để retry hay mất).
- Google OAuth verification chính thức (gỡ cảnh báo "unverified app") nếu mở rộng người dùng ngoài 1-2 người hiện tại.
