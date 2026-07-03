# Push Notification — Tiến độ triển khai

> Theo dõi tiến độ code thật cho `docs/features/push-notification.md`. Cập nhật ngay sau khi hoàn thành mỗi phần nhỏ — làm theo kiểu cuốn chiếu (1 phần xong mới sang phần kế), để nếu mất phiên làm việc vẫn biết chính xác đang ở đâu và resume đúng chỗ.

Quy ước trạng thái: `⬜ Chưa làm` / `🔶 Đang làm` / `✅ Xong` / `⛔ Bị chặn (ghi rõ lý do)`.

## Phần 1 — PWA + Service Worker
Trạng thái: ✅ Xong (2026-07-03)

- [x] Thêm `vite-plugin-pwa` (mode `injectManifest`) vào `webapp/vite.config.ts`.
- [x] Viết `webapp/src/sw.ts`: xử lý sự kiện `push` (parse JSON → `showNotification`) + `notificationclick` (mở URL `/?open=task:<id>` hoặc `/?open=reminder:<id>`).
- [x] Test cục bộ: trigger `showNotification` giả lập (không cần server thật) để xác nhận SW hoạt động, hiện đúng noti trên trình duyệt desktop trước.

**Quyết định kỹ thuật (2026-07-03):**
- Cài `vite-plugin-pwa@1.3.0` (devDependency) + `workbox-build`, `workbox-window`, `workbox-precaching`, `workbox-core` (devDependency — chỉ bị bundle vào `dist/sw.js` lúc build, không vào bundle app chính, không tăng kích thước app runtime).
- `VitePWA({ manifest: false, ... })` — **không** để plugin tự sinh/ghi đè `manifest.webmanifest`; giữ nguyên file thủ công đã có sẵn trong `webapp/public/` (đã kiểm tra `icons` + `display: standalone` không đổi sau build, xem `dist/manifest.webmanifest`).
- `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'` — theo đúng mục 9.1 (không dùng `generateSW` vì cần tự viết handler `push`/`notificationclick`).
- `injectRegister: false` — không dùng auto-register (`virtual:pwa-register`) của plugin; đăng ký SW thủ công trong `webapp/src/main.tsx` bằng `navigator.serviceWorker.register('/sw.js')`, chỉ chạy khi `import.meta.env.PROD` (SW không bật ở `vite dev`, tránh 404 lúc dev).
- `devOptions.enabled: false` — SW chỉ hoạt động ở bản build (`npm run build` + `npm run preview`), không bật ở dev server. Lý do: mode `injectManifest` + dev server cần build SW dạng ES module riêng, khá dễ vỡ và không cần thiết cho mục tiêu nền tảng của Phần 1; test cục bộ dùng `npm run preview` là đủ và ổn định hơn.
- `injectManifest.globPatterns: []` — chưa làm offline cache/precache asset nào ở Phần 1 (ngoài phạm vi yêu cầu), chỉ cần `precacheAndRoute(self.__WB_MANIFEST)` tồn tại để workbox-build không lỗi khi build.
- `notificationclick`: ưu tiên `focus()` + `navigate()` tab KN-Space đang mở sẵn (cùng origin) thay vì luôn mở tab mới, đỡ rác tab; fallback `clients.openWindow()` nếu chưa có tab nào mở. Việc app tự đọc query `?open=task:<id>` để chuyển Space + cuộn tới item **chưa làm ở Phần 1** — thuộc Phần 2/3/4 (route/deep-link phía app), sw.ts chỉ đảm bảo điều hướng đúng URL.

**Cách đã test cục bộ (2026-07-03):**
1. `npm run build` → xác nhận `dist/sw.js` sinh ra đúng (bundle Workbox + code push/notificationclick), `dist/manifest.webmanifest` giữ nguyên nội dung gốc.
2. `npm run preview` (port riêng) → dùng Playwright (cài tạm ở thư mục scratchpad ngoài repo, không phải dependency của dự án) mở trang, gọi `navigator.serviceWorker.ready` → xác nhận SW `scope: /sw.js`, `state: activated`.
3. Ở chế độ **headed** (có màn hình thật, không headless) — gọi `Notification.requestPermission()` → `granted`, sau đó `registration.showNotification('Test', {...})` chạy **không lỗi** (`err: null`). Ở chế độ headless thuần, Chromium báo lỗi permission dù đã `grantPermissions` — đây là giới hạn đã biết của Chromium headless/CI đối với Notification API thật, không phải lỗi code SW; xác nhận bằng cách chạy lại y hệt ở chế độ headed thì pass.
4. Cách test thủ công tương đương cho người dùng/QA (không cần dựng lại harness Playwright): chạy `npm run build && npm run preview`, mở tab trình duyệt tới URL preview, mở DevTools Console, chạy **theo đúng thứ tự 2 bước** (bước 1 bắt buộc trước — bỏ qua sẽ gặp lỗi `TypeError: Failed to execute 'showNotification' ... No notification permission has been granted for this origin`, đã xảy ra thật khi user tự test lần đầu 2026-07-03):
   ```js
   // Bước 1 — xin quyền trước, PHẢI granted mới sang bước 2 (trình duyệt hiện popup Allow/Cho phép)
   Notification.requestPermission().then(p => console.log('permission:', p))
   // Bước 2 — chỉ chạy sau khi bước 1 in ra "permission: granted"
   navigator.serviceWorker.ready.then(r => r.showNotification('Test', { body: 'hello', data: { url: '/' } }))
   ```
   sẽ thấy notification desktop hiện ra; bấm vào để kiểm tra `notificationclick` focus/điều hướng đúng tab. Nếu bước 1 không hiện popup xin quyền (im lặng): kiểm tra icon khoá/ⓘ cạnh URL → Site settings → Notifications, có thể đã lỡ ở trạng thái "Block" từ lần test trước, đổi tay về "Allow"/"Ask" rồi thử lại.
   
   **Đã user xác nhận test thành công 2026-07-03** (theo đúng 2 bước trên).

