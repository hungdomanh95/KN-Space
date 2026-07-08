# Tính năng: Nhật ký nhanh

> Quyết định đã chốt qua trao đổi trực tiếp giữa chủ dự án, `ba` và `uiux` (phiên làm việc 2026-07-07) — tài liệu này ghi lại chính thức, không phải bản nháp chờ duyệt. Không còn câu hỏi mở nào **chặn** việc bắt đầu code (xem mục 10).
> Cập nhật: 2026-07-07 — mục 3.1 và 5.2.1 đã sửa lại để khớp cơ chế capture **thật sự triển khai**: segmented picker 3 nút mô tả ở bản trước đã bị chủ dự án huỷ ngay trong ngày code, thay bằng input đơn dòng phân loại theo tiền tố (`/task `, `/note `, gõ trơn = Log mặc định).
> Cập nhật: 2026-07-08 (**đợt 2**) — khối "Nhật ký nhanh" trên desktop bổ sung hàng nhập inline `logs-compose` (input 1 dòng + nút Gửi, luôn hiển thị, chỉ desktop), sau phản hồi thực tế dùng thử: không có chỗ nhập trên desktop, phải cầm điện thoại lên gõ. Nội dung chính ở mục 6.3; các mục liên đới đã đồng bộ theo: 5.1, 5.6, 5.7, 5.8, 7, 8, 10.

---

## 1. Tổng quan

**Root cause:** khối "Việc cần làm" đang bị dùng sai mục đích làm nhật ký chi tiêu/log nhanh qua `MobileChatScreen`, vì đó là kênh nhập liệu nhanh nhất trên di động. Ghi chú (Note) không phù hợp thay thế vì quá nặng (tiêu đề bắt buộc, chọn màu, card to) cho nhu cầu chỉ là 1 dòng log ngắn, không cần tiêu đề, không cần theo dõi trạng thái.

**Giải pháp:** thêm 1 loại nội dung mới — **Nhật ký nhanh** (`LogEntry`) — nhẹ, bất biến (immutable), không có khái niệm "hoàn thành". Đây là **entity hoàn toàn mới**, không lai vào Note (tránh thêm field `kind` làm rối search/sort/export/RLS của Note vốn đã ổn định).

**Điểm khác biệt chính so với Việc cần làm / Ghi chú:**

| | Việc cần làm | Ghi chú | Nhật ký nhanh |
|---|---|---|---|
| Có trạng thái hoàn thành | Có | Không (khái niệm khác) | **Không, và không có ý nghĩa** |
| Sửa được sau khi tạo | Có | Có | **Không — bất biến, chỉ tạo/xoá** |
| Có tiêu đề riêng | Có | Có (bắt buộc) | **Không — chỉ 1 field `content`** |
| Sắp xếp | `order` thủ công (kéo-thả) | `order`/tên/mới sửa | **Chỉ theo `createdAt`, không kéo-thả** |
| Có trong `enabledBlocks` | Có | Có | **Có** |
| Có trên mobile (`MobileChatScreen` + accordion) | Có | Có | **Có (mới)** |
| Nút thêm trên desktop | Có (`+ Thêm việc`) | Có (`+ Thêm note`) | **Có (đợt 2)** — hàng nhập inline `logs-compose`, không phải nút mở modal (xem mục 6.3) |

Đây là tính năng **cộng thêm**, không thay đổi hành vi hiện có của Task/Note/Reminder/Habit — chỉ đổi cơ chế nhập liệu mặc định trong `MobileChatScreen` (mục 3.1) và bổ sung hàng nhập trên desktop (mục 6.3). **Cơ chế mobile đã code** (sau khi thử segmented picker 3 nút rồi bị chủ dự án huỷ ngay trong ngày, xem mục 3.1): input đơn dòng, gõ trơn (không tiền tố) giờ tạo **Log** (khác bản gốc trước đây, gõ trơn tạo Task); tiền tố `/task ` tạo Task; tiền tố `/note ` tạo Note (giữ nguyên như bản gốc).

---

## 2. User Stories

### Actor: mọi user (cá nhân hoặc member Shared Space)

- Là user đang di chuyển, tôi muốn gõ nhanh 1 dòng log (vd "-50k trà đá") qua điện thoại mà không phải nghĩ tiêu đề/màu như Note, và không làm bẩn danh sách Việc cần làm bằng các dòng không phải việc thật.
- Là user, tôi muốn có gợi ý trực quan (placeholder cố định + viền ô nhập đổi màu live) về loại nội dung sắp tạo khi tôi gõ tiền tố `/task `/`/note `, để không gửi nhầm loại khi tôi cần Task/Note thay vì Log mặc định.
- Là user đang ngồi máy tính, tôi muốn ghi nhanh 1 dòng log ngay tại khối "Nhật ký nhanh" trên desktop mà không phải cầm điện thoại lên gõ qua tab Trò chuyện.
- Là user, tôi muốn xem lại toàn bộ log đã ghi trong 1 khối riêng trên desktop, sắp theo thời gian, không lẫn với Task/Note.
- Là user, tôi muốn xoá 1 log ghi nhầm.
- Là user, tôi muốn xoá nhiều log cùng lúc (vd dọn log cũ cuối tháng) mà không phải xoá từng dòng một.
- Là user dùng Space cá nhân, tôi muốn tắt hẳn khối Nhật ký nếu tôi không có nhu cầu dùng (giống Task/Note/Habit).

### Actor: Member Shared Space

- Là Member, tôi muốn ghi log vào Shared Space và các Member khác thấy được (sau khi họ reload, giống Task/Note hiện tại — không có push tức thì).
- Là Member, tôi muốn thấy tên người ghi log nếu không phải log của tôi.
- Là Member, tôi muốn xoá được log do Member khác ghi (giữ đúng quyền ngang hàng như Task/Note hiện tại).

---

## 3. Luồng chi tiết

### 3.1 Capture qua mobile chat (`MobileChatScreen`)

> Cơ chế mô tả dưới đây là bản **cuối cùng đã code** trong `MobileChatScreen.tsx`. Bản trước đó (segmented picker 3 nút `[Việc][Log][Note]` phía trên ô nhập) đã bị chủ dự án huỷ ngay trong cùng ngày code, quay lại hướng input đơn dòng như bản gốc trước khi có tính năng Nhật ký — chỉ đổi mặc định khi gõ trơn.

1. Ô nhập liệu ở đáy màn "Trò chuyện" là **input đơn dòng**, không có hàng chọn loại nào phía trên nó.
2. Phân loại nội dung dựa **hoàn toàn vào tiền tố gõ trong chính ô input**, đọc trực tiếp từ chuỗi đã `trim()` khi Enter/nút Gửi, không có state "loại đang chọn" nào lưu riêng:
   - Gõ trơn (không tiền tố) → tạo **Log** (`LogEntry`, field `content`) — **mặc định mới, đổi so với bản gốc** (trước đây gõ trơn tạo Task).
   - Tiền tố `/task ` → tạo **Task**, `title` là phần còn lại sau `/task` (trim).
   - Tiền tố `/note ` → tạo **Note**, `title` là phần còn lại sau `/note` (trim) — giữ nguyên như cơ chế `/note` gốc trước khi có tính năng Nhật ký.
