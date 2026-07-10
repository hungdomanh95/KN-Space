# Đơn giản hoá xử lý conflict — bỏ version-check, refresh RAM khi tab quay lại

> Tiếp nối `docs/features/storage-architecture-fix.md` (mục 3 — quyết định dùng version-check thay
> Realtime) và là câu trả lời cho câu hỏi còn bỏ ngỏ ở `docs/features/shared-space.md` mục 6.3 ("nếu
> cần giảm rủi ro mất dữ liệu khi nhiều người cùng sửa gần như đồng thời, cần bàn lại với `ba`/`dev` một
> giải pháp khác — không phải khôi phục Realtime"). Phát sinh từ việc chủ dự án + phiên làm việc chính
> điều tra sâu code thật (2026-07-10) và phát hiện cơ chế version-check + retry hiện tại **không hề
> chặn được** đúng kịch bản đã gây sự cố mất dữ liệu thật trước đó.
>
> **Ghi chú quy trình:** tài liệu này do `ba` viết, không có Agent tool để tự gọi `dev` phản biện trước
> khi giao. Mọi mục đánh dấu **[CẦN DEV XÁC NHẬN]** là điểm bắt buộc phải qua `dev` review kỹ thuật
> trước khi code — không coi là đã chốt 100%. Tài liệu này **mở lại** 1 phần quyết định đã "chốt" ở
> `docs/features/item-level-entity-tables.md`/`-progress.md` (cột `version`/trigger cho 5-9 bảng entity
> sắp tới) — nêu rõ ở mục 5.3, không tự ý ghi đè trạng thái "đã chốt" của tài liệu đó.

---

## 1. Root cause (tóm tắt, đã tự xác nhận lại bằng code thật)

Cơ chế hiện tại (`src/state/AppStateContext.tsx` hàm `attemptSavePrivate`/`attemptSaveShared`, dòng
194-218 và 299-324): mỗi lần lưu, client gửi `UPDATE ... WHERE id = X AND version = expected`
(`src/storage/privateSpaceStore.ts` dòng 224-231, `src/storage/sharedSpaceStore.ts` dòng 223-229). Nếu
0 dòng bị đổi (version đã lệch) → conflict → retry tối đa 3 lần, mỗi lần chỉ gọi lại
`getPrivateSpaceVersion()`/`getSharedSpaceVersion()` để lấy **con số version mới**, rồi gửi lại **y
nguyên gói dữ liệu cũ** đang pending kèm version mới đó.

**Đã tự xác nhận: cơ chế này không bảo vệ được đúng kịch bản đã xảy ra thật**, vì 2 lý do cộng lại:

1. Retry chỉ đồng bộ lại **số version**, không đồng bộ lại **nội dung mới nhất** — patch pending vẫn
   dựa trên bản RAM cũ.
2. `loadPrivateSpaces()`/`loadSharedSpaces()` chỉ chạy **đúng 1 lần lúc bootstrap** (`AppStateContext.tsx`
   dòng 89-159, `useEffect` deps rỗng). Listener `visibilitychange` hiện có (dòng 374-398) **chỉ xử lý
   nhánh `hidden`** để flush save đang chờ — không có nhánh `visible` để refetch dữ liệu mới. Không có
   polling, không có Realtime.

**Hệ quả:** version-check chỉ thực sự phát huy tác dụng trong 1 khung rất hẹp — 2 client ghi trúng cùng
vài trăm mili-giây (trong cửa sổ debounce 600-800ms), lúc đó server đang thực sự có 2 request tranh chấp
tại đúng thời điểm ghi. Kịch bản đã gây sự cố thật (tab mở hàng giờ, RAM cũ, thao tác bất kỳ → ghi đè)
**không rơi vào khung này** — tại thời điểm client cũ ghi (sau khi resync version), không còn ai tranh
chấp trên server nữa, nên request **ghi thành công về mặt kỹ thuật** dù nội dung đã lỗi thời, và ghi đè
mất thay đổi mới hơn của người khác trong im lặng hoàn toàn (không hiện banner gì, vì `result.ok = true`).

Nói cách khác: **version-check bảo vệ đúng ca hiếm, bỏ sót đúng ca đã thực sự xảy ra.** Đổi lại, nó tốn
kém: cột `version`, trigger DB, vòng lặp retry, 2 hàm resync riêng (`getPrivateSpaceVersion`/
`getSharedSpaceVersion`), và toàn bộ nhánh xử lý "hết lượt retry" (A1, xem mục 4).

---

## 2. Phương án đề xuất

### 2.1 Hướng 1 — Bỏ version-check + retry, ghi thẳng (blind write, last-write-wins đơn giản)

**Thay đổi cụ thể:**

- `savePrivateSpace()`/`saveSharedSpace()`: bỏ `.eq('version', expectedVersion)` khỏi câu `UPDATE`,
  chỉ còn `WHERE id = spaceId`. Bỏ tham số `expectedVersion`, bỏ giá trị trả về `conflict`.
- `attemptSavePrivate()`/`attemptSaveShared()`: bỏ toàn bộ vòng lặp retry (`retriesLeft`) và nhánh
  `if (result.conflict && retriesLeft > 0)`. Chỉ còn: gọi save 1 lần → thành công thì xoá pending, thất
  bại (lỗi network/server thật, từ nhánh `catch`) thì báo lỗi qua banner (xem mục 4).
- Xoá `getPrivateSpaceVersion()`/`getSharedSpaceVersion()` — không còn ai gọi.
- `privateVersionsRef`/`sharedVersionsRef` (Map theo dõi version từng Space) — không còn cần thiết cho
  đúng-sai của việc ghi. **[CẦN DEV XÁC NHẬN]** có nơi nào khác đang đọc `_privateVersion`/`_sharedVersion`
  ngoài mục đích version-check không (vd hiển thị debug, key React) — nếu không, xoá luôn field này khỏi
  `Space` type để gọn, nếu có thì giữ lại nhưng chỉ mang tính thông tin, không dùng để chặn ghi.
- Cột `version` + trigger DB (`kn_private_spaces_before_update`/`kn_shared_spaces_before_update`) —
  **giữ nguyên, không cần xoá.** Đã đọc kỹ 2 trigger này (`supabase/schema.sql` dòng 224-238, 751-766):
  cả 2 chỉ làm `new.updated_at := now(); new.version := old.version + 1;` — chạy vô điều kiện cho MỌI
  UPDATE bất kể client có gửi `WHERE version = ...` hay không. Bỏ điều kiện version ở tầng app **không**
  làm hỏng trigger — trigger vẫn tự tăng `version` và set `updated_at` bình thường, chỉ là app không còn
  đọc/dùng 2 cột này để quyết định ghi hay chặn nữa. Giữ lại vô hại và tránh 1 lượt migration DDL không
  cần thiết. **[CẦN DEV XÁC NHẬN]** đồng ý giữ nguyên cột/trigger như phân tích trên, không cần xoá.

**Hành vi mới khi 2 client cùng ghi gần nhau (transient conflict, khung hẹp):** ai ghi **sau cùng** thắng
vô điều kiện — không còn phân biệt "server có đang tranh chấp đúng lúc ghi hay không" như hiện tại. Về
bản chất, đây **chính là hành vi thật đang xảy ra** trong ca đã gây sự cố (silent overwrite) — chỉ khác
là giờ nó xảy ra **có chủ đích và nhất quán** trong mọi trường hợp, thay vì âm thầm trong 1 số ca và "may
mắn" tránh được ở số ca khác nhờ đúng lúc trúng khung debounce.

**Vì sao chấp nhận được ở quy mô dự án:** đây đã **luôn là** hành vi thực tế (space-level
last-successful-write-wins, xem phát hiện 1 ở `item-level-entity-tables.md` mục 1) — bỏ version-check
không làm giảm mức an toàn dữ liệu so với hiện tại, chỉ bỏ đi lớp phức tạp không mang lại giá trị tương
xứng. Đánh đổi giảm an toàn duy nhất còn lại (ca 2 tab ghi trúng cùng vài trăm ms) rất hiếm ở quy mô cá
nhân/nhóm nhỏ, và Hướng 2 (mục 2.2) xử lý đúng nguyên nhân gốc (RAM cũ) — quan trọng hơn nhiều so với
khung hẹp mà version-check từng bảo vệ.

### 2.2 Hướng 2 — Refresh RAM khi tab quay lại hoạt động (xử lý đúng nguyên nhân gốc)

**Thay đổi cụ thể** — thêm nhánh `visible` vào listener `visibilitychange` đã có (`AppStateContext.tsx`
dòng 374-398, hiện chỉ có nhánh `hidden`):

```
if (document.visibilityState === 'visible') {
  void refreshStaleSpaces();
}
```

`refreshStaleSpaces()` (hàm mới): gọi lại `loadPrivateSpaces()`/`loadSharedSpaces()` (đã có sẵn, dùng ở
bootstrap) rồi với **từng Space** trong kết quả:

- **Nếu Space đó KHÔNG có thay đổi đang chờ lưu** (không có entry trong `pendingPrivateSavesRef`/
  `pendingSharedSavesRef`, và không có debounce timer đang chạy cho nó) → thay dữ liệu Space đó trong
  `state.spaces` bằng bản vừa fetch (action dispatch mới, vd `SPACE_REFRESH_FROM_SERVER`), đồng thời cập
  nhật baseline (`prevPrivateRef`/`prevSharedRef`) để effect debounce không hiểu nhầm là "vừa có thay đổi
  cần lưu".
- **Nếu Space đó ĐANG có thay đổi chưa lưu** (đang gõ dở, debounce chưa trôi qua, hoặc save đang bay) →
  **bỏ qua, không đụng vào Space này** — tránh đè mất nội dung user đang thao tác dở. Space này sẽ tự lưu
  theo đúng luồng debounce/flush hiện có, không cần refresh.

**Vì sao đây là hướng xử lý đúng gốc:** root cause đã xác nhận là "RAM giữ bản cũ theo thời gian, không
ai làm mới". Refresh khi tab quay lại focus thu hẹp cửa sổ "RAM cũ" từ **hàng giờ** (thời lượng 1 phiên
mở tab) xuống còn **khoảng thời gian tab bị ẩn** (thường vài giây tới vài phút khi user chuyển tab/app
khác rồi quay lại) — đúng tinh thần "load-on-open" đã chọn, chỉ mở rộng định nghĩa "open" để bao gồm cả
"quay lại xem" chứ không chỉ "mở mới/F5". Không phải polling (không có `setInterval`), không phải
Realtime (không có subscribe/channel).

