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

## 5. UX / UI

> **Cập nhật 2026-07-07 (uiux):** mục 5.1/5.2 dưới đây đã chốt số liệu cụ thể sau khi audit UI thật (đối chiếu code
> `TaskFormModal.tsx`, `TasksBlock.tsx`, `MemberAvatar.tsx`). Trước đó phần này chỉ là định hướng chung chung
> ("chi tiết để uiux quyết") và code đã được dev hiện thực theo phỏng đoán riêng (checkbox mặc định trình duyệt,
> avatar `size={16}`/`size={18}` cố định không đổi theo breakpoint, checklist không có xử lý mobile) — audit phát hiện
> đây là nguồn gốc cảm giác "còn lỗi nhiều" khi nhìn UI thật. Spec dưới đây là **con số cuối cùng, cần dev áp dụng lại**.

### 5.1 Chọn assignee

Checklist Member (đã có sẵn danh sách này từ panel quản lý Member) + nút "Chọn tất cả". Chỉ hiện khối này khi
`space.isShared`.

**Vấn đề phát hiện khi audit:** khối này (label `flex items-center gap-2`, `<input type="checkbox">` mặc định
trình duyệt, không `max-md:` nào) là field DUY NHẤT trong `TaskFormModal` không có override mobile, trong khi field
nội dung ngay phía trên đã có (`note-content-field max-md:min-h-[120px]`). Checkbox mặc định trình duyệt cao khoảng
13-16px, thấp hơn nhiều ngưỡng touch-target khuyến nghị 44px (WCAG 2.5.5). Mỗi dòng trong checklist cũng không có
padding dọc riêng nên vùng bấm thực tế cả dòng (dù `<label>` bọc quanh `<input>` nên về logic click-anywhere đã đúng)
vẫn quá thấp trên mobile.

**Spec chốt:**

| Thuộc tính | Desktop | Mobile (`≤639px`, `max-md:`) |
|---|---|---|
| Kích thước ô checkbox | 16px (`h-4 w-4`) | 20px (`h-5 w-5`) |
| Màu checkbox khi tick | `accent-[var(--accent)]` (đồng bộ màu accent theme, tránh xanh mặc định của trình duyệt lệch tông) | như desktop |
| Chiều cao tối thiểu mỗi dòng (`<label>`) | `min-h-[32px]` | `min-h-[44px]` (đạt ngưỡng touch-target khuyến nghị) |
| Padding dọc mỗi dòng | `py-1` | `py-2` |
| Feedback khi bấm (touch) | — | thêm `active:bg-[var(--raised)] rounded-[8px] -mx-1 px-1` để có phản hồi thị giác tức thời khi chạm (native checkbox không tự có hiệu ứng active rõ trên mobile) |
| Avatar trong checklist (`MemberAvatar size`) | 18px (giữ nguyên) | 22px |
| Khung checklist (`max-h-[160px] overflow-y-auto`) | giữ nguyên `max-h-[160px]` | **bỏ giới hạn chiều cao riêng**: `max-md:max-h-none max-md:overflow-visible` |

Lý do bỏ `max-h` trên mobile: `Modal.tsx` đã tự chuyển modal thành full-height + scroll riêng
(`max-md:h-full max-md:max-h-full ... overflow-y-auto`) khi ở mobile. Nếu vẫn giữ khung con `max-h-[160px]
overflow-y-auto` bên trong, sẽ tạo ra **2 vùng cuộn lồng nhau** (nested scroll) — trải nghiệm cuộn trên cảm ứng rất
khó chịu (ngón tay đặt đúng vùng nào cuộn vùng đó, dễ cuộn nhầm). Trên mobile nên để checklist giãn tự nhiên theo nội
dung, cuộn chung với toàn modal. Trên desktop vẫn giữ khung 160px vì đó là hành vi hữu ích (tránh modal quá cao khi
Space có nhiều Member, chuột cuộn 1 vùng nhỏ không gây khó chịu như cảm ứng).

