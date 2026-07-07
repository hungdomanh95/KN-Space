# Quyết định thư viện UI primitive (Popover/Dialog/Checkbox/Switch/DropdownMenu)

> Câu hỏi: dự án liên tục dính bug UI do tự tay code các thành phần tương tác phức tạp (checkbox tuỳ
> biến bị global CSS `.field input` đè style, dropdown tự viết logic mở/đóng/flip/focus dễ sai sót) —
> có nên dùng 1 thư viện component/primitive thay vì tự viết tay từ đầu mỗi lần, và nếu có thì chọn cái nào?
> Kết luận: **có — dùng Radix UI (primitives)**, áp dụng đợt đầu cho Assignee Picker (mục 5.1,
> `docs/features/shared-space-task-assign-notify.md`), các chỗ hiện có (`SpaceSwitcher`, `Modal.tsx`)
> migrate dần sau, không bắt buộc ngay.

> Vì sao đặt ở `docs/plan/` thay vì gộp thẳng vào file tính năng phát sinh nhu cầu: đây là quyết định
> **kỹ thuật áp dụng toàn dự án** (ảnh hưởng mọi popover/dropdown/dialog/checkbox/switch tương lai, không
> chỉ riêng Assignee Picker), đúng tinh thần các file quyết định kỹ thuật cross-cutting đã có sẵn ở đây
> (xem [storage-decision.md](storage-decision.md)). Gộp vào file tính năng sẽ khó tìm lại khi sau này
> migrate `SpaceSwitcher.tsx`/`Modal.tsx` — 2 chỗ không liên quan gì tới Shared Space. Đã để lại 1 dòng
> trỏ ngược từ mục 5.1 sang file này.

---

## 1. Ràng buộc dự án (tóm tắt, xem chi tiết trong `package.json`, `.claude/agents/dev.md`, `src/styles.css`)

- Stack hiện tại: React 18 + TypeScript + Vite + Tailwind CSS + `@supabase/supabase-js` + `lucide-react`.
  Không có UI framework nào khác. Nguyên tắc đã chốt (`dev.md`): *"Giữ bundle nhỏ và dependency có chủ
  đích... tránh UI framework nặng nếu chưa cần."*
- Hệ thiết kế riêng, khá đặc trưng, **không được mất khi thêm thư viện**: theme sáng/tối qua CSS custom
  properties (`--accent`, `--border`, `--raised`, `--text-dim`, `--modal-bg`...), glassmorphism alpha cao
  ~88-90% cho khối Dashboard (modal thì nền đặc, không kính mờ), không phong cách Duolingo, icon SVG line
  qua `lucide-react`. → **Bắt buộc unstyled/headless**, loại trừ ngay mọi thư viện "styled" (Material UI,
  Chakra UI, Ant Design, Mantine...) vì chúng mang theo hệ design riêng, tốn công override 100%.
- Code thủ công hiện có cần thay dần: `src/components/Modal.tsx` (dialog tự viết, portal + click-outside),
  `src/features/spaces/SpaceSwitcher.tsx` (dropdown tự viết: `wrapRef` + `mousedown` listener, **chưa có
  Escape**), checkbox tick-done trong `TasksBlock.tsx` (`role="checkbox"` tự viết, đã ổn định), toggle
  switch trong `PushNotificationSettings.tsx` (`role="switch"` tự viết, đã ổn định).
- Nhu cầu phát sinh trực tiếp: Assignee Picker dạng popover (`docs/features/shared-space-task-assign-notify.md`
  mục 5.1) — cần mở/đóng, **flip khi thiếu chỗ phía dưới**, trả focus về trigger, đóng bằng Escape/click-ngoài,
  danh sách checkbox chọn nhiều. Đây là nhiều state/edge-case nhất trong 1 component mới của dự án tới nay.

---

## 2. So sánh 4 ứng viên headless/unstyled

