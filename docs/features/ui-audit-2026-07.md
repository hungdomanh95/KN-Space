# UI/UX Audit toàn app — 2026-07

> Rà soát toàn bộ UI/UX KN-Space (desktop + mobile) sau đợt migrate Radix UI + xây `DatePicker`/`TimePicker`.
> Đối chiếu `docs/requirements.md` + toàn bộ `docs/features/*.md` với CODE THẬT trong `src/` (không chỉ đọc docs).
> Phạm vi: tìm inconsistency + đề xuất polish, KHÔNG code, KHÔNG đổi mô hình UI cốt lõi đã chốt.
> Người thực hiện: uiux. Cập nhật: 2026-07-07.

---

## 0. Tổng quan

Đã đọc toàn bộ `docs/requirements.md`, `docs/plan/README.md` + `docs/plan/*.md` liên quan (Radix migration, UI primitive decision), toàn bộ `docs/features/*.md`, và CODE THẬT của: `src/features/home/`, `src/layout/AppLayout.tsx` + `MobileChatScreen.tsx` + `useMobileLayout.ts` + `Splitter.tsx`, `src/components/*.tsx` (DashboardCorner, Modal, EmptyState, MemberAvatar, BlockShell, IconChip, ConfirmModal, AppBackground, LoadingScreen, DatePicker, TimePicker), toàn bộ 5 khối dữ liệu + Today + Notifications + Spaces + Settings, `src/App.tsx`, `src/auth/LoginScreen.tsx`, `src/pages/JoinSpacePage.tsx`, `src/styles.css` + `src/styles/components.css`.

**Phát hiện quan trọng nhất (đọc trước khi xem chi tiết):** `docs/requirements.md` mô tả mobile ở ngưỡng `≤639px`, có màn Home, và Dashboard mobile chỉ gồm 2 khối accordion — nhưng CODE THẬT (`useMobileLayout.ts`, `App.tsx`, `MobileChatScreen.tsx`) cho thấy sản phẩm đã pivot khá xa khỏi mô tả này: ngưỡng chuyển mobile thật là **~1000px** (không phải 639px), **Home đã bị bỏ hẳn trên mobile**, và có thêm **1 màn "Trò chuyện" (chat-style) hoàn toàn mới** làm mặc định + 1 tab bar "Trò chuyện/Chi tiết" — không có dòng nào trong `requirements.md` nhắc tới. Theo đúng chỉ dẫn "ưu tiên hỏi lại thay vì tự suy đoán" khi mục 4 được đánh dấu lỗi thời, toàn bộ audit này **đã đối chiếu theo code thật** (đúng nguyên tắc "code thật thắng doc" ghi trong `docs/plan/README.md`), nhưng đây là câu hỏi mở **ưu tiên cao nhất** cần `ba` xác nhận trước (xem mục 3).

Số lượng phát hiện theo mức ưu tiên: **Cao: 7** · **Trung bình: 10** · **Thấp: 8**.

---

## 1. Bảng phát hiện

### 1.1 Accessibility

