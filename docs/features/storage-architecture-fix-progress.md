# Sửa kiến trúc lưu trữ — file tiến độ Phần B

> Nguồn sự thật: `docs/features/storage-architecture-fix.md` mục 4 (Phần B). Phần A (dọn Realtime chết + gộp schema) đã xong 2026-07-09 — xem đánh dấu trong tài liệu đó. File này CHỈ theo dõi Phần B (sửa gốc kiến trúc Space cá nhân), làm cuốn chiếu đúng 1 phần/lượt, KHÔNG tự nhảy phần khi chưa được yêu cầu.
>
> **Cập nhật 2026-07-09:** kế hoạch đổi từ 6 bước (có tách project Supabase dev riêng) xuống còn **5 bước** — đã bỏ ý định tách project dev, thay bằng test bằng tài khoản Google phụ (User B) trên chính project production (xem mục 4 Phần B, đoạn "Cập nhật 2026-07-09" trong tài liệu chính để biết lý do đầy đủ). File này viết lại theo đúng 5 bước mới.

**Trạng thái tổng quan:** ✅ HOÀN TẤT TOÀN BỘ PHẦN B — Bước 1 ✅, Bước 2 ✅, Bước 3 ✅, Bước 3b ✅, Bước 4 ✅, Bước 5 ✅ (migration dữ liệu thật cho User A xong 2026-07-10, chủ dự án tự xác nhận khớp backup JSON — không mất Space/Task/Note/Habit/Log/layout nào).

**⚠️ ĐÃ TÁI HIỆN CRASH THẬT bằng Playwright (2026-07-09, QC `ba`):** đăng nhập tài khoản phụ `dev34.mafc@gmail.com` (đã có sẵn hàng `kn_space_state` từ trước, không phải user hoàn toàn mới nên KHÔNG chạy nhánh seed) → `kn_private_spaces` rỗng cho user này → `state.spaces = []` → `useCurrentSpace()` (`AppStateContext.tsx:493`) throw `Error: Current space not found` → **crash trắng màn hình thật, đã thấy tận mắt qua console log** (`HomeScreen`/`AppLayout` đều lỗi, không có Error Boundary). Xác nhận đúng cảnh báo ban đầu — không phải giả định. Dữ liệu không mất (cột `spaces` cũ của `kn_space_state` không bị đụng), nhưng app không dùng được cho tài khoản nào có hàng cũ + chưa migrate.

### Bước 3b — ✅ Hardening: xử lý mềm khi user có 0 Space (không crash)
Phát sinh từ crash thật ở trên. Làm TRƯỚC Bước 4 vì rẻ, độc lập, và tự nó đã là 1 lỗ hổng đáng vá (kể cả sau khi migrate xong, 1 tài khoản 0 Space theo bất kỳ lý do gì trong tương lai cũng không nên crash).

- [x] Sửa `useCurrentSpace()`/luồng render liên quan (`HomeScreen`, `AppLayout`) — khi `state.spaces` rỗng, hiện màn hình thân thiện ("Chưa có Space nào" + hướng dẫn/nút tạo mới) thay vì throw cứng.
- [x] Không cần Error Boundary tổng (ngoài phạm vi, việc lớn hơn cần thiết) — chỉ cần đúng điểm gọi `useCurrentSpace()` không throw khi mảng rỗng.

**Việc đã làm:**
- `src/state/AppStateContext.tsx`: **giữ nguyên** `useCurrentSpace()` (throw nếu không tìm thấy Space) — vẫn dùng cho MỌI component khác (`TasksBlock`, `NotesBlock`, `HabitsBlock`, `RemindersBlock`, `LogsBlock`, `NotificationsBlock`, `TaskFormModal`, `NoteFormModal`, `SettingsModal`, `MobileChatScreen`...), vì tất cả các component đó CHỈ được React mount làm con của `AppLayout`, sau khi `AppLayout` đã tự gác cổng (xem dưới) — "có Space hiện tại" vẫn là 1 invariant kiến trúc đúng ở các nơi đó, không cần sửa 9 file này.
  - Thêm hook mới `useCurrentSpaceOrNull()` — trả `Space | null` thay vì throw, dùng RIÊNG ở 2 điểm entry cấp cao nhất mount trực tiếp dưới `<Shell>` (đã xác nhận qua `grep -rn useCurrentSpace src/` — đúng 2 điểm gọi trực tiếp ở top-level, không sót nơi nào khác cần sửa):
    - `src/layout/AppLayout.tsx` — điểm chính cần Space thật để dựng Dashboard. Đổi `useCurrentSpace()` → `useCurrentSpaceOrNull()`; giữ nguyên toàn bộ hook gọi vô điều kiện (rules of hooks — không được return sớm trước khi hook cuối cùng chạy xong), guard 2 chỗ trực tiếp deref `space.enabledBlocks` (hàm `isBlockVisible`, dependency array của `useMemo` tính `visibleLayout`) để không crash trong lúc hook vẫn đang chạy dù kết quả sẽ bị bỏ qua; sau hook cuối cùng (`useLayoutEffect` bàn phím iOS), thêm `if (!space) return <NoSpaceScreen />;` — từ điểm này TypeScript tự narrow `space` về `Space` (non-null) cho toàn bộ phần còn lại của component. Phát sinh 1 chi tiết kỹ thuật: hàm `accordionCount` (dùng cho badge số lượng ở accordion mobile) phải đổi từ `function` declaration sang `const ... = () => {}` (arrow function) — TypeScript KHÔNG giữ narrowing qua closure của `function` declaration bị hoist, chỉ giữ được với `const` arrow function định nghĩa sau điểm narrow (đã xác nhận qua lỗi `tsc` thật, không phải suy đoán).
    - `src/features/home/HomeScreen.tsx` — mount song song `AppLayout` trên desktop (ẩn/hiện qua CSS opacity, không unmount — xem `App.tsx`) nên cũng phải tự chịu được `space === null` độc lập, không dựa vào guard của `AppLayout`. Home không thực sự cần Space để hoạt động (đồng hồ/lời chào/quote độc lập dữ liệu) — chỉ badge "X việc cần làm hôm nay" phụ thuộc `space.tasks`, nên xử lý tối giản: `taskCount = space ? space.tasks.filter(...).length : 0` (ẩn badge khi null), KHÔNG dựng riêng 1 màn "Chưa có Space" ở đây (đã có ở `AppLayout`, nơi thực sự cần Space để dựng Dashboard — tránh 2 UI trùng lặp cùng lúc khi cả `HomeScreen` lẫn `AppLayout` đều mounted).