**Ghi chú/rủi ro cần lưu ý khi sang Phần 2+:**
- File `webapp/src/main.tsx` hiện đăng ký SW không kiểm tra lỗi ngoài `console.error` — đủ cho Phần 1, có thể cần UI trạng thái rõ hơn khi làm Phần 4 (Settings UI đọc trạng thái PWA/permission).
- `notificationclick` mới điều hướng URL thô, **chưa** có logic app-side đọc `?open=...` để chuyển Space/cuộn item — cần làm ở Phần 2-4 tuỳ chỗ đặt route logic phù hợp nhất trong `App.tsx`/`AppStateContext`.

## Phần 2 — VAPID + Subscription + bảng Supabase mới
Trạng thái: ✅ Xong (2026-07-03)

- [x] Sinh VAPID key pair (CLI), lưu public key vào env Vite (`VITE_VAPID_PUBLIC_KEY`), private key vào Supabase Edge Function secret (chưa cần Edge Function thật ở bước này, chỉ set secret trước).
- [x] Thêm bảng `kn_push_subscriptions` vào `webapp/supabase/schema.sql` (cột theo mục 10 trong `push-notification.md`) + RLS.
- [x] Viết hook `webapp/src/features/notifications/usePushSubscription.ts`: quản lý trạng thái quyền, gọi `pushManager.subscribe()`, upsert/xoá subscription qua `supabaseClient`.

**Quyết định kỹ thuật (2026-07-03):**
- VAPID key pair sinh bằng `npx web-push generate-vapid-keys` (chạy local, không cần tài khoản/dịch vụ ngoài).
  - Public key: `BFN8UI1jO4lvnDIBfEasGRj4ew4tJ2Amlt1D0niAWK0AOnhUxL5CgrdoRMqp8vbf9Kyd9GNCDnhEfuSNTVey-sw` — đã set vào `webapp/.env.local` (`VITE_VAPID_PUBLIC_KEY`, file này đã có sẵn trong `.gitignore`, không lên git) và thêm placeholder vào `webapp/.env.example`. Public key không phải bí mật (đi vào client bundle là chuyện bình thường của Web Push) nhưng vẫn quản qua env cho dễ đổi.
  - Private key: **KHÔNG** ghi vào bất kỳ file nào trong repo (kể cả file tiến độ này) — đã gửi trực tiếp cho chủ dự án qua câu trả lời chat lúc code Phần 2, dặn tự lưu vào password manager. Khi làm Phần 3 (Edge Function), chạy `supabase secrets set VAPID_PRIVATE_KEY=<giá trị private key đã lưu>` (cần cài `supabase` CLI + `supabase link` project trước nếu chưa làm) — Edge Function đọc secret này qua `Deno.env.get('VAPID_PRIVATE_KEY')`, không đưa vào client bundle.
  - Nếu quên/mất private key: phải sinh lại **cả 2 key** (public + private là 1 cặp, không tách lẻ được) và mọi subscription cũ (`kn_push_subscriptions`) coi như vô hiệu — user phải bấm "Bật thông báo" lại từ đầu ở mọi thiết bị.