**Giới hạn đã biết, không xử lý đợt này:** nếu 1 tab được giữ liên tục ở trạng thái focus/visible trong
nhiều giờ liền (không bao giờ chuyển tab/minimize) mà có client khác ghi đè trong lúc đó, `visibilitychange`
không bao giờ fire → RAM vẫn cũ cho tới khi user F5 thủ công. Trường hợp này hiếm hơn nhiều so với ca đã
gây sự cố (thường người dùng laptop/máy tính chuyển qua lại nhiều tab/app trong ngày) — ghi nhận là hạn
chế chấp nhận được, xem câu hỏi mở #3 (mục 6).

### 2.3 Khuyến nghị của `ba` — làm CẢ HAI, không chọn 1 trong 2

2 hướng giải quyết 2 vấn đề khác nhau, bổ trợ nhau chứ không thay thế nhau:

- Hướng 1 bỏ đi phần phức tạp **không mang lại giá trị thật** (version-check chỉ chặn được ca hiếm).
- Hướng 2 thu hẹp **cửa sổ rủi ro thật** (RAM cũ) — đây mới là thứ thực sự làm giảm xác suất mất dữ liệu.

Nếu chỉ làm Hướng 1 mà bỏ Hướng 2: đúng là đơn giản hơn, nhưng không cải thiện gì về an toàn dữ liệu so
với hiện tại (thực chất hiện tại *đã* là last-write-wins trong đúng ca gây sự cố, chỉ là qua vài bước
vòng vo hơn). Nếu chỉ làm Hướng 2 mà giữ version-check: vẫn giữ toàn bộ phức tạp (cột, trigger, retry) để
bảo vệ 1 khung đã thu hẹp thêm bởi Hướng 2 — càng làm khung version-check bảo vệ được trở nên hẹp hơn
nữa, tỷ lệ chi phí/lợi ích càng tệ hơn. Làm cả hai giải quyết đúng gốc vấn đề bằng ít cơ chế nhất.

