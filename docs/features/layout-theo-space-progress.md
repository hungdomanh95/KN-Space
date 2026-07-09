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

## Mục 11.10 — Ngoại lệ: chiều cao khối `settings` dùng chung mọi Space

Trạng thái: ✅ Xong (2026-07-08)

Việc nhỏ, làm gọn trong 1 lượt (không tách Phần riêng) — spec đầy đủ ở
`docs/features/layout-theo-space.md` mục 11.10.

### Đã làm

- **`src/types.ts`** — thêm `Settings.dashboardCornerHeight: number` (giữ đúng tên đề xuất trong
  spec) — cùng nhóm "dùng chung mọi Space" với `dashboardColWidths`, comment giải thích rõ chỉ
  override `h` của slot `id === 'settings'`, không đụng vị trí/khối khác.
- **`src/state/seed.ts`** — thêm hàm `findSettingsCornerHeight(cols, fallback = 22)` (export) tìm
  `h` của slot `settings` trong 1 mảng `cols` bất kỳ — dùng cho `defaultSettings()` (khởi tạo từ
  `defaultDashboardLayout().cols`) và tái dùng ở `normalize.ts`. Viết thành hàm thay vì hard-code
  lại `22` để không lệch pha nếu default sau này đổi.
- **`src/storage/normalize.ts`**:
  - `normalizeCornerHeight(raw, fallback)` — validate 1 số dương hữu hạn, fallback nếu không hợp
    lệ.
  - `overrideCornerHeight(cols, cornerHeight)` — override `h` của MỌI slot mang khối `settings`
    (single hoặc ghép ngang) bằng `cornerHeight`; giữ nguyên REFERENCE gốc của `cols` nếu không có
    gì cần đổi (referential-stability cho `useMemo` ở hook, đúng tinh thần rủi ro #3 đã xử lý
    trước đó cho `dashboardCols`).
  - `resolveDashboardCols()` — sau khi resolve `cols` theo đúng fallback đã có (Phần 1/Phương án
    A), gọi thêm `overrideCornerHeight()` trước khi trả về — áp dụng cho MỌI Space (cả khi có entry
    riêng lẫn khi rơi vào fallback default).
  - `normalizeSettings()` — tính thêm `dashboardCornerHeight` bằng `normalizeCornerHeight(settings.dashboardCornerHeight, findSettingsCornerHeight(defaultLayout.cols))`.
- **`src/state/reducers/settings.ts`** — thêm action `SETTINGS_SET_CORNER_HEIGHT` (payload `{ h }`,
  KHÔNG kèm `spaceId`, cùng pattern `SETTINGS_SET_COL_WIDTHS`).
- **`src/state/appReducer.ts`** — thêm `SETTINGS_SET_CORNER_HEIGHT` vào `SETTINGS_ACTION_TYPES`.
- **`src/layout/dashboardLayoutUtils.ts`** — thêm helper `slotHeightIfContains(slot, id)` (trả `h`
  nếu slot chứa khối `id`, single hoặc ghép ngang, `null` nếu không) — dùng ở cả
  `useDashboardLayout.ts` (ghi) lẫn `AppLayout.tsx` (tooltip).
- **`src/layout/useDashboardLayout.ts`** — phần ĐỌC không cần đổi gì (`resolveDashboardCols()` đã
  tự override). Phần GHI (2 đích lưu trữ, mục 11.10.2):
  - Đổi `activeKindRef` (chỉ lưu `kind`) thành `activeSplitterRef` (lưu cả `ActiveSplitter` đầy đủ
    — `kind`+`ci`+`si`) — cần `ci`/`si` để tra 2 slot bị resize lúc `endResize`.
  - `endResize`: giữ nguyên dispatch `SETTINGS_SET_DASHBOARD_COLS` như cũ (ghi `h` của khối CÒN
    LẠI theo đúng Space — giá trị `h` của `settings` lưu trong entry này có thể tạm khác
    `dashboardCornerHeight`, vô hại vì luôn bị override khi đọc). THÊM: nếu `active.kind === 'row'`
    và 1 trong 2 slot bị resize chứa khối `settings` (`slotHeightIfContains`) → dispatch thêm
    `SETTINGS_SET_CORNER_HEIGHT` với `h` mới của `settings`. `subcol` (đổi `w`) không liên quan vì
    không đổi `h`.
  - `persistedCols` useMemo: thêm `state.settings.dashboardCornerHeight` vào dependency array (bị
    thiếu sẽ khiến đổi chiều cao `settings` từ nơi khác — reload/máy khác — không kích hoạt tính
    lại).
