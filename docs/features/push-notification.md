# Tính năng: Push Notification (thật)

> Xây trên nền Phase 2 (Web App + Supabase). Đây là tính năng **cộng thêm** vào khối "Nhắc việc" và "Việc cần làm" — không đổi mô hình dữ liệu cốt lõi.
> Tài liệu này ghi lại các quyết định đã chốt qua nhiều vòng trao đổi với chủ dự án — là input cho `uiux` + `dev` sprint tiếp theo.
> Cập nhật: 2026-07-03.

---

## 0. Bối cảnh & quyết định ưu tiên

Chủ dự án cân nhắc 2 hướng phát triển tiếp theo: nâng cấp Ghi chú thành block-based rich text (kiểu Notion), và làm Push Notification thật. **Đã chốt làm Push Notification trước**, vì hai lý do:

1. Đúng trọng tâm sản phẩm — Nhắc việc là 1 trong 6 khối cốt lõi của Dashboard, và hiện tại nhắc việc chỉ hoạt động khi app đang mở (không có gì báo khi đóng app).
2. Không đụng/phá vỡ dữ liệu hiện có. Note kiểu Notion là breaking change model dữ liệu Note — rủi ro cao hơn, nên hoãn lại, **chưa lên kế hoạch**.

Mục tiêu chính đã xác nhận: push phải hoạt động **cả khi đã đóng app trên điện thoại** (giống app native), không chỉ khi tab đang mở.

---

## 1. Tổng quan

Push Notification cho phép KN-Space chủ động gửi thông báo tới thiết bị của người dùng khi có **Nhắc việc** hoặc **Việc cần làm có deadline** đến hạn — kể cả khi app đang đóng — thông qua cơ chế PWA + Service Worker + Web Push chuẩn của trình duyệt (không phụ thuộc dịch vụ bên thứ 3 nào ngoài hạ tầng Supabase đang dùng).

**Phạm vi & thứ tự ưu tiên trigger:**

| Ưu tiên | Nguồn | Trạng thái |
|---|---|---|
| 1 | Nhắc việc (Reminder) — cả `once` và `recurring` | Làm ngay, đợt 1 |
| 2 | Việc cần làm (Task) có deadline (`date`/`time`) | Làm cùng đợt 1 (chung cơ chế cron quét "đến hạn") |
| 3 | Thói quen (Habit) chưa tick cuối ngày | **Hoãn sang bản sau** — bản chất khác (1 lần gửi cố định cuối ngày, cần trạng thái riêng để tránh gửi trùng) |

Reminder được ưu tiên cao nhất vì đã có "giờ hẹn" tường minh và logic tính giờ gần nhất đã có sẵn ở client (`computeNotifications.ts`).

---

## 2. User Stories

- Là người dùng, tôi muốn nhận thông báo trên điện thoại đúng giờ hẹn của một Nhắc việc, kể cả khi tôi đã đóng app/tắt màn hình.
- Là người dùng, tôi muốn nhận thông báo khi một Việc cần làm có deadline đến đúng giờ.
- Là người dùng, tôi muốn bấm vào thông báo và được mở thẳng tới đúng item đó trong Dashboard, không phải tự tìm lại.
- Là người dùng, tôi muốn tự bật/tắt thông báo đẩy trong Settings và luôn biết rõ trạng thái hiện tại (đã cài app chưa, đã cấp quyền chưa).
- Là Member của Shared Space, tôi muốn nhận thông báo về Nhắc việc/Task đến hạn trong Space đó giống như mọi thành viên khác (không có khái niệm phân công riêng).

---

## 3. Luồng chi tiết

### 3.1 Bật thông báo lần đầu

1. App **không** xin quyền Notification ngay khi mở lần đầu.
2. App chờ tín hiệu người dùng có ý định dùng thật — ví dụ ngay sau khi họ tạo Reminder hoặc Task đầu tiên — mới gợi ý bật thông báo (toast/banner nhẹ, không chặn luồng).
3. Người dùng cũng có thể tự vào Settings → tab "Chung" → khối "Thông báo đẩy" để bật bất cứ lúc nào.
4. **Bắt buộc cài PWA (Add to Home Screen) trước khi xin quyền Notification trên điện thoại** — đặc biệt iOS Safari (16.4+) yêu cầu bắt buộc; mở qua tab Safari thường (chưa cài) sẽ không nhận được push khi đóng tab dù `Notification.permission` có báo `granted`.
   - Android/Chrome: dùng sự kiện `beforeinstallprompt` để cài 1 chạm.
   - iOS Safari: không có API cài tự động — phải hướng dẫn thủ công ("Nhấn icon Chia sẻ → Thêm vào Màn hình chính").