- `src/features/spaces/NoSpaceScreen.tsx` (mới) — màn hình thân thiện: icon `FolderPlus`, tiêu đề "Chưa có Space nào", mô tả ngắn, nút "Tạo Space mới" mở `SpaceFormModal` (dùng lại nguyên component đã có, `space={null}` = chế độ tạo mới, tự dispatch `SPACE_CREATE`). `SPACE_CREATE` tự set `currentSpaceId` sang Space vừa tạo (đã có sẵn ở `appReducer.ts`, không phải sửa gì thêm) nên sau khi tạo xong, `AppLayout` tự re-render sang Dashboard bình thường — không cần code điều hướng thủ công.
- Đã `grep -rn "useCurrentSpace" src/` xác nhận đúng 11 điểm gọi tổng cộng: 2 điểm đổi sang `useCurrentSpaceOrNull()` (trên), 9 điểm còn lại giữ nguyên `useCurrentSpace()` (throw) vì đều là con transitively-guarded của `AppLayout`.

**Đã build/tsc/test:** `npx tsc --noEmit`, `npm run build`, `npm run test` (115 test) đều PASS.

**Cách test (đề nghị `ba` chạy lại bằng Playwright):** lặp lại đúng kịch bản vừa crash — đăng nhập `dev34.mafc@gmail.com` (có hàng `kn_space_state` cũ + 0 hàng `kn_private_spaces`) — xác nhận:
1. Không còn crash trắng màn hình, không còn lỗi `Error: Current space not found` trong console.
2. Thấy màn hình "Chưa có Space nào" (icon + mô tả + nút "Tạo Space mới") thay cho Dashboard.
3. Bấm "Tạo Space mới" → mở đúng modal `SpaceFormModal` (giống modal "Space mới" bình thường ở `SpaceSwitcher`) → điền tên → Lưu → xác nhận chuyển thẳng sang Dashboard bình thường với Space vừa tạo, không cần F5.
4. Vào Supabase Dashboard > Table Editor > `kn_private_spaces`, xác nhận có đúng 1 hàng mới cho user này (`version = 1`).
5. F5 lại trang — xác nhận vẫn vào đúng Dashboard với Space vừa tạo (không quay lại màn "Chưa có Space").

**CHỈ test Bước 3/3b bằng tài khoản Google phụ, KHÔNG dùng tài khoản chính chủ (User A)** cho tới khi Bước 4 xong.

---

## Nguyên tắc bắt buộc (nhắc lại từ tài liệu chính + `dev.md`)

- Đúng 1 phần/lượt, `npx tsc --noEmit` + `npm run build` pass (khi có đụng code `.ts`/`.tsx`), cập nhật file tiến độ, dừng báo cáo — không tự nhảy sang phần kế tiếp.
- Không đụng dữ liệu thật của User A cho tới bước 5, và bước 5 phải có xác nhận rõ ràng từ chủ dự án trước khi chạy.
- Mọi câu lệnh SQL chạm hạ tầng thật (tạo bảng, trigger, chạy migration) — `dev` chỉ chuẩn bị, KHÔNG tự chạy lên Supabase Dashboard thật, đưa lại cho chủ dự án tự chạy hoặc xác nhận rõ ràng trước.
- Câu hỏi mở/quyết định kiến trúc phát sinh giữa chừng → ghi vào mục "Quyết định/câu hỏi mở" bên dưới + hỏi lại, không tự quyết.
- Mỗi phần xong phải kèm hướng dẫn test cụ thể cho user (lệnh chạy, bước bấm, kết quả mong đợi) — ghi cả vào mục "Cách test" của phần đó lẫn trong câu trả lời cuối cùng gửi user.

---

## Checklist các bước (5 bước, đổi từ 6 bước cũ — không còn tách project dev riêng)

### Bước 1 — ✅ Bảng mới cho Space cá nhân (`kn_private_spaces`)
Phụ thuộc: không (làm trước tiên). Thuần thêm bảng mới, không đụng bảng cũ — an toàn chạy thẳng trên production.

- [x] Đọc kỹ `kn_shared_spaces` (cột, trigger `kn_shared_spaces_before_update`, RLS) làm mẫu.
- [x] Đọc kỹ `interface Space` (`src/types.ts`) để không thiếu/thừa field.
- [x] Thiết kế + viết SQL bảng `kn_private_spaces` (mỗi hàng = 1 Space cá nhân), thêm vào cuối `supabase/schema.sql`.
  - Cột: `id` (uuid PK, KHÔNG default — client tự sinh, giữ nguyên id Space cũ), `user_id`, `name`, `space_order` (map field `order` — đổi tên vì `order` là từ khoá SQL), `enabled_blocks`, `tasks`, `reminders`, `habits`, `notes`, `logs`, `version`, `created_at`, `updated_at`.
