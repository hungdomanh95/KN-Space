# Tính năng: Ẩn thao tác kéo-thả sắp xếp thủ công trên mobile (Task/Note)

> **Đảo hướng so với bản đầu (đã xoá `keo-tha-cam-ung-va-ban-phim.md`).** Bản đầu (2026-07-10) giả định
> phải LÀM cho kéo-thả hoạt động trên cảm ứng (`@dnd-kit` hoặc tự viết Pointer Events). Chủ dự án phản
> biện đúng tiền đề: *"mobile không cần kéo thả đâu, mobile chỉ cần chat nhật ký nhanh và xem thôi là
> đủ."* Root cause kỹ thuật không đổi, nhưng **hướng xử lý đổi hoàn toàn**: không cố làm thao tác hoạt
> động trên cảm ứng nữa — ẩn hẳn affordance kéo-thả trên mobile, giữ hiển thị đúng thứ tự đã lưu (chỉ
> đọc). **Đã chốt toàn bộ (2026-07-10, chủ dự án) — không còn câu hỏi mở nào chặn code**, xem mục 12.

---

## 1. Tổng quan

### 1.1 Xác nhận lại đúng bản chất bug (dễ hiểu lầm nếu chỉ đọc tiêu đề cũ)

Bug thật **không phải** "kéo-thả không hoạt động trên mobile" (đúng, nhưng mô tả chưa đủ) — mà là: icon
grip (`GripVertical`) đang **mời gọi 1 thao tác không thể thực hiện được** trên cảm ứng (HTML5 Drag & Drop
API không có sự kiện tương ứng cho touch — giới hạn spec, không phải bug trình duyệt), và khi user thử
chạm-giữ-kéo, **không có phản hồi gì** (không lỗi, không toast, không rung nhẹ báo "không hỗ trợ") — user
không phân biệt được đây là bug hay do chính họ thao tác sai. Đây là lỗi UX nghiêm trọng hơn "thiếu tính
năng" — nó chủ động đánh lừa kỳ vọng.

Đã xác nhận qua code: tab "Chi tiết" trên mobile (`AppLayout.tsx`, accordion) render **thẳng cùng
component** `TasksBlock`/`NotesBlock` với desktop (không có bản rút gọn riêng cho mobile) — nên icon grip
hiện y hệt desktop, kéo theo đúng bug này trên chính bề mặt chính của sản phẩm dành cho di động.

### 1.2 Vì sao đổi hướng thay vì tiếp tục fix cảm ứng

Với định hướng chủ dự án vừa xác nhận (mobile chỉ cần chat + xem, không cần thao tác sắp xếp thủ công),
việc đầu tư `@dnd-kit`/Pointer Events để LÀM kéo-thả hoạt động trên cảm ứng trở thành giải quyết đúng vấn
đề nhưng sai mục tiêu — mobile không cần năng lực này. Phương án đúng đắn hơn: loại bỏ affordance gây hiểu
lầm, không phải làm nó hoạt động.

---

## 2. Quyết định hướng xử lý

### 2.1 Task — không có sort dropdown, chỉ cần ẩn grip

