# Tính năng: Quản lý/phân loại/tổng hợp chi tiêu (mở rộng Nhật ký nhanh)

> Quyết định đã chốt qua trao đổi trực tiếp giữa chủ dự án và `ba` (bao gồm demo Artifact tương tác, nhiều vòng chỉnh sửa UX) — tài liệu này ghi lại chính thức để giao `dev` triển khai. Không còn câu hỏi mở nào **chặn** việc bắt đầu code (xem mục 10).

---

## 1. Tổng quan

**Root cause:** khối "Nhật ký nhanh" (`docs/features/nhat-ky-nhanh.md`) đang được dùng thực tế để log chi tiêu hàng ngày (Space "Chi tiêu gia đình Kino" — log kiểu "Anh ăn cơm trưa 57k", "Đóng tiền điện 1.250.143"...), nhưng `LogEntry` chỉ có `content: string` tự do — không tổng hợp/phân loại được.

**Giải pháp:** mở rộng ngay khối `LogsBlock` hiện có bằng 1 toggle **"Danh sách" / "Tổng hợp"** — KHÔNG tách web riêng, KHÔNG đăng ký khối mới vào hệ layout tự do 7-phần-tử, KHÔNG cần DDL Supabase mới (chỉ thêm field trong phần tử jsonb `logs[]`, đúng cách `createdBy`/`createdAt` đã được thêm dần trước đây). Việc phân tích lựa chọn giữa "tool nhỏ tích hợp" và "tách web riêng" đã được `ba` làm rõ — chọn tích hợp vì đơn giản, tận dụng hạ tầng sẵn có, đủ cho quy mô cá nhân/gia đình hiện tại.

**Nguyên tắc bất biến của Log giữ nguyên** (`nhat-ky-nhanh.md` mục 6.1): `content`, `createdAt`, `createdBy` KHÔNG sửa được sau khi tạo. Tính năng này **không phá nguyên tắc đó** — chỉ mở đúng 1 khe hẹp: thêm 3 field mới (`expenseDate`, `categoryOverride`, `excluded`) sửa được, tách bạch hoàn toàn khỏi `content` gốc.

---

## 2. User Stories

### Actor: mọi user (cá nhân hoặc member Shared Space)

- Là user, tôi muốn xem tổng chi tiêu theo ngày/tuần/tháng và theo hạng mục mà không phải tự cộng tay từ danh sách log.
- Là user, tôi muốn hệ thống tự nhận diện số tiền + hạng mục từ nội dung log tôi đã gõ, không phải nhập lại theo form riêng.
- Là user, tôi muốn biết log nào hệ thống không nhận diện được số tiền, để không nhầm tưởng tổng đã đầy đủ.
- Là user, tôi muốn sửa lại hạng mục nếu máy đoán sai, mà không phải xoá log rồi gõ lại content.
- Là user, tôi muốn loại 1 log ra khỏi Tổng hợp nếu nó không thực sự là 1 khoản chi (dù có parse ra số tiền), và xem lại/hoàn tác các log đã loại.
- Là user, tôi muốn sửa lại ngày giao dịch nếu tôi log bù (vd quên ghi hôm qua, hôm nay ghi bù và chỉnh lại đúng ngày) — tách biệt với ngày tôi thực sự gõ log.

### Actor: Member Shared Space

- Là Member, tôi muốn xem được tổng hợp chi tiêu chung, kể cả breakdown theo từng thành viên.
- Là Member, tôi muốn chỉ sửa được ngày/hạng mục/loại-bỏ trên log của chính mình — không lo người khác âm thầm đổi dữ liệu log của tôi.
- Là Member, tôi vẫn xoá được log của người khác (giữ nguyên hành vi hiện tại của Nhật ký nhanh, xem mục 4).

---

## 3. Luồng chi tiết

### 3.1 Nhập liệu — không đổi

Vẫn gõ 1 dòng tự do như hiện tại (`logs-compose` desktop / `MobileChatScreen` mobile). Không thêm form nhập số tiền/hạng mục riêng.

### 3.2 Toggle "Danh sách" / "Tổng hợp" trong `LogsBlock`

