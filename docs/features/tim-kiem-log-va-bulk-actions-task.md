# Tính năng: Tìm kiếm trong Nhật ký nhanh + Hành động hàng loạt cho Việc cần làm

> 2 cải tiến nhỏ, độ khó thấp, gộp làm 1 đợt theo yêu cầu — đều là copy-pattern từ tính năng đã có trong
> chính dự án (không phát minh UI mới). Cập nhật: 2026-07-10.
>
> **Cập nhật 2026-07-10 (sau QC + phản hồi dùng thử thật):** vị trí/kích thước ô search ở PHẦN A đã đổi
> so với bản mô tả ban đầu — xem lý do + phương án đã chốt ở mục A.5.

## 0. Vì sao gộp 2 việc khác nhau vào 1 file

A3 (tìm kiếm Log) và A5 (bulk actions cho Task) không liên quan nhau về nghiệp vụ, nhưng có chung đặc
điểm: mỗi cái chỉ là áp dụng lại 1 pattern UI **đã tồn tại đâu đó trong chính app** sang 1 khối khác — A3
mirror ô tìm kiếm của Ghi chú (`NotesBlock`) sang Nhật ký nhanh; A5 mirror chế độ "Chọn" + xoá hàng loạt
của Nhật ký nhanh (`LogsBlock`) sang Việc cần làm. Gộp 1 file để tránh 2 file tài liệu quá mỏng cho 2 việc
nhỏ, độc lập triển khai (có thể làm A hoặc B trước, không phụ thuộc nhau).

---

# PHẦN A — Tìm kiếm trong Nhật ký nhanh

## A.1 Tổng quan

### Pain point

Sau khi Nhật ký nhanh trở thành nơi log chi tiêu hàng ngày (`docs/features/quan-ly-chi-tieu.md`), số
lượng log tăng nhanh theo thời gian. Muốn tìm lại 1 khoản chi cụ thể theo từ khoá (vd "thuốc", "grab")
hiện phải cuộn tay qua toàn bộ danh sách hoặc gián tiếp qua bảng "Theo hạng mục"/"Theo ngày" ở chế độ
Tổng hợp — không có cách tìm trực tiếp theo nội dung. Ghi chú đã có ô tìm kiếm từ trước; Nhật ký nhanh thì
chưa, dù nhu cầu tìm kiếm ở đây cấp thiết hơn (dữ liệu tăng nhanh hơn, không có tiêu đề ngắn gọn như Note
để "liếc" nhanh khi cuộn).

### Quyết định thiết kế quan trọng nhất: state cục bộ trong `LogsBlock`, KHÔNG theo pattern global `UiState` của Ghi chú

Đã đọc code cả 2 nơi trước khi quyết:
- `NotesBlock.tsx`: `noteSearch`/`noteSortBy` sống trong `state.ui` (global, qua reducer
  `NOTE_SET_SEARCH`), reset tập trung qua `resetEphemeralUi()` khi `SPACE_SWITCH`/`IMPORT_DATA`.
- `LogsBlock.tsx`: `sortBy`/`isSelecting`/`viewMode`/`editingDateId` đều là `useState` **cục bộ trong
  chính component**, tự reset bằng pattern "so sánh `space.id` ngay trong thân render" (đoạn
  `spaceIdRef`) — không hề đụng `state.ui`/reducer nào.

→ **Chọn theo pattern của `LogsBlock` (cục bộ), không theo pattern của `NotesBlock` (global)** — vì
`logSearch` sẽ nằm chung file, chung logic reset với `sortBy`/`isSelecting`/`viewMode` đã có sẵn ngay đó;
trộn 1 field theo global `UiState` trong khi 4 field khác cùng bản chất lại theo local state sẽ tạo ra
sự **không nhất quán ngay trong 1 file duy nhất** — tệ hơn nhiều so với việc không đồng nhất tuyệt đối với
`NotesBlock` (khác file, có lịch sử phát triển riêng, chấp nhận được). Đây đúng tinh thần "không copy
nguyên pattern cũ mà không cân nhắc bối cảnh cụ thể".

## A.2 User Stories

- Là người dùng, tôi muốn gõ 1 từ khoá để lọc nhanh các log có nội dung khớp, không phải cuộn tay qua
  toàn bộ Nhật ký nhanh.
