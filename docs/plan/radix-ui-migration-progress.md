# Migrate toàn bộ UI thủ công sang Radix UI — Tiến độ triển khai

> Theo quyết định đã chốt ở [ui-primitive-library-decision.md](ui-primitive-library-decision.md) (dùng Radix UI
> cho Popover/Dialog/Checkbox/Switch/DropdownMenu/Select), chủ dự án yêu cầu mở rộng phạm vi: **chuyển toàn bộ**
> UI tương tác thủ công hiện có sang Radix, không chỉ riêng Assignee Picker — để mọi feature mới/cũ đồng nhất
> 1 chuẩn, tránh mỗi chỗ tự viết 1 kiểu khác nhau (nguồn gốc bug CSS/accessibility đã gặp).
>
> Làm theo kiểu cuốn chiếu: **1 phần/lượt**, xong mới báo cáo, không tự nhảy sang phần kế tiếp trừ khi user bảo tiếp tục.

Quy ước trạng thái: `⬜ Chưa làm` / `🔶 Đang làm` / `✅ Xong` / `⛔ Bị chặn (ghi rõ lý do)`.

## Kiểm kê phạm vi (rà soát 2026-07-07, dựa trên grep toàn bộ `src/`)

| # | Component/file | UI thủ công hiện tại | Radix primitive thay thế | Ảnh hưởng |
|---|---|---|---|---|
| 1 | `src/components/Modal.tsx` | Dialog tự viết: portal thủ công, click-outside, không có focus-trap tường minh | `@radix-ui/react-dialog` | **Cao** — dùng chung bởi 10 modal: `ConfirmModal`, `HabitFormModal`, `NoteFormModal`, `NoteViewModal`, `ReminderFormModal`, `SettingsModal`, `SharedSpaceFormModal`, `SpaceFormModal`, `SpaceInviteModal`, `TaskFormModal`. Sửa 1 chỗ, lợi toàn bộ. |
| 2 | `src/features/spaces/SpaceSwitcher.tsx` | Dropdown tự viết: `wrapRef` + `mousedown` listener, **chưa có Escape** | `@radix-ui/react-popover` (hoặc `dropdown-menu`) | Trung bình — 1 điểm vào chính của app. |
| 3 | `src/features/notes/NotesBlock.tsx` | Dropdown sort note, cùng pattern `.space-menu` như #2 | `@radix-ui/react-dropdown-menu` | Trung bình. |
| 4 | `src/features/tasks/TasksBlock.tsx` | Checkbox tick-done tự viết `role="checkbox"` | `@radix-ui/react-checkbox` (đã cài, dùng ở Assignee Picker) | Thấp — đang ổn định, chỉ đổi để đồng nhất. |
| 5 | `src/features/habits/HabitsBlock.tsx` | Checkbox/toggle tự viết `role="checkbox"`/`role="switch"` | `@radix-ui/react-checkbox` hoặc `@radix-ui/react-switch` (tự xác định đúng loại khi đọc code) | Thấp. |
| 6 | `src/features/settings/PushNotificationSettings.tsx` | Switch tự viết `role="switch"` | `@radix-ui/react-switch` | Thấp. |
| 7 | `src/features/reminders/ReminderFormModal.tsx` | `<select>` native | `@radix-ui/react-select` (package mới, chưa cài) | Thấp — chỉ 1 chỗ dùng. |

Đã xong từ trước (không cần làm lại): Assignee Picker trong `TaskFormModal.tsx` (`Popover` + `Checkbox`, xem
[shared-space-task-assign-notify.md](../features/shared-space-task-assign-notify.md) mục 5.1).

## Thứ tự triển khai (ưu tiên leverage cao trước)

### Phần 1 — `Modal.tsx` → `@radix-ui/react-dialog`
Trạng thái: ✅ Xong (2026-07-07)
Vì sao làm trước: 1 file, ảnh hưởng tự động tới cả 10 modal đang dùng, không cần sửa từng modal con
(miễn giữ nguyên props API `onClose`/`className`/children). Rủi ro cao nhất nếu sai (ảnh hưởng toàn app)
→ cần test kỹ toàn bộ 10 modal sau khi đổi, không chỉ 1-2 cái.

**Đã làm:** Cài `@radix-ui/react-dialog@^1.1.19` (peer dep khớp React 18). Viết lại `Modal.tsx` dùng
`Dialog.Root open onOpenChange={(o) => !o && onClose()}` + `Dialog.Portal` + `Dialog.Overlay` (giữ nguyên
class overlay cũ) + `Dialog.Content` (giữ nguyên class `modal` + `className` prop + behavior `onFocus`
scroll-into-view cho mobile). Thêm `Dialog.Title` ẩn bằng inline visually-hidden style (project chưa có
class `sr-only` sẵn) để tắt Radix a11y warning, và `aria-describedby={undefined}` để tắt warning
Description. Giữ nguyên props API (`onClose`/`className`/`children`) nên **không sửa 10 file gọi Modal**.
Không import `React` tường minh (theo convention đa số file trong `src/components/`, jsx runtime là
`react-jsx`).

**Cải thiện thật đi kèm:** cả 10 modal giờ tự động đóng bằng phím Escape (trước đây chỉ đóng bằng click nền),
và có focus-trap tường minh (Tab không thoát ra ngoài modal) — do Radix Dialog tự xử lý.

**Kết quả kiểm tra:** `npx tsc --noEmit` sạch, `npm run build` sạch (kèm PWA service worker build bình
thường), `npx vitest run` 8 file/64 test pass.

**Cách test tay:** Mở lần lượt `TaskFormModal` (nút thêm task), `SettingsModal` (icon Settings ở topbar),
`ConfirmModal` (thử xoá 1 task/note để trigger confirm) — với mỗi modal xác nhận: (1) mở/đóng bình thường
qua nút Huỷ/Lưu, (2) click vào vùng nền tối bên ngoài modal → đóng, (3) nhấn phím **Escape** → đóng (hành vi
mới), (4) bấm Tab liên tục trong modal → focus không thoát ra ngoài modal (focus-trap), (5) thu nhỏ cửa sổ
trình duyệt xuống ≤639px (hoặc DevTools responsive mode) → modal vẫn full-screen đúng như trước, và focus
vào 1 input/textarea vẫn tự cuộn vào giữa màn hình.

