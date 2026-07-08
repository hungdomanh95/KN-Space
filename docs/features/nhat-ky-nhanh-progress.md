# Nhật ký nhanh + Gộp Hôm nay/Widget điều hướng — Tiến độ triển khai

> Theo dõi tiến độ code thật cho `docs/features/nhat-ky-nhanh.md` (Nhật ký nhanh) và
> `docs/requirements.md` mục 4/4.1 (gộp khối "Hôm nay" + Widget điều hướng). 2 tính năng được
> chốt làm cùng đợt ("làm đi, làm toàn bộ") nhưng triển khai cuốn chiếu — 1 phần/lượt, cập nhật
> trạng thái ngay khi xong, dừng lại chờ xác nhận trước khi sang phần kế tiếp.

Quy ước trạng thái: `⬜ Chưa làm` / `🔶 Đang làm` / `✅ Xong` / `⛔ Bị chặn (ghi rõ lý do)`.

## Tổng quan các phần & phụ thuộc

```
Phần 1 (Schema + types)  ──┬──> Phần 2 (Storage CRUD)  ──> Phần 3 (MobileChatScreen capture)
                            │                                        │
                            └──> Phần 4 (Khối Nhật ký nhanh UI) <────┘
                                        │
                                        ▼
                            Phần 5 (Gộp Today+Settings) — ĐỘC LẬP với 1-4,
                            chỉ dùng chung `LayoutBlockKey`/`types.ts` đã sửa ở Phần 1.
```

Phần 5 (gộp Today+Settings) không phụ thuộc dữ liệu của Phần 2-4 (Nhật ký nhanh) — có thể làm
trước/sau/xen kẽ, chỉ cần làm sau Phần 1 vì cả 2 tính năng cùng đụng `LayoutBlockKey`.

---

## Phần 1 — Schema Supabase + `types.ts` (data model, KHÔNG động UI)

Trạng thái: ✅ Xong (2026-07-07)

- [x] `types.ts`: thêm `LogEntry` (interface mới — `id`/`content`/`createdBy?`/`createdAt`, bất
      biến, không `updatedAt`/`order`).
- [x] `types.ts`: `EnabledBlocks` thêm field `logs: boolean`.
- [x] `types.ts`: `CollapsedBlocks` thêm field `logs: boolean`.
- [x] `types.ts`: `Space` thêm field `logs: LogEntry[]`.
- [x] `types.ts`: `LayoutBlockKey` thêm `'logs'`.
- [x] `seed.ts`: `defaultSettings().collapsedBlocks` thêm `logs: false`; `createSeedSpaces()`
      thêm `enabledBlocks.logs: true` + `logs: []`.
- [x] `state/reducers/spaces.ts`: `defaultEnabledBlocks()` thêm `logs: true`; `emptySpace()`
      thêm `logs: []` (dùng khi tạo Space cá nhân mới qua modal).
- [x] `storage/normalize.ts`: thêm hàm `normalizeLogEntries()` (export, tái dùng ở Phần khác) +
      `normalizeSpace()` fallback `enabledBlocks.logs ?? true` và `logs: normalizeLogEntries(...)`.
- [x] `state/appReducer.ts` (`normalizeImportedSpace`, dùng khi Import JSON): thêm fallback
      `enabledBlocks.logs ?? true` và `logs: normalizeLogEntries(raw.logs)` — Export/Import JSON
      tự động đi theo `logs[]` vì nằm trong `Space`, không cần đổi `schemaVersion`.
- [x] `storage/sharedSpaceStore.ts` (`rowToSpace()`): thêm `enabledBlocks.logs: true` (Nhật ký
      nhanh hiển thị bình thường trong Shared Space, không ẩn như Habit) và tạm `logs: []` (chưa
      query cột DB — xem "Quyết định phát sinh" bên dưới, việc query/save thật thuộc Phần 2).
- [x] Cập nhật 5 file test (`__tests__/appReducer.test.ts`, `__tests__/normalize.test.ts`,
      `__tests__/reducers.test.ts`, `state/sharedTaskNotifyEffects.test.ts`,
      `state/reducers/tasks.test.ts`) — thêm `logs: true`/`logs: []` vào các `Space`/`EnabledBlocks`
      literal dùng làm fixture, để khớp type mới (không đổi hành vi test).
- [x] **Schema Supabase:** tạo `docs/features/nhat-ky-nhanh-schema.sql` (ALTER TABLE thêm cột
      `logs jsonb` vào `kn_shared_spaces`) + ghi chú dẫn chiếu trong `supabase/schema.sql`. Xem
      "Phát hiện quan trọng" bên dưới — **Space cá nhân (`kn_space_state`) không cần đổi gì**.

### Phát hiện quan trọng (root cause, cần lưu ý cho Phần 2)

`docs/features/nhat-ky-nhanh.md` mục 9 viết: *"Không tạo bảng Supabase mới — `logs[]` nằm trong
cùng cột `spaces` (jsonb) của `kn_space_state` ... hoặc `kn_shared_spaces`"*. Đã đọc lại schema
thật (`docs/features/shared-space-schema.sql`) trước khi code và phát hiện giả định này **sai
một phần** cho Shared Space:

- `kn_space_state` (Space cá nhân): đúng như mô tả — 1 cột `spaces jsonb` chứa NGUYÊN mảng
  `Space[]`, schema-less, không cần đổi gì ở DB.
- `kn_shared_spaces` (Shared Space): **KHÔNG** có cột `spaces` gộp chung — mỗi mảng
  (`tasks`/`notes`/`reminders`) là **1 cột jsonb riêng**. Muốn Shared Space hỗ trợ `logs[]`,
  bắt buộc phải **thêm 1 cột mới** `logs jsonb` vào bảng này (không phải tạo bảng mới, nhưng vẫn
  là 1 thay đổi DDL thật, cần chạy tay trên Supabase Dashboard).

Đã xử lý: viết `docs/features/nhat-ky-nhanh-schema.sql` (ALTER TABLE, xem file để chạy) thay vì
sửa trực tiếp `shared-space-schema.sql` (giữ nguyên lịch sử, đúng convention đã có của dự án —
xem các file `shared-space-*-fix.sql` khác cũng là migration bổ sung tách riêng).

**Việc CHƯA làm ở Phần 1 (thuộc Phần 2):** `sharedSpaceStore.ts` chưa `SELECT`/`UPDATE` cột
`logs` mới này qua Supabase JS client — `rowToSpace()` tạm cứng `logs: []` cho mọi Shared Space
để tsc/build pass. Phần 2 cần: (a) chạy `nhat-ky-nhanh-schema.sql` trên Supabase Dashboard trước,
(b) thêm `logs` vào câu `select` trong `loadSharedSpaces()`/`createSharedSpace()`, (c) đọc
`row.logs` thật trong `rowToSpace()`, (d) mở rộng `saveSharedSpace()` (hiện
`Partial<Pick<Space, 'tasks'|'notes'|'reminders'|'name'>>`) để nhận thêm `logs`.

### Quyết định phát sinh khi code (2026-07-07)