- **`src/layout/AppLayout.tsx`** — splitter DỌC (`row`) liền kề khối `settings` giờ hiển thị title
  khác splitter dọc thường: tra theo layout GỐC (`layout.cols[rs.origCi]`, không phải
  `visibleLayout`) qua `slotHeightIfContains`, nếu đúng thì `title` = `Đổi kích thước khối "Điều
  hướng + Hôm nay" — áp dụng cho mọi Space của bạn`, khác `Đổi kích thước khối — chỉ áp dụng cho
  Space này` của mọi splitter dọc khác. Splitter cột lớn (`onColSplitterMouseDown`) và splitter
  ghép-ngang-trong-cột (`onSubColSplitterMouseDown`) giữ nguyên, không đổi (không liên quan `h`
  của `settings`).
- Test mới: `src/__tests__/normalize.test.ts` (2 describe mới — `dashboardCornerHeight` cho
  `normalizeSettings`, và override `h` trong `resolveDashboardCols`, tổng 8 test case, phủ cả 2 vế
  AC-11.10.1/AC-11.10.3) + `src/state/reducers/settings.test.ts` (describe
  `SETTINGS_SET_CORNER_HEIGHT`, 2 test case).
- `npx tsc --noEmit`, `npm run build`, `npx vitest run` — pass hết (108 test, 9 file — tăng 10 so
  với 98 trước đó).

### Quyết định lệch khỏi spec gốc mục 11.10.4 (ghi rõ, không im lặng đổi) — 2026-07-08

Spec mục 11.10.4 đề xuất migrate `dashboardCornerHeight` từ `h` của slot `settings` trong
`dashboardLayout.cols` (field đơn LỊCH SỬ). **Đã KHÔNG làm theo đúng như vậy** — áp dụng lại
nguyên xi bài học "Phương án A" (bug 2026-07-08 đã ghi ở trên): field `dashboardLayout` là dữ liệu
ĐÓNG BĂNG tại 1 thời điểm cũ, không có cách phân biệt "cũ nhưng hợp lệ" với "cũ và bất thường" (vd
do bug resize cộng-dồn-delta đã sửa trước đây) chỉ bằng kiểm tra kiểu số. Với field NÀY, rủi ro còn
LỚN HƠN `cols`/`colWidths` per-Space: vì `dashboardCornerHeight` DÙNG CHUNG mọi Space, đọc phải 1
giá trị bất thường từ dữ liệu đóng băng sẽ làm khối `settings` SAI NGAY LẬP TỨC ở TẤT CẢ Space cùng
lúc (không phải chỉ 1 Space "may rủi" như trường hợp `cols`). Vì vậy `normalizeCornerHeight()`
fallback THẲNG `findSettingsCornerHeight(defaultDashboardLayout().cols)` (= 22 hiện tại), giống hệt
cách `dashboardColWidths` đã được sửa để KHÔNG đọc `dashboardLayout` nữa. Đánh đổi: user cũ đã có
`dashboardLayout.cols` với `h` khối `settings` khác 22 (rất ít khả năng vì UI trước tính năng
11.10 luôn cho phép resize slot này, nhưng vẫn có thể) sẽ thấy khối `settings` reset về `22` thay vì
giữ đúng giá trị cũ họ từng chỉnh — chấp nhận được, resize lại 1 lần bằng tay (thao tác rất nhanh,
splitter vẫn hoạt động bình thường) là đủ, an toàn hơn hẳn rủi ro lây lan sang mọi Space.

