# Layout Dashboard riêng theo từng Space — Tiến độ triển khai

> Theo dõi tiến độ code thật cho `docs/features/layout-theo-space.md` mục **11 (KẾT LUẬN CUỐI)**
> — spec chính thức duy nhất. Mục 1-10 của tài liệu đó là lịch sử tranh luận đã đóng, không phải
> spec để code theo. Triển khai cuốn chiếu — 1 phần/lượt, cập nhật trạng thái ngay khi xong, dừng
> lại chờ xác nhận trước khi sang phần kế tiếp.

Quy ước trạng thái: `⬜ Chưa làm` / `🔶 Đang làm` / `✅ Xong` / `⛔ Bị chặn (ghi rõ lý do)`.

## Tổng quan các phần & phụ thuộc

```
Phần 1 (Data layer: types + reducer + normalize/fallback)
        │
        ▼
Phần 2 (Wiring UI: useDashboardLayout.ts + AppLayout.tsx/Splitter.tsx hint (mục 11.9)
        + SettingsModal.tsx nút "Khôi phục mặc định")
        │
        ▼
Phần 3 (Dọn dẹp — XOÁ hẳn 2 action cũ SETTINGS_SET_DASHBOARD_LAYOUT/
        SETTINGS_RESET_DASHBOARD_LAYOUT sau khi Phần 2 không còn dispatch, KHÔNG bắt buộc
        làm ngay — có thể để lại như dead-but-typed action nếu muốn giữ đường lùi tạm thời)
```

Phần 2 phụ thuộc hoàn toàn vào Phần 1 (cần đủ field/action/hàm fallback trước khi wire UI). Phần
3 là dọn dẹp, không bắt buộc phải làm ngay sau Phần 2 — có thể gộp vào Phần 2 nếu khi làm thấy đủ
tự tin xoá luôn (do dev Phần 2 tự quyết, ghi rõ nếu gộp).

---

## Phần 1 — Data layer (types + reducer + migration đọc-fallback), KHÔNG động UI

Trạng thái: ✅ Xong (2026-07-08)

### Quyết định tên field đã chọn (mục 11.6 giao quyền cho `dev`)

- **`Settings.dashboardColWidths: number[]`** — dùng chung mọi Space, thay cho tuple cứng
  `[number, number, number]` đề xuất trong spec. Lý do đổi: toàn bộ code hiện có
  (`dashboardLayoutUtils.ts`, `normalizeDashboardLayout` cũ) đều thao tác `colWidths` như
  `number[]` generic (map/reduce theo index, không có gì trong runtime ép cứng đúng 3 phần tử
  ngoài `defaultDashboardLayout()`) — ép kiểu tuple sẽ chỉ thêm ma sát cast ở nhiều nơi mà không
  tăng an toàn thực chất (độ dài 3 vẫn phải tự validate bằng logic, TypeScript không tự bắt được
  trường hợp mảng rỗng/sai độ dài đọc từ Supabase runtime). Không đổi bản chất quyết định (vẫn 1
  giá trị dùng chung, không khoá `spaceId`) — chỉ đổi kiểu khai báo.
- **`Settings.dashboardCols: Record<string, LayoutSlot[][]>`** — giữ đúng như spec đề xuất
  (map khoá theo `spaceId`).
- **Không gộp thành `Settings.dashboard = { colWidths, cols }`** — giữ 2 field rời cùng cấp với
  `dashboardLayout` cũ, nhất quán với cách đặt tên phẳng đã có trong `Settings` (không có object
  lồng nào khác trong `Settings` hiện tại ngoài các field vốn dĩ đã là object riêng như
  `homeBackground`/`homeQuotes`).
- Field đơn `Settings.dashboardLayout` **giữ nguyên, không xoá** — đổi vai trò thành fallback lịch
  sử, comment trong `types.ts` đã cập nhật lại cho khớp.

### Checklist

- [x] `src/types.ts` — thêm `dashboardColWidths: number[]` và `dashboardCols: Record<string,
      LayoutSlot[][]>` vào `Settings`; cập nhật comment `dashboardLayout` cũ (đổi vai trò fallback
      lịch sử, không còn "dùng chung mọi Space" đúng nghĩa cũ vì `cols` đã tách riêng).
- [x] `src/state/seed.ts` — `defaultSettings()` khởi tạo `dashboardColWidths:
      defaultDashboardLayout().colWidths`, `dashboardCols: {}`. `defaultDashboardLayout()` giữ
      nguyên (vẫn là nguồn default dùng chung cho cả field cũ lẫn 2 field mới).