- Là người dùng, tôi muốn hiểu rõ vì sao tìm kiếm không áp dụng khi đang ở chế độ "Tổng hợp" (nếu quyết
  định không làm ở đó).

## A.3 Luồng chi tiết

1. Chế độ "Danh sách" (không phải "Tổng hợp") của `LogsBlock` có thêm 1 ô input tìm kiếm, đặt **chung 1
   hàng với segmented control `[Danh sách|Tổng hợp]` và nút gear "Tuỳ chọn"** (căn phải, cạnh trước nút
   gear) — KHÔNG còn là 1 hàng riêng full-width phía trên `logs-compose` như bản mô tả gốc. Xem lý do đổi
   + chi tiết kích thước/style ở mục A.5.
2. Gõ vào ô → lọc `list` (đã sort theo `sortBy`) theo `content.toLowerCase().includes(query.toLowerCase())`
   — client-side thuần, không cần xử lý bỏ dấu tiếng Việt phức tạp (khác bộ parse chi tiêu) vì đây chỉ là
   lọc substring đơn giản.
3. Ô search **rỗng** → hiện toàn bộ danh sách như hiện tại (không đổi hành vi mặc định).
4. Đổi Space → tự reset về rỗng (mirror hành vi `spaceIdRef` reset đã có).
5. Chuyển sang "Tổng hợp" → ô search + toàn bộ list ẩn (đã là hành vi hiện tại của `viewMode ===
   'summary'`, không cần xử lý thêm — search chỉ có ý nghĩa ở "Danh sách").

## A.4 Permission

Không có gì đặc biệt — lọc client-side thuần trên dữ liệu đã tải, không phân biệt Owner/Member.

## A.5 UX/UI

### Đổi vị trí/kích thước sau QC + phản hồi dùng thử thật (2026-07-10) — ĐÃ CHỐT

Bản triển khai đầu tiên (dev đã code) đặt ô search thành **1 hàng riêng, full-width**, nằm ngay phía trên
`logs-compose` — cùng `border-radius`, cùng `border`/`bg-[var(--raised)]`, cùng chiều cao (~33.5px đo
thật bằng `getBoundingClientRect()`) với ô soạn log bên dưới. User xem thực tế phản hồi: "nhìn 2 ô input
kỳ quá" — 2 ô giống hệt nhau về thị giác, xếp sát nhau, không phân biệt được đâu là ô phụ (tìm kiếm, dùng
không thường xuyên) và đâu là ô chính (soạn log mới, hành động chính của khối). QC xác nhận đúng bằng
Playwright: `NotesBlock` không gặp vấn đề tương tự vì ô search của Note dùng chung 1 hàng compact với
dropdown sắp xếp, không đứng full-width riêng cạnh 1 ô nhập full-width khác.

**Đã dựng thử 2 phương án bằng code demo tạm (revert sau khi chụp), chọn theo phương án A:**

| Phương án | Mô tả | Vì sao không chọn / chọn |
|---|---|---|
| A — **[Chốt]** Gộp vào hàng segmented+gear, thu nhỏ | Xem chi tiết bên dưới | Tạo phân cấp rõ (kích thước, viền, vị trí) mà vẫn giữ viền thật (không phạm nguyên tắc "Input Affordance" — ô nhập phải trông rõ là bấm được); đồng thời tiết kiệm hẳn 1 hàng chiều cao dọc |
| B — Giữ hàng riêng, làm ô "ma" (bỏ viền mặc định, chữ `text-dim`, chỉ hiện viền khi hover/focus) | — | Loại: ở trạng thái nghỉ trông giống chữ tĩnh chứ không giống ô nhập được (rõ nhất ở dark mode — gần như biến mất), giảm khả năng người dùng nhận ra đây là control bấm được; vẫn tốn nguyên 1 hàng, không tiết kiệm chiều cao như A |

### Vị trí & kích thước (Phương án A — bắt buộc theo đúng mô tả này khi code)

- Ô search nằm **trong cùng hàng** với segmented control `[Danh sách|Tổng hợp]` (hàng vốn đã có sẵn, cùng
  hàng với nút gear "Tuỳ chọn Nhật ký nhanh") — không còn hàng riêng, không còn nằm trên `logs-compose`.
  Thứ tự trái→phải trong hàng: segmented control → (khoảng trống co giãn) → ô search → nút gear.