- Bảng `kn_push_subscriptions` thêm vào cuối `webapp/supabase/schema.sql` (không tạo file schema riêng, theo đúng yêu cầu — bám 1 file để dễ chạy 1 lượt trên Supabase Dashboard SQL Editor):
  - Cột đúng mục 10: `id` (uuid, PK, `gen_random_uuid()`), `user_id` (FK `auth.users`, `on delete cascade`), `endpoint` (text, unique), `p256dh`, `auth_key`, `user_agent`, `created_at`.
  - Thêm index `kn_push_subscriptions_user_id_idx` trên `user_id` (không có trong mục 10 nhưng cần cho query "lấy mọi subscription của 1 user" ở Phần 3 không full scan).
  - RLS 4 policy (select/insert/**update**/delete) theo `auth.uid() = user_id` — có **thêm** policy `update` so với mục 10 (chỉ liệt kê select/insert/delete) vì hook `subscribe()` dùng `upsert(..., { onConflict: 'endpoint' })`, PostgREST thực hiện `INSERT ... ON CONFLICT DO UPDATE` nên cần cả quyền UPDATE, không chỉ INSERT — nếu thiếu sẽ lỗi RLS khi 1 thiết bị bấm "Bật thông báo" lần 2 (endpoint cũ đã tồn tại).
  - **Không** bật Realtime cho bảng này (khác `kn_space_state`) — không cần đồng bộ UI, chỉ Phần 3 (Edge Function, `service_role` key, bypass RLS) đọc để gửi push.
- Hook đặt tại `webapp/src/features/notifications/usePushSubscription.ts` (cùng thư mục `features/notifications/` với `computeNotifications.ts`, `NotificationsBlock.tsx` đã có sẵn):
  - Trả về `{ isSupported, permission, isSubscribed, isBusy, error, subscribe, unsubscribe, refresh }`.
  - `isPushSupported()` check `serviceWorker` + `PushManager` + `Notification` cùng lúc trong `window`/`navigator`.
  - `subscribe()`: gọi `Notification.requestPermission()` **thật** trước (đúng yêu cầu quan trọng — không chỉ test qua DevTools console, có code xin quyền thật trong app) → nếu `granted`, lấy `navigator.serviceWorker.ready` → `pushManager.getSubscription()` (idempotent — nếu đã có subscription ở trình duyệt này thì dùng lại, không subscribe 2 lần) → nếu chưa có thì `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VITE_VAPID_PUBLIC_KEY) })` → upsert `{ user_id, endpoint, p256dh, auth_key, user_agent }` vào `kn_push_subscriptions` qua `onConflict: 'endpoint'`.
  - `unsubscribe()`: `subscription.unsubscribe()` phía trình duyệt + `delete().eq('endpoint', ...)` phía Supabase.
  - `refresh()`: đọc lại `Notification.permission` + `pushManager.getSubscription()` — dùng cho UI Settings ở Phần 4 khi user mở lại tab (đúng mục 3.3, app không có API chủ động phát hiện quyền bị thu hồi).
  - Helper `urlBase64ToUint8Array()` (base64url → `Uint8Array<ArrayBuffer>`) viết chung file, export riêng để có thể unit-test độc lập nếu cần sau này. Phải ép kiểu `new ArrayBuffer(...)` tường minh thay vì để TS suy ra `ArrayBufferLike` — TypeScript 5.6+ (lib DOM mới) phân biệt chặt `ArrayBuffer` vs `SharedArrayBuffer` cho `BufferSource`, nếu không ép kiểu `tsc --noEmit` báo lỗi ở đúng dòng gọi `pushManager.subscribe()`.
  - `user_id` lấy từ `useAuth().session.user.id` (context đã có sẵn) — nếu chưa đăng nhập thì `subscribe()` set `error`, không crash.
  - Hook này **chưa** gắn vào UI Settings (Phần 4) — chưa import/dùng ở đâu trong app ngoài chính file này, không ảnh hưởng bundle/behavior hiện tại.

**Câu hỏi mở phát sinh (2026-07-03):** mục 10 `push-notification.md` không liệt kê policy `update` cho `kn_push_subscriptions` — đã tự quyết định thêm vì lý do kỹ thuật ở trên (upsert cần UPDATE). Không cần xác nhận lại vì đây là chi tiết implementation, không đổi hành vi/UX nào đã chốt.

**Cách test (2026-07-03) — hook chưa có UI, test qua DevTools Console:**

0. **Bắt buộc trước tiên — chạy SQL tạo bảng mới:** mở Supabase Dashboard → SQL Editor → copy phần bảng `kn_push_subscriptions` mới thêm ở cuối `webapp/supabase/schema.sql` (từ dòng comment `-- Push Notification (Phần 2)` tới hết file) → chạy 1 lần. Xác nhận bảng `kn_push_subscriptions` xuất hiện trong Table Editor (chưa có dòng nào là đúng).
1. `cd webapp && npm run build && npm run preview` (nhớ dùng `preview`, không phải `dev` — SW chỉ bật ở bản build, xem Phần 1).
2. Mở tab preview, đăng nhập Google như bình thường (hook cần `session.user.id`).
3. Mở DevTools Console, chạy tạm đoạn sau để gọi thử `subscribe()` (import trực tiếp module đã build — cách nhanh nhất không cần sửa UI):
   ```js
   const mod = await import('/assets/index-XXXX.js'); // KHÔNG dùng được — module đã minify/không export ra window
   ```
   Cách này không khả thi vì Vite build không export hook ra global. **Cách test thực tế đơn giản nhất**: thêm tạm 3 dòng gọi hook vào `webapp/src/App.tsx` (ví dụ 1 nút ẩn ở góc màn hình, hoặc gọi thẳng trong `useEffect` 1 lần), build lại, bấm nút/tự trigger, kiểm tra kết quả, rồi xoá code tạm đi trước khi commit — vì hook dùng React hook (`useAuth`, `useState`) nên không gọi rời được từ Console như hàm thuần.
   - Ví dụ đoạn tạm (xoá sau khi test xong):
     ```tsx
     // Dán tạm vào đầu component App(), sau các hook khác
     const push = usePushSubscription();
     useEffect(() => { (window as any).__push = push; }, [push]);
     ```
     Sau đó ở Console gõ `await window.__push.subscribe()`.