- [x] Trigger `kn_private_spaces_before_update` — copy chính xác logic tăng `version`/`updated_at` từ `kn_shared_spaces_before_update`.
- [x] RLS 4 policy (select/insert/update/delete) `auth.uid() = user_id`.
- [x] Index `idx_kn_private_spaces_user_id` + `idx_kn_private_spaces_user_id_order`.
- [x] **Đã chạy trên Supabase Dashboard thật (2026-07-09, chủ dự án tự chạy)** — bảng/trigger/RLS đã tồn tại trên production.
- [x] KHÔNG đụng code TypeScript nào ở bước này (đúng phạm vi đã chốt) — chưa có `.ts`/`.tsx` nào đọc/ghi bảng này, `kn_space_state` vẫn là nguồn thật đang chạy.

**Cách test (sau khi chủ dự án tự chạy SQL trên Dashboard):**
1. Vào Supabase Dashboard > Table Editor, xác nhận bảng `kn_private_spaces` xuất hiện đúng 13 cột như thiết kế.
2. Vào Database > Triggers, xác nhận trigger `kn_private_spaces_before_update` tồn tại trên bảng này.
3. Thử INSERT tay 1 hàng test qua SQL Editor (với `user_id` = uid tài khoản đang đăng nhập), sau đó UPDATE (vd đổi `name`) — xác nhận `version` tự tăng lên (1 → 2) và `updated_at` tự đổi, không cần tự set trong câu UPDATE.
4. Kiểm tra RLS: đăng nhập 2 tài khoản Google khác nhau qua Supabase client, xác nhận tài khoản B không SELECT/UPDATE/DELETE được hàng do tài khoản A tạo (và ngược lại).
5. Dọn hàng test sau khi kiểm tra xong (DELETE tay) — bảng chưa có code app nào dùng nên không ảnh hưởng gì nếu để lại, nhưng nên dọn cho sạch.

---

### Bước 2 — ✅ Tách `settings` khỏi vòng lưu chung với `spaces`
Phụ thuộc: không bắt buộc phải sau Bước 1 (không đụng bảng Space), nhưng làm sau cho mạch lạc.

- [x] `settings` lưu/đọc độc lập, chỉ ghi khi chính `settings` đổi (không kéo theo mỗi lần 1 Space đổi).
- [x] Quyết định: `settings` **ở lại `kn_space_state`** (chưa tách bảng riêng) — vì scope Bước 2 chỉ là tách LUỒNG GHI, chưa phải tách SCHEMA (đó là việc của Bước 3, khi viết lại tầng `storage/` để dùng bảng `kn_private_spaces` mới cho `spaces`). Ghi rõ ở đây để `ba`/chủ dự án biết: sau Bước 3, bảng `kn_space_state` nhiều khả năng sẽ chỉ còn giữ cột `settings` (đổi tên bảng khi đó cũng nên cân nhắc, vd `kn_user_settings`) — chưa đổi tên ngay bây giờ vì Bước 2 chưa đụng schema, tránh migration ngoài phạm vi đã chốt.

**Việc đã làm:**
- `src/storage/types.ts`: bỏ `SaveSnapshot` gộp, tách 2 type độc lập `SpacesSnapshot { spaces, currentSpaceId }` và `SettingsSnapshot { settings }`.
- `src/storage/supabaseStore.ts`:
  - Thêm `flushInitialRow(spaces, currentSpaceId, settings)` — **CHỈ** dùng trong `seedAndPersist()` (user mới, hàng chưa tồn tại) — ghi đủ cả 3 cột.
  - Thêm `flushSpaces(snapshot: SpacesSnapshot)` — `upsert` CHỈ 3 cột `user_id, spaces, current_space_id, updated_at` (không có `settings` trong payload gửi lên PostgREST → cột `settings` trên DB hoàn toàn không bị đụng tới).
  - Thêm `flushSettings(snapshot: SettingsSnapshot)` — `upsert` CHỈ 3 cột `user_id, settings, updated_at` (không có `spaces`/`current_space_id` trong payload).
  - **Quyết định kỹ thuật — dùng `upsert` (không phải `update`) cho cả 2 kênh:** vì hàng luôn đã tồn tại (được tạo bởi `seedAndPersist` lúc hydrate) nên với `upsert`, Postgres chạy `INSERT ... ON CONFLICT (user_id) DO UPDATE SET <đúng các cột được truyền>` — hành vi giống hệt `update()` thường trong trường hợp bình thường. Khác biệt chỉ lộ ra ở tình huống cực hiếm (hàng bị xoá ngoài luồng ứng dụng): `update()` sẽ **âm thầm không làm gì** (0 row affected, không báo lỗi) — dữ liệu coi như mất mà không ai biết; `upsert` sẽ cố `INSERT` và **báo lỗi rõ ràng** (vi phạm NOT NULL do thiếu cột kia) — an toàn hơn vì lỗi được `catch` và hiện qua banner `storageFallbackActive` thay vì mất âm thầm.
  - Viết lại cơ chế debounce thành 1 factory dùng chung `createSaveChannel<T>(flush, onFallback)` (tránh lặp code y hệt trước đây cho 2 kênh), tạo 2 instance độc lập `spacesChannel` / `settingsChannel` — mỗi kênh có `timer`/`pending snapshot` riêng, hoàn toàn tách biệt.
  - Banner lỗi (`storageFallbackActive`) gộp OR của cả 2 kênh (`spacesFallbackActive || settingsFallbackActive`) — tránh tình huống kênh này lưu thành công "xoá nhầm" banner lỗi đang có của kênh kia.
  - API export mới: `scheduleSpacesSave`, `scheduleSettingsSave`, `forceFlush` (giờ flush cả 2 kênh song song qua `Promise.all`), `saveSpacesSnapshotNow` (thay `saveSnapshotNow` cũ — bỏ tham số `settings` vì các modal Thêm/Sửa Task/Note/Reminder/Habit gọi hàm này chỉ sửa dữ liệu Space, không sửa settings).