- Chỉ hiện ô search khi `viewMode === 'list'` (ẩn hoàn toàn ở "Tổng hợp", giữ đúng hành vi mục A.3.5).
- Kích thước: **132px chiều rộng ở trạng thái nghỉ, mở rộng ra 176px khi focus** (transition
  `border-color, background-color, width`, dùng `--ease-standard`), chiều cao input ~26px (`py-1`, nhỏ
  hơn hẳn `py-1.5` của ô compose) — cố ý nhỏ hơn ô compose để đúng tinh thần "phụ nhỏ hơn chính".
- Style: `rounded-md` (bo góc nhỏ hơn `rounded-lg` của compose), `border-[color:var(--border-hairline)]`
  (viền nhạt hơn `--border` của compose), `bg-transparent` ở trạng thái nghỉ → đổi sang
  `bg-[var(--raised)]` + `border-[color:var(--border)]` khi hover, → `border-[color:var(--accent)]` +
  `bg-[var(--raised)]` khi focus. **Không bỏ viền hoàn toàn** (khác phương án B đã loại) — viền hairline
  vẫn phải hiện thường trực để giữ affordance "đây là ô nhập được".
- Icon `Search` giảm còn **12px** (nhỏ hơn 14px cũ, tương xứng kích thước ô đã thu nhỏ).
- Placeholder rút gọn còn: **`"Tìm nhật ký..."`** (thay vì `"Tìm trong nhật ký..."` — bản cũ bị cắt chữ
  khi hiển thị trong ô 132px, đã verify bằng screenshot thật).
- `aria-label="Tìm kiếm nội dung log"` (không đổi).

### Hành vi thu hẹp khối (`flex-wrap`) — đã test, dev implement đúng theo mô tả, không cần tự đoán lại

Hàng chứa segmented + search + gear dùng `flex flex-wrap items-center justify-between gap-2` (mirror
đúng cách `notes-toolbar` của `NotesBlock` đã dùng `flex-wrap` cho hàng công cụ của nó). Đã test thật bằng
Playwright ở độ rộng khối 260px (giả lập kéo splitter hẹp hết cỡ): ô search tự động **xuống dòng thứ 2**,
căn phải, không tràn/vỡ layout, không đè lên segmented control hay nút gear. Không cần thêm `min-width`
hay breakpoint riêng cho khối này — `flex-wrap` xử lý đủ.

- **Empty state khi không khớp kết quả**: text nhỏ `text-dim`, italic — `"Không tìm thấy log phù hợp"`
  (đúng convention đã dùng ở Tổng hợp mục "Chưa có dữ liệu", `quan-ly-chi-tieu.md` mục 5.2) — không đổi.
- Không có loading/error state (thuần client-side, không request) — không đổi.
- Responsive: không cần xử lý riêng mobile (khối chỉ render trên desktop qua `AppLayout`, xem
  `docs/requirements.md` mục 4).
- Theme: đã test cả sáng/tối bằng Playwright — dùng token `--raised`/`--border`/`--border-hairline`/
  `--accent`/`--text-dim` sẵn có, không cần token mới.

## A.6 Out of Scope

- Tìm kiếm xuyên `expenseDate`/`categoryOverride` (chỉ tìm theo `content`) — đủ dùng, tránh phức tạp hoá
  cho 1 ô search đơn giản.
- Tìm kiếm ở chế độ "Tổng hợp" — không có ý nghĩa (đó là bảng số liệu tổng hợp, không phải danh sách item
  để "tìm 1 dòng").
- Highlight từ khoá khớp trong kết quả (bôi đậm) — nice-to-have, không cấp thiết, để sau nếu có phản hồi
  cần.

## A.7 Edge Cases

| Case | Hành vi mong đợi |
|---|---|
| Đang gõ tìm kiếm, đồng thời bật chế độ "Chọn" (bulk-select) | Cả 2 hoạt động song song bình thường — chọn hàng loạt áp dụng trên danh sách **đã lọc** hiển thị (không phải toàn bộ log chưa lọc) — đúng trực giác "thấy gì thì chọn được cái đó". |
| Log có `excluded: true` (đã loại khỏi chi tiêu) | Vẫn hiện trong kết quả tìm kiếm ở "Danh sách" — search không lọc theo `excluded`, chỉ theo `content` (không đổi ý nghĩa "Danh sách" hiện tại vốn hiện mọi log). |