Task **không có khái niệm "chọn kiểu sắp xếp"** (không có `TaskSortBy`/dropdown nào, khác Note) — thứ tự
hiển thị luôn là field `order` (chỉ đổi được qua kéo-thả trên desktop, hoặc gián tiếp qua toggle "Đã
xong" tách nhóm hiển thị, mục 5.1 `requirements.md`). Vì vậy với Task, "ẩn tuỳ chọn Thủ công" không có ý
nghĩa (không tồn tại option nào để ẩn) — việc cần làm chỉ đơn giản: **ẩn icon grip + vô hiệu hoá
`armDraggable`/`draggable` trên mobile**. Danh sách vẫn hiển thị đúng theo `order` đã lưu, không đổi gì
về thứ tự — chỉ mất khả năng tương tác kéo.

### 2.2 Note — có sort dropdown, đánh giá lại đề xuất "ẩn option" của chủ dự án — ĐÃ CHỐT phương án (b)

Note có 3 tuỳ chọn sort (`order`/`title`/`recent`), và grip chỉ hiện khi `sortBy === 'order'` (điều kiện
đã có sẵn trong code, `NoteRow.tsx` dòng ~124). Chủ dự án gợi ý "ẩn/vô hiệu hoá tuỳ chọn Thứ tự thủ công
khi ở mobile" — đã cân nhắc 2 cách hiện thực khác nhau cho đúng gợi ý này:

| Cách | Mô tả | Đánh giá |
|---|---|---|
| (a) Ẩn hẳn option "Thứ tự thủ công" khỏi dropdown sort trên mobile | User không chọn được sort này trên mobile; nếu `noteSortBy` đang là `'order'` lúc chuyển sang mobile, phải tự đổi sang 1 sort khác | Đúng sát nghĩa đen gợi ý ban đầu, nhưng cần thêm logic: lọc `SORT_OPTIONS` theo `isMobile`, xử lý fallback tự đổi `noteSortBy`, và phải tính lại khi user quay về desktop (tự đổi lại `'order'` không?) — phức tạp hơn cần thiết |
| **(b) [Chốt — 2026-07-10, chủ dự án đồng ý khuyến nghị của `ba`]** Giữ nguyên option "Thứ tự thủ công" trong dropdown, chỉ ẩn thêm điều kiện grip: `sortBy === 'order' && !isMobileBlocksOnly` | User trên mobile vẫn chọn được sort "Thứ tự thủ công" — vẫn là 1 tiêu chí hiển thị hợp lệ ("theo `order` đã lưu"), chỉ là không kéo lại được | Đơn giản hơn nhiều: tái dùng đúng 1 điều kiện đã có sẵn, chỉ thêm `&& !isMobileBlocksOnly`. Không cần state mới, không cần logic "tự đổi sort khi đổi kích thước màn hình" |

**Quyết định: (b).** Lý do chính: gốc rễ trải nghiệm gãy chỉ nằm ở **icon grip hiển thị + im lặng khi
kéo**, không nằm ở việc dropdown có chữ "Thứ tự thủ công" hay không. Ẩn hẳn option (a) giải quyết đúng vấn
đề nhưng kéo theo 1 lớp state đồng bộ hai chiều (mobile↔desktop) không cần thiết, trong khi (b) đạt đúng
mục tiêu "loại bỏ affordance kéo-thả gãy trên mobile" bằng ít thay đổi hơn. Không cần logic fallback sort
thêm — dropdown giữ nguyên nội dung như hiện tại ở mọi kích thước màn hình.

### 2.3 Trả lời trực tiếp: sort hiển thị trên mobile fallback về gì?

Theo quyết định (b): **không có "fallback đổi sort"** nào cả — danh sách Note trên mobile khi
`noteSortBy === 'order'` vẫn hiển thị đúng theo `order` đã lưu (y hệt thứ tự cuối cùng user sắp xếp trên
desktop), chỉ khác duy nhất 1 điểm: **không kéo lại được** (grip ẩn). Đây chính là phương án "giữ nguyên
thứ tự đã lưu nhưng chỉ đọc — không cho kéo lại" — được chọn làm phương án chính (không phải dự phòng) vì
đơn giản hơn và **không gây bất ngờ khi đổi thiết bị/kích thước màn hình**: thứ tự nhìn thấy không đổi khi
từ desktop chuyển sang mobile, khác với phương án "tự động nhảy sang sort theo thời gian tạo" sẽ khiến
user hoang mang "sao thứ tự Note của tôi tự đổi?".

---

## 3. User Stories

- Là người dùng trên điện thoại, tôi muốn xem Task/Note theo đúng thứ tự tôi đã sắp xếp trên desktop, mà
  không thấy icon kéo-thả gây hiểu lầm là có thể thao tác được ở đây.
- Là người dùng, khi tôi thử chạm-giữ vào 1 dòng Task/Note trên điện thoại, tôi không mong đợi gì xảy ra
  (không còn affordance nào gợi ý điều đó) — tôi hiểu ngay đây là màn "xem", muốn sắp xếp lại phải mở app
  trên máy tính.

---

## 4. Luồng chi tiết

### 4.1 Task (`TasksBlock.tsx`/`TaskRow`)

1. `TaskRow` cần biết đang ở mô hình UI mobile hay không — dùng `useMobileLayout()`
   (`src/layout/useMobileLayout.ts`, ngưỡng hysteresis 999/1010px), **không dùng**
   `useMediaQuery('(max-width: 639px)')` đang có sẵn trong file. Lưu ý quan trọng cho `dev`: hook
   `useMediaQuery(639px)` hiện tại phục vụ 1 mục đích khác hẳn (chỉnh cỡ avatar/số assignee hiển thị theo
   `docs/features/shared-space-task-assign-notify.md` mục 5.2) — **không phải** tín hiệu "đang ở mô hình
   UI mobile". Dùng nhầm breakpoint 639px sẽ khiến bug vẫn còn từ 640-999px (khoảng đó app đã ở mô hình
   mobile-accordion thật nhưng điều kiện ẩn grip theo 639px vẫn trả `false`, grip vẫn hiện sai).
