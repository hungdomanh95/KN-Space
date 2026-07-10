# Tách bảng item-level — file tiến độ

> Nguồn sự thật: `docs/features/item-level-entity-tables.md` (phân tích + thiết kế đã qua `dev` review đầy đủ, 2026-07-10). File này theo dõi tiến độ triển khai — làm cuốn chiếu đúng 1 phần/lượt, KHÔNG tự nhảy phần khi chưa được yêu cầu.
>
> **Tạm dừng theo yêu cầu chủ dự án (2026-07-10) — CHƯA CODE GÌ.** Toàn bộ nội dung dưới đây là checkpoint để phiên làm việc sau (có thể là ngày mai) đọc lại và tiếp tục đúng chỗ, không phải dò lại từ đầu.
>
> **Cập nhật cùng ngày (2026-07-10, muộn hơn) — ĐÃ CHỐT.** Xem `docs/features/conflict-handling-simplification.md`
> (đã được chủ dự án đồng ý toàn bộ, `dev` đã triển khai xong phần Space-level và push lên `main`). Quyết
> định #1 (schema, Phương án B — 9 bảng tách riêng theo loại Space) **giữ nguyên, không đổi**. Chỉ riêng
> phần "version-check" trong quyết định thiết kế bị thay: bỏ version-check + retry (Hướng 1, blind
> last-write-wins) + thêm refresh RAM khi tab quay lại active (Hướng 2) — áp dụng cho item-level khi tới
> lượt code từng entity (xem `item-level-entity-tables.md` mục 3.4). A1 gốc ("hết lượt retry") không còn
> khái niệm để làm — đã được thay bằng banner lỗi mạng chung, xem chi tiết ở mục "Quyết định đã chốt" #7
> và "Việc tiếp theo" #1 bên dưới.

**Trạng thái tổng quan:** 🔶 ĐANG LÀM — Bước 1 (entity Log): sub-bước 1-4 xong, sub-bước 5 (migrate) đã chạy SQL + migrate dữ liệu thật, và **Giai đoạn A đã bật** (2026-07-11, cờ `LOG_ITEM_PERSIST_ENABLED = true` — mọi action `LOG_*` giờ dual-write thật vào `kn_private_logs`/`kn_shared_logs`). **Giai đoạn B (cutover phần đọc) VẪN ⬜ CHƯA LÀM** — phần đọc Nhật ký nhanh 100% vẫn qua cột `logs` jsonb như cũ, `loadPrivateLogs`/`loadSharedLogs` chưa được gọi ở đâu — xem mục "Việc tiếp theo" #3 bên dưới.

---

## Quyết định đã chốt (2026-07-10)