---

## 3. Đánh giá A1 (banner cảnh báo hết-retry) dưới kiến trúc mới

A1 (`storage-architecture-fix.md` mục 6, chưa code) được thiết kế cho khái niệm "hết 3 lượt retry vẫn
conflict". Nếu làm Hướng 1, khái niệm này **không còn tồn tại** — không có retry, không có "hết lượt".
**A1 theo đúng mô tả gốc bị loại bỏ hoàn toàn, không code.**

**Phát hiện phụ khi đọc lại code cho mục này:** cả `attemptSavePrivate()` (dòng 214-217) lẫn
`attemptSaveShared()` (dòng 320-323) hiện tại đều có nhánh `catch` cho lỗi network/server thật — nhánh
này **cũng đang chỉ `console.warn`, không gọi `setPrivateFallbackActive`/`setSharedFallbackActive`** dù
hạ tầng banner đã có sẵn và đang được dùng đúng ở luồng tạo Space/import (dòng ~243/246, ~485/488). Đây
là 1 khoảng hở **độc lập với version-check**, tồn tại cả trước và sau khi áp dụng đề xuất này — lỗi lưu
do mất mạng thật ở luồng debounce hiện đang bị nuốt im lặng y như A1 mô tả, chỉ khác nguyên nhân.

**Đề xuất thay A1:** kết nối `setPrivateFallbackActive(true)`/`setSharedFallbackActive(true)` (hàm sau
cần được viết mới, xem `storage-architecture-fix.md` mục 6.4 bước 1 — vẫn cần bất kể có làm A1 gốc hay
không) vào đúng nhánh `catch` (lỗi network/server thật) của `attemptSavePrivate`/`attemptSaveShared` sau
khi đã đơn giản hoá theo Hướng 1, gọi `false` khi save kế tiếp thành công. Đây là banner **tổng quát cho
mọi lỗi ghi thất bại thật sự** (mất mạng, server lỗi) — không còn phân biệt "hết lượt retry" vì không còn
retry, nhưng vẫn giữ đúng giá trị cốt lõi A1 muốn mang lại (không để user tưởng đã lưu trong khi chưa).
Chi phí thấp hơn A1 gốc (không cần test riêng nhánh "hết đúng 3 lần retry"), phạm vi bảo vệ rộng hơn (bắt
được cả lỗi network vốn đang bị bỏ sót ở cả 2 hàm này).

