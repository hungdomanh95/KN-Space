# Tính năng: Assign Task cho Member + Thông báo sự kiện trong Shared Space

> Xây trên nền Phase 3 (Shared Space) + tận dụng hạ tầng Push Notification đã có (VAPID, `kn_push_subscriptions`, Service Worker).
> Đây là **mở rộng phạm vi có chủ đích** — đảo ngược 2 quyết định "Out of Scope" trước đó ở `docs/features/shared-space.md` mục 7 và `docs/features/push-notification.md` mục 7 (đã update 2 file đó, dẫn chiếu ngược lại đây).
> Cập nhật: 2026-07-06.

---

## 1. Tổng quan

Thêm 2 khả năng mới cho **Shared Space**, độc lập nhau về mặt kỹ thuật nhưng cùng phục vụ mục tiêu "biết ai đang làm gì" trong nhóm:

1. **Assign Task** — gán 1 Task cho 1/nhiều/tất cả Member trong Shared Space.
2. **Thông báo theo sự kiện** — push tức thời khi:
   - Một Task **được giao** (assignee mới) → báo cho (các) assignee mới.
   - Một Task **được đánh dấu hoàn thành** → báo cho toàn bộ Member khác.

Đây là loại thông báo **event-driven** (gọi trực tiếp lúc hành động xảy ra), khác hẳn cơ chế **cron quét "đến hạn"** đã có ở `docs/features/push-notification.md` (chạy mỗi phút, độ trễ 0-60s). Hai cơ chế **không dùng chung code**, chạy song song, không ảnh hưởng nhau.

---

## 2. User Stories

- Là Member, tôi muốn giao 1 task cho đồng đội cụ thể (hoặc nhiều người, hoặc cả nhóm) để họ biết đó là việc của mình.
- Là Member được giao task, tôi muốn nhận thông báo đẩy ngay khi được giao, kể cả khi đã đóng app.
- Là Member, tôi muốn biết ngay khi đồng đội hoàn thành 1 task trong Space chung, không cần tự mở app kiểm tra.
- Là người vừa hoàn thành/giao việc, tôi **không** muốn nhận thông báo về chính hành động của mình.
- Là Member, tôi muốn tắt riêng loại thông báo "hoạt động Space chung" nếu thấy ồn, mà vẫn giữ nguyên thông báo nhắc việc đến hạn.

---

## 3. Luồng chi tiết

### 3.1 Assign Task

1. Trong modal Sửa/Thêm việc (`TaskFormModal`) — **chỉ hiển thị khi đang ở Shared Space** — có thêm 1 khối chọn "Giao cho": danh sách Member (checkbox nhiều lựa chọn) + nút tắt "Chọn tất cả".
2. "Chọn tất cả" chỉ là thao tác điền sẵn — tick hết Member **hiện có tại thời điểm bấm** vào danh sách chọn, không phải 1 cờ "future-proof" tự áp dụng cho Member join sau.
3. Lưu task với `assigneeIds: string[]` (rỗng = chưa giao ai).
4. Task item trong danh sách hiển thị avatar/initials nhỏ của (các) assignee cạnh tiêu đề (chi tiết UI để `uiux` quyết).

### 3.2 Thông báo "được giao việc"

Kích hoạt khi **tập assignee tăng thêm người mới** — áp dụng cho cả lúc tạo task lẫn sửa task sau này:

1. Client so sánh `assigneeIds` cũ vs mới sau khi lưu thành công → tính ra tập "assignee mới thêm vào" (`newlyAdded = next.filter(id => !prev.includes(id))`).
2. Loại bỏ chính người vừa thực hiện thao tác khỏi `newlyAdded` (không tự báo cho mình).
3. Nếu `newlyAdded` rỗng → không gọi gì cả (im lặng).
4. Ngược lại → gọi Edge Function `notify-shared-task-event` với `{ spaceId, taskId, event: 'assigned', recipientUserIds: newlyAdded }`.

Gỡ assignee (xoá người khỏi danh sách) **không** kích hoạt thông báo nào.

### 3.3 Thông báo "hoàn thành"