- `src/state/AppStateContext.tsx`:
  - Tách effect debounce cũ (`[state.spaces, state.settings]` gộp) thành **2 effect độc lập**: 1 theo dõi `[state.spaces]` gọi `scheduleSpacesSave`, 1 theo dõi `[state.settings, isLoading]` gọi `scheduleSettingsSave`.
  - `saveNow()` (dùng cho nút "Lưu" trong modal private-space Task/Note/Reminder/Habit) — nhánh private space đổi từ gọi `saveSnapshotNow({ spaces, currentSpaceId, settings })` sang `saveSpacesSnapshotNow({ spaces, currentSpaceId })` — không còn gửi kèm `settings` trong lần lưu tức thời này nữa.
  - Nhánh shared-space của `saveNow`/effect debounce shared spaces giữ nguyên, không đụng tới (đã tách riêng từ trước, ngoài phạm vi Bước 2).
- `src/layout/useDashboardLayout.ts`: sửa 1 dòng comment lỗi thời nhắc tên hàm `scheduleSave` cũ → `scheduleSettingsSave` (layout dashboard lưu qua action `SETTINGS_SET_COL_WIDTHS`/`SETTINGS_SET_DASHBOARD_COLS`, tức đi qua kênh `settings`).

**Đã build/tsc:** `npx tsc --noEmit` và `npm run build` đều pass, không lỗi/warning mới.

**Cách test:**
1. `npm run dev`, đăng nhập, mở DevTools > Network, lọc theo `kn_space_state`.
2. Sửa 1 Task ở 1 Space cá nhân (vd đổi tiêu đề) → đợi ~600ms → xác nhận có đúng 1 request `PATCH .../kn_space_state...` với **request body CHỈ chứa `spaces`, `current_space_id`, `updated_at`** (payload JSON không có key `settings`).
3. Đổi theme (Cài đặt > Giao diện) hoặc kéo-resize 1 khối dashboard → đợi ~600ms → xác nhận có đúng 1 request `PATCH .../kn_space_state...` với **request body CHỈ chứa `settings`, `updated_at`** (không có key `spaces`/`current_space_id`).
4. Thêm 1 Task mới qua modal (nút "Lưu", đường `saveNow`) → xác nhận request lưu ngay lập tức cũng chỉ chứa `spaces`/`current_space_id`, không có `settings`.

**Lưu ý minh bạch:** phiên làm việc này không có công cụ trình duyệt (không có Playwright/DevTools tool khả dụng trong session) nên bước test Network tab ở trên **chưa được `dev` tự chạy kiểm chứng trực tiếp** — chỉ đã trace kỹ code (payload gửi lên `supabase-js` `.upsert()` ở từng hàm `flushSpaces`/`flushSettings` chỉ liệt kê đúng field mong muốn, không có field thừa) + `tsc`/`build` pass. Đề nghị chủ dự án tự chạy 4 bước test trên để xác nhận trước khi coi Bước 2 là "chốt" hoàn toàn.

---

### Bước 3 — ✅ Viết lại tầng `storage/` (`supabaseStore.ts`, `AppStateContext.tsx`)
Phụ thuộc: Bước 1 + Bước 2 (cần bảng mới + settings tách rời đã có trước khi đổi code đọc/ghi). Bảng đã có trên production từ Bước 1 nhưng code app CHƯA đụng tới cho đến bước này.

- [x] Đọc/ghi theo hàng riêng từng Space cá nhân + version-check, mirror cách `sharedSpaceStore.ts` đã làm (map `order` FE <-> `space_order` DB).
- [x] Quyết định KHÔNG gộp chung cơ chế Space cá nhân/Shared Space — đã chốt TRƯỚC lượt này (xem mục "Quyết định/câu hỏi mở" cuối file, ghi ngày 2026-07-09, chủ dự án đã xác nhận).
- [x] Không phá cơ chế debounce 600ms hiện có — Space cá nhân vẫn debounce 600ms/Space (tách theo Map, không đổi độ trễ), `settings` vẫn 600ms.
- [x] `npx tsc --noEmit` + `npm run build` pass, `npm run test` (115 test hiện có) pass — không có test nào cần sửa vì các test hiện tại không đụng trực tiếp `supabaseStore.ts`/`AppStateContext.tsx` (chạy qua reducer thuần).

**Việc đã làm — file mới:**
- `src/storage/privateSpaceStore.ts` (mới) — mirror `sharedSpaceStore.ts`:
  - `loadPrivateSpaces()` — đọc toàn bộ hàng `kn_private_spaces` của user, sort theo `space_order`, map → `Space[]` (gồm `habits`, khác Shared Space).
  - `getPrivateSpaceVersion(id)` — đọc version hiện tại, dùng khi resync sau conflict.
  - `createPrivateSpace(space)` — INSERT 1 hàng mới (Space chưa từng lưu), version luôn = 1 (trigger chỉ chạy khi UPDATE nên không cần round-trip đọc lại).
  - `savePrivateSpace(id, patch, expectedVersion)` — UPDATE có `WHERE version = expected`, 0 row = conflict, mirror `saveSharedSpace()` 1:1.
  - `upsertPrivateSpaces(spaces)` — upsert hàng loạt, dùng cho CẢ seed user mới (không có conflict thật) LẪN luồng Import JSON (id trùng hàng cũ → update tại chỗ thay vì vỡ do trùng khoá chính) — xem quyết định "1 hàm dùng chung 2 case" trong file.
  - `deletePrivateSpace(id)` — DELETE theo id (RLS `auth.uid() = user_id` tự chặn đụng hàng người khác).