2. Khi `isMobileBlocksOnly` (kết quả `useMobileLayout()`) là `true`: ẩn hẳn icon `GripVertical`, và không
   set `rowRef.current.draggable = true` trong `armDraggable()` (đơn giản nhất: bỏ hẳn
   `onMouseDown={armDraggable}` khỏi JSX khi mobile).
3. Danh sách vẫn hiển thị đúng theo `sortTasksForDisplay()` hiện có (không đổi logic sort/filter) — chỉ
   mất khả năng tương tác kéo.

### 4.2 Note (`NotesBlock.tsx`/`NoteRow`)

1. Tương tự, `NoteRow` cần gọi `useMobileLayout()` (hiện chưa gọi hook này — thêm import).
2. Đổi điều kiện hiện có (`NoteRow.tsx` dòng ~124, `sortBy === 'order'`) thành `sortBy === 'order' &&
   !isMobileBlocksOnly`.
3. Dropdown `SORT_OPTIONS` **giữ nguyên đủ 3 lựa chọn**, không lọc theo `isMobile` (quyết định (b), mục
   2.2).

---

## 5. Permission

Không đổi — hành vi hiển thị/ẩn thuần UI theo kích thước màn hình, không có kiểm tra quyền.

---

## 6. UX/UI

### 6.1 Empty/Loading/Error state

Không áp dụng — thuần hiển thị dữ liệu đã tải sẵn trong bộ nhớ, không có request nào.

### 6.2 Accessibility

Task/Note trên mobile: bớt đi 1 phần tử tương tác không hoạt động — cải thiện accessibility gián tiếp
(giảm nhiễu cho screen reader, vốn trước đây có thể announce 1 phần tử "kéo được" nhưng thực tế không dùng
được qua touch). Không có thay đổi accessibility nào khác trong phạm vi tài liệu này (xem mục 8 — lối vào
bàn phím cho kéo-thả desktop đã bị loại khỏi phạm vi).

### 6.3 Responsive

- Đây **chính là** 1 thay đổi responsive — quy tắc duy nhất: `isMobileBlocksOnly` (từ `useMobileLayout()`)
  quyết định ẩn/hiện grip, đồng bộ đúng với ngưỡng chuyển mô hình UI chính của toàn app (~999/1010px
  hysteresis), không phải ngưỡng Tailwind khác (639px).
- Không còn "vùng xám" hành vi khác nhau giữa 640-999px và `<640px` (khác nếu lỡ dùng nhầm breakpoint
  639px, xem cảnh báo mục 4.1).

### 6.4 Light/Dark theme

Không liên quan — không có thay đổi màu sắc/token nào.

---

## 7. Behavior đặc biệt

### 7.1 Kéo-thả layout Dashboard (7 khối, `AppLayout.tsx`) — KHÔNG đụng, giữ nguyên hoàn toàn

Không liên quan tới quyết định này. Đó là kéo-thả **cả khối** trong layout tự do, chỉ tồn tại trên
desktop (không render trên mobile theo thiết kế đã chốt, mục 4 `requirements.md`) — không có pain point
cảm ứng vì đối tượng dùng nó luôn có chuột.

### 7.2 Tab "Trò chuyện" — xác nhận không liên quan

`MobileChatScreen` (tab mặc định trên mobile) không có kéo-thả (đã chốt "không filter/sort/kéo-thả" trong
`requirements.md` mục 2.1) — chỉ tab "Chi tiết" (accordion, render thẳng `TasksBlock`/`NotesBlock`) bị
ảnh hưởng bởi thay đổi này.

---

## 8. Out of Scope

- Làm kéo-thả hoạt động bằng cảm ứng (Pointer Events/`@dnd-kit`) — **đã loại bỏ khỏi phạm vi hoàn toàn**,
  thay bằng ẩn affordance. Đây là thay đổi phạm vi lớn nhất so với bản trước.
- Kéo-thả layout Dashboard (7 khối) — không liên quan, xem mục 7.1.
- Ẩn option "Thứ tự thủ công" khỏi dropdown Note trên mobile — đã cân nhắc, không chọn (mục 2.2).
- Thông báo/toast giải thích "vì sao không kéo được" trên mobile — không cần, vì đã ẩn hẳn grip (không
  còn affordance nào gây hiểu lầm để phải giải thích).