- [x] `src/state/reducers/settings.ts` — thêm 3 action mới: `SETTINGS_SET_COL_WIDTHS` (payload
      `{ colWidths }`, không `spaceId`), `SETTINGS_SET_DASHBOARD_COLS` (payload `{ spaceId, cols
      }`, ghi đúng 1 entry), `SETTINGS_RESET_DASHBOARD_COLS` (payload `{ spaceId }`, reset đúng 1
      entry về `defaultDashboardLayout().cols`, **không đụng `colWidths`**, đúng AC-11.9). 2 action
      cũ `SETTINGS_SET_DASHBOARD_LAYOUT`/`SETTINGS_RESET_DASHBOARD_LAYOUT` **giữ nguyên, chưa xoá**
      — UI (`useDashboardLayout.ts`/`SettingsModal.tsx`) vẫn đang dispatch 2 action này, chỉ được
      xoá ở Phần 2 sau khi rewire xong (xem Phần 3).
- [x] `src/state/appReducer.ts` — thêm 3 action type mới vào `SETTINGS_ACTION_TYPES` (pattern
      giống các action settings khác, tự động route qua `settingsReducer`). Không cần đổi
      `IMPORT_DATA`/`ExportPayload` — `ExportPayload.settings: Settings` đã tự động export/import
      đúng 2 field mới vì nằm trong `Settings`.
- [x] `src/storage/normalize.ts`:
  - Factor logic validate `colWidths` (tổng ~100%, không outlier) ra hàm dùng chung
    `normalizeColWidths(raw, fallback)` — tái dùng cho cả `dashboardLayout.colWidths` legacy (qua
    `normalizeDashboardLayout`) lẫn `Settings.dashboardColWidths` mới.
  - Factor logic validate/migrate `cols` (structural check + `migrateTodaySettingsMerge` +
    patch-thiếu-`logs`) ra hàm dùng chung `normalizeCols(raw, colCount)` — tái dùng cho cả
    `dashboardLayout.cols` legacy lẫn từng entry trong `Settings.dashboardCols[spaceId]`.
    `migrateTodaySettingsMerge`/phần patch-logs (tách thành `patchMissingLogsBlock`) đổi chữ ký từ
    nhận `DashboardLayout` sang nhận/trả thẳng `LayoutSlot[][]` (không còn cần bọc/mở object
    `DashboardLayout` chỉ để đọc `.cols`).
  - `normalizeSettings()` tính thêm `dashboardColWidths` (fallback: giá trị đã lưu → giá trị đã
    chuẩn hoá của `dashboardLayout` cũ → default — copy 1:1, ĐÚNG lúc normalize, không phải
    đọc-fallback tại chỗ, vì là 1 giá trị đơn không có vấn đề thứ tự load nhiều Space) và
    `dashboardCols` (hàm mới `normalizeDashboardColsMap` — chỉ chuẩn hoá SHAPE từng entry, entry
    hỏng cấu trúc bị BỎ HẲN khỏi map thay vì thay bằng default, để không "khoá cứng" 1 Space vào
    default sớm hơn cần thiết).
  - Hàm mới `resolveDashboardCols(settings, spaceId): LayoutSlot[][]` (export) — thứ tự fallback
    đúng mục 3.1/11.4: `dashboardCols[spaceId]` → `dashboardLayout.cols` → `defaultDashboardLayout().cols`.
    Đây là hàm THUẦN, viết ở Phần 1 để unit-test độc lập được — **nơi gọi thực tế theo
    `currentSpaceId` sống (`useDashboardLayout.ts`) vẫn CHƯA làm, là việc của Phần 2.**
- [x] Test mới: `src/__tests__/normalize.test.ts` (thêm describe cho `dashboardColWidths`/
      `dashboardCols`/`resolveDashboardCols`, phủ AC-11.2/11.3/11.5/11.6) + `src/state/reducers/
      settings.test.ts` (thêm describe cho 3 action mới, phủ AC-11.9 + tính độc lập giữa các
      Space/giữa `colWidths` và `cols`).
- [x] `npx tsc --noEmit`, `npm run build`, `npx vitest run` — pass hết (98 test, 9 file).

### Quyết định nhỏ phát sinh khi code (ghi lại để Phần 2 không phải đoán lại)

- **Nút "Khôi phục bố cục mặc định" (AC-11.9) đã có sẵn action `SETTINGS_RESET_DASHBOARD_COLS`
  đúng hành vi chốt ở mục 11.6** (chỉ reset `cols` của Space đang mở, không đụng `colWidths`) —
  nhưng **dispatch thật trong `SettingsModal.tsx` là việc của Phần 2** (đúng phạm vi đã giao,
  Phần 1 không động file này). Không tách thành Phần riêng — gộp vào Phần 2 vì đây chỉ là 1 chỗ
  đổi dispatch, không đủ lớn để tách phần độc lập.
