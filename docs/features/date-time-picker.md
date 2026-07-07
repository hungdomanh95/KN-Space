# Tính năng: DatePicker / TimePicker tuỳ biến

> Thay thế `<input type="date">` / `<input type="time">` native (popup do OS/trình duyệt render,
> không theo được theme kính mờ của app, không style lại được bằng CSS) bằng 2 component dùng
> chung, xây trên `react-day-picker` + `@radix-ui/react-popover` (đã có sẵn trong dự án).
> Cập nhật: 2026-07-07. Input cho `dev` — không chứa code thật.

---

## 1. Tổng quan

Hiện có **5 chỗ gọi input ngày/giờ native** trong 2 file:

| File | Field | Loại | State hiện tại |
|---|---|---|---|
| `TaskFormModal.tsx` | "Ngày (tuỳ chọn)" | date | `date: string` (`"YYYY-MM-DD"` hoặc `""`) |
| `TaskFormModal.tsx` | "Giờ (tuỳ chọn)" | time | `time: string` (`"HH:MM"` hoặc `""`) |
| `ReminderFormModal.tsx` | "Ngày" (khi `type === 'once'`) | date | `date: string` |
| `ReminderFormModal.tsx` | "Giờ (tuỳ chọn)" (khi `type === 'once'`) | time | `onceTime: string` |
| `ReminderFormModal.tsx` | "Giờ trong ngày (tuỳ chọn)" (khi `freqUnit !== 'hour'`) | time | `time: string` |

Tất cả đều là field **tuỳ chọn** (có thể để rỗng), format string giữ nguyên `"YYYY-MM-DD"` /
`"HH:MM"` — đúng format Postgres/JS Date đang lưu, không đổi để tránh phải sửa logic chấm dứt
hạn/tính thông báo ở nơi khác (`NotificationsBlock`, v.v.).

**Mục tiêu component mới:**
- 2 component dùng chung đặt tại `src/components/DatePicker.tsx` và `src/components/TimePicker.tsx`.
- API tối giản `{ value: string; onChange: (v: string) => void }` — cắm thẳng vào state cha hiện
  có, **không đổi 1 dòng state nào** ở `TaskFormModal`/`ReminderFormModal`.
- Giao diện khớp 100% theme app (kính mờ nhẹ ở Dashboard nhưng đây là overlay dạng menu/select
  — theo đúng tiền lệ `.space-menu-surface` đã dùng cho `SpaceSwitcher`/`Select` — tức **nền đặc,
  không kính mờ**, giống các popover/menu khác trong app, không phải khối Dashboard).
- Không kéo theo CSS mặc định của `react-day-picker` (`react-day-picker/dist/style.css`) — style
  100% qua props tuỳ biến (`classNames`/`components`) ánh xạ vào class Tailwind + CSS variable sẵn
  có (`--accent`, `--border`, `--raised`, `--text-dim`...), đúng tinh thần đã áp dụng cho Radix.

---

## 2. User Stories

- Là người dùng, khi tạo/sửa Việc cần làm hoặc Nhắc việc, tôi muốn chọn ngày qua 1 lịch tháng đẹp,
  đúng theme app, thay vì popup lịch xấu/lệch tông của trình duyệt.
- Là người dùng, tôi muốn bấm 1 nút để chọn nhanh "Hôm nay" thay vì phải lần lượt bấm qua các ngày.
- Là người dùng, tôi muốn xoá ngày/giờ đã chọn để field quay lại trạng thái "chưa chọn" (field vốn
  tuỳ chọn) mà không cần chọn lại từ đầu hay dùng phím Backspace mò mẫm như input native.
- Là người dùng, tôi muốn chọn giờ bằng cách cuộn nhanh qua danh sách giờ/phút, thay vì spinner số
  kiểu OS khó bấm chính xác trên di động.
- Là người dùng dùng bàn phím/screen reader, tôi vẫn thao tác được đầy đủ các picker này (mở, di
  chuyển giữa các ngày/giờ, chọn, đóng bằng Escape).

---

## 3. Luồng chi tiết

### 3.1 DatePicker — trigger

- Render 1 `<button type="button">` thay hoàn toàn cho `<input type="date">`, đặt trong cùng
  `.field` như cũ (giữ nguyên `<label>` phía trên).
- **Lưu ý cho dev:** class global `.field input:not([type=checkbox]):not([type=radio])` chỉ khớp
  thẻ `<input>`, sẽ **không** tự áp style lên `<button>` này (khác input native cũ) — trigger phải
  tự mang đủ style tương đương (border `1px solid var(--border)`, bo góc `9px`, nền
  `var(--raised)`, padding `11px/9px`, cỡ chữ `0.9375rem`) để không bị "tụt" nhìn xấu hơn field
  khác trong cùng modal. Đây đúng loại lỗi đã ghi nhận ở Bug 1 (`radix-ui-migration-progress.md`) —
  nêu lại để tránh lặp.