3. Viền ô nhập đổi màu **live theo từng keystroke** (không cần Enter mới thấy) dựa trên tiền tố đang gõ: trung tính (`--border`) khi gõ trơn (sắp tạo Log), `--accent` khi phát hiện `/task`, `--note-color` khi phát hiện `/note`. Đây là gợi ý thị giác phụ trợ, không phải cơ chế chọn loại độc lập.
4. Placeholder **cố định**, không đổi theo tiền tố đang gõ (khác bản segmented picker cũ có 3 placeholder riêng theo loại đang chọn): `Gõ 1 dòng log, hoặc "/task " để tạo việc, "/note " để ghi chú` — vì không còn hàng chọn loại luôn hiển thị, placeholder phải tự giải thích đủ cả 3 lựa chọn trong 1 câu.
5. Bubble hiển thị trong feed theo đúng loại: Task/Note giữ nguyên style hiện tại; **Log có style riêng biệt** — nền trung tính `--raised` + viền dashed `--border`, icon `ScrollText` (`lucide-react`, xem mục 5.2.1) — không dùng chung style Task/Note để tránh nhầm "Log cũng là 1 loại Task/Note".
6. Giờ gửi hiển thị dưới bubble bằng đúng hàm `formatBubbleTime` đã có trong `MobileChatScreen.tsx` (tái dùng, không viết lại).
7. Chi tiết thị giác đầy đủ (màu viền theo tiền tố, placeholder, empty-state feed) và accessibility của ô nhập: xem mục 5.2.1 — đã chốt, không còn để ngỏ.
8. **Rủi ro UX cần theo dõi** (ghi nhận, không chặn code — xem thêm Edge Cases mục 8): user đã quen hành vi **bản gốc** (gõ trơn = Task, có từ trước cả tính năng Nhật ký) sẽ ngỡ ngàng vì gõ trơn giờ tạo Log. Đây là lần đổi mặc định thứ 2 trong cùng nhu cầu (Task mặc định → segmented picker → Log mặc định), nên rủi ro nhầm lẫn ban đầu là thật, không phải giả định lý thuyết.

### 3.2 Xem/xoá trên khối "Nhật ký nhanh" (desktop + mobile accordion)

1. Khối hiển thị **list phẳng 1 cột** (không Grid/List như Note) — mỗi dòng gồm: giờ tạo (dùng `formatBubbleTime`) + nội dung (clamp 2 dòng) + tên người tạo (chỉ hiện nếu Shared Space và không phải mình) + nút xoá (icon, **đã chốt**: hover-reveal trên desktop, luôn hiện trên mobile — tái dùng đúng pattern đã audit ở `TaskRow`/`NoteCard`, xem mục 5.1 cho định dạng đầy đủ từng phần).
2. Header khối gồm: icon-chip + tên "Nhật ký nhanh" + dropdown sort (Mới nhất/Cũ nhất, mặc định Mới nhất) + nút "Chọn" (vào chế độ chọn nhiều) + icon mắt (ẩn/hiện nội dung, mục 8 requirements) — tất cả nằm gọn trong 1 hàng `headerActions` của `BlockShell`, theo đúng cấu trúc `TasksBlock` (filter-tabs + nút thêm cùng hàng header). Riêng hàng nhập log (`logs-compose`, **đợt 2** — xem mục 6.3) là 1 hàng **khác**, nằm giữa header và list, chỉ hiện desktop — xem mục 5.1.
3. Trên desktop có thêm hàng `logs-compose` ngay trên list để tạo log mới (mục 6.3, 5.1) — 2 điểm dưới đây mô tả riêng phần **list** bên dưới hàng đó: chỉ dùng để xem lại/xoá/bulk-delete, không tự tạo log.
4. Click nút xoá 1 dòng → mở modal xác nhận tuỳ biến ("Xoá log này?") → xác nhận mới xoá.

### 3.3 Chọn nhiều & xoá hàng loạt (bulk delete)

> Chi tiết toolbar/animation/accessibility đầy đủ: xem mục 5.3 (đã chốt).

1. Bấm nút **"Chọn"** ở header khối (hoặc **long-press ~500ms** trên 1 dòng, chỉ mobile/cảm ứng — ngưỡng chuẩn hệ điều hành, tự động tick sẵn dòng vừa long-press) → vào chế độ chọn nhiều.
2. Trong chế độ chọn: mỗi dòng hiện thêm 1 checkbox ở đầu dòng; **tap/click bất kỳ đâu trên dòng** đều toggle chọn (không chỉ riêng ô checkbox).
3. **Không có nút "Chọn tất cả"** (quyết định của chủ dự án) — user phải tick từng dòng muốn xoá.
4. Toolbar chế độ chọn (thay header thường): `Đã chọn N` — nút **Huỷ** (thoát chế độ chọn, không xoá gì) — nút **Xoá (N)** (disabled khi N=0).
5. Bấm **Xoá (N)** → modal xác nhận tuỳ biến ("Xoá N log đã chọn? Không thể hoàn tác.") → xác nhận mới xoá toàn bộ N dòng, sau đó tự thoát chế độ chọn.
6. **Tự thoát chế độ chọn** (không cần bấm Huỷ) khi xảy ra 1 trong các sự kiện sau:
   - Đổi Space.
   - Chuyển tab mobile (Trò chuyện ↔ Chi tiết).
   - Khối Nhật ký bị thu gọn trong accordion mobile (user mở khối khác trong tab "Chi tiết").

---

## 4. Permission Model

Dùng đúng quyền đã có cho Task/Note — **không đặt quyền chặt hơn**:

| Hành động | Space cá nhân | Shared Space — Owner | Shared Space — Member |
|---|---|---|---|
| Tạo log | Được (chỉ chủ Space) | Được | Được |
| Xem log | Được | Được | Được |
| Xoá log của chính mình | Được | Được | Được |
| Xoá log do người khác tạo | N/A (chỉ 1 người) | Được | Được |
| Sửa nội dung log | **Không — không ai sửa được, kể cả tác giả** (bất biến, xem mục 6) | Không | Không |
| Bulk-delete | Được | Được (kể cả log không phải của mình) | Được (kể cả log không phải của mình) |

> Không có khái niệm "sửa" trong bảng trên vì log bất biến — không tồn tại nút sửa ở bất kỳ đâu trong UI.

---

## 5. UX / UI

> Mục này đã được `uiux` hoàn thiện chi tiết (2026-07-07, bổ sung đợt 2 ngày 2026-07-08 cho hàng nhập `logs-compose` trên desktop) — mọi điểm trước đây để `uiux` tự quyết đã **chốt**, không còn khoảng mở cần hỏi lại trước khi code (xem thêm mục 10).

### 5.1 Khối desktop — anatomy chi tiết (layout tự do)