**Có cần thay checkbox mặc định bằng custom control riêng (div/SVG) không?** Không cần thiết — chỉ cần resize +
đổi màu qua `accent-color` (đã hỗ trợ tốt trên Chrome/Safari/Firefox hiện đại, kể cả iOS Safari ≥15.4) là đủ đạt
kích thước touch-target mong muốn mà **vẫn giữ nguyên semantics/accessibility gốc** của `<input type="checkbox">`
(focus ring mặc định, phím Space để tick, screen reader đọc đúng trạng thái) — không có lý do để đánh đổi lấy 1
custom control phức tạp hơn khi native đã đáp ứng đủ yêu cầu kích thước.

### 5.2 Hiển thị assignee trên Task item

Avatar/initials nhỏ cạnh tiêu đề task, tối đa hiển thị vài người rồi rút gọn kiểu "+N" nếu nhiều.

> Lưu ý: pattern "avatar đã dùng ở panel Member" (nhắc ở bản định hướng cũ) là avatar 28px (`h-7 w-7`) trong
> `SpaceInviteModal` — đó là avatar cho **nội dung chính** của 1 dòng danh sách Member đầy đủ, không phải bối cảnh
> phù hợp để áp thẳng vào đây. Avatar trên `TaskRow` chỉ là **badge phụ** cạnh chip meta/tiêu đề — cần nhỏ hơn để
> không lấn át tiêu đề task, nhưng vẫn phải đổi theo breakpoint để không bị "lệch tỉ lệ" so với các control cạnh nó
> (nút tick-done đã to lên `max-md:h-[24px] w-[24px]` trên mobile trong khi avatar đứng yên `size={16}` — đây chính
> là 1 trong 3 điểm audit phát hiện).

**Vấn đề phát hiện khi audit:** cả avatar "người tạo" (`memberDotColor`, đầu dòng) lẫn avatar "assignee" (cụm cạnh
chip meta) đều dùng `MemberAvatar size={16}` cố định, không đổi theo breakpoint — trong khi nút tick-done cùng dòng
to lên `24px` và icon check bên trong to lên `15px` trên mobile. Kết quả: avatar trông nhỏ/khó đọc chữ cái đầu trên
mobile so với phần còn lại của dòng, lệch nhịp thị giác.

**Spec chốt kích thước avatar (`MemberAvatar size`):**

| Vị trí dùng | Desktop | Mobile (`≤639px`) |
|---|---|---|
| Avatar "người tạo" (đầu dòng `TaskRow`, `memberDotColor`) | 16px (giữ nguyên) | 20px |
| Avatar "assignee" (cụm cạnh chip meta, `TaskRow`) | 16px (giữ nguyên) | 20px |
| Avatar trong checklist Member (`TaskFormModal`) | 18px (giữ nguyên) | 22px |

> Ghi chú kỹ thuật cho dev: `MemberAvatar` hiện chỉ nhận 1 prop `size: number` áp thẳng vào `style` inline (không
> phải class Tailwind) nên không tự đổi theo breakpoint được. Cách đơn giản nhất: đọc `window.matchMedia('(max-width:
> 639px)')` (hoặc hook `useIsMobile` nếu dự án đã có sẵn pattern tương tự ở nơi khác) ở component cha (`TaskRow`,
> `TaskFormModal`) rồi truyền `size` tương ứng xuống — không cần sửa `MemberAvatar` để nhận className/CSS var, giữ
> component này đơn giản như hiện tại.

**Khoảng cách (gap) giữa các avatar liền kề trong cụm assignee:**

| | Desktop | Mobile (`≤639px`) |
|---|---|---|
| Gap giữa các avatar | 4px (`gap-1`, giữ nguyên) | 6px (`gap-1.5`) — avatar to hơn (20px) cần thêm khoảng thở để không dính chùm, tránh nhìn như 1 khối đặc |

**Cụm "+N" khi nhiều hơn số avatar hiển thị tối đa:**

- Desktop: giữ nguyên `assignees.slice(0, 3)` — 3 avatar rồi rút gọn "+N".
- Mobile (`≤639px`): giảm xuống `assignees.slice(0, 2)` — 2 avatar rồi rút gọn "+N". Lý do: avatar mobile lớn hơn
  (20px so với 16px desktop) + gap lớn hơn (6px so với 4px) → 3 avatar + "+N" trên màn hẹp (320-375px) chiếm quá
  nhiều bề ngang của 1 dòng vốn đã phải chia sẻ chỗ với chip ngày-giờ, dễ đẩy toàn bộ xuống dòng riêng không cần
  thiết. 2 avatar + "+N" đủ truyền tải "có nhiều người được giao" mà gọn hơn.