- Thêm 1 hàng segmented-control 2 nút ngay dưới `.block-head`, trên `logs-compose`/list — state `viewMode: 'list' | 'summary'` cục bộ component, ephemeral (không persist), mặc định `'list'`.
- Khi `summary`: ẩn list + `logs-compose`, hiện panel Tổng hợp.

### 3.3 Panel Tổng hợp — bố cục (đã chốt qua nhiều vòng chỉnh UX, xem chi tiết mục 5)

Xếp dọc theo thứ tự:
1. Pills chọn khoảng thời gian: **"7 ngày qua"** / **"Tháng này"** (mặc định "Tháng này").
2. 3 stat tile: **Tổng chi**, **Giao dịch**, **Chưa xác định** (đếm log không parse được số tiền trong khoảng đang chọn).
3. Bảng **"Theo hạng mục"** — mỗi dòng bấm được để mở chi tiết (xem 3.4).
4. Bảng **"Theo ngày"**.
5. Bảng **"Theo người ghi"** (chỉ có ý nghĩa khi Shared Space — Space cá nhân chỉ có 1 dòng "Bạn").
6. Khối **"Log chưa xác định được số tiền"** — liệt kê log trong khoảng đang chọn không parse được số tiền.
7. Khối **"Đã loại khỏi chi tiêu"** — liệt kê log đã bị đánh dấu `excluded`, mỗi dòng có nút **"Hoàn tác"**.

**Tính theo `expenseDate`** (không phải `createdAt`) cho mọi phân nhóm/lọc khoảng thời gian — vì đây là ngày giao dịch thực tế, xem mục 6.1.

### 3.4 Chi tiết hạng mục (drill-down)

Bấm 1 dòng trong bảng "Theo hạng mục" → mở panel chi tiết ngay dưới bảng, liệt kê các log thuộc hạng mục đó (đã tính `categoryOverride` nếu có) trong khoảng thời gian đang chọn.

**Layout mỗi dòng — lưới 3 cột cố định, áp dụng như nhau cho MỌI dòng** (quyết định UX quan trọng — tránh lệch cột khi dòng có/không có badge tác giả):

```
[ meta (ngày [+ tên tác giả nếu không phải mình]) / nội dung ]   [ số tiền ]   [ control hạng mục, rộng cố định ]
```

- Cột 1 (flex): dòng meta nhỏ phía trên (ngày, + tên tác giả màu theo member nếu không phải log của mình) — dòng nội dung log bên dưới.
- Cột 2: số tiền, `tabular-nums`, căn phải.
- Cột 3 (rộng cố định, vd 148px):
  - **Log của mình:** 1 dropdown **gộp chung** — options là danh sách hạng mục + 1 option cuối **"— Không tính là chi tiêu —"**. Chọn hạng mục → cập nhật `categoryOverride`; chọn "Không tính là chi tiêu" → set `excluded = true`. Đây là **1 control duy nhất** thay vì 2 control tách rời (dropdown + nút riêng) — quyết định sau khi tra cứu pattern UX (`overflow-menu`: gộp action khi chật chỗ thay vì xếp cạnh nhau).
  - **Log của người khác:** pill chỉ đọc (tên hạng mục hiện tại + icon khoá), `title`/tooltip: `"Chỉ {tên} mới sửa được log này"`. Cùng bề rộng cố định với dropdown để cột luôn thẳng hàng.

Log có `excluded = true` hiển thị dòng mờ (opacity thấp) + gạch ngang nội dung.

---

## 4. Permission Model

| Hành động | Log của chính mình | Log do người khác tạo (Shared Space) |
|---|---|---|
| Xem trong Tổng hợp (số tiền/hạng mục) | Được | Được (chỉ xem) |
| Sửa ngày giao dịch (`expenseDate`) | Được | **Không** |
| Sửa hạng mục (`categoryOverride`) | Được | **Không** |
| Loại khỏi chi tiêu (`excluded`) | Được | **Không** |
| Xoá log | Được | Được — **giữ nguyên hành vi hiện tại**, xem lý do bên dưới |