**Icon-chip & header (1 hàng `.block-head`, cộng thêm 1 hàng nhập `logs-compose` riêng bên dưới — xem chi tiết cuối mục này):**
- Icon **`ScrollText`** (`lucide-react`) — chốt thay `History` (đã cân nhắc: `History` dễ gợi nhầm "hoàn tác/lịch sử sửa", trong khi Log bất biến không có khái niệm sửa — `ScrollText` đúng nghĩa "sổ ghi chép" hơn). Dùng thống nhất icon này ở icon-chip khối và bubble chat (5.2.1) — không cần bộ icon riêng cho từng nơi (không còn segmented control nên không có "nút chọn loại Log" cần icon riêng).
- Màu trung tính, khác 5 màu đã dùng (`--accent`/`--note-color`/`--habit-color`/`--reminder-color`/`--done`): thêm 1 token mới `--log-color: #8a8f98;` trong `:root` của `src/styles.css` (chỉ định nghĩa 1 lần, đúng pattern hiện có — `--note-color`/`--habit-color`/`--reminder-color` cũng chỉ định nghĩa ở `:root`, không override riêng theo `[data-theme="dark"]`). Icon-chip: `iconBg="rgba(138,143,152,.14)"` (tint 14%, đúng công thức đã dùng cho note/habit), `iconColor="var(--log-color)"`.
- Header dùng `.block-head` qua `BlockShell` như mọi khối khác — kéo-thả bằng bấm-giữ header (mặc định, không cần code riêng), icon grip mặc định (`showGripHandle` giữ `true`), icon mắt ẩn/hiện nội dung dùng nguyên cơ chế `BlockShell` (không code lại).
- **`headerActions` (trong `.block-head`) không có nút "+ Thêm..."** (khác Task/Note) — capture trên desktop nằm ở hàng `logs-compose` riêng bên dưới header (mục 6.3), không phải 1 nút trong `headerActions`.
- `headerActions` chứa **dropdown sort** + nút **"Chọn"**, theo đúng cấu trúc `TasksBlock` (filter-tabs + nút thêm nằm chung 1 hàng header):
  - Dropdown sort: tái dùng nguyên component/style Radix `DropdownMenu` đã dùng ở `NotesBlock` (chỉ đổi option list) — 2 lựa chọn: "Mới nhất" (mặc định) / "Cũ nhất" (`LogSortBy`).
  - Nút "Chọn": style dùng lại class `.add-link` có sẵn (cùng trọng lượng thị giác với "+ Thêm note"/"+ Thêm") nhưng đổi icon sang `ListChecks` (`lucide-react`) + label "Chọn" — không dùng icon `Plus` (tránh gợi ý nhầm là hành động thêm dữ liệu).
  - Khi vào chế độ chọn nhiều, nội dung `headerActions` (dropdown sort + nút "Chọn") bị **thay thế hoàn toàn** bằng toolbar chọn nhiều (xem 5.3) — icon mắt ẩn/hiện nội dung phía sau vẫn giữ nguyên vị trí/hành vi (không đổi khi vào/ra chế độ chọn).
  - Khi khối bị ẩn nội dung (icon mắt), `headerActions` tự ẩn theo cơ chế có sẵn của `BlockShell` (`{!collapsed && headerActions}`) — không cần xử lý thêm, tự động nhất quán với Task/Note.

**Hàng nhập `logs-compose` (đợt 2, 2026-07-08 — thay đổi theo phản hồi thực tế; xem mục 6.3 cho lý do/hành vi đầy đủ):**
- Vị trí: nằm giữa `.block-head` và `.block-body` (giữa hàng header và list log) — không thuộc `headerActions`, là 1 hàng riêng, cấu trúc/style **y hệt `.notes-toolbar` của `NotesBlock`** (tái dùng class, chỉ đổi nội dung bên trong: input đơn dòng + nút Gửi thay vì ô tìm kiếm).
- **Không cuộn theo list** log bên dưới — đứng yên khi list dài và cuộn nội bộ, giống `.notes-toolbar` đứng yên phía trên `.notes-grid` khi cuộn.
- Tự ẩn khi khối bị ẩn nội dung qua icon mắt (`{!collapsed && ...}`), dùng cùng cơ chế đã có ở `headerActions` — nhất quán, không code riêng.
- **Chỉ hiện trên desktop** (`max-sm:hidden`) — mobile vẫn capture qua tab "Trò chuyện" (`MobileChatScreen`, mục 3.1/5.2.1), không lặp lại ô nhập ở đây trên mobile.
- Chi tiết input/nút Gửi (nội dung, hành vi submit, giữ focus...): xem mục 6.3.

**1 dòng log (row) — định dạng chính xác:**
```
[giờ tạo] [nội dung, clamp 2 dòng, flex-1] [tên người tạo — chỉ Shared Space & không phải mình] [nút xoá]
```
- Giờ tạo: dùng lại **nguyên hàm `formatBubbleTime`** từ `MobileChatScreen.tsx` (import dùng chung, không viết lại) — chip nhỏ nền `--raised`, chữ `--text-dim`, `~0.75rem`, căn trên đầu dòng.
- Nội dung: `line-clamp-2` (Tailwind), `text-[0.875rem] text-[var(--text)]`, không in đậm (khác `row-title font-medium` của Task — Log không có "tiêu đề", cả dòng là nội dung ngang hàng).
- Tên người tạo: tái dùng `getMemberDisplayName`/`getMemberColor` (`src/utils/memberColors.ts`) — chip style giống hệt chip `memberDotName` đã có ở `TaskRow` (nền `color-mix(in srgb, ${color} 14%, var(--raised))`, chữ màu member). Không cần avatar tròn riêng ở đây (khác `MobileChatScreen`) — cột giờ đã đủ làm điểm neo mắt, thêm avatar sẽ làm danh sách nén nhiều dòng bị rối.
- Nút xoá: tái dùng **đúng pattern** `opacity-0 group-hover:opacity-100 max-md:opacity-100` đã audit & fix ở `TaskRow`/`NoteCard` (`docs/features/ui-audit-2026-07.md` mục A4/T-series) — ẩn theo hover trên desktop (giảm nhiễu cho danh sách log có thể dài), **luôn hiện** trên mobile/cảm ứng (không có `:hover` khi chạm). Icon `Trash2`; `aria-label`/`title` mô tả rõ nội dung: `Xoá log: "{40 ký tự đầu nội dung}…"` (cùng kiểu cắt chuỗi `maxLen` đã dùng ở `getMemberDisplayName`).
- Click vào phần nội dung dòng (ngoài nút xoá) ở chế độ thường: **không có hành động gì** — không mở modal xem chi tiết (**quyết định chốt**, xem Edge Cases mục 8: giữ clamp 2 dòng vĩnh viễn ở phase này, không làm modal/expand).
- Viền dưới mỗi dòng: `border-b border-[color:var(--border)] last:border-b-0` — hairline style giống `TaskRow`, không dùng card riêng biệt từng dòng (khác Note card).
- Body: list phẳng, tải hết 1 lần, không phân trang (giữ nguyên theo `ba`).

**Empty state:** dùng component `EmptyState` có sẵn (nhất quán Task/Note, không viết placeholder text thuần) — icon `ScrollText`, title "Chưa có log nào", hint **"Nhập ở ô phía trên để ghi log (desktop), hoặc gõ nhanh qua tab Trò chuyện trên điện thoại."** (đợt 2 — cập nhật để phản ánh đúng việc desktop giờ đã có hàng `logs-compose`, không còn chỉ hướng dẫn nhập qua mobile).

### 5.2 Mobile

#### 5.2.1 `MobileChatScreen` — cơ chế tiền tố & bubble Log