- Nội dung trigger:
  - Có giá trị: hiển thị `DD/MM/YYYY` (khớp định dạng vừa đổi ở `TasksBlock.tsx`, xem
    `docs/plan/radix-ui-migration-progress.md` mục Bug 4), icon lịch (`CalendarDays` từ
    `lucide-react`) bên trái, căn trái.
  - Rỗng: hiển thị placeholder chữ thường `dd/mm/yyyy` màu `var(--text-dim)` — giữ đúng gợi ý chủ
    dự án, đồng thời quen thuộc với format input date cũ.
- `title`/`aria-label` động: có giá trị → `"Ngày đã chọn: DD/MM/YYYY, bấm để đổi"`; rỗng →
  `"Chọn ngày"`. `aria-haspopup="dialog"`, `aria-expanded` theo state mở/đóng.

### 3.2 DatePicker — nội dung Popover

- `Popover.Root` state `open` cục bộ trong component (không lộ ra ngoài qua prop — API bên ngoài
  chỉ có `value`/`onChange`).
- `Popover.Trigger asChild` bọc button ở 3.1. `Popover.Portal > Popover.Content`:
  - `align="start"`, `sideOffset={6}`, `collisionPadding={8}` (Radix tự flip lên trên nếu thiếu chỗ
    phía dưới — đúng model đã dùng ở `AssigneePicker`/`SpaceSwitcher`).
  - **Chiều rộng cố định, không phụ thuộc bề rộng field/trigger** (khác `Select`/`SpaceSwitcher` vốn
    khớp bề rộng trigger) — lý do: lịch tháng cần tối thiểu ~7 cột ngày × ô đủ lớn để bấm được bằng
    ngón tay (khuyến nghị ô ~36×36px), nếu ép theo bề rộng trigger (có thể chỉ ~140px khi 2 field
    Ngày/Giờ nằm cạnh nhau trên desktop trong `.field-row`) lịch sẽ bị bóp méo/tràn chữ. Chọn
    **width cố định ~296px** ở mọi breakpoint (đủ 7 cột × 36px + padding, không cần biến thể mobile
    riêng).
  - `z-[70]` (khớp tiền lệ `AssigneePicker` — cả 2 đều là popover mở bên trong 1 `Modal` đã có
    `z-50`, cần vượt qua để không bị modal che).
  - Class nền/border/shadow: dùng lại đúng `.space-menu-surface` cho phần khung ngoài (đã có sẵn,
    không tạo class mới trùng lặp) + 1 class con riêng (vd `.date-picker-calendar`) chỉ chứa các
    khai báo áp cho phần tử con của `react-day-picker` (căn giữa lưới ngày, cỡ ô, màu chữ).
- Bên trong khung, xếp dọc theo thứ tự:
  1. **Header điều hướng tháng**: nút lùi tháng (`ChevronLeft`) — nhãn "Tháng M, YYYY" — nút tới
     tháng (`ChevronRight`). Dùng đúng cơ chế điều hướng có sẵn của `react-day-picker` (không tự
     viết lại state tháng/năm).
  2. **Lưới ngày** (`react-day-picker`, `mode="single"`):
     - `locale` tiếng Việt (`date-fns/locale/vi`), tên thứ viết tắt kiểu "T2 T3 T4 T5 T6 T7 CN",
       tuần bắt đầu **Thứ Hai** (`weekStartsOn: 1` — quy ước phổ biến ở Việt Nam, khác mặc định
       Chủ Nhật của thư viện).
     - Ngày đang chọn: nền `var(--accent)`, chữ trắng (đúng pattern `.btn-primary`/`data-[state=checked]`
       đã dùng cho Checkbox/Switch — nhất quán màu accent = "đang active" xuyên suốt app).
     - Hôm nay (nếu khác ngày đang chọn): không tô nền, chỉ có 1 dấu chấm nhỏ/viền mảnh bên dưới số
       để phân biệt, tương tự cách khối Thói quen đánh dấu "hôm nay" trong dãy 7 chấm (mục 5.3
       `requirements.md`) — giữ ngôn ngữ hình ảnh nhất quán trong app.
     - Ngày ngoài tháng hiện tại: chữ mờ `var(--text-dim)` opacity thấp hơn, vẫn bấm chọn được
       (chuyển tháng theo ngày đó) — hành vi mặc định của thư viện, không tắt.
     - Hover/focus 1 ô ngày: nền `var(--raised)`, viền focus rõ `outline` màu accent khi điều hướng
       bằng bàn phím (accessibility — xem mục 4).
  3. **Hàng nút hành động** (footer, chia đều 2 nút):
     - **"Hôm nay"**: set `value` = ngày hiện tại (local, `YYYY-MM-DD`), đóng popover.
     - **"Xoá"**: set `value = ''`, đóng popover. Disabled (mờ, `aria-disabled`) khi `value` đã rỗng
       sẵn — tránh thao tác vô nghĩa.
