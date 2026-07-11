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

**🎉 MỐC HOÀN TẤT (2026-07-11):** cả **5/5 entity** (Log/Habit/Reminder/Task/Note) đều đã xong Giai đoạn A (dual-write) + Giai đoạn B (cutover phần đọc) trong kế hoạch tách bảng item-level (`docs/features/item-level-entity-tables.md`). Toàn bộ 6 khối dữ liệu chính (Task/Reminder/Habit/Note/Log — Notification không thuộc kế hoạch này) giờ đọc THẬT từ bảng item-level riêng (`kn_private_*`/`kn_shared_*`), không còn qua cột jsonb gộp trên `kn_private_spaces`/`kn_shared_spaces` — dù nhánh ghi jsonb VẪN CHẠY SONG SONG làm lưới an toàn (chưa entity nào tắt nhánh này, xem câu hỏi mở #2). Còn lại: chủ dự án tự test tay UI thật qua OAuth cho Task/Note (Log/Habit/Reminder đã được test tay xong ở các lượt trước) — xem "Cách test Giai đoạn A+B (Task+Note)" ở cuối mục Bước 4/Bước 5 bên dưới; sau khi ổn định đủ lâu, cân nhắc bước tổng kết tắt nhánh ghi jsonb cũ (câu hỏi mở #2).

**🧹 DỌN DẸP SAU MỐC HOÀN TẤT (2026-07-11, "Việc 1" + "Việc 2") — ĐÃ LÀM XONG.** Câu hỏi mở #2 giờ đã CHỐT: tắt hẳn nhánh ghi jsonb song song cho CẢ 5 entity (không chỉ 1 vài entity) + gỡ 5 `window.knMigrate<Entity>` khỏi `main.tsx`. Xem mục "Câu hỏi mở #2" bên dưới (đã cập nhật trạng thái) và mục MỚI "Việc 1 + Việc 2 — dọn dẹp dual-write jsonb" ngay sau đây để biết chi tiết đầy đủ (file đã sửa, cách test, rủi ro phát hiện thêm).

### Việc 1 + Việc 2 — dọn dẹp dual-write jsonb (2026-07-11)

**Việc 1 — tắt ghi jsonb Space-level cho 5 entity:**
- `src/state/AppStateContext.tsx`: `privateSnapshot()` thu hẹp còn `name`/`order`/`enabledBlocks` (bỏ `tasks`/`reminders`/`habits`/`notes`/`logs`). Thêm hàm mới `sharedSnapshot()` (`name`/`enabledBlocks`) thay cho object literal lặp lại 3 chỗ (`pendingSharedSavesRef`, debounce effect shared, `refreshStaleSpaces()`, `saveNow()`).
- `src/storage/privateSpaceStore.ts`: `toRowPayload()` (dùng chung cho `createPrivateSpace`/`upsertPrivateSpaces`) bỏ 5 field entity — Space mới tạo dựa vào default cột DB (`'[]'::jsonb`), không gửi tường minh mảng rỗng nữa. `savePrivateSpace()` thu hẹp type `patch` còn `Partial<Pick<Space, 'name' | 'order' | 'enabledBlocks'>>`.
- `src/storage/sharedSpaceStore.ts`: `saveSharedSpace()` thu hẹp type `patch` còn `Partial<Pick<Space, 'name' | 'enabledBlocks'>>`.
- **KHÔNG đụng phần ĐỌC** (`rowToSpace()`/`loadPrivateSpaces()`/`loadSharedSpaces()` vẫn SELECT + map đủ 5 cột jsonb như cũ) — đây là lưới an toàn thụ động, giữ nguyên để còn dùng làm fallback khi `hydrateItemLevelXXX()` lỗi (xem `AppStateContext.tsx`).
- `supabase/schema.sql`: thêm comment đánh dấu 5 cột jsonb ở `kn_private_spaces` + 4 cột (`tasks`/`notes`/`reminders`/`logs`, không có `habits`) ở `kn_shared_spaces` là LỊCH SỬ — không xoá/ALTER/DROP gì.

**Điểm rủi ro cao nhất — luồng Import JSON (`IMPORT_DATA`):** trước khi sửa, cơ chế DUY NHẤT ghi entity data khi import là `upsertPrivateSpaces()` ghi vào cột jsonb (qua `toRowPayload()`) — sau khi Giai đoạn B cutover đọc sang bảng item-level, việc này **đã ngầm trở thành vô tác dụng lên hiển thị ngay cả TRƯỚC KHI làm Việc 1** (jsonb có ghi đúng nhưng UI không đọc từ đó nữa) — chỉ là chưa ai nhận ra vì chưa test lại import sau cutover. Việc 1 giờ dừng hẳn việc ghi jsonb đó (vốn đã vô dụng), và bổ sung cơ chế ĐÚNG: module mới **`src/storage/importSync.ts`** (hàm `syncImportedSpaceItems(space)`) — với TỪNG Space cá nhân vừa import, xoá sạch item-level cũ (`deleteAllTasksForSpace`/`deleteAllNotesForSpace`/`deleteAllHabitsForSpace`/`deleteAllRemindersForSpace`/`deleteAllLogsForSpace` — hàm MỚI thêm ở 5 store, xoá theo `space_id`) rồi bulk-insert lại từ dữ liệu import (`insertTasksBulk`/`insertNotesBulk`/`insertHabitsBulk`/`insertRemindersBulk`/`insertLogsBulk` — tái dùng hàm đã có sẵn từ migration). Gọi trong `AppStateContext.tsx` (nhánh `IMPORT_DATA` của `smartDispatch`) NGAY SAU khi `upsertPrivateSpaces()` thành công, dùng `result.spaces` (giữ nguyên `tasks`/`notes`/... từ input). Trả `{ ok: false }` nếu có entity nào insert lỗi → caller tự bật banner lỗi mạng (`setPrivateFallbackActive(true)`).
- Tách riêng thành module `storage/importSync.ts` (không để trong `AppStateContext.tsx`) vì đây thuần là storage-orchestration, không phụ thuộc React — dễ test độc lập.
- **Test mới:** `src/storage/importSync.test.ts` (5 test, mock cả 5 store) — xác nhận gọi đúng xoá/insert cho ĐÚNG 5 entity với payload đúng shape; xoá xong HẾT rồi mới insert (không xen kẽ); 1 entity xoá lỗi không chặn entity khác; 1 entity insert lỗi → `{ ok: false }` nhưng 4 entity còn lại vẫn được insert đầy đủ; Space rỗng vẫn gọi xoá đủ 5 entity + insert mảng rỗng.

**Việc 2 — gỡ window.knMigrate<Entity>:** `src/main.tsx` xoá 5 khối `window.knMigrateLogs/Habits/Reminders/Tasks/Notes` (và import tương ứng) — **GIỮ NGUYÊN** `window.knMigrateLegacySpaces`. 5 file `src/storage/migrateLegacy{Logs,Habits,Reminders,Tasks,Notes}.ts` giữ nguyên trong repo (không import ở đâu, không ảnh hưởng bundle).

**2 rủi ro PHÁT HIỆN THÊM khi làm Việc 1 (2026-07-11), CHƯA xử lý trong lượt này — cần chủ dự án quyết định:**

1. **`src/storage/migrateLegacySpaces.ts` (`runLegacySpacesMigration()`) có CÙNG lỗ hổng như IMPORT_DATA từng có, nhưng ĐỘC LẬP với Việc 1 (đã tồn tại từ TRƯỚC, không phải do Việc 1 gây ra).** Hàm này migrate Space từ `kn_space_state.spaces[]` (định dạng CỰC CŨ, trước cả Phase tách `kn_private_spaces`) sang `kn_private_spaces` qua `upsertPrivateSpaces(toMigrate)` — `toMigrate` có thể mang theo tasks/notes/habits/reminders/logs THẬT (đọc từ blob cũ). Dù trước hay sau Việc 1, dữ liệu entity đó **KHÔNG BAO GIỜ được ghi vào bảng item-level** (chỉ IMPORT_DATA có `syncImportedSpaceItems()` mới làm việc này) — nếu Giai đoạn B đã cutover đọc (đúng tình trạng hiện tại), Space migrate xong bằng con đường này sẽ hiện đúng tên/cấu hình nhưng **RỖNG task/note/habit/reminder/log** ngay khi hydrate, dù dữ liệu gốc trong `kn_space_state.spaces[]` vẫn còn nguyên (không mất vĩnh viễn, nhưng "biến mất" khỏi tầm với của app trừ khi tự viết thêm 1 lượt sync tương tự `syncImportedSpaceItems()`). **Không sửa trong lượt này** (ngoài phạm vi 2 việc được giao, và rủi ro thực tế RẤT THẤP — migration này về bản chất đã vestigial, tài khoản chính chủ dự án được cho là đã chạy xong từ lâu trước khi có kế hoạch tách bảng item-level). Nếu chủ dự án xác nhận còn cần dùng lại `window.knMigrateLegacySpaces` cho 1 tài khoản nào đó chưa migrate, PHẢI vá thêm bước gọi `syncImportedSpaceItems()`-tương-tự trước khi chạy thật.
2. **`saveNow` (`AppStateContext.tsx`) hiện là DEAD CODE** — grep toàn repo xác nhận không có nơi nào gọi (`SettingsModal`/`SpaceFormModal`/`HabitFormModal`/`TaskFormModal`/`SpaceInviteModal`/`NoteViewModal`/`NoteFormModal`/`ReminderFormModal` đều chỉ dùng `dispatch` thường). Hàm này gọi THẲNG `dispatch` (raw, từ `useReducer`), KHÔNG qua `smartDispatch` — nghĩa là nếu sau này có ai wire nó vào 1 nút "Lưu" nào đó cho `TASK_CREATE`/`NOTE_UPDATE`/..., action đó sẽ KHÔNG được `handleTaskActionForPersist()`/... xử lý, dữ liệu entity KHÔNG được ghi vào bảng item-level (nguồn đọc thật hiện nay) — chỉ cập nhật RAM cục bộ rồi "mất" ngay khi F5. Đã thêm comment cảnh báo rõ tại khai báo `saveNow` trong `AppStateContext.tsx`. Đây là ví dụ đúng loại rủi ro "mang pattern cũ (Space-level là nguồn ghi duy nhất) sang bối cảnh mới (item-level) mà không đánh giá lại" — may là chưa có ai dùng tới.

**Trạng thái tổng quan:** 🔶 ĐANG LÀM — Bước 1 (entity Log): sub-bước 1-4 xong, sub-bước 5 (migrate) đã chạy SQL + migrate dữ liệu thật, **Giai đoạn A đã bật** (2026-07-11, cờ `LOG_ITEM_PERSIST_ENABLED = true` — mọi action `LOG_*` dual-write thật vào `kn_private_logs`/`kn_shared_logs`), và **Giai đoạn B (cutover phần đọc) ĐÃ CODE XONG** (2026-07-11, cùng ngày — `dev` review kỹ, CHƯA test tay UI thật, chờ chủ dự án tự test qua OAuth thật). Bootstrap + `refreshStaleSpaces()` giờ gọi `loadPrivateLogs`/`loadSharedLogs` cho từng Space, gán đè `space.logs`. Cột `logs` jsonb VẪN được ghi song song (dual-write, chưa tắt) — xem mục "Việc tiếp theo" #3 bên dưới.

**Bước 2 (entity Habit) — sub-bước 1-5 xong, Giai đoạn A đã bật (2026-07-11), Giai đoạn B ĐÃ CODE XONG (2026-07-11, cùng ngày).** Chủ dự án đã tự chạy `item-level-habit-schema.sql` + migrate dữ liệu thật (User B test sạch trước, sau đó User A, đối chiếu 3/3 khớp, không lệch). `HABIT_ITEM_PERSIST_ENABLED = true` — mọi action `HABIT_*` dual-write thật vào `kn_private_habits`. Giai đoạn B (nối phần đọc `loadPrivateHabits` vào bootstrap/`refreshStaleSpaces`, thêm `hasPendingHabitsForSpace()`) **✅ đã code, mirror CHÍNH XÁC Log, CHƯA test tay UI thật** — chờ chủ dự án tự test qua OAuth thật. Xem chi tiết ở mục "Bước 2 — entity Habit" bên dưới.

**Bước 3 (entity Reminder) — sub-bước 1-5 xong, Giai đoạn A ĐÃ BẬT + Giai đoạn B ĐÃ CODE XONG (2026-07-11, gộp chung 1 lượt theo yêu cầu chủ dự án).** Chủ dự án đã tự chạy `item-level-reminder-schema.sql` + migrate dữ liệu thật (2/2 khớp, idempotent — đã sửa xong bug `insertRemindersBulk` trộn khoá once/recurring trước đó). `REMINDER_ITEM_PERSIST_ENABLED = true` — mọi action `REMINDER_*` dual-write thật vào `kn_private_reminders`/`kn_shared_reminders`. Giai đoạn B (nối phần đọc `loadPrivateReminders`/`loadSharedReminders` vào bootstrap/`refreshStaleSpaces`, thêm `hasPendingRemindersForSpace()`) **✅ đã code, mirror CHÍNH XÁC Log (CÓ Shared, khác Habit), CHƯA test tay UI thật** — chờ chủ dự án tự test qua OAuth thật, 1 lượt duy nhất (Giai đoạn A+B gộp, không tách 2 lượt như Log/Habit). Xem chi tiết ở mục "Bước 3 — entity Reminder" bên dưới.

**Bước 4 (entity Task, `kn_private_tasks`/`kn_shared_tasks`) — 4a + 4b ĐÃ CODE XONG, Giai đoạn A+B ĐÃ CODE XONG GỘP CHUNG (2026-07-11).** `TASK_REORDER` (`state/reducers/tasks.ts`) đã tích hợp `computeOrderForInsertAt()` thật — không còn reindex toàn mảng. Chủ dự án đã tự chạy `item-level-task-schema.sql` + migrate dữ liệu thật (30/30 khớp, idempotent đúng). `TASK_ITEM_PERSIST_ENABLED = true` — mọi action `TASK_*` dual-write thật vào `kn_private_tasks`/`kn_shared_tasks`. Giai đoạn B (nối phần đọc `loadPrivateTasks`/`loadSharedTasks` vào bootstrap/`refreshStaleSpaces`, thêm `hasPendingTasksForSpace()`) **✅ đã code, mirror CHÍNH XÁC Reminder (CÓ Shared), CHƯA test tay UI thật** — chờ chủ dự án tự test qua OAuth thật. Xem chi tiết ở mục "Bước 4 — entity Task" bên dưới.

**Bước 5 (entity Note, `kn_private_notes`/`kn_shared_notes`, CÓ bản shared — entity CUỐI CÙNG của kế hoạch) — 5a/5b + Giai đoạn A+B ĐỀU ĐÃ CODE XONG GỘP CHUNG (2026-07-11), mirror CHÍNH XÁC Task.** `NOTE_REORDER` (`state/reducers/notes.ts`) đã tích hợp `computeOrderForInsertAt()` thật — không còn reindex toàn mảng (CÓ thêm tham số `insertAfter`, khác Task). Thêm cột RIÊNG `content_updated_at` (tách khỏi trigger `updated_at`) để tránh regression: kéo-thả/ẩn-hiện KHÔNG được vô tình đổi mốc "sửa nội dung lần cuối" hiển thị cho user. Chủ dự án đã tự chạy `item-level-note-schema.sql` + migrate dữ liệu thật (7/7 khớp, idempotent đúng). `NOTE_ITEM_PERSIST_ENABLED = true` — mọi action `NOTE_*` dual-write thật vào `kn_private_notes`/`kn_shared_notes`. Giai đoạn B (nối phần đọc `loadPrivateNotes`/`loadSharedNotes` vào bootstrap/`refreshStaleSpaces`, thêm `hasPendingNotesForSpace()`) **✅ đã code, mirror CHÍNH XÁC Task, CHƯA test tay UI thật** — chờ chủ dự án tự test qua OAuth thật. **ĐÂY LÀ ENTITY CUỐI CÙNG — cả 5/5 entity đã hoàn tất Giai đoạn A+B, xem mốc hoàn tất ở đầu file.** Xem chi tiết ở mục "Bước 5 — entity Note" bên dưới.

---

## Quyết định đã chốt (2026-07-10)

1. **Schema: Phương án B — 9 bảng tách riêng theo loại Space** (`kn_private_tasks`/`kn_shared_tasks`, `kn_private_notes`/`kn_shared_notes`, `kn_private_habits` (không có bản shared), `kn_private_reminders`/`kn_shared_reminders`, `kn_private_logs`/`kn_shared_logs`) — mirror đúng pattern `kn_private_spaces`/`kn_shared_spaces` đã có. **Đảo ngược khuyến nghị ban đầu của `ba`** (5 bảng dùng chung polymorphic FK) sau khi `dev` phản biện bằng số liệu cụ thể (xem `item-level-entity-tables.md` mục 10, câu hỏi #1).
2. **Tầng storage: action-level persist** (không phải diff-mảng) — mỗi action CRUD (21 action type, đã đếm chính xác qua `SPACE_DOMAIN_ACTION_TYPES` trong `appReducer.ts`) tính sẵn descriptor khi dispatch, đẩy vào hàng đợi debounce theo `itemId`. Tách riêng module `state/itemPersist.ts` (không nhồi vào `smartDispatch` đang có sẵn trong `AppStateContext.tsx`).
3. **`order` (Task/Note): fractional-index** — số thực, chỉ 1 dòng đổi khi kéo-thả, thay vì reindex toàn mảng. `dev` xác nhận không có chỗ nào khác trong code giả định `order` là số nguyên liên tục.
4. **`assignee_ids`: giữ `jsonb`** (không đổi sang `uuid[]`).
5. **`createdAt` (Reminder/Log): bỏ field riêng, dùng thẳng cột DB `created_at`** — nhưng migration/import PHẢI set tường minh giá trị cũ, không để DB tự `now()`.
6. **Thứ tự migrate 5 entity: độ đơn giản tăng dần — Log → Habit → Reminder → Task → Note**, có thêm 1 bước con "viết + unit-test fractional-index độc lập" trước khi đụng Task (theo tinh chỉnh của `dev`). **✅ Bước con này đã xong (2026-07-11)** — xem mục "Bước 4a — fractional-index (thuần logic)" bên dưới.
7. ~~A1 (banner cảnh báo hết-retry, `storage-architecture-fix.md` mục 6): làm ngay, độc lập, không chờ việc lớn này~~ — **đã bị thay thế, không còn làm theo mô tả gốc.** Khái niệm "hết lượt retry" không còn tồn tại sau khi bỏ version-check (Hướng 1, `conflict-handling-simplification.md` mục 2.1/3). Đã code xong và push: banner lỗi mạng chung, nối vào nhánh `catch` (lỗi network/server thật) của `attemptSavePrivate`/`attemptSaveShared` — bảo vệ đúng giá trị cốt lõi A1 muốn (không để user tưởng đã lưu trong khi chưa), phạm vi rộng hơn A1 gốc (bắt cả lỗi network vốn đang bị bỏ sót). Xem `conflict-handling-simplification.md` mục 3.

## Phát hiện mới cần xử lý trước (không thuộc entity nào)

**Bug tiềm ẩn: 3 chỗ sort theo `createdAt` bằng `localeCompare` (so chuỗi) thay vì `Date`** — `src/features/logs/LogsBlock.tsx:48`, `src/features/logs/ExpenseSummaryPanel.tsx:163`, `src/layout/MobileChatScreen.tsx:34` (chỗ này quan trọng nhất — màn hình chính mobile). Định dạng timestamp cũ (`Z`) trộn với định dạng Postgres trả về (`+00:00`) trong lúc migrate sẽ làm sai thứ tự hiển thị. **Phải sửa cả 3 chỗ (đổi sang `new Date(x).getTime()`) TRƯỚC khi bắt đầu Bước 1 của entity đầu tiên.**

---

## Việc tiếp theo — 3 việc độc lập (2 đã xong, 1 đang làm dở)

### 1. ✅ A1 — Banner cảnh báo lỗi lưu (đã xong, bằng cách khác)
Đã code xong và push lên `main`. Không phải "banner hết lượt retry" như thiết kế gốc (`storage-architecture-fix.md` mục 6.4/6.6) — retry đã bị bỏ hoàn toàn theo Hướng 1. Thay vào đó là banner lỗi mạng/lỗi server chung, nối vào nhánh `catch` thật sự thất bại của `attemptSavePrivate`/`attemptSaveShared`. Xem `docs/features/conflict-handling-simplification.md` mục 3.

### 2. ✅ Sửa 3 chỗ `localeCompare` timestamp
Đã sửa cả 3 vị trí (`LogsBlock.tsx`, `ExpenseSummaryPanel.tsx`, `MobileChatScreen.tsx` — dùng `new Date(x).getTime()` để so sánh thay vì so chuỗi). **Ghi chú minh bạch (2026-07-10):** khi phiên làm việc hiện tại (Bước 1, entity Log) bắt đầu, code đã ở trạng thái sửa xong sẵn trong working tree (khả năng do 1 phiên/luồng làm việc khác đã áp dụng trước đó) nhưng **CHƯA COMMIT** — không phải do lượt làm việc Log này tạo ra, chỉ xác nhận lại và giữ nguyên. Chủ dự án cần tự `git status`/`git diff` kiểm tra + quyết định commit cụm thay đổi này khi thấy phù hợp.

### 3. 🔶 Bước 1 — entity Log (`kn_private_logs`/`kn_shared_logs`) — sub-bước 1-5 xong, Giai đoạn A + B đã code (chờ chủ dự án test tay UI thật qua OAuth)
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

**Giai đoạn B — đã code xong (2026-07-11), 3 điểm bắt buộc đã xử lý:**

1. **Nối phần đọc tại bootstrap + `refreshStaleSpaces()`** — hàm mới `hydrateItemLevelLogs(spaces, shouldSkip?)` trong `AppStateContext.tsx`: gọi `loadPrivateLogs`/`loadSharedLogs` song song qua `Promise.all` cho từng Space, gán đè `space.logs`. Bootstrap gọi không skip gì (chạy 1 lần lúc mở app, chưa có gì pending). `refreshStaleSpaces()` gọi với `shouldSkip = (space) => hasPendingLogsForSpace(scope, spaceId)`. No-op hoàn toàn (trả nguyên `spaces`, không gọi network) khi `LOG_ITEM_PERSIST_ENABLED === false`.
2. **Lỗi tải riêng 1 Space không fail cả app** — mỗi Space tải độc lập trong `Promise.all`, lỗi bị `catch` riêng, `console.warn`, fallback trả nguyên `space` gốc (giữ `logs` jsonb đã có).
3. **Baseline diff-snapshot cập nhật đúng lúc** — bootstrap: không cần code thêm, vì gán đè `space.logs` xảy ra TRƯỚC dispatch `HYDRATE`, và `prevPrivateRef`/`prevSharedRef` bắt đầu rỗng nên effect debounce Space-level tự nhận "lần đầu thấy Space" và chỉ ghi baseline (không tự bắn save). `refreshStaleSpaces()`: đã refactor tách `filter` (điều kiện pending Space-level cũ) ra khỏi `forEach`, chèn bước `hydrateItemLevelLogs` vào giữa, rồi mới set `prevPrivateRef`/`prevSharedRef` dựa trên Space ĐÃ được gán đè `.logs` mới — đảm bảo baseline luôn khớp với data vừa refresh.
4. **`refreshStaleSpaces()` bỏ qua Space có Log pending** — hàm mới `hasPendingLogsForSpace(scope, spaceId)` (`itemPersist.ts`), dựa trên map mới `activeSpaceRefs` (itemId -> {scope, spaceId}) theo dõi MỌI Log "chưa ghi xong" — cả lúc còn debounce (`pending`) LẪN lúc network đang bay (`inFlight`). Cố ý không chỉ dựa vào `pending` map đơn thuần vì `flushAllPendingLogPersist()` (gọi khi tab `hidden`) chuyển gần như toàn bộ `pending` sang in-flight ngay lập tức — đúng lúc quan trọng nhất (tab vừa `visible` lại) mà chỉ check `pending` sẽ luôn ra "không pending" dù request vẫn còn bay.

**Bug có sẵn phát hiện + đã sửa khi làm Giai đoạn B (`itemPersist.ts`, `scheduleFlush()`):** bản gốc (viết ở Bước 1) lưu `inFlight.set(itemId, next.finally(cb))` — `.finally()` luôn trả về 1 Promise MỚI — nhưng `cb` lại so sánh `inFlight.get(itemId) === next` (so với biến `next` TRƯỚC khi bọc `.finally()`, không phải giá trị thật sự vừa lưu vào map) → điều kiện này luôn `false`, `inFlight.delete(itemId)` không bao giờ chạy. Trước đây vô hại (chaining request vẫn đúng vì `.then()` trên promise đã resolve chạy ngay lập tức, chỉ có entry "mồ côi" nằm lại trong map — rò rỉ bộ nhớ nhỏ, không ai đọc `inFlight.has()` để quyết định gì). Nhưng `hasPendingLogsForSpace()` là người tiêu thụ ĐẦU TIÊN phụ thuộc đúng vào việc dọn map này — nếu không sửa, 1 Space sẽ bị coi là "còn Log pending" MÃI MÃI ngay sau log đầu tiên, `refreshStaleSpaces()` không bao giờ refresh `.logs` cho Space đó nữa. Phát hiện qua unit test viết mới (xem dưới), sửa bằng cách tự tham chiếu đúng promise đã lưu (biến `wrapped`) thay vì `next`.

**Test mới:** `src/state/itemPersist.test.ts` — thêm `describe('hasPendingLogsForSpace', ...)` (4 test, mock `../storage/logStore` để không gọi Supabase thật): Space chưa đụng tới → `false`; LOG_CREATE → `true` xuyên suốt lúc debounce + lúc network đang bay + `false` sau khi resolve; LOG_CREATE rồi LOG_DELETE cùng id trong cùng cửa sổ debounce → huỷ hẳn, không gọi network; LOG_DELETE_MANY → `true` ngay lập tức, `false` sau khi resolve. Dùng timer THẬT (không fake timers) cho đáng tin cậy với debounce 600ms hard-code. Tổng **49/49 test pass** (từ 45, +4 test mới).

**Cách test Giai đoạn B (chủ dự án tự làm, có OAuth thật):**
- `npx tsc --noEmit`, `npm run build`, `npm test` — cả 3 đã PASS phía `dev` (49/49 test).
- Tạo 1 log mới ở Space cá nhân → phải hiện ngay trên UI (giờ đọc từ bảng `kn_private_logs`, không phải jsonb).
- F5 (reload full trang) hoặc mở tab mới cùng tài khoản → log cũ (đã migrate từ trước) + log vừa tạo đều phải hiển thị đúng, đúng thứ tự thời gian.
- Mở 2 tab cùng lúc (cùng Space cá nhân hoặc cùng Shared Space): ở tab A tạo/sửa/xoá 1 log, chuyển sang tab B (trigger `visibilitychange` → `visible`) → tab B phải thấy thay đổi từ tab A. Ngay sau khi tab B refresh xong (không thao tác gì thêm), mở DevTools > Network ở tab B, xác nhận **KHÔNG** có request `PATCH kn_private_spaces`/`kn_shared_spaces` tự bắn ra (nếu có — đó là dấu hiệu bug baseline chưa cập nhật đúng, cần báo lại ngay).
- Test thêm race hiếm: ở 1 tab, tạo 1 log rồi LẬP TỨC chuyển tab đi (trong vòng < 600ms) rồi quay lại ngay — log vừa tạo phải KHÔNG biến mất khỏi UI khi tab quay lại `visible` (đây chính là kịch bản `hasPendingLogsForSpace` bảo vệ).
- Xoá 1 log ở Shared Space, kiểm tra Supabase Table Editor bảng `kn_shared_logs` — dòng phải biến mất thật (không chỉ biến mất khỏi UI cục bộ).

## Bước 2 — entity Habit (`kn_private_habits`, KHÔNG có bản shared)

Theo đúng 5 bước con đã mô tả ở `item-level-entity-tables.md` mục 7, mirror CHÍNH XÁC cách làm Bước 1
(Log) ở giai đoạn TRƯỚC KHI bật Giai đoạn A/B (chỉ chuẩn bị, chưa đụng dữ liệu thật):

1. ✅ **Bảng mới** — `docs/features/item-level-habit-schema.sql` (file mới, CHƯA chạy lên Supabase Dashboard thật). `kn_private_habits` — CHỈ 1 bảng, KHÔNG có `kn_shared_habits` (Habit không tồn tại ở Shared Space, đúng quyết định đã chốt #1 ở đầu file này). Mirror `kn_private_logs`: id client-sinh, `version`/trigger giữ nguyên nhưng không dùng version-check, `created_at` có `default now()` (khác Log — Habit không có field `createdAt` hiển thị ở FE nên migration không cần set tường minh, xem giải thích trong file SQL).
2. ✅ **RLS 1 nhánh** (không có nhánh shared để tách) — gộp trong cùng file SQL trên: `auth.uid() = user_id`, mirror `kn_private_spaces`/`kn_private_logs`.
3. ✅ **Storage layer** — `src/storage/habitStore.ts` (CRUD: `loadPrivateHabits`/`createHabit`/`insertHabitsBulk`/`updateHabit`/`deleteHabit`/`listExistingHabitIds`, ghi thẳng blind write). `src/state/itemPersist.ts` mở rộng thêm nhánh Habit (giữ NGUYÊN nhánh Log có sẵn, chỉ nối thêm phía dưới) — debounce theo `itemId` 600ms, `mergeHabitPendingOp()`, hàng đợi `habitPending`/`habitInFlight` riêng (không dùng chung map với Log). **Đã áp dụng luôn fix cho bug `inFlight` phát hiện ở Giai đoạn B của Log** (tự tham chiếu đúng promise `wrapped` khi dọn map, không lặp lại lỗi so sánh nhầm biến `next`) — dù Habit chưa cần `hasPendingHabitsForSpace()` ở lượt này (chưa có Giai đoạn B để dùng tới), viết đúng ngay từ đầu để không phải sửa lại sau.
4. ✅ **Tích hợp dispatch** — `AppStateContext.tsx` (`smartDispatch`) gọi `handleHabitActionForPersist()` cho mọi action `HABIT_*`, thêm NGAY SAU nhánh Log, độc lập với luồng save Space-level (`kn_private_spaces.habits` jsonb — VẪN LÀ NGUỒN THẬT, không đổi gì). Cờ `HABIT_ITEM_PERSIST_ENABLED = false` (đầu phần Habit trong `itemPersist.ts`) — khi `false`, `handleHabitActionForPersist()` chỉ làm đúng 1 việc (tự sinh `id` cho `HABIT_CREATE` nếu thiếu, mirror `LOG_CREATE`/`TASK_CREATE`), KHÔNG gọi bất kỳ hàm nào trong `habitStore.ts` (bảng `kn_private_habits` CHƯA tồn tại thật, gọi vào sẽ lỗi "relation does not exist" nếu không có cờ chặn). `flushAllPendingHabitPersist()` cũng đã nối vào nhánh `hidden` của `visibilitychange` (cùng chỗ với `flushAllPendingLogPersist()`), no-op khi cờ tắt.
5. ✅ **Migration** — `src/storage/migrateLegacyHabits.ts` (mirror `migrateLegacyLogs.ts`, KHÔNG có nhánh shared), expose qua `window.knMigrateHabits.preview()/.run()` (`main.tsx`). **ĐÃ CHẠY XONG (2026-07-11)** — chủ dự án tự chạy `item-level-habit-schema.sql` trên Supabase Dashboard, test `.preview()`/`.run()` với User B (sạch) trước, sau đó User A (tài khoản chính), đối chiếu 3/3 khớp, không lệch. **Giai đoạn A đã bật cùng ngày** — `HABIT_ITEM_PERSIST_ENABLED = true` (`src/state/itemPersist.ts`), CHỈ dual-write, KHÔNG đụng phần đọc (mirror đúng Giai đoạn A của Log). **Giai đoạn B ĐÃ CODE XONG (2026-07-11, cùng ngày)** — nối `loadPrivateHabits` vào bootstrap/`refreshStaleSpaces`, thêm `hasPendingHabitsForSpace()`, mirror CHÍNH XÁC Log. Xem chi tiết ngay dưới.

**Giai đoạn B của Habit — đã code xong (2026-07-11), 4 điểm bắt buộc đã xử lý:**

1. **Nối phần đọc tại bootstrap + `refreshStaleSpaces()`** — hàm mới `hydrateItemLevelHabits(spaces, shouldSkip?)` trong `AppStateContext.tsx` (mirror CHÍNH XÁC `hydrateItemLevelLogs`): gọi `loadPrivateHabits` song song qua `Promise.all` cho từng Space, gán đè `space.habits`. Bỏ qua vô điều kiện Space `isShared === true` (Habit không tồn tại ở Shared Space). Bootstrap: gọi NGAY SAU `hydrateItemLevelLogs(rawSpaces)`, dùng kết quả đã hydrate Log làm đầu vào (`hydrateItemLevelHabits(logsHydrated)`) — không skip gì, chưa có gì pending lúc mở app. `refreshStaleSpaces()`: gọi với `shouldSkip = (space) => hasPendingHabitsForSpace(space.id)`, NGAY SAU khối `Promise.all` hydrate Log (dùng `refreshedPrivateLogs` làm đầu vào), chỉ áp dụng cho `privateCandidates` (không có nhánh shared cho Habit). No-op hoàn toàn khi `HABIT_ITEM_PERSIST_ENABLED === false`.
2. **Lỗi tải riêng 1 Space không fail cả app** — mỗi Space tải độc lập trong `Promise.all`, lỗi bị `catch` riêng, `console.warn`, fallback trả nguyên `space` gốc (giữ `habits` jsonb đã có).
3. **Baseline diff-snapshot cập nhật đúng lúc** — bootstrap: không cần code thêm (mirror lý do Log) — gán đè `space.habits` xảy ra TRƯỚC dispatch `HYDRATE`, `prevPrivateRef` bắt đầu rỗng nên effect debounce Space-level tự nhận "lần đầu thấy Space" và chỉ ghi baseline. `refreshStaleSpaces()`: KHÔNG cần code thêm ngoài việc gọi `hydrateItemLevelHabits` TRƯỚC đoạn `refreshedPrivate.forEach(...prevPrivateRef.current.set(...))` sẵn có — đoạn này dùng `privateSnapshot(space)` (đã gồm field `habits`) nên tự động bắt đúng baseline mới sau khi biến `refreshedPrivate` được gán lại bằng kết quả `hydrateItemLevelHabits`, không tự bắn PATCH thừa.
4. **`refreshStaleSpaces()` bỏ qua Space có Habit pending** — hàm mới `hasPendingHabitsForSpace(spaceId)` (`itemPersist.ts`), dựa trên map mới `activeHabitSpaceRefs` (itemId -> spaceId, mirror `activeSpaceRefs` của Log — không có `scope`). Đã áp dụng đúng fix bug `inFlight`/dọn map (tự tham chiếu `wrapped` thay vì biến gốc) NGAY TỪ ĐẦU trong `scheduleHabitFlush()`/`queueHabitPersist()` — không lặp lại việc phải phát hiện lỗi rồi sửa sau như đã xảy ra với Log.

**Test mới:** `src/state/itemPersist.test.ts` — thêm `describe('hasPendingHabitsForSpace', ...)` (4 test, mock `../storage/habitStore` để không gọi Supabase thật): Space chưa đụng tới → `false`; HABIT_CREATE → `true` xuyên suốt lúc debounce + lúc network đang bay + `false` sau khi resolve; HABIT_CREATE rồi HABIT_DELETE cùng id trong cùng cửa sổ debounce → huỷ hẳn, không gọi network; HABIT_DELETE (habit đã tồn tại từ trước, không có DELETE_MANY để mirror như Log nên dùng path delete trực tiếp) → `true` lúc debounce + lúc network đang bay, `false` sau khi resolve. Dùng timer THẬT (không fake timers), mirror cách làm cho Log. Tổng **68/68 test pass** (từ 64, +4 test mới).

**Cách test Giai đoạn A của Habit (đã bật cờ thật, 2026-07-11):**
- `npx tsc --noEmit`, `npm run build` — cả 2 PASS.
- `npm test` — 64/64 test pass, không đổi số lượng so với lượt trước (chỉ đổi 1 boolean + comment, không sửa logic).
- Gọi REST API `kn_private_habits` bằng anon key qua `curl` (`select=id&limit=1`) — trả `200 []` (không phải lỗi "relation does not exist") — xác nhận bảng tồn tại thật trên Supabase, RLS chặn đúng khi không có `auth.uid()`.
- **Chủ dự án cần tự test tay 1 lượt qua `npm run dev` (OAuth thật):** tạo/sửa/xoá/tick 1 Thói quen ở Space cá nhân bất kỳ. Mở DevTools > Network lọc `kn_private_habits`, xác nhận có request `POST` (tạo), `PATCH` (sửa title/tick ngày — qua `updateHabit`), `DELETE` (xoá) tương ứng; đối chiếu Supabase Table Editor thấy dòng mới/cập nhật đúng. **UI hiển thị Thói quen vẫn phải giống hệt trước** (vì phần đọc vẫn qua cột `habits` jsonb, Giai đoạn B chưa làm) — nếu UI có gì khác lạ, đó là dấu hiệu bất thường cần báo lại ngay.

**Cách test Giai đoạn B của Habit (chủ dự án tự làm, có OAuth thật) — mirror hướng dẫn đã dùng cho Log:**
- `npx tsc --noEmit`, `npm run build`, `npm test` — cả 3 đã PASS phía `dev` (68/68 test).
- Tạo 1 Thói quen mới ở Space cá nhân bất kỳ → phải hiện ngay trên UI (giờ đọc từ bảng `kn_private_habits`, không phải jsonb).
- F5 (reload full trang) hoặc mở tab mới cùng tài khoản → habit cũ (đã migrate từ trước) + habit vừa tạo đều phải hiển thị đúng, đúng thứ tự tạo (theo `created_at`).
- Mở 2 tab cùng lúc (cùng Space cá nhân): ở tab A tạo/sửa/xoá/tick 1 habit, chuyển sang tab B (trigger `visibilitychange` → `visible`) → tab B phải thấy thay đổi từ tab A. Ngay sau khi tab B refresh xong (không thao tác gì thêm), mở DevTools > Network ở tab B, xác nhận **KHÔNG** có request `PATCH kn_private_spaces` tự bắn ra (nếu có — dấu hiệu bug baseline chưa cập nhật đúng, cần báo lại ngay).
- Test thêm race hiếm: ở 1 tab, tạo 1 habit rồi LẬP TỨC chuyển tab đi (trong vòng < 600ms) rồi quay lại ngay — habit vừa tạo phải KHÔNG biến mất khỏi UI khi tab quay lại `visible` (kịch bản `hasPendingHabitsForSpace` bảo vệ).
- Tick/bỏ tick streak 1 habit vài lần liên tiếp thật nhanh, kiểm tra Supabase Table Editor bảng `kn_private_habits` — `completed_dates` cuối cùng phải khớp đúng trạng thái UI (không bị gộp sai do debounce).

**Điểm khác Habit so với Log (tóm tắt):**
- Không có bản Shared — mọi hàm trong `habitStore.ts`/nhánh Habit của `itemPersist.ts` không có tham số `scope`.
- Habit CÓ update nội dung khi đang tồn tại (`HABIT_UPDATE` đổi `title` qua `updateHabit()`, `HABIT_TOGGLE_TODAY` đổi `completedDates` — cũng qua `updateHabit()`, gửi nguyên mảng mới) — khác Log (bất biến, chỉ có insert/delete/patch 3 field expense hẹp). Không có action "xoá hàng loạt" (không có `HABIT_DELETE_MANY`).
- Không có `order` — giữ nguyên theo `created_at` tăng dần khi load (Habit push vào cuối mảng khi tạo, không kéo-thả).
- `HABIT_CREATE.payload.id` được thêm optional (mirror `LOG_CREATE`/`TASK_CREATE`) vào `state/reducers/habits.ts` — cần thiết để `itemPersist.ts` tự sinh id trước khi dispatch, dùng chung 1 id cho cả state lẫn payload gửi DB (tránh sinh 2 UUID khác nhau cho cùng 1 lượt tạo).

**Cách test sub-bước 1-4 (lịch sử — ghi lại đúng lúc cờ CÒN tắt, TRƯỚC khi bật Giai đoạn A ở trên; giữ nguyên làm hồ sơ, xem mục "Cách test Giai đoạn A" phía trên cho tình trạng hiện tại):**
- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS.
- `npm test` — 64/64 test pass (từ 49, +3 test reducer `habits.test.ts` (id optional cho `HABIT_CREATE`) + 12 test mới trong `itemPersist.test.ts` (`computeHabitPersistDescriptors` 6 test, `mergeHabitPendingOp` 6 test) — toàn bộ phần thuần logic, KHÔNG gọi Supabase thật, tương tự cách test Log lúc mới viết (trước khi có `hasPendingLogsForSpace`).
- **Chủ dự án tự test tay 1 lượt qua `npm run dev` (có OAuth thật):** tạo/sửa/xoá/tick 1 Thói quen ở Space cá nhân bất kỳ — UI phải hoạt động **giống hệt trước** (vì cờ `HABIT_ITEM_PERSIST_ENABLED` còn `false`, mọi thứ vẫn đọc/ghi qua cột `habits` jsonb như cũ, itemPersist chỉ âm thầm gắn id sớm hơn 1 bước, không gọi Supabase bảng mới). Mở DevTools > Network trong lúc thao tác, xác nhận **KHÔNG** có request nào tới `kn_private_habits` (bảng này chưa tồn tại thật — nếu thấy request 404/lỗi "relation does not exist" là dấu hiệu cờ bị bật nhầm, cần báo ngay).
- Đọc code review: `src/storage/habitStore.ts`, `src/state/itemPersist.ts` (phần Habit ở cuối file), đoạn tích hợp trong `src/state/AppStateContext.tsx` (`smartDispatch`, tìm `isHabitAction`/`handleHabitActionForPersist`), `docs/features/item-level-habit-schema.sql`, `src/storage/migrateLegacyHabits.ts`.

**Bước kế tiếp (KHÔNG làm trong lượt này, chờ chủ dự án xác nhận resume):** SQL + migration User B/User A + bật Giai đoạn A + code Giai đoạn B đều **ĐÃ XONG (2026-07-11)**, xem mục "Cách test Giai đoạn A"/"Cách test Giai đoạn B" phía trên. Còn lại: chủ dự án tự test tay UI thật qua OAuth (hướng dẫn ở mục "Cách test Giai đoạn B"); sau khi ổn định, cân nhắc tắt nhánh ghi `habits` jsonb (mirror quyết định tương tự cho Log, câu hỏi mở #2) — chưa làm ở lượt này. Bước tiếp theo trong kế hoạch tổng (Log → Habit → Reminder → Task → Note): entity Reminder, chờ chủ dự án xác nhận resume.

---

## Bước 3 — entity Reminder (`kn_private_reminders`/`kn_shared_reminders`, CÓ bản shared — mirror Log)

Theo đúng 5 bước con đã mô tả ở `item-level-entity-tables.md` mục 7. **Khác Log/Habit ở chỗ Giai
đoạn A (dual-write) + Giai đoạn B (cutover đọc) được làm GỘP chung 1 lượt (2026-07-11), theo yêu cầu
tường minh của chủ dự án** — không tách 2 lượt như Log/Habit đã làm trước đó.

1. ✅ **Bảng mới** — `docs/features/item-level-reminder-schema.sql` (file mới, CHƯA chạy lên Supabase
   Dashboard thật). `kn_private_reminders`/`kn_shared_reminders`, mirror đúng `kn_private_logs`/
   `kn_shared_logs`: id client-sinh, `version`/trigger giữ nguyên nhưng không dùng version-check,
   không có cột `order`. Reminder KHÔNG có field `createdBy` ở tầng app (khác Task/Note/Log) nên
   bảng KHÔNG có cột `created_by`.
2. ✅ **RLS 2 nhánh tách biệt** — gộp trong cùng file SQL trên. Private: `auth.uid() = user_id`
   (mirror `kn_private_logs`). Shared: `is_space_member(space_id)` (mirror `kn_shared_logs`).
3. ✅ **Storage layer** — `src/storage/reminderStore.ts` (CRUD: `loadPrivateReminders`/
   `loadSharedReminders`/`createReminder`/`insertRemindersBulk`/`updateReminder`/`deleteReminder`/
   `listExistingReminderIds`, ghi thẳng blind write). `src/state/itemPersist.ts` mở rộng thêm nhánh
   Reminder (giữ NGUYÊN 2 nhánh Log/Habit có sẵn, chỉ nối thêm phía dưới) — debounce theo `itemId`
   600ms, `mergeReminderPendingOp()`, hàng đợi `reminderPending`/`reminderInFlight` riêng. Đã áp dụng
   luôn fix cho bug `inFlight` phát hiện ở Giai đoạn B của Log (tự tham chiếu đúng promise `wrapped`
   khi dọn map) NGAY TỪ ĐẦU, và đã viết sẵn `hasPendingRemindersForSpace()`/
   `activeReminderSpaceRefs` dù chưa có Giai đoạn B để dùng tới ở lượt này (mirror bài học đã áp dụng
   cho Habit — tránh phải quay lại sửa `scheduleReminderFlush()` sau).
4. ✅ **Tích hợp dispatch** — `AppStateContext.tsx` (`smartDispatch`) gọi
   `handleReminderActionForPersist()` cho mọi action `REMINDER_*`, thêm NGAY SAU nhánh Habit, độc lập
   với luồng save Space-level (`kn_private_spaces.reminders`/`kn_shared_spaces.reminders` jsonb —
   VẪN CHẠY SONG SONG làm lưới an toàn, chưa tắt — xem Giai đoạn A+B bên dưới).
   `flushAllPendingReminderPersist()` cũng đã nối vào nhánh `hidden` của `visibilitychange` (cùng chỗ
   Log/Habit).
5. ✅ **Migration — ĐÃ CHẠY XONG (2026-07-11)** — `src/storage/migrateLegacyReminders.ts` (mirror
   `migrateLegacyLogs.ts`, CÓ nhánh shared), expose qua `window.knMigrateReminders.preview()/.run()`
   (`main.tsx`). Chủ dự án đã tự chạy `item-level-reminder-schema.sql` trên Supabase Dashboard, chạy
   `.run()` — dữ liệu thật 2/2 khớp, idempotent đúng.

   **Bug thật phát hiện + đã fix (2026-07-11):** chủ dự án chạy `window.knMigrateReminders.run()`
   trên tài khoản chính, gặp `400 Bad Request` từ Supabase khi insert hàng loạt. Root cause:
   `runLegacyRemindersMigration()` gộp CẢ 2 loại reminder (`once`/`recurring`) vào chung 1 mảng rồi
   gọi `insertRemindersBulk()` 1 lần — nhưng `toRow()` trả 2 bộ khoá KHÁC NHAU theo type (`once`
   không có `created_at`, `recurring` có). PostgREST bắt buộc mọi object trong 1 lần `insert()` hàng
   loạt phải cùng bộ khoá, trộn lẫn bị từ chối thẳng 400. **Đã fix:** `insertRemindersBulk()`
   (`src/storage/reminderStore.ts`) tự tách `rows` thành 2 lô đồng nhất theo `reminder.type` trước
   khi insert, gọi `insert()` riêng cho từng lô (bỏ qua lô rỗng, không đổi chữ ký hàm —
   `migrateLegacyReminders.ts` không cần sửa). Lô `once` insert trước; nếu lỗi thì dừng ngay (không
   thử lô `recurring`); nếu `once` ok nhưng `recurring` lỗi vẫn trả `ok: false` (idempotent ở
   `listExistingReminderIds()` tự bỏ qua phần đã ghi khi retry). Thêm test
   `src/storage/reminderStore.test.ts` (7 test: rows rỗng, chỉ 1 loại x2, trộn 2 loại tách đúng thứ
   tự, lỗi ở lô đầu dừng ngay, lỗi ở lô sau vẫn báo lỗi, scope shared không gọi `getUser()`/không có
   `user_id`). Migration đã chạy lại thành công sau khi có bản fix này — kết quả 2/2 khớp.

### Giai đoạn A+B của Reminder — ĐÃ CODE XONG GỘP CHUNG (2026-07-11)

Theo yêu cầu tường minh của chủ dự án (mirror kỹ thuật đã dùng cho Log/Habit, chỉ khác về TIẾN ĐỘ:
làm cả 2 giai đoạn trong 1 lượt thay vì tách 2 lượt test riêng):

- **Giai đoạn A** — `REMINDER_ITEM_PERSIST_ENABLED = true` (`src/state/itemPersist.ts`). Mọi action
  `REMINDER_*` dual-write thật vào `kn_private_reminders`/`kn_shared_reminders`, song song với cột
  `reminders` jsonb cũ (chưa tắt).
- **Giai đoạn B** — hàm mới `hydrateItemLevelReminders(spaces, shouldSkip?)` trong
  `AppStateContext.tsx`, mirror CHÍNH XÁC `hydrateItemLevelLogs()` (Reminder CÓ bản Shared, khác
  Habit — gọi `loadPrivateReminders`/`loadSharedReminders` song song qua `Promise.all` cho CẢ private
  lẫn shared, gán đè `space.reminders`). Gọi ở bootstrap (sau `hydrateItemLevelHabits`, trước dispatch
  `HYDRATE`) và trong `refreshStaleSpaces()` (cho cả `privateCandidates` đã qua `hydrateItemLevelHabits`
  lẫn `sharedCandidates` đã qua `hydrateItemLevelLogs`). Lỗi tải riêng 1 Space không fail cả app —
  fallback dùng `reminders` jsonb gốc, `console.warn`. Baseline `prevPrivateRef`/`prevSharedRef` cập
  nhật đúng lúc (mirror Log — bootstrap: gán đè xảy ra TRƯỚC `HYDRATE`, baseline bắt đầu rỗng nên
  không tự bắn save thừa; `refreshStaleSpaces()`: baseline được set SAU khi `refreshedPrivate`/
  `refreshedShared` đã qua đủ cả 3 lượt hydrate Log→Habit→Reminder).
  `refreshStaleSpaces()` bỏ qua Space đang có Reminder pending qua `hasPendingRemindersForSpace(scope,
  spaceId)` (đã viết sẵn từ sub-bước 3, dựa trên map `activeReminderSpaceRefs` theo dõi cả lúc
  debounce lẫn lúc network đang bay — mirror `hasPendingLogsForSpace`).
- **Test mới** — `src/state/itemPersist.test.ts`: thêm `describe('hasPendingRemindersForSpace', ...)`
  (4 test, mock `../storage/reminderStore` để không gọi Supabase thật — không có test tương đương
  `LOG_DELETE_MANY` vì Reminder không có action xoá hàng loạt): Space chưa đụng tới → `false`;
  REMINDER_CREATE → `true` xuyên suốt lúc debounce + lúc network đang bay + `false` sau khi resolve;
  REMINDER_CREATE rồi REMINDER_DELETE cùng id trong cùng cửa sổ debounce → huỷ hẳn, không gọi network;
  REMINDER_DELETE (đã tồn tại từ trước) → `true` lúc debounce + lúc network đang bay, `false` sau khi
  resolve. Tổng **96/96 test pass** (từ 92 sau bản fix `insertRemindersBulk` ở sub-bước 5, +4 test mới).
- **Xác nhận Edge Function `send-due-notifications` KHÔNG cần sửa** (giữ nguyên kết luận đã ghi ở
  sub-bước 4/5 phía trên — function đọc trực tiếp cột `reminders` jsonb qua service-role key, dual-
  write không đụng gì tới đường đọc đó).

**Cách test Giai đoạn A+B (chủ dự án tự làm, có OAuth thật, 1 lượt duy nhất):**
- `npx tsc --noEmit`, `npm run build`, `npm test` — cả 3 đã PASS phía `dev` (96/96 test).
- Gọi REST API `kn_private_reminders`/`kn_shared_reminders` bằng anon key qua `curl` — trả `200 []`
  (không phải lỗi "relation does not exist") — xác nhận 2 bảng tồn tại thật trên Supabase.
- Tạo 1 Nhắc việc loại "một lần" (once) ở Space cá nhân → phải hiện ngay trên UI (đọc từ
  `kn_private_reminders`). Mở DevTools > Network lọc `kn_private_reminders`, xác nhận có `POST`.
- Tạo 1 Nhắc việc loại "lặp lại" (recurring) → xác nhận `POST` tương tự, kiểm tra Supabase Table
  Editor thấy `created_at` = mốc tạo (không phải `now()` của DB).
- Sửa 1 reminder đổi từ "một lần" → "lặp lại": xác nhận UI cập nhật đúng, kiểm tra Table Editor —
  `created_at` phải là mốc MỚI (vừa chuyển sang recurring, reducer tính "now" cho trường hợp này).
- Sửa 1 reminder đang "lặp lại" (đổi tần suất/giờ, KHÔNG đổi type) → kiểm tra Table Editor —
  `created_at` phải GIỮ NGUYÊN mốc cũ (không bị reset).
- Sửa 1 reminder đổi từ "lặp lại" → "một lần": xác nhận UI đúng, không cần quan tâm `created_at` (DB
  giữ giá trị cũ nhưng `ReminderOnce` không hiển thị field này).
- Xoá 1 reminder ở Space cá nhân lẫn Shared Space, kiểm tra Table Editor — dòng biến mất thật.
- F5 (reload full trang) hoặc mở tab mới cùng tài khoản → reminder cũ (đã migrate) + reminder vừa
  tạo/sửa đều hiển thị đúng, đúng thứ tự (mới nhất trước — `REMINDER_CREATE` unshift).
- Mở 2 tab cùng lúc (cùng Space cá nhân hoặc cùng Shared Space): ở tab A tạo/sửa/xoá 1 reminder,
  chuyển sang tab B (trigger `visibilitychange` → `visible`) → tab B phải thấy thay đổi từ tab A.
  Ngay sau khi tab B refresh xong, mở DevTools > Network ở tab B, xác nhận **KHÔNG** có request
  `PATCH kn_private_spaces`/`kn_shared_spaces` tự bắn ra (dấu hiệu bug baseline nếu có).
- Test thêm race hiếm: ở 1 tab, tạo 1 reminder rồi LẬP TỨC chuyển tab đi (trong vòng < 600ms) rồi
  quay lại ngay — reminder vừa tạo phải KHÔNG biến mất khỏi UI khi tab quay lại `visible`.
- Test ở Shared Space: tạo/sửa/xoá 1 reminder, xác nhận request đi đúng bảng `kn_shared_reminders`
  (không lẫn `kn_private_reminders`), thành viên khác (nếu test được) mở tab/F5 thấy đúng thay đổi.

**Điểm khác Reminder so với Log (tóm tắt):**
- CÓ bản Shared (giống Log, khác Habit) — mọi hàm trong `reminderStore.ts`/nhánh Reminder của
  `itemPersist.ts` có tham số `scope`.
- `REMINDER_UPDATE` thay NGUYÊN item (không phải patch hẹp như `LOG_PATCH_EXPENSE`) —
  `ReminderFormModal.tsx` cho phép đổi cả `type` (once <-> recurring) khi sửa 1 reminder đã có. Vì
  vậy `reminderStore.ts` (`toRow()`) LUÔN trả FULL bộ cột theo type MỚI, null tường minh cột không
  dùng của type kia (vd `freq_n`/`freq_unit`/`day_of_month` = null khi type = 'once', `date` = null
  khi type = 'recurring') — tránh để lại giá trị "mồ côi" từ type cũ. `mergeReminderPendingOp()` vì
  vậy đơn giản hơn `mergeLogPendingOp`/`mergeHabitPendingOp` — không cần áp patch từng field, chỉ cần
  lấy bản `ReminderDefinition` đầy đủ mới nhất.
- **`ReminderRecurring.createdAt` (mốc tính chu kỳ lặp lại) — quyết định #5 đã chốt áp dụng ĐÚNG
  NHƯNG có điều kiện quan trọng phát hiện khi đọc kỹ `state/reducers/reminders.ts`:** cột DB
  `created_at` CHỈ được set tường minh khi reminder đang là `type === 'recurring'` (cả lúc INSERT lẫn
  UPDATE), dùng ĐÚNG giá trị đã được `remindersReducer` tính sẵn (giữ nguyên nếu vẫn recurring trước
  khi sửa; LÀM MỚI = "now" nếu vừa chuyển từ 'once' sang 'recurring' — xem `buildReminder`/
  `REMINDER_UPDATE` trong reducer: `createdAt = r.type === 'recurring' ? r.createdAt : new
  Date().toISOString()`, tính theo TYPE CŨ của reminder trước lúc sửa, không phải type mới). Khi
  type là `'once'`, cột `created_at` KHÔNG được set (giữ nguyên giá trị DB gốc lúc INSERT, DB
  `default now()` lo — không có ý nghĩa gì để giữ vì `ReminderOnce` không có field `createdAt`).
  Test riêng 2 case này trong `reminders.test.ts` (`describe('remindersReducer — REMINDER_UPDATE giữ
  đúng mốc createdAt...')`) để xác nhận reducer tính đúng TRƯỚC khi tin tưởng storage layer set đúng
  theo giá trị đó.
- Load sort theo `created_at` **GIẢM DẦN** (mới nhất trước) — NGƯỢC HƯỚNG với Log/Habit (sort tăng
  dần). Lý do: `REMINDER_CREATE` **unshift** vào ĐẦU mảng (không phải push vào cuối như Log/Habit),
  `RemindersBlock.tsx` hiển thị thẳng theo thứ tự mảng không tự sort — phải sort DESC ở tầng storage
  để khớp đúng thứ tự hiển thị cũ.
- Không có action "xoá hàng loạt" (không có `REMINDER_DELETE_MANY`, khác Log).
- `REMINDER_CREATE.payload.id` được thêm optional (mirror `LOG_CREATE`/`HABIT_CREATE`/`TASK_CREATE`)
  vào `state/reducers/reminders.ts`.

**Xác nhận lại (2026-07-11, sau khi gộp code Giai đoạn A+B) — Edge Function
`supabase/functions/send-due-notifications/index.ts` KHÔNG cần sửa gì trong lượt này:** đã đọc kỹ
toàn bộ file. Function này đọc TRỰC TIẾP `kn_space_state.select('user_id, spaces')` (Space cá nhân)
và `kn_shared_spaces.select('id, tasks, reminders')` (Shared Space) bằng service-role key — KHÔNG
đụng gì tới `kn_private_reminders`/`kn_shared_reminders` (2 bảng item-level mới). Dual-write (Giai
đoạn A) chỉ CỘNG THÊM 1 đường ghi song song, KHÔNG tắt/thay đổi đường ghi `reminders` jsonb cũ mà
Function này đang đọc. Cutover phần ĐỌC (Giai đoạn B) chỉ đổi nguồn đọc ở tầng app (FE,
`AppStateContext.tsx`) — cột `reminders` jsonb trên `kn_private_spaces`/`kn_shared_spaces` VẪN được
ghi đầy đủ, đồng bộ đúng với bảng item-level (chưa tắt nhánh ghi cũ). Vì vậy Edge Function tiếp tục
hoạt động y hệt hiện tại, không cần sửa gì cho tới khi nhánh ghi jsonb thật sự bị tắt (quyết định
riêng, ngoài phạm vi lượt này — xem câu hỏi mở #2 đã áp dụng cho Log).

**Phát hiện phụ, KHÔNG thuộc phạm vi Reminder — ghi nhận để chủ dự án biết, chưa xử lý:** trong lúc
đọc Edge Function, phát hiện comment tại đó (dòng ~176-178) ghi "ở Shared Space, UI hiện ẩn hoàn toàn
khối 'Nhắc việc' (`enabledBlocks.reminder` cố định `false`)" — nhưng đọc code thật
(`src/storage/sharedSpaceStore.ts`, `defaultSharedEnabledBlocks()`/`normalizeSharedEnabledBlocks()`)
thì `reminder` **KHÔNG** bị ép `false` như `habits` (chỉ `habits` mới bị ép cứng `false`, `reminder`
đọc bình thường từ DB, mặc định `true`). Comment trong Edge Function có vẻ ĐÃ LỖI THỜI (có thể do dữ
kiện cũ trước khi `enabled_blocks` được đọc thật từ DB — xem
`docs/features/fix-shared-space-enabled-blocks.sql`). Không sửa gì (không thuộc phạm vi việc này,
Edge Function vẫn hoạt động đúng vì code KHÔNG dựa vào giả định đó để bỏ qua sớm — tự comment ghi rõ
"Vẫn xử lý ở đây cho đúng/đủ... không dựa vào enabledBlocks.reminder để bỏ qua sớm") — nêu ra để
tránh hiểu nhầm nếu ai đọc lại comment đó sau này.

**Cách test sub-bước 1-4 (lịch sử — ghi lại đúng lúc cờ CÒN tắt, TRƯỚC khi bật Giai đoạn A+B ở trên;
giữ nguyên làm hồ sơ, xem mục "Cách test Giai đoạn A+B" phía trên cho tình trạng hiện tại):**
- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS.
- `npm test` — 85/85 test pass (từ 68, +6 test reducer `reminders.test.ts` mới (id optional cho
  `REMINDER_CREATE`, unshift vào đầu mảng, 2 test riêng xác nhận `createdAt`/mốc chu kỳ giữ
  đúng/làm mới qua `REMINDER_UPDATE`) + 11 test mới trong `itemPersist.test.ts`
  (`computeReminderPersistDescriptors` 5 test, `mergeReminderPendingOp` 6 test) — toàn bộ phần thuần
  logic, KHÔNG gọi Supabase thật, mirror cách test Log/Habit lúc mới viết (trước khi có
  `hasPendingLogsForSpace`/`hasPendingHabitsForSpace`).
- **Chủ dự án tự test tay 1 lượt qua `npm run dev` (có OAuth thật):** tạo/sửa (kể cả đổi loại 1
  lần <-> lặp lại)/xoá 1 Nhắc việc ở Space cá nhân bất kỳ — UI phải hoạt động **giống hệt trước** (vì
  cờ `REMINDER_ITEM_PERSIST_ENABLED` còn `false`, mọi thứ vẫn đọc/ghi qua cột `reminders` jsonb như
  cũ). Mở DevTools > Network trong lúc thao tác, xác nhận **KHÔNG** có request nào tới
  `kn_private_reminders`/`kn_shared_reminders` (2 bảng chưa tồn tại thật — nếu thấy request lỗi
  "relation does not exist" là dấu hiệu cờ bị bật nhầm, cần báo ngay).
- Đọc code review: `src/storage/reminderStore.ts`, `src/state/itemPersist.ts` (phần Reminder ở cuối
  file), đoạn tích hợp trong `src/state/AppStateContext.tsx` (`smartDispatch`, tìm
  `isReminderAction`/`handleReminderActionForPersist`), `docs/features/item-level-reminder-schema.sql`,
  `src/storage/migrateLegacyReminders.ts`.

**Bước kế tiếp (KHÔNG làm trong lượt này, chờ chủ dự án xác nhận resume):** SQL + migration dữ liệu
thật + bật Giai đoạn A + code Giai đoạn B đều **ĐÃ XONG (2026-07-11)**, xem mục "Giai đoạn A+B của
Reminder" và "Cách test Giai đoạn A+B" phía trên. Còn lại: chủ dự án tự test tay UI thật qua OAuth
(1 lượt duy nhất, theo hướng dẫn ở mục đó); sau khi ổn định, cân nhắc tắt nhánh ghi `reminders` jsonb
(mirror câu hỏi mở #2 chưa quyết định chính thức cho cả Log/Habit) — chưa làm ở lượt này. Bước tiếp
theo trong kế hoạch tổng (Log → Habit → Reminder → Task → Note): entity Task, chờ chủ dự án xác nhận
resume.

---

## Bước 4 — entity Task (kn_private_tasks/kn_shared_tasks, CÓ bản shared)

### Bước 4a — fractional-index (thuần logic) — ✅ ĐÃ XONG

Đúng bước con đã chốt ở quyết định #6 (`item-level-entity-tables.md` mục 5): trước khi đụng entity
Task (entity đầu tiên trong 5 loại có `order`/kéo-thả thủ công), viết + unit-test riêng cơ chế
fractional-index trước, độc lập, chưa đụng gì tới reducer/DB.

**File mới:**
- `src/state/fractionalOrder.ts` — 2 hàm thuần logic, không side-effect, không import gì từ
  reducer/storage/DB:
  - `computeOrderBetween(before, after)`: công thức chính. 2 láng giềng đều có → trung bình cộng
    `(before + after) / 2`. Chỉ có `after` (đầu danh sách) → `after - 1`. Chỉ có `before` (cuối danh
    sách) → `before + 1`. Cả 2 đều không có (danh sách rỗng) → `DEFAULT_ORDER` (hằng số, = `0`).
  - `computeOrderForInsertAt(existingOrders, insertIndex)` — helper tiện dụng ở mức "vị trí chèn":
    nhận mảng `order` đã sort tăng dần (KHÔNG gồm item đang kéo — mirror bước `splice` hiện có trong
    `TASK_REORDER`/`NOTE_REORDER`) + vị trí muốn chèn, tự tìm 2 láng giềng kề rồi gọi
    `computeOrderBetween`. Chuẩn bị sẵn để lượt sau cắm thẳng vào reducer mà không cần viết lại phần
    tìm láng giềng.
- `src/state/fractionalOrder.test.ts` — 12 test: chèn giữa 2 láng giềng, chèn đầu/cuối danh sách,
  danh sách rỗng (cả 2 hàm), `insertIndex` vượt biên tự clamp, kéo lặp lại 20 lần liên tiếp vào cùng
  1 khoảng (giá trị vẫn hợp lệ, nằm chặt giữa 2 biên, không NaN/Infinity), kéo xen kẽ đầu/cuối 10 lần
  liên tiếp, và 1 test ghi nhận rõ giới hạn double-precision đã biết (200 lần chia đôi liên tiếp vào
  đúng 1 khoảng → giá trị suy biến trùng biên dưới, nhưng KHÔNG crash/NaN — đúng tinh thần đã chốt
  "chấp nhận rủi ro thấp, không renumber tự động đợt này").

**CHƯA đụng:** `state/reducers/notes.ts` (`NOTE_REORDER`) — vẫn y nguyên hành vi cũ (`sort → splice →
map((x, idx) => ({...x, order: idx}))` cho toàn mảng). Việc tích hợp `computeOrderForInsertAt` vào
`NOTE_REORDER` để dịp code Note (Bước 5) — **TASK_REORDER đã tích hợp ở phần 4b** ngay dưới đây.

**Cách test:**
- `npx tsc --noEmit`, `npm run build` — cả 2 PASS.
- `npm test` — **108/108 test pass** (từ 96, +12 test mới trong `fractionalOrder.test.ts`, không đổi
  test nào khác vì không đụng reducer/code thật nào đang chạy).
- Đọc code review: `src/state/fractionalOrder.ts`, `src/state/fractionalOrder.test.ts`.

### Bước 4b — bảng/storage/dispatch/migration — ✅ ĐÃ CODE XONG, CHƯA chạy SQL thật

Theo đúng 5 bước con đã mô tả ở `item-level-entity-tables.md` mục 7, mirror CHÍNH XÁC cách làm Log/
Reminder (CÓ bản shared) ở giai đoạn TRƯỚC KHI bật Giai đoạn A/B (chỉ chuẩn bị, chưa đụng dữ liệu
thật):

1. ✅ **Bảng mới** — `docs/features/item-level-task-schema.sql` (file mới, CHƯA chạy lên Supabase
   Dashboard thật). `kn_private_tasks`/`kn_shared_tasks`, mirror đúng `kn_private_reminders`/
   `kn_shared_reminders`: `id` uuid client-sinh (giữ nguyên định danh Task qua migration — quan
   trọng vì Task còn dùng làm deep-link trong notify Shared Space, xem
   `docs/features/shared-space-task-assign-notify.md`), `item_order` double precision NOT NULL
   (fractional-index), `created_by` uuid null (chỉ ý nghĩa hiển thị avatar Shared Space, không dùng
   cho RLS), `assignee_ids` giữ jsonb (quyết định #4), `created_at` timestamptz NULL ĐƯỢC — khác hẳn
   Log/Reminder (NOT NULL DEFAULT now()) vì `Task.createdAt` là field thật sự optional ở tầng app
   (task cũ có thể thiếu hẳn field này, có ý nghĩa khác với "vừa tạo bây giờ" — dùng để sort trong
   `MobileChatScreen.tsx`), `version`/trigger giữ nguyên nhưng không dùng version-check.
2. ✅ **RLS 2 nhánh tách biệt** — gộp trong cùng file SQL trên. Private: `auth.uid() = user_id`
   (mirror `kn_private_reminders`). Shared: `is_space_member(space_id)` (mirror
   `kn_shared_reminders`, mọi member được sửa/xoá task của người khác trong cùng Space — đúng hành
   vi cũ, không giới hạn theo người tạo).
3. ✅ **Storage layer** — `src/storage/taskStore.ts` (CRUD: `loadPrivateTasks`/`loadSharedTasks`
   (sort theo `item_order`)/`createTask`/`insertTasksBulk`/`updateTask` (patch hẹp theo từng nhóm
   field)/`deleteTask`/`listExistingTaskIds`, ghi thẳng blind write; `toInsertRow()` chỉ set
   `created_at` khi `Task.createdAt` có giá trị thật — không set `NULL`/`now()` khi thiếu). `src/
   state/itemPersist.ts` mở rộng thêm nhánh Task (giữ NGUYÊN 3 nhánh Log/Habit/Reminder có sẵn, chỉ
   nối thêm phía dưới) — debounce theo `itemId` 600ms, `mergeTaskPendingOp()`, hàng đợi
   `taskPending`/`taskInFlight` riêng. 3 action UPDATE tách biệt (`TASK_UPDATE`/`TASK_TOGGLE_DONE`/
   `TASK_REORDER`), mỗi action patch 1 nhóm field hẹp — mirror cách Habit dùng patch hẹp, KHÔNG
   mirror cách Reminder thay nguyên item. Đã áp dụng luôn fix bug `inFlight` (tự tham chiếu đúng
   promise `wrapped` khi dọn map) và viết sẵn `hasPendingTasksForSpace()`/`activeTaskSpaceRefs`
   NGAY TỪ ĐẦU dù chưa có Giai đoạn B để dùng tới ở lượt này (mirror bài học đã áp dụng cho
   Habit/Reminder). **Lưu ý đặc thù riêng của Task (khác Log/Habit/Reminder):** trong
   `AppStateContext.tsx` (`smartDispatch`), `handleTaskActionForPersist()` PHẢI được gọi bằng
   `actionToDispatch` (không phải `action` gốc) — khối notify Shared Space (assign/hoàn thành task)
   chạy TRƯỚC trong `smartDispatch` có thể ĐÃ gắn sẵn `payload.id` cho `TASK_CREATE` vào
   `actionToDispatch` (đảm bảo id gửi trong notify khớp đúng id task thật); nếu dùng lại `action`
   gốc, `handleTaskActionForPersist()` sẽ tự sinh 1 id THỨ HAI khác hẳn, tạo ra 2 UUID khác nhau cho
   cùng 1 lượt tạo. 3 nhánh Log/Habit/Reminder ở trên KHÔNG có rủi ro này (không có notify nào chạy
   trước gắn sẵn id) nên vẫn dùng `action` gốc như cũ.
4. ✅ **Tích hợp dispatch** — `AppStateContext.tsx` (`smartDispatch`) gọi
   `handleTaskActionForPersist()` cho mọi action `TASK_*`, thêm NGAY SAU nhánh Reminder, độc lập với
   luồng save Space-level (`kn_private_spaces.tasks`/`kn_shared_spaces.tasks` jsonb — VẪN LÀ NGUỒN
   THẬT, không đổi gì). Cờ `TASK_ITEM_PERSIST_ENABLED = false` (đầu phần Task trong `itemPersist.ts`)
   — khi `false`, `handleTaskActionForPersist()` chỉ tự sinh `id` cho `TASK_CREATE` nếu thiếu
   (mirror Log/Habit/Reminder), KHÔNG gọi bất kỳ hàm nào trong `taskStore.ts` (bảng
   `kn_private_tasks`/`kn_shared_tasks` CHƯA tồn tại thật). `flushAllPendingTaskPersist()` cũng đã
   nối vào nhánh `hidden` của `visibilitychange` (cùng chỗ Log/Habit/Reminder).
5. ✅ **Migration — ĐÃ CHẠY XONG (2026-07-11)** — `src/storage/migrateLegacyTasks.ts` (mirror
   `migrateLegacyReminders.ts`, CÓ nhánh shared), giữ nguyên `order`/`createdAt` cũ (`created_at`
   chỉ set khi có giá trị thật), expose qua `window.knMigrateTasks.preview()/.run()` (`main.tsx`).
   Chủ dự án đã tự chạy `item-level-task-schema.sql` trên Supabase Dashboard, chạy `.run()` — dữ liệu
   thật 30/30 khớp, idempotent đúng.

**Test mới (Bước 4b):**
- `src/state/reducers/tasks.test.ts` — bộ test `TASK_REORDER (fractional-index)` (kéo giữa/đầu/cuối
  danh sách, no-op khi `draggedId`/`targetId` không hợp lệ, kéo lặp lại nhiều lần liên tiếp không
  NaN/crash, và edge-case kéo đi rồi kéo NGAY VỀ đúng vị trí cũ — xác nhận `order` khôi phục đúng
  giá trị số học ban đầu, verify tính idempotent của công thức khi thao tác qua lại).
- `src/state/itemPersist.test.ts` — `computeTaskPersistDescriptors`/`mergeTaskPendingOp` (thuần
  logic, mirror Log/Habit/Reminder lúc mới viết, KHÔNG gọi Supabase thật).
- Tổng **132/132 test pass** (từ 108 sau Bước 4a, +24 test: reducer Task + itemPersist Task).

**Cách test sub-bước 1-4 (lịch sử — ghi lại đúng lúc cờ CÒN tắt, TRƯỚC khi bật Giai đoạn A+B ở dưới;
giữ nguyên làm hồ sơ, xem mục "Cách test Giai đoạn A+B" phía dưới cho tình trạng hiện tại):**
- `npx tsc --noEmit`, `npm run build`, `npm test` (132/132) — cả 3 PASS.
- Tạo/sửa/tick/kéo-thả/xoá 1 Task ở Space cá nhân bất kỳ — UI phải hoạt động **giống hệt trước** (cờ
  `TASK_ITEM_PERSIST_ENABLED` còn `false`, mọi thứ vẫn đọc/ghi qua cột `tasks` jsonb như cũ). Mở
  DevTools > Network trong lúc thao tác, xác nhận **KHÔNG** có request nào tới `kn_private_tasks`/
  `kn_shared_tasks` (2 bảng chưa tồn tại thật — nếu thấy request lỗi "relation does not exist" là
  dấu hiệu cờ bị bật nhầm, cần báo ngay).
- Đọc code review: `src/storage/taskStore.ts`, `src/state/itemPersist.ts` (phần Task ở cuối file),
  đoạn tích hợp trong `src/state/AppStateContext.tsx` (`smartDispatch`, tìm
  `isTaskAction`/`handleTaskActionForPersist`), `docs/features/item-level-task-schema.sql`,
  `src/storage/migrateLegacyTasks.ts`.

### Giai đoạn A+B của Task — ĐÃ CODE XONG GỘP CHUNG (2026-07-11)

Theo yêu cầu tường minh của chủ dự án (mirror kỹ thuật + tiến độ đã dùng cho Reminder — gộp cả 2
giai đoạn trong 1 lượt, không tách 2 lượt test riêng như Log/Habit):

- **Giai đoạn A** — `TASK_ITEM_PERSIST_ENABLED = true` (`src/state/itemPersist.ts`). Mọi action
  `TASK_*` dual-write thật vào `kn_private_tasks`/`kn_shared_tasks`, song song với cột `tasks` jsonb
  cũ (chưa tắt).
- **Giai đoạn B** — hàm mới `hydrateItemLevelTasks(spaces, shouldSkip?)` trong `AppStateContext.tsx`,
  mirror CHÍNH XÁC `hydrateItemLevelReminders()` (Task CÓ bản Shared — gọi `loadPrivateTasks`/
  `loadSharedTasks` song song qua `Promise.all` cho CẢ private lẫn shared, gán đè `space.tasks`). Gọi
  ở bootstrap (sau `hydrateItemLevelReminders`, trước `hydrateItemLevelNotes`, trước dispatch
  `HYDRATE`) và trong `refreshStaleSpaces()` (cho cả nhánh private lẫn shared, sau khi đã qua đủ
  Log→Habit→Reminder). Lỗi tải riêng 1 Space không fail cả app — fallback dùng `tasks` jsonb gốc,
  `console.warn`. Baseline `prevPrivateRef`/`prevSharedRef` cập nhật đúng lúc (mirror Reminder —
  bootstrap: gán đè xảy ra TRƯỚC `HYDRATE`, baseline bắt đầu rỗng nên không tự bắn save thừa;
  `refreshStaleSpaces()`: baseline được set SAU khi đã qua đủ mọi lượt hydrate, gồm cả Task).
  `refreshStaleSpaces()` bỏ qua Space đang có Task pending qua `hasPendingTasksForSpace(scope,
  spaceId)` (đã viết sẵn từ Bước 4b, dựa trên map `activeTaskSpaceRefs` theo dõi cả lúc debounce lẫn
  lúc network đang bay — mirror `hasPendingRemindersForSpace`).
- **Test mới** — `src/state/itemPersist.test.ts`: thêm `describe('hasPendingTasksForSpace', ...)` (4
  test, mock `../storage/taskStore` để không gọi Supabase thật — không có test tương đương
  `LOG_DELETE_MANY` vì Task không có action xoá hàng loạt): Space chưa đụng tới → `false`;
  TASK_CREATE → `true` xuyên suốt lúc debounce + lúc network đang bay + `false` sau khi resolve;
  TASK_CREATE rồi TASK_DELETE cùng id trong cùng cửa sổ debounce → huỷ hẳn, không gọi network;
  TASK_DELETE (đã tồn tại từ trước) → `true` lúc debounce + lúc network đang bay, `false` sau khi
  resolve. Tổng **169/169 test pass** (từ 161 sau Bước 5a/5b của Note ở giai đoạn chuẩn bị, +8 test
  mới cho cả Task lẫn Note — xem mục Note bên dưới).
- **Xác nhận luồng notify Shared Space task-assign KHÔNG bị ảnh hưởng** — `computeTaskCreateNotifyEffect`/
  `computeTaskUpdateNotifyEffect`/`computeTaskToggleDoneNotifyEffect` (`sharedTaskNotifyEffects.ts`)
  chạy dựa trên `tasksReducer` thuần (không đọc/ghi Supabase), hoàn toàn độc lập với việc `space.tasks`
  giờ đọc từ bảng item-level hay jsonb — cutover phần đọc không đổi hành vi notify.

**Cách test Giai đoạn A+B (chủ dự án tự làm, có OAuth thật, 1 lượt duy nhất, gộp chung với Note —
xem hướng dẫn đầy đủ ở cuối mục Bước 5 bên dưới, phần "Cách test Giai đoạn A+B (Task+Note)".**

**Bước kế tiếp:** SQL + migration dữ liệu thật + bật Giai đoạn A + code Giai đoạn B đều **ĐÃ XONG
(2026-07-11)**. Còn lại: chủ dự án tự test tay UI thật qua OAuth (xem hướng dẫn gộp chung Task+Note ở
cuối mục Bước 5); sau khi ổn định, cân nhắc tắt nhánh ghi `tasks` jsonb (mirror câu hỏi mở #2, chưa
quyết định chính thức cho entity nào) — chưa làm ở lượt này.

---

## Bước 5 — entity Note (`kn_private_notes`/`kn_shared_notes`, CÓ bản shared, ENTITY CUỐI CÙNG)

Theo đúng 5 bước con đã mô tả ở `item-level-entity-tables.md` mục 7, mirror CHÍNH XÁC cách làm Task
(Bước 4b) ở giai đoạn TRƯỚC KHI bật Giai đoạn A/B (chỉ chuẩn bị, chưa đụng dữ liệu thật). KHÔNG cần
bước con "4a" riêng (fractional-index thuần logic đã viết + test xong ở Bước 4a, tái dùng nguyên
`computeOrderForInsertAt()`, không sửa module đó).

**Rủi ro thiết kế đã xác định TRƯỚC khi code (khác mọi entity trước) — cột `content_updated_at`
tách khỏi trigger `updated_at`:** `Note.updatedAt` (`src/types.ts`, epoch ms) là mốc "sửa nội dung lần
cuối" — hiển thị "đã sửa lúc..." cho user VÀ dùng để sort "Mới sửa gần nhất". Ở tầng reducer
(`state/reducers/notes.ts`), field này CHỈ đổi ở `NOTE_CREATE`/`NOTE_UPDATE` — KHÔNG đổi khi kéo-thả
(`NOTE_REORDER`) hay ẩn/hiện (`NOTE_TOGGLE_CONTENT_HIDDEN`). Log/Reminder/Task đều dùng THẲNG cột
`updated_at` do trigger `*_before_update` tự bump VÔ ĐIỀU KIỆN mỗi lần UPDATE để suy ra field hiển thị
tương ứng của họ — nếu Note copy y nguyên cách đó, 1 lần kéo-thả hoặc ẩn/hiện 1 note sẽ VÔ TÌNH đổi
"đã sửa lúc..." và làm SAI thứ tự sort "Mới sửa gần nhất" — REGRESSION thật so với hành vi hiện tại
(jsonb), PHẢI TRÁNH. **Quyết định:** thêm cột RIÊNG `content_updated_at` (double precision, epoch ms)
— CHỈ tầng app (`noteStore.ts`) set tường minh khi ghi `NOTE_CREATE`/`NOTE_UPDATE` (map thẳng
`Note.updatedAt`, KHÔNG qua `Date`/ISO string), KHÔNG đụng khi ghi `NOTE_REORDER` (chỉ patch
`item_order`)/`NOTE_TOGGLE_CONTENT_HIDDEN` (chỉ patch `hidden`). Cột `updated_at` (trigger nội bộ,
mirror các bảng khác — "miễn phí") vẫn giữ trên DB nhưng KHÔNG được tầng app đọc/dùng để suy ra
`Note.updatedAt`. Xem giải thích đầy đủ ở header `docs/features/item-level-note-schema.sql`.

1. ✅ **Bảng mới** — `docs/features/item-level-note-schema.sql` (file mới, CHƯA chạy lên Supabase
   Dashboard thật). `kn_private_notes`/`kn_shared_notes`, mirror đúng `kn_private_tasks`/
   `kn_shared_tasks`: `id` uuid client-sinh, `item_order` double precision NOT NULL
   (fractional-index), `created_by` uuid null (chỉ ý nghĩa hiển thị avatar Shared Space, không dùng
   cho RLS), `created_at` timestamptz NULL ĐƯỢC (mirror Task — `Note.createdAt` optional ở tầng app),
   `hidden` boolean NOT NULL DEFAULT false, **`content_updated_at` double precision NOT NULL** (cột
   RIÊNG, xem giải thích rủi ro thiết kế ở trên), `version`/trigger giữ nguyên nhưng không dùng
   version-check.
2. ✅ **RLS 2 nhánh tách biệt** — gộp trong cùng file SQL trên. Private: `auth.uid() = user_id`
   (mirror `kn_private_tasks`). Shared: `is_space_member(space_id)` (mirror `kn_shared_tasks`, mọi
   member được sửa/xoá note của người khác trong cùng Space — đúng hành vi cũ, không giới hạn theo
   người tạo).
3. ✅ **Storage layer** — `src/storage/noteStore.ts` (CRUD: `loadPrivateNotes`/`loadSharedNotes`
   (sort theo `item_order`)/`createNote`/`insertNotesBulk`/`updateNote` (patch hẹp theo từng nhóm
   field)/`deleteNote`/`listExistingNoteIds`, ghi thẳng blind write; `toInsertRow()` chỉ set
   `created_at` khi `Note.createdAt` có giá trị thật; `rowToNote()` map `content_updated_at` ->
   `Note.updatedAt` TRỰC TIẾP, không qua `Date`). `src/state/itemPersist.ts` mở rộng thêm nhánh Note
   (giữ NGUYÊN 4 nhánh Log/Habit/Reminder/Task có sẵn, chỉ nối thêm phía dưới) — debounce theo
   `itemId` 600ms, `mergeNotePendingOp()`, hàng đợi `notePending`/`noteInFlight` riêng. 3 action UPDATE
   tách biệt (`NOTE_UPDATE`/`NOTE_REORDER`/`NOTE_TOGGLE_CONTENT_HIDDEN`), mỗi action patch 1 nhóm
   field hẹp — mirror cách Task dùng patch hẹp. Đã áp dụng luôn fix bug `inFlight` (tự tham chiếu
   đúng promise `wrapped` khi dọn map) và viết sẵn `hasPendingNotesForSpace()`/`activeNoteSpaceRefs`
   NGAY TỪ ĐẦU dù chưa có Giai đoạn B để dùng tới ở lượt này (mirror bài học đã áp dụng cho
   Habit/Reminder/Task). **KHÁC Task:** đã xác nhận qua grep toàn repo — Note KHÔNG có notify Shared
   Space/Edge Function nào chạy trước gắn sẵn `payload.id` (khác Task, nơi khối notify assign/hoàn
   thành task có thể đã gắn id trước khi tới `handleTaskActionForPersist()`), nên
   `handleNoteActionForPersist()` không cần logic `actionToDispatch` đặc biệt như Task.
4. ✅ **Tích hợp dispatch** — `AppStateContext.tsx` (`smartDispatch`) gọi
   `handleNoteActionForPersist()` cho mọi action `NOTE_*`, thêm NGAY SAU nhánh Task, độc lập với luồng
   save Space-level (`kn_private_spaces.notes`/`kn_shared_spaces.notes` jsonb — VẪN LÀ NGUỒN THẬT,
   không đổi gì). Cờ `NOTE_ITEM_PERSIST_ENABLED = false` (đầu phần Note trong `itemPersist.ts`) — khi
   `false`, `handleNoteActionForPersist()` chỉ tự sinh `id` cho `NOTE_CREATE` nếu thiếu (mirror
   Log/Habit/Reminder/Task), KHÔNG gọi bất kỳ hàm nào trong `noteStore.ts` (bảng `kn_private_notes`/
   `kn_shared_notes` CHƯA tồn tại thật). `flushAllPendingNotePersist()` cũng đã nối vào nhánh `hidden`
   của `visibilitychange` (cùng chỗ Log/Habit/Reminder/Task).
5. ✅ **Migration — ĐÃ CHẠY XONG (2026-07-11)** — `src/storage/migrateLegacyNotes.ts` (mirror
   `migrateLegacyTasks.ts`, CÓ nhánh shared), giữ nguyên `order`/`updatedAt` cũ (`updatedAt` GIỮ
   NGUYÊN giá trị epoch ms cũ, KHÔNG tính lại "now" — mốc lịch sử phải giữ đúng; `created_at` chỉ set
   khi có giá trị thật), expose qua `window.knMigrateNotes.preview()/.run()` (`main.tsx`). Chủ dự án
   đã tự chạy `item-level-note-schema.sql` trên Supabase Dashboard, chạy `.run()` — dữ liệu thật 7/7
   khớp, idempotent đúng.

**Test mới:**
- `src/state/reducers/notes.test.ts` (Note trước đây CHƯA có unit test nào) — 13 test: `NOTE_CREATE`
  dùng đúng `id` truyền sẵn / tự sinh UUID khi không truyền; bộ test `NOTE_REORDER
  (fractional-index)` phủ CẢ 2 biến thể `insertAfter=false` (chèn trước targetId) và `insertAfter=true`
  (chèn ngay sau targetId) — kéo giữa/đầu/cuối danh sách, no-op khi `draggedId`/`targetId` không hợp
  lệ hoặc trùng nhau, kéo lặp lại nhiều lần liên tiếp không NaN/crash, kéo đi rồi kéo NGAY VỀ đúng vị
  trí cũ (idempotent, mirror edge-case đã thêm cho Task ở Việc 1); 2 test riêng xác nhận
  `NOTE_REORDER`/`NOTE_TOGGLE_CONTENT_HIDDEN` KHÔNG đổi `updatedAt` (verify trực tiếp bất biến thiết
  kế quan trọng nhất của Bước 5 — nếu ai vô tình sửa reducer làm 2 action này đụng `updatedAt`, test
  này sẽ đỏ ngay).
- `src/state/itemPersist.test.ts` — `computeNotePersistDescriptors` (9 test)/`mergeNotePendingOp` (5
  test), thuần logic, mirror Log/Habit/Reminder/Task lúc mới viết, KHÔNG gọi Supabase thật. Riêng
  `NOTE_REORDER`/`NOTE_TOGGLE_CONTENT_HIDDEN` có test xác nhận descriptor patch CHỈ gồm đúng 1 field
  (`order`/`hidden`), KHÔNG kèm `updatedAt` — mirror bất biến thiết kế đã kiểm ở reducer.
- Tổng **161/161 test pass** (từ 132 sau Bước 4, +29 test: 13 reducer Note + 16 itemPersist Note).

**Cách test sub-bước 1-4 (lịch sử — ghi lại đúng lúc cờ CÒN tắt, TRƯỚC khi bật Giai đoạn A+B ở dưới;
giữ nguyên làm hồ sơ, xem mục "Cách test Giai đoạn A+B (Task+Note)" phía dưới cho tình trạng hiện
tại):**
- `npx tsc --noEmit`, `npm run build`, `npm test` (161/161) — cả 3 PASS (đã tự chạy, xem kết quả ở
  trên).
- **Môi trường agent hiện tại không tự đăng nhập Google OAuth được** — không thao tác UI thật qua
  `npm run dev` để xác nhận runtime bằng tay (mirror đúng tình trạng đã ghi nhận ở Bước 4a/4b — Task
  cũng không được test tay UI ở giai đoạn chuẩn bị này, chỉ dựa vào unit test + code review). Chủ dự
  án cần tự test tay 1 lượt qua `npm run dev` (OAuth thật): tạo/sửa/kéo-thả (thử cả kéo lên/xuống, thử
  thả vào nửa trên lẫn nửa dưới của 1 note khác để phủ cả 2 nhánh `insertAfter`)/ẩn-hiện/xoá 1 Ghi chú
  ở Space cá nhân bất kỳ — UI phải hoạt động **giống hệt trước** (cờ `NOTE_ITEM_PERSIST_ENABLED` còn
  `false`, mọi thứ vẫn đọc/ghi qua cột `notes` jsonb như cũ). Mở DevTools > Network trong lúc thao
  tác, xác nhận **KHÔNG** có request nào tới `kn_private_notes`/`kn_shared_notes` (2 bảng chưa tồn tại
  thật — nếu thấy request lỗi "relation does not exist" là dấu hiệu cờ bị bật nhầm, cần báo ngay).
  Quan trọng nhất cần để ý: sau khi kéo-thả hoặc ẩn/hiện 1 note, dòng chữ "đã sửa lúc..." hiển thị
  trên UI (nếu có) KHÔNG được đổi — chỉ sửa nội dung/tiêu đề/màu mới đổi dòng đó.
- Đọc code review: `src/storage/noteStore.ts`, `src/state/itemPersist.ts` (phần Note ở cuối file),
  đoạn tích hợp trong `src/state/AppStateContext.tsx` (`smartDispatch`, tìm
  `isNoteAction`/`handleNoteActionForPersist`), `docs/features/item-level-note-schema.sql`,
  `src/storage/migrateLegacyNotes.ts`, `src/state/reducers/notes.ts` (`NOTE_REORDER`).

### Giai đoạn A+B của Note — ĐÃ CODE XONG GỘP CHUNG (2026-07-11), CÙNG LƯỢT với Task

Theo yêu cầu tường minh của chủ dự án — bật Giai đoạn A+B cho CẢ Task lẫn Note trong CÙNG 1 lượt
(mirror kỹ thuật đã dùng cho Reminder, chỉ khác là gộp luôn 2 entity thay vì 1):

- **Giai đoạn A** — `NOTE_ITEM_PERSIST_ENABLED = true` (`src/state/itemPersist.ts`). Mọi action
  `NOTE_*` dual-write thật vào `kn_private_notes`/`kn_shared_notes`, song song với cột `notes` jsonb
  cũ (chưa tắt).
- **Giai đoạn B** — hàm mới `hydrateItemLevelNotes(spaces, shouldSkip?)` trong `AppStateContext.tsx`,
  mirror CHÍNH XÁC `hydrateItemLevelTasks()` (Note CÓ bản Shared — gọi `loadPrivateNotes`/
  `loadSharedNotes` song song qua `Promise.all` cho CẢ private lẫn shared, gán đè `space.notes`). Gọi
  ở bootstrap (sau `hydrateItemLevelTasks`, trước dispatch `HYDRATE` — là bước hydrate CUỐI CÙNG
  trong chuỗi Log→Habit→Reminder→Task→Note) và trong `refreshStaleSpaces()` (cho cả nhánh private lẫn
  shared, sau khi đã qua đủ 4 entity trước). Lỗi tải riêng 1 Space không fail cả app — fallback dùng
  `notes` jsonb gốc, `console.warn`. Baseline `prevPrivateRef`/`prevSharedRef` cập nhật đúng lúc
  (mirror Task — bootstrap: gán đè xảy ra TRƯỚC `HYDRATE`, baseline bắt đầu rỗng nên không tự bắn save
  thừa; `refreshStaleSpaces()`: baseline được set SAU khi đã qua đủ mọi lượt hydrate, gồm cả Note).
  `refreshStaleSpaces()` bỏ qua Space đang có Note pending qua `hasPendingNotesForSpace(scope,
  spaceId)` (đã viết sẵn từ Bước 5, dựa trên map `activeNoteSpaceRefs` theo dõi cả lúc debounce lẫn
  lúc network đang bay — mirror `hasPendingTasksForSpace`).
- **Test mới** — `src/state/itemPersist.test.ts`: thêm `describe('hasPendingNotesForSpace', ...)` (4
  test, mock `../storage/noteStore` để không gọi Supabase thật — không có test tương đương
  `LOG_DELETE_MANY` vì Note không có action xoá hàng loạt): Space chưa đụng tới → `false`;
  NOTE_CREATE → `true` xuyên suốt lúc debounce + lúc network đang bay + `false` sau khi resolve;
  NOTE_CREATE rồi NOTE_DELETE cùng id trong cùng cửa sổ debounce → huỷ hẳn, không gọi network;
  NOTE_DELETE (đã tồn tại từ trước) → `true` lúc debounce + lúc network đang bay, `false` sau khi
  resolve. Tổng **169/169 test pass** (từ 161, +8 test mới: 4 `hasPendingTasksForSpace` + 4
  `hasPendingNotesForSpace`, gộp chung cùng lượt với Task).
- `npx tsc --noEmit` + `npm run build` PASS sau khi bật cả 2 cờ.
- **Đây là entity CUỐI CÙNG** trong kế hoạch tổng (Log → Habit → Reminder → Task → Note) — cả 5/5
  entity đều đã Giai đoạn A+B, xem mốc hoàn tất ở đầu file.

**Cách test Giai đoạn A+B (Task+Note) — chủ dự án tự làm, có OAuth thật, 1 lượt duy nhất cho CẢ 2
entity:**
- `npx tsc --noEmit`, `npm run build`, `npm test` — cả 3 đã PASS phía `dev` (169/169 test).
- Gọi REST API `kn_private_tasks`/`kn_shared_tasks`/`kn_private_notes`/`kn_shared_notes` bằng anon
  key qua `curl` — trả `200 []` (không phải lỗi "relation does not exist") — xác nhận cả 4 bảng tồn
  tại thật trên Supabase.
- **Task:** tạo 1 Task mới ở Space cá nhân → phải hiện ngay trên UI (đọc từ `kn_private_tasks`). Mở
  DevTools > Network lọc `kn_private_tasks`, xác nhận có `POST`. Sửa tiêu đề/nội dung/ngày/giờ/người
  được giao → `PATCH` qua `TASK_UPDATE`. Tick hoàn thành → `PATCH` riêng (chỉ field `done`) qua
  `TASK_TOGGLE_DONE`. Kéo-thả đổi thứ tự → `PATCH` riêng (chỉ field `item_order`) qua `TASK_REORDER`.
  Xoá → `DELETE`. Đối chiếu Supabase Table Editor thấy dòng khớp đúng.
- **Note:** tạo 1 Ghi chú mới ở Space cá nhân → phải hiện ngay trên UI (đọc từ `kn_private_notes`).
  Sửa tiêu đề/nội dung/màu → `PATCH` qua `NOTE_UPDATE`, kiểm tra Table Editor cột `content_updated_at`
  ĐỔI đúng mốc mới. **Kéo-thả đổi thứ tự (thử cả thả vào nửa TRÊN lẫn nửa DƯỚI của 1 note khác, phủ cả
  2 nhánh `insertAfter`)** → `PATCH` riêng (chỉ field `item_order`) qua `NOTE_REORDER` — xác nhận dòng
  chữ "đã sửa lúc..." hiển thị trên UI **KHÔNG đổi**, và cột `content_updated_at` trên Table Editor
  **KHÔNG đổi**. **Ẩn/hiện nội dung note** → `PATCH` riêng (chỉ field `hidden`) qua
  `NOTE_TOGGLE_CONTENT_HIDDEN` — xác nhận tương tự "đã sửa lúc..."/`content_updated_at` **KHÔNG đổi**.
  Xoá → `DELETE`.
- F5 (reload full trang) hoặc mở tab mới cùng tài khoản → Task/Note cũ (đã migrate) + vừa tạo/sửa đều
  hiển thị đúng, đúng thứ tự (`item_order` tăng dần).
- Mở 2 tab cùng lúc (cùng Space cá nhân hoặc cùng Shared Space): ở tab A tạo/sửa/xoá 1 Task và 1 Note,
  chuyển sang tab B (trigger `visibilitychange` → `visible`) → tab B phải thấy thay đổi từ tab A. Ngay
  sau khi tab B refresh xong (không thao tác gì thêm), mở DevTools > Network ở tab B, xác nhận
  **KHÔNG** có request `PATCH kn_private_spaces`/`kn_shared_spaces` tự bắn ra (dấu hiệu bug baseline
  nếu có).
- Test thêm race hiếm: ở 1 tab, tạo 1 Task (hoặc Note) rồi LẬP TỨC chuyển tab đi (trong vòng < 600ms)
  rồi quay lại ngay — item vừa tạo phải KHÔNG biến mất khỏi UI khi tab quay lại `visible`.
- Test ở Shared Space: tạo/sửa/xoá 1 Task và 1 Note, xác nhận request đi đúng bảng `kn_shared_tasks`/
  `kn_shared_notes` (không lẫn bảng private), thành viên khác (nếu test được) mở tab/F5 thấy đúng
  thay đổi. Đồng thời assign Task cho 1 thành viên khác → xác nhận notify Shared Space (thông báo
  "được giao việc") vẫn hoạt động bình thường như trước (cutover phần đọc không đụng luồng notify).

**Bước kế tiếp:** SQL + migration dữ liệu thật + bật Giai đoạn A + code Giai đoạn B đều **ĐÃ XONG
(2026-07-11)** cho CẢ Task lẫn Note. Còn lại: chủ dự án tự test tay UI thật qua OAuth theo hướng dẫn
ở trên; sau khi ổn định, cân nhắc bước tổng kết: rà soát tắt các nhánh ghi jsonb cũ đã "chết" (câu
hỏi mở #2, hiện vẫn [MỞ] cho cả 5 entity) một khi mọi Giai đoạn B đã chạy ổn định đủ lâu.

---

## ❓ Câu hỏi mở / quyết định phát sinh giữa chừng

1. ~~Có muốn bắt đầu việc #3 (tách bảng Log) trong CÙNG lượt với việc #1 + #2, hay làm #1 + #2 trước?~~ **Đã trả lời (2026-07-10):** chủ dự án xác nhận bắt đầu Bước 1 (Log) trực tiếp, việc #1/#2 hoá ra đã xong sẵn từ trước (xem ghi chú ở mục 2 trên).
2. **[MỞ]** Sub-bước 4 (tích hợp) hiện dùng model "Space-level jsonb VẪN LÀ NGUỒN THẬT, item-level chỉ ghi song song nhưng bị khoá bởi cờ" — khi tới lúc cutover thật (sau khi migrate xong + bật cờ), cần quyết định: có tiếp tục ghi CẢ HAI nơi (jsonb + bảng mới) 1 thời gian làm lưới an toàn trước khi đổi hẳn nguồn đọc sang bảng mới không, hay cutover dứt khoát luôn (đọc/ghi bảng mới, ngừng ghi jsonb `logs` ngay khi bật cờ)? Mirror quyết định đã áp dụng cho cột `spaces` cũ của `kn_space_state` (giữ lại "chết" 1 thời gian an toàn, xem `storage-architecture-fix-progress.md` Bước 3, quyết định #1) có thể là hướng hợp lý, nhưng CHƯA quyết định chính thức — cần bàn khi resume tới bước cutover, không phải bây giờ.

   **Cập nhật điều tra (2026-07-11, `dev` review theo yêu cầu chủ dự án trước khi bật cờ):** Đã xác nhận bằng code + `grep` toàn repo — `loadPrivateLogs()`/`loadSharedLogs()` (`logStore.ts`) **không được gọi ở bất kỳ đâu** ngoài định nghĩa của chính chúng. Phần đọc UI (`space.logs`) 100% vẫn qua `loadPrivateSpaces()`/`loadSharedSpaces()` (bootstrap, `AppStateContext.tsx:105,127`) và `refreshStaleSpaces()` (tab active lại, dòng 360-372) — tức mảng `logs` jsonb. Việc ghi jsonb (`privateSnapshot()` dòng 78, snapshot shared dòng 306/319) chạy qua `useEffect` diff-snapshot Space-level **độc lập hoàn toàn** với `LOG_ITEM_PERSIST_ENABLED`, KHÔNG bị tắt khi bật cờ. Kết luận quan trọng: **bật cờ ngay bây giờ AN TOÀN về mặt hiển thị** (không có bug "log biến mất khỏi UI" — jsonb vẫn được ghi/đọc y như cũ), nhưng **CHƯA đạt mục tiêu "Nhật ký nhanh hoạt động qua bảng mới"** như câu chữ mục "Việc tiếp theo" #3 sub-bước 5 (4) phía trên đang ngầm giả định — bật cờ hiện tại chỉ cộng thêm 1 đường ghi song song (dual-write) vào bảng mới, không có tác dụng gì lên hiển thị vì chưa có phần đọc nối vào.

   Rủi ro phụ phát hiện thêm: `setPrivateFallbackActive`/`setSharedFallbackActive` (banner "lỗi lưu" toàn app, `supabaseStore.ts:222-231`) đang dùng CHUNG giữa kênh save Space-level thật và kênh ghi item-level Log (`itemPersist.ts` gọi cùng 2 hàm này ở `flushLogItem`). Nếu ghi item-level Log thất bại (RLS/timeout thoáng qua) trong khi jsonb vẫn ghi thành công, user sẽ thấy banner lỗi giả dù dữ liệu thực đã an toàn — không mất dữ liệu nhưng gây hoang mang, nên cân nhắc tách kênh báo lỗi riêng khi làm giai đoạn B dưới đây.

   **Đề xuất hướng làm:**
   - **Giai đoạn A — ✅ ĐÃ BẬT (2026-07-11):** `LOG_ITEM_PERSIST_ENABLED = true`, KHÔNG đổi phần đọc. Mục đích: để bảng mới tự "đuổi kịp" mọi log phát sinh mới trong vài ngày/tuần, giảm rủi ro lệch dữ liệu trước khi cutover đọc. `npx tsc --noEmit`/`npm run build`/`npm test` (45/45) đều pass sau khi bật. Chủ dự án cần tự test tay theo hướng dẫn ở mục "Việc tiếp theo" #3 sub-bước 5 trên (môi trường agent không tự login OAuth được).
   - **Giai đoạn B — ✅ ĐÃ CODE XONG (2026-07-11), CHƯA test tay UI thật:** nối phần đọc — `hydrateItemLevelLogs()` (`AppStateContext.tsx`) gọi `loadPrivateLogs`/`loadSharedLogs` song song cho từng Space tại bootstrap + `refreshStaleSpaces()`, gán đè `space.logs`, no-op khi cờ `false`. Cả 3 lưu ý bắt buộc đã ghi ở đây trước đó đều đã xử lý — chi tiết đầy đủ xem block "Giai đoạn B — đã code xong" ngay phía trên mục "Việc tiếp theo" #3. Nhánh ghi `logs` jsonb VẪN CHẠY SONG SONG, chưa tắt — **quyết định tắt hẳn nhánh ghi jsonb (nếu có) để dịp khác, sau khi Giai đoạn B chạy ổn định 1 thời gian**, mirror cách xử lý cột `spaces` cũ của `kn_space_state`, không làm trong lượt này.
3. **[MỞ]** Race hiếm khi tạo Space cá nhân MỚI rồi lập tức thêm Log ngay khi INSERT Space vào `kn_private_spaces` chưa kịp hoàn tất (async, qua `useEffect` debounce riêng) — `handleLogActionForPersist()` đã có guard bỏ qua persist item-level khi `currentSpace._privateVersion === undefined` (Space chưa có hàng thật để làm FK cha), log vẫn lưu bình thường qua đường jsonb cũ, KHÔNG mất dữ liệu — chỉ là log đó sẽ persist item-level ở lần sửa KẾ TIẾP thay vì ngay lập tức. Chấp nhận được, ghi nhận ở đây để không quên khi review lại trước khi bật cờ. **Guard này đã được viết ĐỒNG NHẤT cho cả 5 entity** (`handleHabitActionForPersist`/`handleReminderActionForPersist`/`handleTaskActionForPersist`/`handleNoteActionForPersist` đều có cùng 1 dòng check `_privateVersion === undefined`), không riêng gì Log.

**Cập nhật mốc hoàn tất (2026-07-11):** câu hỏi mở #2 giờ áp dụng ĐỒNG THỜI cho cả 5 entity (Log/Habit/Reminder/Task/Note) — tất cả đều đang ở trạng thái "Giai đoạn A+B đã bật, nhánh ghi jsonb cũ VẪN CHẠY SONG SONG làm lưới an toàn, chưa entity nào tắt". Quyết định "có tắt nhánh ghi jsonb cũ hay không, tắt lúc nào" **vẫn CHƯA được chốt chính thức cho bất kỳ entity nào** — cần chủ dự án xác nhận sau khi đã test tay + chạy ổn định đủ lâu trên production, không làm vội trong lượt này.

**✅ ĐÃ CHỐT + LÀM XONG (2026-07-11, "Việc 1"):** chủ dự án xác nhận tắt hẳn nhánh ghi jsonb Space-level cho CẢ 5 entity CÙNG LÚC (không tách riêng từng entity/thời điểm như dự tính ban đầu ở trên) — xem mục "Việc 1 + Việc 2 — dọn dẹp dual-write jsonb" ngay phía trên đầu file để biết chi tiết đầy đủ (file đã sửa, cách xử lý luồng Import JSON — điểm rủi ro cao nhất, 2 rủi ro phát hiện thêm chưa xử lý). Cột jsonb VẪN GIỮ NGUYÊN trên DB (không DDL/ALTER/DROP) làm lưới an toàn lịch sử, chỉ dừng ghi ở tầng code — đúng tinh thần đã áp dụng cho cột `spaces` cũ của `kn_space_state`.

---

## Nguyên tắc bắt buộc khi triển khai (nhắc lại từ tài liệu chính + `dev.md`)

- Đúng 1 phần/lượt, `npx tsc --noEmit` + `npm run build` pass, cập nhật file tiến độ này ngay, dừng báo cáo — không tự nhảy sang phần kế tiếp.
- Sub-bước 5 (migrate thật) đụng dữ liệu thật — không đụng tài khoản chính chủ (User A) cho tới khi đã test sạch bằng tài khoản Google phụ (User B), đúng quy trình đã áp dụng thành công ở `storage-architecture-fix-progress.md`.
- Mọi câu lệnh SQL chạm hạ tầng thật (tạo bảng, RLS, migration) — `dev` chỉ chuẩn bị, KHÔNG tự chạy lên Supabase Dashboard thật.
- Câu hỏi mở/quyết định phát sinh giữa chừng → ghi vào đây kèm ngày, không tự quyết âm thầm.
