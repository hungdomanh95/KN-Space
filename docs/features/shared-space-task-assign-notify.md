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

### 5.1 Chọn assignee — Assignee Picker dạng popover

> **Cập nhật 2026-07-07 (uiux) — đề xuất thư viện UI:** toàn bộ logic mở/đóng/flip/focus/Escape mô tả ở
> mục B/C dưới đây hiện được viết ra như thể tự code tay từ đầu — nhưng đây chính là ứng viên đầu tiên nên
> dùng thư viện UI primitive (Radix UI) thay vì tự viết, xem quyết định + lý do đầy đủ ở
> [`docs/plan/ui-primitive-library-decision.md`](../plan/ui-primitive-library-decision.md) (đặt ở `docs/plan/`
> vì đây là quyết định kỹ thuật áp dụng toàn dự án, không riêng tính năng này). Mô tả UX/số liệu bên dưới
> (vị trí, kích thước, kích thước checkbox/avatar, nội dung...) vẫn là spec chính thức cần dev bám theo —
> chỉ đổi **cách hiện thực** phần khung mở/đóng/flip/focus, không đổi hành vi/hình thức nhìn thấy được.

> **Cập nhật 2026-07-07 (uiux) — THAY THẾ hoàn toàn bản checklist trước đó.** Bản checklist (audit cùng
> ngày, số liệu 16/20px checkbox, `max-h-[160px]`...) đã đúng về mặt touch-target/accessibility, nhưng
> chủ dự án nhận thấy khi nhìn UI thật: **1 khối checklist luôn-hiện, cao tới 160px, là quá nhiều diện
> tích cố định cho 1 field tuỳ chọn** — nhất là khi Space có nhiều Member, field này chiếm phần lớn modal
> dù không phải lúc nào tạo/sửa việc cũng cần giao cho ai. Thay bằng pattern **assignee picker dạng
> popover** — tham khảo trực tiếp ClickUp/Trello/Notion (3 tool quản lý task phổ biến đều dùng đúng
> pattern này): 1 nút/chip gọn hiển thị trạng thái đã chọn, bấm vào mới mở danh sách chọn nổi lên trên,
> không chiếm chỗ cố định trong modal khi không thao tác. Số liệu kích thước cụ thể (checkbox 16/20px,
> avatar 18/22px, row min-height 32/44px) được **giữ nguyên từ bản audit trước** — chỉ đổi cách trình
> bày từ "khối checklist luôn hiện" sang "danh sách trong popover, chỉ hiện khi mở", không phí công audit
> cũ.

Chỉ hiển thị field này khi `space.isShared && members.length > 0` (không đổi điều kiện gốc). Vị trí
trong form: giữ nguyên như hiện tại (sau field-row Ngày/Giờ, cuối modal trước nút Lưu) — không đổi thứ
tự các field khác.

**A. Nút trigger (chip gọn thay cho khối checklist cũ)**

| Trạng thái | Nội dung nút | Style |
|---|---|---|
| Chưa chọn ai (`assigneeIds.length === 0`) | Icon `UserPlus` (16px desktop/18px mobile) + text `+ Giao cho` | Pill: border `1.5px solid var(--border)`, bg `var(--raised)`, `rounded-[10px]`, cao 34px desktop/40px mobile (đạt touch-target). Hover: đổi border/color sang `var(--accent)` — tái dùng đúng convention hover đã có ở nút Space-switcher (`SpaceSwitcher.tsx`) để nhất quán toàn app. |
| Đã chọn ≥1 người | Avatar-stack chồng nhẹ (tối đa 4 avatar, dư ra rút gọn `+N`) + `ChevronDown` 12px bên phải gợi ý "bấm để mở" | Cùng khung pill như trên. Avatar 20px desktop/22px mobile, chồng lấn `margin-left: -6px` từ avatar thứ 2 trở đi, mỗi avatar viền `2px solid var(--modal-bg)` tạo hiệu ứng "cắt lớp" chuẩn kiểu ClickUp/Trello (khác cụm avatar cạnh-nhau có `gap` dùng trên `TaskRow` — xem ghi chú phân biệt ở mục 5.2). |

- Không hiển thị tên dạng chữ trên nút (kể cả khi chỉ chọn 1 người) — giữ nút gọn tối đa; toàn bộ tên
  đầy đủ đặt trong `title` của nút (vd `title="Giao cho: Hưng, Lan"`) để tra cứu nhanh bằng hover, không
  bắt buộc phải mở popover chỉ để xem đã giao ai.