**Vì sao xoá vẫn mở cho tất cả, nhưng sửa (ngày/hạng mục/loại-bỏ) thì không** (quyết định đã bàn kỹ với chủ dự án):
- Xoá là hành động **hiển nhiên, có xác nhận qua modal, item biến mất rõ ràng** — dễ phát hiện nếu sai, rủi ro thấp hơn tưởng tượng.
- Sửa 3 field mới là thay đổi **âm thầm** — item vẫn còn đó, nhìn tưởng vẫn đúng nhưng dữ liệu đã khác, dễ gây mất niềm tin giữa các thành viên hơn nhiều so với xoá.
- Đổi quyền xoá là đổi 1 quyết định đã "chốt" cho **toàn bộ** Nhật ký nhanh (ảnh hưởng cả log không phải chi tiêu) — phạm vi rộng hơn cần thiết. 3 field mới là năng lực hoàn toàn mới, tự do chọn quy tắc chặt ngay từ đầu không cần đổi ngược gì.
- Không dựng permission-toggle theo Space ở bản này (over-engineering cho quy mô hiện tại) — nếu Shared Space mở rộng ra nhiều người/ít tin cậy hơn trong tương lai, đây là điểm cần xem lại (ghi chú, không xây trước).

**Không có soft-delete/undo cho hành động xoá** (đã xác nhận: `LOG_DELETE` hard-delete, giống Task/Note toàn app) — chủ dự án đã đồng ý giữ nguyên, không làm thêm cơ chế khôi phục.

---

## 5. UX/UI

### 5.1 Danh sách — hiển thị + sửa ngày giao dịch

Mỗi dòng log:
```
[giờ tạo hoặc "ngày·giờ" nếu đã backdate]  [nội dung]  [badge tên tác giả nếu Shared Space & không phải mình]  [cụm action]
```
- Chip giờ: mặc định chỉ hiện giờ tạo (`createdAt`). Nếu `expenseDate` khác ngày của `createdAt` (đã bị sửa), chip đổi thành `"{ngày expenseDate} · {giờ tạo}"`, màu vàng (amber), để biết ngay log này đã backdate mà không cần thêm 1 phần tử riêng trong dòng.
- Cụm action (bút sửa ngày + icon xoá) gộp chung 1 chỗ cuối dòng, **ẩn mặc định, hiện khi hover** (desktop) / luôn hiện (chạm, theo đúng pattern hover-reveal đã audit sẵn cho `TaskRow`/`NoteCard`). Nút bút sửa ngày **chỉ hiện nếu log là của chính mình** (`createdBy` trống hoặc `=== userId` hiện tại).
- Bấm bút sửa ngày → thay bằng `<input type="date">` + nút xác nhận (✓) + nút huỷ (✕) ngay tại chỗ — không dùng modal. Xác nhận mới ghi `expenseDate`.

### 5.2 Empty/Loading/Error state

Không có state loading/error riêng — Tổng hợp tính hoàn toàn từ `space.logs` đã có sẵn trong bộ nhớ (giống cách `LogsBlock` hiện tại không có fetch riêng, xem `nhat-ky-nhanh.md` mục 5.5). Nếu khoảng thời gian đang chọn không có log nào → 3 stat tile hiện `0`/`0đ`, 3 bảng hiện rỗng (dùng text nhỏ "Chưa có dữ liệu" thay vì để trống hoàn toàn).

### 5.3 Accessibility

- Dropdown hạng mục + input date: có `aria-label` mô tả rõ hành động (không dựa placeholder).
- Pill chỉ-đọc cho log người khác: không chỉ dựa màu — có icon khoá + text tooltip giải thích lý do (không dùng màu làm chỉ báo duy nhất).
- Nút bút sửa ngày / xoá: `aria-label` rõ ràng, touch target theo chuẩn `.icon-btn` hiện có.

### 5.4 Responsive

Ở bản đầu, panel Tổng hợp chỉ cần hoạt động tốt trên desktop (nơi `LogsBlock` hiển thị đầy đủ). Trên mobile, khối Nhật ký nhanh nằm trong accordion tab "Chi tiết" — toggle Danh sách/Tổng hợp áp dụng y hệt, chỉ chỉnh padding/cỡ chữ theo breakpoint `max-sm` sẵn có, không cần thiết kế riêng.