### Phần 2 — `SpaceSwitcher.tsx` → Radix Popover
Trạng thái: ✅ Xong (2026-07-07)

**Bug 1 phát hiện sau khi user test tay (2026-07-07):** dropdown bị lệch hẳn sang phải trên mobile, không
nằm dưới trigger. Điều tra bằng debug harness tạm (Playwright, đo `getBoundingClientRect` thật, không
đoán) xác định: `align="center"` kết hợp `width` tính động qua `var(--radix-popover-trigger-width)` bị
lỗi định vị trong `@radix-ui/react-popover@1.1.19` — content bị lệch phải đúng bằng **1/2 chiều rộng
chính nó** (vd trigger rộng 324px thì content lệch phải 162px = 324/2). Test thêm `alignOffset` âm để bù
cũng không có tác dụng (chỉ offset dương mới áp dụng đúng — nghi là bug/giới hạn khác của cùng bản Radix
này khi kết hợp width động). **Fix:** đổi `align="center"` → `align="start"` (đã verify bằng đo đạc thật:
`content.left === trigger.left` chính xác 100%, cả mobile lẫn desktop).

**Bug 2 phát hiện ngay sau đó (user gửi screenshot lần 2):** dropdown đã thẳng hàng với nút trigger
nhưng đó không phải điều user muốn — dropdown cần khớp độ rộng **cả khối `#dashboard-corner`** (Home +
switcher + Settings đi cùng nhau), không chỉ riêng nút switcher hẹp hơn nằm giữa. Đây chính là lý do bản
CSS cũ trước Radix dùng đúng số "42px" (= độ rộng nút icon 34px + gap 8px của Home/Settings) — không phải
số tuỳ ý. **Fix bằng `Popover.Anchor` với `virtualRef`** (API có sẵn của Radix Popper cho đúng use-case
"định vị theo 1 element khác, không phải trigger"): tạo 1 ref ảo tra `document.getElementById('dashboard-corner')`
mỗi lần cần đo (luôn tươi, không cache rect cũ), gắn `<Popover.Anchor virtualRef={cornerAnchorRef} />` làm
anh em với `Popover.Trigger` trong cùng `Popover.Root` — Trigger vẫn xử lý click mở/đóng, nhưng Content giờ
định vị theo Anchor (cả khối `#dashboard-corner`) thay vì theo Trigger. Width đổi lại thành đúng
`var(--radix-popover-trigger-width)` (giờ biến này phản ánh độ rộng của Anchor, tức cả khối, không phải
chỉ trigger) — đã verify bằng đo đạc thật: `content.left/right/width` khớp chính xác 100% với
`#dashboard-corner.left/right/width`. Xoá luôn `isMobile`/`useMediaQuery` không còn cần trong file này (không
còn nhánh width mobile/desktop riêng — 1 công thức duy nhất cho mọi breakpoint).

**Cách test lại:** mở dropdown trên mobile (≤639px) và desktop — dropdown phải nằm chính xác ngay dưới,
thẳng hàng bên trái với nút trigger (không lệch/không tràn ra ngoài màn hình).

**Đã làm:** Bọc bằng `Popover.Root open={open} onOpenChange={setOpen}` (giữ nguyên state `open`/`setOpen`
cục bộ, giữ nguyên toàn bộ các lệnh `setOpen(false)` rải rác sau khi chọn space/rename/invite/tạo mới —
Radix không tự đóng khi click bên trong Content nên các lệnh này vẫn cần thiết). `Popover.Trigger asChild`
bọc button hiện có, xoá `onClick={() => setOpen((v) => !v)}` (Radix tự toggle qua `onOpenChange`), thêm
`aria-haspopup="true"` + `aria-expanded={open}`. Xoá hẳn `wrapRef` + `useEffect` mousedown-outside-click
(Radix Popover tự lo outside-click + Escape). Thay `{open && <div className="space-menu ...">}` bằng
`Popover.Portal > Popover.Content` (không bọc `{open && ...}` nữa, Radix tự mount/unmount) — giữ nguyên
100% nội dung bên trong (section header, list item, divider, empty-state, nút rename/invite/xoá/di
chuyển) không đổi 1 dòng.

Dựng lại hiệu ứng "rộng hơn nút trigger 42px mỗi bên, tối thiểu 240px" bằng `align="center"` +
`sideOffset={8}` + `collisionPadding={8}` trên `Popover.Content`, cùng inline `style` tính theo biến CSS
Radix cấp sẵn `var(--radix-popover-trigger-width)`: desktop `width: max(240px, calc(var(--radix-popover-trigger-width)
+ 84px))`, mobile (`useMediaQuery('(max-width: 639px)')`, ngưỡng `≤639px` đồng bộ toàn app) `width:
var(--radix-popover-trigger-width)` (khớp đúng bề rộng trigger, không mở rộng thêm vì parent đã gần
full-width trên `DashboardCorner` compact).

> **Sửa lại (2026-07-07, Bug 3 bên dưới):** đoạn dưới đây trong lần viết đầu tiên **sai** — đã để
> `Popover.Content` dùng chung class `space-menu` với giả định "Radix tự set `position/transform/top/left`
> bằng inline style trên chính DOM node Content nên đè được `absolute`/`top-[calc(100%+8px)]` cũ". Thực tế
> đo được: Radix chỉ set `position/transform` trên 1 **wrapper cha** (`[data-radix-popper-content-wrapper]`),
> KHÔNG set gì trên chính node Content — nên `.space-menu`'s `absolute top-[calc(100%+8px)] left-0` vẫn
> nguyên hiệu lực, cộng dồn thêm +8px ngoài ý muốn vào `sideOffset` đã set. Đã tách riêng class
> `.space-menu-surface` (không có position) cho `Popover.Content`, xem Bug 3.