- Responsive bề rộng nút: desktop `inline-flex` (tự co theo nội dung, không kéo full-width, giữ cảm giác
  "chip" gọn như ClickUp); mobile (`≤639px`) đổi sang `flex w-full justify-between` (full-width như mọi
  input khác trong form, đồng bộ thị giác + dễ bấm hơn trên màn hẹp).
- `aria-haspopup="true"`, `aria-expanded={open}`, `title`/`aria-label` mô tả đúng trạng thái (vd "Giao cho
  (chưa chọn ai)" / "Giao cho: Hưng, Lan").

**B. Popover (mở khi bấm trigger)**

Vị trí neo: `position: absolute`, `top: calc(100% + 6px)`, `left: 0` (mobile: `inset-x-0` thay vì
`left-0` để full-width theo đúng bề ngang trigger). Không cần portal riêng ra `document.body` như
`Modal.tsx` — popover đã nằm bên trong modal vốn đã được portal ra ngoài rồi, không gặp vấn đề
containing-block do `backdrop-filter` như comment trong `Modal.tsx` (đó là vấn đề của khối/cột dashboard
ngoài modal, không áp dụng ở đây).

Kích thước: `min-width: 260px` / `max-width: 320px` desktop; mobile full-width theo field cha. Nền
`var(--modal-bg)` đặc (không kính mờ — đúng quy ước "modal không glassmorphism" của dự án; popover này
không phải `<Modal>` nhưng vẫn nằm trong ngữ cảnh 1 modal nên giữ cùng độ rõ chữ), `border-radius` 12px,
border `1px solid var(--border)`, shadow tương tự `.space-menu` đã có sẵn trong `src/styles/components.css`
(tái dùng đúng token dropdown đã chốt, không phát minh style mới).

Cấu trúc nội dung, từ trên xuống:
1. **Ô tìm kiếm** — chỉ hiện khi `members.length > 6` (Space nhỏ hơn thì search không có giá trị, thêm
   vào chỉ dư thừa UI). Input full-width trong popover, icon `Search` (14px) bên trái, placeholder
   "Tìm thành viên...", `autoFocus` khi popover vừa mở (gõ tìm ngay, giống Notion/ClickUp).
2. **"Chọn tất cả" / "Bỏ chọn tất cả"** — 1 hàng ngay dưới ô tìm kiếm (hoặc đầu danh sách nếu không có ô
   tìm kiếm), style `btn-ghost` thu nhỏ. Label đổi động theo trạng thái **toàn bộ member thật của Space**
   — **quan trọng:** dù đang gõ tìm kiếm lọc danh sách, bấm nút này vẫn áp dụng cho toàn bộ member (không
   giới hạn theo kết quả đang lọc), tránh hành vi khó đoán "chọn tất cả nhưng chỉ chọn được vài người đang
   hiện". Giữ nguyên logic `toggleSelectAll` gốc, chỉ đổi vị trí đặt UI.
3. **Danh sách member cuộn riêng** — `max-height: 224px` cả desktop lẫn mobile (khác bản checklist cũ
   từng phải bỏ `max-h` trên mobile để tránh nested-scroll — ở đây **không còn vấn đề đó** vì popover là
   1 lớp nổi `position:absolute` tách khỏi luồng cuộn chính của modal, cuộn riêng độc lập, không lồng
   trong `overflow-y-auto` của modal). Mỗi dòng:
   - Checkbox tuỳ biến (không dùng `<input type="checkbox">` mặc định — đúng quy ước "Checkbox tuỳ biến,
     không dùng checkbox mặc định của OS" ở `docs/requirements.md` mục 9, khác quyết định tạm thời ở bản
     checklist cũ vốn chấp nhận native để đơn giản hoá): `role="checkbox"`, `aria-checked`, hình vuông bo
     góc 5-6px, `border: 1.5px solid var(--border-control)`; khi checked → nền `var(--accent)` + icon
     `Check` trắng nhỏ bên trong — tái dùng đúng visual đã có ở nút tick-done trên `TaskRow` (component
     nội bộ trong `TasksBlock.tsx`) để nhất quán 1 kiểu "custom check control" duy nhất trong toàn app,
     không phát minh kiểu mới. Kích thước: 16px desktop / 20px mobile (giữ nguyên số đã chốt ở bản audit
     checklist).
   - Avatar (`MemberAvatar`) 18px desktop / 22px mobile (giữ nguyên số đã chốt).
   - Tên member + `(bạn)` nếu là `currentUserId`.
   - Chiều cao dòng: `min-h-[32px]` desktop / `min-h-[44px]` mobile, `active:bg-[var(--raised)]` khi chạm
     trên mobile (giữ nguyên toàn bộ số liệu/lý do đã chốt ở bản audit checklist cũ — chỉ đổi khung chứa
     từ "khối luôn hiện trong modal" sang "danh sách trong popover").
   - Click bất kỳ đâu trên dòng để toggle (không chỉ riêng ô check).
4. **Empty state khi tìm kiếm không khớp**: text nhỏ "Không tìm thấy thành viên phù hợp" (`text-dim`,
   *italic*).

**C. Hành vi đóng/mở**

- Mở: click trigger.
- Đóng: (1) click ra ngoài popover (mousedown ngoài, cùng kỹ thuật `wrapRef` +
  `document.addEventListener('mousedown', ...)` đã dùng ở `SpaceSwitcher.tsx` — tái dùng nguyên pattern),
  (2) phím `Escape` khi popover đang mở (mới — `SpaceSwitcher.tsx` hiện tại **chưa** có Escape, ngoài
  phạm vi việc này để bổ sung ngược cho `SpaceSwitcher`, nhưng popover mới này bắt buộc phải có theo yêu
  cầu chủ dự án), (3) **không tự đóng khi tick chọn 1 member** — vì thao tác thường là chọn nhiều người
  liên tiếp, tự đóng sau mỗi lần tick sẽ bắt user mở lại popover nhiều lần; đúng hành vi chuẩn của
  ClickUp/Trello/Notion (assignee picker luôn ở trạng thái mở cho tới khi người dùng chủ động đóng).
- Đóng xong (bất kỳ lý do nào): trả focus về đúng nút trigger đã mở popover (accessibility).
- **Flip khi thiếu chỗ phía dưới**: nếu trigger nằm gần đáy modal (modal có `overflow-y-auto`, phần dưới
  có thể không đủ chỗ hiển thị popover `max-height 224px` + phần search/nút), popover tự chuyển sang mở
  **lên trên** trigger (`bottom: calc(100% + 6px)` thay vì `top`) — hành vi "flip" chuẩn của mọi dropdown/
  popover hiện đại (Radix Popover, Floating UI...). Cách đơn giản nhất: so sánh
  `trigger.getBoundingClientRect()` với chiều cao còn lại của modal viewport lúc mở, không cần thư viện
  định vị phức tạp nếu dự án chưa có sẵn.
- Không cần focus-trap đầy đủ kiểu modal thật (Tab có thể thoát ra khỏi popover khi hết item) — đồng bộ
  đúng mức độ accessibility hiện có của `SpaceSwitcher.tsx` (dropdown tương tự đã có sẵn trong dự án,
  cũng không trap focus), tránh làm phức tạp hơn mức cần thiết so với pattern đã được chấp nhận.

**D. Vì sao không dùng bottom-sheet trên mobile**

Modal đã tự chuyển full-height + full-width trên mobile (`max-md:h-full max-md:w-full` trong
`Modal.tsx`). Popover full-width ngay dưới trigger về bản chất đã chiếm gần hết bề ngang màn hình rồi —
thêm 1 lớp bottom-sheet riêng (dính đáy màn hình, overlay riêng, animation trượt lên, khoá scroll nền) là
dư thừa so với 1 dropdown neo đúng vị trí field. Member trong 1 Shared Space (định vị sản phẩm hiện tại là
nhóm nhỏ) thường không nhiều tới mức cần UI phức tạp hơn.

### 5.2 Hiển thị assignee trên Task item

> **Phạm vi mục này không đổi** — mô tả cách hiển thị avatar assignee/người tạo trên **`TaskRow`** (dòng
> task trong danh sách, component nội bộ của `TasksBlock.tsx`), độc lập với UI **chọn** assignee (đã
> chuyển sang popover ở mục 5.1). 2 nơi dùng avatar-stack trông hơi khác nhau **có chủ đích**: cụm avatar
> trên `TaskRow` xếp cạnh nhau có `gap` (xem bảng gap bên dưới) vì đây là **nội dung hiển thị chính** của
> dòng task, cần mỗi avatar tách bạch rõ ràng; avatar-stack trên **nút trigger** ở mục 5.1 lại xếp
> **chồng lấn** (kiểu ClickUp/Trello) vì đó chỉ là 1 **chip trạng thái gọn** trong modal, không phải nội
> dung chính cần đọc kỹ từng người.

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

### 5.6 UX modal Thêm/Sửa việc — field "Nội dung (tuỳ chọn)" dạng collapsible

> **Mới, 2026-07-07 (uiux):** chủ dự án chỉ ra khi xem UI thật — field `content` (textarea, min-height
> 90px desktop/120px mobile) trong `TaskFormModal` luôn mở rộng sẵn dù rất ít khi dùng đến (đa phần task
> chỉ cần tên + ngày giờ). Đổi sang **dạng collapsible** (tham khảo pattern "Description" của ClickUp:
> hiện rút gọn dạng link/preview, bấm vào mới mở textarea đầy đủ), mặc định thu gọn để tiết kiệm diện
> tích modal, chỉ mở khi user chủ động cần nhập. Không liên quan tới Assign Task/notify (mục 1-4 ở trên)
> — chỉ gộp chung file vì cùng nằm trong `TaskFormModal.tsx` và cùng đợt uiux audit UI thật.

**Vị trí trong form:** giữ nguyên như hiện tại (ngay sau "Tên việc", trước field-row Ngày/Giờ) — không
đổi thứ tự các field khác, chỉ đổi cách hiển thị của chính field này.

**Trạng thái mặc định khi mở modal:**

| Ngữ cảnh | `contentOpen` mặc định |
|---|---|
| Tạo việc mới | Đóng |
| Sửa việc, `content` rỗng | Đóng |
| Sửa việc, `content` đã có nội dung | **Mở** |

Lý do mở sẵn khi Sửa việc đã có nội dung: nếu mặc định đóng cả trong trường hợp này, dữ liệu đã nhập
trước đó sẽ bị "giấu" ngay khi user mở modal để sửa — cảm giác giống mất dữ liệu, lại bắt thêm 1 click để
xem lại thứ vốn đã tồn tại. Field chỉ nên "biến mất mặc định" khi nó thực sự trống — đúng tinh thần gốc
của phản hồi (thu gọn cái không dùng đến, không giấu cái đang có).

**1 hàng disclosure duy nhất, dùng chung cho mọi trạng thái** (thay hẳn cặp `<label>` + `<textarea>`
luôn-hiện hiện tại):

```
[Chevron ▸/▾]  <label/preview theo trạng thái, xem bảng dưới>
```

- Cả hàng là 1 `<button type="button" aria-expanded={contentOpen}>` full-width, `hover:bg-[var(--raised)]`
  nhẹ, bo góc 8px, padding dọc `py-2` desktop/`py-2.5` mobile (đủ touch-target khi đóng ở dạng hàng đơn).
- Icon chevron: `ChevronRight` khi đóng, `ChevronDown` khi mở, size 14px desktop/16px mobile, xoay
  `transition-transform duration-150` (đồng bộ 0.15s theo quy ước "hiệu ứng nhẹ" toàn dự án, mục 9
  `requirements.md`).

| Trạng thái | Nội dung hàng |
|---|---|
| Đóng + rỗng | Text `+ Thêm nội dung`, màu `var(--accent)` (gợi ý đây là hành động thêm mới, giống style `.add-link` đã dùng ở nút "+ Thêm" khác trong app) |
| Đóng + đã có nội dung | Label tĩnh "Nội dung (tuỳ chọn)" (`text-dim`, giữ nguyên style label field gốc) + icon `FileText` 13px (tái dùng đúng icon đã báo "có nội dung chi tiết" trên `TaskRow`) + **preview rút gọn 1 dòng**: lấy dòng đầu tiên của `content` (`content.split('\n')[0]`), hiển thị `truncate` (CSS ellipsis, không cắt thủ công theo số ký tự) trong khoảng trống còn lại của hàng |
| Mở (bất kể rỗng hay có nội dung) | Label tĩnh "Nội dung (tuỳ chọn)", không preview (textarea bên dưới đã hiện đủ) |

- Bấm vào hàng bất kỳ lúc nào để đảo trạng thái `contentOpen` — kể cả khi đã có nội dung, user vẫn có thể
  thu gọn lại để đỡ rối mắt (không mất dữ liệu, `content` state độc lập với `contentOpen`).
- Khi `contentOpen === true`: hiện `<textarea>` y hệt style/kích thước hiện tại (`note-content-field`,
  min-height 90px desktop/`max-md:min-h-[120px]` mobile) ngay dưới hàng disclosure, cách `mt-1.5`.
- `autoFocus` textarea: **chỉ** khi user vừa bấm mở từ trạng thái đóng→mở bằng tay (không áp dụng khi
  `contentOpen` mặc định là `true` lúc mount — tránh giật focus khỏi field "Tên việc" đang `autoFocus` khi
  mở modal Sửa việc có sẵn nội dung).
- Hiệu ứng mở/đóng: nhẹ (opacity + dịch chuyển nhẹ theo trục dọc, ~0.15s) — không bắt buộc animation phức
  tạp, chỉ cần tránh "giật" bố cục đột ngột.

**Edge case:**
- Gõ nội dung → đóng lại → mở lại: hiển thị đúng nội dung đã gõ (state giữ nguyên, không reset khi
  `contentOpen` đổi).
- Gõ nội dung → xoá hết → đóng lại: hàng tự rơi về trạng thái "Đóng + rỗng" (`+ Thêm nội dung`), không còn
  preview/icon `FileText` (vì `content.trim() === ''`).
- Bấm "Lưu" bất kể `contentOpen` đang mở hay đóng: luôn lưu đúng giá trị `content` hiện có trong state —
  trạng thái mở/đóng chỉ là hiển thị UI, không ảnh hưởng dữ liệu lưu xuống.

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

**Cập nhật 2026-07-07 (uiux, lần 2) — thay thế thiết kế mục 5.1 bằng popover:** sau khi chủ dự án xem UI
thật, checklist "Giao cho" (dù đã áp dụng số liệu audit ở lần cập nhật trên) vẫn bị đánh giá là **chiếm
quá nhiều diện tích cố định** trong modal cho 1 field tuỳ chọn. Mục 5.1 đã được **viết lại hoàn toàn**
sang pattern **assignee picker dạng popover** (tham khảo ClickUp/Trello/Notion) — xem chi tiết mục 5.1
mới ở trên, mục 5.2 giữ nguyên phạm vi (chỉ thêm ghi chú phân biệt với 5.1). Đây là thay đổi **thiết kế**,
chưa phải code — code hiện tại (`TaskFormModal.tsx`) vẫn đang ở dạng checklist cũ theo mô tả trước, **cần
dev cập nhật lại theo spec mới** rồi mới coi mục "Assign Task" là hoàn chỉnh về UI. Đồng thời bổ sung mục
5.6 (mới) cho field "Nội dung (tuỳ chọn)" — đổi sang dạng collapsible, mặc định thu gọn (trừ khi Sửa việc
đã có sẵn nội dung) — cũng cần dev áp dụng cùng đợt vì cùng nằm trong `TaskFormModal.tsx`.

**Cập nhật 2026-07-07 (dev) — đã áp dụng mục 5.1 (popover, Radix UI) + 5.6 (collapsible) vào
`src/features/tasks/TaskFormModal.tsx`:**
- Cài `@radix-ui/react-popover@^1.1.19` + `@radix-ui/react-checkbox@^1.3.7` (bản mới nhất tại thời
  điểm cài, peerDependencies hỗ trợ React 18) theo `docs/plan/ui-primitive-library-decision.md` mục 4.
- Assignee Picker: `Popover.Root/Trigger/Portal/Content` cho khung mở/đóng/flip/focus-return/Escape/
  click-ngoài (toàn bộ do Radix xử lý, không tự viết `wrapRef`/`mousedown`/`getBoundingClientRect()`
  như mô tả phương án thủ công cũ trong mục 5.1.C). Mỗi dòng member dùng `Checkbox.Root`/`Checkbox.Indicator`
  (Radix) — root là `<button>`, tự né bug `.field input` đã xảy ra trước đó, đồng thời do
  `Popover.Content` portal ra `document.body` nên các dòng `<label>` bên trong không còn nằm trong
  DOM subtree của `.field` — đã xoá CSS override `.field .assignee-checklist label` (không còn cần).
- Field "Nội dung" collapsible: 1 hàng `<button aria-expanded>` tự viết (không dùng Radix Collapsible,
  đúng quyết định "đơn giản nhất trước" ở yêu cầu), state `contentOpen` cục bộ + `autoFocusContentRef`
  chỉ auto-focus textarea khi user tự bấm mở từ đóng→mở.
- Verify: `npx tsc --noEmit` sạch, `npm run build` thành công, `npx vitest run` 64/64 test pass (không
  test nào động tới `TaskFormModal.tsx` trực tiếp).
- **Chưa verify UI thật trên browser** (thao tác tay, screenshot) — cần chủ dự án tự bấm thử theo
  hướng dẫn test đã gửi kèm khi báo cáo phần này.