| Tiêu chí | **Radix UI** (primitives) | **Headless UI** (Tailwind Labs) | **Ariakit** | **react-aria-components** (Adobe) |
|---|---|---|---|---|
| Bundle size | Nhẹ, cài theo từng gói riêng (`react-popover`, `react-dialog`, `react-checkbox`, `react-switch`, `react-dropdown-menu`) — chỉ thêm cái đang dùng, nhiều internal util (portal, focus-scope, id) dùng chung giữa các primitive nên tổng chi phí khi cộng dồn 4-5 primitive tăng không tuyến tính. Số liệu chính xác cần `dev` tự đo bằng bundlephobia/`vite build` lúc cài thật. | Nhẹ tương đương, 1 gói `@headlessui/react` duy nhất chứa mọi component (kém chọn lọc hơn cài-riêng-từng-gói của Radix nhưng vẫn tree-shake được qua ESM). | Nhẹ-trung, kiến trúc store-based (`@ariakit/react`) chia nhỏ theo component nhưng ít tài liệu benchmark bundle hơn 2 lựa chọn trên. | Nặng hơn 3 lựa chọn kia — kéo theo `react-aria`/`react-stately` (nhiều hook tương tác + hạ tầng i18n/định dạng ngày giờ quốc tế) mà dự án hiện chưa cần đến mức đó. |
| React 18 + TS + Vite | Native, TS-first, ESM sạch — không vướng gì với Vite. | Native, TS-first, chính đội Tailwind Labs maintain nên tương thích Tailwind gần như mặc định. | Native, TS-first, nhưng API dựa trên "store" (`useCheckboxStore`...) khác hẳn pattern props quen thuộc, đường cong học hơi dốc hơn. | Native, TS-first, nhưng lớp trừu tượng nhiều tầng (hooks + `-aria`/`-stately` + `-components`) khiến việc "chỉ lấy đúng phần cần" phức tạp hơn 1 chút. |
| Popover (cần cho 5.1) | Có, đi kèm collision/flip detection dựng sẵn (dựa trên Popper nội bộ) — **khớp thẳng yêu cầu "flip khi thiếu chỗ phía dưới"** ở mục 5.1, khỏi cần tự viết `getBoundingClientRect()` so sánh viewport như spec đang mô tả làm phương án thủ công. | Có (`Popover`), từ bản v2 đã tích hợp `anchor` prop dùng Floating UI nội bộ để tự định vị, nhưng ít ví dụ/cộng đồng dùng cho pattern "picker nhiều lựa chọn" hơn Radix. | Có (`Popover`/`PopoverDisclosure`), đầy đủ tính năng, API qua store hơi vòng vo hơn khi chỉ cần 1 popover đơn giản. | Có (`Popover`), positioning nội bộ mạnh (đội ngũ Adobe Spectrum dùng cho sản phẩm thật phức tạp), nhưng "over-qualified" so với nhu cầu hiện tại. |
| Dialog (cho `Modal.tsx` sau này) | Có, focus-trap + Escape + return-focus + portal đầy đủ, đúng mô hình `Modal.tsx` hiện tại đang tự làm thủ công (portal, click-outside) nhưng thiếu explicit focus-trap. | Có (`Dialog`), tương đương về tính năng. | Có (`Dialog`), tương đương. | Có (`Modal`/`Dialog`), tương đương, đi kèm nhiều tuỳ biến animation/transition sẵn nhưng không cần thiết ở mức dự án hiện tại. |
| Checkbox (cho danh sách chọn Member + `TaskRow`) | Có — quan trọng: **root render ra `<button>` (không phải `<input>`)**, kèm 1 input ẩn chỉ để tương thích `form`/`FormData`. Điều này **tự động né được đúng loại bug đã xảy ra** ("checkbox tuỳ biến bị global CSS `.field input` đè style") vì selector `.field input` sẽ không khớp vào `<button>` gốc nữa. | **Không có** — Headless UI hiện không có primitive Checkbox độc lập (chỉ có `Switch`, `RadioGroup`, `Listbox`, `Combobox`, `Menu`, `Dialog`, `Popover`, `Disclosure`). Đây là khoảng trống trực tiếp ảnh hưởng nhu cầu dự án (mục 5.1.B cần checkbox tuỳ biến trong danh sách member). | Có, đầy đủ, cùng mức chất lượng Radix. | Có (`Checkbox`), đầy đủ, cùng cách né lỗi CSS selector nhờ không dùng thẳng `<input>` làm root hiển thị. |
| Switch (cho `PushNotificationSettings`) | Có, cùng logic né `.field input` như Checkbox. | Có (`Switch`), tương đương. | Có, tương đương. | Có (`Switch`), tương đương. |
| DropdownMenu (cho `SpaceSwitcher` sau này) | Có (`DropdownMenu`), kèm sẵn `Sub`, `RadioItem`, `CheckboxItem`, phân biệt rõ với `Popover` (dùng đúng ngữ nghĩa "menu hành động" thay vì "khối nội dung nổi") — nhưng với `SpaceSwitcher` hiện tại (danh sách space + nhiều control phụ như sửa/xoá/mời) thì `Popover` của Radix vẫn linh hoạt hơn `DropdownMenu` (vốn tối ưu cho menu lệnh đơn giản); tuỳ dev chọn khi tới lượt migrate. | Có (`Menu`), tương đương về vai trò nhưng không có item dạng checkbox multi-select sẵn (phải tự dựng), kém khớp hơn cho danh sách chọn nhiều. | Có (`Menu`), tương đương Radix. | Có (`Menu`), tương đương, nhưng nặng hơn cho nhu cầu đơn giản này. |
| Style bằng Tailwind + CSS variable sẵn có | Rất thuận: mọi state lộ qua **data-attribute** (`data-state="open"/"closed"`, `data-disabled`, `data-highlighted`, `data-side`...) — target thẳng bằng Tailwind arbitrary variant (`data-[state=checked]:bg-[var(--accent)]`) hoặc CSS thường, không có class/theme áp sẵn nào phải gỡ bỏ. | Tương tự, cũng dùng data-attribute (`data-headlessui-state`) hoặc render-prop — đội Tailwind Labs thiết kế để ăn khớp Tailwind gần như mặc định, không thua Radix về điểm này. | Tương tự, dùng data-attribute + render-prop, chất lượng ngang Radix nhưng ít ví dụ/community snippet có sẵn để tham khảo nhanh. | Tương tự về nguyên tắc (data-attribute), nhưng cấu trúc API nhiều lớp khiến việc target CSS đôi khi phải xuyên qua nhiều wrapper hơn 3 lựa chọn kia. |
| Phổ biến / maintain (rủi ro bị bỏ) | Rất cao — nền tảng của hệ sinh thái `shadcn/ui` (rất phổ biến hiện nay), rất nhiều ví dụ/lời giải sẵn có, hiện do WorkOS duy trì tích cực, ít rủi ro bị bỏ rơi. | Cao — do chính Tailwind Labs (đội làm Tailwind CSS) duy trì, gắn liền hệ sinh thái Tailwind nên khó bị bỏ, nhưng phạm vi component hẹp hơn Radix (thiếu Checkbox như đã nêu). | Trung bình — 1 người (Diego Haz, cựu tác giả Reakit) duy trì chính, chất lượng tốt nhưng cộng đồng/tài liệu nhỏ hơn hẳn 2 lựa chọn trên, rủi ro tuyển dev quen thuộc thấp hơn về lâu dài. | Cao — Adobe duy trì cho chính sản phẩm Spectrum của họ, rất bền, nhưng hướng đi (a11y + quốc tế hoá sâu) vượt quá nhu cầu thực tế của KN-Space hiện tại. |