Div bọc ngoài cùng giữ lại (`DashboardCorner.tsx` render `<SpaceSwitcher />` trong 1 hàng flex cùng nút
Home/Settings, cần 1 phần tử DOM để giữ `flex-1`) nhưng bỏ `relative` (không còn cần vì Radix Popover
portal + tự định vị theo toạ độ thật của trigger, không dựa vào containing-block CSS) — chỉ còn
`className="min-w-0 flex-1"`.

**Giới hạn khi tự kiểm tra:** không thể tự chạy Playwright E2E xem trực quan dropdown mở vì app bắt buộc
đăng nhập Google OAuth thật qua Supabase (không có chế độ test/mock auth), không tiện dùng tài khoản thật
trong môi trường tự động. Đã xác minh bằng lý luận CSS chắc chắn (inline style luôn thắng class cùng thuộc
tính, không phụ thuộc specificity) thay vì đoán mù — nhưng người dùng cần tự test tay bước mở dropdown thật
trên trình duyệt để chắc chắn 100% (xem mục Cách test bên dưới).

**Kết quả kiểm tra:** `npx tsc --noEmit` sạch, `npm run build` sạch (kèm PWA service worker), `npx vitest
run` 8 file/64 test pass.

**Cách test tay:** Mở app, đăng nhập, ở topbar bấm nút Space switcher (tên space hiện tại + chevron):
1. Dropdown mở ra, hiển thị đủ 2 section "Space của tôi"/"Space chung", đúng list space, đúng dot màu.
2. Trên desktop (viewport rộng, cửa sổ bình thường): dropdown rộng hơn nút trigger, thừa đều 2 bên
   (khoảng ~42px mỗi bên, tối thiểu 240px) — so trực quan với bản trước khi sửa (ảnh chụp/nhớ layout cũ)
   để xác nhận không bị lệch/tràn ra ngoài viewport ở 2 rìa màn hình.
3. Thu nhỏ xuống ≤639px (hoặc DevTools responsive mode): dropdown chỉ khớp đúng bề rộng nút trigger, không
   tràn ra ngoài 2 bên khung `DashboardCorner` compact.
4. Nhấn phím **Escape** → dropdown đóng (hành vi mới, trước đây chưa có).
5. Click ra ngoài dropdown (vào vùng nền/nội dung khác) → đóng đúng như trước.
6. Bấm chọn 1 space khác trong list → dropdown đóng ngay + chuyển space đúng.
7. Bấm icon bút chì (đổi tên), icon `UserPlus` (mời thành viên, chỉ ở Space chung), icon thùng rác (xoá) —
   xác nhận: dropdown đóng ngay, modal tương ứng (`SpaceFormModal`/`SpaceInviteModal`/`ConfirmModal`) mở
   đúng, không bị đóng modal sớm hay double-toggle lại dropdown.
8. Bấm nút mũi tên lên/xuống (chỉ hiện ở desktop khi hover) để đổi thứ tự Space cá nhân — xác nhận dropdown
   **không đóng** sau thao tác này (đúng hành vi cũ, vì đây là thao tác lặp lại nhiều lần trong lúc dropdown
   mở, không có `setOpen(false)` sau khi move).
9. Bấm nút "+" ở section header "Space của tôi" / "Space chung" → dropdown đóng, mở đúng modal tạo space
   cá nhân/chung tương ứng.
10. Mở lại dropdown nhiều lần liên tiếp (đóng/mở lặp lại) — không có hiện tượng giật/nhấp nháy vị trí hay
    kẹt ở trạng thái mở khi đã click nút khác.

**Tinh chỉnh spacing/max-height (yêu cầu chủ dự án sau khi xem lại demo, 2026-07-07) — ĐÃ áp dụng (2026-07-07):**

- `sideOffset={12}` đã sửa tại `SpaceSwitcher.tsx` (`Popover.Content`).
- `.space-menu` (`components.css`) đã đổi `max-h-80` → `max-h-[min(80vh,var(--radix-popper-available-height,80vh))]`,
  giữ nguyên `overflow-y-auto`.
- `npx tsc --noEmit`, `npm run build`, `npx vitest run` đều pass sạch sau khi sửa (64/64 test pass).
- Mục "Cách test tay" bên dưới vẫn còn nguyên giá trị — user tự kiểm tra bằng tay theo đúng 5 bước đó.

**Cập nhật lần 2 (2026-07-07, sau khi user test tay thật trên mobile compact):** đánh giá "chênh 4px khó
nhận biết" ở trên **sai** — user test ở `DashboardCorner compact` (mobile, gap thật 8px) thấy rõ khoảng dư
xấu vì `sideOffset={12}` cố định làm gap RỘNG HƠN gap thật ở đúng ngữ cảnh compact (12 > 8, sai theo hướng
tệ hơn, không phải chỉ lệch nhẹ). Đổi sang **responsive thật** thay vì chấp nhận đánh đổi: `SpaceSwitcher`
nhận thêm prop `compact?: boolean` từ `DashboardCorner` (component cha `DashboardCorner.tsx` đã tự có sẵn
prop `compact` tính đúng lúc gọi `<DashboardCorner onGoHome={onGoHome} compact />` ở nhánh mobile trong
`AppLayout.tsx` dòng ~518 — dùng lại đúng tín hiệu đã tính sẵn 1 lần ở `AppLayout`, KHÔNG tự gọi lại
`useMobileLayout()` riêng trong `SpaceSwitcher` như phương án "nâng cao" từng nêu ở trên — tránh 2 instance
hook độc lập lệch pha do hysteresis, đơn giản hơn nhiều). `sideOffset` đổi thành `compact ? 8 : 12`.

**Bug 3 phát hiện ngay sau đó (user báo "ảnh tôi gửi là trên desktop mà" — đánh giá compact ở Cập nhật
lần 2 sai ngữ cảnh):** dựng lại debug harness thật (Playwright, mô phỏng đúng cấu trúc cột `#dashboard`/
`gap-3` + slot `settings` height-locked + 1 khối `.main-block` giả lập bên dưới, không đoán) để đo 2 số:
gap thật lúc dropdown ĐÓNG (giữa `#dashboard-corner` và khối kế tiếp trong cùng cột) = **12px** (khớp đúng
`gap-3`, xác nhận code đọc trước đó đúng); gap thật lúc dropdown MỞ (với `sideOffset={12}`) = **20px** — dư
đúng 8px, không phải sai số ngẫu nhiên.