**Việc đã làm — sửa file cũ:**
- `src/types.ts`: thêm field `Space._privateVersion?: number` — `undefined` = Space chưa từng lưu DB (tín hiệu để tầng storage biết cần INSERT thay vì UPDATE), số = version hiện có trên `kn_private_spaces`.
- `src/storage/normalize.ts`: `normalizeSpace()` giữ lại `_privateVersion` nếu có (trước đây field này không tồn tại nên không cần xử lý).
- `src/storage/types.ts`: bỏ hẳn `LoadResult`/`SpacesSnapshot` (không còn khái niệm "snapshot cả mảng spaces") — chỉ còn `SettingsSnapshot`.
- `src/storage/supabaseStore.ts`: viết lại gần như toàn bộ —
  - `loadAppState()` đổi return type thành `StateLoadResult { currentSpaceId, settings }` — KHÔNG còn đọc cột `spaces` của `kn_space_state` nữa. Trả `null` nếu chưa có hàng (user mới).
  - `seedAndPersist()` giờ ghi SONG SONG 2 đích độc lập: `flushInitialStateRow()` (current_space_id + settings, `kn_space_state`) và `upsertPrivateSpaces()` (N hàng Space demo, `kn_private_spaces`).
  - Bỏ hẳn `flushSpaces`/`spacesChannel`/`scheduleSpacesSave`/`saveSpacesSnapshotNow` — không còn khái niệm "lưu cả mảng spaces 1 lần".
  - Thêm `setPrivateFallbackActive()` — cho phép `AppStateContext.tsx` (nơi giờ tự quản debounce từng Space cá nhân) báo trạng thái lỗi lưu vào banner `storageFallbackActive` chung (OR với lỗi kênh `settings`).
- `src/state/appReducer.ts`: thêm action `SPACE_SET_PRIVATE_VERSION` (metadata thuần cho tầng lưu trữ, KHÔNG phải action người dùng) — `AppStateContext.tsx` tự dispatch sau khi `createPrivateSpace()`/`upsertPrivateSpaces()` trả kết quả, gắn `_privateVersion` vào đúng Space.
- `src/state/AppStateContext.tsx` — thay đổi lớn nhất:
  - Bootstrap: gọi `loadAppState()` (settings/currentSpaceId) rồi `loadPrivateSpaces()` RIÊNG (nếu user cũ) hoặc `seedAndPersist()` (nếu user mới), sau đó `loadSharedSpaces()` như cũ, gộp `allSpaces = [...privateSpaces, ...sharedSpaces]`.
  - Effect debounce Space cá nhân MỚI — mirror 1:1 cấu trúc effect debounce Shared Space đã có sẵn: `privateVersionsRef`/`privateSaveTimersRef`/`prevPrivateRef`/`pendingPrivateSavesRef` (Map theo `spaceId`, độc lập hoàn toàn — sửa Space A không đụng debounce Space B), cộng thêm `creatingPrivateRef` (Set chặn gọi `createPrivateSpace()` trùng lặp). Phân nhánh theo `_privateVersion === undefined` (cần INSERT) vs đã có (diff-baseline rồi debounce UPDATE 600ms).
  - `attemptSavePrivate()` — mirror `attemptSaveShared()`: conflict → đọc lại version mới nhất → retry (tối đa 3 lần), hết lượt thì log rõ + KHÔNG âm thầm mất thay đổi.
  - `smartDispatch` thêm 2 nhánh mới: `SPACE_DELETE` (private) → `deletePrivateSpace()` sau khi huỷ debounce/pending liên quan; `IMPORT_DATA` → xoá các Space cá nhân cũ không còn trong file import, `upsertPrivateSpaces()` toàn bộ Space mới (xử lý đúng cả trường hợp re-import file đã từng export, id trùng hàng cũ).
  - `saveNow()` — nhánh Space cá nhân đổi từ `saveSpacesSnapshotNow(mảng)` sang `savePrivateSpace(1 hàng)`/`createPrivateSpace()` tuỳ Space đã có `_privateVersion` hay chưa.
  - `visibilitychange` handler — flush thêm kênh Space cá nhân pending (giống cơ chế đã có cho Shared Space).