> Số liệu bundle size ở trên mang tính tương đối để so sánh định hướng — `dev` cần tự đo bằng
> `npm view <pkg> dist.unpackedSize` hoặc build thử + `vite build --report`/bundlephobia tại thời điểm cài
> đặt thật, không lấy số liệu trong tài liệu này làm số đo chính thức.

---

## 3. Khuyến nghị

**Chọn Radix UI (primitives)** — không phải "cả 2 đều được".

Lý do cốt lõi, bám đúng ràng buộc thật của dự án (không phải chọn đại 1 thư viện phổ biến chung chung):

1. **Khớp thẳng cả 5 primitive đang cần** (Popover, Dialog, Checkbox, Switch, DropdownMenu) dưới dạng gói
   cài riêng lẻ — đúng tinh thần "dependency có chủ đích, giữ bundle nhỏ" của `dev.md`: chỉ cài đúng cái
   dùng, không kéo theo cả bộ.
2. **Giải quyết đúng gốc bug đã xảy ra**: Checkbox/Switch của Radix render root là `<button>`, không phải
   `<input>` — tự động tránh được va chạm với selector CSS toàn cục kiểu `.field input {}` (nguyên nhân
   bug checkbox bị đè thành ô vuông to xấu theo mô tả trong yêu cầu).