- **Lối vào bàn phím (`ArrowUp`/`ArrowDown` đổi vị trí Task/Note) cho kéo-thả desktop — ĐÃ QUYẾT ĐỊNH
  KHÔNG LÀM (2026-07-10, chủ dự án).** Bản trước đề xuất phần này kèm theo lý do "cần lối thay thế kéo-thả
  cho thiết bị không dùng được chuột/chạm" — nhưng lý do đó gắn liền với premise ban đầu (phải làm kéo-thả
  hoạt động trên mọi thiết bị/mọi input). Premise đó không còn đúng (mobile không cần kéo-thả nữa), nên lý
  do đưa lối bàn phím vào cũng không còn áp dụng ở đợt này — kéo-thả trên desktop vẫn chỉ dùng được bằng
  chuột như hiện tại, không đổi gì. Đây là 1 khoảng trống accessibility độc lập, tồn tại từ trước tài liệu
  này và không liên quan gì tới việc mobile có hỗ trợ kéo-thả hay không — nếu có nhu cầu thật phát sinh
  sau này, cần phân tích như 1 ý tưởng riêng, không thuộc phạm vi tài liệu này.

---

## 9. Edge Cases

| Case | Hành vi mong đợi |
|---|---|
| User đang ở desktop, `noteSortBy = 'order'`, resize cửa sổ trình duyệt xuống dưới 999px (không phải điện thoại thật, chỉ thu nhỏ cửa sổ) | Grip biến mất ngay khi `isMobileBlocksOnly` chuyển `true` (React re-render theo state hook, không cần reload) — thứ tự hiển thị không đổi. |
| User quay lại từ mobile lên desktop (resize ngược, hoặc mở lại trên máy tính) | Grip hiện lại ngay nếu `noteSortBy` vẫn là `'order'` — không cần thao tác gì thêm, vì không có state nào bị mutate ở bước ẩn (đúng lý do chọn phương án (b), mục 2.2). |
| Đang kéo Task/Note bằng chuột (desktop) đúng lúc cửa sổ resize xuống dưới ngưỡng mobile | Không xử lý đặc biệt — kịch bản gần như không khả thi thực tế (không thể vừa giữ chuột kéo item vừa kéo cạnh cửa sổ OS cùng lúc bằng 1 con chuột), không đáng thêm code phòng vệ. |

---

## 10. Acceptance Criteria

- AC1: Trên desktop (`>1010px`), grip kéo-thả Task/Note hiển thị và hoạt động y hệt hiện tại — không có
  thay đổi hành vi nào so với trước.
- AC2: Trên mobile (`≤999px`, tab "Chi tiết"), icon grip **không hiển thị** trên cả `TaskRow` lẫn
  `NoteRow` (khi `noteSortBy === 'order'`) — verify bằng Playwright: resize viewport xuống `900px`, snapshot
  DOM xác nhận không còn `GripVertical`/`draggable=true` trong 2 component này.
- AC3: Trên mobile, chạm-giữ vào 1 dòng Task/Note **không** kích hoạt bất kỳ hiệu ứng kéo nào (không
  opacity thay đổi, không dispatch `TASK_REORDER`/`NOTE_REORDER`).
- AC4: Danh sách Task/Note trên mobile hiển thị đúng thứ tự đã lưu (`order` field), giống hệt thứ tự thấy
  trên desktop trước khi resize — không có sắp xếp lại bất ngờ.
- AC5: Dropdown sort Note trên mobile vẫn đủ 3 lựa chọn (Thứ tự thủ công/Tên A-Z/Mới sửa gần nhất), chọn
  được "Thứ tự thủ công" bình thường (chỉ không có grip đi kèm).
- AC6: Resize qua lại nhiều lần quanh ngưỡng 999-1010px — grip ẩn/hiện đúng theo `isMobileBlocksOnly`,
  không giật/nhấp nháy sai (đúng cơ chế hysteresis đã có sẵn).
- AC7: `npx tsc --noEmit` + `npm run build` pass.

---

## 11. Schema định hướng

Không đổi schema/DB/reducer — thuần điều kiện hiển thị UI, dùng lại hook `useMobileLayout()` đã có sẵn.

---

## 12. Câu hỏi mở

**Không còn câu hỏi mở nào chặn bắt đầu code.** Cả 2 câu hỏi trước đó đã được chủ dự án chốt (2026-07-10),
theo đúng khuyến nghị của `ba`:

1. ~~Lối vào bàn phím (ArrowUp/Down) cho desktop — giữ hay bỏ?~~ **Đã chốt: bỏ hẳn**, không làm trong đợt
   này — xem mục 8 (Out of Scope).
2. ~~Xác nhận cách hiện thực (b) ở mục 2.2 (giữ nguyên option dropdown Note, chỉ ẩn grip)?~~ **Đã chốt:
   đồng ý phương án (b)** — không cần logic fallback sort thêm, xem mục 2.2/2.3.