### 5.5 Light/Dark theme

Dùng toàn bộ token màu hệ thống sẵn có (`--accent`, `--raised`, `--border`, `--text-dim`, `--amber` dùng cho log-color/warn tile, `--reminder-color` không dùng ở đây tránh nhầm với hành động xoá/nguy hiểm). Không cần token mới.

---

## 6. Behavior đặc biệt

### 6.1 Parse số tiền — quy tắc chính xác (đã verify bằng test thật, xem `docs/features/quan-ly-chi-tieu-demo.html` để đối chiếu hành vi)

Thử theo thứ tự ưu tiên, dừng ở rule đầu tiên khớp:

1. **"Xtr" / "XtrY"** (Y là đúng 1 chữ số): `(\d+)tr(\d)?` với ràng buộc không có chữ số ngay trước, không có 1 chữ số nữa hoặc chữ cái ngay sau → `X * 1_000_000 + (Y ?? 0) * 100_000`.
2. **"Xk"**: `(\d+(?:[.,]\d+)?)k` không có chữ cái/chữ số ngay trước/sau → `X * 1_000` (làm tròn).
3. **Số nguyên nhóm 3 chữ số cách nhau dấu chấm** (vd `830.330`, `1.250.143`): giữ nguyên giá trị sau khi bỏ dấu chấm.
4. Không khớp rule nào → `amount = null` (không parse), log vẫn được lưu bình thường, chỉ không tính vào Tổng hợp.

**Bắt buộc dùng Unicode-safe boundary (`\p{L}` với flag `/u`), KHÔNG dùng `\b` mặc định của JS regex** — `\b` không coi ký tự có dấu tiếng Việt (ư, ơ, ộ...) là word-char, dẫn tới match sai kiểu `"hẹn 13 trưa"` bị nhận nhầm 13.000.000đ nếu implement ngây thơ.

**Case cố tình KHÔNG parse (an toàn hơn đoán sai):**
- `"1tr20"`, `"10tr50"` (≥2 chữ số ngay sau "tr") — nhập nhằng thật (có thể hiểu "20 nghìn" hoặc "2 phần trăm triệu"), không đoán.
- Số nhóm-3-chữ-số không có ngữ cảnh tiền (mã đơn hàng, số điện thoại định dạng lạ) — hạn chế cố hữu của heuristic dựa format, chấp nhận.
- Nhiều số tiền trong 1 log (vd "mua áo 200k trả lại 50k") — chỉ lấy match đầu tiên theo vị trí trái→phải, không hiểu ngữ nghĩa trừ/cộng.
- Số tiền không có "k"/"tr"/dấu chấm phân cách 3 số — không đoán ý.

### 6.2 Phân loại hạng mục

Preset 9 nhóm cố định, match theo từ khoá (đã chuẩn hoá bỏ dấu + lowercase), **thứ tự ưu tiên cố định** khi khớp nhiều nhóm, fallback `"Khác"`:

| # | Hạng mục | Từ khoá tiêu biểu |
|---|---|---|
| 1 | Ăn uống | ăn sáng/trưa/tối/vặt, cà phê/cf/coffee, trà sữa, cơm trưa, cơm, phở, bún, cháo, bánh mì, xôi |
| 2 | Nhà cửa / Hoá đơn | tiền điện, tiền nước, tiền nhà, tiền internet, wifi, tiền rác, chung cư, quản lý phí, gas |
| 3 | Di chuyển | xăng, grab, taxi, xe ôm, gửi xe, vé xe, bảo dưỡng xe |
| 4 | Mua sắm | mua, shopee, tiki, lazada, quần áo, giày dép, siêu thị, chợ |
| 5 | Sức khoẻ | thuốc, khám bệnh, bệnh viện, nha khoa |
| 6 | Giáo dục / Con cái | học phí, sách vở, bỉm, sữa, đồ chơi |
| 7 | Giải trí | xem phim, du lịch, chơi |
| 8 | Chuyển khoản | chuyển tiền, chuyển khoản, trả nợ, cho vay, mượn |
| 9 | Khác | fallback khi không khớp nhóm nào |