1. **Chưa xoá `'today'` khỏi `LayoutBlockKey`/`EnabledBlocks` ở Phần 1, dù `docs/requirements.md`
   mục 4.1 (change impact #3/#7) mô tả việc gộp Hôm nay+Widget điều hướng đổi `LayoutBlockKey`
   theo hướng "bỏ `today`, thêm `logs`" cùng lúc.** Lý do: nếu xoá `'today'` ngay bây giờ,
   `AppLayout.tsx` (`case 'today':`, `ENABLED_BLOCKS_KEY.today`), `seed.ts`
   (`defaultDashboardLayout()` còn slot `id:'today'`) và logic migrate layout cũ trong
   `normalize.ts` (`normalizeDashboardLayout`, tự chèn `id:'today'` nếu thiếu) đều cần sửa ĐỒNG
   THỜI để không vỡ build/hành vi UI hiện tại — đó chính xác là khối lượng công việc của **Phần
   5** (gộp Today+Settings), không phải Phần 1 (Nhật ký nhanh, schema/types thuần). Tách 2 việc
   ra cho phép mỗi phần build/test độc lập đúng tinh thần cuốn chiếu, tránh Phần 1 "nợ" 1 nửa
   việc UI của Phần 5. `logs` được thêm vào SONG SONG với `'today'` (chưa xoá) — không xung đột
   vì union type cho phép nhiều literal cùng tồn tại, `'today'` sẽ bị xoá đúng lúc làm Phần 5.
2. **Chưa thêm `logs` vào `defaultDashboardLayout()` (`seed.ts`) hay logic tự-chèn-khối-thiếu
   trong `normalizeDashboardLayout()`.** Lý do: khối UI thật cho `logs` (case `'logs'` trong
   `renderBlock()` của `AppLayout.tsx`) chưa tồn tại (thuộc Phần 4) — nếu chèn `id:'logs'` vào
   layout mặc định/tự-vá bây giờ, Dashboard sẽ có 1 khoảng trống rỗng vô nghĩa ở vị trí đó cho
   tới khi Phần 4 xong. Sẽ làm việc này cùng lúc với Phần 4 (đúng theo pattern đã có của `'today'`
   khi nó được thêm vào trước đây — xem comment trong `normalizeDashboardLayout()`).
3. **Không đụng `SpaceFormModal.tsx` (`BLOCK_DEFS`, danh sách checkbox bật/tắt khối theo Space).**
   `EnabledBlocks.logs` đã có trong type nhưng chưa có checkbox nào cho user bật/tắt qua UI —
   modal hiện chỉ liệt kê `keyof EnabledBlocks` mà `dev` tự chọn đưa vào mảng, không phải toàn bộ
   field của type, nên không có lỗi biên dịch. Sẽ thêm checkbox "Nhật ký nhanh" vào modal này ở
   Phần 4 (lúc đó bật/tắt mới có ý nghĩa quan sát được).

### Cách test Phần 1 (cho user)

Phần 1 thuần data model — chưa có gì hiển thị mới trên UI để "thấy" trực tiếp. Cách xác nhận đã
đúng:

1. Chạy `npx tsc --noEmit` → **không có lỗi nào** (đã chạy, pass sạch — xác nhận không phá vỡ
   type ở bất kỳ nơi nào khác trong codebase đang tham chiếu `LayoutBlockKey`/`EnabledBlocks`/
   `CollapsedBlocks`/`Space` cũ).
2. Chạy `npm run build` → build thành công (đã chạy, pass, chỉ có cảnh báo chunk-size cũ, không
   liên quan thay đổi này).
3. Chạy `npx vitest run` → **64/64 test pass** (8 file test, không có test nào vỡ do fixture
   `Space`/`EnabledBlocks` thiếu field `logs`).
4. Kiểm tra thủ công không có hồi quy hành vi hiện tại: mở app như bình thường (`npm run dev`),
   đăng nhập, xác nhận Dashboard hiển thị đúng y hệt trước khi sửa (6 khối cũ + khối "Hôm nay" +
   Widget điều hướng như cũ) — vì Phần 1 chỉ thêm field mới có giá trị mặc định an toàn
   (`logs: []`, `enabledBlocks.logs: true`), không có nơi nào đọc/hiển thị field này ở bước này
   nên không có gì thay đổi quan sát được trên UI, đúng như kỳ vọng.
5. (Tuỳ chọn, cho Shared Space) Nếu muốn chuẩn bị trước cho Phần 2: chạy nội dung
   `docs/features/nhat-ky-nhanh-schema.sql` trong Supabase Dashboard → SQL Editor → xác nhận
   bảng `kn_shared_spaces` có thêm cột `logs` (kiểu jsonb, default `[]`) trong Table Editor. Chưa
   bắt buộc phải chạy ngay ở Phần 1 (Shared Space vẫn hoạt động bình thường nếu chưa chạy, chỉ là
   cột chưa tồn tại — Phần 2 mới thực sự cần nó).

---

## Phần 2 — Storage functions (CRUD log, load-on-open, không Realtime)

Trạng thái: ✅ Xong (2026-07-07)

- [x] Chạy `docs/features/nhat-ky-nhanh-schema.sql` trên Supabase Dashboard thật — **user đã tự
      chạy, xác nhận cột `logs jsonb` tồn tại trên `kn_shared_spaces`** (xác nhận đầu phiên này).
- [x] Action/reducer mới cho `logs`: `src/state/reducers/logs.ts` — `LOG_CREATE` (validate
      `content.trim()` không rỗng ngay ở tầng reducer, không chỉ ở UI), `LOG_DELETE` (idempotent —
      xoá id không tồn tại là no-op, đúng mục 8 Edge Cases), `LOG_DELETE_MANY` (bulk-delete, nhận
      `ids: string[]`, no-op nếu mảng rỗng). Gọn hơn `notesReducer` đúng như dự kiến — không có
      action update/reorder vì `LogEntry` bất biến, không `order`.
- [x] `src/state/appReducer.ts`: wire `LogAction` vào `AppAction` union, `SPACE_DOMAIN_ACTION_TYPES`
      (thêm 3 action type), `applySpaceDomainAction()` (case mới gọi `logsReducer`).
      `normalizeImportedSpace` đã xử lý `logs` từ Phần 1, không cần sửa thêm.
- [x] `storage/supabaseStore.ts`: **không cần sửa gì** — xác nhận lại nhận định ở Phần 1: bảng
      `kn_space_state` lưu nguyên mảng `Space[]` vào 1 cột `spaces` (jsonb) qua `flushSave()`,
      `logs` đã tự động đi theo vì đã có sẵn trong `Space` type kể từ Phần 1.
- [x] `storage/sharedSpaceStore.ts`: thêm `logs` vào `select` của `loadSharedSpaces()` (cả
      nested `kn_shared_spaces (...)`) và `createSharedSpace()` (fetch sau khi tạo); `rowToSpace()`
      đọc thật `row.logs` (trước đó Phần 1 tạm cứng `logs: []`); mở rộng type patch của
      `saveSharedSpace()` thành `Partial<Pick<Space, 'tasks'|'notes'|'reminders'|'logs'|'name'>>` +
      thêm nhánh `if (patch.logs !== undefined) updatePayload.logs = patch.logs;`.
- [x] `state/AppStateContext.tsx`: **phát hiện quan trọng khi code** — hiệu ứng debounce-save của
      Shared Space (theo dõi `state.spaces`, so snapshot, gọi `saveSharedSpace()`) trước đó CHỈ
      theo dõi/patch `{tasks, notes, reminders, name}`, KHÔNG có `logs`. Nếu không sửa, tạo/xoá
      log trên Shared Space sẽ **không bao giờ được lưu lên DB** dù reducer chạy đúng ở local
      state — đây là lỗi thật sẽ xảy ra bất kể Phần 3 (UI) triển khai theo cách nào, vì UI nào
      cũng đi qua chung 1 effect debounce này. Đã sửa: `pendingSharedSavesRef` (type + 2 chỗ
      `.set()`), biến `snapshot` (JSON.stringify để so sánh đổi), và `data` trong `saveNow()` — cả
      4 chỗ đều thêm `logs: space.logs`/`targetSpace.logs`. Đã kiểm tra không còn nơi nào khác gọi
      `saveSharedSpace()`/đọc `pendingSharedSavesRef` ngoài file này (`grep` xác nhận).
- [x] Bulk-delete: `LOG_DELETE_MANY` — 1 action xoá nhiều id cùng lúc bằng `Set` lookup, không
      cần N lần dispatch riêng lẻ (tránh N lần re-render + N lần trigger effect debounce-save).
- [x] Test mới: `src/__tests__/reducers.test.ts` thêm `describe('logsReducer', ...)` — 8 test case
      (tạo, trim, content rỗng no-op, có/không `createdBy`, xoá đơn, xoá id không tồn tại
      idempotent, bulk-delete nhiều id, bulk-delete mảng rỗng no-op).

### Đánh giá debounce-save cho `logs` (yêu cầu bắt buộc trước khi tái dùng cơ chế cũ)

**Câu hỏi:** log là dữ liệu tần suất ghi cao (gõ liên tục qua mobile chat khi di chuyển) — có
nên giữ nguyên debounce 600ms (Space cá nhân)/800ms (Shared Space) + `dispatch` thường (không
đợi xác nhận server) như Task/Note, hay cần cơ chế khác?

**Kết luận: giữ nguyên, không cần cơ chế mới ở Phần 2 — nhưng có 1 điểm cần lưu ý rõ cho Phần 3.**
Lý do:

1. **Đây KHÔNG phải lần đầu pattern này được áp dụng cho capture tần suất cao qua
   `MobileChatScreen`.** Task/Note tạo qua chat hiện tại (`handleSubmit()` trong
   `MobileChatScreen.tsx`) ĐÃ dùng `dispatch()` thường (debounce nền), KHÔNG dùng `saveNow()`
   (vốn có sẵn, đợi xác nhận server thật — dùng cho nút "Lưu" trong modal Thêm/Sửa). Đây là quyết
   định UX đã có từ trước (gõ xong Enter là thấy bubble ngay, không có độ trễ chờ network) —
   không phải điều Phần 2 này mới đặt ra. Vì Log dùng lại đúng con đường dispatch/reducer/effect
   với Task/Note (cùng 1 effect debounce, không tách riêng), rủi ro về nguyên tắc **không cao
   hơn** rủi ro đã tồn tại sẵn cho Task/Note.
2. **Cơ chế coalescing của debounce không gây mất dữ liệu khi gõ nhiều dòng liên tiếp nhanh.**
   Mỗi lần `LOG_CREATE` dispatch đều cập nhật `state.spaces` đầy đủ (đã gồm mọi log vừa tạo trước
   đó), effect debounce mỗi lần chạy lại ghi đè `pendingSnapshot`/`pendingSharedSavesRef` bằng
   **snapshot MỚI NHẤT** (đủ toàn bộ log đã gõ tới thời điểm đó), đồng thời reset timer. Vì vậy
   gõ 5 dòng log liên tiếp trong 2 giây chỉ trì hoãn lần ghi Supabase (dồn thành 1 lần ghi chứa
   đủ cả 5 dòng), không có dòng nào bị "ghi đè mất" bởi dòng sau — khác hẳn 1 bug LWW thật đã có
   trước đây ở Shared Space (nêu ở mục 6.2 tài liệu tính năng) vốn xảy ra ở **cấp item nội bộ**
   (gộp nhiều dòng vào 1 record), không phải ở cấp debounce/snapshot này.
3. **Cửa sổ rủi ro thật chỉ còn lại: app bị kill hẳn (OS/force-quit) trong đúng khoảng
   600-800ms cuối, KHÔNG kịp qua sự kiện `visibilitychange`.** App đã có sẵn `forceFlush()` (Space
   cá nhân) + flush toàn bộ `pendingSharedSavesRef` (Shared Space) gắn vào listener
   `visibilitychange === 'hidden'` (`AppStateContext.tsx`) — sự kiện này bắn ra ngay khi user
   chuyển app/tắt màn hình trên mobile (kịch bản thực tế phổ biến nhất: "gõ xong rồi tắt màn
   hình/chuyển app khác"), **trước khi** OS thực sự đình chỉ tiến trình. Nhờ đã gộp `logs` vào
   đúng object `pendingSharedSavesRef`/`pendingSnapshot` hiện có (không tạo luồng lưu riêng), Log
   **tự động hưởng lợi** từ safety-net này y hệt Task/Note — không cần code thêm gì ở Phần 2.
   Rủi ro còn sót lại (force-kill không qua `visibilitychange`, vd crash cứng/vuốt-tắt-app quá
   nhanh trước khi OS bắn sự kiện) là rủi ro **đã tồn tại y hệt cho Task/Note từ trước**, không
   phải rủi ro mới do Log gây ra — không nằm trong phạm vi Phần 2 (data layer) để giải quyết.
4. **Khuyến nghị (không chặn code hiện tại, để ngỏ cho quyết định sau nếu chủ dự án thấy cần):**
   nếu sau này có nhu cầu nâng cấp lên "đợi xác nhận server trước khi coi là gửi xong" cho capture
   qua mobile chat (đổi từ `dispatch` sang `saveNow` kèm loading/error state trên bubble), nên làm
   **đồng loạt cho cả Task/Note/Log cùng lúc** (nhất quán UX — không hợp lý nếu chỉ Log có
   loading spinner còn Task/Note thì không), và nên là 1 hạng mục riêng ngoài phạm vi "Nhật ký
   nhanh", vì nó đổi hành vi UX đã có từ trước của Task/Note chứ không phải chỉ thêm tính năng
   mới. **Không đề xuất làm việc này trong Phần 3 sắp tới** trừ khi chủ dự án yêu cầu rõ.

### Cách test Phần 2 (cho user)

Phần 2 vẫn thuần data layer — chưa có UI để tạo log qua thao tác tay. Cách xác nhận:

1. `npx tsc --noEmit` → pass sạch (đã chạy).
2. `npm run build` → build thành công (đã chạy, chỉ cảnh báo chunk-size cũ, không liên quan).
3. `npx vitest run` → **72/72 test pass** (tăng từ 64 → 72, do thêm 8 test `logsReducer` trong
   `src/__tests__/reducers.test.ts`).
4. Kiểm tra thủ công qua DevTools Console (xác nhận reducer hoạt động đúng mà chưa cần chờ UI
   Phần 3/4) — mở app (`npm run dev`), đăng nhập, mở Console, dán:
   ```js
   // Cần app đã export __KN_DEBUG__ hoặc gọi qua React DevTools — nếu chưa có hook debug sẵn,
   // cách đơn giản hơn: đợi Phần 3/4 có UI thật rồi test trực quan trên màn hình sẽ dễ hơn nhiều.
   ```
   Thực tế nên **gộp test tay với Phần 3/4** vì chưa có UI để trigger action — bước 1-3 (tsc/
   build/vitest) là đủ để xác nhận Phần 2 đúng ở mức data layer. Nếu muốn test riêng luồng
   Supabase (không qua UI) trước khi có Phần 3/4: có thể tạo tạm 1 nút debug ẩn hoặc dùng
   Supabase Dashboard → Table Editor → sửa tay cột `logs` của 1 hàng `kn_shared_spaces`/
   `kn_space_state` → reload app → xác nhận không crash (đi qua đúng `normalizeLogEntries`) —
   không bắt buộc, chỉ để yên tâm thêm trước khi sang Phần 3.
5. (Khuyến khích, không bắt buộc) Đọc lại mục "Đánh giá debounce-save cho `logs`" ở trên — nếu
   không đồng ý với kết luận "giữ nguyên cơ chế cũ", nêu ngay trước khi sang Phần 3 (đổi cơ chế
   sau khi đã có UI thật sẽ tốn công hơn).

## Phần 3 — `MobileChatScreen.tsx` (cơ chế nhập liệu + bubble Log + sort theo `createdAt`)

Trạng thái: ✅ Xong (2026-07-07, đã cập nhật lại cơ chế nhập liệu cùng ngày theo yêu cầu đổi
hướng trực tiếp từ chủ dự án — xem mục "Thay đổi yêu cầu 2026-07-07" bên dưới)

- [x] Bubble Log style riêng biệt: `rounded-2xl border border-dashed border-[color:var(--border)]
      bg-[var(--raised)]`, icon `ScrollText` (`--text-dim`) — dùng CHUNG 1 style cho cả bubble của
      mình lẫn người khác (khác Task/Note tô đặc theo accent/note-color/member màu), đúng mục
      5.2.1. Hàng tên người gửi + avatar + chip giờ gửi giữ nguyên cơ chế cũ (không đổi).
- [x] Đổi tiêu chí sort hợp nhất từ `order` (Task/Note có, `LogEntry` không có) sang so sánh
      `createdAt` (`localeCompare` chuỗi ISO tăng dần, item thiếu `createdAt` coi là cũ nhất) —
      đúng lưu ý kỹ thuật mục 5.2.1.
- [x] Tăng giới hạn hiển thị `50 → 75`: `[...tasks.slice(0,30), ...notes.slice(0,30),
      ...logs.slice(0,30)].sort(...).slice(0, 75)` — đúng số `ba` chốt ở mục 6.5.
- [x] Thêm token `--log-color: #8a8f98;` vào `:root` của `src/styles.css` — thêm sớm ở Phần 3
      (đánh dấu luôn mục tương ứng bên Phần 4 là đã xong để tránh trùng lặp việc).
- [x] `npx tsc --noEmit`, `npm run build`, `npx vitest run` (72/72 test pass — component
      `MobileChatScreen` chưa có test riêng, logic reducer/dispatch liên quan đã cover ở Phần 2).

### Thay đổi yêu cầu 2026-07-07 (SAU khi Phần 3 lần đầu đã xong — không phải lỗi dev)

Bản triển khai đầu tiên của Phần 3 dùng **segmented picker 3 nút `[Việc][Log][Note]`** để chọn
loại nội dung trước khi gõ (đúng theo `docs/features/nhat-ky-nhanh.md` mục 5.2.1 lúc đó). Ngay
sau khi xong, chủ dự án yêu cầu **đổi ngược lại cơ chế gõ tiền tố (prefix)** như bản gốc trước khi
có tính năng Nhật ký, nhưng đổi hành vi mặc định:

- Bỏ hẳn segmented picker (component, state `composeMode`, style liên quan) — quay về input đơn
  giản 1 dòng.
- Gõ trơn (không tiền tố) + Enter → **mặc định tạo Log** (KHÁC bản gốc, lúc đó gõ trơn tạo Task).
- `/task ` + Enter → tạo Task (tiền tố **MỚI** — trước đây gõ trơn mới ra Task).
- `/note ` + Enter → tạo Note (giữ nguyên như bản gốc).

Đã implement lại theo đúng yêu cầu này (`handleSubmit()` parse `/task`/`/note`/mặc định `LOG_CREATE`,
xoá state `composeMode`/UI picker, viền ô nhập highlight live theo tiền tố đang gõ — tái dùng đúng
cơ chế `isNoteMode` của bản gốc, mở rộng thêm `isTaskMode`). Các phần khác của Phần 3 (bubble Log
style dashed, sort theo `createdAt`, giới hạn 75 bubble) **giữ nguyên, không đổi**.

**Lưu ý quan trọng — tài liệu chính thức đã lỗi thời:** `docs/features/nhat-ky-nhanh.md` mục
5.1-5.3 (do `uiux` viết) vẫn đang mô tả cơ chế segmented picker cũ — nội dung này **không còn khớp
code thật** kể từ thay đổi này. Dev không tự sửa tài liệu UX chính thức (không phải vai trò của
dev) — cần `ba`/`uiux` cập nhật lại mục 5.1-5.3 (và bất kỳ chỗ nào khác nhắc tới picker 3 nút) cho
khớp cơ chế tiền tố mới trước khi coi tài liệu này là nguồn sự thật cho Phần 4 trở đi.

### Cách test Phần 3 (cơ chế MỚI — tiền tố, cập nhật 2026-07-07)

1. `npx tsc --noEmit` → pass sạch (đã chạy).
2. `npm run build` → build thành công (đã chạy, chỉ cảnh báo chunk-size cũ, không liên quan).
3. `npx vitest run` → 72/72 test pass (không đổi số lượng — Phần 3 chỉ sửa UI component, không có
   test riêng cho `MobileChatScreen` từ trước).
4. Kiểm tra thủ công trên UI thật (`npm run dev`, thu nhỏ trình duyệt xuống viewport mobile
   `≤639px` hoặc mở DevTools responsive mode, đăng nhập, vào tab "Trò chuyện"):
   - Không còn hàng 3 nút `[Việc][Log][Note]` phía trên ô nhập — chỉ còn 1 ô nhập đơn giản, viền
     trung tính khi rỗng/gõ trơn.
   - Gõ 1 dòng bất kỳ KHÔNG có tiền tố (vd "-50k trà đá") rồi Enter → bubble Log xuất hiện (nền
     xám nhạt, viền nét đứt, icon cuốn giấy `ScrollText`) — xác nhận gõ trơn giờ mặc định ra Log,
     không phải Task.
   - Gõ `/task mua sữa` rồi Enter → viền ô nhập đổi màu accent trong lúc gõ (nhận diện tiền tố
     live), Enter xong ra bubble Task (nền tím đặc, đúng style Task cũ) với tiêu đề "mua sữa"
     (không còn chữ `/task` trong tiêu đề).
   - Gõ `/note đọc sách` rồi Enter → viền ô nhập đổi màu tím (note-color) trong lúc gõ, Enter xong
     ra bubble Note với tiêu đề "đọc sách" (không còn chữ `/note`).
   - Gõ `/task` hoặc `/note` rồi Enter mà không có nội dung phía sau (vd chỉ gõ "/task ") → không
     tạo gì cả (input không bị xoá, do title rỗng bị chặn ở `handleSubmit()`).
   - Gửi liên tiếp 3 bubble khác loại (Log gõ trơn, Task `/task`, Note `/note`) xen kẽ nhanh → xác
     nhận thứ tự hiển thị đúng theo thời gian gửi thực tế.
   - Xoá hết nội dung feed (hoặc test trên Space mới chưa có gì) → xác nhận empty-state hiện đúng
     câu mới: "Gõ 1 dòng để ghi log nhanh — hoặc "/task " để tạo việc, "/note " để ghi chú."
   - Nếu đang test trên Shared Space có ≥2 member: log do người khác tạo (sau khi họ reload/gửi)
     hiển thị bên trái kèm tên + avatar, vẫn dùng đúng style nền xám/viền đứt (không đổi màu theo
     member — khác Task/Note).

## Phần 4 — Khối "Nhật ký nhanh" UI (desktop + mobile accordion) + bulk-select

Trạng thái: ✅ Xong (2026-07-08)

- [x] `features/logs/LogsBlock.tsx` (mới) — anatomy theo `nhat-ky-nhanh.md` mục 5.1, dùng khung
      `BlockShell` giống `TasksBlock` (KHÔNG có sub-toolbar riêng như `NotesBlock`, vì không có ô
      tìm kiếm): `headerActions` = dropdown sort Radix (Mới nhất/Cũ nhất, mặc định Mới nhất,
      ephemeral local state — không persist, không dùng `UiState` chung vì chỉ 1 nơi tiêu thụ) +
      nút "Chọn" (`.add-link`, icon `ListChecks`). List phẳng 1 cột, mỗi dòng: chip giờ
      (`formatBubbleTime`, xem export mới bên dưới) + nội dung `line-clamp-2` + chip tên người tạo
      (chỉ Shared Space & không phải mình, tái dùng `getMemberDisplayName`/`getMemberColor`) + nút
      xoá (`Trash2`, hover-reveal desktop/luôn hiện mobile, đúng pattern `TaskRow`). Empty state
      dùng `EmptyState` (icon `ScrollText`, text đúng mục 5.1). Icon-chip: `iconBg="rgba(138,143,152,.14)"`,
      `iconColor="var(--log-color)"`.
- [x] **Export `formatBubbleTime`** ra `src/utils/formatTime.ts` (trước đó là hàm local trong
      `MobileChatScreen.tsx`) — cả 2 nơi (`MobileChatScreen.tsx`, `LogsBlock.tsx`) import dùng
      chung, không viết lại (đúng mục 5.1 yêu cầu "import dùng chung").
- [x] Chế độ chọn nhiều + bulk-delete: nút "Chọn" hoặc long-press ~500ms trên 1 dòng (chỉ cảm
      ứng, qua `onTouchStart`/`onTouchEnd`/`onTouchMove`/`onTouchCancel` — tự huỷ timer nếu người
      dùng scroll/nhấc tay sớm; có cờ `suppressNextClick` để bỏ qua đúng 1 lần "click ma" mà
      trình duyệt bắn ra ngay sau `touchend` của long-press, tránh toggle lại dòng vừa được tự
      tick) → vào chế độ chọn, tick sẵn dòng vừa long-press. Checkbox Radix (`Checkbox.Root`,
      cùng style/kích thước với `TaskRow`), tap cả dòng để toggle (trừ vùng checkbox tự
      `stopPropagation`, tránh double-toggle). KHÔNG có nút "Chọn tất cả" (theo đúng yêu cầu đã
      bỏ). Toolbar thay `headerActions`: `Đã chọn N` — `Huỷ` (`text-[var(--text-dim)]`, hover
      `--accent`) — `Xoá (N)` (icon `Trash2`, màu `--reminder-color`, `disabled` khi N=0). Xoá qua
      `useConfirm()` (đơn lẻ: `"Xoá log này?"`; hàng loạt:
      `"Xoá N log đã chọn? Không thể hoàn tác."`), dispatch `LOG_DELETE`/`LOG_DELETE_MANY`.
- [x] **Tự thoát chế độ chọn — cách đơn giản hơn spec, cùng kết quả quan sát được (quyết định
      phát sinh, xem bên dưới):** chỉ theo dõi `space.id` bằng 1 `useRef` so sánh trực tiếp trong
      thân component (không cần `useEffect` + dependency mảng như mục 5.3 tài liệu mô tả) — đổi
      Space thì reset `isSelecting`/`selectedIds` ngay. Đổi tab mobile (Trò chuyện ↔ Chi tiết) và
      khối bị thu gọn trong accordion **không cần code thêm gì**: cả 2 sự kiện đó đã UNMOUNT hẳn
      `LogsBlock` sẵn trong cấu trúc hiện có của `AppLayout.tsx` (tab "Trò chuyện" render hẳn
      `MobileChatScreen` thay vì cây accordion; khối thu gọn thì `renderBlock('logs', ...)` không
      được gọi nữa, thay bằng `MobileCollapsedSummary`) — state cục bộ `useState` trong React tự
      mất khi component unmount, không cần dọn tay. Đã xác nhận đúng bằng cách đọc lại
      `AppLayout.tsx` trước khi code (không phải giả định).
- [x] Thêm `case 'logs':` vào `renderBlock()` (`AppLayout.tsx`), `MOBILE_VISIBLE_BLOCKS` thêm
      `'logs'`, `ENABLED_BLOCKS_KEY` thêm `logs: 'logs'`.
- [x] Thêm `logs` (h=20) vào `defaultDashboardLayout()` — cột 1, dưới `notes` (đổi `notes` từ
      h=82 → h=62 để nhường chỗ, giữ tổng cột 1 = 100 như quy ước hiện có dù không bắt buộc) +
      logic tự-chèn-khối-thiếu trong `normalizeDashboardLayout()` (chèn `{id:'logs',h:20}` vào
      CUỐI cột chứa `notes`, khác `today` chèn vào ĐẦU cột — vì `logs` nên đứng dưới `notes` theo
      vị trí mặc định) — hoàn thiện việc đã hoãn ở Phần 1 mục "Quyết định phát sinh #2". Có 3 test
      mới trong `normalize.test.ts` (`describe('normalizeDashboardLayout › migration khối "logs"')`)
      xác nhận: layout cũ thiếu `logs` được vá đúng không mất tuỳ biến cũ, layout đã có `logs`
      không bị chèn trùng, layout `undefined` fallback default có sẵn `logs`.
- [x] Checkbox "Nhật ký nhanh" trong `SpaceFormModal.tsx` (`BLOCK_DEFS`, thêm dòng cuối) — hoàn
      thiện việc đã hoãn ở Phần 1 mục "Quyết định phát sinh #3".
- [x] Mobile accordion tab "Chi tiết" tăng 2→3 khối — **đã tổng quát hoá logic accordion thay vì
      chỉ thêm nhánh cứng thứ 3** (đúng yêu cầu kiểm tra kỹ mục 5 việc cần làm): trước đây
      `AppLayout.tsx` có 2 biến bool `tasksExpanded`/`notesExpanded` + 2 khối JSX lặp gần giống
      hệt nhau (giả định cứng đúng 2 khối). Đã thay bằng `MOBILE_ACCORDION_ORDER`/
      `MOBILE_ACCORDION_DEFS` (mảng + map định nghĩa icon/màu/label theo id) và
      `visibleAccordionBlocks.map(...)` — thêm/bớt khối accordion sau này chỉ cần sửa 1 chỗ (2
      hằng số đó), không phải nhân bản thêm nhánh JSX. `effectiveExpanded` tự fallback về khối
      hiển thị đầu tiên nếu `mobileExpanded` đang trỏ vào 1 khối vừa bị `enabledBlocks` tắt.
      Trường hợp cả 3 khối đều bị tắt: text cảnh báo cập nhật liệt kê đủ 3 tên khối.
- [x] Token `--log-color` vào `src/styles.css` — đã làm sớm ở Phần 3, xem ghi chú "quyết định
      phát sinh" trong mục Phần 3 (không lặp lại việc ở đây).
- [x] `npx tsc --noEmit`, `npm run build`, `npx vitest run` — pass hết (75/75 test, tăng từ 72 →
      75 nhờ 3 test `normalizeDashboardLayout` mới ở trên). Không thêm test riêng cho
      `LogsBlock.tsx`/accordion JSX (component UI thuần, chưa có tiền lệ test component nào khác
      trong dự án — `TasksBlock`/`NotesBlock`/`MobileChatScreen` cũng không có test riêng, giữ
      nhất quán phạm vi test hiện tại của dự án: chỉ unit-test reducer/normalize/utility thuần).

### RLS Supabase cho cột `logs` (mục 6 việc cần làm — đã xác minh, không cần thêm việc)

Đã xác minh lại (không giả định) — `docs/features/nhat-ky-nhanh-schema.sql` (viết ở Phần 1) đã
để sẵn ghi chú đúng: RLS Postgres áp dụng theo **HÀNG**, không theo cột. 4 policy
select/insert/update/delete có sẵn trên `kn_shared_spaces` (`docs/features/shared-space-schema.sql`)
tự động bao trùm cột `logs` mới thêm — không cần policy riêng. Tương tự, `kn_space_state` lưu
nguyên mảng `Space[]` (gồm `logs[]`) trong 1 cột `spaces jsonb`, RLS đã áp theo `auth.uid() = user_id`
ở cấp hàng, không có gì cần đổi. Không có việc code nào phát sinh từ mục này.

### Quyết định phát sinh khi code (2026-07-08)

1. **Đơn giản hoá cơ chế "tự thoát chế độ chọn"** (xem chi tiết ở gạch đầu dòng thứ 5 phía trên)
   — dùng vòng đời component (mount/unmount) thay vì `useEffect` theo dõi 3 dependency như mô tả
   ở `nhat-ky-nhanh.md` mục 5.3. Lý do: đọc lại `AppLayout.tsx` trước khi code phát hiện 2/3 sự
   kiện (đổi tab mobile, thu gọn khối) đã tự động unmount `LogsBlock` sẵn trong cấu trúc hiện có —
   thêm `useEffect` theo dõi lại 2 việc này là dư thừa (2 lớp cơ chế cùng làm 1 việc). Chỉ còn
   đúng 1 dependency thật cần theo dõi bằng tay: đổi Space (component KHÔNG unmount khi đổi
   Space). Hành vi quan sát được từ phía user giống hệt mô tả trong tài liệu — không xin duyệt
   lại vì không đổi hành vi UX, chỉ đổi cách implement gọn hơn.
2. **Dropdown sort (`LogSortBy`) dùng `useState` cục bộ trong `LogsBlock`, không thêm vào
   `UiState` chung** (khác `NoteSortBy`/`TaskFilter` vốn nằm trong `state.ui`). Lý do: `logs`
   không có nơi thứ 2 nào cần đọc giá trị sort này (không như task filter ảnh hưởng cả
   `MobileChatScreen`/notification), nên không cần state toàn app — giữ đơn giản, tránh phình
   `AppAction`/`appReducer.ts` không cần thiết. Tài liệu mục 9 không chốt cứng vị trí lưu, chỉ mô
   tả type `LogSortBy`, nên đây là quyết định implementation hợp lệ của `dev`.
3. **Vị trí `logs` trong `defaultDashboardLayout()`: cột 1, dưới `notes` (h=20), giảm `notes` từ
   h=82 xuống h=62.** Theo đúng đề xuất "cùng cột với Ghi chú" trong yêu cầu — chọn đặt dưới thay
   vì trên/xen giữa `today`/`notes` vì `logs` là nội dung phụ trợ (xem lại sau khi cần), không nên
   chiếm vị trí đầu cột như `today` (widget luôn muốn thấy ngay).
4. **Bỏ `role="checkbox"`/`aria-checked` khỏi div bọc ngoài mỗi dòng** (ban đầu có thêm để rõ
   nghĩa "cả dòng toggle được", sau tự rà lại thấy tạo ra 2 role checkbox lồng nhau — dòng ngoài
   + `Checkbox.Root` Radix bên trong — vi phạm nguyên tắc không lồng phần tử interactive/role
   trùng nhau). Đã bỏ role ở div ngoài, giữ `aria-label`/semantics đầy đủ ở đúng `Checkbox.Root`
   (nguồn sự thật a11y duy nhất cho trạng thái chọn của dòng) — hành vi click-cả-dòng-để-toggle
   vẫn hoạt động bình thường qua `onClick` JS thường, không cần role ARIA đặc biệt ở ngoài.

### Cách test Phần 4 (cho user)

1. `npx tsc --noEmit` → pass sạch (đã chạy).
2. `npm run build` → build thành công (đã chạy, chỉ cảnh báo chunk-size cũ, không liên quan).
3. `npx vitest run` → **75/75 test pass** (tăng từ 72 → 75, thêm `describe('normalizeDashboardLayout
   › migration khối "logs"')` trong `src/__tests__/normalize.test.ts`).
4. Kiểm tra thủ công trên UI thật (`npm run dev`, đăng nhập):
   - **Bật khối:** vào Settings Space (nút sửa Space hoặc "Space mới") → xác nhận checkbox
     "Nhật ký nhanh" xuất hiện trong danh sách "Khối hiển thị" (cuối danh sách, sau "Hôm nay") —
     mặc định đã tick sẵn (Space cũ/mới đều bật `logs: true`).
   - **Desktop:** mở Dashboard (viewport rộng ≥1000px) → khối "Nhật ký nhanh" xuất hiện ở cột
     trái, ngay dưới khối "Ghi chú" (trên khối "Hôm nay" 1 chút phía trên "Ghi chú", "Nhật ký
     nhanh" nằm dưới cùng cột đó) — icon `ScrollText` màu xám trung tính, chưa có log nào thì
     hiện `EmptyState` "Chưa có log nào" + gợi ý dùng tab Trò chuyện trên điện thoại.
   - **Tạo log để test:** thu nhỏ trình duyệt xuống viewport mobile (≤639px) hoặc mở DevTools
     responsive mode → tab "Trò chuyện" → gõ vài dòng trơn (không tiền tố, vd "-50k trà đá", "họp
     lúc 9h") → Enter từng dòng để tạo vài log.
   - **Xem lại trên khối desktop:** mở lại viewport rộng (hoặc F5 nếu cần) → khối "Nhật ký nhanh"
     hiện đủ các dòng vừa gõ, mỗi dòng có giờ tạo (chip xám nhỏ bên trái) + nội dung + nút xoá
     (icon thùng rác) chỉ hiện khi hover chuột vào dòng đó.
   - **Sort:** bấm dropdown "Mới nhất" ở header khối → đổi "Cũ nhất" → xác nhận thứ tự log đảo
     ngược (log tạo trước lên đầu).
   - **Xoá 1 dòng:** hover 1 dòng, bấm icon thùng rác → modal xác nhận "Xoá log này?" hiện ra
     (không phải `window.confirm` của trình duyệt) → bấm xác nhận → dòng biến mất.
   - **Chế độ chọn nhiều (desktop):** bấm nút "Chọn" ở header → mỗi dòng hiện checkbox ở đầu,
     header đổi thành "Đã chọn 0 — Huỷ — Xoá (0)" (nút Xoá xám mờ, không bấm được) → click vào 2-3
     dòng bất kỳ (cả dòng, không chỉ ô checkbox) → số "Đã chọn N" tăng theo, nút "Xoá (N)" sáng
     lên màu đỏ → bấm "Xoá (N)" → modal xác nhận "Xoá N log đã chọn?" → xác nhận → các dòng đã
     chọn biến mất, tự thoát chế độ chọn (header trở lại dropdown sort + nút "Chọn").
   - **Huỷ chế độ chọn:** vào lại chế độ chọn, tick vài dòng, bấm "Huỷ" → không dòng nào bị xoá,
     header trở lại bình thường.
   - **Đổi Space khi đang chọn:** vào chế độ chọn ở khối Nhật ký, tick vài dòng, rồi đổi sang
     Space khác (qua Space-switcher) → xác nhận chế độ chọn tự thoát (không còn checkbox/toolbar
     khi mở lại Space cũ).
   - **Mobile accordion 3 khối:** ở viewport mobile, vào tab "Chi tiết" → xác nhận thấy 3 khối
     dạng accordion theo thứ tự Việc cần làm / Ghi chú / Nhật ký (mặc định "Việc cần làm" mở to,
     2 khối kia thu nhỏ thành thanh tóm tắt icon+tên+số lượng) → bấm vào thanh tóm tắt "Nhật ký"
     → khối Nhật ký mở to (chiếm phần lớn màn hình), 2 khối kia thu nhỏ lại — xác nhận vẫn đúng
     hành vi "chỉ 1 khối mở tại 1 thời điểm" như trước, giờ áp dụng cho cả 3 khối.
   - **Long-press mobile:** trên thiết bị cảm ứng thật (hoặc Chrome DevTools bật chế độ giả lập
     cảm ứng) — nhấn giữ ~1 giây vào 1 dòng log trong khối Nhật ký (khi khối đang mở trong
     accordion) → xác nhận tự vào chế độ chọn VÀ dòng vừa nhấn giữ đã được tick sẵn (không cần
     bấm nút "Chọn" trước).
   - **Chuyển tab mobile khi đang chọn:** vào chế độ chọn ở khối Nhật ký (tab "Chi tiết"), rồi bấm
     tab "Trò chuyện" ở thanh dưới, sau đó quay lại tab "Chi tiết" → xác nhận chế độ chọn đã tự
     thoát (không còn giữ trạng thái cũ).
   - **Tắt khối theo Space:** vào Settings Space, bỏ tick "Nhật ký nhanh" → lưu → xác nhận khối
     biến mất khỏi cả desktop lẫn mobile accordion (accordion mobile giờ chỉ còn 2 khối, không có
     khoảng trống thừa) — log cũ KHÔNG bị mất (bật lại checkbox sẽ thấy lại đầy đủ).

## Phần 5 — Gộp khối "Hôm nay" + Widget điều hướng (`docs/requirements.md` mục 4.1)

Trạng thái: ✅ Xong (2026-07-08) — **đây là phần cuối cùng của toàn bộ kế hoạch** (xem "Tổng kết"
cuối file).

- [x] Xoá `'today'` khỏi `LayoutBlockKey` (`src/types.ts`) — hoàn tất việc đã hoãn ở Phần 1 mục
      "Quyết định phát sinh #1". Giữ nguyên key `'settings'` cho khối gộp (đỡ đổi
      `HEIGHT_LOCKED_IDS`/`ENABLED_BLOCKS_KEY`/`MOBILE_VISIBLE_BLOCKS`/`blockRefs` ở nhiều nơi —
      đúng gợi ý change impact #3 trong requirements.md).
- [x] Xoá field `today` khỏi `EnabledBlocks` (`src/types.ts`) + bỏ checkbox "Hôm nay" khỏi
      `BLOCK_DEFS` trong `SpaceFormModal.tsx` (AC4) + xoá field này khỏi mọi nơi tạo/normalize
      `EnabledBlocks`: `state/seed.ts` (`createSeedSpaces`), `state/reducers/spaces.ts`
      (`defaultEnabledBlocks`), `state/appReducer.ts` (`normalizeImportedSpace`),
      `storage/normalize.ts` (`normalizeSpace`), `storage/sharedSpaceStore.ts` (`rowToSpace`).
- [x] `HEIGHT_LOCKED_IDS` (`dashboardLayoutUtils.ts`) đổi thành tập rỗng — bỏ `'settings'` (AC2:
      khoá cứng chuyển xuống CSS nội bộ component, không còn ở cấp layout-engine).
- [x] `ENABLED_BLOCKS_KEY` (`AppLayout.tsx`) bỏ dòng `today: 'today'`.
- [x] **Component gộp mới:** tách `DashboardCorner.tsx` thành 2 phần — `DashboardCornerNav`
      (nội dung thuần: Home/Space-switcher/Settings + modal, KHÔNG có chrome ngoài) được export
      dùng chung, và `DashboardCorner` (giữ nguyên tên, giờ CHỈ còn 1 vai trò: thanh top-bar
      compact cố định trên mobile — bỏ hẳn nhánh non-compact/card độc lập vì không còn nơi nào
      gọi). File MỚI `src/components/DashboardCornerBlock.tsx` — khối gộp desktop thật sự: 1
      card (`id="dashboard-corner"`, rounded-xl/border/shadow 1 lần duy nhất, `overflow-hidden`
      để bo góc cả 2 hàng con) chứa 2 hàng dọc:
      - Hàng nav: `flex-none`, bọc `<DashboardCornerNav onGoHome={onGoHome} />`, nền gần đặc đổi
        theo theme (y hệt style cũ, chỉ bỏ rounded/border/shadow riêng vì outer đã có).
      - Hàng ambient: `flex-1 min-h-0`, nội dung đồng hồ/ngày/quote port nguyên từ
        `TodayBlock.tsx` cũ (đã xoá file, logic chuyển thẳng vào đây) — nền trong suốt cố định +
        chữ trắng cố định, `cursor-grab` (giữ đúng hành vi cũ của TodayBlock).
      `AppLayout.tsx` `case 'settings':` đổi sang render `DashboardCornerBlock` (có truyền thêm
      `style={style}` — trước đây `case 'settings':` KHÔNG truyền `style` vì `settings` từng bị
      khoá cứng ở layout-engine nên slot tự sizing theo content; giờ cần `style` để khối gộp lấp
      đầy đúng theo trọng số `h` mới của slot, giống 6 khối dữ liệu khác).
      `case 'today':` bị xoá hẳn, xoá import `TodayBlock`.
- [x] **Migration `normalizeDashboardLayout()`:** thêm hàm `migrateTodaySettingsMerge()` trong
      `storage/normalize.ts` — neo vị trí theo slot `settings` cũ, `h` slot gộp =
      `max(h cũ của 'today', h cũ của 'settings')`; nếu `today` đã bị kéo sang vị trí khác/ghép
      ngang, vị trí đó bị bỏ hẳn (viết tay lại logic kiểu `removeIdFromLayout` vì hàm gốc trong
      `dashboardLayoutUtils.ts` không còn chấp nhận `'today'` về type — phải cast `as string` cục
      bộ để đọc dữ liệu LEGACY runtime). Có **fallback an toàn**: nếu sau khi gộp vẫn không tìm
      thấy slot `settings` (dữ liệu bất thường), tự chèn 1 slot `settings` mới vào đầu cột 1 —
      không để Dashboard mất hẳn khối điều hướng (vi phạm AC3). Chạy tự động trước bước vá
      `logs` (thứ tự: chuẩn hoá `colWidths` lệch → gộp today/settings → vá thiếu `logs`).
- [x] Cập nhật `defaultDashboardLayout()` (`seed.ts`) theo bố cục mặc định mới: cột 1 mất
      `today` (không thay thế gì — khối gộp giờ ở cột 3), cột 3 đổi `settings.h` từ 14 → 22,
      `reminders.h` từ 86 → 68 (nhường chỗ cho hàng ambient mới). Cột 1 (notes+logs) giữ nguyên
      thứ tự đã có từ Phần 4 — **không** đổi sang thứ tự "logs trên/notes dưới" như câu chữ mục 4
      requirements.md mô tả (xem "Quyết định phát sinh" bên dưới, đây là câu hỏi mở cần `ba` xác
      nhận lại).
- [x] `<DashboardCorner compact />` trên mobile — xác nhận đúng, không đổi cách gọi (vẫn
      `<DashboardCorner onGoHome={onGoHome} compact />` tại `AppLayout.tsx`, chỉ render hàng nav,
      không có hàng ambient — AC6).
- [x] Xoá file `src/features/today/TodayBlock.tsx` (và thư mục `features/today/` rỗng) — nội
      dung đã port sang `DashboardCornerBlock.tsx`.
- [x] `npx tsc --noEmit` (pass sạch), `npm run build` (pass, chỉ cảnh báo chunk-size cũ),
      `npx vitest run` (**79/79 pass**, tăng từ 75 → 79: thêm 4 test migration
      `describe('normalizeDashboardLayout › migration gộp "today" + "settings"')` trong
      `src/__tests__/normalize.test.ts` — layout còn `today` ở vị trí mặc định, `today` đã bị
      kéo ghép ngang chỗ khác, layout đã ở schema mới (idempotent), fallback khi thiếu hẳn
      `settings`; sửa 5 file fixture test khác bỏ `today: true` khỏi literal `EnabledBlocks`, và
      sửa fixture legacy trong test migration "logs" đã có sẵn bỏ `id:'today'` không còn hợp lệ
      type để tránh conflate 2 concern trong 1 test).

### Quyết định phát sinh khi code (2026-07-08)

1. **Đơn giản hoá `DashboardCorner.tsx` — bỏ hẳn nhánh "non-compact/card độc lập"** thay vì giữ
   cả 2 nhánh (compact/non-compact) như code cũ. Lý do: sau khi `case 'settings':` trong
   `AppLayout.tsx` chuyển sang dùng `DashboardCornerBlock`, nhánh non-compact của
   `DashboardCorner` không còn bất kỳ nơi nào gọi tới — giữ lại là dead code. Tách nội dung dùng
   chung (Home/Switcher/Settings/modal) ra `DashboardCornerNav` (export riêng, không có chrome)
   để cả `DashboardCorner` (chrome bar mobile) lẫn `DashboardCornerBlock` (chrome card desktop)
   cùng tái dùng — tránh trùng lặp JSX giữa 2 nơi có chrome khác hẳn nhau.
2. **Vị trí `logs` trong `defaultDashboardLayout()` GIỮ NGUYÊN như Phần 4 đã quyết định (dưới
   `notes`), KHÔNG đổi theo câu chữ mục 4 requirements.md** ("Nhật ký nhanh (trên — thay đúng vị
   trí khối 'Hôm nay' cũ) + Ghi chú (dưới)"). Phát hiện khi đọc lại: đoạn mô tả bố cục mặc định ở
   mục 4 được viết ngày 2026-07-07 (trước khi Phần 4 triển khai thật `logs` 1 ngày), còn quyết
   định thật lúc code Phần 4 (2026-07-08, xem "Quyết định phát sinh khi code" của Phần 4 phía
   trên) đặt `logs` DƯỚI `notes` với lý do rõ ràng ("nội dung phụ trợ, không nên chiếm vị trí đầu
   cột"). Đây là 1 sai lệch thật giữa tài liệu và code đã tồn tại từ trước khi làm Phần 5 (không
   phải do Phần 5 gây ra) — phạm vi việc cần làm mà "orchestrator" giao cho Phần 5 chỉ nói tới
   thay đổi ở CỘT 3 ("khối gộp thay vị trí settings cũ ở đầu cột 3, Thông báo phía dưới giảm h"),
   không nhắc gì tới việc sắp xếp lại cột 1. Quyết định: **giữ nguyên vị trí `logs` đã có** (an
   toàn hơn, không tự ý đảo lại 1 quyết định UX đã chốt ở Phần 4 mà không hỏi), chỉ xoá `today`
   khỏi cột 1 (không thay thế bằng gì, vì khối gộp giờ sống hẳn ở cột 3). **Cần `ba` xác nhận lại
   và cập nhật câu chữ mục 4 requirements.md cho khớp code thật** (tương tự việc mục 5.1-5.3 đã
   lỗi thời ở Phần 3) — không phải việc của `dev` tự sửa tài liệu chính thức.
3. **`h=22` cho slot `settings` gộp và `h=68` cho `reminders`** trong `defaultDashboardLayout()`
   — chọn trong khoảng gợi ý của requirements.md ("khối gộp h≈20-24 thay settings.h=14 cũ, Thông
   báo giảm từ h=86 xuống ~66-70"), không cần khớp tuyệt đối theo đúng ghi chú "gợi ý tham khảo"
   ở đầu mục "Bố cục mặc định".
4. **Migration `h` slot gộp dùng `max(todayH, settingsH)` thay vì cộng có trọng số** — theo đúng
   gợi ý đầu tiên trong 2 phương án mà requirements.md đưa ra (change impact #2: "vd
   `max(today.h, settings.h)` hoặc cộng có trọng số"). Chọn `max` vì đơn giản, dễ dự đoán, và
   không có rủi ro làm slot gộp cao bất thường nếu cả 2 giá trị cũ đều đã lớn (cộng dồn 2 số dễ
   vượt xa mức mặc định mới 20-24, kéo méo tỉ lệ tổng `h` của cả cột).
5. **Fallback "thiếu slot `settings`" chèn vào ĐẦU CỘT 1** (không phải cột chứa `settings` cũ,
   vì theo định nghĩa trường hợp này KHÔNG tìm thấy `settings` ở đâu cả) — chọn cột 1 đơn giản vì
   đây là trường hợp cực hiếm/dữ liệu hỏng, không cần tối ưu vị trí đẹp, chỉ cần đảm bảo AC3
   (không mất khối điều hướng) và không crash.

### Cách test Phần 5 (cho user)

1. `npx tsc --noEmit` → pass sạch (đã chạy).
2. `npm run build` → build thành công (đã chạy, chỉ cảnh báo chunk-size cũ, không liên quan).
3. `npx vitest run` → **79/79 test pass** (tăng từ 75 → 79, thêm
   `describe('normalizeDashboardLayout › migration gộp "today" + "settings"')` trong
   `src/__tests__/normalize.test.ts`).
4. Kiểm tra thủ công trên UI thật (`npm run dev`, đăng nhập, mở Dashboard desktop ≥1000px):
   - **1 card duy nhất (AC1):** xác nhận góc trên-phải (cột 3) chỉ còn ĐÚNG 1 card chứa cả nút
     Home + dropdown Space + nút Settings (hàng trên) VÀ đồng hồ giờ:phút + ngày + quote (hàng
     dưới) — không còn 2 card tách rời như trước.
   - **2 style khác hẳn nhau (AC8):** hàng nav nền gần như đặc (đổi theo theme sáng/tối, thử bấm
     nút Settings → tab "Chung" → đổi theme xem hàng nav đổi màu ngay); hàng ambient (đồng hồ)
     nền trong suốt lộ ảnh nền, chữ LUÔN trắng bất kể đổi theme sáng/tối.
   - **Resize (AC2):** rê chuột vào khoảng trống ngay dưới card gộp (splitter ẩn giữa nó và khối
     "Thông báo" bên dưới) → kéo lên/xuống → xác nhận CHỈ hàng đồng hồ co giãn theo, hàng nav
     (Home/Space/Settings) giữ nguyên chiều cao không đổi dù kéo splitter mạnh tay.
   - **Kéo-thả (AC7):** bấm-giữ vào vùng đồng hồ (không phải nút/dropdown) rồi kéo thả sang vị
     trí khác trên Dashboard → xác nhận cả card gộp (cả 2 hàng) di chuyển theo cùng nhau, đổi
     được vị trí/cột như 1 khối bình thường. Thử bấm-giữ vào vùng trống của hàng nav (không phải
     3 nút/dropdown) cũng phải kéo được.
   - **Luôn hiện (AC3/AC4):** vào Settings Space (sửa 1 Space bất kỳ) → xác nhận KHÔNG còn
     checkbox "Hôm nay" trong danh sách "Khối hiển thị" — chỉ còn Việc cần làm/Nhắc việc/Thói
     quen/Ghi chú/Nhật ký nhanh (5 checkbox, mất 1 so với trước). Tắt hết các checkbox còn lại →
     lưu → xác nhận card gộp vẫn hiện bình thường trên Dashboard dù mọi khối khác đã tắt.
   - **Mobile (AC6):** thu nhỏ trình duyệt xuống ≤639px hoặc DevTools responsive mode → xác nhận
     thanh trên cùng CHỈ có Space-switcher + nút Settings (không nút Home, không đồng hồ/ngày/
     quote) — giống hệt hành vi trước khi gộp, không có gì mới ở mobile.
   - **Migration layout cũ (AC5) — quan trọng nhất vì ảnh hưởng dữ liệu thật của bạn:** đây là
     tài khoản đã có `dashboardLayout` lưu sẵn trên Supabase (2 slot `today` h=18 + `settings`
     h=14 riêng, theo mô tả đề bài) — chỉ cần **F5 reload lại trang** (hoặc đăng nhập lại) là đủ
     để kích hoạt migration tự động. Xác nhận: không có lỗi/màn trắng/crash nào; Dashboard hiện
     đúng 1 card gộp ở vị trí CŨ của card "Widget điều hướng" (không phải vị trí cũ của "Hôm
     nay"); các khối khác (Việc cần làm/Ghi chú/Thói quen/Nhắc việc/Nhật ký nhanh/Thông báo) và
     mọi tuỳ biến kéo-thả/resize trước đó của bạn ở các khối đó KHÔNG bị mất/xáo trộn. Nếu trước
     đó bạn từng kéo khối "Hôm nay" sang vị trí khác/ghép ngang với 1 khối dữ liệu (không phải vị
     trí mặc định) — xác nhận sau reload, khối đó (vd "Thói quen" nếu bạn từng ghép ngang) trở về
     đúng 1 mình (`single`), không còn ghé ngang với gì cả (vì "today" đã bị gộp mất, không giữ
     được 2 vị trí).
   - **Khôi phục bố cục mặc định:** vào Settings tab "Chung" → bấm "Khôi phục bố cục mặc định" →
     xác nhận card gộp xuất hiện ở đầu cột 3 (bên trên "Thông báo"), cột 1 có "Ghi chú" + "Nhật ký
     nhanh" (không có "Hôm nay" đứng riêng vì khối đó không còn tồn tại độc lập).

### Sửa bug + tinh chỉnh style sau khi user test bản thật (2026-07-08)

Sau khi Phần 5 lên bản thật, user test và phát hiện 2 vấn đề, đã bàn với `uiux`/`ba` xong (AC8 mới
trong `docs/requirements.md` mục 4.1):

1. **Bug: dropdown Space-switcher định vị sai (hiển thị lệch xuống thấp).** Root cause:
   `SpaceSwitcher.tsx` đo `getBoundingClientRect()` của `#dashboard-corner` — trước khi gộp id đó
   chỉ gắn ở hàng nav (thấp), sau khi gộp id đó chuyển sang bọc CẢ khối 2 hàng (nav + ambient) nên
   popover bị neo theo đáy cả khối, lệch xuống đúng bằng chiều cao hàng ambient. Fix: thêm id riêng
   `dashboard-corner-nav` chỉ bọc hàng nav trong `DashboardCornerBlock.tsx`; `SpaceSwitcher.tsx` ưu
   tiên đo theo id mới, fallback về `dashboard-corner` (giữ đúng hành vi cho thanh mobile compact
   `DashboardCorner.tsx` — chỉ 1 hàng nav nên id cũ vẫn đúng, không cần sửa file đó).
2. **Style overlay hợp nhất (AC8 mới):** bỏ nền `color-mix(panel-bg)` + `saturate(1.15)` +
   `border-b` riêng của hàng nav trong `DashboardCornerBlock.tsx`; thay bằng 1 lớp overlay gradient
   đen dọc DUY NHẤT (`180deg`, `.14`→`.32`) phủ suốt cả khối (con trực tiếp của root, `z-0`, dưới 2
   hàng nội dung `z-[5]`), `backdrop-filter: blur(8px)` chung cho cả khối. Hàng ambient bỏ overlay
   `135deg` riêng cũ của nó (tránh double-overlay). 3 control (Home/Space-switcher/Settings) không
   đổi gì (đã tự có nền `--raised` riêng) — **lưu ý: câu này đã bị thay thế bởi mục "Sửa tiếp" bên
   dưới (2026-07-08), user test thấy 3 control vẫn nổi trắng đục trên ảnh nền, `--raised` không phù
   hợp khi nổi trực tiếp trên photo.**

**Kiểm tra đã làm:**
- `npx tsc --noEmit`, `npm run build`, `npx vitest run` — pass hết (79/79 test).
- **Giới hạn môi trường:** không thể mở app thật qua Playwright để test trực tiếp (yêu cầu đăng
  nhập Google OAuth thật, không có bypass/demo mode). Thay vào đó đã dựng 1 mockup HTML tĩnh tái sử
  dụng đúng CSS đã build (`dist/assets/index-*.css`, chứa đúng các class Tailwind arbitrary-value
  thật của `DashboardCornerBlock.tsx`) để kiểm tra style bằng Playwright screenshot:
  - Card gộp trên nền rất sáng và rất tối, cả 2 nhánh theme (`data-theme=light/dark`): icon
    Home/Settings + border pill đọc rõ trên nền sáng, chữ đồng hồ/quote đọc rõ trên nền tối, không
    còn thấy đường ranh giữa 2 hàng (overlay liền mạch).
  - Dựng lại đúng logic đo `getBoundingClientRect()` cũ (`#dashboard-corner`, buggy) và mới
    (`#dashboard-corner-nav`, fixed) trên chính card đã render, vẽ 2 khung dropdown giả để so sánh
    trực quan — xác nhận khung "fixed" bám đúng đáy hàng nav, khung "buggy" lệch xuống đáy cả khối
    (đúng như mô tả bug ban đầu) → xác nhận logic fix đúng.
  - Đây là kiểm tra CSS/logic định vị tĩnh, KHÔNG phải test Radix Popover thật (animation, focus
    trap, collision detection...). User nên tự bấm thử dropdown Space-switcher trên bản thật 1 lần
    (`npm run dev` → đăng nhập → mở Dashboard) để xác nhận cuối cùng bằng mắt.

**Cách test cho user:**
1. `npm run dev`, đăng nhập, mở Dashboard desktop (≥1000px).
2. Bấm vào dropdown Space-switcher (giữa hàng nav của card gộp) → xác nhận dropdown mở NGAY DƯỚI
   hàng nav (sát đáy 3 nút Home/Space/Settings), không còn lệch xuống dưới đáy hàng đồng hồ/quote
   như trước.
3. Quan sát card gộp trên cả nền sáng lẫn nền tối (đổi ảnh nền qua Settings nếu có, hoặc đổi theme
   sáng/tối qua Settings tab "Chung") — xác nhận không còn thấy "đường ranh"/mảng màu khác biệt rõ
   giữa hàng nav và hàng đồng hồ, cả khối trông liền mạch như 1 card.
4. Icon Home/Settings và border pill Space-switcher vẫn đọc rõ trên mọi nền ảnh; chữ đồng hồ/ngày/
   quote vẫn đọc rõ (trắng, có text-shadow) trên mọi nền ảnh.

### Sửa tiếp: 3 control "trắng đục" trên ảnh nền (2026-07-08, `uiux` chốt "dark glass pill")

Sau khi test bản có overlay hợp nhất ở trên, user vẫn thấy 2 nút icon Home/Settings + pill
Space-switcher nổi trắng đục lệch tông trên ảnh nền — vì cả 3 vẫn dùng `bg-[var(--raised)]`
(token theme-adaptive, gần trắng ở light theme), hợp lý trên card nền ổn định nhưng sai khi nổi
trực tiếp trên ảnh nền tuỳ ý. `uiux` đề xuất biến thể riêng "dark glass pill" chỉ áp dụng cho
ngữ cảnh nổi-trên-ảnh, user xác nhận (`ok`).

- Thêm prop `onPhoto?: boolean` vào `DashboardCornerNav` (`src/components/DashboardCorner.tsx`):
  bật thì 2 nút Home/Settings đổi nền `rgba(0,0,0,.30)` + viền `rgba(255,255,255,.18)` +
  `backdrop-filter: blur(6px) saturate(1.1)`, icon trắng + `drop-shadow`; hover chỉ đổi
  nền/viền đậm hơn (`rgba(0,0,0,.44)` / `rgba(255,255,255,.32)`), KHÔNG đổi màu icon (khác hẳn
  hover mặc định vốn đổi sang `--accent`). Kích thước/border-radius/focus-visible giữ nguyên.
- `SpaceSwitcher.tsx` nhận thêm prop `onPhoto` (cùng pattern với `compact` đã có sẵn) — trigger
  pill dùng đúng công thức nền/viền/blur trên, tên Space trắng + text-shadow, chevron
  `rgba(255,255,255,.75)`; dot màu Space và icon `Share2` (space chung, `--accent`) giữ nguyên
  không đổi.
- `DashboardCornerBlock.tsx` (desktop, nổi trên ảnh nền): gọi `<DashboardCornerNav onGoHome={...}
  onPhoto />`. `DashboardCorner.tsx` (mobile compact top-bar, nằm trong thanh nền glass theo theme,
  không lỗi tông): KHÔNG truyền `onPhoto`, giữ nguyên `--raised` mặc định.
- **Kiểm tra:** `npx tsc --noEmit`, `npm run build`, `npx vitest run` — pass hết (79/79 test).
  Dựng mockup HTML tĩnh dùng CSS build thật (`dist/assets/index-*.css`), render card gộp trên nền
  ảnh sáng (trường hợp lỗi rõ nhất) 2 phiên bản before/after cạnh nhau, chụp Playwright screenshot
  — xác nhận bản before 3 control nổi trắng đục rõ rệt, bản after hài hoà với nền, chữ/icon đọc
  rõ nhờ drop-shadow/text-shadow.

**Cách test cho user:**
1. `npm run dev`, đăng nhập, mở Dashboard desktop (≥1000px), xem card gộp "Widget điều hướng +
   Hôm nay" (góc chứa Home/Space-switcher/Settings + đồng hồ).
2. Ngắm 3 control — xác nhận không còn nổi trắng đục/lạc tông trên ảnh nền (nền kính đen mờ, icon
   trắng rõ nét, hài hoà với ảnh nền bất kể màu gì).
3. Hover từng nút Home/Settings — nền đậm hơn (không còn nhìn thấy icon đổi màu như hover mặc định
   ở nơi khác, đây là chủ đích).
4. Nếu có nhiều Space, bấm dropdown Space-switcher — xác nhận trigger pill vẫn cùng tông kính tối,
   dropdown mở đúng vị trí (không đổi so với lần sửa trước).
5. Kiểm tra thanh top-bar mobile (`≤639px`, nếu test được) — xác nhận KHÔNG đổi gì (vẫn nền
   `--raised` theo theme sáng/tối như cũ).

---

## Tổng kết — toàn bộ tính năng đã hoàn tất (2026-07-08)

Cả 2 tính năng triển khai cùng đợt theo `docs/requirements.md` mục 4/4.1 và
`docs/features/nhat-ky-nhanh.md` đã xong toàn bộ 5 phần:

- **Nhật ký nhanh** (Phần 1-4): schema/types, storage CRUD (load-on-open, không Realtime, đúng
  nguyên tắc dự án), capture qua `MobileChatScreen` (cơ chế tiền tố `/task`/`/note`, mặc định
  Log), khối UI desktop + accordion mobile 3 khối + bulk-select.
- **Gộp "Hôm nay" + Widget điều hướng** (Phần 5): 2 `LayoutBlockKey` cũ (`today`+`settings`) gộp
  thành 1 khối duy nhất (`DashboardCornerBlock.tsx`), khoá cứng chuyển từ cấp layout-engine xuống
  CSS nội bộ, migration layout đã lưu tự động, không mất dữ liệu.

Có 2 việc còn NGOÀI phạm vi `dev`, cần `ba`/chủ dự án xử lý tiếp (không chặn tính năng, không cần
làm ngay):
1. `docs/features/nhat-ky-nhanh.md` mục 5.1-5.3 vẫn mô tả cơ chế segmented-picker cũ đã bị thay
   bằng cơ chế tiền tố (xem ghi chú ở Phần 3) — cần `uiux` cập nhật lại.
2. `docs/requirements.md` mục 4 (bố cục mặc định cột 1) mô tả thứ tự "logs trên/notes dưới" không
   khớp code thật (`notes` trên, `logs` dưới, theo quyết định thật đã chốt khi code Phần 4) — cần
   `ba` xác nhận lại và cập nhật câu chữ cho khớp (xem "Quyết định phát sinh" #2 của Phần 5).

Không còn phần nào ⬜/🔶 trong kế hoạch này.

---

## Tinh chỉnh bổ sung sau "hoàn tất" — style 3 control Home/Settings/Space-switcher (ngoài phạm vi Phần 5 gốc)

Sau khi tính năng đã "hoàn tất" ở trên, user tiếp tục yêu cầu tinh chỉnh riêng phần style của 3
control nổi trên ảnh nền (`onPhoto`) — không đổi logic/behavior, chỉ CSS. Ghi lại thành chuỗi
riêng vì đã sửa 3 lần liên tiếp, để phiên sau không lặp lại các hướng đã bị bác.

- **Lần 1** ("trắng đục", xem mục "Sửa tiếp: 3 control 'trắng đục'..." ở trên) — bản gốc dùng
  `bg-[var(--raised)]`, lệch tông trên ảnh nền.
- **Lần 2** ("dark glass pill", cùng mục ở trên, 2026-07-08) — nền đen 30%/44% (hover) + viền
  trắng 18%/32% + blur. **User bác** sau khi test bản thật: vẫn đọc như "hộp dán lên ảnh" (viền +
  nền cố định ngay cả ở trạng thái nghỉ khiến 3 control trông như 1 lớp UI riêng biệt đè lên ảnh,
  không hoà vào layout).
- **Lần 3 — "Ghost control"** (2026-07-08, `uiux` đề xuất, user xác nhận áp dụng): bỏ hẳn
  nền/viền ở trạng thái nghỉ (`rest`), chỉ dựa vào double drop-shadow (icon)/double text-shadow
  (chữ) để nổi trên ảnh nền bất kỳ — không cần khung. Nền mờ + blur chỉ xuất hiện khi
  hover/focus-visible/active, biến mất ngay khi rời chuột (trừ khi popover Space-switcher đang mở).
  Thay thế HOÀN TOÀN nội dung `onPhoto` của lần 2, không phải thêm biến thể mới.

  **Token áp dụng (dùng chung cho cả 2 nút icon và trigger Space-switcher):**
  - Rest: `background: transparent`, không border, `border-radius: 10px`, icon/chữ trắng
    `opacity: .92` (chỉ áp dụng cho 2 nút icon — trigger Space-switcher giữ chữ trắng đục 100% như
    cũ vì bảng màu label vốn đã opaque, spec không yêu cầu đổi).
  - Icon SVG + dot màu Space + icon `Share2` + chevron: double drop-shadow bắt buộc —
    `drop-shadow(0 1px 1px rgba(0,0,0,.65)) drop-shadow(0 2px 5px rgba(0,0,0,.35))`.
  - Tên Space (label): double `text-shadow` cùng giá trị (`0 1px 1px rgba(0,0,0,.65), 0 2px 5px
    rgba(0,0,0,.35)`) — nặng hơn text-shadow đơn của lần 2.
  - Hover: `background-color: rgba(0,0,0,.22)`, `backdrop-filter: blur(6px) saturate(1.1)`, icon
    `opacity: 1`. 2 nút icon có thêm `transform: scale(1.05)`; trigger Space-switcher (thanh ngang
    `w-full`) KHÔNG scale để tránh giật layout.
  - Active: `background-color: rgba(0,0,0,.30)`, 2 nút icon có thêm `scale(.96)`.
  - Trigger Space-switcher khi popover đang mở (`aria-expanded="true"`, dùng thẳng Tailwind
    variant `aria-expanded:` — Tailwind v3.4 hỗ trợ sẵn, không cần class JS thủ công): giữ nguyên
    nền/blur như hover, không tắt khi rời chuột.
  - Focus-visible: nền/blur như hover + `outline: 2px solid rgba(255,255,255,.92)` +
    `outline-offset: 2px` + `box-shadow: 0 0 0 4px rgba(0,0,0,.28)` (halo đen bao ngoài outline
    trắng, để outline không chìm trên nền ảnh sáng).
  - `transition-timing-function` dùng token có sẵn `var(--ease-standard)` (`src/styles.css`,
    `cubic-bezier(0.32,0.72,0,1)`) qua cú pháp `[transition-timing-function:var(--ease-standard)]`
    — đúng convention đã dùng ở nhiều nơi khác trong repo (không dùng `ease-[var(...)]`, Tailwind
    không có utility đó).

  **File đã sửa:** `src/components/DashboardCorner.tsx` (`iconBtnClass`/`iconClass` trong
  `DashboardCornerNav`, biến thể `onPhoto`), `src/features/spaces/SpaceSwitcher.tsx` (trigger
  button, dot màu, icon `Share2`, label, chevron trong biến thể `onPhoto`). Không đổi
  `DashboardCornerBlock.tsx` (gradient nền chung), không đổi `DashboardCorner.tsx` compact
  (mobile top-bar, không truyền `onPhoto`).

  **Kiểm tra đã làm:** `npx tsc --noEmit`, `npm run build`, `npx vitest run` (79/79 pass) — hết.
  Dựng mockup HTML tĩnh dùng đúng class Tailwind từ source + CSS build thật
  (`dist/assets/index-*.css`), chụp Playwright ở rest/hover (hover thật bằng `page.hover()`, không
  giả lập class)/`aria-expanded=true`/focus-visible (thật bằng `page.keyboard.press('Tab')`) trên
  cả nền sáng lẫn nền tối — xác nhận: rest không còn khung/nền nào, icon/chữ vẫn đọc rõ nhờ
  shadow; hover chỉ thấy nền mờ tròn/chữ nhật xuất hiện, không có viền cứng; focus-visible có
  outline trắng + halo đen rõ ràng; aria-expanded giữ nền khi popover mở.

**Cách test cho user (khác gì so với "dark glass pill" lần 2 — để dễ so sánh):**
1. `npm run dev`, đăng nhập, mở Dashboard desktop (≥1000px), nhìn card gộp góc chứa
   Home/Space-switcher/Settings.
2. **Trạng thái nghỉ (không hover)**: khác biệt rõ nhất so với bản trước — giờ KHÔNG còn thấy viền
   hay khối nền đen mờ quanh icon/pill nữa, chỉ thấy icon trắng + tên Space trắng "nổi tự do" trên
   ảnh nền, không có khung bao quanh nào cả (nhờ đổ bóng làm chữ/icon vẫn đọc rõ dù không có nền).
3. **Di chuột qua từng nút** Home/Settings — quan sát: nền tròn mờ đen xuất hiện MƯỢT (transition)
   kèm icon phóng to nhẹ (~5%), biến mất ngay khi rời chuột. Không có viền/border xuất hiện ở bất
   kỳ thời điểm nào.
4. **Di chuột qua Space-switcher** — nền chữ nhật mờ đen xuất hiện quanh cả pill, KHÔNG phóng to
   (khác 2 nút icon, để tránh giật thanh ngang).
5. **Bấm mở dropdown Space-switcher** — nền mờ phải giữ nguyên (như đang hover) chừng nào dropdown
   còn mở, kể cả khi di chuột ra chỗ khác.
6. **Test trên cả ảnh nền sáng lẫn tối** (đổi ảnh nền qua Settings) — icon/chữ phải đọc rõ ở cả 2
   trường hợp nhờ double-shadow, không bị "chìm" vào nền sáng.
7. Bấm phím Tab điều hướng bàn phím tới các nút này — xác nhận thấy outline trắng rõ + viền đen mờ
   bao ngoài (không lẫn với nền ảnh sáng).

---

## Tinh chỉnh bố cục hàng nav — tên Space "trôi nổi" giữa Home/Settings (2026-07-08, ✅ Xong)

Khác 3 lần sửa style ở trên (chỉ đổi màu/nền/shadow) — lần này là vấn đề **layout/composition**:
`SpaceSwitcher` cũ có `flex-1` (root) + trigger `w-full justify-center` nên chiếm hết khoảng trống
còn lại giữa Home và Settings, khiến tên Space tự canh giữa trong vùng khổng lồ đó → nhìn "trống
trải, trôi nổi", không neo vào đâu. `uiux` đề xuất, user xác nhận ("ok thử xem").

**Đã áp dụng (3 điểm chạm):**
1. `src/components/DashboardCorner.tsx` (`DashboardCornerNav`) — bọc Home + `<SpaceSwitcher>` vào 1
   wrapper `flex min-w-0 items-center gap-1.5` (chỉ thêm `flex-1` khi `!compact`, desktop); Settings
   đứng riêng ngoài wrapper, vẫn là sibling.
2. `src/features/spaces/SpaceSwitcher.tsx` — root div bỏ `flex-1`, chỉ còn `min-w-0`. Trigger button
   thêm `max-w-[200px]` không điều kiện breakpoint (cả 2 nhánh class, mặc định lẫn `onPhoto`).
3. Không sửa `DashboardCornerBlock.tsx`/`DashboardCorner.tsx` hàng ngoài — `justify-between`
   (desktop `#dashboard-corner-nav`) và `justify-center` (mobile compact) tự cho kết quả đúng.

**Đã build/test:** `npx tsc --noEmit`, `npm run build`, `npx vitest run` (79/79) — pass hết.

**Vấn đề phát sinh khi tự QA bằng mockup (2026-07-08) — đang CHỜ user xác nhận trước khi áp dụng
tiếp, chưa sửa code:**

Bước sửa cùng lượt, spec gốc bảo "bỏ `w-full`" ở trigger button (để nó không tự giãn hết `flex-1`
cũ của root). Dựng mockup HTML tĩnh bằng CSS build thật + đo qua Playwright phát hiện: bỏ hẳn
`w-full` làm trigger button **không còn co theo chiều rộng thật của div cha** khi khối bị resize
hẹp (free-form layout, không có min-width clamp cho cột — xem `src/layout/AppLayout.tsx`, cột có
thể kéo hẹp tới ~200px thực tế). Nguyên nhân kỹ thuật: button có `display:flex` (Tailwind class
`flex`) → tự lập block-formatting-context riêng → `width:auto` tính theo shrink-to-fit dựa trên
max-content CỦA CHÍNH BUTTON (bị chặn trần bởi `max-w-[200px]`), KHÔNG kế thừa chiều rộng đã bị
flex-shrink của div cha (`min-w-0`) như một block `<div>` bình thường vẫn làm. Đo thực tế bằng
Playwright ở card 200px: div cha co đúng còn 100.875px, nhưng button vẫn giữ nguyên 200px (=trần
`max-w`), tràn lố tới 288.6px — đè lên cả nút Settings lẫn tràn ra ngoài card. Screenshot xác nhận
trực quan: chữ tên Space đè lên icon bánh răng Settings.

**Đề xuất sửa:** giữ lại `w-full` ở trigger button (cả 2 nhánh, cùng `max-w-[200px]` đã thêm) —
KHÔNG bỏ như spec gốc. Đã verify bằng mockup bổ sung (case card rộng 420px tên ngắn, card hẹp
200px tên dài): kết hợp `w-full max-w-[200px]` cho đúng cả 2 chiều — card rộng thì button vẫn
hugs-content (không giãn hết cỡ, không tái diễn bug "trôi nổi" gốc, vì root div không còn
`flex-1`); card hẹp thì button co đúng theo div cha đã bị flex-shrink, label thật sự ellipsis, không
đè Settings.

**Quyết định cuối (2026-07-08, đã user xác nhận + áp dụng vào code thật):** giữ `w-full
max-w-[200px]` trên trigger button ở CẢ 2 nhánh class (`onPhoto` và mặc định) trong
`src/features/spaces/SpaceSwitcher.tsx` — sai khác có chủ đích so với spec gốc ("bỏ hẳn `w-full`").
Lý do: `w-full` không còn gây bug "trôi nổi" gốc (nguyên nhân gốc đã bị triệt từ bước 2 ở trên — bỏ
`flex-1` trên root div của `SpaceSwitcher` — nên `w-full` giờ chỉ co giãn theo root `min-w-0` chứ
không phải theo khoảng trống thừa của hàng nav); ngược lại BỎ `w-full` mới tạo ra bug mới nghiêm
trọng hơn — button `display:flex` tự lập block-formatting-context, `width:auto` tính theo
shrink-to-fit/max-content của chính nó (bị chặn trần bởi `max-w-[200px]`) thay vì kế thừa chiều
rộng đã bị flex-shrink của div cha, nên ở card hẹp (~200px) button giữ nguyên bề rộng tối đa
200px và tràn đè lên nút Settings. Giữ `w-full` khắc phục triệt để: card hẹp thì co đúng theo cha
(ellipsis hoạt động, không đè Settings), card rộng vẫn hugs-content nhờ root không còn `flex-1`.
Đã build/test lại sau khi áp dụng: `npx tsc --noEmit` sạch, `npm run build` pass, `npx vitest run`
79/79 pass.

**File mockup/script dùng để verify (scratchpad, không commit):**
`nav-mockup/mockup.html` + `nav-mockup/shot.mjs` (Playwright, đo `getBoundingClientRect` +
screenshot từng case A–F) trong thư mục scratchpad phiên làm việc.

**Cách test (thủ công trên UI thật):**
1. `npm run dev`, mở app, đăng nhập, vào Dashboard.
2. Đặt 1 Space có tên dài (vd "Không gian làm việc nhóm Marketing Q3") làm Space hiện tại.
3. Ở độ rộng cửa sổ desktop bình thường (card/hàng nav rộng): quan sát tên Space trong
   Space-switcher không giãn chiếm hết khoảng trống giữa Home và Settings — chỉ hugs-content
   (rộng vừa đủ chữ, tối đa 200px), có ellipsis (`...`) nếu tên vượt 200px.
4. Kéo thu hẹp cột chứa khối điều hướng (free-form layout, kéo resize) xuống rất hẹp (~200px hoặc
   hẹp hơn): xác nhận Space-switcher co lại đúng theo bề rộng cột, KHÔNG tràn ra ngoài, KHÔNG đè
   lên icon Settings bên phải. Label tên Space tự ellipsis khi không đủ chỗ.
5. Test cả 2 theme (có ảnh nền / không ảnh nền) vì 2 nhánh class (`onPhoto`/mặc định) đều đã sửa.
6. Test cả mobile viewport (≤639px, compact top-bar) — hàng nav dùng `justify-center`, xác nhận
   không có gì bất thường (không thuộc diện sửa lần này nhưng nên soi qua vì dùng chung component).

**Đợt 1b — Icon Share2 lạc tông + tăng max-width tên Space (2026-07-08, ✅ Xong).** Sau khi lên
bản thật với Space chung "Chi tiêu gia đình Kino", user chụp ảnh phát hiện 2 vấn đề còn sót từ Đợt
1:

1. **Icon `Share2` (đánh dấu space chung) lạc tông màu** — đúng câu hỏi mở `uiux` từng nêu lúc
   thiết kế "ghost control" (Đợt 1, biến thể lần 3): icon này vẫn giữ `text-[var(--accent)]` (tím
   brand) trong khi Home/Settings/chevron/tên Space đã đổi trắng + double drop-shadow. Nhìn ảnh
   thật, icon tím nổi trên nền ảnh trông lạc quẻ. Fix: trong `src/features/spaces/SpaceSwitcher.tsx`,
   icon `Share2` của TRIGGER button (dòng hiển thị space hiện tại, không phải icon trong từng dòng
   dropdown — dropdown luôn nằm trên `space-menu-surface` themed, không lỗi tông) đổi màu theo
   `onPhoto`: `onPhoto` → `text-white` + double drop-shadow y hệt Home/Settings; mặc định (không
   ảnh nền) → giữ nguyên `text-[var(--accent)]` như cũ (đúng, không lỗi tông ở biến thể này).
2. **Tên Space bị cắt quá sớm** — `max-w-[200px]` (thêm ở Đợt 1, bước "verify lại bố cục cụm
   Home+Switcher") quá chật cho tên dài thật ("Chi tiêu gia đình Kino" = 22 ký tự). Tăng lên
   `max-w-[280px]` ở CẢ 2 nhánh class trigger (`onPhoto` và mặc định) — giữ nguyên cơ chế `w-full`
   đi kèm (đã verify đúng ở Đợt 1, không đổi).

**Verify bằng mockup Playwright** (tái tạo đúng markup/class thật, dùng đúng tên "Chi tiêu gia đình
Kino", scratchpad phiên làm việc, không commit) — đo `getBoundingClientRect` + `scrollWidth` 3 case:
- **Case A** (onPhoto, nav row ≈420px — xấp xỉ cột `settings` mặc định 32% ở viewport desktop
  1440px, xem tính toán bên dưới): trigger rộng 194.3px (hugs-content, dưới trần 280px), label
  không bị ellipsis (`scrollWidth === clientWidth`) — tên hiện đủ. Icon `Share2` màu trắng, đồng
  tông Home/Settings.
- **Case B** (onPhoto, nav row 210px — resize hẹp): trigger co xuống 106px, label ellipsis đúng
  (hiện "Chi tiê..." — không tràn, không đè icon Settings).
- **Case C** (mặc định, không ảnh nền, nav row 420px): trigger 196.3px, không ellipsis, icon
  `Share2` vẫn giữ `--accent` (đúng, biến thể này không lỗi tông).

**Số đo cột nav thật (để user hiểu giới hạn thực tế):** cột `settings` (chứa hàng nav) mặc định
rộng 32% (`colWidths: [32, 36, 32]`, `src/state/seed.ts`). Với `#dashboard` có `p-3.5` (14px mỗi
bên) và `#cols-wrap` có `gap-3` (12px × 2 khoảng giữa 3 cột, cộng thêm ngoài basis% — xem comment
trong `AppLayout.tsx` — nên cột co lại theo tỉ lệ để bù phần gap tràn), ở viewport desktop 1440px:
cột settings ≈ 444px → trừ padding hàng nav `px-[9px]` (`DashboardCornerBlock.tsx`) ≈ 426px nav-row
width — gần khớp Case A (420px). Ở độ rộng này, tên "Chi tiêu gia đình Kino" hiện đủ, KHÔNG bị cắt
(còn dư ~230px chưa dùng tới trần 280px). Chỉ khi user tự kéo resize cột nav xuống rất hẹp
(~210px trở xuống, như Case B) mới thấy ellipsis — đúng hành vi mong muốn, không phải bug.

**File mockup/script (scratchpad, không commit):** `nav-mockup2/mockup.html` + `nav-mockup2/shot.mjs`
+ `nav-mockup2/zoom.mjs` trong thư mục scratchpad phiên làm việc.

**Cách test (thủ công trên UI thật):**
1. `npm run dev`, mở app, đăng nhập, chuyển sang Space chung tên dài (vd "Chi tiêu gia đình Kino").
2. Ở độ rộng cửa sổ desktop bình thường (chưa resize cột): quan sát icon `Share2` cạnh tên Space
   trong hàng nav (nổi trên ảnh nền Home) — phải màu TRẮNG, cùng tông Home/Settings/chevron, không
   còn tím lạc quẻ. Tên Space hiện đủ "Chi tiêu gia đình Kino", không có `...`.
3. Kéo resize cột chứa khối điều hướng xuống hẹp (~200-220px): tên Space tự ellipsis, không tràn
   đè icon Settings bên phải (không tái diễn bug cũ).
4. Đổi sang Space cá nhân/không ảnh nền (widget không nổi trên ảnh) hoặc mở Settings modal xem
   card thường: icon `Share2` (nếu có space chung trong dropdown) vẫn giữ tím `--accent` — đúng,
   không phải diện sửa lần này.
5. `npx tsc --noEmit`, `npm run build`, `npx vitest run` (79/79) — đã chạy lại, pass toàn bộ.

---

## Đợt 2 — Ô nhập log nhanh trên desktop (2026-07-08, ✅ Xong)

Sau khi dùng thử bản thật, user phản hồi: khối "Nhật ký nhanh" trên desktop không có chỗ nhập —
phải cầm điện thoại lên mở tab "Trò chuyện" mới gõ được, bất tiện khi đang ngồi máy tính. Bổ sung
1 hàng nhập liệu luôn hiện trong `LogsBlock.tsx` (không phải modal/toggle).

- [x] `src/features/logs/LogsBlock.tsx`: thêm hàng `logs-compose` (`flex items-center gap-2
      border-b border-[color:var(--border-hairline)] px-4 py-2.5`, style tham khảo đúng
      `.notes-toolbar` của `NotesBlock`) nằm giữa `block-head` (do `BlockShell` tự render) và
      `block-body` — nằm trong `children` nên tự ẩn theo `collapsed` (icon mắt), không cần code
      thêm logic ẩn riêng (đã xác nhận qua `BlockShell.tsx`: `children` chỉ render khi
      `!collapsed`).
- [x] 1 `<input type="text">` (state cục bộ `composeText`, KHÔNG dùng `state.ui`, ephemeral —
      cùng tinh thần với `sortBy` cục bộ đã có) + 1 nút Gửi icon-only (`SendHorizontal`, 30×30px,
      `bg-[var(--accent)] text-white`, `disabled` khi `content.trim()` rỗng, `opacity-40` +
      `cursor-not-allowed` khi disabled — khớp pattern nút "Xoá (N)" đã có sẵn trong chính file).
- [x] Hành vi: Enter hoặc click Gửi → dispatch `LOG_CREATE` với `content: raw.trim()`,
      `createdBy: currentUserId ?? undefined` → `setComposeText('')` → gọi `.focus()` lại vào
      input qua `composeInputRef` để giữ nguyên focus, gõ liên tục nhiều dòng không cần click lại
      vào ô. Nút Gửi có `onMouseDown={(e) => e.preventDefault()}` (đúng kỹ thuật đã dùng ở
      `MobileChatScreen.tsx`) để click chuột không làm input mất focus trước khi `onClick` chạy.
      KHÔNG có cơ chế tiền tố `/task`/`/note` như ô chat mobile — ô này chỉ tạo Log.
- [x] Chỉ hiện desktop: `max-sm:hidden` trên hàng `logs-compose` (đúng breakpoint đã dùng sẵn ở
      chip tên người tạo trong `LogRow`).
- [x] A11y: input `aria-label="Nội dung nhật ký mới"`; nút Gửi `aria-label="Gửi log"` +
      `title="Gửi log (Enter)"` + `aria-disabled` khi rỗng.
- [x] Sửa hint empty-state: "Gõ nhanh 1 dòng qua tab Trò chuyện trên điện thoại để bắt đầu." →
      "Nhập ở ô phía trên để ghi log (desktop), hoặc gõ nhanh qua tab Trò chuyện trên điện thoại."
- [x] Không đụng gì tới chế độ bulk-select (`isSelecting`/`selectedIds`) — 2 luồng độc lập, không
      có điểm giao nhau trong code (hàng compose đứng trước `block-body`, không tương tác với
      `LogRow`).
- [x] `npx tsc --noEmit`, `npm run build`, `npx vitest run` — pass hết (**79/79 test, không đổi
      số lượng**).

### Quyết định phát sinh khi code (2026-07-08)

**Không thêm test component mới cho hàng compose này** (dù task gốc gợi ý "test dispatch
`LOG_CREATE` khi Enter/click Gửi, test disabled khi rỗng"). Lý do: đã kiểm tra `package.json` —
dự án **không có `@testing-library/react`/`@testing-library/user-event`** trong devDependencies,
chỉ có `vitest` + `jsdom` (environment) dùng để unit-test hàm thuần (`reducers.test.ts`,
`normalize.test.ts`...), không có tiền lệ render component React nào để bấm/gõ mô phỏng trong bộ
test hiện tại (`LogsBlock`/`NotesBlock`/`MobileChatScreen` đều chưa có test riêng, xem ghi chú
tương tự ở Phần 4). Cài thêm thư viện test mới chỉ để cover 1 hàng UI nhỏ là mở rộng phạm vi ngoài
yêu cầu ("việc vừa phải") — nên dừng lại báo cho user thay vì tự quyết định thêm dependency mới.
Rủi ro thực tế thấp: hàng compose chỉ gọi lại đúng `dispatch({ type: 'LOG_CREATE', ... })` đã được
test đầy đủ ở tầng reducer (`reducers.test.ts` — trim, `createdBy` có/không, no-op khi rỗng), phần
mới thêm chỉ là 1 lớp UI mỏng (input state + gọi hàm) không có logic nghiệp vụ riêng để kiểm.

Nếu user muốn có test component thật cho các UI tương tác trong tương lai (không riêng gì log),
nên coi là 1 hạng mục hạ tầng test riêng (cài `@testing-library/react`, viết `setupFiles`, quyết
định phạm vi coverage) — không lồng vào 1 tính năng nhỏ.

### Cách test (cho user)

1. `npx tsc --noEmit` → pass sạch (đã chạy).
2. `npm run build` → build thành công (đã chạy, chỉ cảnh báo chunk-size cũ, không liên quan).
3. `npx vitest run` → 79/79 test pass (không đổi số lượng — xem lý do không thêm test ở mục trên).
4. Kiểm tra thủ công trên UI thật (`npm run dev`, đăng nhập, mở Dashboard desktop ≥1000px):
   - Khối "Nhật ký nhanh" giờ có 1 hàng ô nhập + nút gửi (icon mũi tên) ngay dưới thanh tiêu đề,
     phía trên danh sách log.
   - Gõ 1 dòng bất kỳ vào ô, nhấn Enter → log mới xuất hiện ngay trong danh sách bên dưới, ô nhập
     tự xoá trắng NHƯNG con trỏ vẫn đang nhấp nháy trong ô (không cần click lại) → gõ tiếp dòng thứ
     2, Enter → xác nhận tạo liên tục được nhiều dòng mà không phải bấm chuột lại vào ô giữa các
     lần.
   - Gõ 1 dòng, thử bấm bằng CHUỘT vào nút Gửi (thay vì Enter) → xác nhận log vẫn được tạo, ô nhập
     vẫn giữ focus sau khi bấm (con trỏ không biến mất khỏi ô).
   - Để ô nhập trống (không gõ gì) → quan sát nút Gửi mờ đi (opacity thấp) và không bấm được
     (`cursor: not-allowed`).
   - Bấm icon con mắt ở góc khối (ẩn nội dung khối) → xác nhận cả hàng ô nhập lẫn danh sách log đều
     biến mất cùng lúc (không phải chỉ danh sách ẩn còn ô nhập vẫn lộ ra).
   - Thu nhỏ trình duyệt xuống viewport mobile (≤639px) hoặc mở DevTools responsive mode → xác nhận
     KHÔNG thấy ô nhập này ở khối Nhật ký trong tab "Chi tiết" (mobile vẫn dùng đúng tab "Trò
     chuyện" để nhập log như trước, không đổi gì).

---

## Đợt 3 — Sửa mobile compact top-bar: tên Space vẫn bị cắt + dropdown lệch vị trí (2026-07-08, ✅ Xong)

User chụp ảnh thật trên điện thoại (mobile compact top-bar, Space chung "Chi tiêu gia đình Kino"),
báo 2 vấn đề còn sót lại từ chuỗi tinh chỉnh "Đợt 1/1b" ở trên (chuỗi đó chỉ sửa nhánh desktop
`max-w-[200px]→[280px]`, KHÔNG đụng tới rule riêng cho mobile compact `max-sm:[&_span]:max-w-*`).

### Vấn đề 1 — Tên Space vẫn bị cắt trên mobile

**Root cause:** `SpaceSwitcher.tsx` có 1 rule CSS riêng chỉ áp dụng ở breakpoint `max-sm`
(`max-sm:[&_span]:max-w-[90px]`, xuất hiện ở cả 2 nhánh class trigger — `onPhoto` và mặc định).
Rule này giới hạn cứng `<span>` chứa tên Space chỉ 90px trên mobile, thấp hơn nhiều so với
`max-w-[280px]` chung (áp cho cả trigger BUTTON, không phải riêng span) mà Đợt 1b mới tăng —
`max-sm:` override ghi đè giới hạn chặt hơn ở đúng breakpoint mobile mà lượt sửa trước không đụng
tới.

**Đo thật bằng harness Playwright** (mockup HTML tái tạo đúng DOM `DashboardCorner`/
`DashboardCornerNav`/`SpaceSwitcher` thật + CSS build thật, viewport 390×844 — iPhone 12/13/14 CSS
px thật, không đoán): tên "Chi tiêu gia đình Kino" ở đúng font trigger (`0.8125rem font-semibold`)
rộng tự nhiên **134.3px** khi không giới hạn. Ở `max-w-90px` cũ, tên bị cắt còn ~"Chi tiêu gia
đình Ki...". Test `max-w-180px`: tên hiện đủ (134.3 < 180, không ellipsis), trigger button rộng
193.3px, vẫn nằm gọn trong bar (group Switcher+Settings căn giữa nhờ `justify-center`, không tràn/
đè Settings, còn dư margin 2 bên ~77px mỗi bên).

**Fix:** tăng `max-sm:[&_span]:max-w-[90px]` → `max-sm:[&_span]:max-w-[180px]` ở CẢ 2 nhánh class
trigger trong `src/features/spaces/SpaceSwitcher.tsx`. Chọn 180px (không phải 200px) vì đã đủ dư
~46px so với tên thật đo được (134px), không cần rộng hơn để tránh trigger quá to trên bar hẹp
390px cạnh nút Settings 34px.

### Vấn đề 2 — Dropdown Space-switcher lệch vị trí trên mobile

**Điều tra loại trừ trước khi tìm đúng root cause:**
- `id="dashboard-corner-nav"` (thêm cho `DashboardCornerBlock.tsx`, desktop) KHÔNG tồn tại trong
  DOM ở nhánh mobile — `AppLayout.tsx` dùng 1 `return` duy nhất theo `isMobileBlocksOnly`
  (`if (isMobileBlocksOnly) { return <DashboardCorner compact /> ... } return <desktop tree>`),
  không render đồng thời 2 nhánh, nên fallback `getElementById('dashboard-corner-nav') ??
  getElementById('dashboard-corner')` trong `SpaceSwitcher.tsx` luôn đúng, trỏ về
  `#dashboard-corner` (thanh top-bar mobile) — KHÔNG phải nguyên nhân.
- Wrapper mới `<div className="flex min-w-0 items-center gap-1.5">` (từ Phần 5/Đợt 1, bọc
  Home+Switcher) không đổi kích thước/rect của `#dashboard-corner` (root bar) — đã đo xác nhận rect
  bar vẫn `x:0 width:390` (đúng bằng viewport) như thiết kế cũ, KHÔNG phải nguyên nhân.
- `justify-center` trên `#dashboard-corner` (mobile compact) đã tồn tại từ TRƯỚC cả Phần 5/Đợt 1
  (xác nhận qua `git show 9c7baa1 -- src/components/DashboardCorner.tsx`, code cũ đã có
  `compact ? 'w-full justify-center ...' : ...`) — không phải thay đổi mới, không phải root cause
  của bug lệch.

**Root cause thật (đo bằng floating-ui thật — cùng engine Radix Popper dùng bên dưới, load qua UMD
local trong harness, không đoán math tay):** `Popover.Content` truyền `collisionPadding={8}` cố
định (không phân biệt `compact`). Trên mobile, anchor định vị dropdown là `#dashboard-corner` —
chính thanh top-bar, rộng ĐÚNG BẰNG viewport (390px ở iPhone 390px). `size` middleware của Radix set
width dropdown = width anchor = 390px (full-bleed, đúng ý đồ thiết kế). Nhưng `collisionPadding={8}`
áp cho cả 4 cạnh khiến `shift` middleware (mặc định `avoidCollisions=true`) coi "vùng khả dụng" chỉ
còn `390 - 16 = 374px`, hẹp hơn width dropdown (390px) → shift đẩy dropdown dịch phải
**+8px** (từ `x:0` → `x:8`) để né padding trái, nhưng width KHÔNG co theo → dropdown tràn
**+8px** ra ngoài mép phải màn hình (`right: 398 > viewport 390`). Kết quả: dropdown không còn
flush 2 mép với thanh top-bar (vốn full-bleed thật) — lệch phải 8px, mép trái hở, mép phải bị cắt.
Đã verify bằng screenshot Playwright thật (trước/sau fix) — trước fix card dropdown rõ ràng lệch
phải, mép phải bị viewport cắt mất góc bo; sau fix card flush khít 2 mép, đúng bằng thanh top-bar.

**Fix:** đổi `collisionPadding={8}` → `collisionPadding={compact ? { top: 8, bottom: 8, left: 0,
right: 0 } : 8}` trong `src/features/spaces/SpaceSwitcher.tsx`. Lý do zero padding NGANG riêng cho
compact: anchor mobile vốn LUÔN nằm trọn trong viewport (chính là bar đang hiển thị thật), không có
tình huống cần né mép ngang — giữ padding DỌC=8 để middleware `flip` vẫn hoạt động (đổi sang mở lên
trên nếu thiếu chỗ bên dưới). Desktop giữ nguyên `collisionPadding={8}` đều 4 cạnh (anchor hẹp hơn
viewport nhiều ở mọi trường hợp thực tế, không gặp bug này).

**Kết luận về nguồn gốc bug:** CẢ 2 vấn đề đều KHÔNG phải regression mới từ lượt "gộp cụm
Home+Switcher" (Phần 5) — đã xác minh qua `git show`/đọc code trước-sau: rule `max-w-[90px]` và
`collisionPadding={8}` cố định đều có từ thời Radix migration (2026-07-07), chỉ đơn giản là chưa
từng được kiểm ở đúng viewport điện thoại thật (390px) nên chưa lộ ra.

**File mockup/harness dùng để verify (scratchpad phiên làm việc, không commit):** HTML tái tạo
đúng DOM `DashboardCorner`/`DashboardCornerNav`/`SpaceSwitcher` (mobile compact) + CSS build thật
(`dist/assets/index-*.css`) + `@floating-ui/core`+`@floating-ui/dom` UMD thật (load local từ
`node_modules`, đúng engine Radix Popper dùng) để `computePosition` y hệt runtime thật — không dùng
công thức tay. Đo bằng Playwright ở viewport 390×844 (iPhone), screenshot trước/sau fix.

### Cách test Đợt 3 (cho user)

1. `npx tsc --noEmit`, `npm run build`, `npx vitest run` (79/79) — đã chạy lại, pass toàn bộ.
2. `npm run dev`, mở app trên điện thoại thật (hoặc DevTools responsive mode, chọn preset iPhone
   12/13/14 — 390px width, KHÔNG dùng cửa sổ desktop resize hẹp vì layout có thể khác đôi chút),
   đăng nhập, chuyển sang Space chung tên dài (vd "Chi tiêu gia đình Kino").
3. Quan sát top-bar mobile: tên Space hiện đủ "Chi tiêu gia đình Kino", KHÔNG còn bị cắt thành
   "Chi tiêu gia đình Ki...".
4. Bấm vào nút Space-switcher để mở dropdown — quan sát dropdown card mở ra khít 2 mép trái/phải
   với chính thanh top-bar phía trên (full-bleed, không lệch phải, không bị cắt góc bo bên phải).
5. Thử lặp lại ở tên Space rất dài (>180px khi render) — xác nhận vẫn ellipsis đúng (không tràn đè
   icon Settings), dropdown vẫn mở khít 2 mép như bước 4 (không phụ thuộc độ dài tên, vì dropdown
   luôn ăn theo width thanh top-bar, không theo width trigger button).
6. Test lại cả desktop (không ảnh nền + có ảnh nền `onPhoto`) — xác nhận dropdown Space-switcher vẫn
   định vị đúng như trước (không bị ảnh hưởng bởi thay đổi `collisionPadding` chỉ áp riêng
   `compact`).

---

## Đợt 4 — Audit toàn app: text bị cắt cứng theo ký tự JS thay vì theo chỗ trống thật (2026-07-08, ✅ Xong)

User chụp ảnh khối "Nhật ký nhanh" trên desktop — badge tên người tạo bị cắt thành "Thao An Le
Nguy..." dù khối còn nhiều chỗ trống, đặt nguyên tắc áp dụng toàn app: **chỉ cắt khi khung chứa
thật sự không đủ chỗ, không bao giờ cắt cứng bằng số ký tự cố định bất kể ngữ cảnh.**

### Root cause (đúng khối bị báo)

`src/utils/memberColors.ts` → `getMemberDisplayName(userId, members, maxLen = 15)` cắt chuỗi
**bằng JavaScript** (`name.slice(0, maxLen)`), không phải CSS `text-overflow: ellipsis` — cắt cứng
đúng `maxLen` ký tự bất kể khối đang rộng hay hẹp thật. `LogsBlock.tsx` (`getCreatorInfo()`) gọi
hàm này **không truyền `maxLen`** → dùng mặc định 15 (giá trị dành cho chỗ chật như dot
tooltip/meta note nhỏ), trong khi badge tên người tạo nằm trong 1 hàng flex khá rộng, thừa chỗ hiện
đủ tên. Đây đúng là kiểu bug "cắt cứng theo ký tự, không biết ngữ cảnh" mà user mô tả.

### Audit toàn bộ (grep `getMemberDisplayName`, `.slice(0,`/`.substring(0,`, `max-w-[...]` gắn
text hiển thị, rà lại các file đụng trong phiên hôm nay)

**Đã sửa (10 chỗ):**

1. `LogsBlock.tsx` (`getCreatorInfo`) — bỏ cắt cứng (`maxLen: Infinity`), badge creator đổi sang
   CSS-based: bỏ `flex-none`, thêm `min-w-0 max-w-[45%] overflow-hidden text-ellipsis
   whitespace-nowrap` + `title={creatorName}`. Giờ chỉ ellipsis khi tên thật sự vượt 45% hàng.
2. `NotesBlock.tsx` (`getNoteCreatorInfo`) — cùng bug (không truyền `maxLen`, mặc định 15). Bỏ cắt
   cứng.
3. `NoteCard.tsx` (footer tên người tạo) — đổi span sang `min-w-0 flex-1 truncate` +
   `title={creatorInfo.name}` (footer chỉ có avatar+tên, không cạnh tranh chỗ với nội dung khác
   nên cho chiếm hết phần dư của hàng thay vì cap %).
4. `TasksBlock.tsx` (`memberDotName` badge, hiển thị "việc do người khác tạo") — trước dùng
   `maxLen=40` (cắt cứng, chỉ đỡ hơn 15 chứ vẫn sai nguyên tắc). Đổi `Infinity` + CSS
   `max-w-[45%] overflow-hidden text-ellipsis whitespace-nowrap` + `title`.
5. `TasksBlock.tsx` (`assignees` — tên hiển thị qua `MemberAvatar`, chỉ dùng làm initial-letter +
   `title` tooltip gốc trình duyệt, KHÔNG có giới hạn bề rộng thật nào) — `maxLen=20` không có lý
   do tồn tại, đổi `Infinity`.
6. `TaskFormModal.tsx` (`AssigneeMemberRow`, dòng member trong popover) — `maxLen=40` redundant vì
   dòng hiển thị ĐÃ có CSS `truncate` riêng (dòng dưới) xử lý overflow thật; JS cắt trước chỉ làm
   hẹp thêm không cần thiết. Đổi `Infinity`, thêm `title={name}` còn thiếu trên span truncate.
7. `TaskFormModal.tsx` (`StackedAvatar` trên nút trigger) — cũng chỉ dùng cho initial+tooltip, không
   có bề rộng thật. Đổi `maxLen=40` → `Infinity`.
8. `MobileChatScreen.tsx` (chip tên người gửi trong bubble chat) — trước `maxLen=40` (JS cắt cứng,
   không CSS, không `title`). Đổi `Infinity` + thêm `max-w-full overflow-hidden text-ellipsis
   whitespace-nowrap` (ăn theo `max-w-[80%]` có sẵn của bubble cha) + `title={memberName}`.
9. `SpaceInviteModal.tsx` (danh sách thành viên, tab Members) — **bug khác nhưng cùng họ:** span
   tên đã CSS-ellipsis đúng cách từ trước, nhưng `title` lại trỏ vào `m.userId` (UUID nội bộ) thay
   vì `label` (tên/email hiển thị) — hover vào tên bị cắt thấy UUID vô nghĩa thay vì tên đầy đủ.
   Sửa `title={label}`.
10. `SpaceSwitcher.tsx` (2 chỗ: label tên Space trên nút trigger + tên Space trong dropdown item) —
    CSS ellipsis đã đúng từ trước nhưng thiếu hẳn `title`, hover không thấy được tên đầy đủ khi bị
    cắt. Thêm `title={currentSpace?.name}` và `title={space.name}`.
11. `HabitsBlock.tsx` (`habit-title` span) — CSS ellipsis đúng nhưng thiếu `title`. Thêm
    `title={habit.title}`.

**Đã kiểm tra, xác nhận KHÔNG cần sửa (kèm lý do):**

- `SpaceSwitcher.tsx` — rule `max-sm:[&_span]:max-w-[180px]` (Đợt 3 vừa sửa hôm nay): CHỈ áp dụng
  ở breakpoint `max-sm` (≤639px, đúng "width thực sự nhỏ" mà user cho phép cắt), desktop không bị
  giới hạn gì thêm — đúng nguyên tắc, giữ nguyên.
- `DashboardCornerBlock.tsx` (quote động lực, `line-clamp-2`) — text trang trí do app tạo (không
  phải danh tính/dữ liệu người dùng cần đọc đầy đủ để thao tác), `line-clamp` co giãn thật theo
  chiều rộng khối (không phải số ký tự cố định) — đúng nguyên tắc CSS-based, không cần `title` cho
  1 câu quote trang trí.
- `AppLayout.tsx` (label khối trong accordion mobile, vd "Việc cần làm"/"Ghi chú"/"Nhật ký") — đã
  có `truncate` CSS sẵn, nhưng đây là 3 chuỗi **cố định do app định nghĩa** (`MOBILE_ACCORDION_DEFS`,
  không phải dữ liệu người dùng nhập), độ dài luôn ngắn/biết trước, không có rủi ro thực tế bị cắt —
  không thêm `title` để tránh phình thêm boilerplate không cần thiết.
- `TaskFormModal.tsx` (preview dòng đầu nội dung note, `min-w-0 flex-1 truncate`) — đây là "peek"
  1 dòng để gợi ý đã có nội dung, không phải nơi duy nhất xem được nội dung đầy đủ (bấm vào mở
  ngay textarea đầy đủ ngay bên dưới) — không cần `title` vì có cách xem đầy đủ khác rõ ràng hơn.
- `LogsBlock.tsx` (hàm `truncate()` cục bộ cắt `log.content` cho `aria-label`/`title` của nút
  xoá/checkbox) — mục đích khác hẳn (rút gọn text cho screen-reader/tooltip mô tả HÀNH ĐỘNG, không
  phải hiển thị chính nội dung cho mắt đọc), giữ nguyên.
- Mọi `.slice(0, N)` khác tìm được qua grep (`toISOString().slice(0,10)` lấy ngày, cắt `userId` làm
  fallback label, giới hạn 30/75 bubble hiển thị, `TRIGGER_MAX_AVATARS`...) — không phải cắt TEXT
  hiển thị cho người dùng đọc, không thuộc phạm vi bug này.

### Nguyên tắc rút ra, áp dụng khi thêm chỗ hiển thị tên người mới trong tương lai

`getMemberDisplayName()` vẫn giữ tham số `maxLen` mặc định 15 (không đổi signature) — nhưng giờ
**không còn call site nào trong app dùng số cắt cứng nữa**, toàn bộ đã chuyển sang: hoặc `Infinity`
(chỗ chỉ dùng cho avatar-initial/tooltip gốc trình duyệt, không có bề rộng thật để cắt) hoặc
`Infinity` + CSS `truncate`/`text-ellipsis` thật (chỗ hiển thị text nhìn thấy được, để trình duyệt
tự quyết định cắt hay không dựa trên khung chứa thật). Chỗ nào thêm mới sau này nên theo đúng 2
nhánh này, không quay lại truyền số ký tự cố định.

### Cách test Đợt 4 (cho user)

1. `npx tsc --noEmit`, `npm run build`, `npx vitest run` — đã chạy lại, pass hết (79/79 test, không
   đổi số lượng — đây thuần là sửa CSS/text-truncate, không có logic reducer mới cần test).
2. `npm run dev`, đăng nhập, vào 1 Space chung có ≥1 thành viên khác có tên dài (vd "Thao An Le
   Nguyen ABC..."):
   - Khối **Nhật ký nhanh**: gõ 1 log qua tab Trò chuyện (mobile) từ tài khoản đó, mở lại desktop →
     badge tên người tạo hiện ĐẦY ĐỦ tên (không còn "Thao An Le Nguy..."), trừ khi thật sự resize
     khối rất hẹp mới thấy dấu "…" — hover vào badge thấy tooltip tên đầy đủ.
   - Khối **Ghi chú**: note do người khác tạo → góc dưới card hiện đầy đủ tên tương tự, hover thấy
     tooltip.
   - Khối **Việc cần làm**: việc do người khác tạo → badge tên hiện đầy đủ; việc có gán nhiều
     người (assignee) → hover vào avatar tròn thấy tooltip tên đầy đủ (không bị cắt ở 20 ký tự như
     trước).
   - Tab **Trò chuyện** mobile: bubble của người khác → tên phía trên bubble hiện đầy đủ, hover
     (hoặc long-press trên mobile thật nếu trình duyệt hỗ trợ) thấy tooltip.
   - Modal **Sửa việc** → mở popover "Giao cho" → danh sách thành viên hiện tên đầy đủ, không bị
     cắt ở 40 ký tự như trước với tên rất dài.
3. **Space-switcher**: đổi tên 1 Space thành tên dài (vd "Chi tiêu gia đình Kino mở rộng thêm chữ
   cho dài") → hover vào tên trên nút trigger (góc trên) và trong dropdown item → thấy tooltip tên
   đầy đủ dù phần hiển thị bị ellipsis.
4. **Thói quen**: đặt 1 thói quen tên dài, thu hẹp khối lại (kéo cột hẹp trên desktop) → tên bị
   ellipsis đúng lúc thật sự hẹp, hover thấy tooltip tên đầy đủ.
5. **Thành viên Space chung** (Settings Space → tab Members): hover vào tên/email 1 thành viên bị
   cắt → xác nhận tooltip hiện đúng tên/email đầy đủ (KHÔNG còn hiện UUID nội bộ như trước).

---

## Ghi chú chung

- Mỗi phần xong: chạy `npx tsc --noEmit` + `npm run build` (+ `npx vitest run` nếu có test liên
  quan) trước khi đánh dấu ✅, và luôn viết hướng dẫn test cụ thể cho user trong file này lẫn
  trong câu trả lời cuối lượt đó.
- Câu hỏi mở/quyết định phát sinh trong lúc code → ghi thẳng vào đây kèm ngày, không chỉ nói
  miệng.
- Không tự ý nhảy cóc sang phần sau nếu phần trước còn ⬜/🔶, trừ khi 2 phần không phụ thuộc nhau
  (Phần 5 có thể làm trước/sau/xen kẽ Phần 2-4, xem sơ đồ phụ thuộc ở đầu file).