| # | Mô tả cụ thể (file:dòng) | Ưu tiên | Đề xuất fix |
|---|---|---|---|
| A1 | `--text-dim` (`#8a857c`) trên nền `--raised` (`#f5f4f1`) ở **theme sáng** cho contrast ratio đo được ≈ **3.34:1** (tính theo công thức WCAG relative luminance) — dưới ngưỡng 4.5:1 cho chữ thường. Theme tối cùng cặp token đạt ≈5.16:1 (đạt). Token này dùng cực rộng: `.hint`, `.field label`, meta chip (`TaskRow`/`RemindersBlock`), `EmptyState` hint, label Settings, placeholder input... → rất nhiều chữ phụ trong toàn app ở theme sáng thực tế mờ hơn ngưỡng khuyến nghị. | Cao | Tăng độ đậm `--text-dim` ở `:root` (vd `#75706a` hoặc đậm hơn) — đo lại contrast thật (Playwright/DevTools) trước khi push, theo đúng quy trình đã chốt (`feedback-visual-tweak-preview-first`). Không đổi token dark theme (đã đạt). |
| A2 | ✅ **Đã fix 2026-07-07.** `src/features/spaces/SpaceInviteModal.tsx` dòng ~165 (`handleKick`) và ~179 (`handleLeave`) dùng `window.confirm(...)` trực tiếp — vi phạm rõ yêu cầu "Xác nhận xoá dùng modal tuỳ biến, không dùng `window.confirm()`" (`requirements.md` mục 9) và không khớp nội dung message cụ thể đã đặc tả ở `docs/features/shared-space.md` mục 3.4/3.5 (yêu cầu message chi tiết như "Xoá [tên] khỏi space này? Họ sẽ mất quyền truy cập ngay lập tức."). Đây là bug thật còn sót lại sau đợt migrate Radix (không nằm trong danh sách kiểm kê của `radix-ui-migration-progress.md`). | Cao | Dùng `useConfirm()` (đã có sẵn, dùng ở mọi nơi khác trong app) thay `window.confirm`, với đúng nội dung message đã chốt ở `shared-space.md`. **Đã áp dụng đúng như đề xuất.** |
| A3 | ✅ **Đã fix 2026-07-07.** `src/pages/JoinSpacePage.tsx` dòng ~244-246 (`🎉`), ~264-266 (`✕` dạng text), ~284-286 (`?` dạng text) — dùng emoji/ký tự thay icon SVG, vi phạm "Không dùng emoji làm icon chính. Dùng hệ icon SVG line-icon nhất quán" (mục 9). | Trung bình | Đổi sang `PartyPopper`/`CheckCircle2`/`XCircle`/`HelpCircle` từ `lucide-react`, đồng bộ toàn bộ icon trong trang. **Đã dùng `PartyPopper`/`XCircle`/`HelpCircle`.** |
| A4 | ✅ **Đã fix 2026-07-07.** Nút Sửa/Xoá/Ẩn trên `TaskRow` (`src/features/tasks/TasksBlock.tsx` dòng ~186, class `opacity-0 ... group-hover:opacity-100`, không override mobile) và `.nc-tools` trên `NoteCard` (`src/styles/components.css` dòng ~197-202, `.note-card:hover .nc-tools { opacity-100 }`) chỉ hiện khi hover chuột — không có fallback cho thiết bị cảm ứng (không có `:active`/`max-md:opacity-100`). Đây đúng là 2 khối **duy nhất hiển thị trên mobile** — nếu trình duyệt mobile không giả lập `:hover` khi chạm, user không thấy được nút Sửa/Xoá. Đáng chú ý: `SpaceSwitcher.tsx` (dòng ~309/322/360/372/384) đã tự thêm `max-md:opacity-100` xử lý đúng vấn đề này cho nút sửa/xoá Space — cho thấy có pattern fix đã biết nhưng chưa áp dụng đồng bộ. | Cao | Thêm `max-md:opacity-100` (hoặc tương đương) cho nút hành động trên `TaskRow`/`NoteCard`, đồng bộ với pattern đã dùng ở `SpaceSwitcher.tsx`. **Đã thêm `max-md:opacity-100` (TaskRow) + rule tương đương cho `.nc-tools`.** |
| A5 | Không tìm thấy vi phạm về thứ tự Tab / `aria-live` lạm dụng — đồng hồ Home dùng `aria-live="off"` tường minh (đúng, tránh announce liên tục mỗi giây). | Thấp | Không cần fix, ghi nhận là điểm tốt. |

### 1.2 Touch & Interaction