> Bản segmented picker 3 nút `[Việc][Log][Note]` mô tả ở các bản tài liệu trước **đã bị chủ dự án huỷ ngay trong ngày code** — không còn tồn tại trong `MobileChatScreen.tsx`. Nội dung dưới đây mô tả đúng cơ chế cuối cùng đã triển khai.

**Cơ chế tiền tố (input đơn dòng, không có hàng chọn loại):**
- Không có control chọn loại nào trước ô nhập — chỉ 1 input đơn dòng như bản gốc trước tính năng Nhật ký.
- Phân loại bằng tiền tố gõ trực tiếp trong nội dung (đọc từ đầu chuỗi `text.trim()` khi submit):
  - Gõ trơn (không tiền tố) → **Log** (mặc định mới).
  - `/task ` → **Task** — `title` là phần còn lại sau `/task` (trim).
  - `/note ` → **Note** — `title` là phần còn lại sau `/note` (trim, giữ nguyên như cơ chế `/note` gốc).
- Viền ô nhập (`border`) đổi màu **live** theo tiền tố đang gõ, tính lại mỗi keystroke qua `text.trimStart().startsWith(...)` (không cần Enter mới thấy):
  - Gõ trơn: viền `--border` (trung tính) → focus `--accent`.
  - Phát hiện `/task`: viền `--accent`.
  - Phát hiện `/note`: viền `--note-color`.
- Placeholder **cố định**, không đổi theo tiền tố: `Gõ 1 dòng log, hoặc "/task " để tạo việc, "/note " để ghi chú` — vì không còn hàng chọn loại luôn hiển thị, placeholder phải tự giải thích đủ cả 3 lựa chọn trong 1 câu.
- Không có state nào lưu "loại đang chọn" (khác bản segmented picker cũ dùng state cục bộ `composeMode`) — loại được suy ra **tức thời** từ nội dung `text` mỗi lần submit; không có gì cần reset khi đổi tab/unmount vì không tồn tại state để reset.
- Empty state feed (chưa có bubble nào): `Gõ 1 dòng để ghi log nhanh — hoặc "/task " để tạo việc, "/note " để ghi chú.`

**Bubble Log:**
- Style trung tính, **dùng chung cho cả bubble của mình lẫn của người khác** (khác Task/Note — 2 loại đó tô đặc theo accent/note-color khi "của mình", theo màu member khi "của người khác"): `rounded-2xl border border-dashed border-[color:var(--border)] bg-[var(--raised)] px-3.5 py-2.5 text-[0.875rem] text-[var(--text)]`, icon `ScrollText` (`size 14`, màu `--text-dim`) đứng đầu nội dung.
- Lý do dùng 1 style neutral cho cả 2 chiều: Log đã có label tên người gửi + avatar (khi không phải mình) + căn trái/phải để phân biệt tác giả — không cần thêm màu nền theo member (tránh rối mắt khi 1 người vừa gửi Task/Note pastel màu, Log lại thêm 1 màu thứ 3 trong cùng feed).
- Vẫn giữ hàng tên người gửi (chip nền đặc) + avatar bên trái khi không phải mình, và chip giờ gửi (`formatBubbleTime`) bên dưới bubble — y hệt cơ chế đã có, không đổi.
- **Lưu ý kỹ thuật cho `dev`:** sort hợp nhất hiện tại (`.sort((a,b) => b.order - a.order)`) dùng field `order` — nhưng `LogEntry` **không có** `order` (chỉ `createdAt`, mục 9). Khi thêm Log vào mảng `all`, đổi tiêu chí sort dùng chung sang `createdAt` (so sánh chuỗi ISO) cho cả 3 loại, tránh bubble Log hiển thị sai vị trí thời gian xen giữa Task/Note.

#### 5.2.2 Tab "Chi tiết" — accordion 3 khối

- Nhật ký nhanh là khối thứ 3 (sau Việc cần làm, Ghi chú) — mở/thu gọn đúng cơ chế accordion đã có; thanh tóm tắt khi thu gọn: icon `ScrollText` + tên "Nhật ký nhanh" + số lượng log, **không** preview nội dung (đồng nhất Task/Note).
- Khi khối đang mở (~80% chiều cao): toàn bộ header/list mô tả ở 5.1 giữ nguyên, chỉ chỉnh padding/cỡ chữ theo breakpoint `max-sm` sẵn có — không cần style riêng ngoài các chỉnh nhỏ theo pattern chung. Hàng `logs-compose` **không** hiện ở đây (chỉ desktop, xem 5.1/6.3) — capture trên mobile vẫn đi qua tab "Trò chuyện".
- Long-press vào chế độ chọn nhiều áp dụng được ở đây (khối Nhật ký trong accordion), **không** áp dụng trong feed `MobileChatScreen` (feed chỉ xem, đã chốt).

### 5.3 Chế độ chọn nhiều — chi tiết toolbar & tương tác

**Vào chế độ chọn:**
- Cách 1: bấm nút "Chọn" trong `headerActions` (5.1) — cả desktop lẫn mobile.
- Cách 2 (chỉ cảm ứng/mobile): long-press **~500ms** trên 1 dòng bất kỳ (ngưỡng chuẩn hệ điều hành, không tự nghĩ số khác) → vào chế độ chọn **và** tự tick sẵn dòng vừa long-press. Vùng long-press là toàn bộ dòng **trừ** nút xoá (nút xoá có `stopPropagation` riêng, tránh xung đột 2 cử chỉ).
- Chuyển đổi có hiệu ứng ngắn (`opacity`/`transform`, `duration-150`, theo `--ease-standard` — khớp chuẩn animation 150-200ms toàn app) khi checkbox xuất hiện đầu mỗi dòng và `headerActions` đổi nội dung — không dùng animation dài/slide phức tạp. Vì chỉ dùng transition ngắn trên `opacity`/`transform`, không cần thêm rule `prefers-reduced-motion` riêng (đã đủ nhẹ, khác 2 animation lặp vô hạn đã có rule riêng theo UI audit An2).

**Toolbar khi đang chọn (thay hẳn nội dung `headerActions` thường ở 5.1):**
```
Đã chọn {N}                    [ Huỷ ]  [ 🗑 Xoá (N) ]
```
- "Đã chọn {N}": text tĩnh, `text-[0.8125rem] font-semibold text-[var(--text-dim)]`.
- Nút "Huỷ": text-button nhỏ gọn cùng cỡ với các control khác trong header (`text-[0.8438rem] font-semibold`, không viền/nền, hover đổi `text-[var(--accent)]`) — **không** dùng nguyên class `.btn-ghost` của modal (kích thước padding `px-[13px] py-[7px]` quá to so với 1 hàng header compact, sẽ đội chiều cao `.block-head`). `aria-label="Huỷ chế độ chọn"` — thoát chế độ chọn, không xoá gì, trả `headerActions` về trạng thái thường.
- Nút "Xoá (N)": icon `Trash2` + label, cùng cỡ chữ với nút "Huỷ", màu `var(--reminder-color)` (đúng token dùng cho hành động xoá/nguy hiểm toàn app, xem `ConfirmModal.tsx`), `disabled` (`opacity-40`, `cursor-not-allowed`, khớp pattern nút Gửi disabled ở `MobileChatScreen`) khi `N=0`, `aria-label={"Xoá " + N + " log đã chọn"}`.