5. Sau khi app chạy ở chế độ standalone (đã cài), người dùng bấm "Bật thông báo" → `Notification.requestPermission()` → nếu `granted` → `pushManager.subscribe()` với VAPID public key → lưu subscription vào Supabase.

### 3.2 Nhận thông báo

1. Supabase Edge Function chạy cron mỗi 1 phút, quét toàn bộ Reminder (once + recurring) và Task có deadline đang "đến hạn" trong cửa sổ hiện tại (theo mọi user/mọi Space).
2. Với mỗi item đến hạn, Edge Function lấy danh sách subscription liên quan (owner với Space cá nhân; toàn bộ Member với Shared Space) và gọi Web Push API gửi tới từng subscription.
3. Mỗi item chỉ gửi **đúng 1 lần cho mỗi lần đến hạn** — có cơ chế đánh dấu đã gửi để tránh gửi trùng khi cron chạy chồng hoặc lỡ nhịp (xem mục 7 Schema).
4. Service Worker (`sw.ts`) nhận sự kiện `push`, parse JSON payload, gọi `showNotification()`.
5. Người dùng bấm vào thông báo → sự kiện `notificationclick` mở URL dạng `/?open=task:<id>` hoặc `/?open=reminder:<id>` → app mở thẳng Dashboard, tự chuyển đúng Space chứa item đó (nếu khác Space đang active) rồi cuộn tới item.

### 3.3 Tắt / trạng thái quyền bị thu hồi

- App **không có API** để chủ động phát hiện người dùng tắt quyền notification ở cấp hệ điều hành/trình duyệt — chỉ có thể tự kiểm tra lại `Notification.permission` mỗi khi người dùng mở lại tab Settings.
- Nếu người dùng từ chối quyền (`denied`): app không tự động hỏi lại (trình duyệt cũng chủ động chặn re-prompt) — chỉ hiển thị trạng thái tĩnh kèm hướng dẫn tự bật lại trong cài đặt hệ thống/trình duyệt.

---

## 4. Permission

Không có phân quyền theo role (Owner/Member) riêng cho tính năng này. Trong Shared Space, thông báo **đến hạn** (Reminder/Task deadline — nội dung tài liệu này) gửi cho **tất cả Member** (kể cả người tạo item), không phân biệt assignee.

> **Cập nhật 2026-07-06:** khái niệm "assignee" + thông báo theo *sự kiện* (task tạo mới có giao việc / task hoàn thành) đã được lên kế hoạch — xem `docs/features/shared-space-task-assign-notify.md`. Đây là **cơ chế khác** (event-driven, không qua cron) và **không thay đổi** hành vi thông báo đến hạn mô tả trong tài liệu này.

---

## 5. UX / UI

### 5.1 Vị trí trong Settings

Gộp vào tab **"Chung"** hiện có (không thêm tab mới) — 1 khối mới "Thông báo đẩy" gồm:
- Toggle bật/tắt (`role="switch"`, `aria-checked` đồng bộ đúng state thật).
- Dòng trạng thái hiển thị **rõ bằng chữ** (không chỉ dựa vào màu sắc), một trong các giá trị:
  - "Chưa cài ứng dụng" — chưa ở chế độ PWA standalone.
  - "Đã cài, chưa cấp quyền" — đã standalone nhưng `Notification.permission !== 'granted'`.
  - "Đã bật" — đã có subscription hợp lệ.
  - "Trình duyệt/thiết bị không hỗ trợ" — API Push/Notification không tồn tại.

### 5.2 Desktop

Vẫn hiện cùng UI này trong Settings trên desktop (không ẩn riêng theo thiết bị, không cần logic disable riêng) — desktop tự nhiên rơi về trạng thái "Chưa cài ứng dụng" nếu trình duyệt không chạy ở chế độ PWA standalone.