4. Kết quả mong đợi:
   - Bước 3 vừa gọi `subscribe()`: trình duyệt hiện **popup xin quyền Allow/Chặn thật** (không phải chỉ `Notification.permission` đổi ngầm) — xác nhận yêu cầu "phải có code xin quyền thật trong app".
   - Bấm Allow → không có lỗi ném ra Console (`push.error` vẫn `null`).
   - Mở Supabase Dashboard → Table Editor → `kn_push_subscriptions` → thấy xuất hiện đúng 1 dòng mới, `user_id` khớp tài khoản Google vừa đăng nhập, `endpoint` là 1 URL dài dạng `https://fcm.googleapis.com/...` (Chrome) hoặc tương tự theo trình duyệt, `p256dh`/`auth_key` không rỗng.
   - Gọi lại `await window.__push.unsubscribe()` → dòng đó biến mất khỏi bảng.
5. Dọn dẹp sau test: xoá 2 dòng code tạm ở bước 3 khỏi `App.tsx`, chạy lại `npx tsc --noEmit && npm run build` để chắc chắn không sót code test.

**Đã user xác nhận test thành công 2026-07-03**: `subscribe()` → popup Allow hiện ra → 1 dòng mới xuất hiện trong `kn_push_subscriptions`; `unsubscribe()` → dòng đó biến mất. Code test tạm đã được dọn khỏi `App.tsx`, build lại sạch (`tsc --noEmit` + `npm run build` pass, `git diff` rỗng cho `App.tsx`).

## Phần 3 — Edge Function + Cron (bên gửi push)
Trạng thái: 🔶 Đang làm (2026-07-03) — **code đã xong hoàn chỉnh** (bao gồm cả nhánh `freqUnit: 'hour'`, không còn phần nào bỏ dở/giữ tạm hành vi cũ), **CHƯA tự deploy/test chạy thật** (không có credentials `supabase` CLI đã login/link vào project thật). Cần chủ dự án tự deploy + báo lại kết quả trước khi đánh dấu ✅.

- [x] Viết Edge Function `webapp/supabase/functions/send-due-notifications/index.ts` (Deno): query Reminder/Task đến hạn (cả space cá nhân `kn_space_state` lẫn shared space `kn_shared_spaces`), tránh gửi trùng bằng bảng log `kn_push_sent_log`.
- [x] Thêm bảng `kn_push_sent_log` (không RLS, chỉ Edge Function service_role đụng tới) vào `webapp/supabase/schema.sql`.
- [x] Logic tính "đến hạn" cho cả 4 loại: Task, Reminder once, Reminder recurring `day`/`month`, Reminder recurring `hour` — **hoàn chỉnh, không còn nhánh nào giữ hành vi tạm/placeholder**.
- [ ] **CHƯA verify** thư viện gửi Web Push chạy được trong Deno Edge Runtime (`npm:web-push@3.6.7`) — đây là phần rủi ro nhất, xem mục "Câu hỏi mở/rủi ro" bên dưới. Cần user tự deploy để biết chắc.
- [x] Viết cấu hình SQL mẫu cho `pg_cron` (+ `pg_net`) gọi Edge Function mỗi 1 phút, thêm cuối `webapp/supabase/schema.sql` — dùng placeholder cho project-ref + service_role key (chỉ có sau khi deploy thật).
- [ ] Test end-to-end: tạo 1 Reminder/Task sắp tới hạn, xác nhận nhận được push thật trên điện thoại đã cài PWA — **cần user tự làm**, xem "Cách test sau khi deploy" bên dưới.

**Quyết định kỹ thuật (2026-07-03):**

- **Nguồn dữ liệu quét:** đọc cả 2 nơi bằng `service_role` (bypass RLS):
  - `kn_space_state` (mọi user, mọi space cá nhân trong `spaces` jsonb) — người nhận = `user_id` của hàng đó (chủ sở hữu).
  - `kn_shared_spaces` (mọi shared space) — người nhận = toàn bộ hàng trong `kn_space_members` có `space_id` tương ứng (owner + member, đúng mục 4 "không phân biệt assignee").
  - Lưu ý: `kn_shared_spaces.reminders` tồn tại ở DB nhưng UI Shared Space luôn ẩn khối "Nhắc việc" (`enabledBlocks.reminder = false` cố định trong `sharedSpaceStore.ts` → `rowToSpace()`), nên trên thực tế mảng này gần như luôn rỗng — Edge Function vẫn xử lý đúng/đủ (không cắt bớt) để không phụ thuộc ngầm vào hành vi UI hiện tại, phòng trường hợp sau này UI mở lại tính năng.
