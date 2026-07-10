# Tính năng: Tìm kiếm toàn cục trong Space đang mở (Command Palette rút gọn)

> Tính năng mới, ưu tiên cao trong đợt brainstorm 2026-07-10. Phạm vi cố tình thu hẹp (chỉ Space đang mở,
> không xuyên Space) để làm được ngay, đúng tinh thần "gọn nhẹ, làm cuốn chiếu". Cập nhật: 2026-07-10.

---

## 1. Tổng quan

### 1.1 Pain point

App có 4 khối nội dung (Việc cần làm, Ghi chú, Nhật ký nhanh, Nhắc việc) nhưng chỉ 1 khối (Ghi chú) có ô
tìm kiếm — và kể cả có, mỗi ô search chỉ tìm được trong đúng khối chứa nó. Khi 1 Space dùng lâu ngày (đặc
biệt Space log chi tiêu hàng ngày), người dùng thường **không nhớ chính xác nội dung đó nằm ở khối nào**
("mình note cái này hay log cái này nhỉ?") — phải mở từng khối, tự tìm bằng mắt hoặc search riêng lẻ.

### 1.2 Quan hệ với "Tìm kiếm trong Nhật ký nhanh" (A3, `docs/features/tim-kiem-log-va-bulk-actions-task.md`)

B1 **không thay thế** A3 — 2 tính năng phục vụ 2 nhu cầu khác nhau:
- A3 (ô search trong `LogsBlock`): lọc **tại chỗ**, giữ nguyên ngữ cảnh đang xem (đang đọc Log, muốn lọc
  nhanh trong chính Log).
- B1 (palette toàn cục): **nhảy nhanh** tới đúng item khi chưa biết nó ở khối nào, không cần đang mở đúng
  khối đó trước.

Cả 2 cùng tồn tại là hợp lý (giống Slack vừa có search-trong-kênh vừa có Cmd+K toàn workspace) — không
over-engineering, vì chi phí xây B1 không phụ thuộc A3 đã có hay chưa.

---

## 2. User Stories

- Là người dùng, tôi muốn nhấn 1 phím tắt để mở ô tìm kiếm nhanh, gõ từ khoá, thấy ngay kết quả gộp từ
  mọi khối (Task/Note/Log/Reminder) trong Space đang mở.
- Là người dùng, tôi muốn phân biệt được kết quả thuộc khối nào (Task hay Note hay Log) trước khi bấm vào.
- Là người dùng, tôi muốn bấm vào 1 kết quả để được đưa thẳng tới đúng item đó (mở modal sửa nếu là
  Task/Note, cuộn tới đúng dòng nếu là Log/Reminder).

---

## 3. Luồng chi tiết

### 3.1 Kích hoạt

- Phím tắt `Cmd+K` (Mac) / `Ctrl+K` (Windows/Linux) — tự nhận diện OS qua `navigator.userAgent`/
  `navigator.platform`, đúng cách app đã làm cho phím tắt đổi Space (`Alt/Cmd+1-9`, `requirements.md` mục
  6). Chỉ hoạt động khi không đang gõ trong input/textarea/select và không có modal nào mở — đúng điều
  kiện chuẩn app đã áp dụng cho mọi phím tắt khác (Enter/Space/Esc ở Home, Alt+số đổi Space).
- Chỉ hoạt động **desktop** (`>999px`) ở đợt đầu — trên mobile không có bàn phím vật lý cố định, và 2 tab
  mobile hiện tại (`Trò chuyện`/`Chi tiết`) đã tự thiết kế cho lướt-tìm nhanh bằng ngón tay hơn là gõ-tìm
  (xem mục 7 Out of Scope).
- **Đã chốt (2026-07-10, chủ dự án): CHỈ dùng phím tắt `Cmd/Ctrl+K`, KHÔNG thêm icon `Search` vào
  `DashboardCorner`** — giữ nguyên bố cục 3 control đã chốt kỹ (Home/Space-switcher/Settings, mục 4.1
  `requirements.md`), không thêm control thứ 4. Không có lối vào bằng chuột/chạm cho tính năng này ở bản
  đầu — chấp nhận đây là 1 tính năng "dành cho người biết phím tắt" (power-user affordance), đúng bản
  chất command-palette phổ biến (Slack/Linear/Notion đều chỉ có phím tắt, không có icon cố định trên
  thanh điều hướng chính).

### 3.2 Modal tìm kiếm