- Chọn 1 ngày trong lưới → gọi `onChange` ngay + đóng popover (không cần thêm nút "Áp dụng" — chọn
  xong là xong, đúng tinh thần "chọn nhanh" của yêu cầu, giống hành vi input date native cũ).

### 3.3 TimePicker — trigger

- Cùng nguyên tắc như 3.1: `<button>` thay `<input type="time">`, tự mang style tương đương
  `.field input`.
- Icon `Clock` (lucide-react) + nội dung: có giá trị hiển thị `HH:MM`; rỗng hiển thị `--:--` màu
  `var(--text-dim)` (đúng gợi ý chủ dự án).
- `title`/`aria-label`: có giá trị → `"Giờ đã chọn: HH:MM, bấm để đổi"`; rỗng → `"Chọn giờ"`.

### 3.4 TimePicker — nội dung Popover

- Cấu trúc 2 cột cuộn độc lập đặt cạnh nhau, chia đôi bởi dấu `:` tĩnh ở giữa:
  - **Cột Giờ**: 24 dòng `00`–`23`.
  - **Cột Phút**: bước **5 phút** (`00, 05, 10, ..., 55` — 12 dòng/cột).
- **Vì sao bước 5 phút, không phải 15:** phù hợp cho cả 2 use-case của app — Task/Reminder "một
  lần" (giờ họp/hẹn cụ thể, người dùng hay có mốc như `14:05`/`09:35`) lẫn Nhắc việc lặp lại theo
  giờ trong ngày (uống nước, tập thể dục — không cần chính xác tới phút nhưng cũng không sao khi có
  sẵn). Bước 15 phút (4 dòng) tuy cuộn ít hơn nhưng quá thô cho giờ hẹn thực tế; bước 1 phút (60
  dòng) quá dài để cuộn trên di động. 5 phút là điểm cân bằng phổ biến nhất ở các time-picker dạng
  cuộn (giữ danh sách đủ ngắn: 12 dòng, mỗi dòng ~32-36px cao ≈ tổng ~400px cuộn được gọn trong
  khung `max-height` vừa phải).
- Mỗi cột có `max-height` cố định (vd ~200px, hiện ~5-6 dòng cùng lúc, phần còn lại cuộn), tự động
  cuộn tới vị trí giờ/phút đang được chọn khi mở popover (nếu `value` có sẵn); nếu `value` rỗng,
  cuộn cột Giờ tới giờ hệ thống hiện tại (làm điểm khởi đầu thuận tiện, **không** tự gán giá trị —
  chỉ là vị trí cuộn ban đầu, người dùng vẫn phải bấm chọn mới có `onChange`).
- Bấm 1 ô giờ hoặc 1 ô phút → cập nhật ngay phần tương ứng trong `value` (giữ nguyên phần còn lại
  nếu đã có, mặc định phần còn lại là giờ hệ thống hiện tại/`00` phút nếu trước đó rỗng) và gọi
  `onChange` — không cần đóng popover ngay (khác DatePicker) vì người dùng thường cần bấm cả giờ
  lẫn phút liên tiếp; có nút "Xong" nhỏ ở cuối để chủ động đóng, cộng thêm đóng được qua
  Escape/click-ngoài (Radix lo sẵn) khi đã chọn xong.
- Nút **"Xoá"** cạnh nút "Xong" trong footer: set `value = ''`, đóng popover, disabled khi đã rỗng
  (đồng bộ hành vi với DatePicker).
- Ô giờ/phút đang được chọn (khớp chính xác với `value` hiện tại): nền `var(--accent)`, chữ trắng —
  cùng ngôn ngữ visual với DatePicker.
- Width Popover: cố định, nhỏ hơn DatePicker nhiều (2 cột ngắn `00`-`23`/`00`-`55`, mỗi cột rộng
  ~64px) — tổng khoảng **~150-160px**, giữ nguyên ở mọi breakpoint (không cần biến thể mobile vì đã
  đủ hẹp, không có nguy cơ tràn màn hình 320px).

---

## 4. UX/UI