- **Logic tính "đến hạn"** viết riêng hoàn toàn cho server (không tái dùng `computeNotifications.ts`, đúng Q-B đã xác nhận trong `push-notification.md`):
  - **CHỐT (2026-07-03, đã xác nhận với chủ dự án):** Task/Reminder-once/Reminder-recurring (`day`/`month`) chỉ có `date`, KHÔNG có `time` (rỗng) — **vẫn phải push**, dùng giờ mặc định **08:00 sáng giờ VN** ngày đó thay cho `time` rỗng (hằng số `DEFAULT_TIME_NO_TIME = '08:00'` trong `index.ts`). Đã đổi từ quyết định cũ (bỏ qua hoàn toàn, không bao giờ push) sang hành vi này. Áp dụng cho cả 3 loại: task, reminder once, reminder recurring day/month (không chỉ once — mở rộng nhất quán vì `time` cũng có thể rỗng ở day/month, dù UI hiện không bắt buộc nhập).
  - Reminder recurring `day`/`month`: dùng lại đúng công thức `isRecurringDueToday` (diff ngày `% freqN`, hoặc so `dayOfMonth`) viết lại bằng TS thuần cho server; giờ đến hạn = `r.time || '08:00'`.
  - **Reminder recurring `hour`** (hoàn chỉnh 2026-07-03, xem mục "Quyết định kỹ thuật — Reminder recurring `hour`" ngay bên dưới): neo theo đúng giờ:phút thực tế lúc tạo reminder (giờ VN), kiểu "Lời nhắc" iPhone.
- **Múi giờ:** **CHỐT (2026-07-03, đã xác nhận giữ nguyên)** — DB không lưu timezone của user ở đâu cả, toàn bộ `date`/`time` tiếp tục được coi là giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7, không DST), hard-code offset `+7h` trong Edge Function (`vnDateTimeToMs`, `vnDateStr`, `vnHour`). Không còn là câu hỏi mở — nếu sau này có user ở múi giờ khác sẽ cần thêm cột timezone (ngoài phạm vi hiện tại).
- **Cửa sổ "đến hạn":** cron chạy mỗi phút, Edge Function dùng cửa sổ **90 giây** (`DUE_WINDOW_MS`, rộng hơn 1 phút 1 chút để có biên an toàn nếu cron lỡ nhịp nhẹ) — không lo gửi trùng vì `kn_push_sent_log` có `unique(item_key, due_at)` chặn ở tầng DB bất kể window rộng bao nhiêu.
- **Chống gửi trùng:** thử `insert` vào `kn_push_sent_log` trước khi gửi; nếu lỗi mã `23505` (unique_violation Postgres) → coi là "đã gửi rồi", bỏ qua im lặng (không gửi lại, không báo lỗi). Bảng này **không có RLS** — theo đúng convention đang có (`kn_push_subscriptions` cũng không RLS cho phần Edge Function đụng tới) và vì bảng không có `user_id` nên không áp được policy theo `auth.uid()`; an toàn vì không `GRANT` quyền nào cho `anon`/`authenticated` trên bảng này (mặc định Postgres không cho truy cập nếu không cấp).
- **Subscription hỏng:** bắt lỗi `sendNotification()` ném ra, kiểm tra `err.statusCode === 410 || 404` → xoá dòng `kn_push_subscriptions` tương ứng, `continue` sang subscription/item kế tiếp — không có `try/catch` bao ngoài toàn bộ vòng lặp nên 1 lỗi không làm chết cả batch.
- **Query hiệu năng:** load toàn bộ `kn_push_subscriptions` liên quan **1 lượt duy nhất** bằng `.in('user_id', [...])` (không N+1 theo từng item/user) — quan trọng vì 1 user có thể có nhiều item đến hạn cùng lúc và nhiều thiết bị.
- **Thư viện Web Push:** dùng `npm:web-push@3.6.7` qua Deno npm specifier (theo đúng thứ tự ưu tiên trong mục 9.3 `push-notification.md`) — **CHƯA thể tự verify chạy được** vì không có quyền deploy lên project thật. `web-push` (npm) nội bộ dùng Node `crypto` module cho ECDH P-256 + HMAC-SHA256 (VAPID JWT) và AES-128-GCM (mã hoá payload theo RFC 8291) — Deno có polyfill `node:crypto` khá đầy đủ ở bản gần đây nên **có khả năng chạy được**, nhưng đây vẫn là điểm chưa chắc chắn 100% cho tới khi user tự deploy và xem log thật.
  - **Phương án dự phòng nếu `npm:web-push` lỗi khi deploy:** thử đổi specifier sang `https://esm.sh/web-push@3.6.7?bundle` (esm.sh thường bundle sẵn polyfill tốt hơn cho Deno/edge runtime) trước khi tính tới phương án cuối là tự viết VAPID JWT (ES256, `crypto.subtle.sign`) + tự mã hoá payload theo RFC 8291 (ECDH, HKDF, AES-128-GCM) bằng Web Crypto API thuần — **CHƯA viết code cho phương án này** vì tốn effort lớn (dễ sai ở bước ECE content-encoding) và ưu tiên thời gian; chỉ làm nếu cả 2 specifier `web-push` đều thất bại thật khi deploy.