Truy ra nguyên nhân: class `.space-menu` (dùng cho `Popover.Content`) vẫn còn nguyên `absolute
top-[calc(100%+8px)] left-0` từ CSS thời kỳ tự viết tay (trước khi có Radix). Giả định trước đó ("Radix
tự set position/transform bằng inline style trên chính DOM node Content, đè được class cũ") **sai** — đo
trực tiếp `element.getAttribute('style')` xác nhận Radix chỉ set `position: fixed; transform: translate(...)`
trên 1 **wrapper cha** (`[data-radix-popper-content-wrapper]`, có `height: 0` vì không tự co theo nội dung
con position:absolute), còn chính node `.space-menu` (con của wrapper) không có `position/top` gì trong
`style` — nên `top: calc(100% + 8px)` của class cũ vẫn tính bình thường, với "100%" ở đây là 100% chiều
cao wrapper cha (=0, vì wrapper không tự co theo con `position:absolute`), ra `top = 0 + 8px` tính từ đỉnh
wrapper — cộng dồn thêm đúng 8px vào vị trí Radix đã đặt qua `sideOffset={12}` (12 + 8 = 20, khớp chính
xác số đo được).

**Fix:** tách riêng `.space-menu-surface` (giữ nguyên toàn bộ phần visual — border/bg/shadow/rounded/
max-height/overflow/padding/`z-[60]` — nhưng KHÔNG có `position/top/left`) dùng riêng cho `Popover.Content`
của Radix; giữ nguyên `.space-menu` (có `position/top/left`) cho dropdown sort note thủ công ở
`NotesBlock.tsx` (Phần 3, chưa migrate, vẫn cần tự định vị). `SpaceSwitcher.tsx` đổi `className="space-menu"`
→ `className="space-menu-surface"` trên `Popover.Content`. Đã verify lại bằng đo đạc thật qua harness: gap
mở = 12px, khớp chính xác gap đóng (12px) và khớp `sideOffset` đã set — không còn dư.

**Bài học quan trọng cho các phần Radix tiếp theo (Phần 3-7):** khi migrate 1 component sang Radix mà
component đó tái dùng 1 class CSS cũ có sẵn `position`/`top`/`left` (kiểu tự định vị thủ công), **PHẢI**
tách riêng phần "visual" khỏi phần "position" thành 2 class, không giả định inline style của Radix tự
đè được — Radix Popover/Dialog/DropdownMenu set position trên wrapper cha riêng, không phải trên chính
Content/node mà class CSS cũ đang gắn vào.

Chủ dự án xem lại thấy 2 điểm chưa ổn ở dropdown Space-switcher: (1) khoảng cách dropdown↔trigger
(`sideOffset={8}`) không khớp gap thật của Dashboard, (2) `.space-menu` giới hạn cứng `max-h-80`
(320px) gây cuộn không cần thiết khi danh sách space ngắn. Đã đọc lại `AppLayout.tsx`/`useMobileLayout.ts`/
`DashboardCorner.tsx`/`components.css` để chốt số liệu chính xác thay vì đoán.

*1. Gap thật giữa `DashboardCorner` và khối ngay dưới nó — phát hiện có 2 giá trị, chia theo 1 ngưỡng
khác với giả định ban đầu:*

- **Desktop (free-layout tự do, `#dashboard`/`#cols-wrap`): 12px**, từ class `gap-3` áp trên cả
  `#dashboard` (dòng ~571) lẫn div `.flex.flex-col.gap-3` bọc từng cột (dòng ~582, nơi slot `settings` và
  slot kế tiếp cùng nằm) — xác nhận thêm bằng comment code dòng ~78 "đặt splitter ẨN đè giữa khoảng gap
  12px sẵn có" (PASS 2 đo `getBoundingClientRect` thật).
- **`max-sm:gap-2` (8px) trên `#dashboard`/`#cols-wrap` là dead code, KHÔNG bao giờ có hiệu lực tại
  runtime** — phát hiện quan trọng ngoài phạm vi câu hỏi ban đầu: `#dashboard` (free-layout) chỉ render
  khi `isMobileBlocksOnly` (từ `useMobileLayout()`, ngưỡng vào ~999px/ra ~1010px, có hysteresis chống
  giật, xem `useMobileLayout.ts`) = **false**. Tức là dưới ~1000px, app đã chuyển hẳn sang DOM UI mobile
  Chat-first hoàn toàn khác (không còn `#dashboard` trong cây DOM) — TRƯỚC KHI chạm ngưỡng Tailwind
  `max-sm` (<640px) rất xa. Con số "8px" trong class này chưa từng và sẽ không bao giờ được áp dụng ở bất
  kỳ viewport nào với cấu trúc code hiện tại.
- **Mobile compact thật (`isMobileBlocksOnly` = true, `DashboardCorner compact`): 8px** — nhưng đến từ
  cơ chế khác hẳn, không phải class `gap-*` nào: container `mobileWrapRef` (dòng ~517) chỉ có `flex-col`,
  không gap; khoảng cách trực quan giữa thanh `DashboardCorner` (border-b, dính trên cùng) và nội dung bên
  dưới đến từ `py-2` (padding-top 8px) của div bọc accordion (dòng ~523: `flex min-h-0 flex-1 flex-col
  gap-2 py-2`). Về số học trùng 8px với `max-sm:gap-2` chết ở trên, nhưng bản chất là padding của khối
  dưới, không phải gap giữa 2 flex-item — và áp dụng đúng ở ngưỡng ~1000px (`isMobileBlocksOnly`), không
  phải 640px.

Kết luận: 2 giá trị **thật sự có hiệu lực** là **12px** (khi `SpaceSwitcher` nằm trong `DashboardCorner`
không-compact, tức desktop free-layout, ≥ ~1000px) và **8px** (khi nằm trong `DashboardCorner compact`,
tức mobile Chat-first, < ~1000px) — chia theo ngưỡng `isMobileBlocksOnly`/`useMobileLayout()`, KHÔNG phải
theo breakpoint Tailwind `max-sm` (640px) như giả định ban đầu trong yêu cầu.

*2. Spec `sideOffset` cuối cùng: `sideOffset={12}` cố định, KHÔNG responsive theo breakpoint.*

Lý do chọn 1 giá trị cố định thay vì phân nhánh 12/8 theo `isMobileBlocksOnly`:
- 12px khớp đúng giá trị "chủ đạo" của hệ thống — `gap-3` là gap chuẩn dùng xuyên suốt layout desktop tự
  do (giữa mọi khối, giữa cột, giữa slot), nơi toàn bộ ngôn ngữ visual kính mờ (`main-block`/`sub-block`/
  `DashboardCorner`) được thiết kế theo.
- Chênh lệch với giá trị mobile thật (8px) chỉ 4px — khó nhận biết bằng mắt thường với 1 dropdown nổi
  (không phải 2 card nằm cạnh nhau để so trực tiếp).
- Làm đúng responsive đòi hỏi dùng lại `useMobileLayout()` (hook có hysteresis, vừa bị XOÁ khỏi
  `SpaceSwitcher.tsx` ở Bug 2 phía trên, đúng theo tinh thần "1 công thức duy nhất cho mọi breakpoint").
  Thêm lại chỉ để lệch 4px là đánh đổi không xứng: tăng phức tạp + rủi ro dropdown bị giật vị trí nếu
  resize cửa sổ đúng lúc đang mở, đổi lấy lợi ích thị giác không đáng kể.
- Việc code: đổi `sideOffset={8}` → `sideOffset={12}` tại `Popover.Content` (dòng ~247).
- Câu hỏi mở/tuỳ chọn nâng cao (không bắt buộc làm ngay): nếu sau này muốn khớp tuyệt đối, có thể đổi
  thành `sideOffset={isMobileBlocksOnly ? 8 : 12}` (cần truyền `isMobileBlocksOnly` từ `AppLayout` xuống
  qua prop, vì `SpaceSwitcher` không tự gọi `useMobileLayout()` — tránh 2 instance hook lệch pha do
  hysteresis nội bộ mỗi hook độc lập).

*3. Spec `max-height` cuối cùng: đổi class `.space-menu` (`components.css`, dòng ~133):*

```
max-h-80 overflow-y-auto
```
→
```
max-h-[min(80vh,var(--radix-popper-available-height,80vh))] overflow-y-auto
```

Giải thích:
- `overflow-y-auto` giữ nguyên — bản chất `auto` chỉ hiện scrollbar khi nội dung thật sự vượt
  `max-height`, nên chỉ cần sửa đúng giá trị `max-height` là tự động có đúng hành vi "ít thì không cuộn,
  nhiều thì cuộn", không cần thêm logic gì khác.
- Đã đọc thẳng source `@radix-ui/react-popper@1.3.3`
  (`node_modules/@radix-ui/react-popper/dist/index.mjs` dòng ~148-157) để xác nhận, không suy đoán:
  Radix Popper luôn gắn 4 CSS custom property lên chính DOM node Content (`--radix-popper-available-width`,
  `--radix-popper-available-height`, `--radix-popper-anchor-width`, `--radix-popper-anchor-height`), giá
  trị `available-height` được `floating-ui` tính SAU KHI đã áp dụng `shift`/`flip` (tức đã trừ đúng
  `collisionPadding={8}` hiện có, theo hướng đặt cuối cùng thật sự được chọn) — phản ánh đúng "khoảng
  trống thực tế còn lại tính từ trigger/anchor tới mép viewport". Biến này set trên node cha (wrapper
  `data-radix-popper-content-wrapper`) nhưng CSS custom property tự kế thừa xuống node con (`.space-menu`
  chính là node con nhận `className`), nên `var(--radix-popper-available-height)` dùng được thẳng trong
  class mà không cần đổi cấu trúc component.