### 5.3 Nội dung thông báo

- Tiền tố nguồn gốc ngắn + tên item, tối đa khoảng 1 dòng. Ví dụ: "Nhắc việc: Họp team 15h" hoặc "Việc cần làm: Nộp báo cáo".
- Bấm vào mở thẳng Dashboard đúng Space/item (không phải màn Home).

### 5.4 Accessibility

- Toggle dùng `role="switch"` + `aria-checked` phản ánh đúng state thật (không phải chỉ animation UI).
- Trạng thái luôn có text tường minh đặt cạnh toggle, đủ tương phản ở cả 2 theme (sáng/tối).

---

## 6. Behavior đặc biệt

- **Độ trễ chấp nhận được: 0-60s** so với giờ hẹn chính xác, do chạy theo chu kỳ cron mỗi phút — đây **không phải push tức thời real-time**. Cần nêu rõ với người dùng/stakeholder để không kỳ vọng sai.
- Không gửi buffer sớm ở bản đầu (không có "nhắc trước 5 phút") — gửi đúng giờ hẹn.
- Đa thiết bị: 1 user có thể có nhiều dòng subscription (nhiều điện thoại/máy đã cài PWA + cấp quyền). Khi gửi, gửi tới **toàn bộ** subscription của user đó, không hỏi chọn thiết bị.
- Rủi ro trùng lặp logic: `computeNotifications.ts` (client, tính để hiển thị) và logic tính "đến hạn" ở Edge Function (server, tính để gửi) là **2 nơi riêng biệt**, không dùng chung được vì khác runtime (client đọc React state, server phải query Postgres trực tiếp). Khi sửa logic tính giờ đến hạn ở 1 bên, cần rà soát đồng bộ bên còn lại — xem thêm mục Câu hỏi mở.

---

## 7. Out of Scope (bản đầu)

- Tuỳ biến âm thanh/giao diện notification.
- Action button trên notification (Snooze/Done ngay tại notification).
- Thống kê đã đọc/chưa đọc.
- Gửi email song song.
- Buffer thời gian gửi sớm (nhắc trước N phút).
- Digest tổng hợp theo ngày.
- "Giờ yên tĩnh" (do not disturb).
- Trigger từ Thói quen (Habit chưa tick cuối ngày) — hoãn sang bản sau.
- ~~Khái niệm "assignee" trong Shared Space~~ — **đã lên kế hoạch**, xem `docs/features/shared-space-task-assign-notify.md` (không còn out-of-scope, nhưng là tài liệu/cơ chế riêng).

---

## 8. Edge Cases

| Case | Hành vi mong đợi |
|---|---|
| Subscription hỏng (endpoint trả lỗi `410 Gone` khi gửi — user thu hồi quyền, đổi điện thoại, gỡ app) | Edge Function tự bắt lỗi, xoá subscription hỏng khỏi bảng, không crash cả batch gửi |
| User có nhiều thiết bị đã subscribe | Gửi tới toàn bộ subscription của user đó, không hỏi chọn thiết bị |
| iOS Safari chưa cài PWA, bấm "Bật thông báo" | Phát hiện chưa ở chế độ standalone → hướng dẫn cài trước, **không** cho bấm xin quyền trực tiếp (sẽ báo `granted` nhưng thực tế không nhận được push khi đóng tab) |
| Người dùng từ chối quyền (`denied`) | Không tự động hỏi lại (trình duyệt chặn re-prompt) — chỉ hiện trạng thái tĩnh + hướng dẫn tự bật lại trong cài đặt hệ thống |
| Cron chạy chồng hoặc lỡ nhịp cùng 1 item đến hạn | Cần cơ chế đánh dấu "đã gửi" (field/log) để đảm bảo mỗi item chỉ gửi đúng 1 lần/lần đến hạn |
| Item thuộc Space khác Space đang active khi bấm vào notification | App tự chuyển Space trước khi cuộn tới item |
| Không có API lắng nghe user tắt quyền ở cấp OS | Chỉ tự kiểm tra lại `Notification.permission` mỗi khi mở lại tab Settings, không có cách phát hiện chủ động khác |

---

## 9. Kiến trúc kỹ thuật

