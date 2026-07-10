# Sửa kiến trúc lưu trữ — chống ghi đè mất dữ liệu

> Quyết định đã chốt qua điều tra + trao đổi trực tiếp với chủ dự án (2026-07-09), sau sự cố mất layout mọi Space cá nhân + 1 số task thật. Tài liệu này là nguồn sự thật cho `dev` triển khai — đọc trước khi code, không suy đoán lại root cause.

---

## 1. Sự cố + Root cause (đã điều tra trong code thật, không suy đoán)

**Triệu chứng:** layout của TẤT CẢ Space cá nhân bị reset về mặc định, một số task bị mất — xảy ra ngay sau phiên test tính năng "Quản lý chi tiêu" trên `localhost`, nhưng ảnh hưởng cả production.

**Root cause (3 yếu tố cộng lại):**
1. **`localhost` và production dùng CHUNG 1 project Supabase** — `.env.local` trỏ thẳng project thật (`oopkpyltisngovrystub.supabase.co`), không có DB dev riêng.
2. **Lưu trữ kiểu "ghi đè toàn bộ"** — bảng `kn_space_state` lưu TOÀN BỘ Space cá nhân + `settings` của 1 user trong **1 hàng duy nhất**. `flushSave()` (`src/storage/supabaseStore.ts`) là `upsert` nguyên khối `spaces` + `settings` đang có trong RAM trình duyệt, mỗi khi có **bất kỳ** thay đổi nào (`src/state/AppStateContext.tsx` dòng 121-126) — không phân biệt "vừa đổi đúng chỗ nào".
3. **Không có kiểm tra xung đột (optimistic concurrency)** cho dữ liệu cá nhân — khác hẳn Shared Space đã có `version` (xem mục 3).

**Cơ chế cụ thể:** 1 tab/phiên mở app từ lâu, giữ 1 "bản chụp" dữ liệu trong RAM tại thời điểm nó tải. Nếu dữ liệu trên server đổi sau đó (do phiên khác lưu) mà tab này không tải lại, rồi tab này thực hiện bất kỳ thao tác nào (dù nhỏ) → 600ms sau tự lưu **đè toàn bộ** server bằng bản cũ đang giữ — xoá mất mọi thay đổi mới hơn, kể cả ở Space/field nó chưa từng đụng tới.

**Đã loại trừ nguyên nhân khác:** không phải do tính năng "Quản lý chi tiêu" vừa code (đã audit kỹ, action mới `LOG_PATCH_EXPENSE` chỉ patch đúng field liên quan). Không phải do Realtime (đã xác nhận Realtime không còn code nào subscribe, xem mục 2).

**Không khôi phục được dữ liệu đã mất** — dự án không có Supabase backup/PITR.

---

## 2. Audit thêm — 2 vấn đề "lung tung" khác phát hiện được (không phải root cause, nhưng cần dọn)

1. **Realtime publication vẫn bật ở schema dù không còn code nào dùng.** `supabase/schema.sql` + `docs/features/shared-space-schema.sql` có `alter publication supabase_realtime add table ...` cho cả 3 bảng (`kn_space_state`, `kn_shared_spaces`, `kn_space_members`), kèm comment mô tả "subscribe channel để nhận real-time" — nhưng grep toàn bộ `src/` xác nhận **không có dòng code nào** subscribe Realtime nữa (đã gỡ từ commit `aa00fae`, 2026-07-01, sau khi gây 5 bug mất dữ liệu). Cấu hình + tài liệu chết, gây hiểu nhầm.
2. **Schema production không nằm ở 1 nơi** — phải đọc đúng thứ tự 8 file SQL rải rác (`supabase/schema.sql`, `shared-space-schema.sql`, `shared-space-rls-fix.sql`, `shared-space-accept-invite-fix.sql`, `nhat-ky-nhanh-schema.sql`, `fix-shared-space-enabled-blocks.sql`, `nhat-ky-nhanh-fix-createdat-chi-tieu-kino.sql`, `nhat-ky-nhanh-migrate-chi-tieu-kino.sql`) mới ra bức tranh thật.