- **Cron:** SQL mẫu dùng `pg_cron` + `pg_net` (`net.http_post`), thêm cuối `webapp/supabase/schema.sql`, có placeholder `<YOUR-PROJECT-REF>` / `<YOUR-SERVICE-ROLE-KEY>` — **không tự chạy được** vì URL Edge Function chỉ có sau khi deploy thật.

**Quyết định kỹ thuật — Reminder recurring `hour` (CHỐT HOÀN CHỈNH 2026-07-03, không còn câu hỏi mở):**

Ban đầu code Phần 3 tạm giữ hành vi cũ (neo 00:00 giờ VN) cho `freqUnit: 'hour'` vì phát hiện `ReminderRecurring.createdAt` lúc đó chỉ lưu `yyyy-mm-dd` (không có giờ:phút) — không đủ dữ liệu để neo đúng "giờ:phút thực tế lúc tạo" như mong muốn (kiểu Lời nhắc iPhone). Đã giải quyết theo 2 bước, cả 2 đều xong:

1. **Bước data model (client, xong trước — xem mục lịch sử "Đã làm bước con" phía dưới):** `webapp/src/state/reducers/reminders.ts` đổi `createdAt` từ `new Date().toISOString().slice(0, 10)` → `new Date().toISOString()` đầy đủ (giờ:phút:giây). Đồng bộ backfill ở `webapp/src/storage/normalize.ts` và `webapp/src/state/appReducer.ts`. Phát hiện + sửa kèm 1 bug liên quan: `isRecurringDueToday()` nhánh `day` (`webapp/src/features/reminders/reminderUtils.ts`) tính diff ngày bị lệch nếu `createdAt` có giờ khác 00:00 — đã sửa bằng cách cắt về ngày (`slice(0, 10)`) trước khi tính diff, không phụ thuộc giờ:phút.
2. **Bước Edge Function (xong — nội dung sửa trong lượt này, 2026-07-03):** nhánh `freqUnit === 'hour'` trong `collectDueItems()` (`webapp/supabase/functions/send-due-notifications/index.ts`) viết lại hoàn chỉnh:
   - Hàm `anchorHourMinuteFromCreatedAt(createdAt)`: đọc `createdAt` (ISO đầy đủ) → convert sang giờ VN → trả `{ hour, minute }`. Trả về `null` nếu `createdAt` là dữ liệu CŨ (kiểm tra `length <= 10` hoặc thiếu ký tự `T`) — reminder tạo trước khi client được sửa ở bước 1.
   - Dữ liệu cũ (`null`) → **fallback neo 08:00 giờ VN**, nhất quán với `DEFAULT_TIME_NO_TIME` đã dùng cho Task/Reminder không có `time`.
   - Công thức mốc đến hạn: bắt đầu từ `giờ:phút lúc tạo` (phút trong ngày, `anchorMinuteOfDay`), cộng dồn `freqN * 60` phút mỗi bước, lấy `mod 1440` (24h) để quay vòng trong ngày — sinh toàn bộ mốc giờ:phút của **hôm nay** (giờ VN), dừng vòng lặp khi quay lại đúng mốc neo ban đầu (chu kỳ khép kín, tối đa 24 bước, không bao giờ vô hạn). Các mốc này **lặp lại giống hệt mỗi ngày** (không đếm "đã bao nhiêu ngày kể từ lúc tạo" như nhánh `day`/`month`, vì `freqN` là số nguyên giờ nên chu kỳ luôn là ước số của 24h).
   - Mỗi mốc sinh ra 1 `DueItem` với `dueAtMs` riêng — chỉ mốc nào rơi đúng vào cửa sổ `DUE_WINDOW_MS` (90 giây) quanh thời điểm cron chạy mới thực sự được gửi push (lọc ở bước 3 của handler chính, không đổi).
   - Đã tự nhẩm tay + chạy thử bằng script Node độc lập (mô phỏng đúng công thức, không phải chạy trực tiếp file Deno) để xác nhận logic đúng trước khi báo cáo — xem ví dụ cụ thể trong câu trả lời gửi chủ dự án ở lượt sửa 2026-07-03.
   - **Giới hạn đã biết, chấp nhận được:** công thức "mod 1440 theo giờ trong ngày" đúng chính xác khi `freqN < 24` (giá trị thực tế mà UI reminder cho phép chọn). Nếu `freqN` là bội số của 24 (vd 24, 48 — vượt phạm vi hợp lý cho reminder "N giờ"), công thức tự rút về đúng 1 mốc/ngày tại giờ neo (không sai, không crash) nhưng về mặt ý nghĩa sẽ không phân biệt được "mỗi 24h" và "mỗi 48h" — không phải use case thực tế của tính năng này nên không cần xử lý thêm.