1. **Schema: Phương án B — 9 bảng tách riêng theo loại Space** (`kn_private_tasks`/`kn_shared_tasks`, `kn_private_notes`/`kn_shared_notes`, `kn_private_habits` (không có bản shared), `kn_private_reminders`/`kn_shared_reminders`, `kn_private_logs`/`kn_shared_logs`) — mirror đúng pattern `kn_private_spaces`/`kn_shared_spaces` đã có. **Đảo ngược khuyến nghị ban đầu của `ba`** (5 bảng dùng chung polymorphic FK) sau khi `dev` phản biện bằng số liệu cụ thể (xem `item-level-entity-tables.md` mục 10, câu hỏi #1).
2. **Tầng storage: action-level persist** (không phải diff-mảng) — mỗi action CRUD (21 action type, đã đếm chính xác qua `SPACE_DOMAIN_ACTION_TYPES` trong `appReducer.ts`) tính sẵn descriptor khi dispatch, đẩy vào hàng đợi debounce theo `itemId`. Tách riêng module `state/itemPersist.ts` (không nhồi vào `smartDispatch` đang có sẵn trong `AppStateContext.tsx`).
3. **`order` (Task/Note): fractional-index** — số thực, chỉ 1 dòng đổi khi kéo-thả, thay vì reindex toàn mảng. `dev` xác nhận không có chỗ nào khác trong code giả định `order` là số nguyên liên tục.
4. **`assignee_ids`: giữ `jsonb`** (không đổi sang `uuid[]`).
5. **`createdAt` (Reminder/Log): bỏ field riêng, dùng thẳng cột DB `created_at`** — nhưng migration/import PHẢI set tường minh giá trị cũ, không để DB tự `now()`.
6. **Thứ tự migrate 5 entity: độ đơn giản tăng dần — Log → Habit → Reminder → Task → Note**, có thêm 1 bước con "viết + unit-test fractional-index độc lập" trước khi đụng Task (theo tinh chỉnh của `dev`).
7. ~~A1 (banner cảnh báo hết-retry, `storage-architecture-fix.md` mục 6): làm ngay, độc lập, không chờ việc lớn này~~ — **đã bị thay thế, không còn làm theo mô tả gốc.** Khái niệm "hết lượt retry" không còn tồn tại sau khi bỏ version-check (Hướng 1, `conflict-handling-simplification.md` mục 2.1/3). Đã code xong và push: banner lỗi mạng chung, nối vào nhánh `catch` (lỗi network/server thật) của `attemptSavePrivate`/`attemptSaveShared` — bảo vệ đúng giá trị cốt lõi A1 muốn (không để user tưởng đã lưu trong khi chưa), phạm vi rộng hơn A1 gốc (bắt cả lỗi network vốn đang bị bỏ sót). Xem `conflict-handling-simplification.md` mục 3.

## Phát hiện mới cần xử lý trước (không thuộc entity nào)

**Bug tiềm ẩn: 3 chỗ sort theo `createdAt` bằng `localeCompare` (so chuỗi) thay vì `Date`** — `src/features/logs/LogsBlock.tsx:48`, `src/features/logs/ExpenseSummaryPanel.tsx:163`, `src/layout/MobileChatScreen.tsx:34` (chỗ này quan trọng nhất — màn hình chính mobile). Định dạng timestamp cũ (`Z`) trộn với định dạng Postgres trả về (`+00:00`) trong lúc migrate sẽ làm sai thứ tự hiển thị. **Phải sửa cả 3 chỗ (đổi sang `new Date(x).getTime()`) TRƯỚC khi bắt đầu Bước 1 của entity đầu tiên.**

---

## Việc tiếp theo — 3 việc độc lập (2 đã xong, 1 đang làm dở)

### 1. ✅ A1 — Banner cảnh báo lỗi lưu (đã xong, bằng cách khác)
Đã code xong và push lên `main`. Không phải "banner hết lượt retry" như thiết kế gốc (`storage-architecture-fix.md` mục 6.4/6.6) — retry đã bị bỏ hoàn toàn theo Hướng 1. Thay vào đó là banner lỗi mạng/lỗi server chung, nối vào nhánh `catch` thật sự thất bại của `attemptSavePrivate`/`attemptSaveShared`. Xem `docs/features/conflict-handling-simplification.md` mục 3.

### 2. ✅ Sửa 3 chỗ `localeCompare` timestamp
Đã sửa cả 3 vị trí (`LogsBlock.tsx`, `ExpenseSummaryPanel.tsx`, `MobileChatScreen.tsx` — dùng `new Date(x).getTime()` để so sánh thay vì so chuỗi). **Ghi chú minh bạch (2026-07-10):** khi phiên làm việc hiện tại (Bước 1, entity Log) bắt đầu, code đã ở trạng thái sửa xong sẵn trong working tree (khả năng do 1 phiên/luồng làm việc khác đã áp dụng trước đó) nhưng **CHƯA COMMIT** — không phải do lượt làm việc Log này tạo ra, chỉ xác nhận lại và giữ nguyên. Chủ dự án cần tự `git status`/`git diff` kiểm tra + quyết định commit cụm thay đổi này khi thấy phù hợp.

### 3. 🔶 Bước 1 — entity Log (`kn_private_logs`/`kn_shared_logs`) — sub-bước 1-5 xong (Giai đoạn A đã bật), Giai đoạn B (cutover đọc) CHƯA làm
Theo đúng 5 bước con đã mô tả ở `item-level-entity-tables.md` mục 7:

1. ✅ **Bảng mới** — `docs/features/item-level-log-schema.sql` (file mới, CHƯA chạy lên Supabase Dashboard thật). `kn_private_logs`/`kn_shared_logs`, mirror đúng `kn_private_spaces`/`kn_shared_spaces` (id client-sinh, `version`/trigger giữ nguyên nhưng không dùng version-check, `created_at` không dựa vào default `now()` — app luôn gửi tường minh).
2. ✅ **RLS 2 nhánh tách biệt** — gộp trong cùng file SQL trên. Private: `auth.uid() = user_id` (mirror `kn_private_spaces`). Shared: `is_space_member(space_id)` (mirror `kn_shared_spaces`, tái dùng helper function đã có, không viết lại).
3. ✅ **Storage layer** — `src/storage/logStore.ts` (CRUD: `loadPrivateLogs`/`loadSharedLogs`/`createLog`/`insertLogsBulk`/`updateLogExpense`/`deleteLog`/`deleteLogs`/`listExistingLogIds`, ghi thẳng blind write theo đúng quyết định #5 mục trên). `src/state/itemPersist.ts` (module MỚI, tách riêng khỏi `smartDispatch` theo đúng quyết định #2 — debounce theo `itemId` 600ms, gộp nhiều sửa liên tiếp cùng item qua `mergeLogPendingOp()`, chuỗi hoá (chain) các lượt flush của CÙNG 1 item qua `inFlight` map để tránh 2 request bay song song cho cùng item).
4. ✅ **Tích hợp dispatch** — `AppStateContext.tsx` (`smartDispatch`) gọi `handleLogActionForPersist()` cho mọi action `LOG_*`, độc lập với luồng save Space-level (`kn_private_spaces.logs`/`kn_shared_spaces.logs` jsonb — VẪN LÀ NGUỒN THẬT, không đổi gì). **Cách xử lý "code mới chạy song song code cũ":** cờ `LOG_ITEM_PERSIST_ENABLED = false` (đầu `src/state/itemPersist.ts`) — khi `false`, `handleLogActionForPersist()` chỉ làm đúng 1 việc (tự sinh `id` cho `LOG_CREATE` nếu thiếu, mirror `TASK_CREATE`), KHÔNG gọi bất kỳ hàm nào trong `logStore.ts` (không network call nào tới `kn_private_logs`/`kn_shared_logs` — 2 bảng này thậm chí CHƯA tồn tại thật, gọi vào sẽ lỗi "relation does not exist" nếu không có cờ chặn). Chỉ đổi `true` sau khi: (a) đã chạy `item-level-log-schema.sql`, (b) đã chạy `window.knMigrateLogs.run()` cho User B sạch. Bật cờ = đổi đúng 1 dòng, không cần viết lại tầng persist.
5. ✅ **Migration** — `docs/features/item-level-log-schema.sql` đã chạy thật trên Supabase Dashboard, `window.knMigrateLogs.run()` đã chạy xong cho dữ liệu cũ (2 bảng `kn_private_logs`/`kn_shared_logs` tồn tại thật, có dữ liệu). **Giai đoạn A đã bật (2026-07-11)** — `LOG_ITEM_PERSIST_ENABLED = true`, đúng theo đề xuất đã duyệt ở "Câu hỏi mở #2" bên dưới: chỉ dual-write (ghi song song bảng mới), **KHÔNG cutover phần đọc**. `loadPrivateLogs()`/`loadSharedLogs()` vẫn CHƯA được nối vào bootstrap/`refreshStaleSpaces` — đó là **Giai đoạn B, vẫn ⬜ CHƯA LÀM**, cần duyệt riêng trước khi code (xem 3 lưu ý bắt buộc ở mục câu hỏi #2).

**Cách test Giai đoạn A (đã bật cờ thật):**
- `npx tsc --noEmit` và `npm run build` — cả 2 PASS (không lỗi).
- `npm test` — 45/45 test pass, không đổi so với lượt trước (không sửa logic, chỉ đổi 1 boolean + comment).
- **Môi trường dev hiện tại (agent) không tự đăng nhập Google OAuth được** — không thao tác UI thật để xác nhận runtime bằng tay. Đã xác nhận thay thế bằng: (1) code review kỹ đường đi `smartDispatch` → `handleLogActionForPersist()` → `queueLogPersist`/`flushLogItem` → `createLog`/`updateLogExpense`/`deleteLog`/`deleteLogs` (`logStore.ts`) — field/bảng/scope khớp đúng; (2) gọi thẳng REST API bảng `kn_private_logs`/`kn_shared_logs` bằng anon key qua `curl`, nhận `200 []` (không phải lỗi "relation does not exist") — xác nhận 2 bảng tồn tại thật trên Supabase.
- **Chủ dự án cần tự test tay 1 lượt** (xem hướng dẫn chi tiết trong báo cáo `dev` gửi kèm việc này): tạo 1 log mới ở Space cá nhân + 1 log ở Shared Space, mở DevTools > Network lọc `kn_private_logs`/`kn_shared_logs`, xác nhận có request `POST` (tạo), `PATCH` (sửa hạng mục chi tiêu), `DELETE` (xoá) tương ứng; đối chiếu lại trong Supabase Table Editor thấy dòng mới/đã cập nhật đúng. UI hiển thị Nhật ký nhanh vẫn phải giống hệt trước (vì đọc vẫn qua jsonb) — nếu UI có gì khác lạ, đó là dấu hiệu bất thường cần báo lại ngay.
- Đọc code review: `src/storage/logStore.ts`, `src/state/itemPersist.ts`, đoạn tích hợp trong `src/state/AppStateContext.tsx` (`smartDispatch`, tìm `isLogAction`/`handleLogActionForPersist`), `docs/features/item-level-log-schema.sql`.

## ❓ Câu hỏi mở / quyết định phát sinh giữa chừng

1. ~~Có muốn bắt đầu việc #3 (tách bảng Log) trong CÙNG lượt với việc #1 + #2, hay làm #1 + #2 trước?~~ **Đã trả lời (2026-07-10):** chủ dự án xác nhận bắt đầu Bước 1 (Log) trực tiếp, việc #1/#2 hoá ra đã xong sẵn từ trước (xem ghi chú ở mục 2 trên).
2. **[MỞ]** Sub-bước 4 (tích hợp) hiện dùng model "Space-level jsonb VẪN LÀ NGUỒN THẬT, item-level chỉ ghi song song nhưng bị khoá bởi cờ" — khi tới lúc cutover thật (sau khi migrate xong + bật cờ), cần quyết định: có tiếp tục ghi CẢ HAI nơi (jsonb + bảng mới) 1 thời gian làm lưới an toàn trước khi đổi hẳn nguồn đọc sang bảng mới không, hay cutover dứt khoát luôn (đọc/ghi bảng mới, ngừng ghi jsonb `logs` ngay khi bật cờ)? Mirror quyết định đã áp dụng cho cột `spaces` cũ của `kn_space_state` (giữ lại "chết" 1 thời gian an toàn, xem `storage-architecture-fix-progress.md` Bước 3, quyết định #1) có thể là hướng hợp lý, nhưng CHƯA quyết định chính thức — cần bàn khi resume tới bước cutover, không phải bây giờ.

   **Cập nhật điều tra (2026-07-11, `dev` review theo yêu cầu chủ dự án trước khi bật cờ):** Đã xác nhận bằng code + `grep` toàn repo — `loadPrivateLogs()`/`loadSharedLogs()` (`logStore.ts`) **không được gọi ở bất kỳ đâu** ngoài định nghĩa của chính chúng. Phần đọc UI (`space.logs`) 100% vẫn qua `loadPrivateSpaces()`/`loadSharedSpaces()` (bootstrap, `AppStateContext.tsx:105,127`) và `refreshStaleSpaces()` (tab active lại, dòng 360-372) — tức mảng `logs` jsonb. Việc ghi jsonb (`privateSnapshot()` dòng 78, snapshot shared dòng 306/319) chạy qua `useEffect` diff-snapshot Space-level **độc lập hoàn toàn** với `LOG_ITEM_PERSIST_ENABLED`, KHÔNG bị tắt khi bật cờ. Kết luận quan trọng: **bật cờ ngay bây giờ AN TOÀN về mặt hiển thị** (không có bug "log biến mất khỏi UI" — jsonb vẫn được ghi/đọc y như cũ), nhưng **CHƯA đạt mục tiêu "Nhật ký nhanh hoạt động qua bảng mới"** như câu chữ mục "Việc tiếp theo" #3 sub-bước 5 (4) phía trên đang ngầm giả định — bật cờ hiện tại chỉ cộng thêm 1 đường ghi song song (dual-write) vào bảng mới, không có tác dụng gì lên hiển thị vì chưa có phần đọc nối vào.

   Rủi ro phụ phát hiện thêm: `setPrivateFallbackActive`/`setSharedFallbackActive` (banner "lỗi lưu" toàn app, `supabaseStore.ts:222-231`) đang dùng CHUNG giữa kênh save Space-level thật và kênh ghi item-level Log (`itemPersist.ts` gọi cùng 2 hàm này ở `flushLogItem`). Nếu ghi item-level Log thất bại (RLS/timeout thoáng qua) trong khi jsonb vẫn ghi thành công, user sẽ thấy banner lỗi giả dù dữ liệu thực đã an toàn — không mất dữ liệu nhưng gây hoang mang, nên cân nhắc tách kênh báo lỗi riêng khi làm giai đoạn B dưới đây.

   **Đề xuất hướng làm:**
   - **Giai đoạn A — ✅ ĐÃ BẬT (2026-07-11):** `LOG_ITEM_PERSIST_ENABLED = true`, KHÔNG đổi phần đọc. Mục đích: để bảng mới tự "đuổi kịp" mọi log phát sinh mới trong vài ngày/tuần, giảm rủi ro lệch dữ liệu trước khi cutover đọc. `npx tsc --noEmit`/`npm run build`/`npm test` (45/45) đều pass sau khi bật. Chủ dự án cần tự test tay theo hướng dẫn ở mục "Việc tiếp theo" #3 sub-bước 5 trên (môi trường agent không tự login OAuth được).
   - **Giai đoạn B — ⬜ CHƯA LÀM, cần duyệt riêng trước khi code:** nối phần đọc — thêm bước gọi `loadPrivateLogs`/`loadSharedLogs` cho từng Space (song song qua `Promise.all`) tại đúng 2 chỗ đang gọi `loadPrivateSpaces()`/`loadSharedSpaces()` (bootstrap + `refreshStaleSpaces`), gán đè `space.logs` bằng kết quả, chỉ chạy khi cờ `true` (giữ nguyên hành vi cũ khi cờ `false`). Lưu ý bắt buộc khi làm: (1) lỗi load riêng 1 Space không được fail cả app — fallback dùng `logs` jsonb đã có sẵn cho Space đó; (2) phải cập nhật `prevPrivateRef`/`prevSharedRef` (baseline diff-snapshot) NGAY lúc gán đè, nếu không sẽ tự bắn 1 lượt PATCH thừa lên `kn_private_spaces`/`kn_shared_spaces` ngay sau khi hydrate xong (đúng loại bug mà comment dòng 307-310 hiện có đã cẩn thận né cho baseline shared); (3) `refreshStaleSpaces()` phải bỏ qua Space đang có log-item pending trong `itemPersist.ts`'s `pending` map, không ghi đè logs đang chờ debounce. Sau khi giai đoạn B ổn định thêm 1 thời gian mới cân nhắc tắt hẳn nhánh ghi `logs` vào jsonb (tuỳ chọn, không bắt buộc — có thể để "chết" song song vô hại, mirror cách xử lý cột `spaces` cũ). **Nên để chạy Giai đoạn A vài ngày trước khi bắt đầu B**, đúng mục đích ban đầu của A (đuổi kịp dữ liệu, giảm rủi ro lệch).
3. **[MỞ]** Race hiếm khi tạo Space cá nhân MỚI rồi lập tức thêm Log ngay khi INSERT Space vào `kn_private_spaces` chưa kịp hoàn tất (async, qua `useEffect` debounce riêng) — `handleLogActionForPersist()` đã có guard bỏ qua persist item-level khi `currentSpace._privateVersion === undefined` (Space chưa có hàng thật để làm FK cha), log vẫn lưu bình thường qua đường jsonb cũ, KHÔNG mất dữ liệu — chỉ là log đó sẽ persist item-level ở lần sửa KẾ TIẾP thay vì ngay lập tức. Chấp nhận được, ghi nhận ở đây để không quên khi review lại trước khi bật cờ.

---

## Nguyên tắc bắt buộc khi triển khai (nhắc lại từ tài liệu chính + `dev.md`)

- Đúng 1 phần/lượt, `npx tsc --noEmit` + `npm run build` pass, cập nhật file tiến độ này ngay, dừng báo cáo — không tự nhảy sang phần kế tiếp.
- Sub-bước 5 (migrate thật) đụng dữ liệu thật — không đụng tài khoản chính chủ (User A) cho tới khi đã test sạch bằng tài khoản Google phụ (User B), đúng quy trình đã áp dụng thành công ở `storage-architecture-fix-progress.md`.
- Mọi câu lệnh SQL chạm hạ tầng thật (tạo bảng, RLS, migration) — `dev` chỉ chuẩn bị, KHÔNG tự chạy lên Supabase Dashboard thật.
- Câu hỏi mở/quyết định phát sinh giữa chừng → ghi vào đây kèm ngày, không tự quyết âm thầm.