## A.8 Schema định hướng

Không đổi schema/DB — chỉ thêm 1 `useState<string>('')` cục bộ trong `LogsBlock.tsx`, không persist.

---

# PHẦN B — Hành động hàng loạt (bulk actions) cho Việc cần làm

## B.1 Tổng quan

### Pain point

`LogsBlock` đã có chế độ "Chọn" (icon `ListChecks` + text "Chọn") cho phép tick nhiều log rồi xoá hàng
loạt qua 1 modal xác nhận. `TasksBlock` không có gì tương tự — filter "Đã xong" tích luỹ theo thời gian
(task đã hoàn thành từ nhiều tháng trước vẫn nằm nguyên trong danh sách trừ khi xoá tay từng dòng), không
có cách dọn dẹp hàng loạt.

## B.2 User Stories

- Là người dùng có nhiều task đã xong tích luỹ lâu ngày, tôi muốn chọn nhiều task cùng lúc rồi xoá 1 lần,
  thay vì xoá từng dòng.
- Là người dùng, tôi muốn chắc chắn không xoá nhầm khi thao tác hàng loạt (mức độ rủi ro cao hơn xoá 1
  task, vì Task có thể chứa `content` chi tiết).

## B.3 Luồng chi tiết

1. Header `TasksBlock` (cạnh cụm filter Tất cả/Chưa xong/Đã xong hiện có) thêm nút "Chọn" (icon
   `ListChecks`, class `add-link`) — **mirror y hệt vị trí/style/hành vi** nút "Chọn" đã có trong
   `LogsBlock`, chỉ đổi ngữ cảnh từ Log sang Task.
2. Bấm "Chọn" → vào chế độ chọn: mỗi `TaskRow` hiện checkbox tuỳ biến ở đầu dòng (thêm mới, phân biệt rõ
   với checkbox done hiện có — xem mục B.5), header đổi thành `"Đã chọn N"` + nút "Huỷ" + nút "Xoá (N)" —
   đúng bố cục `LogsBlock` đã có.
3. Bấm "Xoá (N)" → modal xác nhận tuỳ biến (không `window.confirm`) → dispatch `TASK_DELETE_MANY` (action
   mới, mirror `LOG_DELETE_MANY`) → thoát chế độ chọn.
4. Đổi Space / đổi filter (Tất cả↔Chưa xong↔Đã xong) → tự thoát chế độ chọn, reset `selectedIds` — mirror
   cách `LogsBlock` reset theo `spaceIdRef`, thêm điều kiện reset theo đổi filter (Log không có filter
   tương đương nên đây là điểm mới, không copy nguyên xi được).

## B.4 Permission

Giống Log — mọi Member Shared Space xoá được task của nhau (đúng mô hình CRUD ngang quyền hiện tại của
Task, không đổi).

## B.5 UX/UI

### Nội dung modal xác nhận — ĐÃ CHỐT (2026-07-10, chủ dự án): phương án (a)

`LogsBlock` dùng message xoá hàng loạt khá nhẹ: `"Xoá N log đã chọn? Không thể hoàn tác."`. Task khác Log
ở 1 điểm quan trọng: Task có thể chứa `content` (ghi chú chi tiết, textarea) — xoá nhầm 1 lúc N task có
`content` dài mất mát nhiều hơn xoá N dòng log 1 câu ngắn. Đã cân nhắc 2 phương án:

| Phương án | Nội dung | Đánh đổi |
|---|---|---|
| **(a) [Chốt]** Đồng nhất với Log | `"Xoá N việc đã chọn? Không thể hoàn tác."` | Nhất quán tuyệt đối với pattern đã có, không cảnh báo thêm về khả năng mất `content` chi tiết |
| (b) Cảnh báo thêm nếu có task chứa `content` trong nhóm đã chọn | `"Xoá N việc đã chọn (M việc có ghi chú chi tiết)? Không thể hoàn tác."` | An toàn hơn, đúng mức độ rủi ro thật, nhưng phức tạp hơn 1 chút (phải đếm M) và phá vỡ tính đồng nhất với message của Log |

**Quyết định: (a)** — dùng nguyên message `"Xoá N việc đã chọn? Không thể hoàn tác."`, không đếm/cảnh báo
riêng số task có `content`. Không còn câu hỏi mở nào chặn phần B.