Không còn phần nào của `freqUnit: 'hour'` cần chủ dự án quyết định thêm — chỉ còn chờ **deploy thật** để verify (cùng rủi ro `npm:web-push` như toàn bộ Phần 3, xem mục "Câu hỏi mở / rủi ro" bên dưới).

**Hướng dẫn deploy đầy đủ (tự làm — cần credentials project thật mà dev agent không có):**

1. Cài `supabase` CLI nếu chưa có (macOS): `brew install supabase/tap/supabase`
2. `cd webapp && supabase login` (mở trình duyệt xác thực).
3. `supabase link --project-ref <project-ref-thật>` (lấy project-ref ở Supabase Dashboard → Project Settings → General → "Reference ID").
4. Set secret VAPID (cả 2 key, không chỉ private — VAPID JWT cần cặp public+private):
   ```
   supabase secrets set VAPID_PUBLIC_KEY=<public key đã có trong .env.local VITE_VAPID_PUBLIC_KEY> VAPID_PRIVATE_KEY=<private key đã lưu riêng ở Phần 2, không có trong repo>
   ```
   (Không cần set `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` — 2 biến này Supabase tự inject sẵn cho mọi Edge Function.)
5. Deploy function: `supabase functions deploy send-due-notifications` (chạy từ `webapp/`, CLI tự tìm `supabase/functions/send-due-notifications/index.ts`).
6. Lấy URL function thật sau khi deploy (dạng `https://<project-ref>.supabase.co/functions/v1/send-due-notifications`) — CLI in ra sau lệnh deploy, hoặc xem Supabase Dashboard → Edge Functions.
7. Chạy bảng `kn_push_sent_log` mới (nếu chưa chạy) + đoạn SQL `pg_cron` ở cuối `webapp/supabase/schema.sql` trong SQL Editor — nhớ:
   - Bật extension trước: `create extension if not exists pg_cron with schema extensions; create extension if not exists pg_net with schema extensions;`
   - Thay `<YOUR-PROJECT-REF>` bằng URL thật lấy ở bước 6.
   - Thay `<YOUR-SERVICE-ROLE-KEY>` bằng service_role key thật (Project Settings → API → `service_role` secret) — chỉ dán trực tiếp vào SQL Editor lúc chạy, không lưu vào file git.
8. Kiểm tra job cron đã tạo: `select * from cron.job;` trong SQL Editor.

**Cách test sau khi deploy:**

1. Test riêng Edge Function trước (chưa cần đợi cron): gọi trực tiếp bằng `curl` hoặc Dashboard → Edge Functions → chọn `send-due-notifications` → "Invoke". Xem response JSON tóm tắt (`itemsChecked`, `itemsDue`, `pushSent`, `errors`...) — nếu `errors` có nội dung liên quan `npm:web-push`, đó là dấu hiệu cần chuyển phương án dự phòng ở trên.
2. Trên điện thoại đã cài PWA (Add to Home Screen) + đã bật "Bật thông báo" (đã test thành công ở Phần 2): tạo 1 Reminder hoặc Task có `date` = hôm nay, `time` = khoảng 2 phút sau thời điểm hiện tại.
3. Đợi 2-3 phút (chờ đủ ít nhất 1 chu kỳ cron sau giờ hẹn), quan sát có notification hệ thống hiện ra trên điện thoại hay không, kể cả khi đã đóng hẳn app/tab.
4. Bấm vào notification → xác nhận mở app đúng, URL có `?open=task:<id>` hoặc `?open=reminder:<id>` (điều hướng app-side đọc query này **chưa làm** — thuộc phần khác, không phải Phần 3 — nên ở bước này chỉ cần xác nhận URL đúng, chưa cần app tự cuộn tới item).
5. Nếu không nhận được push: vào Supabase Dashboard → Edge Functions → `send-due-notifications` → tab "Logs" xem lỗi runtime (nếu có), và `select * from cron.job_run_details order by start_time desc limit 20;` trong SQL Editor để xem cron có chạy đúng lịch/có lỗi HTTP không (vd sai service_role key trong header → 401).
6. Test cơ chế chống trùng: đợi thêm 1-2 phút sau khi đã nhận push lần đầu, xác nhận **không** nhận thêm push thứ 2 cho cùng 1 Reminder/Task đó ở đúng giờ hẹn đó (query `select * from kn_push_sent_log order by sent_at desc limit 10;` để thấy đúng 1 dòng cho item đó).
7. Test subscription hỏng (không bắt buộc, có thể bỏ qua): gỡ PWA khỏi điện thoại/thu hồi quyền notification, tạo Reminder mới đến hạn, xác nhận không lỗi (Edge Function tự xoá subscription cũ, không crash).