**Cập nhật sau review `dev` (2026-07-10) — lỗ hổng cần vá trước khi nối banner:** `savePrivateSpace()`
(`privateSpaceStore.ts:224-245`) tự `try/catch` nội bộ và **trả về** `{ok:false, error}` thay vì `throw`,
trong khi `saveSharedSpace()` (`sharedSpaceStore.ts:231-234`) **throw** lỗi ra ngoài. Nếu chỉ nối banner
vào nhánh `catch` như đề xuất gốc ở trên, lỗi mạng thật của Space cá nhân sẽ không rơi vào `catch` (nó rơi
vào nhánh `!result.ok` thường) → banner **không bao giờ bật cho Space cá nhân** — tái tạo đúng lỗ hổng A1
gốc, chỉ đổi chỗ. **Bắt buộc: đồng bộ `savePrivateSpace` sang throw giống `saveSharedSpace`** (đơn giản
hơn, vì sau Hướng 1 không còn cần phân biệt `conflict`/`error` nữa) trước khi nối banner vào `catch`.

---

## 4. Change impact

### 4.1 Space cá nhân hiện tại (`kn_private_spaces`)

| Chỗ đổi | Nội dung |
|---|---|
| `src/storage/privateSpaceStore.ts` | `savePrivateSpace()` bỏ `expectedVersion`/`.eq('version', ...)`/`conflict` trong return type. Xoá `getPrivateSpaceVersion()`. |
| `src/state/AppStateContext.tsx` | `attemptSavePrivate()` bỏ retry loop. Thêm nhánh `visible` cho `visibilitychange` + hàm `refreshStaleSpaces()` (mục 2.2). Nối banner lỗi network vào nhánh `catch` (mục 3). |
| `saveNow()` (dòng 554-639, dùng cho modal Thêm/Sửa) | Đơn giản hoá tương ứng — bỏ đường dẫn liên quan `conflict`/retry, giữ nguyên hành vi "đợi kết quả thật trước khi đóng modal". |
| DB (`supabase/schema.sql`) | Không cần đổi DDL — cột `version`/trigger giữ nguyên, chỉ ngừng dùng ở tầng app (mục 2.1). |