### 9.1 PWA + Service Worker

Hiện repo **chưa có** service worker nào (chỉ có `manifest.webmanifest` cơ bản). Cần thêm:
- `vite-plugin-pwa` ở mode `injectManifest`.
- File `sw.ts` riêng, xử lý:
  - Sự kiện `push`: parse JSON payload → `showNotification()`.
  - Sự kiện `notificationclick`: mở đúng URL/deep-link (ví dụ `/?open=task:<id>`).

### 9.2 VAPID key + Subscription

- Sinh VAPID key pair 1 lần bằng CLI — chuẩn mở của trình duyệt, không cần đăng ký dịch vụ bên thứ 3.
- Public key đưa vào client qua biến env Vite.
- Private key **chỉ** lưu trong Supabase Edge Function secret — không vào client bundle, không vào repo.

**Luồng subscribe:**
`Notification.requestPermission()` → `pushManager.subscribe()` → lưu `{ endpoint, keys }` vào bảng Supabase mới `kn_push_subscriptions`.

### 9.3 Bên gửi push — Supabase Edge Function + Supabase Cron

- 1 Edge Function chạy cron mỗi 1 phút, quét Reminder/Task đến hạn trong cửa sổ hiện tại, gọi Web Push API cho từng subscription liên quan.
- Cần viết lại logic tính "đến hạn" riêng ở server — query Postgres trực tiếp, không tái dùng được `computeNotifications.ts` (client).
- Thư viện gửi Web Push trong Deno (runtime Edge Function): thử package `web-push` (npm) qua `npm:` specifier của Deno trước; nếu không tương thích, phương án dự phòng là tự viết VAPID JWT + mã hoá bằng Web Crypto API sẵn có trong Deno.
- **Không** tái dùng `settings` jsonb để lưu subscription — khác vòng đời (subscription gắn theo thiết bị, không phải theo user-state đồng bộ đa máy).

### 9.4 Quyết định hạ tầng: Supabase Edge Function + Cron (không dùng Vercel Cron Jobs)

Đã tra cứu và so sánh trực tiếp (2026-07-03), ghi rõ để không ai đề xuất lại phương án đã loại:

- **Vercel Cron Jobs (gói Hobby/miễn phí đang dùng cho hosting):** chỉ chạy được tối đa **1 lần/ngày** — không đủ tần suất cần thiết (mỗi phút). Muốn chạy dày hơn bắt buộc nâng gói Pro (~$20/tháng).
- **Supabase Edge Function (gói Free):** hạn mức 500.000 lượt gọi/tháng, không giới hạn tần suất cron theo gói. Cron 1 lần/phút = 43.200 lượt/tháng (~9% hạn mức) — con số này **cố định, không tăng theo số user** vì kiến trúc là 1 lượt gọi quét toàn bộ user mỗi lần, không phải 1 lượt/user.
- **Kết luận:** Supabase Edge Function + Supabase Cron (`pg_cron`) là lựa chọn tối ưu cho quy mô dự án — miễn phí, đủ tần suất, không cần đăng ký dịch vụ bên thứ 3 nào, tận dụng luôn hạ tầng Supabase project đang dùng cho toàn bộ dữ liệu khác.
- **Rủi ro cần lưu ý** (không chặn triển khai, chỉ ghi nhận): dự án Supabase gói Free tự "pause" nếu không có traffic trong 1 tuần — cần xác nhận cron nội bộ (`pg_cron`) có tính là "hoạt động" để giữ project sống không. Chủ dự án đã xác nhận app dùng thường xuyên nên chấp nhận rủi ro này ở mức thấp, không cần giải pháp thêm.

---

## 10. Schema định hướng (không phải thiết kế cuối)

**Bảng `kn_push_subscriptions` (mới):**

| Cột | Ghi chú |
|---|---|
| `id` | PK |
| `user_id` | FK `auth.users`, theo convention RLS hiện có |
| `endpoint` | unique — endpoint push của trình duyệt/thiết bị |
| `p256dh` | key mã hoá từ `pushManager.subscribe()` |
| `auth_key` | key mã hoá từ `pushManager.subscribe()` |
| `user_agent` | để debug/hiển thị "thiết bị nào" nếu cần sau này |
| `created_at` | timestamp |