### 4.1 Empty state
- Cả 2 trigger hiển thị placeholder nhạt màu (`dd/mm/yyyy` / `--:--`) khi `value === ''` — không tự
  ý điền giá trị mặc định (giữ đúng bản chất "field tuỳ chọn", khác hành vi nếu tự động gán "hôm
  nay"/"giờ hiện tại" sẽ đổi ý nghĩa dữ liệu ngoài ý muốn người dùng).
- Nút "Xoá" luôn có mặt nhưng bị `disabled` (mờ ~30% opacity, `pointer-events-none`, đúng pattern
  `.icon-btn:disabled` đã có trong `components.css`) khi field đang rỗng sẵn — tránh người dùng bấm
  vô nghĩa, đồng thời báo hiệu rõ trạng thái hiện tại.

### 4.2 Accessibility cơ bản
- Trigger: `type="button"`, `title` + `aria-label` mô tả đúng giá trị hiện tại (nêu ở 3.1/3.3),
  `aria-haspopup="dialog"`, `aria-expanded` đồng bộ state Popover.
- Đóng bằng Escape/click ra ngoài: **Popover của Radix tự lo**, không cần code thêm (đúng lợi ích
  đã ghi nhận khi migrate `SpaceSwitcher`/`Select` sang Radix).
- Lưới ngày: dựa vào accessibility có sẵn của `react-day-picker` (đã hỗ trợ điều hướng phím mũi
  tên giữa các ngày, PageUp/PageDown đổi tháng, Home/End nhảy đầu/cuối tuần, `aria-selected` trên ô
  đang chọn) — **không tự viết lại**, chỉ cần đảm bảo không override mất các thuộc tính ARIA khi
  tuỳ biến `classNames`.
- 2 cột giờ/phút của TimePicker (tự viết, không có sẵn thư viện tương đương react-day-picker): mỗi
  cột là `role="listbox"` có `aria-label` ("Giờ"/"Phút"), mỗi dòng là `role="option"` +
  `aria-selected`; điều hướng bằng phím mũi tên lên/xuống trong cùng cột, `Tab` chuyển giữa 2 cột,
  `Enter`/`Space` chọn — mức tối thiểu cần có, không bỏ qua vì đây là phần **duy nhất tự viết tay**
  trong 2 component này (react-day-picker lo phần lịch, Radix Popover lo phần mở/đóng/focus-return).
- Nút "Hôm nay"/"Xoá"/"Xong": `<button type="button">` thường + label chữ rõ ràng, không cần thêm
  `aria-label` (đã có text hiển thị).
- Contrast khi đổi theme sáng/tối: ngày/giờ đang chọn dùng nền `var(--accent)` + chữ trắng cố định
  (không đổi theo theme, giống `.btn-primary`) — đảm bảo tỷ lệ tương phản qua cả 2 theme vì `--accent`
  luôn đủ đậm theo thiết kế hệ màu hiện có của app.

### 4.3 Responsive desktop vs mobile
- **Không làm Popover full-width theo field cha** ở bất kỳ breakpoint nào — khác với
  `SpaceSwitcher`/`Select` (vốn hợp lý full-width vì nội dung là danh sách text 1 cột). Lịch tháng
  cần đủ ngang cho 7 cột, ép hẹp theo field (đặc biệt khi Ngày/Giờ xếp cạnh nhau trong
  `.field-row` ở desktop, mỗi field chỉ ~50% modal) sẽ làm ô ngày quá nhỏ để bấm chính xác — nhất là
  trên mobile nơi ngón tay cần vùng chạm ≥ ~32-36px.
- Vì Popover width cố định (không phụ thuộc trigger), `collisionPadding={8}` của Radix tự đảm bảo
  không tràn ra ngoài viewport kể cả màn hẹp 320-375px (Radix tự dịch ngang/dọc trong giới hạn
  viewport) — không cần logic responsive riêng do `dev` tự viết.
- `.field-row` hiện có sẵn `max-md:flex-col` (Ngày/Giờ xếp dọc trên mobile, xem `components.css`) —
  giữ nguyên, không ảnh hưởng bởi việc đổi input → button vì đây là CSS ở cấp `.field` cha, không
  phụ thuộc thẻ con là `input` hay `button`.

---

## 5. Edge Cases

| Case | Hành vi mong đợi |
|---|---|
| `value` là chuỗi rỗng `''` | Trigger hiện placeholder, nút "Xoá" trong popover bị disabled. |
| `value` là dữ liệu hỏng/không parse được (vd string méo do lỗi cũ) | Trigger fallback về placeholder (coi như rỗng), không crash; mở popover thì lịch/time list mở ở vị trí mặc định (tháng hiện tại / giờ hệ thống). |
| Task ghi nhận việc đã làm trong quá khứ | DatePicker **không giới hạn ngày quá khứ** — giữ đúng hành vi input `date` native cũ (không có `min`/`max`), phù hợp vì Task có thể cần ghi ngày đã qua. |
| Bấm lại đúng ngày/giờ đang được chọn | Không có gì đổi (không phải toggle-off) — muốn về rỗng phải bấm "Xoá" tường minh, tránh mất dữ liệu do bấm nhầm lần 2. |
| Giá trị giờ có sẵn không tròn bước 5 phút (vd dữ liệu cũ `"07:03"`, hoặc import từ file JSON) | Trigger vẫn hiển thị đúng **chính xác** `07:03` (không làm tròn). Trong popover, không ô phút nào được tô "đang chọn" (vì `03` không nằm trong danh sách `00/05/10...`) — cột Giờ vẫn tô đúng ô `07`. Nếu người dùng bấm 1 ô phút bất kỳ, giá trị mới ghi đè đúng theo bước 5 đã chọn (vd chọn `05` → `07:05`), không cố "giữ lại phần lẻ cũ". |
| Popover đang mở, người dùng đổi orientation màn hình / resize cửa sổ (mobile xoay ngang) | Radix Popover tự tính lại vị trí theo `collisionPadding`, không cần xử lý thêm. |
| Mở nhiều field Ngày/Giờ liên tiếp trong cùng modal (Reminder lặp lại có 2 field time cùng lúc khi `freqUnit === 'month'`) | Mỗi instance DatePicker/TimePicker có state `open` độc lập — mở field này không ảnh hưởng field kia; chỉ 1 popover mở tại 1 thời điểm là hành vi tự nhiên (người dùng chỉ bấm được 1 trigger 1 lúc). |
| Modal cha đóng khi popover con đang mở (vd bấm Escape) | Escape đầu tiên đóng Popover con trước (Radix nested Escape theo đúng thứ tự mở gần nhất), Escape thứ 2 mới đóng Modal — hành vi mặc định của Radix khi 2 lớp overlay lồng nhau, không cần code thêm. |
| Ngày hiển thị trên trigger khi đã chọn | Bắt buộc đúng format `DD/MM/YYYY` — khớp 100% với format vừa đổi ở danh sách Task (`TasksBlock.tsx`, xem `docs/plan/radix-ui-migration-progress.md` mục Bug 4), tránh 2 chỗ hiển thị ngày khác định dạng nhau trong cùng 1 khối tính năng. |
| Chuyển đổi giữa Date object (`react-day-picker`) và string `"YYYY-MM-DD"` (state cha) | Lưu ý kỹ thuật cho `dev`: phải dựng/đọc `Date` theo **thành phần năm-tháng-ngày local** (`new Date(y, m - 1, d)` / đọc `getFullYear/getMonth/getDate`), **không** parse thẳng bằng `new Date("YYYY-MM-DD")` (constructor này hiểu chuỗi ISO là UTC-midnight, có thể lệch ngày ở các múi giờ âm) — dù VN (UTC+7) ít gặp lỗi lệch ngày hơn múi âm, vẫn nên làm đúng ngay từ đầu để component tái dùng an toàn nếu sau này có người dùng ở múi giờ khác. |

---

## 6. Câu hỏi mở — đã chốt (2026-07-07, không mở rộng phạm vi ngoài yêu cầu gốc "đồng bộ UI")

1. **Giới hạn năm hiển thị:** KHÔNG giới hạn — giữ đúng hành vi input date cũ (không `min`/`max`).
   Không thuộc phạm vi yêu cầu ban đầu (chỉ là đồng bộ giao diện, không đổi behavior).
2. **Chặn ngày quá khứ cho Nhắc việc "1 lần":** KHÔNG thêm — input date cũ vốn cũng không chặn,
   giữ nguyên hành vi tự do để tránh mở rộng phạm vi ngoài yêu cầu "đồng bộ UI" ban đầu. Có thể làm
   sau nếu chủ dự án yêu cầu riêng.
3. **Nút "Bây giờ" cho TimePicker:** KHÔNG thêm — yêu cầu gốc chỉ nói "Xoá", input time cũ cũng
   không có nút tương tự. Giữ đúng phạm vi.
4. **Bước phút 5 phút:** giữ nguyên quyết định ở mục 3.4, không cần nhập tay song song — ngoài phạm
   vi đợt này.

---

**Trạng thái triển khai: ✅ Code xong (2026-07-07), chưa test tay trên browser thật.**