- **Entry hỏng trong `dashboardCols` bị normalize BỎ HẲN (không giữ lại dưới dạng default)** —
  quyết định kỹ thuật riêng của Phần 1, không có trong spec gốc (spec chỉ nói validate SHAPE,
  không nói rõ xử lý khi hỏng). Lý do: nếu thay bằng default thì entry đó coi như đã "bị chỉnh"
  (tồn tại trong map) dù user chưa từng đụng vào, khác hành vi kỳ vọng ở AC-11.6 (Space chưa từng
  chỉnh phải fallback tự nhiên, không có entry cứng trong map).
- **`dashboardColWidths` dùng kiểu `number[]` thay vì tuple `[number, number, number]`** — xem
  giải thích ở mục "Quyết định tên field" phía trên.

### Cách test Phần 1 (thuần data layer — CHƯA có UI để bấm tay)

Phần này không đụng bất kỳ màn hình nào (Dashboard/Settings vẫn hoạt động y hệt như trước, vẫn
đọc/ghi qua `dashboardLayout` cũ vì `useDashboardLayout.ts` chưa được rewire) — nên cách xác nhận
đúng cho phần này là qua test tự động + kiểm tra thủ công cấu trúc dữ liệu, KHÔNG phải bấm UI:

1. **Tự động (đủ để tin phần này đúng):**
   ```
   npx tsc --noEmit
   npm run build
   npx vitest run
   ```
   Kỳ vọng: cả 3 lệnh pass, không lỗi. `vitest run` hiện báo `98 tests passed` (tăng từ 84 trước
   khi thêm Phần 1 — 14 test mới cho `dashboardColWidths`/`dashboardCols`/`resolveDashboardCols`/3
   action reducer mới).

2. **Kiểm tra nhanh qua Supabase Table Editor (tuỳ chọn, không bắt buộc):** vì Phần 1 chưa ghi gì
   mới xuống Supabase (UI vẫn dùng action cũ `SETTINGS_SET_DASHBOARD_LAYOUT`), mở bảng
   `kn_space_state` → cột `settings` (jsonb) của user hiện tại → **sẽ CHƯA thấy field
   `dashboardColWidths`/`dashboardCols` xuất hiện trong JSON đã lưu** (vì chưa có hành động nào ghi
   xuống 2 field này) — đây là kỳ vọng ĐÚNG cho Phần 1, không phải lỗi. 2 field này sẽ chỉ xuất
   hiện trong JSON đã lưu sau khi Phần 2 rewire UI dispatch action mới VÀ user thực hiện đúng thao
   tác tương ứng (kéo splitter cột / kéo dọc-kéo-thả trong 1 Space).
   - Có thể kiểm tra gián tiếp bằng cách mở app bình thường (reload/F5) và xác nhận Dashboard vẫn
     hiển thị/hoạt động y hệt như trước khi có thay đổi này (kéo-thả, resize, đổi Space, mở
     Settings > "Khôi phục bố cục mặc định") — vì `useDashboardLayout.ts`/`SettingsModal.tsx` chưa
     bị động tới, hành vi runtime hiện tại phải KHÔNG đổi gì so với trước Phần 1.

---

## Phần 2 — Wiring UI (xong)

Trạng thái: ✅ Xong (2026-07-08)

### Đã làm

- **`src/layout/useDashboardLayout.ts`** — tách 2 luồng độc lập:
  - `colWidths` đọc thẳng `state.settings.dashboardColWidths` (không phụ thuộc `currentSpaceId`).
  - `cols` đọc qua `resolveDashboardCols(state.settings, currentSpaceId)`, bọc `useMemo` (dep
    `[dashboardCols, dashboardLayout, currentSpaceId]`) để tránh reference mới mỗi render khi rơi
    vào fallback `defaultDashboardLayout()` (factory) — đúng rủi ro #3 đã nêu trước khi code.
  - `persistedLayout` (object gộp `{colWidths, cols}` dùng làm input cho local state + các hàm
    thuần trong `dashboardLayoutUtils.ts`) cũng bọc `useMemo` theo `[persistedColWidths,
    persistedCols]`.
  - Ghi `colWidths` → `SETTINGS_SET_COL_WIDTHS` (chỉ khi `endResize` kết thúc splitter loại `col`).
  - Ghi `cols` → `SETTINGS_SET_DASHBOARD_COLS` kèm `spaceId` (khi `endResize` kết thúc splitter
    loại `row`/`subcol`, và khi `handleDrop`/`handleDropOnColumn` — kéo-thả đổi vị trí khối).
  - **Risk #1 (race đổi Space giữa lúc đang kéo):** thêm `pendingColsSpaceIdRef`, chốt
    `currentSpaceId` tại đúng thời điểm BẮT ĐẦU thao tác đổi `cols` — `beginRowResize`/
    `beginSubColResize` (splitter) và wrapper `setDraggedId` (kéo-thả, chốt tại `dragstart`, id
    ≠ null). Dùng ref đó khi commit ở `endResize`/`handleDrop`/`handleDropOnColumn`, KHÔNG đọc
    `currentSpaceId` sống lúc dispatch.
  - **Phát hiện thêm khi code (chưa có trong bản tư vấn trước) — risk #2 mới:** `endResize` có
    thể được gọi từ 1 closure "cũ" (tạo ở render lúc `mousedown`, TRƯỚC khi `setActiveSplitter` áp
    dụng trong React state) — nếu đọc thẳng state `activeSplitter` trong thân `endResize` để biết
    loại splitter vừa kết thúc (`col` hay `row`/`subcol`) sẽ luôn thấy giá trị `null` của render
    cũ (state update không đồng bộ trong cùng tick với lúc `beginXResize` gọi `setActiveSplitter`).
    Xử lý bằng thêm 1 ref riêng `activeKindRef` (set đồng thời với `setActiveSplitter` ở mọi
    `beginXResize`, đọc `.current` trong `endResize`) — cùng kỹ thuật với `layoutRef` đã có sẵn từ
    trước (ref luôn phản ánh giá trị mới nhất bất kể closure nào đọc, khác state đọc qua closure
    có thể stale).