**Chọn từng dòng:**
- Checkbox dùng **Radix `Checkbox.Root`** (đúng component đã migrate toàn app — **không** dùng `<input type="checkbox">` mặc định của OS) xuất hiện ở đầu mỗi dòng, **thay vị trí nút xoá** (nút xoá ẩn hẳn trong lúc đang ở chế độ chọn — tránh 2 đường xoá cùng lúc trên 1 dòng gây rối).
- Tap/click **bất kỳ đâu trên dòng** (kể cả ngoài checkbox) đều toggle chọn — cả checkbox và vùng dòng trỏ chung 1 handler. `aria-label` của mỗi dòng khi ở chế độ chọn: `Chọn log: "{40 ký tự đầu}…"`.
- Dòng đang được chọn: nền `bg-[rgba(var(--accent-rgb),.08)]` (khớp tông "đang active" đã dùng cho filter Task/Space đang chọn).

**Xác nhận xoá:** bấm "Xoá (N)" → `useConfirm()` với nội dung `("Xoá N log đã chọn?", "Xoá {N} log đã chọn? Không thể hoàn tác.", callback)` — xoá xong tự thoát chế độ chọn (`selectedIds` reset rỗng, `isSelecting=false`), `headerActions` trở lại trạng thái thường.

**Tự thoát chế độ chọn (không cần bấm Huỷ) — implementation:** theo dõi qua `useEffect` với dependency là: `currentSpaceId` (đổi Space), cờ tab mobile hiện tại (Trò chuyện/Chi tiết), và cờ "khối nào đang mở trong accordion" (khi Nhật ký bị thu gọn). Bất kỳ giá trị nào trong 3 dependency đổi đều reset `isSelecting=false; selectedIds=new Set()` ngay lập tức, không cần confirm/toast báo (đây là ephemeral UI state, mất đi là hợp lý, không phải mất dữ liệu thật).

### 5.4 Modal xác nhận

Dùng `useConfirm()`/`ConfirmModal` đã có sẵn (`src/components/ConfirmContext.tsx`) — áp dụng cho cả xoá 1 dòng lẻ và bulk-delete, nhất quán với toàn bộ app (không dùng `window.confirm`). Đây là lựa chọn mặc định hợp lý của `ba` (chủ dự án chưa chốt riêng cho xoá đơn lẻ) — có thể đổi nếu chủ dự án thấy xoá đơn lẻ nên nhẹ nhàng hơn (vd không cần confirm), nhưng nhất quán pattern toàn app quan trọng hơn ở quy mô này.

### 5.5 Empty / Loading / Error state

**Empty state:** xem 5.1 (component `EmptyState`, text đã chốt).

**Loading state:** kiến trúc hiện tại tải **toàn bộ** `AppState` (gồm cả `logs[]`) một lần trước khi Dashboard render bất kỳ khối nào (`LoadingScreen` toàn màn hình, `src/App.tsx`) — khối Nhật ký **không có fetch riêng**, nên không cần skeleton riêng cho luồng tải chính. Chỉ có đúng 1 trạng thái loading thật liên quan đến khối này: tên người tạo (`getMemberDisplayName`) trong Shared Space phụ thuộc `useSpaceMembers()` (fetch async, có cache) — trong lúc chưa resolve, tái dùng **đúng fallback đã có sẵn** toàn app (`"Thành viên"` + màu suy từ hash `userId`, xem `src/utils/memberColors.ts`), không cần trạng thái loading/skeleton riêng cho phần này — Task/Note đang dùng y hệt, không có tiền lệ khác cần theo.

Dự phòng (không cần code ngay, chỉ để nhất quán nếu kiến trúc đổi sau này sang tải lazy theo Space — hiện chưa có kế hoạch này): khối hiển thị 3 dòng skeleton phẳng (thanh xám bo góc nhỏ, chiều cao ≈ 1 dòng log thật, hiệu ứng pulse nhẹ, tôn trọng `prefers-reduced-motion`) thay vì `EmptyState`, tránh flash "Chưa có log nào" rồi lại có dữ liệu thật.

**Error state:** dùng **đúng banner lỗi lưu đã có toàn app** (`storageFallbackActive`, góc dưới-phải, icon `AlertTriangle`, viền `--reminder-color`, xem `src/App.tsx`) — không làm banner lỗi riêng cho khối Nhật ký. Tạo log qua `logs-compose`, xoá 1 log/bulk-delete dùng `dispatch` thường (tối ưu lạc quan, lưu nền debounce) giống hệt Task/Note — nếu lưu lỗi (mất mạng), banner chung xuất hiện, thay đổi vẫn hiển thị đã áp dụng ở local (chấp nhận rủi ro giống toàn app hiện tại, không xử lý riêng).

### 5.6 Accessibility (tổng hợp)

| Thành phần | Yêu cầu |
|---|---|
| Input đơn dòng mobile chat (phân loại theo tiền tố `/task`/`/note`) | Không có control chọn loại riêng để gắn `role`/`aria-pressed` (đã bỏ segmented picker). Placeholder mô tả đủ cả 3 lựa chọn bằng **text**, không chỉ dựa vào màu viền đổi live — tránh vi phạm nguyên tắc "không dùng màu làm chỉ báo duy nhất" |
| Input `logs-compose` (desktop, đợt 2, mục 6.3) | `aria-label="Nội dung nhật ký mới"` — không dựa vào placeholder làm label duy nhất |
| Nút Gửi `logs-compose` (desktop, đợt 2, mục 6.3) | `aria-label="Gửi log"` + `title="Gửi log (Enter)"` + `disabled`/`aria-disabled` khi nội dung rỗng sau `trim()` |
| Nút xoá từng dòng log | `aria-label="Xoá log: \"{40 ký tự đầu}…\""`, `title` trùng nội dung |
| Checkbox chọn nhiều | Radix `Checkbox.Root` (không dùng checkbox OS mặc định); mỗi dòng có `aria-label="Chọn log: \"{40 ký tự đầu}…\""` |
| Nút "Chọn" / "Huỷ" / "Xoá (N)" | `aria-label` mô tả hành động; nút "Xoá (N)" có `disabled` + `aria-disabled` khi N=0 |
| Dropdown sort | Tái dùng Radix `DropdownMenu` (đã có sẵn accessibility chuẩn qua Radix) |
| Contrast | Chip giờ/tên người tạo dùng `--text-dim` — tự động hưởng lợi từ fix contrast ≥4.5:1 đã áp dụng toàn app (UI audit A1/C1, 2026-07-07), không cần xử lý riêng |
| Focus | Không cần focus-trap (khối nằm trong Dashboard thường, không phải modal) — riêng modal xác nhận xoá kế thừa focus behavior sẵn có của `Modal`/`ConfirmModal` |
| Touch target | Nút xoá/checkbox theo đúng chuẩn `.icon-btn`/`touch-target-44` đã dùng toàn app — không tự tạo vùng chạm nhỏ hơn 44px |

### 5.7 Responsive (tổng hợp)