1. Khi `TASK_TOGGLE_DONE` khiến task chuyển **từ `false` sang `true`** trong Shared Space.
2. **Debounce 15 giây** trước khi thực sự gọi notify (xem mục 6.1 — chống spam khi tick nhầm/tick nhanh qua lại).
3. Nếu trong 15 giây đó task bị toggle ngược lại (`true→false`) → huỷ lịch gọi, không gửi gì.
4. Nếu hết 15 giây task vẫn `done: true` → gọi Edge Function `notify-shared-task-event` với `{ spaceId, taskId, event: 'completed', excludeUserId: <người tick> }` → server tự tra `kn_space_members` để lấy toàn bộ Member trừ người bị exclude.

### 3.4 Người dùng nhận thông báo

Giống hành vi push hiện có (`push-notification.md` mục 3.2 bước 4-5): Service Worker nhận `push`, `showNotification()`, bấm vào mở đúng Space/task.

---

## 4. Permission

Tất cả Member (kể cả Owner) đều **assign được cho bất kỳ ai** trong Space, kể cả tự gán cho mình — không phân biệt role, khớp mô hình ngang quyền hiện tại của Shared Space (task CRUD không phân biệt Owner/Member).

---

## 5. UX / UI (định hướng — chi tiết để `uiux` quyết)

### 5.1 Chọn assignee
Checklist Member (đã có sẵn danh sách này từ panel quản lý Member) + nút "Chọn tất cả". Chỉ hiện khối này khi `space.isShared`.

### 5.2 Hiển thị assignee trên Task item
Avatar/initials nhỏ cạnh tiêu đề task, tối đa hiển thị vài người rồi rút gọn kiểu "+2" nếu nhiều — theo pattern avatar đã dùng ở panel Member.

### 5.3 Toggle Settings riêng
Trong Settings → tab "Chung" → khối "Thông báo đẩy" hiện có, thêm 1 sub-toggle: **"Thông báo hoạt động Space chung"** (mặc định bật), độc lập với toggle chính. Tắt sub-toggle này → không nhận noti sự kiện (giao việc/hoàn thành) nhưng **vẫn** nhận noti đến hạn bình thường.

### 5.4 Nội dung thông báo

> **Cập nhật 2026-07-07:** phát hiện khi test thật — nhồi tên Space + tên task vào 1 chuỗi `title` duy nhất bị iOS cắt mất thông tin quan trọng khi tên Space/tên task dài (`title` thông báo chỉ hiển thị gọn 1 dòng, không xuống dòng như `body`). Đổi sang tách `title` ngắn cố định + `body` chứa chi tiết (đồng bộ cách xử lý mới ở `push-notification.md` mục 5.3).

- Giao việc: `title: "📌 Được giao việc mới"`, `body: "[Tên Space]: bạn được giao "<tên task>""`
- Hoàn thành: `title: "✅ Hoàn thành việc"`, `body: "[Tên Space]: <tên task> đã hoàn thành"`

---

## 6. Behavior đặc biệt

### 6.1 Debounce chống spam (chỉ áp dụng cho sự kiện "hoàn thành")

Lý do: tick nhầm rồi tick lại, hoặc đổi ý nhanh, không nên bắn noti mỗi lần. Cơ chế: debounce 15 giây theo `taskId`, huỷ nếu trạng thái đảo ngược trong lúc chờ (xem 3.3). Đây là debounce **thuần client-side, chỉ tồn tại trong bộ nhớ tab đang mở** — không cần bảng/cột DB mới để lưu trạng thái chờ.

**Đánh đổi chấp nhận:** nếu người dùng tick xong rồi **đóng tab ngay lập tức** trong vòng 15 giây, thông báo "hoàn thành" sẽ **không được gửi** (vì timer chưa kịp chạy). Chấp nhận được vì đây là thông báo mang tính xã hội/thông tin thêm (nice-to-have), không phải nhắc việc quan trọng như due-date — không cần đảm bảo gửi 100%, khác hẳn mức độ nghiêm ngặt cần có ở cơ chế "đến hạn".