### Vị trí checkbox chọn vs checkbox done — cần `uiux` quyết lúc code

Không chốt bố trí pixel-level trong tài liệu này (để `dev`/`uiux` tự tinh chỉnh khi có ngữ cảnh trực
quan) — chỉ nêu ràng buộc bắt buộc: 2 checkbox (done, chọn-để-xoá) phải **phân biệt rõ về vị trí hoặc
icon**, không dùng chung 1 ô, tránh nhầm "tick xong việc" thành "tick để xoá".

### Accessibility

- Checkbox chọn: `role="checkbox"`, `aria-checked`, `aria-label` (vd `"Chọn việc: {tên task}"`) — đúng
  convention checkbox tuỳ biến toàn app.
- Nút "Xoá (N)": `aria-label` động theo N, `disabled`/`aria-disabled` khi N=0 — mirror y hệt `LogsBlock`.

### Responsive & Theme

Không có gì đặc biệt ngoài mirror `LogsBlock` — khối Task hiện diện trên cả desktop lẫn cả 2 tab mobile,
chế độ chọn cần test cả 2 kích thước (đặc biệt mobile, nơi 1 dòng đã khá chật với checkbox done + avatar +
chip ngày-giờ + chip assignee, thêm 1 checkbox nữa cần verify không tràn dòng).

## B.6 Out of Scope

- "Chọn tất cả" (khác Log, vốn cũng không có "Chọn tất cả" — nhất quán, xem `nhat-ky-nhanh.md` mục 5).
- Bulk tick-done (chỉ bulk-delete ở đợt này) — nếu có nhu cầu thực tế phát sinh, làm đợt sau.
- Bulk-move sang Space khác — đã nêu ở ý tưởng A6 trong brainstorm gốc, có rủi ro kỹ thuật atomic thật
  (2 hàng DB độc lập không có transaction chung), chưa đủ điều kiện làm chung đợt này.

## B.7 Edge Cases

| Case | Hành vi mong đợi |
|---|---|
| Đang ở filter "Đã xong", bulk-select rồi đổi sang filter "Tất cả" giữa chừng | Tự thoát chế độ chọn (mục B.3.4) — không giữ `selectedIds` qua lại giữa 2 filter khác nhóm hiển thị, tránh xoá nhầm task không còn nhìn thấy trên màn. |
| Tất cả task trong Space đều bị chọn rồi xoá hết | Danh sách rỗng → hiện `EmptyState` đã có sẵn của `TasksBlock`, không lỗi. |
| Bulk-delete task đang có `content` dài | Xem mục B.5 (câu hỏi mở #1) — xử lý theo phương án được chọn. |

## B.8 Schema định hướng

Action reducer mới, mirror `LOG_DELETE_MANY`:
```ts
| { type: 'TASK_DELETE_MANY'; payload: { ids: string[] } }
```
Không đổi `Task` type, không đổi RLS/schema Supabase — thuần xoá nhiều phần tử khỏi mảng `tasks[]` trong 1
lần dispatch (giảm số lần re-render/dispatch so với gọi `TASK_DELETE` N lần liên tiếp).

---

## Câu hỏi mở chung (cả Phần A + B)

> **Cập nhật 2026-07-10:** câu hỏi về message modal xác nhận bulk-delete Task đã CHỐT phương án (a) —
> xem mục B.5. 2 câu còn lại dưới đây vẫn mở, không chặn bắt đầu code.

1. **[B]** Vị trí/hình thức checkbox "chọn để xoá" trên `TaskRow` (mobile lẫn desktop) — để `uiux`/`dev`
   tự tinh chỉnh khi có bản demo trực quan, không chốt trước.
2. **[A]** Việc cần làm cũng đang thiếu tìm kiếm riêng (đã nêu ở ý tưởng A6 khi brainstorm) — có làm luôn
   trong đợt này không, hay chỉ Log trước? Đề xuất: chỉ Log trước (đúng phạm vi đã chốt cho A3), tìm kiếm
   Task để dành cho tính năng "Tìm kiếm toàn cục" (B1, xem `docs/features/tim-kiem-toan-cuc.md`) xử lý
   luôn ở phạm vi rộng hơn — tránh làm 2 lần (ô search riêng theo khối, rồi lại tìm kiếm toàn cục) nếu B1
   sớm được triển khai.