**Quyết định kỹ thuật quan trọng (ghi rõ theo yêu cầu):**
1. **Cột `spaces` trong `kn_space_state`: GIỮ NGUYÊN trên DB, ngừng đọc/ghi ở tầng code.** Không đổi tên bảng/cột ở bước này — Bước 4 (migration) vẫn cần đọc dữ liệu cũ từ đúng cột này của TỪNG user. Sẽ cân nhắc dọn/đổi tên ở bước dọn dẹp cuối cùng (sau khi Bước 4+5 xong và xác nhận không còn user nào cần đọc lại).
2. **Cột `current_space_id` trong `kn_space_state`: chỉ còn ghi ở lần tạo hàng đầu tiên (`seedAndPersist`, user mới), KHÔNG có luồng ghi lại riêng sau đó.** Lý do: cột này đã là "cột chết" từ TRƯỚC Bước 3 (comment cũ trong code đã ghi rõ — Space đang mở là trạng thái riêng từng máy, đọc/ghi qua `localCurrentSpace.ts`/localStorage, không đọc lại từ DB). Thêm 1 luồng ghi riêng cho 1 giá trị không ai đọc lại là thêm độ phức tạp không cần thiết — quyết định KHÔNG làm, khác một chút so với gợi ý ban đầu trong tài liệu chính ("kn_space_state giờ chỉ còn giữ current_space_id + settings"): vẫn giữ đúng 2 cột đó về mặt SCHEMA, nhưng chỉ 1 trong 2 (`settings`) có luồng ghi tích cực.
3. **Tín hiệu "Space cá nhân chưa từng lưu DB" = `_privateVersion === undefined`** (không dùng cờ boolean riêng, không đổi flow tạo Space ở `SpaceFormModal.tsx`/`reducers/spaces.ts`). Nhờ vậy `SPACE_CREATE` vẫn là action đồng bộ/thuần như cũ (reducer tự sinh `id` bằng `crypto.randomUUID()`, không cần đổi UI thành async-first như `SharedSpaceFormModal` đã làm cho Shared Space) — tầng `AppStateContext.tsx` tự phát hiện Space mới qua thiếu field này và bắn INSERT ngầm.
4. **Xử lý race "sửa Space ngay trong lúc INSERT đang bay"** (vd đổi tên Space ngay sau khi vừa tạo, trước khi `createPrivateSpace()` kịp trả về): baseline (`prevPrivateRef`) được set bằng ĐÚNG snapshot đã gửi lúc bắn INSERT (`snapshotAtCreate`), KHÔNG phải snapshot hiện tại tại thời điểm INSERT trả về. Nhờ vậy lượt diff kế tiếp (ngay sau khi `_privateVersion` được gắn qua `SPACE_SET_PRIVATE_VERSION`) tự phát hiện đúng phần chênh lệch (nếu có) và bắn UPDATE bù — không bị "nuốt" mất thay đổi xảy ra trong cửa sổ vài trăm ms đó.
5. **Race "tạo Space rồi xoá ngay lập tức trong lúc INSERT còn đang bay"**: CHẤP NHẬN rủi ro nhỏ, không xử lý triệt để. Nếu INSERT đã bắn đi trước khi lệnh xoá tới, `deletePrivateSpace()` không có hàng nào để xoá (Space chưa có `_privateVersion` để biết ID cần xoá đã tồn tại thật trên DB hay chưa) → INSERT vẫn hoàn tất sau đó, tạo ra 1 hàng "mồ côi" (không còn Space nào trong state trỏ tới, nhưng KHÔNG lộ ra ngoài UI vì `loadPrivateSpaces()` chỉ được gọi lúc mở app — hàng mồ côi này vẫn sẽ xuất hiện lại nếu user F5!). Đây là hạn chế đã biết, cửa sổ rủi ro rất hẹp (vài trăm ms, thao tác hiếm: tạo rồi xoá ngay). Chưa xử lý dọn hàng mồ côi ở đợt này — ghi nhận làm follow-up nếu phát hiện xảy ra thật.
6. **Import JSON dùng `upsertPrivateSpaces()` (upsert) thay vì insert thuần** — vì file export giữ nguyên `id` gốc của Space, re-import dữ liệu đã từng export trước đó (backup/restore — use case thực tế, không phải edge case hiếm) rất có thể trùng `id` với hàng đang có sẵn trên `kn_private_spaces`. Insert thuần sẽ vỡ do trùng khoá chính; upsert xử lý đúng cả 2 nhánh (id mới → insert, id trùng → update tại chỗ) mà không cần phân biệt trước.
7. **`⚠️` Chưa xử lý (documented, không phải bug che giấu):** kịch bản "hàng `kn_space_state` đã tồn tại (user cũ) NHƯNG `kn_private_spaces` rỗng" (đúng tình trạng User A hiện tại, TRƯỚC khi Bước 4 chạy) sẽ khiến `state.spaces` rỗng sau hydrate → `useCurrentSpace()` crash (xem cảnh báo đầu file). Đây là hệ quả CHỦ Ý của việc tách 2 nguồn dữ liệu — không tự ý "vá tạm" bằng cách seed lại demo data cho trường hợp này, vì làm vậy có nguy cơ tạo dữ liệu trùng/mồ côi khi Bước 4 migration chạy sau đó (dữ liệu thật của User A sẽ được insert THÊM vào, cạnh dữ liệu demo vừa tự sinh). Chờ Bước 4 giải quyết đúng gốc.