3. **Flip/collision detection dựng sẵn** cho Popover — khớp thẳng yêu cầu "flip khi thiếu chỗ phía dưới"
   ở mục 5.1 (`shared-space-task-assign-notify.md`), thay được đoạn spec hiện đang mô tả phương án thủ công
   (so sánh `getBoundingClientRect()` với viewport modal).
4. **Unstyled hoàn toàn qua data-attribute** (`data-state`, `data-disabled`, `data-highlighted`...) — style
   100% bằng Tailwind + CSS variable sẵn có (`--accent`, `--border`, `--modal-bg`...), không phải gỡ theme
   nào của thư viện, giữ nguyên toàn bộ hệ thiết kế đặc trưng đã chốt.
5. **Phổ biến/maintain tốt nhất trong 4 lựa chọn** (nền tảng của `shadcn/ui`) — rủi ro bị bỏ rơi thấp nhất,
   nhiều lời giải/ví dụ có sẵn khi debug, dễ tuyển/onboard dev quen thuộc hơn về sau.
6. Loại Headless UI vì **thiếu hẳn Checkbox** — khoảng trống trực tiếp ảnh hưởng nhu cầu chọn-nhiều-member
   ở mục 5.1.B, phải tự viết tay đúng phần đang muốn tránh. Loại Ariakit vì cộng đồng/độ phổ biến thấp hơn
   hẳn, API store-based phức tạp hơn không cần thiết. Loại react-aria-components vì nặng hơn không cần
   thiết cho nhu cầu hiện tại (đầu tư cho i18n/a11y sâu mà sản phẩm chưa cần tới).

---

## 4. Phạm vi áp dụng đợt đầu

**Ưu tiên số 1 — làm ngay:**
- **Assignee Picker** (`docs/features/shared-space-task-assign-notify.md` mục 5.1) — dùng
  `@radix-ui/react-popover` làm khung mở/đóng/flip/focus-return/Escape/click-ngoài; nội dung bên trong (ô
  tìm kiếm, "Chọn tất cả", danh sách member) style tự do theo spec đã chốt. Có thể dùng luôn
  `@radix-ui/react-checkbox` cho từng dòng member để đồng bộ pattern + hưởng lợi né bug `.field input` từ
  đầu, thay vì tự viết `role="checkbox"` mới. Ưu tiên cao nhất vì đây là component **hoàn toàn mới, chưa
  code**, không có nợ kỹ thuật/regression risk khi đổi thư viện giữa chừng.

**Gợi ý tương lai — migrate dần sau, KHÔNG phải yêu cầu làm ngay đợt này:**
- `SpaceSwitcher.tsx` (dropdown tự viết) → có thể thay bằng `@radix-ui/react-popover` (hoặc `dropdown-menu`
  nếu đơn giản hoá được phần control phụ) để có sẵn Escape-to-close (hiện đang thiếu, đã ghi nhận là biết
  nhưng chưa làm ở mục 5.1.C của file tính năng) mà không cần tự thêm listener `keydown`.