Sự kiện "giao việc" **không** cần debounce này — đó là hành động chủ đích (chọn assignee trong modal rồi bấm Lưu), không có kiểu "bấm nhầm rồi tick lại" như checkbox done ngoài danh sách.

### 6.2 Độc lập với cơ chế "đến hạn"

Không tái dùng Edge Function `send-due-notifications` (cron mỗi phút) — đây là **Edge Function mới, gọi trực tiếp từ client theo yêu cầu**, không cần bảng chống-trùng kiểu `kn_push_sent_log` (mỗi sự kiện chỉ xảy ra đúng 1 lần tại đúng thời điểm hành động, không có khái niệm "cron chạy chồng" ở đây).

### 6.3 Lỗi khi gọi notify — best-effort

Gọi `notify-shared-task-event` thất bại (mất mạng, timeout...) → chỉ log cảnh báo console, **không** chặn/rollback việc lưu task, không hiện lỗi cho user — nhất quán với tinh thần "chấp nhận best-effort, không Realtime" đã áp dụng toàn dự án.

---

## 7. Out of Scope

- Assign cho task ở **Space cá nhân** — field `assigneeIds` tồn tại trong type Task dùng chung nhưng không hiển thị/không có ý nghĩa ở Space cá nhân.
- Noti khi **gỡ** assignee — chỉ noti khi thêm mới.
- "Chọn tất cả" tự động áp dụng cho Member join sau — chỉ là snapshot tại thời điểm chọn.
- Noti khi sửa các field khác của task (title/content/date/time) — chỉ 2 sự kiện: hoàn thành + được giao (tạo mới/sửa assignee).
- Noti khi hoàn thành Reminder hoặc note thay đổi — chỉ áp dụng cho Task.
- Filter/xem "việc của tôi" theo assigneeIds trên UI Dashboard — có thể làm sau, không thuộc phạm vi đợt này (đợt này chỉ có data model + hiển thị badge, chưa có filter).
- Rate-limit/debounce cho sự kiện "giao việc" — không cần vì lý do đã nêu ở 6.1.

---

## 8. Edge Cases

| Case | Hành vi mong đợi |
|---|---|
| Tự assign task cho chính mình | Lưu bình thường, không gửi noti nào (người nhận duy nhất chính là người thao tác → bị loại trừ) |
| Tick done → untick → tick lại trong vòng 15s | Chỉ tính từ lần tick **cuối cùng** còn hiệu lực khi hết debounce — nếu cuối cùng là `done:true` thì gửi đúng 1 noti, không gửi nhiều lần |
| Member bị kick khỏi Space ngay sau khi được assign nhưng trước khi noti gửi | Best-effort — Edge Function tra `kn_space_members`/`kn_push_subscriptions` tại thời điểm gọi, nếu người đó đã bị kick thì tự nhiên không còn subscription hợp lệ liên kết hoặc không còn trong danh sách member (tuỳ implementation tra cứu) |
| Task không có assignee nào, chỉ tick done | Không có gì để noti "giao việc"; noti "hoàn thành" vẫn hoạt động bình thường (không phụ thuộc assignee) |
| Sub-toggle "Thông báo hoạt động Space chung" tắt | Edge Function vẫn được gọi bình thường, nhưng phía gửi push cần lọc bỏ subscription của user đã tắt sub-toggle này (cần lưu trạng thái toggle vào field mới, xem mục 9) |
| User không có subscription hợp lệ nào (chưa bật push) | Bỏ qua người đó, không lỗi, không crash batch — giống hành vi Edge Function due-date hiện có |

---

## 9. Schema định hướng (không phải thiết kế cuối)

**`Task` (mở rộng, dùng chung mọi Space nhưng chỉ có ý nghĩa ở Shared Space):**
- `assigneeIds?: string[]` — mảng `user_id`, rỗng/undefined = chưa giao ai.

**`Settings` (mở rộng):**
- Field mới kiểu `pushNotifySharedSpaceEvents: boolean` (mặc định `true`) — điều khiển sub-toggle mục 5.3. Lưu cùng `settings` jsonb hiện có (per-user, đồng bộ qua `kn_space_state`, giống các setting khác).