---

## 3. Quyết định kiến trúc — KHÔNG dùng Realtime, dùng version-check

> **Cập nhật 2026-07-10 — phần "dùng version-check" của quyết định này đang được xem xét lại.** Điều tra
> sâu code thật xác nhận version-check + retry hiện tại KHÔNG chặn được đúng kịch bản đã gây sự cố (mục 1
> ở trên) — chỉ chặn được 1 khung rất hẹp (2 client ghi trúng cùng vài trăm mili-giây). Phần "KHÔNG dùng
> Realtime" (mục này) **vẫn giữ nguyên, không đổi**. Xem đề xuất thay thế đầy đủ (bỏ version-check, thêm
> refresh-on-visible) ở `docs/features/conflict-handling-simplification.md` — chưa code, đang chờ `dev`
> review.

Đã cân nhắc khôi phục Supabase Realtime để giảm độ trễ đồng bộ giữa các tab/thiết bị. **Quyết định: KHÔNG làm.**

**Lý do:**
- Realtime chỉ **giảm xác suất** xảy ra (thu hẹp cửa sổ dữ liệu cũ từ hàng giờ xuống mili-giây khi tab đang active) — **không loại bỏ được** cơ chế gây lỗi (tab chạy nền bị trình duyệt throttle, mất kết nối mạng, máy sleep/wake vẫn có thể khiến tab "lỡ nhịp" cập nhật).
- Đã có tiền lệ thất bại ngay trong dự án: Realtime từng cần cả 1 cỗ máy trạng thái phức tạp (`normalizeRealtimeRow`, `hasPendingSave`, `stableStringify`, `skipInitialSaveRef`, `isFlushInProgress` — đã xoá ở `aa00fae`) mà vẫn gây 5 bug mất dữ liệu.
- Version-check là server làm trọng tài cuối cùng — an toàn không phụ thuộc độ tin cậy mạng/trình duyệt, đúng tinh thần gọn nhẹ của dự án, và **tái dùng nguyên pattern đã chứng minh chạy ổn** ở Shared Space (`kn_shared_spaces`, cột `version` + trigger `kn_shared_spaces_before_update` tự tăng version mỗi lần UPDATE, client gửi kèm `WHERE version = expected` — 0 row affected = conflict).

---

## 4. Kế hoạch triển khai — 2 phần, tách rủi ro

### Phần A — Dọn dẹp, rủi ro thấp, KHÔNG đụng dữ liệu (làm trước, gọn trong 1 lượt)

**✅ ĐÃ HOÀN THÀNH TOÀN BỘ (2026-07-09)** — cả phần file trong repo lẫn hạ tầng thật. Chủ dự án đã tự chạy 3 câu lệnh `ALTER PUBLICATION ... DROP TABLE` trên Supabase Dashboard (production) — xác nhận xong.

1. Gỡ `alter publication supabase_realtime add table` cho cả 3 bảng — cả trong file SQL VÀ trên Supabase Dashboard thật.
   - Đã xoá khỏi `supabase/schema.sql` và `docs/features/shared-space-schema.sql` (file trong repo).
   - **Đã chạy trên Supabase Dashboard thật (2026-07-09, chủ dự án tự chạy):**
     ```sql
     alter publication supabase_realtime drop table public.kn_space_state;
     alter publication supabase_realtime drop table public.kn_shared_spaces;
     alter publication supabase_realtime drop table public.kn_space_members;
     ```
2. Gộp 8 file SQL rải rác thành **1 `supabase/schema.sql` duy nhất**, phản ánh đúng schema hiện tại (kể cả 2 bảng Push Notification, `kn_shared_spaces`/`kn_space_members`/`kn_space_invites`, function `accept_invite`/`create_shared_space`). Các file cũ trong `docs/features/` giữ lại nhưng thêm dòng đầu file đánh dấu rõ **"ĐÃ GỘP vào `supabase/schema.sql` — chỉ giữ làm lịch sử, không chạy lại"**. Đã làm cho cả 7 file: `shared-space-schema.sql`, `shared-space-rls-fix.sql`, `shared-space-accept-invite-fix.sql`, `nhat-ky-nhanh-schema.sql`, `fix-shared-space-enabled-blocks.sql`, `nhat-ky-nhanh-fix-createdat-chi-tieu-kino.sql`, `nhat-ky-nhanh-migrate-chi-tieu-kino.sql`.

