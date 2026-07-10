# Tách Task/Note/Habit/Reminder/Log thành bảng riêng theo từng item

> Nối tiếp `docs/features/storage-architecture-fix.md` mục 5 ("Ngoài phạm vi" — tách bảng theo entity,
> lúc đó gác lại vì chi phí/rủi ro > lợi ích). Chủ dự án đã xác nhận (2026-07-10) muốn làm bước tiếp
> theo này. Tài liệu này là output PHÂN TÍCH — chưa code, chưa đụng DB thật.
>
> **Cập nhật 2026-07-10 — ĐÃ CHỐT: bỏ version-check khỏi thiết kế item-level.** Điều tra sau tài liệu này
> phát hiện version-check + retry (pattern ban đầu được mirror ở đây) không chặn được đúng kịch bản gây sự
> cố thật ở cấp Space — chủ dự án đã đồng ý toàn bộ đề xuất ở
> `docs/features/conflict-handling-simplification.md`, `dev` cũng đã đồng ý áp dụng nguyên tắc này cho
> thiết kế item-level sắp tới (mục 4.3 tài liệu đó). Quyết định Phương án B (9 bảng, mục 3.2/3.3) **không
> đổi**. Riêng mục 3.4 bên dưới ("Field chung mọi bảng") đã cập nhật: cột `version`/trigger vẫn giữ (vô
> hại, cho `updated_at` miễn phí), nhưng tầng storage layer khi code CRUD cho từng entity sẽ ghi thẳng
> blind write (Hướng 1), không `WHERE version = expected`, không retry — áp dụng khi tới lượt code từng
> entity (chưa code, việc #3 ở `item-level-entity-tables-progress.md` vẫn đang tạm dừng).
>
> **Ghi chú minh bạch về quy trình:** phiên làm việc tạo tài liệu này **không có công cụ gọi trực tiếp
> sang agent `dev`** (Agent tool không có trong bộ công cụ khả dụng của phiên `ba` này, dù mô tả vai trò
> có nhắc tới). Để không dừng lại giữa chừng, `ba` đã tự đọc sâu toàn bộ code thật liên quan
> (`AppStateContext.tsx`, `privateSpaceStore.ts`, `sharedSpaceStore.ts`, `supabase/schema.sql`,
> `types.ts`, 4 file `state/reducers/*.ts`) để đưa ra đề xuất kỹ thuật có căn cứ thay vì mô tả chung
> chung. Toàn bộ mục có nhãn **[CẦN DEV XÁC NHẬN]** là điểm bắt buộc phải qua `dev` review kỹ (đặc biệt
> ước lượng effort, các trade-off implementation cụ thể) **trước khi bắt đầu code** — không coi tài
> liệu này là đã chốt kỹ thuật 100%.

---

## 1. Vì sao làm bước này (2 phát hiện, không lặp lại root cause đã biết)

Đã nắm rõ và **không nhắc lại** phần root cause user đã tóm tắt (retry chỉ đồng bộ `version`, không
merge nội dung, ghi đè nguyên mảng). Bổ sung đúng 2 phát hiện MỚI từ việc đọc code thật lần này, làm
rõ hơn vì sao tách bảng theo item là hướng đúng (không chỉ vá thêm 1 lớp retry):

**Phát hiện 1 — cơ chế "item-level LWW" mà `docs/features/shared-space.md` mục 6.2 mô tả CHƯA từng
được code hiện thực.** Đã `grep -rn "updatedAt"` toàn bộ `src/storage/` + `src/state/` — không có bất
kỳ đâu so sánh `updatedAt` giữa 2 phiên bản của cùng 1 item để quyết định "ai thắng". Chỉ `Note` có field
`updatedAt` (set khi tạo/sửa, `src/state/reducers/notes.ts` dòng 25/43); `Task`/`Habit`/`ReminderDefinition`
không có field này. Hành vi THẬT hiện tại là **"space-level last-successful-write-wins"** (ai ghi đè
thành công nguyên mảng lên DB sau cùng thì thắng, không liên quan nội dung item nào mới hơn) — không
phải "item-level LWW" như tài liệu mô tả. Tách bảng theo item, mỗi hàng có `version`/`updated_at` riêng
do trigger tự quản (giống pattern `kn_shared_spaces_before_update`), sẽ khiến claim "item-level" trong
tài liệu **lần đầu tiên đúng thật** — không chỉ vá bug, còn là cơ hội đóng khoảng cách tài liệu-vs-code.

**Phát hiện 2 — `order` là field DUY NHẤT có logic "reindex toàn mảng" khi kéo-thả.** Đọc
`state/reducers/tasks.ts` (`TASK_REORDER`) và `state/reducers/notes.ts` (`NOTE_REORDER`): cả 2 đều
sort mảng, splice, rồi `map((x, idx) => ({...x, order: idx}))` — gán lại `order` cho **TẤT CẢ** item
trong mảng, không chỉ item vừa kéo. `Habit`/`ReminderDefinition`/`LogEntry` **không có field `order`**
(Habit/Reminder giữ nguyên thứ tự mảng khi tạo — Reminder unshift vào đầu, Habit push vào cuối; Log
sort thuần theo `createdAt`). Đây là điểm duy nhất cần thiết kế riêng khi tách bảng (xem mục 5).

---

## 2. Phạm vi

**Trong phạm vi (phân tích + thiết kế, CHƯA code):**
- Schema 5 bảng mới: `kn_tasks`, `kn_notes`, `kn_habits`, `kn_reminders`, `kn_logs`.
- RLS cho 5 bảng mới, tái dùng `is_space_member()`/`is_space_owner()` đã có trong `schema.sql`.
- Thiết kế lại tầng `storage/` — quyết định hướng "action-level persist" thay vì diff-mảng (xem mục 4).
- Xử lý `order` (Task/Note) — đề xuất fractional-index thay vì reindex toàn mảng.
- Kế hoạch migration cuốn chiếu theo TỪNG ENTITY (không phải cuốn chiếu theo bước kỹ thuật như lần
  trước) — lý do ở mục 6.
- Đánh giá tác động Shared Space LWW, notify assign/complete, export/import.
- Khuyến nghị về việc có nên làm A1 (banner hết-retry) ngay trong lúc chờ việc lớn này hay không.

**Ngoài phạm vi (đợt này):**
- Viết SQL/CREATE TABLE cuối cùng (việc của `dev`, tài liệu chỉ nêu field/kiểu dữ liệu định hướng,
  đúng format `docs/features/shared-space.md` mục 9 đã dùng).
- Code migration script thật.
- Đổi cơ chế đồng bộ tổng thể (vẫn load-on-open, KHÔNG Realtime — không đổi).
- Dọn/xoá 5 cột jsonb cũ (`tasks`/`notes`/`habits`/`reminders`/`logs`) khỏi `kn_private_spaces`/
  `kn_shared_spaces` — giữ lại "chết" 1 thời gian an toàn sau cutover, mirror đúng quyết định đã làm với
  cột `spaces` của `kn_space_state` (xem `storage-architecture-fix-progress.md` Bước 3, quyết định #1).

---

## 3. Schema — quyết định kiến trúc chính, có 2 phương án

### 3.1 Phương án A — 1 bảng/entity, polymorphic FK (theo đúng gợi ý ban đầu của chủ dự án)

`kn_tasks` / `kn_notes` / `kn_habits` / `kn_reminders` / `kn_logs` — mỗi bảng có **2 cột FK nullable**:
`private_space_id` (→ `kn_private_spaces.id`) và `shared_space_id` (→ `kn_shared_spaces.id`), ràng buộc
CHECK đúng 1 trong 2 khác NULL (không phải cả hai, không phải không cái nào).

**Rủi ro đã cân nhắc:** quyết định 2026-07-09 (`storage-architecture-fix-progress.md` mục "Quyết
định/câu hỏi mở") từng CHỦ ĐỘNG KHÔNG gộp Space cá nhân + Shared Space vào 1 bảng, lý do "trộn 2 mô hình
quyền (owner-only vs membership-based) tăng rủi ro sai phân quyền". Phương án A có vẻ đi ngược quyết
định đó.

**Vì sao vẫn đề xuất được, có kiểm soát:** Postgres RLS cho phép nhiều policy trên CÙNG 1 bảng cho CÙNG
1 command (vd `select`) — các policy tự động **OR** với nhau. Nghĩa là có thể viết **2 policy tách biệt
hoàn toàn** cho mỗi thao tác (vd `"kn_tasks_select_private"` chỉ check nhánh `private_space_id` +
`auth.uid()`, `"kn_tasks_select_shared"` chỉ check nhánh `shared_space_id` + `is_space_member()`) —
KHÔNG viết 1 policy gộp `OR` cả 2 điều kiện trong cùng 1 biểu thức. Nhờ vậy vẫn giữ đúng tinh thần
"không trộn 2 mô hình quyền trong 1 chỗ" của quyết định cũ — chỉ khác là 2 policy đó nằm trên chung 1
bảng thay vì 2 bảng riêng. **[CẦN DEV XÁC NHẬN]** cách viết RLS này có thực sự sạch như kỳ vọng không,
hay có edge case Postgres RLS OR-combination nào cần lưu ý (vd performance của query planner khi có
nhiều policy trên 1 bảng).

**Lợi ích:** 5 bảng thay vì 9-10 (không có `habits` ở Shared Space), khớp đúng gợi ý ban đầu + khớp
model FE hiện có (`Task[]`/`Note[]`... đã là kiểu dùng chung bất kể Space nào, không phân biệt ở tầng
type), code đọc 1 Space chỉ cần 1 câu query/bảng (`where private_space_id = X or shared_space_id = Y`
tuỳ loại Space) thay vì phải biết trước gọi bảng nào.

### 3.2 Phương án B — tách riêng theo loại Space (nối dài đúng pattern hiện có)

`kn_private_tasks`/`kn_shared_tasks`, `kn_private_notes`/`kn_shared_notes`, ... (9 bảng, vì `habits` chỉ
có ở Space cá nhân). Mirror chính xác cách `kn_private_spaces`/`kn_shared_spaces` + `privateSpaceStore.ts`/
`sharedSpaceStore.ts` đã tách — nhất quán tuyệt đối với pattern đã có, RLS mỗi bảng chỉ 1 mô hình quyền
duy nhất, không có CHECK constraint polymorphic nào cần nhớ.

**Chi phí:** gần gấp đôi số bảng, gần gấp đôi lượng code CRUD (dù lặp lại theo khuôn có sẵn, rủi ro thấp
nhưng tốn thời gian gõ/test hơn).

### 3.3 Khuyến nghị của `ba`

Nghiêng về **Phương án A** (đúng gợi ý ban đầu) — với điều kiện bắt buộc: RLS viết thành **policy tách
riêng theo nhánh** như mô tả ở 3.1, không viết chung 1 biểu thức OR. Lý do chọn A: tổng lượng bảng/code
ít hơn đáng kể (5 vs 9), khớp tự nhiên với model FE hiện có, và rủi ro "trộn quyền" đã có cách kiểm soát
rõ ràng (2 policy riêng, không phải 1 policy gộp). **[CẦN DEV XÁC NHẬN + XIN CHỦ DỰ ÁN CHỐT LẠI]** — đây
là điểm đảo ngược 1 phần quyết định rất gần đây (2026-07-09), không tự chốt một mình dù có lý do hợp lý;
nêu rõ trong câu hỏi mở (mục 9) để chủ dự án xác nhận rõ ràng trước khi `dev` bắt đầu viết SQL.

### 3.4 Field định hướng từng bảng (không phải SQL cuối, theo format `shared-space.md` mục 9)

Field chung mọi bảng: `id` (uuid, **client tự sinh** — Task/Note id đã được sinh ở FE bằng
`crypto.randomUUID()` trước khi gửi lên, giống `kn_private_spaces`, KHÔNG dùng default DB), 2 cột FK
nullable (mục 3.1), `version` (bigint, trigger tự tăng), `created_at`, `updated_at` (trigger tự set).

> **Đã chốt (2026-07-10) — cột `version`/trigger giữ nguyên, nhưng KHÔNG dùng để chặn ghi.** Theo Hướng 1
> (`docs/features/conflict-handling-simplification.md` mục 2.1, đã được chủ dự án + `dev` đồng ý): mỗi
> bảng entity mới vẫn có cột `version` (bigint, trigger tự tăng vô điều kiện mỗi UPDATE, mirror đúng
> `kn_private_spaces_before_update`/`kn_shared_spaces_before_update`) — giữ lại vì vô hại và cho
> `updated_at` "miễn phí", không cần 1 lượt migration DDL riêng để bỏ. Nhưng khi code storage layer CRUD
> cho từng entity, câu `UPDATE` **ghi thẳng blind write** (`WHERE id = itemId`, KHÔNG kèm
> `AND version = expected`), **không có vòng lặp retry**, không có nhánh `conflict` — ai ghi sau cùng
> thắng vô điều kiện (last-write-wins), đúng tinh thần đơn giản hoá đã áp dụng ở Space-level. Đồng thời áp
> dụng Hướng 2 (refresh-on-visible) ở cấp item: khi tab quay lại active, refetch item của Space không có
> thay đổi đang chờ lưu (pending), bỏ qua item đang có pending save — cùng cơ chế đã dùng ở Space-level,
> chỉ đổi đơn vị theo dõi "đang pending" từ Space sang item.

- **`kn_tasks`**: `title`, `content`, `task_date` (text, `yyyy-mm-dd`), `task_time` (text, `HH:mm`),
  `done` (bool), `item_order` (double precision — xem mục 5), `created_by` (uuid null), `assignee_ids`
  (đề xuất `uuid[]` thay vì jsonb — cho phép query "task giao cho tôi" gọn hơn nếu cần sau này; **[CẦN
  DEV XÁC NHẬN]** có đáng đổi so với giữ `jsonb` cho nhất quán với các mảng khác trong dự án không).
- **`kn_notes`**: `title`, `content`, `color`, `item_order` (double precision), `hidden` (bool),
  `created_by` (uuid null). **Bỏ hẳn field `updatedAt` (epoch ms) ở tầng ứng dụng** — dùng thẳng cột DB
  `updated_at` (trigger quản), tầng `storage/` map `updated_at` (timestamptz) → `updatedAt` (epoch ms)
  khi đọc, để KHÔNG phải đổi gì ở `NoteRow.tsx`/`NotesBlock.tsx`/`noteUtils.ts` (đang dùng
  `note.updatedAt` để hiển thị "sửa lúc..." + sort "gần đây nhất").
- **`kn_habits`**: `title`, `completed_dates` (jsonb, mảng `yyyy-mm-dd`, giữ nguyên kiểu cũ). Không có
  `order`.
- **`kn_reminders`**: `reminder_type` (`'once' | 'recurring'`), `title`, `date`, `time`, `freq_n`,
  `freq_unit`, `day_of_month`. **Gợi ý tối ưu (không bắt buộc):** field `createdAt` hiện tại của
  `ReminderRecurring` (mốc tính chu kỳ, PHẢI giữ nguyên qua các lần `REMINDER_UPDATE` — xem
  `state/reducers/reminders.ts` dòng "createdAt = recurring ? giữ nguyên : làm mới") có thể **thay bằng
  thẳng cột `created_at` của DB row** (vì UPDATE không đổi `created_at`, đúng semantic cần giữ nguyên
  mốc) — bỏ được 1 cột dư thừa. **[CẦN DEV XÁC NHẬN]** không có edge case nào cần "reset mốc chu kỳ" mà
  `ba` đang bỏ sót trước khi áp dụng.
- **`kn_logs`**: `content`, `created_by` (uuid null), `expense_date` (text null), `category_override`
  (text null), `excluded` (bool null). Không có `order`; sort theo `created_at`. Tương tự Reminder,
  field `createdAt` string hiện tại có thể thay bằng cột `created_at` DB — **[CẦN DEV XÁC NHẬN]** định
  dạng ISO PostgREST trả về có khớp 100% cách FE đang parse/hiển thị không (múi giờ, độ chính xác ms).

---

## 4. Tầng `storage/` — quyết định lớn nhất: action-level persist, KHÔNG diff mảng

### 4.1 Vì sao KHÔNG tiếp tục pattern diff-snapshot hiện có

Cơ chế hiện tại (mirror ở cả Space cá nhân lẫn Shared Space) hoạt động bằng cách: mỗi lần `state.spaces`
đổi, so `JSON.stringify` snapshot mới với snapshot cũ (`prevPrivateRef`/`prevSharedRef`), nếu khác thì
debounce rồi gửi **nguyên khối** lên DB. Cách này đúng khi đơn vị lưu là 1 Space — nhưng nếu tiếp tục
dùng đúng kỹ thuật này ở cấp item (so từng mảng 5 loại, tự suy luận "item nào mới thêm/sửa/xoá" bằng
cách so 2 mảng id + so nội dung từng cặp id trùng), sẽ phát sinh 1 lớp logic diff mảng khá tinh vi, dễ
sai (vd phải tự viết deep-equal đáng tin cậy cho từng loại item, xử lý đúng thứ tự add/remove/update).

### 4.2 Đề xuất — persist theo ĐÚNG Ý NGHĨA của action, không suy luận ngược từ state

`smartDispatch` trong `AppStateContext.tsx` **đã có sẵn tiền lệ đúng hướng này** — nó chặn
`TASK_CREATE`/`TASK_UPDATE`/`TASK_TOGGLE_DONE`/`TASK_DELETE` để bắn notify Shared Space (dòng 506-541),
tức đã "biết" chính xác ý nghĩa từng action tại thời điểm dispatch, không cần suy luận từ diff state.
Đề xuất mở rộng đúng nguyên tắc này sang tầng lưu trữ: mỗi action CRUD của Task/Note/Habit/Reminder/Log
(khoảng 20 action type across 4 reducer, xem mục 4.3) khi qua `smartDispatch`, tính sẵn 1 "descriptor"
gọn: `{ table, op: 'insert' | 'update' | 'delete', itemId, patch }`, đẩy vào 1 **hàng đợi debounce theo
`itemId`** (Map tương tự `pendingPrivateSavesRef` hiện có, nhưng key là `itemId` thay vì `spaceId`) —
gộp nhiều sửa liên tiếp trên CÙNG 1 item trong cửa sổ debounce 600ms thành 1 lần ghi, y hệt tinh thần cũ,
chỉ khác đơn vị debounce là item thay vì Space.

**Vì sao đây là hướng đúng hơn diff-mảng:** tại điểm dispatch, app đã biết CHÍNH XÁC 100% "cái gì vừa
xảy ra" (tạo/sửa/xoá/toggle/kéo-thả item nào) — không cần đoán lại bằng cách so 2 snapshot. Giảm hẳn 1
lớp logic dễ sai (deep-equal, phát hiện add/remove qua diff id-set).

**Chi phí:** phải map tường minh ~20 action type sang thao tác DB tương ứng (Task: create/update/
delete/toggleDone/reorder; Note: create/update/delete/reorder/toggleHidden nếu có; Habit:
create/update/delete/toggleToday; Reminder: create/update/delete; Log: create/delete/deleteMany/
patchExpense) — khối lượng code thực sự, nhưng CƠ HỌC/lặp lại theo khuôn, rủi ro thấp hơn so với 1 hàm
diff mảng tổng quát dùng chung phải đúng cho mọi trường hợp. **[CẦN DEV XÁC NHẬN]** effort thực tế cho
~20 điểm intercept này, và có nên tách `smartDispatch` (hiện đã khá dài, 526-544) thành module riêng
(vd `state/itemPersist.ts`) thay vì phình to thêm trong `AppStateContext.tsx`.

### 4.3 Batch operations vẫn giữ 1 network call (không phải N call/N item)

- `LOG_DELETE_MANY` → 1 câu `.delete().in('id', ids)`.
- `IMPORT_DATA` → với mỗi Space, mỗi entity: 1 câu `upsert` mảng hàng (không phải N insert riêng lẻ),
  cộng 1 câu `.delete().in('id', idsToRemove)` cho phần bị bỏ khỏi file import — cùng kỹ thuật
  `upsertPrivateSpaces()` hiện đang dùng, chỉ áp cho item thay vì Space.
- Migration script (mục 6) → tương tự, `upsert` hàng loạt theo Space, không phải per-item round-trip.

### 4.4 Tăng số lượng network request theo hướng thông thường (non-functional, chấp nhận được)

So với hiện tại (1 request/Space thay đổi dù đổi bao nhiêu item cùng lúc), số request thực tế sẽ tăng
(mỗi item sửa độc lập ngoài cửa sổ debounce của nhau → mỗi cái 1 request riêng). Ở quy mô cá nhân/nhóm
nhỏ (vài chục request/ngày/user), không đáng lo về rate limit/chi phí Supabase — chỉ ghi nhận đây là
đánh đổi có chủ đích (đúng bản chất của việc chuyển sang lưu trữ item-level), không phải rủi ro cần xử
lý thêm.

---

## 5. Xử lý `order` (Task/Note) — đề xuất fractional-index, KHÔNG reindex toàn mảng

**Vấn đề (Phát hiện 2, mục 1):** nếu giữ nguyên cách `TASK_REORDER`/`NOTE_REORDER` gán lại `order` =
`0..n-1` cho MỌI item mỗi lần kéo-thả, thì 1 lần kéo-thả ở tầng item-level-table sẽ trở thành **UPDATE
hàng loạt N dòng** — vừa tốn network, vừa tăng khả năng đụng version-check với item khác đang được người
khác sửa cùng lúc (dù họ không liên quan gì tới việc kéo-thả).

**Đề xuất — fractional index:** đổi kiểu `order` từ số nguyên tuần tự sang **số thực** (`item_order
double precision`, FE vẫn dùng `number`). Khi kéo 1 item vào giữa 2 item láng giềng, `order` mới =
trung bình cộng `order` của 2 láng giềng (vd giữa `order=1` và `order=2` → `order=1.5`) — **chỉ 1 dòng
(item vừa kéo) cần UPDATE**, các item còn lại giữ nguyên `order`, không đổi gì cả.

**Đổi chỗ nào:** `TASK_REORDER` (`state/reducers/tasks.ts`)/`NOTE_REORDER` (`state/reducers/notes.ts`)
phải viết lại logic tính `order` mới (không còn `map((x, idx) => ({...x, order: idx}))`), tính bằng
trung bình 2 láng giềng kề (đầu/cuối danh sách xử lý riêng: cộng/trừ 1 đơn vị mặc định so với láng giềng
duy nhất). **[CẦN DEV XÁC NHẬN]** effort viết lại 2 reducer này + rà lại mọi nơi đang giả định `order`
là số nguyên liên tục (vd có chỗ nào dùng `order` để tính vị trí hiển thị theo index không, hay chỉ dùng
để `sort`).

**Edge case chấp nhận, ngoài phạm vi xử lý ngay:** kéo lặp đi lặp lại hàng chục lần vào đúng giữa 2 item
cố định có thể làm khoảng cách giữa 2 số thực nhỏ dần tới giới hạn độ chính xác `double precision`
(~15-17 chữ số có nghĩa) — về lý thuyết cần 1 thao tác "renumber toàn bộ" định kỳ để làm mới khoảng
cách. Ở quy mô dùng thực tế (kéo-thả thủ công vài chục lần/danh sách là nhiều), xác suất chạm giới hạn
gần như bằng 0 — không xử lý đợt này, ghi nhận là hạn chế đã biết.

`Habit`/`Reminder`/`Log` không có `order` — không bị ảnh hưởng bởi mục này.

---

## 6. Đánh giá tác động (change impact)

| Khu vực | Ảnh hưởng | Ghi chú |
|---|---|---|
| Shared Space item-level LWW | **Sửa đúng, lần đầu thành hiện thực** — mỗi item có `version` riêng, conflict chỉ xảy ra khi 2 người sửa CHÍNH item đó cùng lúc, không còn kiểu "toàn Space đụng version vì bất kỳ ai sửa bất kỳ item nào". Giảm mạnh tần suất conflict giả (false conflict) so với hiện tại. | Cần cập nhật `docs/features/shared-space.md` mục 6.2 sau khi triển khai xong — đổi mô tả "so `updatedAt`" thành đúng cơ chế thật (DB version-check per-item, last-successful-write-wins), việc này KHÔNG làm trong đợt phân tích này. |
| `docs/features/shared-space-task-assign-notify.md` | Không ảnh hưởng bản chất — `taskId` vẫn ổn định (client sinh, không đổi khi tách bảng), notify vẫn dùng đúng id đó cho deep-link. Chỉ đổi CHỖ intercept action (từ đọc `currentSpace.tasks` trong `smartDispatch` sang đọc từ DB/state như cũ — state FE không đổi cấu trúc, `Space.tasks: Task[]` vẫn y nguyên, chỉ nguồn ghi xuống DB đổi). | Không cần sửa gì ở `notify-shared-task-event` Edge Function. |
| Export/Import JSON | Cấu trúc file export (`Space` object với `tasks[]`/`notes[]`/...) **không cần đổi** — export vẫn đọc từ `state.spaces` (đã gộp đủ dữ liệu ở tầng FE dù nguồn DB giờ là nhiều bảng). Import (`IMPORT_DATA`) đổi tầng ghi (bulk upsert/delete theo entity thay vì `upsertPrivateSpaces` nguyên Space) — xem mục 4.3. | Không đổi trải nghiệm user (vẫn export/import 1 file JSON như cũ). |
| `docs/requirements.md` mục 4.1/503-508 | **Đã lỗi thời từ TRƯỚC đợt này** (còn mô tả `kn_space_state` 1-hàng-nhiều-Space, chưa cập nhật theo `kn_private_spaces`/`kn_shared_spaces` đã tách từ 2026-07-10) — không phải nợ do việc này gây ra. Ghi nhận ở đây, đề xuất cập nhật `requirements.md` 1 lần DUY NHẤT sau khi việc tách item-table này triển khai xong hẳn (tránh cập nhật 2 lần liên tiếp cho 2 lần đổi schema gần nhau). | Không xử lý trong đợt phân tích này — chỉ ghi nhận, không tự sửa `requirements.md` ngay. |
| Performance (số lượng Space/item) | Ở quy mô cá nhân/nhóm nhỏ (chục Space, vài trăm item/Space là nhiều), N+1 query khi load (1 query/bảng entity, không phải 1 query/item) không đáng lo. | Không cần thiết kế đặc biệt cho quy mô lớn hơn — đúng tinh thần "cá nhân/nhóm nhỏ trước". |
| Số lượng Supabase request | Tăng (mục 4.4) | Đánh đổi có chủ đích, chấp nhận được. |

---

## 7. Kế hoạch triển khai — cuốn chiếu THEO TỪNG ENTITY (khác cách chia bước lần trước)

Lần sửa trước (`storage-architecture-fix-progress.md`) chia theo BƯỚC KỸ THUẬT (bảng → tách settings →
storage layer → migration → apply thật) vì đối tượng là 1 khối "Space" duy nhất. Lần này đối tượng là 5
loại entity ĐỘC LẬP HOÀN TOÀN VỚI NHAU (bảng `kn_tasks` không liên quan gì tới `kn_notes`) — đề xuất chia
cuốn chiếu theo TỪNG ENTITY, mỗi entity đi đủ vòng (bảng → RLS → storage → migration User B → migration
User A thật) trước khi sang entity kế tiếp. Lý do: mỗi entity xong sớm là có giá trị dùng thật ngay (vd
xong Task là bug gốc "2 máy tạo Task cùng lúc mất dữ liệu" đã được vá cho riêng Task), thay vì phải chờ
xong cả 5 loại mới có entity nào an toàn.

**Thứ tự đề xuất — 2 phương án, CẦN CHỦ DỰ ÁN CHỌN (câu hỏi mở #3):**
- **Theo độ đơn giản tăng dần** (Log → Habit → Reminder → Task → Note): làm quen cơ chế/schema/RLS/
  migration trên case dễ nhất trước (Log bất biến, không `order`, không update nội dung), rủi ro thấp
  dần khi kỹ thuật đã "chạy trơn". Nhược điểm: bug gốc (Task) được vá **sau cùng**, dùng thực tế vẫn còn
  rủi ro mất Task lâu nhất.
- **Theo mức ưu tiên vá bug gốc** (Task trước tiên, dù phức tạp nhất vì có `order`+fractional-index):
  giải quyết đúng nỗi đau ban đầu sớm nhất. Nhược điểm: case đầu tiên lại là case khó nhất (rủi ro
  implementation cao hơn ngay từ bước đầu, chưa có kinh nghiệm từ case dễ).

Mỗi entity, các bước con (mirror đúng 5 bước đã chứng minh chạy ổn ở lần trước):
1. Bảng mới (`kn_<entity>`) — thuần thêm, an toàn chạy thẳng production.
2. RLS 2 nhánh tách biệt (mục 3.1).
3. Viết lại action-level persist cho ĐÚNG entity đó trong `smartDispatch`/module mới (mục 4.2).
4. Migration script (`preview()`/`run()` idempotent, expose qua `window.knMigrate*`, đúng pattern
   `migrateLegacySpaces.ts` đã có) — test User B trước.
5. Áp dụng migration thật cho User A — CHỈ sau khi User B sạch + chủ dự án tự Export JSON làm lưới an
   toàn + xác nhận rõ ràng, đúng quy trình đã áp dụng lần trước.

`dev` tạo `docs/features/item-level-entity-tables-progress.md` theo đúng mẫu đã dùng ở
`storage-architecture-fix-progress.md` khi bắt đầu code — **không tạo trong đợt phân tích này.**

---

## 8. Khuyến nghị về A1 (banner cảnh báo hết-retry)

Việc tách bảng item-level (mục 3-7) là 1 khối lượng công việc lớn, chia làm nhiều lượt, khả năng cao
kéo dài qua nhiều phiên làm việc (5 entity × 5 bước con). Trong lúc đó, khe hở A1 đã phân tích ở
`storage-architecture-fix.md` mục 6 (hết 3 lượt retry → im lặng, không cảnh báo user) **vẫn còn nguyên**
— và thực ra càng có giá trị hơn trong giai đoạn chuyển tiếp, vì việc migrate từng entity (bảng cũ jsonb
+ bảng mới song song tồn tại, cutover từng phần) tự nhiên làm tăng nguy cơ có những khoảnh khắc 2 nguồn
dữ liệu không đồng nhất tạm thời.

**Khuyến nghị: làm A1 NGAY, độc lập, không chờ việc tách bảng lớn xong.** Lý do:
- A1 đã phân tích xong kỹ thuật đầy đủ (`storage-architecture-fix.md` mục 6.4, acceptance criteria đã
  có ở 6.6) — sẵn sàng giao `dev` code ngay, không cần chờ quyết định gì thêm.
- A1 là lớp phòng vệ ĐỘC LẬP với kiến trúc lưu trữ bên dưới (chỉ là UI báo lỗi khi retry hết lượt) —
  không xung đột, không cần viết lại khi việc tách bảng hoàn tất (nhánh hết-retry vẫn tồn tại y hệt ở
  kiến trúc mới, chỉ đổi đơn vị từ "Space" sang "item").
- Chi phí thấp (ước lượng nhỏ, có sẵn UI banner để tái dùng), lợi ích tức thời (không còn mất dữ liệu
  âm thầm-không-cảnh-báo trong lúc chờ giải pháp gốc).

Đề xuất: giao `dev` làm A1 trong 1 lượt riêng ngay bây giờ (không phụ thuộc tài liệu này), song song với
việc `dev` review kỹ thuật tài liệu này trước khi bắt đầu Bước 1 của entity đầu tiên.

---

## 9. Ngoài phạm vi

- Khôi phục Realtime — không đổi quyết định đã chốt.
- Merge field-level (chỉ merge đúng field bị đổi trong 1 item khi conflict) — vẫn dừng ở mức
  "last-successful-write-wins toàn bộ item", không đi sâu hơn field-level, đúng tinh thần đơn giản của
  dự án.
- Renumber tự động `order` khi cạn độ chính xác số thực (mục 5) — chấp nhận rủi ro cực thấp, không xử
  lý đợt này.
- Cập nhật `docs/requirements.md`/`docs/features/shared-space.md` — làm 1 lần sau khi triển khai XONG
  HẲN (mục 6), không làm song song lúc code.
- Đổi model quyền Owner/Member hiện có — không đụng.

---

## 10. Câu hỏi mở / cần chủ dự án + `dev` xác nhận trước khi bắt đầu code

1. ~~Chọn Phương án A hay B cho schema (mục 3.1 vs 3.2)?~~ **Đã chốt (2026-07-10): Phương án B (9 bảng
   tách riêng theo loại Space, KHÔNG polymorphic FK).** `dev` đã review và **phản biện lại khuyến nghị
   ban đầu của `ba`** (vốn nghiêng Phương án A) — chỉ ra bằng tính toán cụ thể rằng A không hề tiết kiệm
   số RLS policy phải viết so với B (40 vs 36), lại thêm 1 lớp CHECK constraint polymorphic phải giữ
   đúng vĩnh viễn ở mọi điểm ghi dữ liệu, trong khi codebase **chưa từng có tiền lệ** nhiều policy/command
   trên 1 bảng. Chủ dự án đã xác nhận chọn B theo đề xuất của `dev`. Xem báo cáo review đầy đủ của `dev`
   (2026-07-10) — chưa có file riêng, tóm tắt trong `item-level-entity-tables-progress.md` mục "Quyết
   định/câu hỏi mở".
2. ~~Đồng ý hướng "action-level persist" (mục 4.2) thay vì tiếp tục diff-mảng?~~ **Đã chốt: Đồng ý.** `dev`
   xác nhận đúng 21 action type (khớp ước lượng "~20" của `ba`), effort cơ học/rủi ro thấp, đồng ý tách
   riêng module `state/itemPersist.ts` như `ba` đề xuất.
3. **[MỞ] Thứ tự migrate 5 entity (mục 7)** — `dev` đồng ý hướng "độ đơn giản tăng dần" (Log→Habit→
   Reminder→Task→Note) của `ba`, có tinh chỉnh: thêm 1 bước con viết + unit-test riêng cơ chế
   fractional-index TRƯỚC khi đụng Task (entity đầu tiên cần cơ chế mới này) — xem mục 7 cập nhật. Thứ
   tự tổng thể coi như đã chốt, nhưng **chưa xác nhận thời điểm bắt đầu Bước 1 của Log** — xem file tiến
   độ.
4. ~~Đồng ý làm A1 (banner hết-retry) ngay, tách riêng khỏi việc lớn này (mục 8)?~~ **Đã chốt: Đồng ý,
   làm ngay** — cả `ba` lẫn `dev` đều khuyến nghị có, không có gì cần chờ thêm.
5. ~~`assignee_ids` dùng `uuid[]` hay giữ `jsonb` (mục 3.4, `kn_tasks`)?~~ **Đã chốt: giữ `jsonb`** — `dev`
   xác nhận dự án chưa có tiền lệ cột `uuid[]` nào, không có nhu cầu query server-side theo assignee hiện
   tại; nếu cần sau này có thể thêm GIN index trên `jsonb` mà không cần đổi kiểu cột.
6. ~~Field `createdAt` của Reminder/Log có thay được bằng cột `created_at` DB không (mục 3.4)?~~ **Đã
   chốt: Đồng ý bỏ field riêng, dùng cột DB** — `dev` xác nhận không có edge case "reset mốc chu kỳ" nào
   trong code hiện tại. **Lưu ý bắt buộc khi code migration/import:** phải INSERT tường minh giá trị
   `created_at` = giá trị cũ, không để DB tự set `now()`, nếu không sẽ mất mốc thời gian gốc.

**Phát hiện mới từ `dev` (2026-07-10, không có trong bản gốc `ba` viết) — cần xử lý TRƯỚC khi migrate
bất kỳ entity nào:** 3 chỗ trong code (`LogsBlock.tsx`, `ExpenseSummaryPanel.tsx`, và đặc biệt
`MobileChatScreen.tsx` — màn hình chính trên mobile) đang sort theo `createdAt` bằng `localeCompare`
(so sánh chuỗi) thay vì parse qua `Date`. Định dạng timestamp cũ (client tự sinh, hậu tố `Z`) và định
dạng mới (Postgres trả về, hậu tố `+00:00`) khi trộn lẫn trong lúc migrate từng entity sẽ khiến bản ghi
cũ luôn bị xếp sai thứ tự (do so sánh ký tự `Z` > `+`, không liên quan thời gian thật). Phải sửa cả 3 chỗ
sang so sánh qua `new Date(x).getTime()` **trước** khi bắt đầu Bước 1 của bất kỳ entity nào — chi phí
nhỏ, độc lập với mọi quyết định khác ở trên.

**Không còn câu hỏi nào chặn việc bắt đầu code** — chỉ còn 1 điểm thời điểm (mục 3 trên) cần xác nhận khi
resume, xem `item-level-entity-tables-progress.md`.