### 4.2 Shared Space hiện tại (`kn_shared_spaces`)

Tương tự 4.1, áp dụng cho `sharedSpaceStore.ts`/`attemptSaveShared()`. Riêng Shared Space có thêm ý nghĩa
UX: hiện tại 1 member sửa Task X trong lúc member khác sửa Task Y **trong cùng Space** đã có thể đụng
version (vì version là của cả Space, không phải từng item) — Hướng 1 (bỏ version-check) loại bỏ hẳn loại
"false conflict" này luôn, không chỉ ca gây sự cố thật. Cần cập nhật `docs/features/shared-space.md` mục
6.2/6.3 sau khi triển khai xong (đổi mô tả "LWW theo `updatedAt`" — vốn đã xác nhận CHƯA từng được code,
xem `item-level-entity-tables.md` mục 1 — thành đúng cơ chế thật: space-level blind last-write-wins +
refresh-on-visible). Việc cập nhật tài liệu đó **không làm trong đợt này**, chỉ ghi nhận nợ tài liệu.

### 4.3 Kế hoạch item-level sắp tới (`docs/features/item-level-entity-tables.md`)

**Đây là điểm cần lưu ý nhất — tài liệu đó đã "chốt" (qua `dev` review, 2026-07-10) thiết kế mỗi bảng
entity mới có cột `version` (bigint, trigger tự tăng), mirror pattern version-check hiện tại (mục 3.4,
"Field chung mọi bảng"). Quyết định đó dựa trên giả định version-check đang hữu ích ở cấp Space — giả
định này vừa được chính đợt điều tra dẫn tới tài liệu này chứng minh là sai (mục 1).**