- `Modal.tsx` → có thể thay bằng `@radix-ui/react-dialog` để chuẩn hoá focus-trap/return-focus đầy đủ hơn
  (hiện tại đã làm khá tốt phần portal + click-outside, chỉ thiếu focus-trap tường minh) — vì đang hoạt
  động ổn định, đây là refactor chất lượng-về-sau, không phải nợ kỹ thuật cấp bách.
- `PushNotificationSettings.tsx` (switch tự viết) → có thể thay bằng `@radix-ui/react-switch` khi có dịp
  sửa file này vì lý do khác, không cần tách riêng 1 lượt chỉ để migrate.

**Chưa cần đổi vội:**
- Checkbox tick-done trên `TaskRow` (`TasksBlock.tsx`) — đã hoạt động ổn định, **không có bug báo cáo**,
  giữ nguyên. Có thể cân nhắc đổi sang `@radix-ui/react-checkbox` sau này nếu có đợt refactor lớn
  `TasksBlock.tsx` vì lý do khác (không phải lý do riêng cho việc này).

---

## 5. Khi nào nên xét lại

Nếu sau khi dùng thử Radix cho Assignee Picker phát sinh vấn đề thật (vd conflict CSS khó gỡ, bundle tăng
đáng kể ngoài dự tính, thiếu tính năng cần mà không có cách workaround hợp lý) — đó là tín hiệu để cân
nhắc lại 1 trong 2 ứng viên dự phòng đã so sánh ở mục 2 (Ariakit nếu cần API linh hoạt hơn, react-aria-components
nếu sau này sản phẩm cần đầu tư sâu vào accessibility/đa ngôn ngữ), không phải quay lại tự viết tay.

---

## 6. Ngoại lệ ngoài hệ Radix: `react-day-picker` cho Date/Time Picker (bổ sung 2026-07-07)

Radix UI **không có primitive Date Picker/Time Picker** (chỉ dừng ở `Popover`/`Dialog`/`Select`...
— các "khung" tương tác chung, không có logic lịch/giờ chuyên biệt). Khi cần thay `<input type="date">`/
`<input type="time">` native (popup calendar/spinner do OS/trình duyệt render, không style lại được,
lệch hẳn theme kính mờ của app — xem `docs/features/date-time-picker.md`), đã chọn:

- **`react-day-picker`** ghép cùng `@radix-ui/react-popover` (đã cài sẵn) làm khung mở/đóng/flip/
  Escape/click-ngoài cho phần **lịch chọn ngày** (`DatePicker`) — đây là thư viện calendar phổ biến
  nhất để cặp với Radix cho use-case này (không có "Radix Calendar" chính chủ), unstyled đủ để style
  100% qua props (`classNames`) mà không kéo theo CSS mặc định của thư viện, giữ đúng nguyên tắc
  "không mang theo hệ design riêng" đã áp dụng khi chọn Radix ở mục 3.
- **Phần chọn giờ** (`TimePicker`, 2 cột cuộn Giờ/Phút) **tự viết tay** — không có primitive/thư viện
  tương ứng cần cài thêm, chỉ cần `@radix-ui/react-popover` làm khung (đã có sẵn).
- Phạm vi áp dụng: 2 component dùng chung `src/components/DatePicker.tsx`/`TimePicker.tsx`, thay 5
  chỗ input native trong `TaskFormModal.tsx`/`ReminderFormModal.tsx` — xem chi tiết thiết kế đầy đủ ở
  `docs/features/date-time-picker.md`.
- Đây là **ngoại lệ duy nhất** thêm dependency ngoài hệ Radix đã chốt ở mục 3 — không đổi khuyến nghị
  chung (Radix vẫn là lựa chọn mặc định cho mọi Popover/Dialog/Checkbox/Switch/Select/DropdownMenu
  mới), chỉ bổ sung 1 thư viện hẹp phạm vi (calendar rendering) cho đúng 1 nhu cầu Radix không phủ tới.