| | Desktop (layout tự do) | Mobile (`≤999px`) |
|---|---|---|
| Vị trí | 1 khối trong hệ cột/slot tự do, kéo-thả/resize như 6 khối khác | Khối thứ 3 trong accordion tab "Chi tiết" |
| Controls | Sort + "Chọn" trong `headerActions` (1 hàng header) | Y hệt, chỉ chỉnh padding/cỡ chữ theo `max-sm` |
| Capture | **Có** — ô nhập inline (không cuộn) phía trên list, Enter hoặc nút Gửi, giữ focus để gõ liên tục (đợt 2, mục 6.3) | Qua tab "Trò chuyện" — input đơn dòng, phân loại theo tiền tố `/task`/`/note`, gõ trơn mặc định Log (5.2.1) |
| Chọn nhiều | Chỉ qua nút "Chọn" | Nút "Chọn" **hoặc** long-press 1 dòng |
| Xoá | Nút xoá hover-reveal | Nút xoá **luôn hiện** (không có `:hover` khi chạm) |

### 5.8 Light / Dark theme

Không cần thêm màu mới ngoài 1 token neutral duy nhất (`--log-color`, mục 5.1) — mọi phần còn lại đi qua token hệ thống sẵn có, tự đổi theo theme:
- Row log: `--text-dim` (giờ/tên), `--border`/`--border-hairline` (viền dòng), `--text` (nội dung) — không có màu cứng nào khác.
- Bubble Log trong chat: nền `--raised`, viền dashed `--border` — cả 2 đã tự thích ứng 2 theme (xem giá trị `:root`/`[data-theme="dark"]` trong `src/styles.css`).
- Hàng `logs-compose` (input + nút Gửi, đợt 2): dùng token sẵn có (`--raised`/`--border`/`--accent`/`--text`) y hệt `.notes-toolbar`, không cần token màu mới.
- Dòng đang chọn (bulk-select): `rgba(var(--accent-rgb),.08)` — tự đổi theo accent + theme.
- Nút "Xoá (N)"/nút xoá từng dòng: `var(--reminder-color)` — cố định giữa 2 theme, giống mọi nơi khác dùng token này (không có override riêng theo `[data-theme="dark"]` cho token này trong toàn app).

---

## 6. Behavior đặc biệt

### 6.1 Bất biến (immutable) — chỉ tạo và xoá

Log **không có chức năng sửa** ở bất kỳ đâu trong UI (không modal sửa, không inline edit). Lý do nghiệp vụ: log là bản ghi tại 1 thời điểm ("tôi đã chi X lúc Y"), sửa lại sau làm mất ý nghĩa "nhật ký". Muốn đổi nội dung, user xoá rồi tạo log mới (tạo log mới không giữ lại `createdAt` cũ).

### 6.2 Item-level — bắt buộc vì lý do kỹ thuật (Shared Space)

Mỗi log là 1 record độc lập trong mảng `logs[]` của Space (giống `tasks[]`/`notes[]`) — **không gộp nhiều dòng log vào 1 record dùng chung**. Đây là ràng buộc bắt buộc, không phải tối ưu: cơ chế Last-Write-Wins (LWW) của Shared Space áp dụng ở **cấp item** (mục `docs/features/shared-space.md` 6.2), không phải cấp dòng bên trong 1 item. Nếu gộp nhiều log vào 1 record text nhiều dòng, 2 Member cùng log gần nhau (trong cùng khoảng chưa ai reload) sẽ dẫn đến người save sau **ghi đè toàn bộ record**, xoá mất log của người kia — đây là bài học thực tế đã biết từ hành vi LWW hiện có, không phải giả thuyết.

Vì log là **immutable (chỉ tạo/xoá, không sửa)**, rủi ro conflict LWW thực ra **thấp hơn** Task/Note: 2 Member tạo log cùng lúc luôn là 2 item riêng biệt (không bao giờ đụng nhau); xoá trùng (2 Member cùng xoá 1 log gần như đồng thời) là thao tác **idempotent** — người xoá sau chỉ gặp "item không còn tồn tại", không cần xử lý lỗi đặc biệt, không mất dữ liệu.

### 6.3 Hàng nhập inline trên desktop (`logs-compose`) — thay đổi đợt 2 (2026-07-08)

> **Thay đổi đợt 2**, dựa trên phản hồi thực tế của chủ dự án sau khi dùng thử: khối "Nhật ký nhanh" trên desktop hoàn toàn không có chỗ nhập, phải cầm điện thoại lên gõ qua `MobileChatScreen` mỗi khi cần ghi log trong lúc đang ngồi máy tính — bất tiện không cần thiết. Bản gốc (mục 6.3 cũ, nay đã thay thế) đã lường trước đúng tình huống này: *"không phải giới hạn kỹ thuật cứng — có thể bổ sung nút thêm trên desktop sau nếu phát sinh nhu cầu thực tế, không chặn việc code hiện tại"*. Đây chính là lúc bổ sung theo đúng tinh thần đã lường trước đó.

1. Khối `LogsBlock` trên desktop có thêm 1 hàng **`logs-compose`**, nằm giữa `block-head` và `block-body`, cấu trúc/style **y hệt `.notes-toolbar` của `NotesBlock`** (tái dùng class có sẵn, chỉ đổi nội dung bên trong) — đây là hàng **luôn hiển thị** khi khối đang mở nội dung (chưa bị ẩn qua icon mắt), **không phải modal**, **không phải nút toggle ẩn/hiện dạng mở-đóng**.
2. Nội dung hàng gồm: 1 `<input type="text">` đơn dòng (placeholder gợi ý, ví dụ "Ghi nhật ký nhanh…") chiếm phần lớn chiều rộng, cộng 1 nút **Gửi** (icon `SendHorizontal` từ `lucide-react`) ở cuối hàng.
3. Submit bằng **Enter** trong ô input hoặc bấm nút **Gửi** → dispatch action tạo log mới (`LOG_CREATE`, hoặc tên action tương đương do `dev` đặt theo convention hiện có) với nội dung đã `trim()`.
4. Sau khi gửi thành công: input **giữ nguyên focus** (không blur) và tự xoá nội dung vừa gửi — để user gõ liên tục nhiều dòng log mà không phải click lại vào ô input mỗi lần.
5. **Không có cơ chế tiền tố** `/task `/`/note ` ở hàng này (khác ô nhập ở `MobileChatScreen`, mục 3.1) — hàng `logs-compose` **chỉ tạo Log**, không phân loại nội dung. Lý do: ngữ cảnh khối "Nhật ký nhanh" đã rõ ràng là tạo Log, không cần cơ chế phân loại đa năng như ô nhập chung của mobile chat.
6. **Không có nút Huỷ/nút X** ở hàng này — vì hàng luôn hiển thị thường trực (không phải dạng mở ra rồi đóng lại), không có trạng thái "đang mở form" nào cần huỷ; user muốn bỏ dở chỉ cần tự xoá text trong input.
7. Nút Gửi **disabled** khi nội dung input rỗng sau `trim()` (giống validate hiện có của Task/Note và ô nhập `MobileChatScreen`).
8. Chỉ hiện trên **desktop** (`max-sm:hidden`) — mobile không có hàng này, vẫn capture qua tab "Trò chuyện" như mục 3.1/5.2.1.

### 6.4 Không kéo-thả sắp xếp thủ công

Khác Task/Note (có `order` + grip kéo-thả), Nhật ký nhanh **luôn sắp theo `createdAt`** (2 chiều: Mới nhất/Cũ nhất) — không có field `order`, không tham gia nhóm "3 khối được phép kéo-thả sắp xếp thủ công" ở mục 9 requirements.