### Phần B — Sửa gốc kiến trúc Space cá nhân, rủi ro cao hơn, LÀM CUỐN CHIẾU CÓ FILE TIẾN ĐỘ (theo đúng `dev.md`)

> **Cập nhật 2026-07-09 — bỏ ý định tách project Supabase dev riêng.** Đã cân nhắc lại: chi phí thiết lập (tạo project, cấu hình lại OAuth redirect) không tương xứng với rủi ro thực sự cần chặn. Thay bằng: **test bằng 1 tài khoản Google phụ (User B) trên chính project production** — vì `kn_space_state` khoá theo `user_id` (PK) + RLS `auth.uid() = user_id`, thao tác của User B về mặt cấu trúc KHÔNG THỂ chạm được hàng dữ liệu của chủ dự án (User A), kể cả nếu lỡ tái hiện đúng lỗi ghi đè cũ. Khoảng hở duy nhất cách này không che được là **thay đổi cấu trúc bảng (DDL)** — vì bảng/trigger dùng chung cho cả DB, không phân biệt user. Xử lý: bước 2 (tạo bảng mới) là thuần thêm mới, không đụng bảng cũ nên an toàn làm thẳng; bước 5 (script migrate, đọc trực tiếp từ hàng thật) bắt buộc phải chạy thử cho User B trước, xác nhận đúng, mới chạy cho hàng thật của User A.

Tạo `docs/features/storage-architecture-fix-progress.md` theo mẫu chuẩn, chia nhỏ tối thiểu các phần sau (dev có thể chia nhỏ hơn nếu thấy hợp lý, nhưng KHÔNG gộp lại thành ít phần hơn):

1. **Bảng mới cho Space cá nhân** — mỗi Space cá nhân 1 hàng (bảng mới, đặt tên do `dev` quyết, gợi ý `kn_private_spaces`), cột `version` + trigger tự tăng **copy chính xác** `kn_shared_spaces_before_update`. RLS `auth.uid() = user_id`. Thuần thêm bảng mới, không đụng bảng cũ — an toàn chạy thẳng trên production (chủ dự án tự chạy SQL, giống cách đã làm ở Phần A).
2. **Tách `settings` khỏi vòng lưu chung với `spaces`** — lưu/đọc độc lập, chỉ ghi khi chính `settings` đổi (không kéo theo mỗi lần 1 Space đổi).
3. **Viết lại tầng `storage/`** (`supabaseStore.ts`, `AppStateContext.tsx`) — đọc/ghi theo hàng riêng từng Space cá nhân + version-check, mirror cách `sharedSpaceStore.ts` đã làm. Test bằng tài khoản Google phụ (User B) — không đụng dữ liệu User A. **Cân nhắc và đề xuất rõ với `ba`/chủ dự án** (không tự quyết âm thầm): có nên dùng CHUNG hẳn 1 cơ chế cho Space cá nhân và Shared Space luôn không (về bản chất Space cá nhân = Shared Space có đúng 1 thành viên) — nếu thấy hợp lý, nêu rõ đánh đổi trước khi làm.
4. **Migration data** — script chuyển dữ liệu từ `kn_space_state.spaces[]` (mảng cũ) sang các hàng mới. **Bắt buộc chạy thử cho User B trước** (tự tạo vài Space/Task/Layout giả lập giống cấu trúc thật cho User B, chạy script chỉ scope đúng `user_id` của User B, tự kiểm tra kết quả đúng) — xác nhận sạch mới được chạy cho User A (dữ liệu thật).
5. **Áp dụng migration cho dữ liệu thật (User A)** — CHỈ sau khi bước 4 đã chạy sạch cho User B và được xác nhận. Trước khi chạy: hướng dẫn chủ dự án tự Export JSON toàn bộ Space (tính năng Export sẵn có trong app) làm lưới an toàn thủ công tối thiểu (vì không có DB backup thật). Giám sát chặt trong lúc chạy migration thật cho User A.