| # | Mô tả cụ thể (file:dòng) | Ưu tiên | Đề xuất fix |
|---|---|---|---|
| T1 | ✅ **Đã fix 2026-07-07.** `src/components/DashboardCorner.tsx` dòng ~68-79 (nút Home) và ~82-93 (nút Settings): `h-[34px] w-[34px]`, dùng class tự viết (không phải `.icon-btn`) nên **không** được hưởng cơ chế mở rộng vùng chạm 44px qua `::before` (`src/styles.css` dòng ~132-142 chỉ áp cho `.icon-btn`). Trên mobile compact, nút Settings là **cách duy nhất vào Settings** — dưới chuẩn 44×44px khuyến nghị. | Cao | Áp class `.icon-btn` (kích cỡ 34px vẫn giữ được qua override riêng, chỉ cần thêm class để hưởng `::before` mở rộng) hoặc tự thêm pseudo-element tương tự. **Không áp `.icon-btn` trực tiếp** (xung đột `h-6 w-6`/`rounded-[7px]` với kích thước 34px cố ý của widget) — thêm class dùng chung `.touch-target-44` (mới, `src/styles.css`) chỉ mở rộng `::before` qua biến CSS `--touch-inset` (`-5px` cho 2 nút này để không tràn vào `SpaceSwitcher` cạnh bên qua khe hở `gap-2` 8px). |
| T2 | ✅ **Đã fix 2026-07-07.** `src/components/BlockShell.tsx` dòng ~101-108 (nút mắt ẩn/hiện nội dung khối): custom class, icon 14px + padding 5px ⇒ vùng bấm thực ~24px, không dùng `.icon-btn`, không có mở rộng vùng chạm trên mobile. | Trung bình | Đổi sang dùng `.icon-btn` hoặc thêm `::before` riêng. **Đã thêm class `.touch-target-44` dùng inset mặc định `-10px`** (giữ nguyên kích thước hiển thị 24px). |
| T3 | ✅ **Đã fix 2026-07-07.** `src/features/settings/HomeBackgroundSettings.tsx` dòng ~174-184 (nút Upload icon-only): `h-[26px] w-[26px]`, không dùng `.icon-btn`, không mở rộng vùng chạm — nằm trong Settings modal full-screen trên mobile, dễ bấm nhầm ô cạnh bên. | Trung bình | Đồng bộ `.icon-btn` hoặc tăng kích thước thật lên ≥36px trên mobile. **Đã thêm class `.touch-target-44` với `--touch-inset: -9px`** (giữ nguyên kích thước hiển thị 26px). |
| T4 | Kéo-thả sắp xếp thủ công (icon grip `GripVertical` ở `TaskRow`/`NoteCard`) dùng thuần HTML5 Drag & Drop API (`draggable`, `onDragStart`/`onDragOver`/`onDrop`) — API này **không kích hoạt qua sự kiện chạm** trên phần lớn trình duyệt mobile (không thấy polyfill/touch handler nào cho grip trong code). Vì Tasks + Notes là 2 khối duy nhất trên mobile và "Thứ tự thủ công" là 1 trong 3 kiểu sắp xếp note đã chốt (`requirements.md` mục 5.4), cần verify tay xem tính năng này có dùng được trên thiết bị cảm ứng thật hay không. | Cao | Cần dev/chủ dự án test tay trên điện thoại thật (không phải DevTools responsive mode, vốn vẫn dùng mouse event). Nếu không hoạt động: cân nhắc polyfill touch-drag hoặc chấp nhận giới hạn đã biết + ghi chú vào `requirements.md`. |
| T5 | `DatePicker`/`TimePicker` — ô ngày 36×36px (`h-9 w-9`), item giờ/phút 32px cao (`h-8`) — dưới 44px khuyến nghị, nhưng đây là **quyết định có chủ đích** đã ghi trong `docs/features/date-time-picker.md` (đánh đổi vì cần đủ 7 cột lịch). Không phải bug mới, chỉ nêu lại để chủ dự án biết rõ đây là điểm chưa đạt chuẩn 44px nếu muốn cân nhắc lại. | Thấp | Không cần fix trừ khi chủ dự án muốn xem lại đánh đổi đã chốt. |
| T6 | Điểm tốt: `.icon-btn` (24×24px hiển thị + `::before { inset:-10px }` ⇒ 44×44px vùng chạm thật, `src/styles.css` dòng ~132-142) áp dụng nhất quán ở phần lớn nút icon trong `TaskRow`, `RemindersBlock`, `HabitsBlock`, `NoteCard`, `SpaceInviteModal`, `SpaceSwitcher` — pattern đúng chuẩn, chỉ 3 nơi (T1-T3) chưa áp dụng. | — | Ghi nhận, dùng làm chuẩn để đồng bộ 3 điểm còn thiếu. |