- Dùng `min(80vh, available-height)` thay vì chỉ `80vh` đơn thuần vì `DashboardCorner` (chứa
  `SpaceSwitcher`) là 1 khối tham gia kéo-thả tự do như mọi khối khác trong layout (xem comment trong
  `DashboardCorner.tsx`: "kéo-thả tự do được như mọi khối khác trong hệ thống layout") — hoàn toàn có thể
  bị kéo xuống gần đáy màn hình, hoặc màn hình/cửa sổ trình duyệt bị thu ngắn theo chiều dọc (landscape
  mobile, cửa sổ desktop kéo thấp) khiến `80vh` tính trên toàn viewport vẫn tràn ra ngoài phần không gian
  thật sự còn lại bên dưới trigger. `min()` đảm bảo luôn lấy vế nhỏ hơn: tôn trọng rule nghiệp vụ "tối đa
  80% màn hình" trong điều kiện bình thường, đồng thời không bao giờ vượt khoảng trống thực tế khi
  `DashboardCorner` không còn nằm sát mép trên cùng.
- **Fallback `,80vh` trong `var(--radix-popper-available-height,80vh)` là bắt buộc, không phải tuỳ chọn**
  — vì class `.space-menu` dùng CHUNG cho cả dropdown Radix (`SpaceSwitcher`, đã migrate) lẫn dropdown sort
  note thủ công (`NotesBlock.tsx`, Phần 3 bên dưới **chưa migrate**) — trong context `NotesBlock`, biến
  `--radix-popper-available-height` không tồn tại. Theo CSS spec, `var()` tham chiếu 1 custom property
  chưa từng được set ở đâu và KHÔNG có fallback sẽ là "giá trị guaranteed-invalid", khiến toàn bộ khai báo
  `max-height` bị coi là invalid tại thời điểm tính giá trị và trình duyệt lùi về giá trị initial của
  `max-height` là `none` (không kế thừa) — tức **mất hẳn giới hạn chiều cao** ở `NotesBlock` (còn tệ hơn
  hiện trạng 320px). Có fallback `80vh`, khi biến không tồn tại thì `var(...)` chỉ đơn giản trả về `80vh`,
  `min(80vh, 80vh)` = `80vh` — đúng ý định "giới hạn 80% màn hình" mà không cần đợi `NotesBlock` migrate
  sang Radix DropdownMenu (khi migrate xong ở Phần 3, tự động có luôn phần an toàn mép màn hình nhờ dùng
  chung class, không cần sửa gì thêm).