**Đây là quyết định kỹ thuật tự đưa ra khi code, chưa hỏi lại chủ dự án trước khi làm** (theo tinh
thần "việc nhỏ, làm xong 1 lượt, dừng lại báo cáo" đã giao) — nêu rõ ở đây + trong báo cáo cuối
cùng để chủ dự án biết và có thể yêu cầu đổi lại nếu không đồng ý.

### Cách test Phần 11.10 (tay, trên trình duyệt)

1. **Tự động trước (đủ để tin phần data-layer đúng):**
   ```
   npx tsc --noEmit
   npm run build
   npx vitest run
   ```
   Kỳ vọng: pass hết, `vitest run` báo `108 tests passed`.

2. **(a) Đổi Space → khối `settings` luôn cao giống nhau:** mở Space A, kéo splitter DỌC giữa khối
   "Điều hướng + Hôm nay" và khối "Thông báo" (đổi chiều cao 2 khối này) → chuyển sang Space B (kể
   cả Space B có bố cục/vị trí khối `settings` khác hẳn A, hoặc chưa từng tự chỉnh riêng) → xác
   nhận khối "Điều hướng + Hôm nay" ở Space B hiện đúng **chiều cao mới giống Space A** (không phải
   giữ nguyên chiều cao cũ riêng của B).
3. **(b) Khối "Thông báo" của Space B KHÔNG bị đổi theo tỉ lệ của Space A:** sau bước 2, mở
   Settings > Tab Chung, hoặc quan sát trực tiếp — khối "Thông báo" ở Space B vẫn giữ đúng SỐ `h`
   đã lưu riêng cho Space B từ trước (không nhảy theo đúng tỉ lệ mà Space A đang có). Lưu ý: vì `h`
   là trọng số flex TƯƠNG ĐỐI trong cột (không phải % tuyệt đối), khối "Thông báo" ở Space B có thể
   trông cao/thấp hơi khác trước (vì khối `settings` cạnh nó giờ chiếm tỉ trọng khác) dù SỐ lưu trữ
   không đổi — đây là hành vi ĐÚNG theo thiết kế (đã nêu ở mục 11.10.3 tài liệu spec), không phải
   bug.
4. **Vị trí khối `settings` vẫn riêng theo Space:** kéo-thả khối "Điều hướng + Hôm nay" sang cột/vị
   trí khác ở Space A → chuyển sang Space B → xác nhận vị trí khối này ở Space B **không đổi theo**
   A (chỉ chiều cao dùng chung, vị trí vẫn riêng — đúng AC-11.10.2).
5. **Hover tooltip:** hover (không cần kéo) vào đường kẻ ẩn giữa khối "Điều hướng + Hôm nay" và khối
   liền kề (thường là "Thông báo") → tooltip hiện đúng `Đổi kích thước khối "Điều hướng + Hôm nay"
   — áp dụng cho mọi Space của bạn` (khác các splitter dọc khác vẫn hiện `chỉ áp dụng cho Space
   này`).
6. **Reload (F5)** sau bước 2 — mở lại đúng Space đang mở lúc F5 → xác nhận chiều cao khối
   `settings` vẫn đúng giá trị chung đã chỉnh (không mất). Có thể xác nhận thêm qua Supabase Table
   Editor: bảng `kn_space_state` → cột `settings` (jsonb) → thấy `dashboardCornerHeight` xuất hiện
   với giá trị đúng (1 số, KHÔNG khoá theo `spaceId`).