**Cách test:**
1. `npx tsc --noEmit` && `npm run build` && `npm run test` — cả 3 đều PASS (đã tự chạy, xem log trong báo cáo gửi user).
2. **BẮT BUỘC dùng tài khoản Google phụ (User B)** — chưa từng có Space nào ở `kn_space_state.spaces` (cũ) lẫn `kn_private_spaces` (mới). Đăng nhập lần đầu → xác nhận: app tự tạo Space "Cá nhân" mặc định, vào Supabase Dashboard > Table Editor > `kn_private_spaces` xác nhận có đúng 1 hàng mới với `user_id` = User B, `version = 1`.
3. Tạo thêm 1 Space mới (nút "+" cạnh "Space của tôi") → đổi tên → xác nhận Dashboard có thêm 1 hàng, `version` tăng dần đúng sau mỗi lần sửa (đổi tên/thêm task/toggle khối hiển thị).
4. Mở DevTools > Network, lọc `kn_private_spaces` — sửa 1 Task ở Space A, xác nhận CHỈ có 1 request PATCH nhắm đúng `id` Space A (không có request nào chạm Space B) — xác nhận đúng yêu cầu "sửa Space A không kích hoạt lưu Space B".
5. Mở 2 tab cùng User B, sửa Space cùng lúc ở 2 tab (không reload giữa chừng) → xác nhận cả 2 thay đổi đều lưu được (không cái nào bị mất) nhờ retry sau conflict — hoặc giả lập conflict bằng cách tự UPDATE tay 1 cột (đổi `name`) qua SQL Editor NGAY SAU KHI đã sửa ở tab 1 nhưng TRƯỚC khi debounce 600ms kịp chạy, xác nhận tab 1 vẫn lưu được (retry tự đọc version mới rồi gửi lại).
6. Xoá 1 Space (không phải Space cuối) → xác nhận hàng biến mất khỏi `kn_private_spaces` trên Dashboard.
7. Export JSON (Settings > Export) rồi Import lại chính file đó → xác nhận Space cá nhân giữ nguyên nội dung, KHÔNG bị lỗi trùng khoá chính (kiểm tra Console không có lỗi `duplicate key value violates unique constraint`).
8. **KHÔNG đăng nhập bằng tài khoản chính chủ (User A)** cho tới khi Bước 4 xong — xem cảnh báo đầu file.

---

### Bước 4 — ✅ Migration data (đã test xong trên User B, chưa chạy cho User A)
Phụ thuộc: Bước 3 (code đọc/ghi mới phải chạy đúng trước khi migrate data thật).

- [x] Script chuyển dữ liệu từ `kn_space_state.spaces[]` (mảng cũ) sang các hàng `kn_private_spaces` mới.
- [x] **Đã chạy thử cho User B (2026-07-10, QC `ba` qua Playwright):** seed 2 Space giả lập vào cột `spaces` cũ (qua REST API trực tiếp, dùng session token của User B) — 1 Space có Task+Note, 1 Space có Habit+Log, để phủ đủ mọi loại dữ liệu con.
  - `preview()` → đúng `toMigrate: [2 space]`, `toSkip: []` (không đụng "QC test space" đã tạo qua bảng mới ở Bước 3).
  - `run()` lần 1 → `migratedCount: 2, skippedCount: 0`, đúng tên.
  - `run()` lần 2 (test idempotent) → `migratedCount: 0, skippedCount: 2` — xác nhận an toàn gọi lại nhiều lần.
  - Reload UI + kiểm tra network payload `kn_private_spaces` trực tiếp: **toàn bộ dữ liệu con (Task/Note/Habit/Log) khớp 100%** với dữ liệu đã seed, không thiếu/sai field nào. Space-switcher hiện đúng cả 3 Space (1 tạo tay + 2 vừa migrate) với đúng số liệu (task/note count).
- [x] Verify đầy đủ: không mất Space nào, không mất Task/Note/Habit/Log nào (Reminder chưa test riêng nhưng cùng cơ chế `normalizeSpace`, rủi ro tương đương thấp).

**Việc đã làm — file mới:**
- `src/storage/migrateLegacySpaces.ts` (mới) — 4 hàm:
  - `readLegacySpacesColumn(): Promise<Space[]>` (nội bộ, không export) — đọc RIÊNG cột `spaces` (jsonb cũ) của `kn_space_state` cho user hiện tại (`SELECT spaces FROM kn_space_state WHERE user_id = auth.uid()`), KHÔNG đụng `loadAppState()` (đã ngừng đọc cột này từ Bước 3, xem comment trong `supabaseStore.ts`). Map từng phần tử qua `normalizeSpace()` (tái dùng, giống cách IMPORT_DATA xử lý file export JSON) để vá field thiếu/hỏng.
  - `listExistingPrivateSpaceIds(): Promise<Set<string>>` (nội bộ) — `SELECT id FROM kn_private_spaces WHERE user_id = auth.uid()`, dùng để biết Space nào trong `spaces[]` cũ đã có hàng tương ứng.
  - `previewLegacySpacesMigration(): Promise<{ toMigrate: {id,name}[], toSkip: {id,name}[] }>` — **DRY-RUN, THUẦN ĐỌC**, không ghi gì. Trả về 2 danh sách: Space sẽ migrate (id chưa có ở `kn_private_spaces`) và Space bỏ qua (id đã tồn tại).
  - `runLegacySpacesMigration(): Promise<{ migratedCount, skippedCount, migratedNames: string[], error?: string }>` — THỰC THI: tự đọc lại `listExistingPrivateSpaceIds()` tại thời điểm gọi (không tái dùng kết quả preview cũ, tránh race), lọc đúng tập Space cần insert, gọi `upsertPrivateSpaces()` (đã có từ Bước 3) để ghi — an toàn dùng upsert ở đây vì tập đã lọc chỉ còn id chưa tồn tại (upsert = insert thuần cho tập này, không có gì bị đè). Idempotent: gọi lại nhiều lần không ghi đè dữ liệu đã migrate.
- `src/main.tsx` — expose 2 hàm trên qua `window.knMigrateLegacySpaces = { preview, run }` (khai báo type qua `declare global { interface Window {...} }`, không dùng `as any`). KHÔNG tự chạy khi load app — chỉ là đăng ký để gọi tay qua DevTools Console/Playwright `browser_evaluate`. An toàn theo user đang đăng nhập (RLS `auth.uid() = user_id` chặn ở DB, không cần service-role key).