- **`src/layout/Splitter.tsx`** — thêm prop bắt buộc `title: string`, gán vào `title` +
  `aria-label` của `<div>` gốc.
- **`src/layout/AppLayout.tsx`** — truyền `title` tường minh tại đúng 3 vị trí gọi `<Splitter>`
  theo bảng mục 11.9.4 (KHÔNG derive từ `axis`, vì splitter (2) và (3) cùng dùng `axis="col"` nhưng
  khác phạm vi lưu trữ — xem mục 11.9.3):
  1. `onRowSplitterMouseDown` → `"Đổi kích thước khối — chỉ áp dụng cho Space này"`.
  2. `onSubColSplitterMouseDown` (`axis="col"`, ghép ngang trong CÙNG 1 cột) →
     `"Đổi kích thước khối — chỉ áp dụng cho Space này"` (đúng phạm vi lưu trữ thật — ghi vào
     `dashboardCols[spaceId]`, KHÔNG phải `colWidths`, dù cùng `axis="col"` với splitter cột lớn).
  3. `onColSplitterMouseDown` (splitter giữa 2 cột lớn ngoài cùng) →
     `"Đổi độ rộng cột — áp dụng cho mọi Space của bạn"`.
- **`src/features/settings/SettingsModal.tsx`** (tab Chung, khối "Bố cục Dashboard"):
  - Thay toàn bộ nội dung hint theo đúng mục 11.9.2 — câu cố định giải thích 2 phạm vi splitter +
    câu điều kiện nối thêm khi `currentSpace.isShared` (đọc qua `useCurrentSpace()`, an toàn vì
    `SettingsModal` chỉ được mount từ `DashboardCorner`, chỉ render trong `AppLayout`/Dashboard —
    đã xác nhận qua code, `currentSpaceId` luôn hợp lệ tại đây).
  - Nút "Khôi phục bố cục mặc định": đổi dispatch sang `SETTINGS_RESET_DASHBOARD_COLS` kèm
    `spaceId` hiện tại (không đụng `colWidths`, đúng AC-11.9); bọc qua `showConfirm()` (mục
    9.4.1 — chưa có, đã thêm mới, đúng pattern `ConfirmModal` sẵn có trong dự án, không
    `window.confirm`); thêm `title`/`aria-label` chứa tên Space (mục 9.4).
- **`src/state/reducers/settings.ts`** — cập nhật lại comment 2 action cũ
  (`SETTINGS_SET_DASHBOARD_LAYOUT`/`SETTINGS_RESET_DASHBOARD_LAYOUT`): xác nhận từ nay không còn
  nơi nào trong UI dispatch 2 action này nữa (giữ dead-but-typed, xem Phần 3).
- Rà lại toàn bộ `AppLayout.tsx`/`dashboardLayoutUtils.ts` — xác nhận không còn chỗ nào đọc/ghi
  `settings.dashboardLayout` trực tiếp cho hành vi mới (chỉ còn tồn tại trong `normalize.ts`/
  `types.ts`/`seed.ts`/`reducers/settings.ts` đúng vai trò fallback lịch sử, không đổi).

### `npx tsc --noEmit`, `npm run build`, `npx vitest run` — pass hết (98 test, 9 file, không đổi số
lượng test — Phần 2 không cần thêm unit test mới vì logic thuần đã được test đủ ở Phần 1; phần
mới thêm ở Phần 2 chủ yếu là wiring UI/ref, xác nhận qua đọc code kỹ + build pass, không có API
thuần nào mới để unit-test độc lập).