**Câu hỏi mở / rủi ro chưa chốt (2026-07-03):**

- **Rủi ro lớn nhất — chưa verify `npm:web-push` chạy trong Deno Edge Runtime.** Không có cách tự kiểm tra ngoài việc user tự deploy thật; nếu lỗi, xem phương án dự phòng đã ghi ở trên (thử `esm.sh` trước, tự viết RFC 8291 là phương án cuối).
- ~~Giả định múi giờ Asia/Ho_Chi_Minh (UTC+7) hard-code~~ — **ĐÃ CHỐT 2026-07-03**: giữ nguyên, xem "Quyết định kỹ thuật" ở trên.
- ~~Task/Reminder không có `time` (chỉ có `date`) sẽ không bao giờ được push~~ — **ĐÃ CHỐT 2026-07-03**: đổi lại, vẫn push lúc 08:00 sáng giờ VN mặc định. Xem "Quyết định kỹ thuật" ở trên.
- ~~Cách tính "đến hạn" cho Reminder lặp theo giờ (`freqUnit: 'hour'`) — data model không đủ thông tin~~ — **ĐÃ CHỐT & CODE XONG HOÀN CHỈNH 2026-07-03**, gồm cả bước data model client-side lẫn Edge Function. Chi tiết đầy đủ xem mục "Quyết định kỹ thuật — Reminder recurring `hour`" ở trên. Tóm tắt lịch sử xử lý (để tra cứu nhanh nếu cần):
  - Bước 1 (client): `webapp/src/state/reducers/reminders.ts` đổi `createdAt` sang ISO đầy đủ giờ:phút:giây; đồng bộ backfill ở `webapp/src/storage/normalize.ts` + `webapp/src/state/appReducer.ts`. Nhánh recurring trong `REMINDER_UPDATE` vẫn giữ nguyên `createdAt` cũ khi sửa (cố ý, không tự nâng cấp).
  - Phát hiện + sửa kèm 1 bug thật (không phải giả thuyết, có test tái hiện trước khi sửa): `isRecurringDueToday()` nhánh `day` (`webapp/src/features/reminders/reminderUtils.ts`) tính `diffDays` bị lệch khi `createdAt` có giờ khác 00:00 — đã sửa bằng cách cắt về ngày (`slice(0, 10)`) trước khi tính diff. Test liên quan đã cập nhật: `webapp/src/__tests__/reducers.test.ts`, `normalize.test.ts`, `appReducer.test.ts`. `npx vitest run` — 48 test pass.
  - Bước 2 (Edge Function, xong trong lượt sửa 2026-07-03 này): nhánh `freqUnit === 'hour'` viết lại hoàn chỉnh theo công thức mod-1440 phút trong ngày, xem chi tiết + ví dụ nhẩm tay ở mục "Quyết định kỹ thuật" phía trên.
  - **Còn 1 việc user tự làm (không phải code):** test qua UI thật (`npm run build && npm run preview`, đăng nhập, tạo reminder loại Giờ/Ngày) — **đã được user tự xác nhận thành công 2026-07-03** (tạo bình thường không lỗi, khối Thông báo hiện đúng).
- Q-A (từ `push-notification.md`): `pg_cron` nội bộ có giữ Supabase Free project khỏi auto-pause sau 1 tuần không traffic hay không — vẫn chưa verify được (chỉ verify được sau khi cron chạy thật một thời gian).

## Phần 4 — Settings UI
Trạng thái: ⬜ Chưa làm (phụ thuộc Phần 1+2 xong, không phụ thuộc Phần 3)

- [ ] Thêm khối "Thông báo đẩy" vào tab "Chung" trong `features/settings/` (toggle + trạng thái rõ bằng chữ theo mục 5.1 trong `push-notification.md`).
- [ ] Xử lý luồng bắt buộc cài PWA trước khi xin quyền (đặc biệt iOS Safari) theo mục 3.1.

## Ghi chú chung
- Mỗi phần xong: chạy `npx tsc --noEmit` + `npm run build` trong `webapp/` trước khi đánh dấu ✅.
- Câu hỏi mở/quyết định phát sinh trong lúc code → ghi thẳng vào đây kèm ngày, không chỉ nói miệng.
- Không tự ý nhảy cóc sang phần sau nếu phần trước còn ⬜/🔶 trừ khi 2 phần không phụ thuộc nhau (Phần 4 có thể làm song song Phần 3).