### 1.3 Style Selection

| # | Mô tả cụ thể (file:dòng) | Ưu tiên | Đề xuất fix |
|---|---|---|---|
| S1 | ✅ **Đã fix 2026-07-07.** `src/features/spaces/SpaceFormModal.tsx` dòng ~68 vẫn dùng `<input type="checkbox">` HTML mặc định (qua `.block-check-row input[type=checkbox]`, `accent-[var(--accent)]`) cho danh sách "Khối hiển thị" — trong khi `TaskRow`/`HabitsBlock`/`AssigneePicker` đã migrate sang Radix Checkbox tuỳ biến. Vi phạm trực tiếp "Checkbox tuỳ biến, không dùng checkbox mặc định của OS" (mục 9) — đây là phần sót lại chưa được liệt kê trong kiểm kê `radix-ui-migration-progress.md`. | Trung bình | Đổi sang `@radix-ui/react-checkbox` (đã có sẵn trong dependencies), đồng bộ style với `AssigneePicker`. **Đã đổi, áp dụng đúng `border-solid` cho `Checkbox.Root`** (bài học Bug 4, `radix-ui-migration-progress.md`); dọn CSS chết `.block-check-row input[type=checkbox]` không còn dùng. |
| S2 | ✅ **Đã fix 2026-07-07.** Border-radius rải rác, không theo 1 thang rõ ràng: control nhỏ dùng 7px (`.icon-btn`) / 8px (`IconChip` `rounded-lg`) / 9px (`.btn-ghost`, `.btn-primary`, field, `DatePicker`/`TimePicker` trigger, ReminderFormModal type-button) / 10px (SettingsModal theme-toggle, `AssigneePicker` trigger, HomeBackgroundSettings slot, HomeQuoteSettings box, `SpaceInviteModal` member row) — không sai về hình ảnh nhưng thiếu token chính thức để tra cứu (chính DatePicker/TimePicker mới thêm gần đây tự chọn 9px dựa trên suy luận "giống `.field input`", không có nguồn tham chiếu rõ). Card/modal cấp cao hơn cũng lệch: `.main-block`/`.sub-block` 14px, `Modal` 16px (`rounded-2xl`), `.space-menu-surface` 12px (`rounded-xl`), `.note-card` 10px. | Trung bình | Định nghĩa 1 thang bo góc chính thức theo cấp độ phần tử (control nhỏ ~8px / input-button ~9-10px / card ~12-14px / modal ~16px), ghi thành comment/token trong `components.css` để tránh lệch thêm khi thêm component mới. **Đã thêm comment thang bo góc ở đầu `src/styles/components.css` (chỉ ghi lại quy ước thực tế, không đổi giá trị component cũ).** |
| S3 | ✅ **Đã fix 2026-07-07.** `ChevronsDown` (CTA "Vào Dashboard", `src/features/home/HomeScreen.tsx` dòng ~86) dùng `strokeWidth={1.7}`, khác mặc định `2` mà mọi icon khác trong app đang dùng. Có vẻ là chủ đích (icon to nên làm mảnh hơn cho cân đối) nhưng không có comment giải thích, dễ bị "sửa nhầm về 2" khi người khác chỉnh sau này. | Thấp | Thêm comment giải thích lý do `strokeWidth={1.7}` ngay tại chỗ khai báo. **Đã thêm comment.** |
| S4 | ✅ **Đã fix 2026-07-07.** `src/pages/JoinSpacePage.tsx` toàn bộ style viết bằng inline `style={{}}` object (không dùng Tailwind + token có sẵn), dẫn tới border-radius riêng (20px card, 12px nút) không khớp hệ thống chung (`Modal` 16px, `.btn-primary` 9px), và không tự hưởng easing/transition chuẩn (`--ease-standard`). | Thấp | Refactor sang Tailwind + class có sẵn (`.btn-primary`/`.btn-ghost`, `rounded-2xl`) khi có dịp sửa file này, không cấp thiết vì đây là trang standalone hiếm khi thấy. **Đã refactor: card dùng `rounded-2xl` khớp `Modal`, 2 nút dùng `.btn-primary`/`.btn-ghost` có sẵn, icon màu qua `className` thay `style`, Spinner đổi sang Tailwind `animate-spin` (bỏ `<style>@keyframes>` inline).** |