Đề xuất: khi `dev` review tài liệu này, đồng thời xác nhận lại phần "version-check" trong thiết kế
item-level (9 bảng, Phương án B đã chốt) — **không huỷ Phương án B** (đó là quyết định về SỐ LƯỢNG BẢNG/
RLS, không liên quan gì tới version-check), chỉ áp dụng đúng Hướng 1 (mục 2.1) cho từng bảng entity mới:
giữ cột `version`/trigger (vô hại, cho `updated_at` miễn phí), bỏ `WHERE version = expected` ở tầng
storage layer khi viết code CRUD cho từng entity. Hướng 2 (refresh-on-visible) cũng nên áp dụng ở cấp
item khi đến lượt (mỗi Space fetch lại toàn bộ item của các bảng liên quan, cùng logic "bỏ qua item đang
có pending save"). **[CẦN DEV XÁC NHẬN + XIN CHỦ DỰ ÁN CHỐT LẠI]** — đây là điểm sửa lại 1 phần quyết định
đã chốt gần đây, nêu rõ trong câu hỏi mở (mục 6), không tự chốt một mình.

Lợi ích phụ nếu áp dụng sớm (trước khi bắt đầu Bước 1 của entity đầu tiên — Log, theo
`item-level-entity-tables-progress.md`): đơn giản hoá đúng lúc thiết kế storage layer còn chưa viết dòng
code CRUD nào, tránh phải viết version-check rồi xoá lại sau.

---

## 5. Out of Scope (không làm đợt này)

- **Merge field-level** (chỉ merge đúng field bị đổi khi conflict) — vẫn dừng ở last-write-wins toàn bộ
  Space/item, đúng quyết định đã chốt ở `item-level-entity-tables.md` mục 9.
- **Giới hạn quyền sửa item theo người tạo/được gán trong Shared Space** — đã bàn sơ bộ với chủ dự án
  nhưng KHÔNG phải giải pháp cho vấn đề này (là thay đổi UX/permission riêng, không giải quyết được ca
  1-người-nhiều-tab/máy — chính ca đã gây sự cố thật ở Space cá nhân). Không đề xuất làm cùng đợt.
- **Khôi phục Supabase Realtime / thêm polling định kỳ (`setInterval`)** — không đổi quyết định đã chốt ở
  `storage-architecture-fix.md` mục 3. Hướng 2 (mục 2.2) KHÔNG phải polling — chỉ fetch 1 lần khi tab đổi
  trạng thái visibility, không có vòng lặp thời gian.
- **Xoá cột `version`/trigger khỏi DB** — giữ nguyên (mục 2.1), không migration DDL đợt này.
- **Cập nhật `docs/features/shared-space.md` mục 6.2/6.3** — làm sau khi triển khai xong (mục 4.2), không
  làm song song.
- **Áp dụng ngay cho item-level** — chỉ áp dụng đề xuất này cho kiến trúc Space-level hiện tại (Space cá
  nhân + Shared Space); phần item-level chỉ **cập nhật thiết kế trên giấy** (mục 4.3), chưa code (đúng
  trạng thái "tạm dừng, chưa bắt đầu" đã ghi ở `item-level-entity-tables-progress.md`).

---

## 6. Edge Cases

| Case | Hành vi mong đợi |
|---|---|
| 2 tab/máy ghi trúng cùng vài trăm mili-giây (khung version-check cũ từng bảo vệ) | Ai ghi sau (tính theo thời điểm request tới server) thắng vô điều kiện — không còn resync/retry. Chấp nhận được (mục 2.1). |
| Tab bị ẩn rất lâu (nhiều giờ) rồi quay lại visible, có Space đang gõ dở (chưa debounce xong) khi vừa quay lại | `refreshStaleSpaces()` bỏ qua đúng Space đang pending — không đè mất nội dung đang gõ. Các Space KHÁC (không đang sửa) được refresh bình thường. |
| Tab KHÔNG bao giờ mất visibility (luôn focus liên tục nhiều giờ) | RAM có thể cũ mà không được refresh (giới hạn đã biết, mục 2.2) — không xử lý đợt này. |
| User mở modal Sửa Task (giữ state cục bộ trong modal, chưa bấm Lưu) đúng lúc `refreshStaleSpaces()` chạy | Modal Thêm/Sửa hiện có (`TaskFormModal`...) giữ dữ liệu form ở local state riêng, chỉ đọc từ `state.spaces` tại thời điểm MỞ modal — refresh nền không ảnh hưởng nội dung đang gõ trong modal. **[CẦN DEV XÁC NHẬN]** xác nhận đúng invariant này cho mọi modal liên quan (không có modal nào bind trực tiếp/live vào `state.spaces` sau khi đã mở). |
| Alt-tab nhanh liên tục (vài giây/lần) | Mỗi lần visible đều bắn 1 lượt fetch — chi phí thấp (vài query đọc), chấp nhận được ở quy mô cá nhân/nhóm nhỏ. Không throttle thêm đợt này (xem câu hỏi mở #2). |
| Lỗi network đúng lúc `refreshStaleSpaces()` đang fetch | Bỏ qua, giữ nguyên RAM hiện có, không throw/crash — coi như chưa refresh được, thử lại ở lần visible kế tiếp. |

---

## 7. Câu hỏi mở / cần `dev` xác nhận trước khi code

1. **[CẦN DEV XÁC NHẬN]** Đồng ý bỏ hẳn version-check + retry (Hướng 1) cho `kn_private_spaces`/
   `kn_shared_spaces`, giữ nguyên cột `version`/trigger DB không dùng tới (mục 2.1)? Có rủi ro/edge case
   nào ở tầng Supabase (vd concurrent UPDATE trên cùng hàng không còn `WHERE version` có gây lock/deadlock
   khác với hiện tại không) mà `ba` chưa lường hết không?
2. **[MỞ]** Hướng 2 có cần throttle (vd chỉ refetch nếu tab đã ẩn > N giây, tránh fetch dư khi user alt-tab
   liên tục vài giây/lần) hay cứ để chạy mỗi lần visible như đề xuất ở mục 2.2? `ba` nghiêng về KHÔNG cần
   throttle (chi phí thấp, đúng tinh thần đơn giản) nhưng để `dev` xác nhận không có tác dụng phụ hiệu
   năng nào ở quy mô hiện tại.
3. **[MỞ]** Có cần bổ sung 1 lớp bảo vệ cho ca "tab luôn focus liên tục nhiều giờ, không bao giờ mất
   visibility" (giới hạn đã biết ở mục 2.2) hay chấp nhận rủi ro thấp này? Nếu cần, phương án nhẹ nhất có
   thể cân nhắc là 1 nút "Làm mới dữ liệu" thủ công trong UI (không phải polling tự động) — **không đề
   xuất làm ngay**, chỉ nêu làm phương án dự phòng nếu sau này phát sinh sự cố tương tự.
4. **[CẦN DEV XÁC NHẬN + XIN CHỦ DỰ ÁN CHỐT LẠI]** Áp dụng Hướng 1 (bỏ version-check) cho thiết kế 9 bảng
   entity item-level sắp tới (mục 4.3), thay vì giữ nguyên "mirror pattern version-check" như đã mô tả ở
   `item-level-entity-tables.md` mục 3.4 — đồng ý sửa lại phần này của thiết kế đã chốt trước khi bắt đầu
   Bước 1 (entity Log)?
5. **[CẦN DEV XÁC NHẬN]** A1 gốc (banner "hết lượt retry") bị thay bằng banner lỗi network chung nối vào
   nhánh `catch` của `attemptSavePrivate`/`attemptSaveShared` (mục 3) — xác nhận đây là điểm nối đúng, không
   bỏ sót nhánh lỗi nào khác cần báo cho user (vd lỗi từ chính `refreshStaleSpaces()` ở Hướng 2 — theo đề
   xuất ở mục 6 (bảng edge case) là im lặng bỏ qua, không cần banner riêng, vì không mất dữ liệu gì, chỉ là
   chưa refresh được — xác nhận cách xử lý này hợp lý).

**Không có câu hỏi nào ở trên chặn việc bắt đầu code Hướng 1 + Hướng 2 cho Space-level hiện tại** (Space cá
nhân + Shared Space) — có thể giao `dev` review + triển khai độc lập với việc tách bảng item-level. Riêng
câu hỏi #4 cần chốt trước khi `dev` bắt đầu viết SQL cho bảng entity đầu tiên (Log).