**Nguyên tắc bắt buộc khi làm Phần B (nhắc lại từ `dev.md`):**
- Đúng 1 phần/lượt, build/tsc pass, cập nhật file tiến độ, dừng báo cáo — không tự nhảy sang phần kế tiếp.
- Không đụng dữ liệu thật của User A cho tới bước 5, và bước 5 phải có xác nhận rõ ràng từ chủ dự án trước khi chạy.
- Mọi câu lệnh SQL chạm hạ tầng thật (tạo bảng, trigger, chạy migration) — `dev` chỉ chuẩn bị, KHÔNG tự chạy lên Supabase Dashboard thật, đưa lại cho chủ dự án tự chạy hoặc xác nhận rõ ràng trước, giống quy trình đã áp dụng ở Phần A.
- Câu hỏi mở/quyết định kiến trúc phát sinh giữa chừng → ghi vào file tiến độ + hỏi lại, không tự quyết.

---

## 5. Ngoài phạm vi (không làm đợt này)

- Khôi phục Supabase Realtime (đã quyết định không làm, xem mục 3).
- ~~Tách toàn bộ Task/Note/Habit/Reminder/Log ra bảng riêng theo từng entity (mức độ granularity cao hơn per-Space) — cân nhắc sau nếu per-Space vẫn chưa đủ trong thực tế dùng, không làm ngay vì chi phí/rủi ro migration lớn hơn nhiều so với lợi ích hiện tại.~~ **Đã lên kế hoạch (2026-07-10)** — chủ dự án xác nhận per-Space vẫn còn hở (retry hết lượt chỉ đồng bộ lại `version`, không merge nội dung mới nhất, item của bên thua cuộc bị ghi đè mất ngay ở lần retry "thành công"). Xem `docs/features/item-level-entity-tables.md` cho thiết kế kỹ thuật đầy đủ (schema, RLS, storage layer, kế hoạch cuốn chiếu theo từng entity) — tài liệu phân tích, chưa code/chưa đụng DB thật.

---

## 6. Bổ sung — hoàn thiện banner cảnh báo khi hết lượt retry (2026-07-10, `ba`)

> **Cập nhật cùng ngày (2026-07-10) — mục 6 này có thể bị thay thế.** Nếu đề xuất bỏ version-check ở
> `docs/features/conflict-handling-simplification.md` (Hướng 1) được chấp nhận, khái niệm "hết lượt retry"
> không còn tồn tại — A1 mô tả dưới đây được thay bằng 1 banner lỗi network chung, đơn giản hơn (xem tài
> liệu đó mục 3). Giữ nguyên nội dung gốc dưới đây làm lịch sử phân tích, không xoá.

> Phần còn thiếu của chính Phần B mục 4 Bước 3 — **không phải tính năng mới**, mà là khe hở còn sót lại
> trong đúng cơ chế vừa được xây để chống mất dữ liệu. Phát hiện trong đợt rà soát/brainstorm tổng thể
> 2026-07-10, đã đối chiếu code thật (`AppStateContext.tsx`, `supabaseStore.ts`) trước khi ghi nhận.

### 6.1 Root cause / vì sao vẫn cần làm dù Phần B đã "xong"

`attemptSavePrivate()`/`attemptSaveShared()` (`src/state/AppStateContext.tsx`) đã có auto-retry 3 lần khi
gặp conflict (version-check thất bại) — đúng cơ chế Phần B mô tả. Nhưng nhánh **hết lượt retry**
(`retriesLeft` về 0, vẫn conflict) chỉ `console.warn(...)` rồi `return false` — giá trị trả về này bị bỏ
qua ở nơi gọi (`void attemptSavePrivate(sid)` trong effect debounce). Không có banner/toast nào báo cho
người dùng biết thay đổi của họ **chưa lên được server**.