### Cách test Phần 2 (tay, trên trình duyệt)

1. **`cols` riêng theo Space (AC-11.2/11.3):** mở 1 Space, kéo splitter DỌC (đổi chiều cao 2 khối
   xếp trên-dưới trong cùng 1 cột) hoặc kéo-thả đổi vị trí 1 khối sang chỗ khác → chuyển sang
   Space khác → xác nhận layout Space kia KHÔNG đổi theo. Quay lại Space vừa chỉnh → xác nhận vẫn
   giữ đúng như lúc chỉnh (không bị reset, không bị layout Space kia đè lên).
2. **`colWidths` dùng chung mọi Space (AC-11.1):** kéo splitter NGANG giữa 2 CỘT LỚN (đường kẻ ẩn
   chạy dọc suốt chiều cao, ở ranh giới ngoài cùng giữa 2 mảng cột — khác splitter ghép-ngang-
   trong-cột) → chuyển sang Space khác → xác nhận độ rộng 3 cột ở Space kia ĐỔI THEO giống Space
   vừa chỉnh (đúng ý đồ, không phải bug).
3. **Reload (F5)** sau khi đã chỉnh `cols` riêng ≥2 Space + `colWidths` chung ít nhất 1 lần → mở
   lại đúng layout đã lưu (không mất, không trộn) — xác nhận qua Supabase Table Editor: bảng
   `kn_space_state` → cột `settings` (jsonb) → thấy `dashboardColWidths`/`dashboardCols` đã xuất
   hiện với giá trị đúng (khác Phần 1, giờ đã có UI ghi xuống).
4. **Hover splitter xem tooltip:** hover (không cần kéo) vào từng loại đường kẻ ẩn — trình duyệt
   hiện tooltip đúng nội dung tương ứng (2 loại "chỉ áp dụng cho Space này" cho splitter dọc/ghép-
   ngang-trong-cột, 1 loại "áp dụng cho mọi Space của bạn" cho splitter giữa 2 cột lớn).
5. **Settings > tab Chung > khối "Bố cục Dashboard":** đọc hint — ở Space cá nhân chỉ thấy 2 câu cố
   định; ở Shared Space thấy thêm câu thứ 3 nói "chỉ hiển thị cho riêng bạn trong "{tên Space}"".
6. **Nút "Khôi phục bố cục mặc định":** bấm → phải hiện modal xác nhận (không reset ngay) → xác
   nhận nội dung modal có tên Space đang mở → bấm xác nhận → chỉ `cols` của Space đang mở về mặc
   định, `colWidths` (khung 3 cột) và `cols` của Space khác giữ nguyên, không đổi.

---

## Tổng kết tính năng (2026-07-08) — Phần 1 + Phần 2 đã hoàn tất, tính năng SẴN SÀNG dùng

Toàn bộ spec chính thức ở mục 11 `docs/features/layout-theo-space.md` đã được triển khai đầy đủ:
- `Settings.dashboardColWidths` (dùng chung mọi Space) + `Settings.dashboardCols` (riêng theo
  từng Space, key `spaceId`) đã thay thế hoàn toàn vai trò "nguồn ghi mới" của
  `Settings.dashboardLayout` cũ. **Cập nhật 2026-07-08 (Phương án A, xem "Bug phát sinh sau Phần
  2" bên dưới):** field cũ này KHÔNG còn được dùng làm fallback đọc nữa (bản đầu Phần 1 có ý định
  fallback qua field này, nhưng phát sinh bug vỡ layout thật do dữ liệu đóng băng — đã bỏ hẳn tầng
  fallback đó). Field vẫn giữ nguyên trong schema/type (không xoá, dữ liệu Postgres cũ vẫn còn cột
  này) nhưng giờ là field "chết" hoàn toàn theo đúng nghĩa — không ghi mới, không đọc chủ động.
- UI (`useDashboardLayout.ts`/`AppLayout.tsx`/`Splitter.tsx`/`SettingsModal.tsx`) đã rewire đầy đủ
  sang 3 action mới (`SETTINGS_SET_COL_WIDTHS`/`SETTINGS_SET_DASHBOARD_COLS`/
  `SETTINGS_RESET_DASHBOARD_COLS`), không còn dispatch 2 action cũ ở bất kỳ đâu.
- Đã xử lý đủ các rủi ro implementation phát sinh qua 2 vòng tư vấn + lúc code thật (race đổi
  Space giữa lúc kéo, referential-stability fallback, stale closure đọc state trong `endResize`).