7. **Nút "Khôi phục bố cục mặc định"** (Settings > Tab Chung) — bấm cho 1 Space bất kỳ → xác nhận
   chiều cao khối `settings` ở Space đó KHÔNG bị reset về 22 nếu trước đó đã chỉnh khác (đúng vì
   `dashboardCornerHeight` không thuộc phạm vi nút này, giống `dashboardColWidths`).

---

## Mục 11.10 mở rộng — áp dụng thêm cho khối `reminders` (Thông báo) (2026-07-09)

Trạng thái: ✅ Xong (2026-07-09)

**Đây là SỬA LẠI PHẠM VI theo yêu cầu chủ dự án, KHÔNG PHẢI bug fix.** Bản 11.10 gốc (2026-07-08,
xem mục trên) chỉ áp dụng "chiều cao dùng chung mọi Space" cho đúng 1 khối `settings`. Chủ dự án
xác nhận lại (2026-07-09): khối `reminders` (Thông báo) **cũng LUÔN hiển thị mọi Space, không tắt
được** — cùng điều kiện đã dùng để quyết định cho `settings` ở mục 11.10.1 (xem comment gốc trong
`AppLayout.tsx`: "`reminders` (Thông báo) và `settings` (DashboardCorner) LUÔN hiển thị, không
tắt") — nên PHẢI áp dụng cơ chế dùng-chung y hệt cho cả 2 khối, không chỉ 1. Bản trước đó hiểu sai
phạm vi (tưởng chỉ `settings` mới cần), gây thiếu — nay bổ sung. Xem spec đầy đủ tại
`docs/features/layout-theo-space.md` mục 11.10.7.

### Đã làm

- **`src/types.ts`** — thêm `Settings.dashboardReminderHeight: number`, cặp đôi với
  `dashboardCornerHeight`, comment giải thích rõ lý do TÁCH 2 field độc lập thay vì suy ra
  `reminders.h = 100 - dashboardCornerHeight` (xem quyết định kỹ thuật bên dưới).
- **`src/state/seed.ts`** — generalize `findSettingsCornerHeight(cols, fallback)` thành hàm dùng
  chung `findSlotHeight(cols, id, fallback)`; `findSettingsCornerHeight`/`findReminderHeight` giờ
  là 2 wrapper mỏng gọi hàm chung (giữ tên cũ cho các nơi gọi/test đã có, không phá API).
  `defaultSettings()` khởi tạo thêm `dashboardReminderHeight: findReminderHeight(defaultDashboardLayout().cols)`.
- **`src/storage/normalize.ts`**:
  - `normalizeCornerHeight` đổi tên thành `normalizeGlobalSlotHeight(raw, fallback)` (logic validate
    y hệt, dùng chung cho cả 2 field, không phải viết lại).
  - `overrideCornerHeight(cols, cornerHeight)` đổi thành `overrideSlotHeights(cols, overrides)` —
    nhận `Partial<Record<LayoutBlockKey, number>>`, override MỌI slot khớp bất kỳ id nào trong
    `overrides` trong 1 lượt duyệt `cols` (thay vì gọi hàm riêng 2 lần — đỡ duyệt mảng 2 lượt, và dễ
    mở rộng thêm khối "luôn hiện" khác sau này nếu có).
  - `resolveDashboardCols()` gọi `overrideSlotHeights(cols, { settings: ..., reminders: ... })` — cả
    2 khối cùng bị override khi đọc, áp dụng cho MỌI Space.
  - `normalizeSettings()` tính thêm `dashboardReminderHeight` — cùng pattern
    `dashboardCornerHeight` (KHÔNG migrate qua `dashboardLayout` cũ, lý do y hệt — xem comment tại
    chỗ).
- **`src/state/reducers/settings.ts`** — thêm action `SETTINGS_SET_REMINDER_HEIGHT` (payload `{ h }`,
  không kèm `spaceId`), reducer case y hệt `SETTINGS_SET_CORNER_HEIGHT`.
- **`src/state/appReducer.ts`** — thêm `SETTINGS_SET_REMINDER_HEIGHT` vào `SETTINGS_ACTION_TYPES`
  (bắt buộc — thiếu sẽ khiến action này không kích hoạt lưu Supabase debounce).
- **`src/layout/useDashboardLayout.ts`**:
  - `persistedCols` useMemo — thêm `state.settings.dashboardReminderHeight` vào dependency array
    (song song `dashboardCornerHeight` đã có).
  - `endResize` — sau khi kiểm tra slot resize có chứa `settings` (dispatch
    `SETTINGS_SET_CORNER_HEIGHT`), kiểm tra ĐỘC LẬP thêm slot có chứa `reminders` không (dispatch
    `SETTINGS_SET_REMINDER_HEIGHT`) — 2 kiểm tra tách rời (không phải else-if) vì 1 slot chỉ khớp
    đúng 1 trong 2 id, không xung đột; 1 lượt kéo splitter giữa 2 khối này giờ có thể ra tối đa 3
    dispatch (`SETTINGS_SET_DASHBOARD_COLS` + cả 2 action dùng-chung).
- **`src/layout/AppLayout.tsx`** — `touchesCornerHeight` đổi tên `touchesGlobalHeight`, kiểm tra
  thêm slot có chứa `reminders` (ngoài `settings` đã có). Title tooltip đổi từ nhắc tên cụ thể
  `"Điều hướng + Hôm nay"` sang generic `"Đổi kích thước khối — áp dụng cho mọi Space của bạn"` (vì
  giờ splitter có thể chỉ liền kề `reminders`, không nhất thiết liền kề `settings`).
- Test cập nhật: `src/__tests__/normalize.test.ts` — 2 describe cũ (`dashboardCornerHeight` cho
  `normalizeSettings`, override `h` trong `resolveDashboardCols`) sửa lại assertion (trước đó khẳng
  định `reminders` "không bị đụng" — nay SAI vì `reminders` giờ CŨNG bị override, đã sửa) + thêm
  describe mới mirror hệt cho `dashboardReminderHeight`. `src/state/reducers/settings.test.ts` —
  thêm describe `SETTINGS_SET_REMINDER_HEIGHT` (3 test case, gồm 1 test xác nhận 2 action
  `CORNER_HEIGHT`/`REMINDER_HEIGHT` độc lập, không đè lẫn nhau).
- `npx tsc --noEmit`, `npm run build`, `npx vitest run` — pass hết (115 test, 9 file — tăng 7 so
  với 108 trước đó).

### Quyết định kỹ thuật tự đưa ra khi code (ghi rõ, chưa hỏi lại trước khi làm)

**Tách 2 field độc lập (`dashboardCornerHeight` + `dashboardReminderHeight`) thay vì 1 field duy
nhất suy-bù (`reminders.h = 100 - dashboardCornerHeight`):** đã cân nhắc theo đúng yêu cầu mục 7 —
kiểm tra kỹ cách `h` được dùng trong CSS thật trước khi quyết định (`AppLayout.tsx` dòng ~381:
`flex: ${slot.h} 1 0` — flex-basis 0, `h` chỉ là TRỌNG SỐ FLEX-GROW tương đối giữa các khối cùng
cột, KHÔNG phải phần trăm tuyệt đối bắt buộc cộng đúng 100). Bằng chứng ngay trong
`defaultDashboardLayout()` có sẵn: cột 1 (`notes` h=62 + `logs` h=20) tổng = 82, không phải 100, vẫn
hiển thị đúng vì chỉ là tỉ lệ. Khác hẳn `dashboardColWidths` (dùng `flex: 0 1 W%` — W% là kích thước
THẬT theo % viewport, cộng lệch 100% từng gây bug tràn/hụt cột thấy rõ, đã phải viết hẳn
`normalizeColWidths()` để RESET THẲNG về default khi phát hiện méo).

Vì vậy 2 field độc lập **không cần thêm logic chuẩn hoá "đảm bảo tổng luôn ra 100"** như lo ngại nêu
ở yêu cầu — trôi lệch tổng qua nhiều lần resize (nếu có xảy ra) chỉ đổi TỈ LỆ hiển thị tương đối
giữa 2 khối, không gây lỗi tràn/mất UI. Hướng 2-field cũng an toàn hơn hướng suy-bù về lâu dài: hướng
suy-bù (`reminders.h = 100 - dashboardCornerHeight`) ngầm giả định cứng "cột chứa `settings` luôn
đúng 2 khối" ngay trong logic TÍNH giá trị field — nếu sau này có nhu cầu cho phép kéo-thả thêm khối
thứ 3 vào cột đó (dù hiện tại UI chưa hỗ trợ), giả định này sẽ sai âm thầm. Hướng 2-field không phụ
thuộc giả định đó, mỗi field override đúng 1 `LayoutBlockKey` độc lập, nhất quán với chính bản 11.10
gốc.

**Đây là quyết định tự đưa ra khi code (đúng phạm vi câu hỏi mở mục 7 của yêu cầu, đã có hướng dẫn
"tự quyết, ghi rõ lý do")** — nêu ở đây để chủ dự án biết, có thể yêu cầu đổi lại nếu không đồng ý.

### Cách test Mục 11.10 mở rộng (tay, trên trình duyệt)

1. **Tự động trước:**
   ```
   npx tsc --noEmit
   npm run build
   npx vitest run
   ```
   Kỳ vọng: pass hết, `vitest run` báo `115 tests passed`.

2. **Đổi Space → CẢ 2 khối (Điều hướng + Hôm nay, VÀ Thông báo) cùng cao giống nhau:** mở Space A,
   kéo splitter DỌC giữa khối "Điều hướng + Hôm nay" và khối "Thông báo" (đổi chiều cao 2 khối này)
   → chuyển sang Space B (kể cả Space B có bố cục/vị trí khác hẳn A, hoặc chưa từng tự chỉnh riêng)
   → xác nhận CẢ 2 khối ở Space B hiện đúng **chiều cao mới giống Space A** — khác bản 11.10 gốc
   (trước đó chỉ khối "Điều hướng + Hôm nay" đồng bộ, khối "Thông báo" vẫn tính bù riêng theo Space).
3. **Vị trí vẫn riêng theo Space:** kéo-thả khối "Thông báo" (hoặc "Điều hướng + Hôm nay") sang cột/
   vị trí khác ở Space A → chuyển sang Space B → xác nhận vị trí khối đó ở Space B **không đổi
   theo** A (chỉ chiều cao dùng chung, vị trí vẫn riêng).
4. **Hover tooltip:** hover vào đường kẻ ẩn giữa khối "Điều hướng + Hôm nay" và "Thông báo" → tooltip
   hiện `Đổi kích thước khối — áp dụng cho mọi Space của bạn` (đổi cách diễn đạt so với bản trước,
   không còn nhắc tên cụ thể 1 khối, vì giờ splitter có thể liền kề `reminders` mà không liền kề
   `settings`).
5. **Reload (F5)** sau bước 2 — mở lại đúng Space đang mở → xác nhận chiều cao CẢ 2 khối vẫn đúng
   giá trị chung đã chỉnh (không mất). Có thể xác nhận qua Supabase Table Editor: bảng
   `kn_space_state` → cột `settings` (jsonb) → thấy CẢ `dashboardCornerHeight` LẪN
   `dashboardReminderHeight` xuất hiện, không khoá theo `spaceId`.
6. **Nút "Khôi phục bố cục mặc định"** — bấm cho 1 Space bất kỳ → xác nhận chiều cao CẢ 2 khối
   KHÔNG bị reset (đúng vì cả 2 field không thuộc phạm vi nút này).

---

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