### 6.5 Giới hạn hiển thị bubble trong `MobileChatScreen` (quyết định mặc định)

**Quyết định của `ba` (điểm mở #2, xem mục 10):** hiện tại `MobileChatScreen` lấy tối đa 30 task + 30 note rồi merge, sort, cắt còn 50 bubble hiển thị. Thêm Log tần suất cao vào sẽ đẩy Task/Note thật ra khỏi khung nhìn nhanh nếu giữ nguyên ngưỡng 50.

**Default đã chọn:** lấy thêm tối đa **30 log** (giữ nguyên 30 task + 30 note, thêm 30 log = tối đa 90 candidate), **tăng tổng giới hạn hiển thị từ 50 lên 75**. Con số cụ thể để `dev` áp dụng thẳng:
```
const all = [...tasks.slice(0, 30), ...notes.slice(0, 30), ...logs.slice(0, 30)]
  .sort(...)
  .slice(0, 75); // tăng từ 50 → 75
```
Lý do chọn 75 (không phải giữ nguyên 50 hay tăng lên 90): đủ chỗ cho cả 3 loại cùng xuất hiện gần đây mà không tải quá nhiều DOM node trên mobile; có thể điều chỉnh sau nếu thực tế dùng cho thấy vẫn chưa đủ (không phải con số cứng tuyệt đối, `dev`/chủ dự án có thể đổi khi thấy cần).

---

## 7. Out of Scope (không làm trong phase này)

- **Sửa nội dung log** — bất biến theo thiết kế, không phải thiếu sót.
- **Ngày/giờ hẹn, trạng thái hoàn thành, màu riêng, `order` thủ công** cho log — không có khái niệm này với Nhật ký nhanh.
- **Nút "Chọn tất cả"** trong chế độ bulk-delete — quyết định rõ ràng của chủ dự án.
- **Tìm kiếm nội dung log** — khác Note (có ô tìm kiếm), Nhật ký nhanh chỉ có sort Mới nhất/Cũ nhất, không có ô search (log ngắn, số lượng nhỏ tại 1 thời điểm, tìm kiếm chưa cần thiết ở quy mô này).
- **Gộp nhiều dòng log vào 1 record** — cấm hẳn vì lý do kỹ thuật (mục 6.2), không phải tuỳ chọn.
- **Giới hạn/quota số log** — không giới hạn số lượng log lưu trữ (giống Task/Note).
- **Export/Import riêng cho log** — đi chung cơ chế Export/Import JSON toàn Space đã có (mục 7 requirements), không cần schema version riêng.
- **Habit-style ẩn theo Shared Space** — khác Thói quen (bị ẩn hoàn toàn trong Shared Space vì quá cá nhân), Nhật ký nhanh **hiển thị bình thường** trong Shared Space, không có logic ẩn đặc biệt nào (log tài chính/công việc chung hoàn toàn hợp lý để chia sẻ).

---

## 8. Edge Cases cần handle

| Case | Hành vi mong đợi |
|---|---|
| Nội dung log rỗng sau `trim()` | Không tạo, giống validate hiện tại của Task/Note (nút Gửi disable khi input rỗng). |
| User đã quen hành vi **bản gốc** (gõ trơn = Task, có từ trước cả tính năng Nhật ký) tiếp tục gõ trơn mà không để ý mặc định đã đổi | Nội dung gõ trơn sẽ tạo **Log**, không phải Task như trước đây — không có cảnh báo chặn nào (validate chỉ kiểm tra rỗng sau `trim()`). Đây là rủi ro UX thật, không phải giả định lý thuyết, vì đây là lần đổi mặc định thứ 2 liên tiếp trong cùng ngày (Task mặc định → segmented picker → Log mặc định). Giảm nhẹ hiện tại: placeholder luôn hiện nhắc tiền tố `/task `/`/note ` cần dùng. Nếu thực tế dùng cho thấy vẫn tạo nhầm Log nhiều, cân nhắc bổ sung toast xác nhận ngắn hoặc nút "Undo" nhanh sau khi tạo (chưa nằm trong scope hiện tại, cần `ba` duyệt trước khi thêm). |
| 2 Member cùng tạo log gần như đồng thời trong Shared Space | Không xung đột — mỗi log là 1 item riêng trong `logs[]` (mục 6.2), cả 2 đều được lưu, chỉ 1 trong 2 thấy log của người kia sau khi họ tự reload. |
| 2 Member cùng xoá 1 log gần như đồng thời | Idempotent — người xử lý sau chỉ thấy item đã không còn (no-op), không hiện lỗi. |
| Member đang ở chế độ chọn nhiều (bulk-select) thì có Member khác xoá 1 trong các log đã tick (chỉ phát hiện sau khi tự reload, không có push) | Vì không có Realtime, tình huống này chỉ xảy ra nếu chính user đó reload giữa chừng — khi đó chế độ chọn tự reset (ephemeral UI state, không persist), không có state cũ để xung đột. |
| Xoá Space có chứa log | `logs[]` bị xoá theo Space, giống `tasks[]`/`notes[]`/`habits[]` hiện tại — không cần xử lý riêng. |
| Đổi Space khi đang mở modal xác nhận xoá log | Đóng modal theo hành vi chung hiện có của app khi đổi Space (không có xử lý đặc biệt thêm). |
| Log rất dài (paste nhiều đoạn text) | Không giới hạn cứng độ dài ở tầng dữ liệu (jsonb không giới hạn như Note); UI hiển thị clamp 2 dòng trong danh sách (không expand — khác Note có thể xem full trong modal). **Quyết định chốt (`uiux`, mục 5.1):** giữ clamp 2 dòng vĩnh viễn ở phase này, không làm modal/expand xem đầy đủ — nếu phát sinh nhu cầu thực tế (log rất dài xuất hiện thường xuyên), bổ sung sau, không chặn code hiện tại. |
| User tắt `enabledBlocks.logs` khi đang có log trong Space | Log không bị xoá, chỉ ẩn khỏi Dashboard/mobile — bật lại `enabledBlocks.logs` thấy lại đầy đủ (giống Task/Note/Habit hiện tại). |
| Data cũ trước khi có tính năng này (Space không có field `logs`) | `normalize.ts` fallback `logs: []`, `enabledBlocks.logs: true` (mặc định bật), `collapsedBlocks.logs: false` khi load — không lỗi/crash. |
| **(Đợt 2)** Nội dung `logs-compose` rỗng sau `trim()` | Không tạo, nút Gửi `disabled` — không hiện toast lỗi (nhất quán với validate rỗng ở mobile chat, hàng đầu bảng này). |
| **(Đợt 2)** Paste nội dung rất dài vào `logs-compose` | Input 1 dòng không giới hạn số ký tự nhập; nội dung dài hơn bề rộng ô cuộn ngang trong input theo hành vi mặc định trình duyệt (không wrap). Khi log được tạo và hiển thị trong list, vẫn áp dụng `line-clamp-2` như mọi log khác (mục 5.1) — không có ngoại lệ cho log tạo từ `logs-compose`. |
| **(Đợt 2)** Đang ở chế độ bulk-select mà vẫn gõ/gửi log mới qua `logs-compose` | Không xung đột — 2 luồng độc lập: `logs-compose` chỉ tạo log mới (không liên quan `selectedIds`), chế độ chọn nhiều chỉ thao tác trên log đã tồn tại. Log mới tạo xuất hiện trong list theo đúng vị trí sort, **chưa được tick chọn** (mặc định `unchecked`). |
| **(Đợt 2)** Khối bị ẩn nội dung qua icon mắt (`collapsed`) | Hàng `logs-compose` ẩn theo đúng cờ `collapsed` của `BlockShell` (giống `headerActions`, mục 5.1) — không cần xử lý riêng, tự động nhất quán. |

---

## 9. Schema định hướng (không phải thiết kế cuối)

Không tạo bảng Supabase mới — `logs[]` nằm trong cùng cột `spaces` (jsonb) của `kn_space_state` (Space cá nhân) hoặc `kn_shared_spaces` (Shared Space), đúng pattern hiện có của `tasks[]`/`notes[]`/`habits[]`.

```ts
interface LogEntry {
  id: string;
  content: string;       // nội dung log, bắt buộc không rỗng sau trim() — validate ở client, không validate ở DB
  createdBy?: string;    // userId — chỉ set trong Shared Space, giống Task/Note hiện tại
  createdAt: string;     // ISO timestamp — NGUỒN SỰ THẬT DUY NHẤT để sort, KHÔNG có updatedAt (bất biến, không sửa)
}

interface Space {
  // ...field hiện có (id, name, order, enabledBlocks, tasks, reminders, habits, notes, isShared?, sharedSpaceId?, _sharedVersion?)
  logs: LogEntry[]; // MỚI
}

interface EnabledBlocks {
  tasks: boolean;
  reminder: boolean;
  habits: boolean;
  notes: boolean;
  reminders: boolean;
  logs: boolean; // MỚI — thay cho `today` (đã xoá, xem docs/requirements.md mục 4.1 change impact)
}

interface CollapsedBlocks {
  tasks: boolean;
  reminder: boolean;
  habits: boolean;
  notes: boolean;
  reminders: boolean;
  logs: boolean; // MỚI — trạng thái icon mắt ẩn/hiện nội dung khối Nhật ký
}

type LayoutBlockKey =
  | 'tasks' | 'reminder' | 'habits' | 'notes' | 'reminders' | 'settings'
  | 'logs'; // MỚI, thay cho 'today' (đã xoá)
```

**Ephemeral UI state (không persist), tương tự `TaskFilter`/`NoteSortBy` đã có:**
```ts
type LogSortBy = 'newest' | 'oldest'; // mặc định 'newest'
// KHÔNG có state "loại đang chọn" trong MobileChatScreen — đã bỏ segmented picker cùng
// kiểu `ChatComposeMode` dự kiến trước đó. Loại nội dung được suy ra TỨC THỜI từ tiền tố
// của `text` mỗi lần submit (`/task ` → Task, `/note ` → Note, gõ trơn → Log), không lưu
// state riêng nào cho việc này.
// state input `logs-compose` (desktop, đợt 2) — cục bộ component, KHÔNG persist:
// composeValue: string (nội dung đang gõ, reset về '' sau khi gửi thành công)
// state bulk-select của khối Nhật ký — cục bộ component (giống pattern hiện có), KHÔNG persist:
// selectedIds: Set<string>, isSelecting: boolean
```

**RLS/quyền:** không cần policy mới — toàn bộ `Space` là 1 hàng jsonb (`kn_space_state.spaces` hoặc `kn_shared_spaces`), quyền kiểm soát ở cấp Space/hàng DB, không phải cấp item bên trong jsonb. Với Shared Space, mọi `member` (kể cả không phải tác giả) đọc/xoá được `logs[]`, giống hệt `tasks[]`/`notes[]` hiện tại — không cần RLS field-level cho `logs`.

**Export/Import JSON:** `logs[]` tự động đi theo trong `ExportPayload` vì nằm trong `Space` — không cần đổi `schemaVersion`. Import file cũ (thiếu `logs`) fallback về `[]` qua `normalize.ts`, giống cách các field mới trước đây (`content` trên Task, `createdBy`/`createdAt` trên Task/Note) đã được thêm dần mà không cần bump schema version.

**Không có bảng/cột Supabase mới** — điểm khác biệt duy nhất so với Task/Note là **thiếu field `updatedAt`/`order`** (vì bất biến, không sửa, không sắp xếp thủ công).

---

## 10. Câu hỏi mở / cần xác nhận thêm

Không còn câu hỏi nào **chặn** việc bắt đầu code. 1 điểm từng để mở đã được `ba` tự chọn default hợp lý (ghi rõ trong tài liệu, có thể đổi sau nếu thực tế dùng cho thấy cần); điểm còn lại (nút thêm log trên desktop) đã được triển khai ở **đợt 2** (mục 6.3), không còn là default để ngỏ nữa:

- **Đã chọn default — mục 6.5:** tăng giới hạn hiển thị `MobileChatScreen` từ 50 lên 75 tổng (thêm `logs.slice(0, 30)`).

Các điểm sau là quyết định **implementation** của `dev`, không cần chủ dự án duyệt lại trước khi code:
- Tên chính xác của `LayoutBlockKey` mới (tài liệu dùng `'logs'` làm ví dụ).
- Hex chính xác cuối cùng của token `--log-color` nếu `dev` thấy `#8a8f98` (đề xuất ở mục 5.1) chưa đủ tương phản trong thực tế trên nền `--raised` — hướng màu (neutral slate) đã chốt, chỉ hex là có thể tinh chỉnh.
- Tên chính xác của action tạo log qua `logs-compose` (tài liệu dùng `LOG_CREATE` làm ví dụ ở mục 6.3) — dùng lại reducer/action tạo log đã có cho `MobileChatScreen` nếu trùng logic, không cần action riêng nếu không cần thiết.

**Đã chốt bởi `uiux` trong đợt hoàn thiện tài liệu 2026-07-07 (không còn để ngỏ):**
- Icon: `ScrollText` (không dùng `History`) — dùng thống nhất cho icon-chip khối và bubble chat (không còn segmented control nên không cần icon riêng cho control chọn loại).
- Vị trí/hành vi nút xoá từng dòng: hover-reveal trên desktop, luôn hiện trên mobile (tái dùng đúng pattern đã audit ở `TaskRow`/`NoteCard`) — xem mục 5.1.
- Không làm modal/expand xem đủ nội dung log dài — giữ clamp 2 dòng vĩnh viễn ở phase này (xem Edge Cases mục 8, và mục 5.1).
- Toàn bộ chi tiết toolbar/định dạng dòng/cơ chế tiền tố ô nhập/chế độ chọn nhiều/empty-loading-error/accessibility/responsive/theme: xem mục 5 (đã viết lại đầy đủ, sẵn sàng để `dev` triển khai thẳng).

**Đã chốt bởi `uiux` trong đợt 2 (2026-07-08, không còn để ngỏ):**
- Hàng nhập inline `logs-compose` trên desktop: luôn hiển thị (không phải modal/toggle), style/cấu trúc tái dùng y hệt `.notes-toolbar` của `NotesBlock`, chỉ hiện desktop (`max-sm:hidden`) — xem mục 6.3, 5.1, 5.6, 5.7, 5.8, 8.