**Cách trigger (để `ba` tự test qua Playwright `browser_evaluate`, sau khi đã đăng nhập User B trong trình duyệt):**
```js
// 1. Dry-run trước — xem trước sẽ migrate Space nào, KHÔNG ghi gì:
const preview = await window.knMigrateLegacySpaces.preview();
console.log(preview); // { toMigrate: [{id,name}...], toSkip: [{id,name}...] }

// 2. Sau khi xác nhận preview đúng — chạy thật:
const result = await window.knMigrateLegacySpaces.run();
console.log(result); // { migratedCount, skippedCount, migratedNames: string[], error? }

// 3. Gọi lại run() lần 2 để xác nhận idempotent — migratedCount phải = 0, skippedCount = tổng số
// Space cũ (vì tất cả giờ đã tồn tại ở kn_private_spaces).
```

**Cách test:** sau khi chạy migrate cho User B, so sánh đếm số lượng Space/Task/Note/Habit/Reminder/Log trước và sau (đối chiếu qua UI hoặc query trực tiếp `kn_private_spaces`) — phải khớp 100% với dữ liệu đã seed vào cột `spaces` cũ. Gọi lại `run()` lần 2, xác nhận `migratedCount: 0` (không tạo trùng/không ghi đè). Xác nhận User A hoàn toàn không bị đụng tới (query `kn_space_state` của User A vẫn y nguyên — hàm chỉ đọc/ghi theo `auth.uid()` của phiên đang đăng nhập).

**Giới hạn đã biết (không phải bug, ghi nhận để minh bạch):** `order` của Space vừa migrate lấy nguyên từ dữ liệu cũ, có thể trùng `order` với Space đã có sẵn ở `kn_private_spaces` (vd cả 2 đều `order: 0`) — chỉ ảnh hưởng thứ tự hiển thị (cosmetic), user tự kéo sắp lại nếu cần, không phải lỗi mất dữ liệu.

---

### Bước 5 — ✅ Áp dụng migration cho dữ liệu thật (User A)
Phụ thuộc: Bước 4 đã chạy sạch cho User B và được chủ dự án xác nhận.

- [x] Chủ dự án tự Export JSON toàn bộ Space trước khi chạy (lưới an toàn thủ công, vì không có DB backup thật).
- [x] Xác nhận rõ ràng từ chủ dự án trước khi chạy migration trên dữ liệu thật.
- [x] **Đã chạy thật (2026-07-10)** — chủ dự án tự chạy trong Console (đăng nhập đúng tài khoản chính, `npm run dev` local vì code chưa deploy production):
  - `preview()` → `toMigrate: [MAFC, Cá nhân, KN-Space]` (3 Space), `toSkip: []` — đúng dự kiến vì `kn_private_spaces` trước đó rỗng cho tài khoản này.
  - `run()` → `{ migratedCount: 3, skippedCount: 0, migratedNames: ["MAFC", "Cá nhân", "KN-Space"] }`.
  - Chủ dự án tự F5 + đối chiếu tay với file Export JSON đã lưu trước đó: đủ 3 Space, khớp Task/Note/Habit/Reminder/Log, layout đúng như cũ — xác nhận **"xong"**, không phát sinh vấn đề.

**Lưu ý gặp phải lúc chạy:** lần gọi `preview()` đầu tiên báo lỗi `Cannot read properties of undefined` vì chủ dự án đang mở domain production thật (chưa deploy code migration, toàn bộ Phần B vẫn nằm ở local, chưa commit/push) — đã hướng dẫn chuyển sang chạy `npm run dev` ở `localhost` (cùng project Supabase, RLS tự lọc đúng theo tài khoản đang đăng nhập) và chạy lại thành công.

---

## Quyết định/câu hỏi mở (ghi lại khi phát sinh, kèm ngày)

- **2026-07-09 — KHÔNG gộp chung cơ chế lưu Space cá nhân và Shared Space vào 1 bảng/luồng.** Giữ `kn_private_spaces`/`kn_shared_spaces` là 2 bảng riêng biệt, RLS riêng biệt (owner-only vs membership-based). Chỉ dùng chung logic version-check/retry ở TẦNG CODE (hàm helper dùng lại được cho cả `supabaseStore.ts` và `sharedSpaceStore.ts`) nếu tự nhiên hợp lý khi viết, không ép gộp. Lý do: gộp schema/RLS 2 mô hình quyền khác nhau (owner-only vs membership) tăng rủi ro sai phân quyền — phản tác dụng ngay lúc đang cố làm DB an toàn hơn; lợi ích gộp không tương xứng chi phí/rủi ro tăng thêm lúc này. Chủ dự án đã xác nhận hướng này trước khi bắt đầu Bước 3.

- **2026-07-09 — đổi tên field `order` (FE) thành cột `space_order` (DB) ở bảng `kn_private_spaces`.** Lý do: `order` là từ khoá dành riêng của SQL (`ORDER BY`), giữ tên cột trùng dễ gây lỗi/nhầm lẫn khi viết SQL tay ở các bước sau (migration script bước 4, debug SQL Editor) dù PostgREST tự quote được khi gọi qua `supabase-js`. Tầng `storage/` (bước 3) sẽ đảm nhiệm việc map `order` <-> `space_order`, giống cách `sharedSpaceStore.ts` đã map `enabledBlocks` <-> `enabled_blocks`. Chưa cần chủ dự án xác nhận riêng (là quyết định đặt tên cột thuần kỹ thuật, không đổi hành vi ứng dụng) — nêu ở đây để minh bạch, sẽ điều chỉnh nếu chủ dự án thấy tên khác hợp lý hơn.