**Edge Function mới — `notify-shared-task-event`:**
- Nhận JWT của user gọi (không phải `service_role` như cron) → verify user là Member của `spaceId` qua `kn_space_members` trước khi làm gì tiếp.
- Payload: `{ spaceId, taskId, taskTitle, event: 'assigned' | 'completed', recipientUserIds?: string[], excludeUserId?: string }`.
- Với `event: 'assigned'` → gửi cho đúng `recipientUserIds`.
- Với `event: 'completed'` → tự query toàn bộ `user_id` trong `kn_space_members` theo `spaceId`, trừ `excludeUserId`.
- Dùng `service_role` nội bộ (sau khi đã verify quyền) để đọc `kn_push_subscriptions` của các recipient và gửi Web Push — tái dùng nguyên logic gửi (`webpush.sendNotification`, xoá subscription hỏng khi 410/404) đã có ở `send-due-notifications/index.ts`.
- **Không cần bảng mới để chống trùng** (xem 6.2).

> Chi tiết schema (column types, RLS, index) là việc của dev sprint — không thuộc tài liệu này.

---

## 10. Câu hỏi mở / cần xác nhận thêm

Không còn câu hỏi mở — đã chốt với chủ dự án (2026-07-06):
- Debounce 15 giây (mục 6.1) giữ nguyên như đề xuất.
- Sub-toggle "Thông báo hoạt động Space chung" (mục 5.3, 9) luôn hiển thị, kể cả khi user chưa join Shared Space nào.

---

## 11. Trạng thái triển khai

✅ **Code hoàn chỉnh** (2026-07-07) — data model, UI assign (checklist + "Chọn tất cả"), avatar assignee trên Task, Edge Function `notify-shared-task-event`, wiring notify (assign/complete) qua `smartDispatch`, sub-toggle Settings. Toàn bộ qua Subagent-Driven Development (9 task, mỗi task có review riêng — xem
`docs/superpowers/plans/2026-07-06-shared-space-task-assign-notify.md` và ledger `.superpowers/sdd/progress.md`).

Đã verify tại chỗ (trong phiên code):
- `cd webapp && npx vitest run` — 15/15 test pass (4 file test: `tasks.test.ts`, `settings.test.ts`, `completeNotifyDebounce.test.ts`, `sharedTaskNotifyEffects.test.ts`).
- `npx tsc --noEmit` — sạch, không lỗi.
- `npm run build` — build thành công.
- Review riêng cho Task 5 (Edge Function) đã trace kỹ luồng bảo mật (JWT verify → membership check → lọc recipient theo member thật → tôn trọng opt-out) — không tìm thấy đường nào bypass auth/gửi push cho người không phải member.

**CHƯA verify được** (cần chủ dự án tự làm, không có credentials/thiết bị thật trong phiên code):
1. Deploy Edge Function: `cd webapp && supabase functions deploy notify-shared-task-event` (không cần set thêm secret VAPID — dùng chung với `send-due-notifications`).
2. Test end-to-end thật với 2 tài khoản Google khác nhau (đã cài PWA + bật push):
   - A tạo Shared Space, mời B join.
   - A tạo task, giao (assign) cho B → xác nhận B nhận push "📌 Bạn được giao...", A không nhận gì.
   - B tick task hoàn thành → đợi 15s → xác nhận A nhận push "✅ ... đã hoàn thành", B không nhận gì.
   - B tick/untick/tick lại trong 15s → xác nhận A chỉ nhận đúng 1 push (không spam).
   - A tắt sub-toggle "Thông báo hoạt động Space chung" → B hoàn thành task khác → xác nhận A không nhận push sự kiện này (vẫn nhận push đến hạn bình thường nếu có).
3. Kiểm tra UI thật trên browser: assignee checklist trong `TaskFormModal`, avatar hiển thị trên `TaskRow`, sub-toggle Settings — tất cả mới chỉ qua code review, chưa có screenshot/thao tác tay thật.

> Xem chi tiết đầy đủ ở Task 9 trong file plan.