Đối chiếu hạ tầng banner đã có:
- `setPrivateFallbackActive(active: boolean)` đã tồn tại trong `src/storage/supabaseStore.ts`, đang được
  gọi đúng ở luồng **tạo mới Space**/**import** khi thất bại (`AppStateContext.tsx` dòng ~243/246,
  ~485/488) — nhưng **không** được gọi trong nhánh hết-retry của `attemptSavePrivate()` (dòng ~212).
- `setSharedFallbackActive()` — hàm tương ứng cho Shared Space — được **nhắc tới trong comment**
  (`supabaseStore.ts` dòng ~202-203, liệt kê "gộp OR vào cùng 1 banner duy nhất") nhưng **chưa từng được
  định nghĩa** trong repo (đã grep toàn bộ `src/` xác nhận). `attemptSaveShared()` hết-retry (dòng ~318)
  cũng chỉ `console.warn`.

**Hệ quả:** nếu 1 client bị conflict liên tục qua cả 3 lần retry (kịch bản hiếm — 2+ tab cùng ghi dồn dập
vào đúng 1 Space trong vài trăm mili-giây, hoặc member khác trong Shared Space ghi liên tục cùng lúc) —
thay đổi của người dùng biến mất khỏi server nhưng UI hoàn toàn im lặng, người dùng tưởng đã lưu xong. Đây
đúng là **dạng lỗi gốc** mà toàn bộ Phần B được xây ra để chặn — chỉ còn đúng 1 khe hở cuối cùng chưa nối
dây, xác suất thấp hơn nhiều so với bug gốc nhưng cùng bản chất "mất dữ liệu âm thầm".

### 6.2 Touchpoint & luồng

1. User đang sửa dữ liệu ở 1 Space, trong lúc 1 client khác (chính họ mở 2 tab, hoặc member Shared Space
   khác) cũng đang ghi dồn dập vào đúng Space đó.
2. Debounce 600ms (private)/800ms (shared) trôi qua → `attemptSavePrivate`/`attemptSaveShared` chạy, dính
   conflict 3 lần liên tiếp (`retriesLeft` về 0).
3. **Hiện tại:** im lặng hoàn toàn. **Sau khi sửa:** banner cảnh báo hiện lên — tái dùng đúng UI banner đã
   có (`App.tsx` dòng ~173-181: góc dưới-phải, icon `AlertTriangle`, viền `--reminder-color`).
4. Banner tự tắt khi lần save kế tiếp của đúng kênh đó (private hoặc shared) thành công — không cần thao
   tác gì từ user, đúng hành vi banner hiện tại của kênh `settings`.

### 6.3 UX — tái dùng nguyên banner đã có, KHÔNG tạo UI mới

Đề xuất: dùng lại **đúng 1 banner đã có**, không tạo banner riêng phân biệt "lỗi mạng" và "lỗi conflict".
Lý do:
- Đúng tinh thần gọn nhẹ của dự án — không nhân bản UI cho 1 tình huống hiếm, cùng bản chất "chưa lưu
  được, thử lại sau".
- Nội dung hiện tại ("có thể do mất mạng... sẽ tự thử lưu lại ở lần sửa kế tiếp") đã dùng chữ "có thể" —
  đủ tổng quát, không sai lệch dù nguyên nhân thực là conflict thay vì mất mạng.
- Điểm chưa hoàn toàn chính xác (chấp nhận được, không sửa chữ): câu "tự thử lưu lại ở lần sửa kế tiếp"
  chưa nhắc tới việc hệ thống **cũng tự thử lại khi tab bị ẩn/đóng** (`visibilitychange` handler đã có,
  gọi lại `attemptSavePrivate`/`attemptSaveShared` cho các pending còn treo) — không chỉ đợi "lần sửa kế
  tiếp". Không sai, chỉ chưa đủ chi tiết — không cần sửa vì làm phức tạp hơn giá trị mang lại.

### 6.4 Việc cần làm

1. Viết `setSharedFallbackActive(active: boolean)` trong `supabaseStore.ts`, mirror chính xác
   `setPrivateFallbackActive` (cùng cơ chế OR vào `notifyFallback()`).
2. Trong `attemptSavePrivate()`: gọi `setPrivateFallbackActive(true)` ở nhánh hết-retry (cạnh
   `console.warn` hiện có, dòng ~212), và `setPrivateFallbackActive(false)` ở nhánh `result.ok` thành công
   (dòng ~200-205, hiện chưa gọi).
3. Tương tự cho `attemptSaveShared()` với `setSharedFallbackActive`.
4. Thêm unit test cho đúng 2 nhánh "hết retry → gọi fallback callback" (private + shared) — hiện 2 hàm
   này **không có test nào** dù là chỗ rủi ro nhất trong app. Test tối thiểu: mock `savePrivateSpace`/
   `saveSharedSpace` luôn trả `conflict: true`, gọi `attemptSavePrivate`/`attemptSaveShared`, xác nhận
   callback fallback được gọi đúng 1 lần **sau khi** hết 3 lượt retry (không gọi sớm hơn), và được gọi lại
   với `false` ngay khi 1 lượt save kế tiếp thành công.

### 6.5 Edge Cases

| Case | Hành vi mong đợi |
|---|---|
| Save Space A hết-retry (banner bật) → save Space B (khác Space) thành công ngay sau đó | Banner **vẫn hiện** — đang OR nhiều kênh, Space A vẫn chưa lưu được. Hạn chế đã biết của thiết kế "1 banner boolean chung, không chỉ đích danh Space nào lỗi" — chấp nhận được ở quy mô hiện tại, không mở rộng thành banner theo từng Space trong đợt này (xem câu hỏi mở #1). |
| Cùng 1 Space, hết-retry rồi lại conflict tiếp ở lượt kế | Banner giữ nguyên `true` cho tới khi có 1 lượt `ok: true` — không giới hạn số lần hiện lại. |
| User đóng tab quá nhanh, trước khi `visibilitychange` flush kịp chạy xong | Rủi ro mất thay đổi đã biết, ngoài phạm vi đợt vá này (không có offline-queue, đã chốt ở `requirements.md` mục 10) — không xử lý thêm. |

### 6.6 Acceptance Criteria

- AC1: Mock `savePrivateSpace` luôn trả `{ ok: false, conflict: true }` → sau đúng 3 lần retry,
  `setPrivateFallbackActive(true)` được gọi (kiểm bằng unit test).
- AC2: Ngay sau AC1, mock đổi sang trả `{ ok: true }` cho lượt save kế tiếp của cùng Space →
  `setPrivateFallbackActive(false)` được gọi.
- AC3: Lặp lại AC1/AC2 cho `saveSharedSpace`/`setSharedFallbackActive` (hàm mới).
- AC4: Test tay: banner **không** xuất hiện trong luồng dùng bình thường (không conflict) — không có
  false-positive.
- AC5: `npx tsc --noEmit` + `npm run build` + `npx vitest run` pass.

### 6.7 Câu hỏi mở

**Không còn câu hỏi mở nào chặn bắt đầu code.** Cả 2 câu dưới đây đã được chủ dự án xác nhận (2026-07-10),
theo đúng default `ba` đề xuất:

1. ~~Có cần banner phân biệt theo từng Space (thay vì 1 boolean chung)?~~ **Đã chốt: KHÔNG cần** — giữ 1
   banner chung như hiện tại (đúng gọn nhẹ, tình huống hiếm, banner hiện tại vốn đã không chỉ đích danh
   nguyên nhân/Space).
2. ~~Xác nhận việc tái dùng nguyên banner cũ thay vì tạo thông điệp riêng cho conflict?~~ **Đã chốt: tái
   dùng nguyên banner lỗi lưu đã có** (mục 6.3, kênh `settings`) — không viết message riêng cho nhánh
   hết-retry conflict.