### 1.4 Layout & Responsive

| # | Mô tả cụ thể (file:dòng) | Ưu tiên | Đề xuất fix |
|---|---|---|---|
| L1 | ✅ **Đã xác nhận/chốt 2026-07-07 (`ba`).** `docs/requirements.md` mục 2.1/4/4.5/8/10 mô tả breakpoint mobile `≤639px` + có màn Home + Dashboard mobile chỉ 2 khối accordion — nhưng `src/layout/useMobileLayout.ts` dòng 4/10 (`MOBILE_ENTER_MAX=999`, `MOBILE_EXIT_MIN=1010`) và `src/App.tsx` dòng ~32 ("Mobile bỏ hẳn màn Home") + `src/layout/MobileChatScreen.tsx` (toàn bộ, màn "Trò chuyện" mới, mặc định) cho thấy hành vi thật khác đáng kể. | Cao | Cần `ba` xác nhận + cập nhật `requirements.md` cho khớp code thật trước khi coi các mục liên quan là đã chốt. **Đã xác nhận: pivot mobile UI là quyết định thiết kế trọn vẹn, nhất quán nội bộ (không dở dang)** — đã cập nhật `requirements.md` mục 5.5/12 + câu hỏi mở cuối file cho khớp code thật, xem chi tiết bằng chứng ở mục "Câu hỏi mở / việc tồn đọng" mục 3 của `requirements.md`. |
| L2 | ✅ **Đã fix 2026-07-07.** `src/features/reminders/RemindersBlock.tsx` dòng ~104 hiển thị ngày nhắc việc "1 lần" bằng `{(r.date || '').slice(5)}` → format `MM-DD` (vd "07-15"), trong khi `TasksBlock.tsx` đã đổi sang `DD/MM/YYYY` (`task.date.split('-').reverse().join('/')`, theo đúng ghi chú "áp dụng chung 1 chỗ" ở `radix-ui-migration-progress.md` mục Bug 4). 2 khối cùng hiển thị ngày nhưng khác định dạng — dễ gây nhầm ngày/tháng. | Cao | Đổi `RemindersBlock.tsx` sang cùng công thức `DD/MM/YYYY` như `TasksBlock.tsx`. **Đã đổi sang cùng công thức `split('-').reverse().join('/')`.** |
| L3 | ✅ **Đã fix 2026-07-07.** `max-sm:gap-2`/`max-sm:p-2` trên `#dashboard` (`src/layout/AppLayout.tsx` dòng ~571) là dead code không bao giờ có hiệu lực tại runtime (dưới ~1000px đã return sớm sang nhánh mobile riêng ở dòng ~503-568, trước khi chạm breakpoint Tailwind `max-sm` 640px) — đã tự phát hiện và ghi chú trong `radix-ui-migration-progress.md` (Bug 3) nhưng chưa dọn. | Thấp | Xoá 2 class chết này khi có dịp sửa `AppLayout.tsx`, tránh nhầm lẫn khi đọc lại code sau này. **Đã xoá, kèm comment giải thích tại sao `max-sm` không bao giờ khớp ở nhánh này.** |
| L4 | Không phát hiện qua đọc code trường hợp horizontal-scroll ngoài ý muốn (mobile dùng `max-w-[560px] mx-auto`; `.notes-grid` dùng `minmax(180px,1fr)` auto-fill) — nhưng cần verify tay ở màn rất hẹp (320-360px) vì 2 cột × 180px + gap có thể sát mép. | Thấp | Verify tay trên viewport 320px thật (không chỉ DevTools). |