Không dùng NLP/ML — thuần rule-based, nhất quán triết lý gọn nhẹ của app. Không cho tuỳ biến preset ở bản đầu (thêm sau nếu cần thực tế phát sinh).

### 6.3 Tính lại mỗi lần xem — không lưu `amount`/`category` gốc vào DB

`amount` và hạng mục tự nhận diện được **tính lại client-side** mỗi lần mở Tổng hợp (từ `content`), KHÔNG lưu field `amount`/`category` cố định vào `LogEntry` lúc tạo. Chỉ 3 field sau đây là state thật sự được lưu (vì user chủ động sửa, không tự nhận diện được):

```ts
interface LogEntry {
  id: string;
  content: string;        // bất biến — nguồn sự thật duy nhất để tự parse lại
  createdBy?: string;
  createdAt: string;      // bất biến
  expenseDate?: string;   // MỚI — "YYYY-MM-DD", optional. Absent = dùng ngày phần createdAt.
  categoryOverride?: string; // MỚI — tên hạng mục user tự chọn, đè lên kết quả tự nhận diện. Absent = dùng auto-detect.
  excluded?: boolean;     // MỚI — true = không tính vào Tổng hợp dù có parse ra số tiền.
}
```

Không cần backfill/migrate log cũ — parse tức thời áp dụng luôn cho log cũ lẫn mới, không cần chạy script 1 lần nào.

---

## 7. Out of Scope (không làm trong phase này)

- **Biểu đồ (pie/bar chart)** — chỉ bảng số liệu, tránh thêm chart library.
- **Export/CSV riêng cho Tổng hợp** — đi chung Export/Import JSON toàn Space đã có sẵn (logs đã nằm trong đó).
- **Tuỳ biến category preset** (thêm/sửa/xoá nhóm riêng) — dùng cứng 9 nhóm.
- **Đa tiền tệ** — chỉ VNĐ, khớp toàn bộ dữ liệu thật đã khảo sát.
- **Sửa `content` gốc** — vẫn bất biến, đúng nguyên tắc Nhật ký nhanh.
- **Pagination cho bảng Tổng hợp** — chưa cần ở quy mô dữ liệu hiện tại.
- **Soft-delete/thùng rác cho log** — xoá vẫn hard-delete như toàn app, không làm riêng cho Log.
- **Permission-toggle theo Space** (chặt/lỏng tuỳ chỉnh) — dùng cứng permission model mục 4, ghi chú revisit nếu Shared Space mở rộng quy mô sau này.

---

## 8. Edge Cases

| Case | Hành vi mong đợi |
|---|---|
| Log không parse được số tiền | Không tính vào Tổng hợp, hiện riêng trong khối "Chưa xác định số tiền" (không giấu). |
| Log có `excluded = true` | Không tính vào Tổng hợp, hiện riêng trong khối "Đã loại khỏi chi tiêu" kèm nút Hoàn tác. |
| Log có nhiều số tiền trong content | Chỉ parse số đầu tiên theo rule ưu tiên; không hiểu ngữ nghĩa cộng/trừ. |
| `expenseDate` được sửa ra ngoài khoảng "7 ngày qua"/"Tháng này" hiện tại | Log biến mất khỏi Tổng hợp đang xem (đúng logic lọc theo `expenseDate`) — không cần cảnh báo thêm, hành vi lọc bình thường. |
| Member đã rời Shared Space nhưng còn log cũ | Bảng "Theo người ghi": KHÔNG dùng thẳng fallback `"Thành viên"` có sẵn của `getMemberDisplayName` cho mục đích này (rủi ro gộp nhầm nhiều cựu thành viên khác nhau vào cùng 1 dòng, cộng sai số tiền) — `dev` cần xử lý riêng (vd hậu tố định danh) khi implement, xem câu hỏi mở #2. |
| 2 Member cùng sửa 1 log gần như đồng thời (khác máy, không Realtime) | Đúng hành vi load-on-open hiện có — người lưu sau ghi đè, không có xử lý đặc biệt mới (tình huống hiếm với 3 field mới vì chỉ tác giả mới sửa được). |
| Xem Tổng hợp trên dữ liệu đã tải, có log mới từ máy khác chưa reload | Số liệu chỉ phản ánh dữ liệu đã tải — nên có 1 dòng ghi chú nhỏ dưới bảng kiểu "Số liệu theo dữ liệu đã tải — tải lại trang để cập nhật mới nhất" (đặc biệt quan trọng cho số liệu tiền bạc, khác task/note ít nhạy cảm hơn khi lệch đồng bộ). |
| Data cũ trước khi có tính năng này (log chưa có 3 field mới) | `normalize.ts` fallback: `expenseDate` absent → dùng ngày phần `createdAt` khi tính; `categoryOverride` absent → dùng auto-detect; `excluded` absent → coi như `false`. Không lỗi/crash. |