**Cách test tay sau khi dev áp dụng:**
1. Mở dropdown Space-switcher trên desktop (≥1000px) — đo bằng DevTools: khoảng cách từ mép dưới
   `#dashboard-corner` tới mép trên dropdown phải đúng 12px (khớp mắt thường với gap giữa `DashboardCorner`
   và khối `Thông báo`/khối liền dưới trên Dashboard).
2. Với danh sách ít Space (2-4 space, trường hợp thường gặp) — dropdown phải cao tự nhiên theo nội dung,
   KHÔNG xuất hiện thanh cuộn.
3. Giả lập nhiều Space (thêm tạm nhiều Space test, hoặc thu nhỏ chiều cao cửa sổ trình duyệt) tới khi nội
   dung vượt 80% chiều cao màn hình — thanh cuộn xuất hiện đúng lúc, dropdown không tràn ra ngoài viewport
   dù cửa sổ thấp.
4. Thu cửa sổ xuống <1000px (vào UI mobile Chat-first) — dropdown vẫn mở đúng vị trí dưới thanh
   `DashboardCorner compact` (gap nhìn dày hơn thực tế ~4px so với 8px gốc, chấp nhận được theo lý do đã
   nêu ở mục 2).
5. Mở dropdown sort note ở `NotesBlock.tsx` (chưa migrate Radix) — xác nhận vẫn hoạt động bình thường,
   không bị mất giới hạn chiều cao (kiểm tra kỹ do đây là rủi ro kỹ thuật thật đã nêu ở trên, không phải
   suy đoán suông).

### Phần 3 — `NotesBlock.tsx` (dropdown sort) → Radix DropdownMenu
Trạng thái: ✅ Xong (2026-07-07)

Đã cài `@radix-ui/react-dropdown-menu@^2.1.20` (peer dep khớp React 18, cùng dòng version với
`@radix-ui/react-dialog`/`@radix-ui/react-popover` đã cài ở Phần 1-2).

**Đã làm:** Xoá hẳn 3 thứ chỉ tồn tại để tự làm lại việc Radix làm sẵn — `useState<boolean>` `sortMenuOpen`,
`useRef<HTMLDivElement>` `sortWrapRef`, và `useEffect` 7 dòng gắn `mousedown` listener đóng menu khi click
ngoài. Dùng `DropdownMenu.Root` **uncontrolled** (không truyền `open`/`onOpenChange`) — Radix tự quản lý
mở/đóng/outside-click/Escape/tự đóng sau khi chọn. `DropdownMenu.Trigger asChild` bọc button hiện có (giữ
nguyên class cũ, bỏ `onClick` toggle thủ công). `DropdownMenu.Content` dùng `align="end"` (thay `!left-auto
!right-0` cũ) + `sideOffset={8}`, và **class `space-menu-surface`** (không phải `space-menu`) — đúng bài
học Bug 3 ở Phần 2: `.space-menu` còn `position/top/left` tự viết sẽ cộng dồn sai vị trí nếu dùng lại cho
Radix. Dùng `DropdownMenu.RadioGroup` (value = `noteSortBy`) + `DropdownMenu.RadioItem` (single-select,
đúng use-case 3 lựa chọn `SORT_OPTIONS` cố định) thay cho `<div onClick>` thủ công — style "đang chọn" đổi
từ ternary `${o.value === noteSortBy ? 'active' : ''}` sang Tailwind arbitrary variant
`data-[state=checked]:font-bold data-[state=checked]:text-[var(--accent)]` đọc thẳng `data-state` Radix tự
gắn, không cần tính JS. Bỏ `id="sort-menu"` (đã grep xác nhận không dùng ở đâu khác).

Import đầu file: bỏ `useRef` (không còn dùng), giữ nguyên `useEffect`/`useState` (còn dùng ở effect
disarm-draggable note-card và các state khác như `editingNote`/`viewingNoteId`/`draggedId`).

**Số dòng đã giảm:** trước 27 dòng (dòng 53, 55, 61-67, 196-222 gộp lại gồm state/ref/effect + JSX dropdown),
sau còn 27 dòng JSX Radix nhưng **không còn 1 dòng state/ref/effect thủ công nào** — điểm mấu chốt của yêu
cầu "gọn hơn" không nằm ở tổng số dòng JSX (cấu trúc Radix có phần verbose hơn do `Root/Trigger/Portal/
Content/RadioGroup/RadioItem`), mà ở việc xoá sạch 3 khối logic quản lý state/side-effect thủ công (1
`useState`, 1 `useRef`, 1 `useEffect` 7 dòng = **9 dòng logic** không còn tồn tại, thay bằng 0 dòng tương
đương vì Radix tự lo) — đúng tinh thần yêu cầu, không phải chỉ đổi tên API.

**Kết quả kiểm tra:** `npx tsc --noEmit` sạch, `npm run build` sạch (kèm PWA service worker), `npx vitest
run` 8 file/64 test pass.

**Cách test tay:** Mở khối "Ghi chú" trên Dashboard, bấm nút sort (hiện label + chevron, góc phải toolbar):
1. Menu mở ra, hiển thị đúng 3 lựa chọn ("Thứ tự thủ công", "Tên A-Z", "Mới sửa gần nhất"), option đang chọn
   in đậm + màu accent (`data-[state=checked]`).
2. Bấm chọn 1 option khác → danh sách note đổi thứ tự đúng theo sort mới, menu tự đóng ngay (không cần bấm
   thêm gì).
3. Mở lại menu, nhấn phím **Escape** → đóng.
4. Mở lại menu, click ra ngoài (vào vùng khác của trang) → đóng.
5. Kiểm tra vị trí: menu phải nằm ngay dưới nút trigger, neo bên phải (`align="end"`), không lệch/không đè
   lên nút khác — test cả desktop và mobile (≤639px, hoặc thu nhỏ khối Notes nếu ở free-layout).