### 1.5 Typography & Color

| # | Mô tả cụ thể (file:dòng) | Ưu tiên | Đề xuất fix |
|---|---|---|---|
| C1 | Trùng với A1 — contrast `--text-dim`/`--raised` ở theme sáng ≈3.34:1. | Cao | Xem A1. |
| C2 | ✅ **Đã fix 2026-07-07.** Trạng thái lỗi dùng 2 hệ màu khác nhau trong cùng nhóm tính năng Space: `SpaceInviteModal.tsx` (dòng ~279, ~356-358, ~390, ~450) dùng thẳng Tailwind `red-500`/`red-50`/`red-300`/`orange-400` (không đổi theo theme/accent), trong khi `SpaceFormModal.tsx`/`SharedSpaceFormModal.tsx`/`ConfirmModal.tsx` dùng token `var(--reminder-color)` cho lỗi/xoá. | Trung bình | Thống nhất 1 semantic token (`--reminder-color` hoặc thêm `--danger` riêng) cho mọi trạng thái lỗi/cảnh báo, thay Tailwind red/orange cứng. **Đã đổi toàn bộ 4 chỗ sang `var(--reminder-color)` (dùng `color-mix(in srgb, var(--reminder-color) N%, ...)` cho nền/hover, theo đúng convention đã dùng ở `TasksBlock.tsx`/`DashboardCorner.tsx`).** |
| C3 | ✅ **Đã fix 2026-07-07 (gộp cùng C2).** `text-orange-400` (SpaceInviteModal, cảnh báo invite sắp hết hạn ≤3 ngày) — màu Tailwind cứng khác, không phải token theme, có thể lệch tông khi đổi theme/accent. | Thấp | Gộp vào cùng đợt fix C2. **Đã đổi sang `var(--habit-color)` (tông cam sẵn có trong token system) thay vì `orange-400` rời rạc.** |

### 1.6 Animation

| # | Mô tả cụ thể (file:dòng) | Ưu tiên | Đề xuất fix |
|---|---|---|---|
| An1 | ✅ **Đã fix 2026-07-07.** `.note-card` transition dùng `duration-[180ms]` (`components.css` dòng ~176) — lệch nhẹ khỏi 2 giá trị chuẩn phổ biến 150/200ms đã dùng ở phần lớn nơi khác. Không nghiêm trọng (180ms vẫn trong khoảng "nhẹ") nhưng không theo đúng con số đã chốt ở mục 9 requirements ("khoảng 0.15s"). | Thấp | Đổi về `duration-150` cho nhất quán, hoặc ghi rõ lý do nếu cố ý khác. **Đã đổi sang `duration-150`.** |
| An2 | ✅ **Đã fix 2026-07-07.** Không phát hiện `@media (prefers-reduced-motion: reduce)` ở bất kỳ đâu trong codebase — 2 animation lặp vô hạn đáng chú ý nhất: `animate-homeEnterBounce` (nút CTA "Vào Dashboard" ở Home) và `animate-newestPulse` (label "Mới" ở khối Thông báo). | Trung bình | Thêm rule `@media (prefers-reduced-motion: reduce) { animation: none }` cho 2 animation lặp vô hạn này (mức tối thiểu, không cần áp cho mọi transition ngắn 150-200ms). **Đã thêm rule trong `src/styles.css`.** |
| An3 | Điểm tốt: hầu hết animation dùng `transform`/`opacity` (note-card hover translate-y, splitter chỉ đổi width/height của thanh kẻ 2px thị giác, không phải layout thật); crossfade ảnh nền dùng riêng `duration-[600ms]` — hợp lý vì đây là hiệu ứng ảnh nền, không phải micro-interaction, đúng yêu cầu mục 4.6. | — | Ghi nhận, không cần fix. |