**Hành vi wrap/overflow khi 1 dòng có đủ cả 3 cụm (chip ngày-giờ + chip tên người tạo + cụm avatar assignee) trên
mobile:**

Container `flex flex-wrap items-center gap-1.5` đã cho phép tự xuống dòng, không bị vỡ layout — vấn đề chỉ là
**thứ tự ưu tiên khi phải xuống dòng**, hiện chưa được kiểm soát (thứ tự DOM = thứ tự hiển thị mặc định). Chốt thứ
tự ưu tiên theo mức độ actionable, từ cao xuống thấp:

1. **Chip ngày-giờ** (`meta`) — thông tin hạn chót, quan trọng nhất, luôn hiển thị đầu tiên mọi breakpoint.
2. **Cụm avatar assignee** — cho biết ai chịu trách nhiệm, actionable thứ nhì.
3. **Chip tên người tạo** (`memberDotName`, dạng text) — thông tin **trùng lặp một phần** với avatar người tạo đã
   hiển thị riêng ở đầu dòng (`memberDotColor`), chỉ khác là chip có tên đầy đủ dạng chữ còn avatar chỉ có 1 ký tự
   viết tắt + `title` tooltip (tooltip hover không đáng tin trên cảm ứng). Vì có avatar đầu dòng "gánh" một phần vai
   trò nhận diện rồi, chip text này là ứng viên rút gọn đầu tiên khi thiếu chỗ.

Áp dụng: trên mobile (`max-md:`), đổi thứ tự hiển thị bằng `order-*` (không đổi thứ tự DOM, giữ nguyên thứ tự đọc
cho screen reader) — `meta` → `order-1`, cụm avatar assignee → `order-2`, chip người tạo → `order-3`. Trên màn cực
hẹp (`max-sm:`, `≤479px`), **ẩn hẳn chip tên người tạo** (`max-sm:hidden`) — chấp nhận mất tên đầy đủ dạng chữ ở
kích thước màn này, giữ lại avatar đầu dòng (đã có `title`/`aria-label` đúng tên) làm nguồn nhận diện duy nhất. Cụm
avatar assignee và chip ngày-giờ **không bao giờ bị ẩn** — đây là thông tin actionable, chỉ chip người tạo (thông
tin phụ, trùng lặp) mới bị rút gọn.

### 5.3 Toggle Settings riêng
Trong Settings → tab "Chung" → khối "Thông báo đẩy" hiện có, thêm 1 sub-toggle: **"Thông báo hoạt động Space chung"** (mặc định bật), độc lập với toggle chính. Tắt sub-toggle này → không nhận noti sự kiện (giao việc/hoàn thành) nhưng **vẫn** nhận noti đến hạn bình thường.

### 5.4 Nội dung thông báo

> **Cập nhật 2026-07-07:** phát hiện khi test thật — nhồi tên Space + tên task vào 1 chuỗi `title` duy nhất bị iOS cắt mất thông tin quan trọng khi tên Space/tên task dài (`title` thông báo chỉ hiển thị gọn 1 dòng, không xuống dòng như `body`). Đổi sang tách `title` ngắn cố định + `body` chứa chi tiết (đồng bộ cách xử lý mới ở `push-notification.md` mục 5.3).

- Giao việc: `title: "📌 Được giao việc mới"`, `body: "[Tên Space]: bạn được giao "<tên task>""`
- Hoàn thành: `title: "✅ Hoàn thành việc"`, `body: "[Tên Space]: <tên task> đã hoàn thành"`

### 5.5 Audit UI khối Thông báo (Dashboard) + sub-toggle Settings — 2026-07-07

Đã đọc lại trực tiếp `NotificationsBlock.tsx` + `computeNotifications.ts` (khối "Thông báo" trên Dashboard) và
`PushNotificationSettings.tsx` (sub-toggle mục 5.3) để xác nhận có bug hiển thị/responsive liên quan tính năng này
hay không.

**Kết luận: không phát hiện bug.**