- Shared Space: cả `colWidths` lẫn `cols` đều nằm trong `Settings` (cấp user, `kn_space_state`),
  không đụng `kn_shared_spaces`/RLS — đúng nguyên tắc "mỗi thành viên tự sắp layout riêng, không
  đồng bộ giữa các thành viên" đã chốt.

**Phần 3 (dọn dẹp action cũ) vẫn CHƯA làm, không bắt buộc** — có thể làm sau này khi cần, xem mục
bên dưới. Không có việc gì khác đang dang dở cho tính năng này.

## Phần 3 — Dọn dẹp action cũ (chưa làm, không bắt buộc ngay)

Trạng thái: ⬜ Chưa làm

- Xoá `SETTINGS_SET_DASHBOARD_LAYOUT`/`SETTINGS_RESET_DASHBOARD_LAYOUT` khỏi
  `SettingsAction`/`SETTINGS_ACTION_TYPES`/`settingsReducer` sau khi xác nhận không còn nơi nào
  dispatch (chỉ sau khi Phần 2 xong và đã test kỹ). KHÔNG xoá field `Settings.dashboardLayout`
  (vẫn cần làm fallback đọc vĩnh viễn, theo đúng mục 11.4).

---

## Bug phát sinh sau Phần 2 (báo 2026-07-08) — ĐÃ SỬA (2026-07-08, Phương án A)

**Triệu chứng:** Space "MAFC" (cá nhân, `enabledBlocks.habits: false`, còn lại đều bật) hiển thị vỡ
layout: cột trái trông như GỘP 2 cột (tasks/notes/reminder xếp dọc chung 1 dải rộng thay vì tách 2
cột riêng), khối "Nhật ký nhanh" không thấy đâu, cột phải (settings+notifications) vẫn tách biệt
bình thường.

**Root cause đã xác nhận qua code (chưa xác nhận 100% qua dữ liệu Supabase thật — không có quyền
đọc DB thay user, chỉ có anon key bị RLS chặn):**

1. **Lỗi chính** — `src/storage/normalize.ts` dòng ~364/368 (`normalizeSettings`): cả
   `dashboardColWidths` (field mới, dùng chung) lẫn `dashboardCols` (field mới, riêng theo Space)
   đều lấy **số cột chuẩn** (colCount dùng để validate/fallback) từ
   `dashboardLayout.colWidths.length` — tức field **LỊCH SỬ đã đóng băng** (`dashboardLayout`,
   action ghi `SETTINGS_SET_DASHBOARD_LAYOUT` đã chết hẳn từ Phần 2, xác nhận qua grep — chỉ còn
   tồn tại trong type/reducer, không ai dispatch nữa). Field này giữ nguyên giá trị nó có tại đúng
   thời điểm Phần 2 lên production — có thể là 1 cấu trúc `cols` rất cũ (trước khi gộp
   "Hôm nay"+"Widget điều hướng", trước khi có "Nhật ký nhanh", hoặc xa hơn — snapshot từ đợt
   migration `1c9e5e3` 26/6 khi field `dashboardLayout` từng đổi vai trò "dùng chung mọi Space").
2. Với Space chưa từng được resize riêng từ khi Phần 2 lên (như MAFC) — `resolveDashboardCols()`
   rơi vào fallback tầng 2 (`settings.dashboardLayout.cols`), tức đúng cấu trúc cũ/lạ nói trên,
   KHÔNG phải bố cục 3-cột hiện hành (`defaultDashboardLayout()`).
3. Kết hợp với `deriveVisibleLayout()` (`src/layout/dashboardLayoutUtils.ts` dòng 203-208 — logic
   CÓ SẴN từ trước, không phải code mới của tính năng này): quy tắc "cột hết slot hiển thị → bỏ
   hẳn cột, không giữ %". Nếu cấu trúc cũ gom nhóm khối khác với bố cục hiện tại (vd dồn
   tasks+notes+reminder vào 1 cột, còn 1 cột khác chỉ có mỗi `habits`) — khi Space tắt `habits`
   (đúng MAFC), cột chỉ-chứa-`habits` biến mất khỏi render, 2 cột còn lại nhìn như gộp làm 1.
4. "Nhật ký nhanh" biến mất — CHƯA chắc chắn 100%. `patchMissingLogsBlock()` chạy MỌI lần
   `normalizeSettings()`, tự chèn `logs` vào cuối cột chứa `notes` nếu thiếu cấu trúc — nên về lý
   thuyết vẫn phải xuất hiện ở đâu đó. Khả năng cao nhất: bị đẩy xuống cuối 1 cột đã dồn quá nhiều
   khối, nằm ngoài khung nhìn chụp màn hình (chưa cuộn xuống) — chứ không hẳn là mất hẳn khỏi dữ
   liệu. Cần xác nhận qua Table Editor Supabase thật hoặc cuộn UI thử.