### Phần 4 — `TasksBlock.tsx` (checkbox tick-done) → Radix Checkbox
Trạng thái: ✅ Xong (2026-07-07)

`@radix-ui/react-checkbox` đã cài sẵn từ trước (Assignee Picker). Thay `<span role="checkbox"
aria-checked tabIndex onClick onKeyDown onTouchEnd>` bằng `<Checkbox.Root checked={task.done}
onCheckedChange={...}>` + `<Checkbox.Indicator><Check/></Checkbox.Indicator>`. Xoá hẳn `role`,
`aria-checked`, `tabIndex`, `onKeyDown` (7 dòng logic bàn phím thủ công) và `onTouchEnd` (workaround
tap-delay không còn cần vì `Checkbox.Root` render ra `<button>` thật). Bỏ luôn ternary
`[&_.icon]:opacity-0`/`[&_.icon]:opacity-100` (Radix `Checkbox.Indicator` tự chỉ render khi checked) —
đổi màu nền/viền theo trạng thái sang Tailwind `data-[state=checked]:bg-...`/`border-...` thay vì tính
`style` object bằng JS. **Đã xoá: 1 `onKeyDown` handler (~6 dòng) + 1 `onTouchEnd` handler (~1 dòng) +
1 object `style` ternary** — không còn state/ref/effect riêng ở phần này (TaskRow vẫn còn state/ref
khác phục vụ kéo-thả, không đụng tới).

### Phần 5 — `HabitsBlock.tsx` (checkbox) → Radix Checkbox
Trạng thái: ✅ Xong (2026-07-07)

Khác Phần 4: `role="checkbox"` gốc nằm trên `<span>` NGOÀI CÙNG bao gồm cả ô vuông lẫn tên habit (bấm
tên cũng toggle được). Bọc toàn bộ (ô vuông + tên) vào 1 `<Checkbox.Root checked={doneToday}
onCheckedChange={...}>` (giữ nguyên className cũ của span ngoài), ô vuông nhỏ bên trong đổi thành
`<span>` thường chứa `<Checkbox.Indicator><Check/></Checkbox.Indicator>` (chỉ render icon khi checked).
Không dùng `onClick` thủ công nào khác — chỉ đúng 1 `onCheckedChange`, tránh double-toggle. Xoá `role`,
`aria-checked`, `tabIndex`, `onKeyDown` (7 dòng) trên span ngoài. **Đã xoá: 1 `onKeyDown` handler (~6
dòng)** — style nền/viền theo `doneToday` giữ nguyên dạng ternary className (không dùng
`group-data-[state=checked]` vì `.group` đã dùng cho hover show/hide nút sửa/xoá ở div cha khác, tránh
2 tầng `group` nhập nhằng — ternary đơn giản và rõ ràng hơn ở đây).

### Phần 6 — `PushNotificationSettings.tsx` (2 switch) → Radix Switch
Trạng thái: ✅ Xong (2026-07-07)

Cài `@radix-ui/react-switch@^1.3.3` (peer dep khớp React 18). Thay cả 2 chỗ `<button role="switch"
aria-checked onClick>` + `<span className="absolute ... translate-x-...">` bằng `<Switch.Root
checked onCheckedChange disabled aria-label>` + `<Switch.Thumb>`. Xoá `role`, `aria-checked` thủ công
(Radix tự gắn). Đổi ternary `translate-x-[21px]`/`translate-x-[3px]` và border/bg accent sang
`data-[state=checked]:...` Tailwind variant. Giữ nguyên `aria-label` (Radix Switch không tự sinh).
**Đã xoá: 2 object ternary className tính thủ công cho border/bg Root** (thay bằng data-attribute
variant, không còn tính bằng JS) — không có state/ref/effect riêng bị xoá vì switch gốc vốn stateless,
đọc thẳng state ngoài (`checked`/`state.settings.pushNotifySharedSpaceEvents`).

### Phần 7 — `ReminderFormModal.tsx` (`<select>` đơn vị Giờ/Ngày/Tháng) → Radix Select
Trạng thái: ✅ Xong (2026-07-07)

Cài `@radix-ui/react-select@^2.3.3` (peer dep khớp React 18). Thay `<select value={freqUnit}
onChange={...}>` (3 `<option>`) bằng `<Select.Root value={freqUnit} onValueChange={...}>` +
`Select.Trigger` (class y hệt `.field select` cũ, thêm `Select.Icon` chứa `ChevronDown`) +
`Select.Portal > Select.Content` (dùng đúng `space-menu-surface`, KHÔNG dùng `space-menu` — theo bài
học Bug 3 ở Phần 2, vì Radix không set position trên chính Content) `position="popper" sideOffset={4}`
+ `Select.Viewport` + 3 `Select.Item`/`Select.ItemText`.

**Ghi chú trung thực bắt buộc:** đây là phần DUY NHẤT trong 7 phần mà code DÀI HƠN bản gốc — native
`<select>` chỉ 1 dòng mở + 3 `<option>` (không thể gọn hơn), bản Radix cần đủ tầng
`Root/Trigger/Portal/Content/Viewport/Item/ItemText` nên dài hơn hẳn dù không có state/ref/effect nào
để xoá (bản gốc vốn đã dùng thẳng `value`/`onChange` không có state phụ). Vẫn làm theo đúng roadmap đã
chốt để đồng nhất toàn bộ dropdown dùng chung Radix, nhưng nêu rõ đánh đổi này, không giấu.

## Bug 4 — checkbox/switch mờ không thấy viền + thumb switch lệch (phát hiện sau khi user test tay Phần 4-6, 2026-07-07)

User báo 2 hiện tượng qua ảnh chụp thật: (1) ô checkbox chưa tick ("Việc cần làm") gần như vô hình, chìm
hẳn vào nền ở theme sáng; (2) 2 switch trong Settings hiển thị sai (thumb lệch vị trí). Dựng lại debug
harness (Playwright, đo `getComputedStyle` thật, không đoán) tái hiện được cả 2 và tìm đúng gốc rễ:

- **Checkbox mờ:** `getComputedStyle` cho thấy `border-width: 0px; border-style: none` dù class đã có
  `border-[1.6px] border-[color:var(--border-control)]` (width + color đúng, nhưng KHÔNG có utility nào
  set `border-style`). Có 1 rule global khớp phần tử `button` (specificity element-selector) set
  `border-style: none`, đè lên rule `* { border-style: solid }` (universal selector, specificity thấp
  hơn) — nên border-width dù đúng vẫn không hiển thị vì style=none. Bản CŨ dùng `<span role="checkbox">`
  không phải `<button>` nên không dính rule này — đây là regression THẬT khi Radix Checkbox/Switch đổi
  phần tử gốc từ `span` sang `button`. **Fix:** thêm `border-solid` vào className bất kỳ chỗ nào set
  border trực tiếp trên `Checkbox.Root`/`Switch.Root` (là `<button>`).
- **Switch lệch:** `Switch.Thumb` dùng `position: absolute` + `transform: translateX(...)` để định vị,
  nhưng KHÔNG set `left` tường minh. Trình duyệt tự tính "static position" cho `left` dựa trên hành vi
  mặc định của `<button>` (không phải `0`), cộng dồn thêm vào giá trị `translateX` khiến thumb lệch hẳn
  (đo được: thiếu `left-0` làm thumb ở trạng thái tắt lệch tới gần giữa track thay vì sát trái, trạng
  thái bật bị đẩy ra khỏi track hẳn). **Fix:** thêm `left-0` vào `Switch.Thumb`.

**Đã sửa tại 4 vị trí thật** (đã grep toàn bộ `Checkbox.Root`/`Switch.Root` trong `src/`, xác nhận đủ):
`TaskFormModal.tsx` (Assignee Picker checkbox), `TasksBlock.tsx` (task checkbox), `PushNotificationSettings.tsx`
(2 switch, cả `border-solid` lẫn `left-0`). `HabitsBlock.tsx` KHÔNG cần sửa — border ở đó nằm trên 1
`<span>` thường lồng bên trong `Checkbox.Root`, không phải trên chính `<button>`, nên không dính bug này.

**Bài học cho mọi phần Radix còn lại (nếu làm thêm sau này):** bất kỳ khi nào set `border-*` trực tiếp
trên phần tử gốc do Radix render ra `<button>` (Checkbox, Switch, và tương tự cho Toggle/ToggleGroup nếu
dùng sau này), PHẢI luôn kèm `border-solid` tường minh — không thể tin tưởng reset `border-style` mặc
định của trình duyệt/Tailwind áp dụng đúng cho `<button>`. Tương tự, bất kỳ phần tử con nào dùng
`position:absolute` + `transform: translate*` để định vị (kiểu "thumb" trong Switch/Slider) PHẢI set rõ
`left-0`/`top-0` (tuỳ trục) thay vì chỉ dựa vào `transform`, để tránh trình duyệt tự chèn static-position
không mong muốn.

Kèm 1 sửa nhỏ theo yêu cầu riêng: `TasksBlock.tsx` đổi format hiển thị ngày trong "Việc cần làm" từ
`MM-DD` (`task.date.slice(5)`) sang `DD/MM/YYYY` (`task.date.split('-').reverse().join('/')`) — áp dụng
chung 1 chỗ nên tự động đúng cho cả desktop lẫn mobile, không cần code riêng.

**Kết quả kiểm tra sau Bug 4:** `npx tsc --noEmit`, `npm run build`, `npx vitest run` đều sạch (64/64 test).

## Cách test tổng quát mỗi phần
Sau mỗi phần: `npx tsc --noEmit && npm run build` phải sạch, cộng với thao tác tay đúng luồng UI của phần đó
(mở/đóng, Escape, click-ngoài, tick/gõ chọn, responsive mobile ≤639px) — ghi cụ thể trong báo cáo cuối mỗi lượt.

## Kiểm tra tổng thể sau Phần 4-7 (2026-07-07)
`npx tsc --noEmit` sạch, `npm run build` sạch (kèm PWA service worker), `npx vitest run` 8 file/64 test pass.
Đã grep xác nhận không còn `role="checkbox"`/`role="switch"` thủ công nào sót lại trong 4 file đã sửa.

**Cách test tay tổng hợp (từ trên xuống dưới):**
1. Mở app, đăng nhập, vào Dashboard.
2. Khối "Việc cần làm": bấm đúng vào ô vuông nhỏ cạnh 1 task (không phải vào tên) → task chuyển
   trạng thái done (gạch ngang, đổi màu xám) và ngược lại; nhấn Tab tới ô vuông rồi nhấn phím
   Space/Enter → cũng toggle được (Radix Checkbox tự hỗ trợ bàn phím). Xác nhận bấm vào tên task
   KHÔNG toggle (giữ đúng hành vi cũ, khác Habit).
3. Khối "Thói quen": bấm vào CẢ ô vuông LẪN tên habit đều toggle được done-hôm-nay (khác Tasks ở trên
   — đúng như spec). Streak/tuần vẫn cập nhật đúng.
4. Vào Settings (icon topbar) → tab liên quan Push Notification: bật/tắt switch "Nhận thông báo khi
   Nhắc việc/Việc cần làm đến hạn" và switch "Thông báo hoạt động Space chung" — thumb trượt trái/phải
   đúng, màu nền đổi accent khi bật, tắt/bật lại nhiều lần không kẹt trạng thái; thử Tab tới switch rồi
   nhấn Space → cũng toggle được.
5. Mở modal "Nhắc việc mới" (hoặc sửa 1 nhắc việc có sẵn), chọn loại "Lặp lại" → bấm dropdown "Đơn vị"
   → chọn lần lượt Giờ/Ngày/Tháng, xác nhận: (a) dropdown hiện đúng 3 lựa chọn, vị trí ngay dưới ô
   Trigger; (b) chọn xong tự đóng, giá trị hiển thị đúng trên Trigger; (c) khi chọn "Tháng" thì field
   "Vào ngày (trong tháng)" hiện ra đúng như trước; (d) nhấn Escape khi dropdown đang mở → đóng.
6. Test nhanh trên mobile (≤639px hoặc DevTools responsive) cho cả 4 điểm trên — không bị lệch vị trí,
   không bị chặn tap.