---

## 9. Schema định hướng (không phải thiết kế cuối)

Không tạo bảng/cột Supabase mới — 3 field mới nằm trong cùng phần tử `logs[]` (jsonb) đã có, đúng pattern hiện tại của `kn_space_state.spaces`/`kn_shared_spaces.logs`.

```ts
interface LogEntry {
  id: string;
  content: string;
  createdBy?: string;
  createdAt: string;
  expenseDate?: string;      // MỚI, optional, "YYYY-MM-DD"
  categoryOverride?: string; // MỚI, optional, tên hạng mục trong preset cố định (mục 6.2)
  excluded?: boolean;        // MỚI, optional (absent = false)
}
```

**Action reducer mới** (tên chính xác do `dev` đặt theo convention hiện có, ví dụ `LOG_PATCH_EXPENSE`):
```ts
| { type: 'LOG_PATCH_EXPENSE'; payload: { id: string; expenseDate?: string; categoryOverride?: string | null; excluded?: boolean } }
```
Chỉ patch đúng 3 field trên — không đụng `content`/`createdAt`/`createdBy`, giữ đúng tinh thần "chỉ mở 1 khe hẹp" đã nêu ở mục 1.

**RLS/quyền:** không cần policy mới — giống `logs[]` hiện tại, quyền kiểm soát ở cấp Space/hàng DB, không phải cấp item bên trong jsonb (đúng mục 9 của `nhat-ky-nhanh.md`). Việc chặn sửa ngày/hạng mục/loại-bỏ log người khác (mục 4) là **gate ở tầng UI** (ẩn control), không phải RLS field-level — nhất quán với cách toàn app hiện không có kiểm tra quyền ở tầng reducer.

**Export/Import JSON:** 3 field mới tự động đi theo trong `ExportPayload` vì nằm trong `LogEntry`/`Space` — không cần đổi `schemaVersion`. Import file cũ (thiếu field) fallback theo mục 8 (bảng edge case).

---

## 10. Câu hỏi mở / cần xác nhận thêm (implementation, không chặn code)

Không còn câu hỏi nào **chặn** việc bắt đầu code. Các điểm sau là quyết định implementation của `dev`, không cần chủ dự án duyệt lại trước khi code:

1. Tên chính xác action reducer mới (tài liệu dùng `LOG_PATCH_EXPENSE` làm ví dụ).
2. Cách xử lý hiển thị tên trong bảng "Theo người ghi" cho member đã rời Shared Space — tránh gộp nhầm nhiều người vào chung 1 nhãn "Thành viên" (xem mục 8), `dev` tự chọn giải pháp hợp lý (vd hậu tố định danh ngắn).
3. Vị trí chính xác đặt toggle "Danh sách/Tổng hợp" trong markup `LogsBlock.tsx` hiện có — theo mô tả mục 3.2, chi tiết pixel-level do `dev` tự tinh chỉnh theo `BlockShell` sẵn có.

**Tham khảo trực quan:** demo Artifact tương tác đã dựng trong quá trình bàn bạc UX (chạy đúng bộ quy tắc parse ở mục 6.1 trên dữ liệu mẫu thật, có đủ toggle Danh sách/Tổng hợp, sửa ngày, sửa hạng mục, loại khỏi chi tiêu, khoá quyền theo tác giả) — `dev` nên xem qua để hiểu đúng ý đồ tương tác trước khi code, không chỉ đọc mô tả text.