### 1.7 Forms & Feedback

| # | Mô tả cụ thể (file:dòng) | Ưu tiên | Đề xuất fix |
|---|---|---|---|
| F1 | Điểm tốt: label rõ ràng (`<label>` thật) ở mọi form, không chỉ dựa vào placeholder. | — | Ghi nhận. |
| F2 | ✅ **Đã fix 2026-07-07.** Không có validate/thông báo khi lưu Task/Habit/Reminder/Note với tên rỗng (`title`) — `TaskFormModal.tsx`/`HabitFormModal.tsx`/`ReminderFormModal.tsx`/`NoteFormModal.tsx` đều gọi `handleSave` không chặn `title === ''`, tạo ra row trống vô nghĩa trong danh sách. | Trung bình | Thêm chặn tối thiểu: disable nút Lưu hoặc hiện hint đỏ khi `title.trim() === ''`. **Đã thêm `disabled={!title.trim()}` cho nút Lưu ở cả 4 form modal, kèm style `disabled:opacity-50` cho `.btn-primary`.** |
| F3 | Điểm tốt: trạng thái loading/disabled xử lý đúng ở `SharedSpaceFormModal.tsx` (`saving` state) và `SpaceInviteModal.tsx` (`creatingLink`/`kickingId`/`revokingId`/`leaving`) — disable nút + đổi label/spinner rõ ràng khi đang xử lý async. | — | Ghi nhận, dùng làm mẫu cho các form async khác. |

### 1.8 Navigation Patterns

| # | Mô tả cụ thể (file:dòng) | Ưu tiên | Đề xuất fix |
|---|---|---|---|
| N1 | Điểm tốt: vị trí điều hướng nhất quán — `DashboardCorner` (Home/Space-switcher/Settings) luôn cùng 1 vị trí xuyên suốt mọi Space; active state rõ ràng (accent bg 8-12% + text accent) dùng nhất quán cho tab Settings, filter Task, sort Note, Space đang chọn. | — | Ghi nhận. |
| N2 | ✅ **Đã xác nhận/chốt 2026-07-07 (`ba`).** Trùng với L1 — `MobileTabBar` ("Trò chuyện"/"Chi tiết", `AppLayout.tsx` dòng ~704-749) là 1 lớp điều hướng thứ 2 hoàn toàn mới trên mobile, song song với `DashboardCorner`, chưa từng được đặc tả trong `requirements.md`. | Cao | Xem câu hỏi mở mục 3 — cần `ba` xác nhận & tài liệu hoá trước. **Đã tài liệu hoá đầy đủ `MobileTabBar` trong `requirements.md` (mục 2.1/4.5/10/12) và xác nhận đây là lớp điều hướng chủ đích, không phải sót lại ngoài ý muốn.** |

---

## 2. Đề xuất nâng cấp UX (polish, không phải bug)