**Câu hỏi mở/cần xác nhận (2026-07-08):**
- Kiểm tra `settings.dashboardLayout.colWidths`/`.cols` thật của user qua Supabase Table Editor —
  bao nhiêu cột, cấu trúc từng cột ra sao.
- `settings.dashboardCols` có entry riêng cho `spaceId` của MAFC chưa (nếu có thì root cause khác
  hẳn, cần điều tra lại).

**Phương án đã đề xuất, đang chờ user chọn (KHÔNG tự làm khi chưa chốt):**
- **A (khuyến nghị, ĐÃ CHỌN)** — Bỏ hẳn tầng fallback `dashboardLayout.cols`/`.colWidths` khỏi
  `resolveDashboardCols()`/`normalizeSettings()`, dùng thẳng `defaultDashboardLayout()` làm nguồn
  colCount chuẩn + fallback cuối. Đánh đổi: Space chưa từng resize riêng từ Phần 2 sẽ bị reset về
  đúng bố cục mặc định hiện hành (1 lần), thay vì âm thầm dùng dữ liệu đóng băng có thể sai lệch.
- **B** — Giữ fallback nhưng validate chặt (đủ mọi `LayoutBlockKey` hiện hành, không cột nào toàn
  khối đã tắt) trước khi dùng, không hợp lệ thì rơi thẳng xuống default. Phức tạp hơn A.
- **C** — Vá tạm bằng tay: bấm nút "Khôi phục bố cục mặc định" (Settings) cho riêng MAFC — không
  sửa gốc rễ, Space khác chưa từng resize từ Phần 2 vẫn tiềm ẩn lỗi tương tự.

### Đã làm (2026-07-08, Phương án A)

- **`src/storage/normalize.ts`**:
  - `resolveDashboardCols(settings, spaceId)` — bỏ hẳn tier 2 (`settings.dashboardLayout?.cols`),
    chỉ còn `dashboardCols[spaceId]` → nếu không có → `defaultDashboardLayout().cols` thẳng.
  - `normalizeSettings()` — thêm biến `defaultLayout = defaultDashboardLayout()`, dùng
    `defaultLayout.colWidths`/`defaultLayout.colWidths.length` làm nguồn fallback/colCount cho CẢ
    `dashboardColWidths` lẫn `dashboardCols` (map SHAPE), thay vì `dashboardLayout.colWidths` (biến
    cũ, vẫn được tính và giữ trong object trả về cho field `dashboardLayout` — chỉ không còn dùng
    để suy luận cho 2 field mới).
- **Rà lại toàn bộ `src/`** (grep `dashboardLayout`) — xác nhận field cũ chỉ còn tồn tại ở:
  `types.ts` (khai báo type + comment), `state/seed.ts` (`defaultSettings().dashboardLayout`,
  không đổi), `state/reducers/settings.ts` (2 action `SETTINGS_SET_DASHBOARD_LAYOUT`/
  `SETTINGS_RESET_DASHBOARD_LAYOUT` dead-but-typed, không ai dispatch — giữ nguyên, xem Phần 3),
  `state/appReducer.ts` (đọc field cũ trong file export/import CŨ, không liên quan bug này),
  `storage/normalize.ts` (chính nó — vẫn tính/normalize field này để giữ type, và
  `findLegacyDashboardLayout()` đọc dữ liệu Space-level CỔ HƠN NỮA, từ trước khi `dashboardLayout`
  từng là field cấp `Settings` — không đổi, không liên quan bug này). **Không còn nơi nào khác đọc
  `settings.dashboardLayout` để suy luận hành vi runtime mới** (UI/`useDashboardLayout.ts` cũng đã
  bỏ field này khỏi dep array của `useMemo` vì không còn ảnh hưởng tới `resolveDashboardCols()`).