1. Mở ra 1 modal tuỳ biến (dùng `<Modal>` sẵn có, không glassmorphism, đúng convention "Modal nền đặc, dễ
   đọc"), 1 ô input full-width `autoFocus`, phía dưới là vùng kết quả cuộn riêng.
2. Gõ từ khoá → debounce nhẹ (~150ms, tránh filter lại mỗi keystroke trên danh sách dài) → lọc:
   - Task: theo `title` + `content`.
   - Note: theo `title` + `content` (đúng logic `NotesBlock` đã có sẵn, tái dùng).
   - Log: theo `content`.
   - Reminder: theo `title`.
3. Kết quả **nhóm theo khối** (4 nhóm, ẩn nhóm rỗng), mỗi nhóm tối đa hiện N kết quả đầu (đề xuất N=5,
   xem câu hỏi mở #3) kèm dòng "Xem thêm N kết quả trong {khối}" nếu còn — bấm dòng đó để mở đúng khối đó
   (liên kết ngược với ô search riêng-khối nếu có, vd A3 cho Log).
4. Mỗi dòng kết quả hiện: icon-chip màu đúng khối (tái dùng `IconChip` + token màu `--task-color`/
   `--note-color`/`--log-color`/`--reminder-color` đã có), tiêu đề/nội dung rút gọn 1 dòng (`truncate`).
   Bôi đậm đoạn khớp từ khoá không làm ở bản đầu (xem Out of Scope).
5. Bấm 1 kết quả (hoặc `Enter` khi đang focus dòng đầu tiên qua điều hướng `ArrowUp/Down`):
   - Task/Note → đóng palette, mở đúng modal Sửa (`TaskFormModal`/`NoteFormModal`) của item đó.
   - Log/Reminder → đóng palette, cuộn khối tương ứng tới đúng item, item nhấp nháy nhẹ 1 lần để gây chú ý
     (tái dùng đúng hiệu ứng `animate-newestPulse` đã có cho label "Mới" ở khối Thông báo — không phát
     minh animation mới).
6. `Escape` hoặc click nền ngoài → đóng palette, không làm gì thêm — đúng convention "Click ra ngoài modal
   để đóng, tương đương Hủy" (`requirements.md` mục 9).

---

## 4. Permission

Không có gì đặc biệt — chỉ tìm trong dữ liệu Space hiện tại đã tải sẵn trong bộ nhớ
(`state.spaces[currentSpaceId]`), đúng những gì user vốn đã có quyền xem qua UI thường.

---

## 5. UX/UI

### 5.1 Empty/Loading/Error state

- Chưa gõ gì: gợi ý nhẹ — "Gõ để tìm Task, Ghi chú, Nhật ký, Nhắc việc trong Space này" (nội dung cụ thể
  do `uiux` tinh chỉnh khi code, có thể kèm gợi ý phím tắt khác).
- Gõ nhưng không khớp gì: tái dùng `EmptyState` sẵn có, text "Không tìm thấy kết quả nào khớp".
- Không có loading/error — thuần client-side trên dữ liệu đã tải, không có request nào (đúng mô hình
  load-on-open, không fetch thêm khi tìm kiếm).

### 5.2 Accessibility

- Modal có `role="dialog"`, focus trap chuẩn (đúng `<Modal>` sẵn có).
- Input: `aria-label="Tìm kiếm trong Space"`.
- Danh sách kết quả: `role="listbox"`, mỗi dòng `role="option"` + `aria-selected` theo dòng đang highlight
  qua bàn phím.
- Điều hướng `ArrowUp/ArrowDown` giữa các kết quả, `Enter` để chọn — chuẩn command-palette, không cần
  chuột.

### 5.3 Responsive

Chỉ desktop ở đợt đầu (mục 3.1) — không cần thiết kế mobile riêng.

### 5.4 Light/Dark theme

Dùng nguyên token màu hệ thống (icon-chip theo khối đã có màu riêng, nền modal `--modal-bg`, text
`--text`/`--text-dim`) — không cần token mới.

---

## 6. Behavior đặc biệt

- Palette build lại danh sách tìm kiếm từ `state.spaces[currentSpaceId]` mỗi lần mở (không cache riêng,
  không index nâng cao — quy mô dữ liệu cá nhân/nhóm nhỏ không cần).
- Không tìm xuyên Space khác — đổi Space trước, rồi Cmd+K lại nếu cần tìm ở Space khác (giới hạn đã nêu ở
  mục 1.1, xem Out of Scope để biết lý do không làm xuyên-Space ngay).

---

## 7. Out of Scope (đợt này)

- Tìm kiếm xuyên nhiều Space cùng lúc — Space khác (đặc biệt Shared Space) có thể chưa từng được tải đầy
  đủ vào bộ nhớ tuỳ luồng load hiện tại; làm đúng cần thiết kế lại cách "biết trước" cần fetch gì, phức
  tạp hơn nhiều so với giá trị mang lại ở quy mô 1-10 người dùng/vài Space.
- Bôi đậm (highlight) đoạn khớp từ khoá trong kết quả — nice-to-have thị giác, không ảnh hưởng chức năng,
  để sau.
- Palette trên mobile — 2 tab hiện tại đã có chiến lược riêng cho "tìm nhanh" (lướt tay trong danh sách
  ngắn theo thiết kế), thêm bàn phím ảo + palette đè lên màn hẹp không rõ lợi ích so với chi phí.
- Tìm kiếm mờ/gõ sai chính tả (fuzzy search) — chỉ substring-match đơn giản (`includes`), đúng mức độ
  "gọn nhẹ" đã áp dụng nhất quán cho A3.
- Action ngoài "tìm rồi nhảy tới item" (vd tạo nhanh Task/Note ngay từ palette) — chỉ là công cụ tìm
  kiếm/điều hướng ở bản đầu, không kiêm luôn "quick-add" (đã có quyết định riêng không làm quick-add Log
  trên desktop, giữ nhất quán triết lý không nhồi thêm nhiều chức năng vào 1 điểm vào).

---

## 8. Edge Cases

| Case | Hành vi mong đợi |
|---|---|
| Mở palette khi 1 khối đang bị tắt hẳn (theo `enabledBlocks` của Space, vd `habits` tắt) | Không tìm/hiện kết quả từ khối đã tắt — đúng logic "khối tắt = không tồn tại trong Space đó" hiện có. |
| Mở palette khi 1 khối bị ẩn NỘI DUNG (icon mắt, mục 8 requirements) — khác tắt hẳn | Vẫn tìm và hiện kết quả bình thường — ẩn nội dung chỉ là che UI hiển thị tạm thời trong phiên xem, không phải xoá quyền truy cập dữ liệu (nhất quán với việc Search Note hiện tại cũng không bị chặn bởi trạng thái ẩn nội dung của Note đó). |
| Gõ từ khoá rỗng/toàn khoảng trắng | Không lọc gì (hiện trạng thái "chưa gõ gì", không hiện "0 kết quả"). |
| Bấm kết quả là Task/Note của Shared Space, nhưng item đó vừa bị người khác xoá (giữa lúc palette đang mở, chưa reload) | Mở modal Sửa thất bại nhẹ nhàng (item không còn tồn tại trong `state` local) — cần fallback: đóng palette, không crash; đây là hệ quả tự nhiên của mô hình load-on-open, không phải lỗi riêng của tính năng này. |

---

## 9. Schema định hướng

Không đổi schema/DB — thuần tính năng client-side, đọc `state.spaces[currentSpaceId]` đã có sẵn trong bộ
nhớ. Chỉ cần state cục bộ (`open: boolean`, `query: string`) ở 1 component riêng (vd `CommandPalette.tsx`)
mount cạnh `DashboardCorner`, không cần action reducer mới, không cần field mới trong `AppState`/`Settings`.

---

## 10. Câu hỏi mở

> **Cập nhật 2026-07-10:** câu hỏi về icon `Search` trong `DashboardCorner` đã CHỐT — chỉ dùng phím tắt,
> không thêm icon (xem mục 3.1). 2 câu còn lại dưới đây vẫn mở, không chặn bắt đầu code.

1. Có cần palette này ở đợt đầu chỉ giới hạn 2-3 khối trước (vd chỉ Task+Note+Log, bỏ Reminder) để giảm
   phạm vi, rồi mở rộng Reminder sau? Đề xuất: làm đủ 4 khối luôn — độ phức tạp thêm không đáng kể (chỉ
   thêm 1 nguồn dữ liệu lọc), không cần tách nhỏ hơn nữa.
2. Số lượng kết quả tối đa hiện mỗi nhóm trước khi "Xem thêm" (đề xuất N=5, mục 3.2) — con số ước lượng
   ban đầu, `uiux`/`dev` tự tinh chỉnh theo cảm giác thực tế khi có demo.