- `NotificationsBlock` hoàn toàn **độc lập** với 2 sự kiện push mới ("được giao"/"hoàn thành") — nó chỉ derive từ
  Task có `date === hôm nay` + Reminder đến hạn + Habit chưa xong trong ngày (`computeNotifications.ts`), không đọc
  `assigneeIds` hay liên quan gì đến cơ chế push event-driven ở tài liệu này. Vì vậy tính năng Assign Task không thể
  gây bug ở khối này — 2 hệ thống tách biệt hoàn toàn, đúng như mục 1 mô tả ("không dùng chung code").
- Khối "Thông báo" dùng `flex items-start gap-2`, text trong `min-w-0 flex-1 flex-col` (wrap tự nhiên, không có
  `truncate`/`line-clamp` gây cắt chữ), nút "Xong"/"Đã xong" `flex-none` không co giãn — không thấy dấu hiệu tràn
  chữ/vỡ layout ở cả 2 breakpoint khi đọc code.
- Sub-toggle "Thông báo hoạt động Space chung" trong `PushNotificationSettings.tsx` (dòng ~87-115) copy đúng cấu
  trúc/class của toggle chính ngay phía trên (đã responsive-tested trước đó) — `min-w-0` cho phần text (title + hint
  wrap tự nhiên, không cắt), switch `flex-none` cố định 42px. Không cần sửa gì thêm.

Không cập nhật `push-notification.md` vì không có phát hiện mới liên quan.

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
- `npx vitest run` — 15/15 test pass (4 file test: `tasks.test.ts`, `settings.test.ts`, `completeNotifyDebounce.test.ts`, `sharedTaskNotifyEffects.test.ts`).
- `npx tsc --noEmit` — sạch, không lỗi.
- `npm run build` — build thành công.
- Review riêng cho Task 5 (Edge Function) đã trace kỹ luồng bảo mật (JWT verify → membership check → lọc recipient theo member thật → tôn trọng opt-out) — không tìm thấy đường nào bypass auth/gửi push cho người không phải member.

**CHƯA verify được** (cần chủ dự án tự làm, không có credentials/thiết bị thật trong phiên code):
1. Deploy Edge Function: `supabase functions deploy notify-shared-task-event` (không cần set thêm secret VAPID — dùng chung với `send-due-notifications`).
2. Test end-to-end thật với 2 tài khoản Google khác nhau (đã cài PWA + bật push):
   - A tạo Shared Space, mời B join.
   - A tạo task, giao (assign) cho B → xác nhận B nhận push "📌 Bạn được giao...", A không nhận gì.
   - B tick task hoàn thành → đợi 15s → xác nhận A nhận push "✅ ... đã hoàn thành", B không nhận gì.
   - B tick/untick/tick lại trong 15s → xác nhận A chỉ nhận đúng 1 push (không spam).
   - A tắt sub-toggle "Thông báo hoạt động Space chung" → B hoàn thành task khác → xác nhận A không nhận push sự kiện này (vẫn nhận push đến hạn bình thường nếu có).
3. Kiểm tra UI thật trên browser: assignee checklist trong `TaskFormModal`, avatar hiển thị trên `TaskRow`, sub-toggle Settings — tất cả mới chỉ qua code review, chưa có screenshot/thao tác tay thật.

> Xem chi tiết đầy đủ ở Task 9 trong file plan.

**Cập nhật 2026-07-07 (uiux):** đã audit UI thật theo yêu cầu chủ dự án (nhìn giao diện thấy "còn lỗi nhiều") —
xác nhận 3 điểm cụ thể: (1) checklist "Giao cho" trong `TaskFormModal` không có override mobile nào, checkbox mặc
định quá nhỏ so với touch-target khuyến nghị; (2) avatar assignee + avatar người tạo trên `TaskRow` dùng `size`
cố định không đổi theo breakpoint trong khi nút tick-done cạnh đó có đổi; (3) chưa có thứ tự ưu tiên rõ ràng khi
chip ngày-giờ + chip người tạo + cụm avatar assignee cùng tranh chỗ trên 1 dòng ở mobile. Đã chốt số liệu cụ thể ở
mục 5.1/5.2 ở trên — **cần dev áp dụng lại rồi mới verify UI thật lần nữa** (bước 3 ở trên coi như phải làm lại sau
khi áp dụng spec mới). Khối Thông báo (Dashboard) + sub-toggle Settings đã audit riêng ở mục 5.5 — không có bug.