- **Case (b) đã xác nhận qua test, KHÔNG cần sửa code thêm** — `patchMissingLogsBlock()` chạy bên
  trong `normalizeCols()`, được gọi cho MỌI entry trong `dashboardCols[spaceId]` (kể cả entry ĐÃ
  hợp lệ, đã có sẵn — case Space tự resize TRƯỚC KHI có khối "Nhật ký nhanh") độc lập hoàn toàn với
  thay đổi Phương án A ở trên — cơ chế này vốn đã đúng từ Phần 1, chỉ cần viết test xác nhận rõ
  ràng (xem `src/__tests__/normalize.test.ts`, describe `dashboardCols`, case "entry hợp lệ nhưng
  thiếu khối mới (logs)").
- **Xác nhận không đụng Space đã có entry hợp lệ ("Chi tiêu gia đình Kino")** — cả
  `resolveDashboardCols()` lẫn `normalizeDashboardColsMap()` đều trả `perSpace`/entry đã chuẩn hoá
  ngay khi `dashboardCols[spaceId]` tồn tại và đúng shape, KHÔNG đi qua nhánh fallback nào — logic
  không đổi so với trước khi sửa bug này, chỉ nhánh fallback (Space CHƯA có entry) mới bị ảnh
  hưởng.
- **Quyết định về field `dashboardLayout` cũ (mục 6 yêu cầu)** — **giữ nguyên trong
  `types.ts`/`state/seed.ts`/`state/reducers/settings.ts`, KHÔNG xoá.** Lý do: dữ liệu cột
  `settings` (jsonb) trong Postgres của user thật vẫn còn field này; xoá khỏi type TypeScript
  không xoá được data thật, chỉ khiến `normalizeSettings()` mất khả năng đọc/giữ nguyên field khi
  export/import (Settings khai báo field này là bắt buộc, không optional). Giữ lại đúng tinh thần
  "field chết an toàn" — không ghi mới (2 action liên quan đã dead-but-typed từ Phần 2), không đọc
  chủ động để suy luận hành vi (bug lần này chính là do còn đọc chủ động ở 2 chỗ trong
  `normalize.ts`, nay đã bỏ).
- Test: cập nhật `src/__tests__/normalize.test.ts` — sửa lại toàn bộ describe
  `dashboardColWidths`/`dashboardCols`/`resolveDashboardCols` để phản ánh đúng hành vi MỚI (không
  còn migrate/fallback qua `dashboardLayout` cũ dù nó tồn tại với nội dung khác default — cố tình
  đặt `dashboardLayout` khác default trong test để chứng minh bị bỏ qua, không phải "tình cờ giống
  nhau"). Có test riêng mô phỏng đúng kịch bản bug thật (Space "MAFC": `dashboardLayout.cols` cũ có
  1 cột chỉ chứa `habits`, xác nhận `resolveDashboardCols()` KHÔNG trả về cấu trúc đó nữa).
- `npx tsc --noEmit`, `npm run build`, `npx vitest run` — pass hết (98 test, 9 file — số lượng
  test file/case trong `normalize.test.ts` tăng do viết thêm test case (b)/(c) rõ ràng hơn, nhưng
  gộp lại tổng vẫn 98 vì một vài test cũ bị thay thế/hợp nhất chứ không phải thêm ròng).

### Cách test tay bug này (đã sửa)

1. **Space "MAFC" (Space bị lỗi trong ảnh chụp màn hình user gửi):**
   - Mở app, chuyển sang Space "MAFC".
   - Xác nhận Dashboard hiện đúng **3 cột tách biệt rõ ràng** (không còn cảm giác 2 cột đầu bị gộp
     làm 1 dải rộng) — cột 1: Ghi chú + Nhật ký nhanh, cột 2: Việc cần làm + Nhắc nhở (+ Thói quen
     nếu Space đó có bật `habits` — MAFC tắt `habits` nên cột 2 chỉ còn Việc cần làm + Nhắc nhở,
     đúng bố cục mặc định khi thiếu 1 khối, KHÔNG mất cả cột), cột 3: Điều hướng + Thông báo.
   - Xác nhận khối **"Nhật ký nhanh"** hiện rõ ở cột 1 (dưới "Ghi chú"), không cần cuộn tìm mới
     thấy (nếu vẫn phải cuộn nhiều mới thấy — báo lại, có thể chiều cao khối notes quá lớn trong
     bố cục mặc định, không phải bug mất dữ liệu).
   - Vào Settings > tab Chung > "Bố cục Dashboard" > "Khôi phục bố cục mặc định" — KHÔNG bắt buộc
     bấm (layout đã tự về đúng mặc định ngay khi mở Space này, không cần thao tác gì thêm), nhưng
     bấm thử cũng phải hoạt động bình thường (có modal xác nhận, không lỗi).
2. **Space "Chi tiêu gia đình Kino" (đã tự resize hôm nay — PHẢI giữ nguyên, KHÔNG đổi gì):**
   - Chuyển sang Space này, xác nhận layout **giữ nguyên y hệt** bố cục đã tự chỉnh trước đó (thứ
     tự khối, chiều cao từng khối, khối nào ghép ngang với khối nào) — không bị reset về mặc định,
     không lẫn với bố cục của Space "MAFC".
3. **Space khác (nếu có, chưa từng tự resize từ Phần 2):** mở thử — kỳ vọng cũng về đúng bố cục
   mặc định 3 cột như "MAFC", không vỡ layout, không mất khối nào.
4. **Reload (F5)** sau bước 1-2 — xác nhận cả 2 Space vẫn đúng như trên (không bị đảo ngược lại
   trạng thái cũ do cache/normalize chạy lại).