- RLS: `auth.uid() = user_id` cho select/insert/delete — đúng convention Space cá nhân hiện có.
- Edge Function dùng `service_role` key để đọc mọi user (bypass RLS) khi quét và gửi.
- 1 user có thể có nhiều dòng (nhiều thiết bị).

**Cơ chế đánh dấu "đã gửi" (chống gửi trùng):** cần 1 field/log riêng (ví dụ cột `last_notified_at` trên item, hoặc bảng log `kn_push_sent_log` ghi `(item_id, due_at)` đã gửi) — thiết kế chi tiết để dev quyết định khi triển khai, miễn đảm bảo mỗi item chỉ gửi đúng 1 lần/lần đến hạn kể cả khi cron chạy chồng.

> Chi tiết schema (column types, indexes, RLS policies đầy đủ) là việc của dev sprint — không thuộc tài liệu này.

---

## 11. Bổ sung liên quan: giới hạn dung lượng ảnh nền upload

Mục này **liên quan gián tiếp** tới Push Notification (không phải cùng tính năng) nhưng được chốt cùng lúc vì cùng phát sinh từ nỗi lo chạm giới hạn dung lượng Supabase Free tier (500MB database) trong buổi thảo luận này.

**Hiện trạng:** `webapp/src/features/settings/HomeBackgroundSettings.tsx` đã có resize ảnh nền upload (`MAX_DIMENSION = 1920px` cạnh dài) + nén JPEG (`JPEG_QUALITY = 0.85`) trước khi lưu base64 vào `settings.homeBackground` (đồng bộ qua Supabase, 6 slot/user). Tuy nhiên **chưa có giới hạn dung lượng byte cứng** sau khi nén — ảnh gốc rất lớn/nhiều chi tiết vẫn có thể cho ra base64 khá nặng dù đã resize/nén theo kích thước và quality cố định.

**Yêu cầu bổ sung:** thêm giới hạn dung lượng tối đa sau khi nén cho mỗi ảnh nền upload.

**Đề xuất ngưỡng: ~400KB/ảnh sau khi nén** (base64), cách tính:
- 6 slot/ảnh × ~400KB = ~2.4MB/user tối đa cho riêng ảnh nền.
- Quy mô 1-10 user (cá nhân + nhóm nhỏ) → tối đa ~24MB cho toàn bộ ảnh nền của mọi user — dưới 5% hạn mức 500MB Free tier, để dành phần lớn dung lượng cho dữ liệu khác (task, note, reminder, subscription, invite...).
- 400KB vẫn đủ cho ảnh 1920px cạnh dài chất lượng khá ở JPEG quality 0.85 trong đa số trường hợp thực tế — chỉ ảnh quá nhiều chi tiết/nhiễu mới cần nén thêm.

**Xử lý khi vượt ngưỡng:** nếu ảnh vượt ~400KB ngay cả sau khi nén ở quality mặc định (0.85), thử nén lại với quality thấp hơn (ví dụ giảm dần 0.7 → 0.5); nếu vẫn vượt ngưỡng, báo lỗi rõ ràng cho người dùng (ví dụ "Ảnh vẫn quá nặng sau khi nén, vui lòng chọn ảnh khác") thay vì âm thầm lưu ảnh quá nặng.

> Ngưỡng cụ thể (400KB) là đề xuất ban đầu của `ba`, cần chủ dự án xác nhận lại trước khi dev triển khai — xem mục Câu hỏi mở.

---

## 12. Câu hỏi mở / cần xác nhận thêm

- **Q-A:** `pg_cron` nội bộ có thực sự giữ Supabase Free project khỏi auto-pause sau 1 tuần không traffic hay không? Cần dev verify khi triển khai — không chặn việc bắt đầu code.
- **Q-B:** `computeNotifications.ts` (client) và logic tính "đến hạn" phía Edge Function (server) là 2 nơi tính riêng biệt — có cần tách thành 1 package logic dùng chung sau này không, hay chấp nhận trùng lặp ở quy mô hiện tại?
- **Q-C:** Ngưỡng dung lượng ảnh nền cụ thể (mục 11, đề xuất ~400KB/ảnh) — chủ dự án cần xác nhận lại con số trước khi dev triển khai.