1. **Tap-to-reveal cho nút hành động trên mobile**: áp dụng lại đúng pattern `max-md:opacity-100` đã có sẵn ở `SpaceSwitcher.tsx` cho `TaskRow`/`NoteCard` (xem A4) — vì đây chính là 2 khối duy nhất người dùng mobile thấy, nút Sửa/Xoá cần luôn thấy được, không phụ thuộc hover chuột.
2. **Thang bo góc chính thức**: chốt 1 bộ số cố định theo cấp độ phần tử (control nhỏ ~8px / input-button ~9-10px / card ~12-14px / modal ~16px) và ghi làm comment chuẩn trong `components.css`, để các component mới (như DatePicker/TimePicker vừa thêm) có chỗ tra cứu thay vì tự đoán.
3. **Chuẩn hoá vùng chạm 44px qua đúng 1 con đường**: đưa `DashboardCorner` Home/Settings, `BlockShell` Eye-toggle, `HomeBackgroundSettings` Upload về dùng chung class `.icon-btn` (đã có cơ chế mở rộng `::before` sẵn) thay vì mỗi nơi tự viết class riêng — giảm rủi ro bỏ sót khi thêm icon-button mới sau này.
4. **Tăng contrast `--text-dim` ở theme sáng**: đạt tối thiểu ~4.5:1 trên `--raised`/`--panel-bg` mà không phá cảm giác "chữ phụ mờ" hiện có — cần 1 vòng preview/đo trực quan trước khi push (đúng quy trình `feedback-visual-tweak-preview-first` đã có).
5. **Tôn trọng `prefers-reduced-motion`** cho 2 animation lặp vô hạn (bounce CTA Home, pulse "Mới" ở Thông báo) — cải tiến nhỏ, chi phí thấp, lợi ích accessibility rõ ràng.
6. **Đồng bộ format ngày `DD/MM/YYYY`** giữa `RemindersBlock` và `TasksBlock` (xem L2) — tránh 2 khối liên quan hiển thị 2 định dạng ngày khác nhau.
7. **1 token lỗi/cảnh báo duy nhất** thay vì trộn `var(--reminder-color)` và Tailwind `red-500/50/300`/`orange-400` (xem C2/C3) — đảm bảo màu lỗi luôn đổi đúng theo theme.

---

## 3. Câu hỏi mở

1. **(Ưu tiên xác nhận đầu tiên)** `docs/requirements.md` mục 2.1/4/4.5/8/10 mô tả mobile ở ngưỡng `≤639px`, có màn Home, Dashboard mobile chỉ 2 khối dạng accordion — nhưng code thật (`src/layout/useMobileLayout.ts`, `src/App.tsx`, `src/layout/MobileChatScreen.tsx`) cho thấy: ngưỡng chuyển mobile thật là **~1000px** (không phải 639px), **Home đã bị bỏ hẳn trên mobile** (`App.tsx` dòng ~32: "Mobile bỏ hẳn màn Home"), và mobile giờ có thêm **1 màn "Trò chuyện" (chat-style) hoàn toàn mới** làm mặc định + 1 `MobileTabBar` ("Trò chuyện"/"Chi tiết") — không dòng nào trong `requirements.md` nhắc tới các thay đổi này. Đề nghị `ba` xác nhận đây là pivot sản phẩm có chủ đích (không phải bug/thử nghiệm dở dang) và cập nhật `requirements.md` mục 2.1/4/4.5/8/10 cho khớp, để các audit/tài liệu UX sau này có 1 nguồn sự thật đáng tin thay vì phải tự đối chiếu code mỗi lần.
2. Xác nhận mức ưu tiên fix `window.confirm()` còn sót ở `SpaceInviteModal.tsx` (A2) — đây là vi phạm rõ ràng nhất so với `requirements.md` mục 9 tìm được trong đợt audit này, đề xuất fix sớm cùng đợt dọn nợ kỹ thuật Radix hiện tại thay vì để riêng.
3. Xác nhận có muốn đổi màu `--text-dim` ở theme sáng ngay (A1/C1) hay để dành cho 1 đợt "polish màu sắc" riêng — vì ảnh hưởng diện rộng (hint/label/meta text khắp app), cần 1 vòng preview trực quan trước khi quyết.
