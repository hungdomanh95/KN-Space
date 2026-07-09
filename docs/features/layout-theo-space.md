# Tính năng: Layout Dashboard độc lập theo từng Space

> Trạng thái: **Phân tích/đề xuất — CHƯA chốt, CHƯA giao `uiux`/`dev`.** Đảo ngược 1 quyết định kiến trúc đã ghi trong `docs/requirements.md` mục 4 ("Lưu tỉ lệ layout + thứ tự khối vào storage, dùng chung cho mọi Space").
> Cập nhật: 2026-07-08.
> Input: 3 ảnh chụp Dashboard thật ở 3 Space khác nhau (Chi tiêu gia đình Kino, MAFC, Cá nhân) do chủ dự án cung cấp — mỗi Space có cách dùng khối khác hẳn nhau, đổi layout ở Space này hiện đang làm hỏng layout Space khác.

> **Cập nhật 2026-07-08 (bàn lại):** Mục 1-9 dưới đây là vòng phân tích ĐẦU TIÊN (chỉ đào sâu 1 hướng "layout tự do per-Space", đến cả bước `uiux`/`dev` review) — chủ dự án xem demo, **không hài lòng**, yêu cầu bỏ qua lối mòn này, suy nghĩ rộng hơn từ đầu. Mục **10** là vòng phân tích thứ 2, đặt cạnh **5 phương án khác nhau về bản chất** (không phải biến thể nhỏ của mục 1-9). Mục **11** (cuối file) là **KẾT LUẬN CUỐI**, chốt trực tiếp giữa chủ dự án và phiên làm việc chính, thay thế hoàn toàn mục 10 (A-F), là nguồn spec chính thức duy nhất để `dev` triển khai. Đọc mục 11 trước nếu chỉ cần bức tranh hiện tại; mục 1-10 giữ lại làm lịch sử quá trình bàn bạc, không phải spec để code theo.

---

## 1. Tổng quan

### 1.1 Root cause / vấn đề hiện tại

`Settings.dashboardLayout` (`src/types.ts` dòng ~247) là **1 object `DashboardLayout` duy nhất**, nằm ở cấp `Settings` (1 user = 1 `Settings`), **dùng chung cho mọi Space** của user đó — đây là quyết định kiến trúc **có chủ đích** (không phải bug), ghi rõ trong comment code và `docs/requirements.md` mục 4, lý do ban đầu là "tránh hẳn việc đồng bộ/copy layout giữa các Space".

Trên thực tế dùng lâu dài, quyết định này gây khó chịu: người dùng có nhiều Space với cách dùng rất khác nhau (Space "Chi tiêu gia đình Kino" dùng Nhật ký nhanh nhiều, muốn khối đó to; Space "MAFC" dùng Ghi chú nhiều; Space "Cá nhân" kiểu khác hẳn) nhưng chỉ có **1 bộ vị trí/kích thước khối** áp cho tất cả — chỉnh layout ở Space này (kéo-thả, resize splitter) làm ảnh hưởng ngay layout hiển thị ở mọi Space khác.

### 1.2 Xác nhận phạm vi thay đổi

Đây là **thay đổi kiến trúc dữ liệu thật**, không phải chỉnh UI đơn thuần:
- Đổi shape của field `Settings.dashboardLayout` (từ 1 object → map/dictionary khoá theo `spaceId`).
- Cần logic migrate dữ liệu đã có thật của user hiện tại (không phải bảng trống).
- Đụng tới toàn bộ chuỗi đọc/ghi layout: hook đọc layout hiện hành, 2 reducer action set/reset layout, hàm tạo layout mặc định, hàm chuẩn hoá dữ liệu load từ storage, luồng export/import.
- Có 1 điểm phức tạp cần quyết định rõ trước khi giao `uiux`/`dev`: **Shared Space nên xử lý sao** (xem mục 4).

Vì các lý do trên, `ba` phân tích đầy đủ trước ở tài liệu riêng này (theo đúng format `docs/features/shared-space.md`) thay vì viết thẳng vào `docs/requirements.md` mục 4 — vì còn câu hỏi mở ảnh hưởng lớn tới phạm vi cần chủ dự án xác nhận (mục 8), chưa đủ điều kiện "chốt" để sửa trực tiếp tài liệu nguồn sự thật. Sau khi chốt, nội dung mục 4/4.1/6/10 của `docs/requirements.md` sẽ được cập nhật lại cho khớp (xem mục 9 — change impact tài liệu).

---

## 2. User Stories

- Là người dùng có nhiều Space dùng cho mục đích khác nhau, tôi muốn tự sắp xếp lại vị trí/kích thước từng khối riêng cho từng Space, để layout khớp với cách tôi thực sự dùng Space đó (Space chi tiêu → Nhật ký nhanh to; Space công việc → Ghi chú/Việc cần làm to).
- Là người dùng đó, tôi muốn việc chỉnh layout ở Space A **không** làm thay đổi layout tôi đã sắp xếp riêng cho Space B/C.
- Là người dùng đó, khi tôi tạo Space mới, tôi muốn layout khởi tạo hợp lý (không rỗng/vỡ), rồi tự chỉnh riêng theo nhu cầu Space đó từ đó về sau.
- Là Member/Owner của 1 Shared Space, tôi muốn tự sắp xếp layout xem của riêng tôi trong Space chung đó theo ý mình, **không** bị người khác sắp xếp lại rồi ép tôi phải xem theo layout của họ (layout là sở thích xem cá nhân, khác bản chất Task/Note là dữ liệu cộng tác thật sự cần dùng chung).

---

## 3. Luồng chi tiết (hướng đề xuất — xem mục 4 để hiểu vì sao chọn hướng này)

### 3.1 Đọc layout khi hiển thị Dashboard

1. Dashboard đang mở Space có `id = spaceId`.
2. Lấy layout hiệu lực theo thứ tự ưu tiên:
   - Nếu `settings.dashboardLayouts[spaceId]` đã tồn tại (Space này đã từng được user tự chỉnh riêng, hoặc đã qua migrate) → dùng giá trị đó.
   - Nếu chưa có (Space mới, hoặc user chưa từng đụng vào layout của Space này kể từ khi có tính năng này) → dùng `defaultDashboardLayout()` (bố cục mặc định hệ thống, không phải layout cũ của Space khác).
3. Không có bước ghi storage nào xảy ra chỉ vì đọc — chỉ đọc.

### 3.2 Sửa layout (kéo-thả / resize splitter / khôi phục mặc định)

1. User đang mở Space `spaceId`, thực hiện 1 thao tác đổi layout (kéo-thả đổi vị trí, resize qua splitter, hoặc bấm "Khôi phục bố cục mặc định" trong Settings).
2. App tính layout mới, ghi **đúng 1 entry** `settings.dashboardLayouts[spaceId] = <layout mới>` — các entry của Space khác trong map giữ nguyên, không đụng tới.
3. Debounce 600ms lưu lên Supabase như cơ chế hiện có (không đổi).

### 3.3 Migrate lần đầu (user cũ đã có `dashboardLayout` đơn, nâng cấp lên bản có tính năng này)

1. Lúc `normalizeSettings()` chạy (load app / import JSON), phát hiện dữ liệu thô còn field `dashboardLayout` (object đơn, schema cũ) mà chưa có `dashboardLayouts` (map, schema mới) hợp lệ.
2. Giữ nguyên object `dashboardLayout` cũ đó (không xoá khỏi payload lưu trữ, đổi vai trò thành **giá trị fallback lịch sử, chỉ đọc**) — không cần 1 bước "quét toàn bộ danh sách Space rồi ghi N entry vào map" (xem mục 4.3 vì sao **không** khuyến nghị làm eager-migrate kiểu này).
3. Từ thời điểm này, MỌI Space (kể cả Space cũ đã có từ trước, kể cả Shared Space user đã là member từ trước, kể cả Space mới tạo/join sau này) khi được đọc layout ở bước 3.1 mà chưa có entry riêng trong `dashboardLayouts`, đều tự động fallback về đúng layout đơn cũ đó — tức "layout hiện tại user đang dùng trở thành giá trị khởi đầu cho mọi Space đang có", đúng yêu cầu, nhưng thực hiện bằng **đọc-fallback tại chỗ** thay vì eager-write toàn bộ map 1 lần.
4. Ngay khi user chỉnh layout của 1 Space bất kỳ (bước 3.2), Space đó "tách" khỏi fallback chung, có entry riêng trong map từ đó về sau. Các Space chưa từng bị chỉnh vẫn tiếp tục fallback về layout đơn cũ mãi mãi (không tự động "đóng băng" giá trị — hành vi này là chủ đích, xem mục 4.3).

---

## 4. Phương án lưu trữ — phân tích + khuyến nghị

### 4.1 Phương án (a) — Layout theo (user, Space), vẫn ở cấp `Settings` — **khuyến nghị**

Đổi field:
```
Settings.dashboardLayout: DashboardLayout            // cũ — giữ lại làm fallback lịch sử (đọc, không ghi mới)
Settings.dashboardLayouts: Record<string, DashboardLayout>   // mới — key = spaceId
```

Vẫn nằm ở cấp `Settings` trong `kn_space_state` (cấp user, **không đồng bộ giữa các thành viên Shared Space**) — chỉ đổi từ "1 object" thành "map nhiều object khoá theo `spaceId`".

**Ưu điểm:**
- Đúng đề bài: mỗi Space có layout riêng.
- Với Space cá nhân: tự nhiên đã "riêng của user" vì cả Space vốn chỉ thuộc 1 user — không có gì mới cần cân nhắc thêm.
- Với Shared Space: mỗi **thành viên** (không phải mỗi Space) tự do sắp xếp layout xem theo ý mình — A sắp xếp lại không ảnh hưởng B, đúng bản chất "layout = sở thích xem", khác Task/Note/Log là dữ liệu cộng tác thật cần LWW dùng chung.
- **Không đụng gì tới `kn_shared_spaces`** — không cột mới, không RLS mới, không tương tác với optimistic-locking (`version`) của Shared Space. Toàn bộ thay đổi nằm gọn trong `kn_space_state.settings` (jsonb) — bảng/luồng lưu trữ đã tồn tại, chỉ đổi shape 1 field bên trong.
- `spaceId` dùng làm key nhất quán cho cả Space cá nhân lẫn Shared Space: `rowToSpace()` trong `sharedSpaceStore.ts` set `id: row.id` (= id thật của hàng `kn_shared_spaces`) — cùng không gian định danh với `Space.id` của Space cá nhân, không cần ánh xạ riêng.
- Export/Import JSON: `normalizeImportedSpace()` giữ nguyên `id` gốc của Space khi import (đã xác nhận qua đọc code `appReducer.ts` `IMPORT_DATA`) → map `dashboardLayouts` khoá theo `spaceId` sống sót đúng qua chu trình export/import, không cần xử lý gì thêm.

**Nhược điểm / đánh đổi:**
- `Settings` phình thêm 1 map có thể lớn dần theo số Space user tạo qua thời gian (nếu không dọn dẹp khi xoá Space — xem mục 8 câu hỏi mở #3). Không giới hạn kỹ thuật nghiêm trọng (jsonb Postgres, quy mô cá nhân/nhóm nhỏ) nhưng nên có cơ chế dọn rác.

### 4.2 Phương án (b) — Layout gắn thẳng vào `Space` object (giống pattern `enabledBlocks`/`logs`)

```
interface Space {
  ...
  dashboardLayout: DashboardLayout; // mới
}
```

**Ưu điểm:** nhất quán pattern với `enabledBlocks` vừa fix hôm nay (7/7) cho Shared Space — mọi cấu hình theo-Space đều nằm trong `Space` object.

**Nhược điểm (quyết định — KHÔNG khuyến nghị):**
- Với Space cá nhân: vô hại (Space vốn thuộc 1 user).
- Với Shared Space: dữ liệu Space chung lưu **1 dòng DUY NHẤT** trong `kn_shared_spaces`, dùng chung cho MỌI thành viên — y hệt bug `enabledBlocks` vừa fix hôm nay. Nếu đặt `dashboardLayout` vào `Space`, layout của Shared Space sẽ **dùng chung cho mọi thành viên**: A sắp xếp lại layout, B mở lên cũng bị đổi theo. Đây gần như chắc chắn **không phải điều user muốn** — user không hề đề cập muốn ép layout lên người khác, và bản chất layout (sở thích xem) khác hẳn bản chất `enabledBlocks` (cấu hình chức năng của cả Space, hợp lý dùng chung) hay Task/Note (dữ liệu cộng tác thật).
- Cần thêm cột `dashboard_layout jsonb` vào `kn_shared_spaces`, thêm vào `rowToSpace()`/`saveSharedSpace()`/RLS liên quan — tốn công hơn phương án (a) mà lại giải quyết sai bài toán.

### 4.3 Vì sao đọc-fallback tại chỗ, không eager-migrate ghi sẵn map cho mọi Space

Cân nhắc thêm ngoài yêu cầu gốc, phát hiện khi đọc code `AppStateContext.tsx`: Space cá nhân và Shared Space **không load cùng lúc** — `loadAppState()` (đọc `kn_space_state`, nơi `normalizeSettings()` chạy) hoàn tất TRƯỚC, sau đó `loadSharedSpaces()` mới chạy riêng (có thể lỗi/rỗng, không chặn app). Nếu chọn cách "eager-migrate": tại thời điểm `normalizeSettings()` chạy, quét toàn bộ danh sách Space hiện có rồi ghi sẵn N entry vào `dashboardLayouts` — thời điểm đó **chưa biết Shared Space nào** (load sau), nên Shared Space sẽ bị bỏ sót khỏi đợt migrate, phải viết thêm 1 đường xử lý riêng cho "Space xuất hiện muộn hơn lúc migrate chạy".

Cách "đọc-fallback tại chỗ" (mục 3.1, 3.3) tránh hẳn vấn đề thứ tự load này: không cần biết trước danh sách đầy đủ Space, không cần chạy đúng 1 lần tại đúng 1 thời điểm — bất kỳ Space nào (cũ, mới, load sớm hay muộn) khi được yêu cầu layout mà chưa có entry riêng, đều tự nhiên fallback về layout đơn cũ. Đây là khuyến nghị implementation cụ thể (không bắt buộc `dev` phải làm đúng y hệt), nêu ra vì nó giải quyết gọn 1 rủi ro thật trong kiến trúc load 2 nguồn dữ liệu (private + shared) không đồng bộ hoá thời điểm.

### 4.4 Khuyến nghị

**Chọn phương án (a).** Lý do tóm tắt: đúng yêu cầu (mỗi Space 1 layout), không đụng schema/RLS Shared Space, không có rủi ro "ép layout lên người khác" mà phương án (b) chắc chắn gây ra với Shared Space, tận dụng đúng cơ chế `Settings` (cấp user, không đồng bộ giữa thành viên) sẵn có.

---

## 5. Migration — chi tiết

- **Không cần script/RPC SQL riêng** (khác các thay đổi liên quan `kn_shared_spaces` trước đây như `fix-shared-space-enabled-blocks.sql`) — toàn bộ nằm trong `settings` (jsonb) của `kn_space_state`, xử lý hoàn toàn ở tầng normalize client (giống cách `dashboardLayout` đơn hiện tại đã migrate từ schema "layout riêng từng Space" — tiền lệ `findLegacyDashboardLayout()`/`legacyDashboardLayout` trong `normalize.ts`, đảo chiều lại lần này).
- Giá trị `dashboardLayout` đơn hiện có của user **trở thành giá trị khởi đầu (fallback) cho MỌI Space đang có** — đúng yêu cầu — bằng cơ chế đọc-fallback (mục 3.1/3.3/4.3), không phải ghi cứng 1 lần.
- Field `dashboardLayout` đơn cũ **giữ nguyên trong schema** (không xoá) — chỉ đổi vai trò từ "nguồn sự thật duy nhất" thành "giá trị fallback lịch sử, chỉ đọc, không còn được ghi mới bởi bất kỳ hành động nào của user sau khi tính năng này lên production". Việc "khôi phục bố cục mặc định" (mục 6) reset về `defaultDashboardLayout()` (bố cục mặc định hệ thống cứng trong code), KHÔNG reset về giá trị `dashboardLayout` đơn cũ này.
- User hoàn toàn mới (chưa từng có `dashboardLayout` nào, tài khoản tạo sau khi tính năng này lên production): không có object cũ để fallback — mọi Space (kể cả Space đầu tiên seed) dùng thẳng `defaultDashboardLayout()` khi chưa có entry riêng trong map.

---

## 6. Change impact (mức tính năng — không liệt kê từng dòng code, đó là việc `dev`)

1. **`src/types.ts`** — `Settings.dashboardLayout: DashboardLayout` đổi/bổ sung thành `Settings.dashboardLayouts: Record<string, DashboardLayout>` (key = `spaceId`), giữ lại field đơn cũ với vai trò fallback lịch sử (xem mục 5). Cần đổi comment giải thích lại đúng bản chất mới (comment hiện tại nói "DÙNG CHUNG cho mọi Space" theo đúng yêu cầu mục 4 — sẽ sai sau khi đổi).
2. **`src/layout/useDashboardLayout.ts`** — hiện đọc thẳng `state.settings.dashboardLayout` (1 giá trị cố định). Cần đổi sang đọc theo `state.currentSpaceId`, áp đúng thứ tự fallback (mục 3.1). Toàn bộ state local (`layout`, `layoutRef`, effect đồng bộ lại từ storage) cần thêm phụ thuộc vào `currentSpaceId` — đổi Space phải load lại đúng layout của Space đó, không giữ layout cũ đang hiển thị.
3. **`src/state/reducers/settings.ts`** — `SETTINGS_SET_DASHBOARD_LAYOUT` và `SETTINGS_RESET_DASHBOARD_LAYOUT` hiện ghi đè thẳng `settings.dashboardLayout`. Cần đổi payload có thêm `spaceId`, ghi vào đúng 1 entry `dashboardLayouts[spaceId]` (giữ nguyên các entry khác trong map).
4. **`src/state/seed.ts`** — `defaultDashboardLayout()` giữ nguyên nguyên trạng (vẫn là hàm tạo 1 `DashboardLayout` — dùng làm fallback cấp 2 sau map, cấp 3 sau field đơn cũ, xem mục 3.1). `defaultSettings()` đổi field khởi tạo (`dashboardLayouts: {}` thay vì `dashboardLayout: defaultDashboardLayout()` — hoặc giữ cả 2 tuỳ `dev` quyết định xử lý user hoàn toàn mới, xem mục 5).
5. **`src/storage/normalize.ts`** — `normalizeDashboardLayout()` (chuẩn hoá cấu trúc 1 `DashboardLayout`) giữ nguyên, dùng lại cho từng entry trong map. `normalizeSettings()` cần đổi cách xử lý field layout: không còn 1 object để chuẩn hoá, mà là chuẩn hoá từng entry trong `dashboardLayouts` (nếu có) + validate/giữ nguyên field đơn cũ làm fallback. Không cần đổi `findLegacyDashboardLayout()`/cơ chế `legacyDashboardLayout` hiện có (đây là lớp fallback CŨ HƠN nữa, từ thời layout còn lưu trong `Space`, trước khi gộp về `Settings` — vẫn giữ nguyên làm lớp fallback sâu nhất nếu cả `dashboardLayouts` map lẫn field đơn `dashboardLayout` đều thiếu).
6. **`src/features/settings/SettingsModal.tsx`** (nút "Khôi phục bố cục mặc định", dòng ~229) — hiện dispatch `SETTINGS_RESET_DASHBOARD_LAYOUT` không kèm ngữ cảnh Space. Sau khi đổi, hành vi nút này cần định nghĩa lại rõ: **chỉ reset layout của Space đang mở hiện tại** (không phải reset toàn bộ map của mọi Space) — xem AC tương ứng mục 7. Copy chữ trên nút có thể cần đổi (vd thêm tên Space) — quyết định `uiux`.
7. **`src/state/appReducer.ts`** — `IMPORT_DATA` hiện gọi `normalizeSettings(action.payload.settings ?? defaultSettings(), undefined, findLegacyDashboardLayout(rawSpaces))`. Cần đảm bảo `ExportPayload.settings` export/import đúng cả field `dashboardLayouts` map lẫn field đơn cũ (nếu còn) — không cần đổi field `ExportPayload` (đã export nguyên `settings` object).
8. **Không đụng `src/storage/sharedSpaceStore.ts`, không đụng `kn_shared_spaces` schema** — đây là lợi thế chính của phương án (a), xem mục 4.1.
9. **Dọn dẹp map khi xoá Space** (đề xuất, không bắt buộc — xem câu hỏi mở #3 mục 8): `SPACE_DELETE`, rời Shared Space (`leaveSpace`), bị kick khỏi Shared Space, Owner xoá Shared Space — các luồng này có thể xoá kèm `dashboardLayouts[spaceId]` tương ứng để tránh map phình vô hạn theo thời gian. Không xoá cũng không gây lỗi (entry mồ côi vô hại, chỉ tốn vài trăm byte jsonb) — mức độ ưu tiên thấp.
10. **`docs/requirements.md`** — mục 4 (câu "Lưu toàn bộ cấu trúc layout... dùng chung cho mọi Space"), mục 6 (bullet "Tỉ lệ layout"/"Thứ tự khối chính" trong "Settings dùng chung mọi Space"), mục 10 (không có mô tả trực tiếp field này nhưng nên rà lại) cần cập nhật lại cho khớp sau khi chốt hướng — đã gắn ghi chú tạm "đang xem xét" tại 2 vị trí đầu (xem đầu file này).

---

## 7. Acceptance Criteria

- **AC1:** Ở Space A, kéo-thả đổi vị trí khối hoặc resize splitter → chuyển sang Space B → layout Space B **không đổi** so với trước khi chỉnh Space A.
- **AC2:** Quay lại Space A → layout đã chỉnh ở AC1 **vẫn giữ nguyên** đúng như lúc chỉnh (không bị reset về mặc định, không bị layout của Space B đè lên).
- **AC3:** Reload trang (F5) sau khi đã chỉnh layout riêng cho 2+ Space khác nhau → mở lại đúng Space đang mở lúc F5, thấy đúng layout đã lưu riêng của Space đó (không bị trộn/mất).
- **AC4:** User cũ (đã có `dashboardLayout` đơn từ trước khi tính năng này lên production) — mở bất kỳ Space nào **chưa từng bị chỉnh riêng sau khi tính năng lên production** → thấy đúng layout đơn cũ (không phải `defaultDashboardLayout()` trống trơn) — đúng yêu cầu "layout hiện tại làm giá trị khởi đầu cho mọi Space đang có".
- **AC5:** Tạo Space mới (Space cá nhân) sau khi tính năng lên production → layout khởi tạo là `defaultDashboardLayout()` (bố cục mặc định hệ thống), không phải copy layout của Space đang mở lúc tạo.
- **AC6 (Shared Space):** 2 tài khoản khác nhau cùng là member 1 Shared Space — tài khoản A chỉnh layout của Space đó → tài khoản B mở lại (kể cả sau reload) **không thấy layout của mình bị đổi theo A** — mỗi người giữ layout riêng của mình cho cùng 1 Shared Space.
- **AC7:** Bấm "Khôi phục bố cục mặc định" trong Settings khi đang mở Space X → chỉ layout của Space X đổi về `defaultDashboardLayout()`; layout đã lưu riêng của các Space khác không bị ảnh hưởng.
- **AC8:** Export JSON → Import lại đúng file đó (cùng tài khoản hoặc tài khoản khác) → layout riêng từng Space khôi phục đúng, khớp `spaceId` (không bị trộn lẫn/rơi rớt giữa các Space).
- **AC9:** `npm run build` + `npx tsc --noEmit` pass sau khi đổi shape `Settings.dashboardLayout` → `dashboardLayouts` — không còn chỗ nào trong code cũ giả định "chỉ có 1 layout duy nhất" gây lỗi biên dịch bị bỏ sót.

---

## 8. Câu hỏi mở cần chủ dự án xác nhận

1. **Xác nhận hướng Shared Space (quan trọng nhất):** đồng ý với đề xuất "mỗi thành viên tự do sắp xếp layout xem của Shared Space theo ý mình, không đồng bộ với thành viên khác" (phương án a, mục 4.1) — hay thực ra muốn layout Shared Space cũng là thứ cả nhóm thống nhất dùng chung (phương án b, mọi thành viên thấy y hệt nhau)? Tài liệu này mặc định đề xuất phương án (a) vì cho là đúng bản chất "layout = sở thích xem cá nhân", nhưng đây là suy luận của `ba`, chưa phải xác nhận của chủ dự án.
2. **Nút "Khôi phục bố cục mặc định"** — xác nhận hành vi mới đề xuất ở AC7 (chỉ reset Space đang mở, không reset toàn bộ) là đúng ý muốn? (Hành vi cũ, trước tính năng này: reset toàn bộ vì chỉ có 1 layout).
3. **Dọn dẹp map khi xoá/rời Space** — có cần chủ động xoá entry `dashboardLayouts[spaceId]` tương ứng khi xoá Space (cá nhân), rời/bị kick khỏi Shared Space, hay Owner xoá Shared Space không? Đề xuất: có (dọn rác, đỡ phình `settings` theo thời gian) nhưng không bắt buộc — cần xác nhận có đáng làm ngay trong đợt này hay để sau.
4. **Space mới tạo sau khi tính năng lên production khởi tạo từ đâu** — xác nhận AC5 (`defaultDashboardLayout()` hệ thống) là đúng ý muốn, hay muốn Space mới copy layout của Space đang mở tại thời điểm tạo (gần với trải nghiệm "layout hiện tại là khởi đầu" hơn, nhưng có thể không hợp nếu Space mới dùng cho mục đích rất khác)?
5. **Field đơn `dashboardLayout` cũ giữ vĩnh viễn hay dọn sau 1 thời gian** — mục 5 đề xuất giữ vĩnh viễn làm fallback lịch sử (đơn giản, không có "ngày hết hạn migrate"). Có cần đặt mốc thời gian để sau này dọn hẳn field này khỏi schema không (vd sau khi xác nhận không còn Space nào thật sự dựa vào fallback này nữa)? Đề xuất: không cần, không đáng công sức ở quy mô hiện tại — nhưng nêu ra để chủ dự án biết đây là "nợ kỹ thuật nhỏ, chấp nhận được" chứ không phải bị bỏ sót.

**Không có câu hỏi nào trong 5 câu trên chặn việc bắt đầu code với phương án (a) mục 4.4** — trừ câu #1 (Shared Space), câu quan trọng nhất, nên xác nhận trước khi giao `uiux`/`dev`. Các câu #2–#5 có thể chốt theo đề xuất mặc định của `ba` nếu chủ dự án không phản đối, nhưng vẫn liệt kê tường minh thay vì tự quyết âm thầm.

> **Cập nhật 2026-07-08:** Chủ dự án đã xác nhận câu #1 (mục 8) theo đúng đề xuất — Shared Space: mỗi thành viên tự sắp layout riêng, không đồng bộ giữa các thành viên. Layout cũ hiện có của user tự động là giá trị khởi đầu (fallback) cho mọi Space đang có, đúng mục 3.3/4.3/5. Mục 9 dưới đây là quyết định UX cho 4 câu hỏi tương tác chủ dự án giao trực tiếp cho `uiux`, trong đó có 2 câu trùng/đào sâu thêm câu #2 và #4 mục 8.

---

## 9. Quyết định UX (uiux, 2026-07-08)

Đã đọc `src/features/spaces/SpaceSwitcher.tsx`, `src/layout/useDashboardLayout.ts`, `src/features/settings/SettingsModal.tsx` (nút "Khôi phục bố cục mặc định", dòng ~229) trước khi quyết. Không viết code — mô tả UX để `dev` triển khai.

### 9.1 Layout khởi tạo Space mới — `defaultDashboardLayout()`, KHÔNG copy Space đang mở

**Quyết định: giữ đúng AC5 (mục 7) — trả lời câu #4 mục 8.** Space mới (cá nhân hoặc chung) luôn khởi tạo bằng `defaultDashboardLayout()` chuẩn, không copy layout của Space đang mở tại thời điểm tạo.

Lý do (đánh đổi dễ đoán/consistency lấy tiện lợi/ít thao tác lặp — chọn vế đầu):
- **Copy tạo kết quả không xác định trước với người dùng**: layout Space mới sẽ phụ thuộc "Space nào đang mở lúc bấm Tạo" — 1 chi tiết ngữ cảnh dễ quên. Tạo 2 Space mới ở 2 thời điểm khác nhau (đang mở Space A vs Space B) ra 2 kết quả khác nhau, khó giải thích/khó hỗ trợ khi user thắc mắc "sao lần này khác lần trước".
- **Rủi ro "layout rò rỉ" sai ngữ cảnh**: 1 layout đã tối ưu cho mục đích rất riêng (vd Space "Chi tiêu" phóng to Nhật ký, thu nhỏ Việc cần làm) copy sang Space mới có mục đích khác hẳn → user bối rối "tôi chưa chỉnh gì mà sao khối Việc cần làm bé thế này" — vi phạm kỳ vọng tự nhiên "Space mới = bố cục cân đối, chưa ai đụng vào".
- **Edge case tạo Space đầu tiên** (chưa có Space nào đang mở để copy) vẫn phải fallback default — nếu đã bắt buộc có nhánh default, thêm nhánh "copy nếu có Space đang mở" chỉ tăng số đường cần test, lợi ích nhỏ vì default vốn đã là bố cục cân đối sẵn dùng được ngay, không phải "trống trơn" phải sắp lại từ đầu.
- Nhất quán với user hoàn toàn mới (mục 5: dùng thẳng `defaultDashboardLayout()`) — 1 quy tắc duy nhất "Space mới luôn bắt đầu từ mặc định" áp dụng như nhau cho mọi trường hợp tạo Space, dễ giải thích, dễ nhớ.

Không cần hint/thông báo gì thêm cho hành vi này trên UI — đúng kỳ vọng ngầm hợp lý ("Space mới thì trống/mặc định"), giống cách Task/Note/Habit của Space mới cũng trống theo mặc định.

### 9.2 Chuyển Space đổi cả layout — KHÔNG thêm transition/animation

**Quyết định: giữ nguyên hành vi hiện tại, không thêm crossfade/transition khi `SPACE_SWITCH`.**

Đã đọc `SpaceSwitcher.tsx` (`dispatch({ type: 'SPACE_SWITCH', ... })`, dòng 217) và `useDashboardLayout.ts` (effect đồng bộ `persistedLayout` → `layout` local, dòng 48-51): đổi Space hiện là **"cắt cảnh" tức thì** ở mọi phương diện — Task/Note/Habit/Reminder đổi ngay lập tức, không hề có transition giữa 2 state. Sau khi `dashboardLayouts` theo Space, layout cũng đổi theo đúng cơ chế tức thì đó — không có sẵn transition nào để "tận dụng lại", và cũng không nên tự thêm mới.

Lý do KHÔNG thêm animation:
- **Nhất quán hành vi đã có**: nếu chỉ thêm transition riêng cho phần layout (grid resize mượt) mà không cho phần nội dung (danh sách đổi ngay tức thì), 2 phần chạy 2 tốc độ khác nhau trong cùng 1 hành động — rối mắt hơn là mượt hơn.
- **Rủi ro kỹ thuật thật**: theo comment trong `useDashboardLayout.ts` (dòng 44-51, 88-89), cơ chế resize đã được tinh chỉnh kỹ để tránh giật khi kéo tay (`draggingRef.current` chặn đồng bộ ngược lúc đang kéo). Thêm CSS `transition` cho `grid-template-columns/rows` ở container để làm mượt lúc đổi Space sẽ áp dụng cho MỌI lần layout đổi giá trị — kể cả lúc user tự kéo-thả/resize bằng tay — phá cảm giác "bám tay" mượt đang có (resize bị trễ theo transition thay vì bám đúng vị trí chuột). Đánh đổi không đáng.
- **Đổi Space là hành động chủ đích** (user tự bấm chọn trong Space-switcher), không phải cập nhật nền/real-time ngoài ý muốn — không cần "làm dịu" bằng animation như trường hợp remote sync đổi dữ liệu bất ngờ. Layout khác đi nằm gọn trong kỳ vọng "mọi thứ trong Space khác sẽ khác", không phải bất ngờ cần xử lý riêng.
- Đúng nguyên tắc không tự sáng tạo pattern animation mới khi chưa có sẵn — đã kiểm tra `SpaceSwitcher.tsx`/`useDashboardLayout.ts`, không tồn tại transition nào cho việc này.

**Lưu ý kỹ thuật cho `dev`** (không phải animation, chỉ đảm bảo đúng-đắn): lúc `SPACE_SWITCH`, layout mới và nội dung mới (Task/Note...) cần áp dụng trong cùng 1 nhịp render — tránh render layout cũ 1 tick rồi mới nhảy sang layout mới ở tick sau ("flash of stale layout").

### 9.3 Có cần giải thích "Shared Space layout riêng từng người" — CÓ, đặt trong Settings, không đặt trên Dashboard

**Quyết định: có, thêm 1 câu hint điều kiện trong Settings > tab Chung > khối "Bố cục Dashboard" khi Space đang mở là Shared Space. KHÔNG thêm banner/tooltip nào trên chính mặt Dashboard.**

Đây là rủi ro thật, không phải thừa: `enabledBlocks` (khối nào hiện/ẩn) vừa sửa hôm nay lại **dùng chung cho cả nhóm**, còn `dashboardLayouts` (khối đó to/nhỏ/ở đâu) lần này lại **riêng từng người** — 2 khái niệm rất gần nhau về cảm giác "cấu hình Dashboard của 1 Space", dễ khiến Owner ngộ nhận "tôi sắp layout đẹp, cả nhóm sẽ thấy giống vậy" (đúng với `enabledBlocks`, sai với `dashboardLayouts`) → khi thành viên khác báo "tôi không thấy đổi gì", dễ hiểu nhầm là bug thay vì hành vi chủ đích.

Sửa đoạn hint đã có sẵn ở `SettingsModal.tsx` (dòng 224-228, ngay trên nút "Khôi phục bố cục mặc định"), nối thêm câu theo điều kiện Space đang mở:

- Space cá nhân — giữ nguyên hint gốc, không thêm gì (user vốn ngầm hiểu "Space" = Space đang mở, không mơ hồ):
  > "Kéo-thả khối bất kỳ vào vị trí khác để sắp xếp lại (thả vào giữa khối khác để chèn trên/dưới, thả vào mép trái/phải để ghép 2 khối nằm ngang). Kéo đường kẻ ẩn giữa các khối/cột để đổi kích thước."

- Space chung — nối thêm 1 câu cuối cùng đoạn hint (không tách khối riêng, tránh phình to):
  > "... Kéo đường kẻ ẩn giữa các khối/cột để đổi kích thước. Bố cục này chỉ áp dụng cho riêng bạn trong "{tên Space}" — không ảnh hưởng cách các thành viên khác nhìn thấy."

Vì sao KHÔNG đặt hint này trên Dashboard: kéo-thả/resize không phải thao tác hàng ngày (khác Task/Note dùng liên tục) — user chỉ cần biết thông tin này 1 lần trước khi thao tác, đúng lúc đang ở màn hình cấu hình (Settings), không cần lặp lại mỗi lần mở Shared Space trên Dashboard chính — tránh noise cho thao tác thường ngày. Không dùng modal/toast riêng cho 1 câu thông tin phụ (over-engineering so với mức độ nghiêm trọng). Dùng lại đoạn `hint` text sẵn có (class `hint`, token `--text-dim`, tự đổi theo theme sáng/tối không cần thêm gì) — đúng pattern đã tồn tại trong file, không tạo pattern cảnh báo mới.

### 9.4 Nút "Khôi phục bố cục mặc định" — làm rõ phạm vi qua hint dùng chung (9.3) + `aria-label`/`title`, không nhét tên Space vào nhãn nút

**Quyết định: trả lời câu #2 mục 8 — đồng ý hành vi AC7 (chỉ reset Space đang mở).** Về UI: KHÔNG đổi nhãn hiển thị trên nút (giữ "Khôi phục bố cục mặc định", ngắn gọn, dễ scan); phạm vi đã được nêu rõ qua đoạn hint sửa ở 9.3 nằm ngay phía trên nút (cùng 1 khối `setting-block` — đọc hint xong là thấy nút, không cần lặp lại thông tin trong chính nhãn nút). Bổ sung `aria-label`/`title` cho nút, dạng `Khôi phục bố cục mặc định cho Space "{tên Space}"`, để:
- Người dùng screen reader nghe đủ ngữ cảnh khi focus vào nút (khác nhãn hiển thị ngắn).
- Người dùng dùng chuột thấy tooltip xác nhận đúng Space khi hover trước khi bấm.
- Khớp pattern đã dùng cho các nút icon khác cùng dự án (`SpaceSwitcher.tsx`: `title="Đổi space"` / `aria-label="Đổi space hiện tại"` — nội dung `title`/`aria-label` chi tiết hơn nhãn hiển thị).

Lý do không nhét tên Space thẳng vào nhãn nút: tên Space không giới hạn độ dài, nhét vào text nút `btn-ghost` dễ vỡ layout (đặc biệt `max-md:grid-cols-1` — cột hẹp trên tablet/mobile) hoặc buộc truncate giữa chừng, đọc dở.

**9.4.1 Edge case phát hiện thêm khi rà luồng (ngoài 4 câu hỏi gốc, đề xuất cho `ba`/chủ dự án xác nhận, chưa tự coi là đã chốt):** nút này hiện **bấm là reset ngay**, không qua modal xác nhận (`showConfirm` không được gọi ở dòng 229 `SettingsModal.tsx`) — khác các hành động phá huỷ khác trong cùng dự án (vd "Đăng xuất" dòng 215 cùng file, "Xoá space" trong `SpaceSwitcher.tsx` dòng 189, đều bọc qua `showConfirm`). Sau khi tính năng này lên, mức độ nghiêm trọng của việc bấm nhầm còn **tăng** (không giảm): trước đây lỡ bấm chỉ mất 1 layout dùng chung, giờ mỗi Space có công sức sắp riêng, lỡ bấm mất đúng công sức của Space đang mở, không hoàn tác được. Đề xuất bọc qua `showConfirm` sẵn có (modal tuỳ biến đúng pattern dự án, không dùng `window.confirm`):
```
showConfirm(
  'Khôi phục bố cục mặc định?',
  'Bố cục bạn đã sắp xếp riêng cho Space "{tên Space}" sẽ mất, không thể hoàn tác.',
  () => dispatch({ type: 'SETTINGS_RESET_DASHBOARD_LAYOUT', payload: { spaceId: currentSpace.id } }),
);
```

### 9.5 Change impact bổ sung cho `dev` (ngoài mục 6 của `ba`)

- `SettingsModal.tsx`: đoạn hint khối "Bố cục Dashboard" (dòng ~224-228) cần đọc `currentSpace` (`state.spaces.find(s => s.id === state.currentSpaceId)`) để: (1) nối câu điều kiện khi `isShared` (9.3); (2) đặt `aria-label`/`title` cho nút reset chứa tên Space (9.4); (3) — nếu chốt 9.4.1 — bọc nút qua `showConfirm`.
- Không cần sửa gì ở `SpaceSwitcher.tsx`/`useDashboardLayout.ts` riêng cho phần UX này (9.1, 9.2) — xác nhận giữ nguyên hành vi hiện tại, không phải bỏ sót.
- Ghi chú phạm vi (không phải việc cần làm thêm): tính năng `dashboardLayouts` chỉ có ý nghĩa trên desktop (mobile ≤639px dùng accordion 2 khối cố định, không đọc theo `spaceId`) — khối Settings "Bố cục Dashboard" hiện hiển thị đồng nhất mọi kích thước màn hình dù nội dung hint nói về kéo-thả/resize (hành vi chỉ có trên desktop). Đây là hạn chế đã tồn tại từ trước tính năng này, ngoài phạm vi đợt này, nêu ra để không bị hiểu nhầm là bỏ sót.

---

## 9. Đánh giá kỹ thuật của `dev` (trước khi code — 2026-07-08)

Đọc code thật (`AppStateContext.tsx`, `normalize.ts`, `useDashboardLayout.ts`, `reducers/settings.ts`, `supabaseStore.ts`, `seed.ts`) để xác nhận phương án (a) mục 4.1/4.4 an toàn trước khi giao `dev` code thật. Kết luận: **an toàn, đồng ý phương án (a)**, kèm 2 rủi ro tầng implementation (không phải kiến trúc) cần `dev` xử lý khi viết code — không chặn bắt đầu.

### 9.1 Race condition khi đổi Space liên tục

Xác nhận: đổi Space (`currentSpaceId`) **không** kích hoạt lưu/đọc Supabase — debounce-save (`AppStateContext.tsx` dòng 121-126) chỉ theo dõi `[state.spaces, state.settings]`, không có `currentSpaceId` trong deps; đổi Space chỉ ghi `localStorage` (dòng 212-215). Chỉ có 1 timer debounce module-level (`saveTimer` trong `supabaseStore.ts`) dùng chung cho mọi thay đổi — không có tranh chấp nhiều timer.

**Rủi ro thật phát hiện thêm:** nếu `spaceId` dùng để ghi entry vào `dashboardLayouts` được đọc từ `state.currentSpaceId` **tại thời điểm dispatch** (`mouseup`) thay vì **tại thời điểm bắt đầu kéo** (`mousedown`), user đổi Space giữa lúc đang kéo/resize (không có gì khoá UI Space-switcher trong lúc kéo splitter) sẽ khiến layout đang kéo dở của Space A bị ghi nhầm vào entry Space B. Xác suất thấp nhưng có thật.
→ **Xử lý:** chốt `spaceId` vào 1 ref riêng (song song `layoutRef` đã có) tại `beginRowResize`/`beginColResize`/`beginSubColResize`, dùng ref đó khi dispatch ở `endResize`/`commit` — không đọc `state.currentSpaceId` sống lúc dispatch.

### 9.2 Kích thước jsonb

Không đáng lo. `defaultDashboardLayout()` (`seed.ts`) serialize ~1-3KB. Kể cả 50 Space (không thực tế với use-case cá nhân/nhóm nhỏ) → map ~100-150KB, nhỏ so với giới hạn jsonb Postgres. Dọn rác khi xoá Space (câu hỏi mở #3) là nice-to-have, không bắt buộc.

### 9.3 Migration an toàn

Đồng ý đọc-fallback tại chỗ, không eager-write (mục 3.3/4.3). Bổ sung 1 lý do: đây là **web app single-deployment** (Vercel) — mọi user luôn chạy đúng 1 bundle JS mới nhất khi reload, không có rủi ro "client cũ đọc field mới rồi crash" như app mobile rollout nhiều phiên bản song song. Field `dashboardLayout` đơn cũ không bị xoá/ghi mới, chỉ đổi role → không có cửa nào làm mất layout hiện tại của user thật.

### 9.4 Xác nhận không đụng Shared Space

Xác nhận chắc chắn qua code: `settings` (chứa `dashboardLayouts`) là field cấp **user**, tách biệt hoàn toàn khỏi luồng `saveSharedSpace`/optimistic-locking `version` (`AppStateContext.tsx` dòng 148-209, 325-360) — luồng đó chỉ gửi `{tasks, notes, reminders, logs, name, enabledBlocks}` lên `kn_shared_spaces`. Sửa layout của Shared Space vẫn ghi vào `kn_space_state.settings` (bảng riêng của user) qua debounce-save private-space hiện có.

### 9.5 Đề xuất field/action cụ thể

- `Settings.dashboardLayout: DashboardLayout` — giữ tên/type, đổi role thành fallback lịch sử (đọc-only).
- `Settings.dashboardLayouts: Record<string, DashboardLayout>` — field mới, key = `spaceId`.
- `SETTINGS_SET_DASHBOARD_LAYOUT`: `payload: { spaceId: string; layout: DashboardLayout }` → `{ ...settings, dashboardLayouts: { ...settings.dashboardLayouts, [spaceId]: layout } }`.
- `SETTINGS_RESET_DASHBOARD_LAYOUT`: `payload: { spaceId: string }` → chỉ reset đúng 1 entry (đúng AC7).
- `useDashboardLayout`: xem 9.1 (spaceIdRef) và 9.6 (memo hoá persistedLayout).

### 9.6 Rủi ro implementation thứ 2: referential-stability của `persistedLayout`

`persistedLayout` mới sẽ dạng `settings.dashboardLayouts[currentSpaceId] ?? settings.dashboardLayout ?? defaultDashboardLayout()`. Nhánh fallback `defaultDashboardLayout()` là factory — mỗi lần gọi trả object MỚI dù nội dung giống hệt. Nếu viết trực tiếp biểu thức này trong thân component không memo, khi Space chưa có entry riêng (đang dùng fallback), `useEffect` hiện tại (dòng 48-51 `useDashboardLayout.ts`, dep `[persistedLayout]`, so sánh reference) sẽ chạy lại ở **mọi re-render của app**, không chỉ khi layout thật sự đổi — vô hại về data nhưng gây re-render thừa, và về lý thuyết có thể giật ngược layout đang kéo nếu trùng thời điểm `draggingRef.current` tạm `false` giữa 2 lần mousemove.
→ **Xử lý:** `useMemo` khoá theo `[settings.dashboardLayouts, settings.dashboardLayout, currentSpaceId]`, hoặc đổi `defaultDashboardLayout()` thành hằng số module-level đọc-only thay vì factory gọi lại mỗi lần cần fallback.

### 9.7 Space mới tạo: default hay copy layout Space đang mở (trả lời câu hỏi mở #4 — góc kỹ thuật, UX do `uiux` quyết)

**`defaultDashboardLayout()` dễ và an toàn hơn rõ rệt, khuyến nghị nếu không có lý do UX bắt buộc phải copy:**
- **Default:** pure function không phụ thuộc context — `SPACE_CREATE` chỉ chạm `spacesReducer` như hiện tại, không đổi ranh giới reducer. Zero rủi ro, zero coupling mới.
- **Copy:** khả thi nhưng phải cross ranh giới 2 reducer — `SPACE_CREATE` hiện chỉ tác động `state.spaces`, copy cần đọc `state.settings.dashboardLayouts[currentSpaceId]` (thuộc `settingsReducer`) rồi ghi thêm entry mới vào map đó ở tầng `appReducer`. Không khó (ước nửa ngày code) nhưng là lần đầu 1 action "tạo Space" phải biết và ghi cả 2 slice cùng lúc — nợ kiến trúc nhỏ, đáng cân nhắc so với lợi ích UX trước khi chọn.

### 9.8 Kết luận

Đồng ý triển khai phương án (a). 2 điểm 9.1/9.6 là chi tiết implementation, không đổi kết luận kiến trúc, không chặn bắt đầu code — chỉ cần `dev` nhớ xử lý khi viết `useDashboardLayout.ts`/action mới.

---

## 10. Phương án thay thế (bàn lại 2026-07-08, bỏ qua kết luận cũ)

> **Vì sao mở lại:** chủ dự án xem demo dựa trên hướng mục 1-9 (layout tự do per-Space, khuyến nghị phương án (a)) và **không hài lòng** ("demo tệ quá, bỏ qua đi"). Yêu cầu rõ: đừng chỉ tinh chỉnh thêm phương án cũ — nghĩ **rộng hơn**, đặt nhiều hướng **khác nhau về bản chất** cạnh nhau, để `uiux`/`dev` góp ý theo góc riêng trước khi chốt. Mục này **chưa khuyến nghị chọn phương án nào**.

### 10.0 Bài toán gốc (không đổi, nhắc lại cho rõ)

Hệ layout Dashboard hiện tại là **free-form liên tục**: 3 cột (tỉ lệ % riêng), mỗi cột là danh sách khối xếp dọc (mỗi khối có trọng số `h`%), kéo-thả đổi vị trí (chèn trên/dưới/ghép ngang) + resize splitter ẩn liên tục theo pixel (`src/types.ts` — `DashboardLayout`/`LayoutSlot`, `src/layout/AppLayout.tsx`, `src/layout/dashboardLayoutUtils.ts`, `src/layout/useDashboardLayout.ts`). Hiện `Settings.dashboardLayout` là **1 giá trị DUY NHẤT** dùng chung mọi Space của user — đổi ở Space này ảnh hưởng ngay Space khác. User có nhiều Space nhu cầu khác hẳn nhau (Space "Chi tiêu" cần Nhật ký nhanh to; Space "MAFC" cần Ghi chú to; Space "Cá nhân" khác hẳn cả hai).

**Ràng buộc giữ nguyên, không bàn lại ở mục này** (đã chốt với chủ dự án, áp dụng cho MỌI phương án bên dưới như nhau): ở Shared Space, mỗi thành viên tự sắp xếp layout xem **riêng của mình**, không dùng chung/ép layout lên người khác cả nhóm — vẫn đúng bản chất "layout = sở thích xem cá nhân" bất kể chọn phương án lưu trữ/tương tác nào. Vì ràng buộc này không đổi giữa các phương án, nó **không phải tiêu chí phân biệt** — không nhắc lại ở từng phương án bên dưới trừ khi phương án đó có hệ quả riêng cần lưu ý.

Dưới đây là 5 phương án khác nhau về bản chất — không phải biến thể lưu trữ của cùng 1 ý tưởng.

---

### 10.1 Phương án A — Layout tự do (free-form), lưu riêng theo (user, Space)

*(Đây chính là hướng đã đào sâu ở mục 1-9 — đặt lại đây để so sánh công bằng với các phương án khác, không lặp lại toàn bộ chi tiết, chỉ tóm tắt.)*

**Cơ chế:** Giữ nguyên 100% cơ chế tương tác hiện có (kéo-thả chèn trên/dưới/ghép ngang, resize splitter liên tục theo %) — chỉ đổi **nơi lưu**: từ 1 `DashboardLayout` dùng chung, thành `Record<spaceId, DashboardLayout>` khoá theo Space. Mỗi Space có 1 bản sao đầy đủ, độc lập hoàn toàn.

**Ưu điểm:**
- Tận dụng 100% code layout-engine đã xây (`AppLayout.tsx`, `dashboardLayoutUtils.ts`, `Splitter.tsx`) — không viết lại UX kéo-thả/splitter.
- Tự do tối đa: đúng yêu cầu gốc ở mức chi tiết nhất (đến từng % width/height, từng vị trí cột/hàng), xử lý được cả trường hợp 3 Space khác nhau cả về **vị trí** khối lẫn **kích thước** (đúng những gì 3 ảnh mẫu thực tế cho thấy).

**Nhược điểm:**
- Đây chính là hướng **đã bị chê ở bản demo** — vấn đề nhiều khả năng không nằm ở "chỗ lưu" mà ở **bản thân trải nghiệm thao tác** (kéo-thả pixel-perfect + splitter mảnh) bị nhân lên N lần theo N Space: mỗi Space mới, user phải tự tay tinh chỉnh lại từ đầu, không có gợi ý/rút gọn nào — càng nhiều Space càng tốn công lặp lại thao tác vốn đã không phải "nhanh, dễ" (phải rê chuột đúng 25% mép, đúng khe splitter mảnh).
- `Settings` phình dần theo số Space (chấp nhận được ở quy mô nhỏ, nhưng là hướng "cộng dồn phức tạp" chứ không giảm).

**Độ phức tạp:** sản phẩm **thấp** (không đổi UX) — dữ liệu **thấp-vừa** (map theo spaceId, migration đã phân tích kỹ ở mục 3-6).
**Phù hợp quy mô nhỏ (1-10 người/Space):** có, nhưng đặt gánh nặng thao tác lặp lại lên chính người dùng — hiệu quả giảm dần khi số Space tăng.

---

### 10.2 Phương án B — Preset/Template layout chọn theo Space

**Cơ chế:** Hệ thống định nghĩa sẵn 1 bộ nhỏ "kiểu bố cục" cố định (vd 4-6 preset: "Ưu tiên Nhật ký", "Ưu tiên Ghi chú", "Ưu tiên Việc cần làm", "Cân bằng", "Tối giản 1 cột"...). Mỗi Space, user chỉ **chọn 1 preset** từ danh sách/gallery (không kéo-thả, không resize tự do) — Settings lưu `Record<spaceId, presetId>` (chuỗi ngắn, không phải object `DashboardLayout` đầy đủ). Nội dung từng preset (bố cục cột/khối/tỉ lệ cụ thể) là hằng số định nghĩa sẵn trong code, không sửa lẻ được (chọn preset khác là đổi hẳn, không có "preset + tinh chỉnh thêm").

**Ưu điểm:**
- Thao tác cực nhanh — bấm chọn 1 lần thay vì rê chuột tinh chỉnh nhiều bước; đúng nhu cầu thật "Space A cần khối X to" mà không đòi hỏi user tự vẽ layout.
- Dữ liệu lưu cực nhẹ (1 chuỗi id/Space thay vì object lồng nhau).
- Kết quả **dễ đoán, nhất quán**: 2 Space cùng chọn 1 preset luôn trông giống hệt nhau — dễ demo đẹp (ảnh minh hoạ rõ ràng cho từng preset), dễ hỗ trợ khi user thắc mắc.
- Không có khái niệm "layout xấu/vỡ" — mọi preset đều do đội ngũ thiết kế sẵn, luôn cân đối.

**Nhược điểm:**
- Mất tự do tinh chỉnh — nếu nhu cầu thật nằm "giữa 2 preset" (vd Nhật ký cần to nhưng không muốn hy sinh Ghi chú), không preset nào khớp 100%.
- Tốn công **thiết kế** (không chỉ code) để làm bộ preset đẹp/đủ dùng — và mỗi khi thêm khối mới vào hệ thống (như `logs` vừa thêm 2026-07-07) phải rà lại toàn bộ preset để không bị "thiếu chỗ" cho khối mới.
- Cần quyết định rõ: có bỏ hẳn UI kéo-thả/splitter hiện tại hay giữ song song? Nếu giữ song song (preset cho người muốn nhanh + free-form cho người muốn chi tiết) thì độ phức tạp UI/Settings tăng thêm, không giảm.

**Độ phức tạp:** sản phẩm **vừa** (cần thiết kế bộ preset) — dữ liệu **thấp** (chỉ lưu id).
**Phù hợp quy mô nhỏ (1-10 người/Space):** rất phù hợp — đúng mức "đủ dùng, không cầu kỳ" cho cá nhân/nhóm nhỏ.

---

### 10.3 Phương án C — Thư viện "Hồ sơ bố cục" (Layout Profile) tái sử dụng, gán N:1 vào Space

**Cơ chế:** Tách hẳn khái niệm "1 bố cục" ra khỏi khái niệm "1 Space". User tự **tạo/đặt tên/sửa** các "Hồ sơ bố cục" của riêng mình (dùng lại đúng UI kéo-thả/splitter hiện có để tạo ra 1 hồ sơ — về tương tác, giống hệt phương án A, nhưng áp dụng cho 1 entity độc lập, không gắn cứng 1 Space). Mỗi Space chỉ lưu 1 tham chiếu `layoutProfileId` — nhiều Space có thể **dùng chung 1 hồ sơ** (vd Space "Chi tiêu gia đình" và "Chi tiêu cá nhân" cùng gán hồ sơ "Ưu tiên Nhật ký" mà không cần kéo-thả lại lần 2).

**Ưu điểm:**
- Tận dụng lại UI kéo-thả/splitter đã build (chỉ đổi đối tượng nó áp vào: hồ sơ, không phải Space) — không cần viết lại engine.
- Giữ tự do tinh chỉnh pixel-perfect như phương án A, nhưng **không bắt lặp lại thao tác cho mỗi Space mới** — tạo 1 lần, gán nhiều nơi.
- Sửa 1 hồ sơ tự động cập nhật mọi Space đang gán nó — tiện nếu user chủ đích muốn nhiều Space cùng "phong cách".

**Nhược điểm (quyết định — KHÔNG khuyến nghị):**
- "Sửa 1 hồ sơ ảnh hưởng mọi Space đang dùng nó" là **con dao 2 lưỡi**, thậm chí có thể **đi ngược đúng pain point gốc** ("chỉnh Space A không được ảnh hưởng Space B") nếu user lỡ gán 2 Space dùng chung 1 hồ sơ rồi quên mất — lại quay về đúng vấn đề ban đầu, chỉ đổi từ "mọi Space" thành "mọi Space cùng gán 1 hồ sơ".
- Thêm hẳn 1 lớp UI/khái niệm mới (tạo/đặt tên/xoá/gán hồ sơ) tách biệt khỏi Space — tăng learning curve, nhiều bước thao tác hơn hẳn 2 phương án kia.
- Cần xử lý edge case mới: hồ sơ "mồ côi" (không Space nào gán), xoá hồ sơ đang có Space dùng, đổi tên hồ sơ...
- Mô hình N:1 (nhiều Space dùng chung cấu hình) thường có giá trị rõ khi có **rất nhiều** Space cần tái dùng cấu hình (SaaS/doanh nghiệp) — ở quy mô cá nhân/nhóm nhỏ (thường 3-6 Space), lợi ích tái dùng nhỏ hơn chi phí học khái niệm mới.

**Độ phức tạp:** sản phẩm **cao** (khái niệm mới + luồng CRUD/gán riêng) — dữ liệu **vừa** (2 tập dữ liệu: hồ sơ + ánh xạ Space→hồ sơ).
**Phù hợp quy mô nhỏ (1-10 người/Space):** có nguy cơ **over-engineering** so với quy mô thực tế của dự án.

---

### 10.4 Phương án D — Đơn giản hoá triệt để: "Ghim khối nổi bật" theo Space, KHÔNG có hệ layout riêng

**Cơ chế:** Bỏ hẳn ý tưởng "mỗi Space có 1 `DashboardLayout` riêng". Giữ **nguyên** 1 cấu trúc layout DUY NHẤT dùng chung mọi Space như hiện tại (không đổi field `dashboardLayout`, không map theo spaceId) — chỉ thêm **1 field rất nhỏ, per-Space**: `Space.featuredBlockId?: LayoutBlockKey` (tối đa 1, có thể mở rộng 1-2 nếu cần). Khối được "ghim" của Space đang mở tự động được cấp thêm trọng số hiển thị (vd nhân hệ số `h`/`w` cố định, hoặc nhảy thẳng lên 1 mức "to" định sẵn) **ngay tại vị trí nó đang có** trong cấu trúc chung — không đổi cột/vị trí, chỉ đổi kích thước tương đối.

Lựa chọn khối ghim đặt ngay trong modal "Sửa Space" đã có sẵn (cạnh checkbox `enabledBlocks`) — không cần màn hình/thao tác kéo-thả riêng nào.

**Ưu điểm:**
- Cực kỳ nhẹ, đúng tinh thần "đừng dựng cả hệ thống layout riêng cho 1 pain-point cụ thể" — 1 field nhỏ/Space (vài byte), không map lớn, không migration phức tạp, không đụng `useDashboardLayout.ts`/`dashboardLayoutUtils.ts` gì cả.
- Thao tác cực đơn giản cho user: 1 lựa chọn trong modal đã quen thuộc, không học thêm gì.
- Giải quyết đúng phần lõi của pain point đã nêu (Space "Chi tiêu" muốn Nhật ký TO hơn) mà không cần user tự vẽ lại % cột/hàng.
- Vị trí khối (cột nào, cạnh khối nào) vẫn nhất quán mọi Space — không xảy ra tình trạng mỗi Space có "hình dạng" hoàn toàn khác nhau, dễ dự đoán khi chuyển qua lại giữa các Space.

**Nhược điểm:**
- **Rủi ro không đủ đô:** 3 ảnh chụp thực tế chủ dự án cung cấp cho thấy khác biệt cả về **vị trí** (khối nào ở cột nào), không chỉ độ to/nhỏ — nếu chỉ đổi kích thước mà giữ nguyên khung vị trí dùng chung, có thể không tái tạo đúng những gì chủ dự án đã thực sự làm bằng tay trong 3 ảnh mẫu. Cần xác nhận lại phạm vi vấn đề thật trước khi chọn hướng này (xem câu hỏi mở 10.7).
- Chỉ xử lý 1 khối "nổi bật" — không xử lý được nhu cầu đồng thời "khối X to VÀ khối Y thu nhỏ" theo từng Space khác nhau, trừ khi thiết kế thêm quy tắc 2 chiều (to/nhỏ) thay vì chỉ 1 chiều (boost).
- Cần định nghĩa rõ luật "to hơn bao nhiêu" (hệ số cố định hay mức rời rạc) — việc của `uiux` nếu chọn hướng này.

**Độ phức tạp:** sản phẩm **thấp** (1 lựa chọn thêm trong modal có sẵn) — dữ liệu **rất thấp** (1 field nhỏ/Space).
**Phù hợp quy mô nhỏ (1-10 người/Space):** rất phù hợp NẾU pain point thực sự chỉ là "cần 1 khối nổi bật hơn" — cần xác nhận lại đây có phải đúng bản chất nhu cầu hay không.

---

### 10.5 Phương án E — Bỏ hệ 2D cột/splitter liên tục, đổi sang danh sách khối xếp dọc + kích thước rời rạc theo Space

**Cơ chế:** Thay đổi triệt để paradigm tương tác, không chỉ đổi nơi lưu. Bỏ khái niệm "N cột, mỗi cột N slot dọc/ngang, tỉ lệ % liên tục, ghép ngang 2 khối" — mỗi Space chỉ còn **1 danh sách khối theo thứ tự dọc** (kéo lên/xuống đổi thứ tự — thao tác đơn giản hơn nhiều so với kéo 2D + resize splitter mảnh), mỗi khối có 1 trong vài **mức kích thước rời rạc cố định** (vd Nhỏ/Vừa/To — chọn qua nút bấm trên header khối, không kéo-resize tự do). Dữ liệu lưu mỗi Space chỉ còn dạng `{ order: LayoutBlockKey[]; sizes: Record<LayoutBlockKey, 'sm'|'md'|'lg'> }` — gọn hơn nhiều so với `DashboardLayout` hiện tại (không `colWidths`, không `row`/ghép ngang, không trọng số `h`/`w` liên tục).

**Ưu điểm:**
- Thao tác đơn giản hơn hẳn cơ chế hiện có (không cần rê chuột chính xác vào 25% mép hay khe splitter mảnh) — đây có thể là hướng giải quyết đúng gốc rễ "demo tệ" (nếu nguyên nhân là *cảm giác thao tác* chứ không phải *nơi lưu*, giống nghi vấn đã nêu ở phương án A).
- Dữ liệu cực gọn, dễ hiểu, dễ hiển thị preview thu nhỏ (vd trong dropdown Space-switcher).
- Bỏ hẳn lớp code phức tạp kỹ thuật nhất hiện có (đo `getBoundingClientRect` 2-pass, splitter ẩn, tính zone theo %) — giảm nợ kỹ thuật dài hạn.
- Vẫn giải quyết đúng phần lõi pain point (khối X to ở Space này, khối Y to ở Space khác) ở mức "đủ dùng" mà không cần độ chính xác pixel.

**Nhược điểm:**
- Đây là thay đổi **lớn nhất trong 5 phương án** — không phải bổ sung mà **thay thế/bỏ** phần lớn code layout-engine 2D hiện có (`AppLayout.tsx` phần cột/splitter, `dashboardLayoutUtils.ts`, `Splitter.tsx`) — bỏ đi công sức đã đầu tư xây dựng khá kỹ (hệ 3 loại splitter, slot `row`/`single`, ghép ngang 2 khối vừa hoàn thiện gần đây).
- **Mất khả năng ghép ngang 2 khối cạnh nhau (nhiều cột song song)** hoàn toàn — nếu chủ dự án thực sự thích trải nghiệm 2-3 cột hiện tại (không chỉ 1 cột dọc), đây là bước lùi rõ rệt về hiển thị, đặc biệt trên màn hình rộng (nhiều khoảng trắng lãng phí nếu chỉ xếp 1 cột dọc).
- Cần `uiux` thiết kế lại tương tác gần như từ đầu — không tái dùng gì từ demo hiện tại, có rủi ro lặp lại đúng kịch bản "demo tệ, bỏ qua" nếu hướng thiết kế mới cũng không hợp ý.

**Độ phức tạp:** sản phẩm **cao** (thiết kế lại tương tác từ đầu) — dữ liệu **thấp** (schema rất gọn) nhưng **công sức code cao** (viết lại engine, không phải chỉ đổi chỗ lưu).
**Phù hợp quy mô nhỏ (1-10 người/Space):** phù hợp về mức độ đơn giản thao tác, nhưng chi phí chuyển đổi (bỏ code cũ, mất tính năng nhiều cột) là rủi ro lớn nhất trong 5 phương án — cần cân nhắc kỹ so với lợi ích.

---

### 10.6 Bảng so sánh nhanh

| Phương án | Cơ chế cốt lõi | Vị trí khối theo Space? | Kích thước khối theo Space? | Tái dùng code hiện có | Phức tạp sản phẩm | Phức tạp dữ liệu | Phù hợp quy mô nhỏ |
|---|---|---|---|---|---|---|---|
| A — Free-form per-Space | Kéo-thả + splitter liên tục, lưu riêng/Space | Có, tự do hoàn toàn | Có, tự do hoàn toàn | Tối đa (100% engine cũ) | Thấp | Thấp-vừa | Có, nhưng tốn công lặp lại/Space |
| B — Preset/Template | Chọn 1 trong N bố cục dựng sẵn | Có, nhưng chỉ trong khuôn preset | Có, nhưng chỉ trong khuôn preset | Thấp (UI chọn mới, engine cũ có thể giữ làm nền preset hoặc bỏ) | Vừa (cần thiết kế bộ preset) | Thấp | Rất phù hợp |
| C — Layout Profile (thư viện, gán N:1) | Tạo hồ sơ tái dùng, gán vào nhiều Space | Có, tự do (như A) nhưng theo hồ sơ, không theo Space | Có, tự do (như A) nhưng theo hồ sơ, không theo Space | Cao (tái dùng UI kéo-thả cho hồ sơ) | Cao (khái niệm + CRUD mới) | Vừa | Có nguy cơ over-engineering |
| D — Ghim khối nổi bật | 1 field nhỏ/Space, boost khối trên khung chung | Không (khung vị trí vẫn chung) | Có, nhưng chỉ 1 khối, chỉ 1 chiều (to lên) | Tối đa (gần như không đổi code layout) | Thấp | Rất thấp | Rất phù hợp, nếu đủ đô nhu cầu thật |
| E — Danh sách dọc + size rời rạc | Bỏ hệ 2D, đổi sang list + 3 mức size | Chỉ thứ tự dọc (không còn cột song song) | Có, rời rạc (sm/md/lg) | Thấp (thay thế phần lớn engine cũ) | Cao (thiết kế lại từ đầu) | Thấp | Phù hợp thao tác, rủi ro chi phí chuyển đổi |

### 10.7 Câu hỏi mở cần chủ dự án xác nhận trước khi chọn hướng

Đây là các câu hỏi **quyết định phương án nào còn khả thi** — chưa trả lời được thì `uiux`/`dev` khó góp ý sâu hơn:

1. **Bản chất thật của vấn đề: vị trí hay kích thước (hay cả hai)?** 3 ảnh mẫu có khác nhau về **vị trí khối** (khối nào nằm cột nào) hay chỉ khác về **kích thước** (khối nào to/nhỏ, thứ tự trên/dưới vẫn tương tự)? Câu trả lời quyết định phương án D (chỉ xử lý kích thước, giữ nguyên vị trí chung) có đủ hay không — nếu vị trí cũng cần khác nhau thật sự, D không đủ, chỉ còn A/B/C/E là ứng viên.
2. **"Demo tệ" là tệ ở đâu — nơi lưu (mỗi Space có bản riêng) hay bản thân thao tác (kéo-thả/splitter)?** Nếu vấn đề chỉ là "lặp lại thao tác quen thuộc nhiều lần cho nhiều Space" (không phải bản thân thao tác dở) → phương án A vẫn ổn, chỉ cần thêm cách khởi tạo nhanh hơn (vd copy từ Space khác, xem câu hỏi mở cũ mục 8 #4). Nếu vấn đề là **chính thao tác kéo-thả/splitter** cảm giác khó dùng/rối → nên nghiêng về B/D/E (giảm hẳn độ mịn của thao tác).
3. **Có sẵn sàng đánh đổi mất khả năng "ghép ngang 2 khối cạnh nhau" (nhiều cột song song)** để đổi lấy thao tác đơn giản hơn hẳn (phương án E) không, hay đây là tính năng phải giữ?
4. **Mức độ "tuỳ biến tinh" có thực sự cần thiết**, hay 4-6 preset dựng sẵn (phương án B) là đủ cho toàn bộ nhu cầu thực tế hiện có (và có thể phát sinh) của các Space đang dùng?
5. Nếu muốn giữ engine hiện tại gần như nguyên vẹn nhưng tránh lặp thao tác nhiều lần: có quan tâm tới mô hình "hồ sơ tái dùng" (phương án C) dù biết nó phức tạp hơn và có rủi ro đi ngược pain-point gốc nếu dùng sai cách (gán nhầm 2 Space chung 1 hồ sơ)?

**Chưa có phương án nào trong 5 phương án trên được khuyến nghị** — mục này dừng ở việc đặt cạnh nhau để `uiux` (góc trải nghiệm/thiết kế) và `dev` (góc chi phí kỹ thuật/rủi ro migrate) đọc và góp ý theo góc riêng, tổng hợp lại sau khi có đủ 3 góc nhìn cộng câu trả lời của chủ dự án cho 10.7.

---

### 10.8 Góc nhìn UX (uiux, 2026-07-08)

Đã đọc trực tiếp `src/layout/AppLayout.tsx`, `src/layout/Splitter.tsx`, `src/layout/dashboardLayoutUtils.ts`, `src/layout/useDashboardLayout.ts` trước khi viết mục này — không suy đoán cơ chế kéo-thả/resize hiện tại, mọi nhận định bên dưới trích dẫn đúng dòng/hàm đã đọc.

#### 10.8.1 Trả lời câu hỏi mấu chốt: "demo tệ" là tệ ở nơi lưu hay ở bản thân thao tác?

**Nhận định: bản thân cơ chế thao tác hiện tại đã có gánh nặng nhận thức (cognitive load) và hạn chế accessibility THẬT SỰ, không chỉ do demo dựng vội — dựa trên bằng chứng cụ thể trong code, không phải suy đoán cảm tính:**

1. **Splitter vô hình theo mặc định — vấn đề khả năng phát hiện (discoverability).** `Splitter.tsx` dòng 12-16 tự mô tả đúng bản chất: "Splitter ẨN — đè lên đúng giữa khoảng gap 12px... phần hiển thị (đường kẻ accent) mặc định trong suốt, chỉ sáng lên khi hover/đang kéo". Nghĩa là trên màn hình không có bất kỳ tín hiệu thị giác nào báo "chỗ này kéo được" cho tới khi con trỏ tình cờ đi qua đúng vùng bắt chuột rộng 20px nằm giữa khoảng gap 12px. Đây là anti-pattern UI kinh điển ("invisible affordance") — người dùng lần đầu gần như chắc chắn không tự phát hiện ra được, phải học qua chỉ dẫn bằng lời (đúng như `uiux` đã phải viết hẳn 1 câu hint trong `SettingsModal.tsx`, mục 9.3, để giải thích "kéo đường kẻ ẩn giữa các khối").
2. **Logic vùng thả (drop zone) không trực quan, không có gợi ý khi đang kéo.** `getZone()` (`dashboardLayoutUtils.ts` dòng 53-61): nếu khối cho phép ghép ngang, chỉ 25% rìa trái/25% rìa phải của khối đích tính là "left"/"right" (ghép ngang); phần giữa (50% còn lại theo chiều ngang) lại được phân loại tiếp theo **chiều dọc** (trên 50%/dưới 50% theo `relY`) — 2 trục đo chồng lên nhau theo 2 ngưỡng khác nhau, không có viền/overlay nào hiển thị trước ranh giới 25%/50%/75% này lúc đang kéo (chỉ có class `zone-side` đổi giao diện SAU KHI đã vô tình rơi đúng vùng). Người dùng phải "dò" bằng thử-sai để hiểu được lần đầu vì sao thả vào giữa khối lại chèn trên/dưới thay vì ghép ngang như họ tưởng.
3. **Resize liên tục theo pixel, không có input số/điểm chốt (snap), undo chỉ ở mức "khôi phục toàn bộ".** `resizeRowSplitter()`/`resizeColSplitter()` (dòng 116-122 kèm comment) còn ghi rõ đây từng có bug thực tế ("kéo nhẹ mà giá trị nhảy vọt rất xa") phải sửa lại bằng cách tính giá trị tuyệt đối từ baseline — tự nó là tín hiệu cho thấy cơ chế resize-theo-%-liên-tục vốn dễ vỡ/khó làm đúng cả ở tầng code, kéo theo khó *dùng* chính xác ở tầng thao tác (không có ô nhập số %, không có nút "chia đều 50/50" nhanh, sửa nhầm chỉ có thể "Khôi phục bố cục mặc định" — xoá sạch mọi tinh chỉnh khác, không phải undo đúng 1 bước).
4. **Không có đường vào bằng bàn phím, không có ARIA cho control dạng slider.** Toàn bộ thao tác resize chỉ nghe `mousedown`/`mousemove`/`mouseup` (`AppLayout.tsx` dòng 428-503) và kéo-thả chỉ dùng HTML5 Drag & Drop API (`onDragStart`/`onDragOver`/`onDrop`) — không có phím tắt/mũi tên thay thế, `Splitter.tsx` không gắn `role`, `aria-label`, hay `aria-valuenow` (đúng bản chất là 1 control kiểu slider nhưng không khai báo semantics gì cho AT). Đây là khoảng trống accessibility có thật, tồn tại độc lập với việc có tách layout theo Space hay không — nhưng liên quan trực tiếp: phương án nào TÁI DÙNG nguyên cơ chế này (A, C) thì TÁI DÙNG luôn khoảng trống này; phương án nào thay bằng control rời rạc dạng nút bấm (B, D, E) thì tự nhiên loại bỏ hoặc giảm hẳn vấn đề, không cần làm gì thêm cho accessibility.
5. Bản thân `AppLayout.tsx` dòng 127-129 (comment giải thích vì sao ẩn hẳn splitter cột khi dồn cột trên tablet hẹp) đã tự thừa nhận cơ chế "dính trạng thái `:hover`" gây phiền hơn trên màn cảm ứng — tức đội dev cũng đã biết cơ chế này vốn không thân thiện ngoài chuột-bàn-phím-desktop truyền thống.

**Kết luận:** cả 2 giả thuyết trong câu hỏi mấu chốt đều đúng một phần, nhưng phần "bản thân thao tác vốn khó" là **root cause nặng hơn**, còn "chỗ lưu dùng chung" chỉ là **điều kiện CẦN** (không tách theo Space thì chỉnh A phá B) chứ không phải điều kiện ĐỦ để hài lòng. Bằng chứng gián tiếp mạnh nhất: đúng hồ sơ user thật mà `ba` mô tả — 1 người quản lý nhiều Space mục đích khác hẳn nhau (Chi tiêu / MAFC / Cá nhân) — là đúng nhóm user bị cơ chế này "đánh thuế" nặng nhất nếu chọn phương án A, vì mỗi Space là 1 lượt phải tự dò lại từ đầu 4 vấn đề nêu trên, không có gì rút ngắn ở lần thứ 2 trở đi (không copy, không preset, không gợi ý — đã chốt ở mục 9.1 không copy layout Space đang mở). Nói cách khác: **phương án A giữ nguyên cơ chế cũ sẽ nhân đúng root cause khiến demo bị chê lên N lần** (N = số Space), không giải quyết được phần nặng hơn của vấn đề dù giải quyết đúng phần "chỗ lưu".

#### 10.8.2 Góp ý theo từng phương án (góc UX)

**A — Free-form per-Space.**
- Touchpoint chính: mọi Space (cũ lẫn mới) đều cần user tự tay kéo-thả + resize lại từ đầu, không có bước rút gọn nào.
- Độ phức tạp thao tác: **cao, và cộng dồn tuyến tính theo số Space** — đúng 4 vấn đề nêu ở 10.8.1, lặp lại nguyên vẹn mỗi Space.
- Rủi ro nhầm lẫn: cao nhất trong 5 phương án — user dễ "bỏ cuộc giữa chừng" ở Space thứ 2-3 (làm dở rồi để mặc định), dẫn tới trải nghiệm KHÔNG đồng đều giữa các Space (Space đầu đẹp, Space sau xuề xoà) — 1 kiểu ngổn ngang mới, tinh vi hơn vấn đề gốc.
- Phù hợp hồ sơ user thật: **kém** — đúng nhóm user bị "đánh thuế" nặng nhất (nhiều Space mục đích khác hẳn = nhiều lượt phải dò lại cơ chế khó).

**B — Preset/Template.**
- Touchpoint chính: 1 màn/gallery chọn preset (có thumbnail xem trước) — hợp lý đặt trong modal "Sửa Space" đã có sẵn (cùng cạnh `enabledBlocks`) hoặc 1 tab riêng trong Settings, tuỳ `dev` đánh giá.
- Độ phức tạp thao tác: **thấp** — nhận diện qua hình minh hoạ (recognition), không cần nhớ/thao tác chính xác (recall + motor precision) như A. Không có khái niệm "layout xấu/vỡ".
- Rủi ro nhầm lẫn: thấp — rủi ro duy nhất là tên preset trừu tượng ("Ưu tiên Nhật ký") không khớp trực giác ngay, nhưng có thumbnail đi kèm sẽ giải quyết gần hết (đúng nguyên tắc "đừng bắt nhớ, hãy để nhận ra").
- Phù hợp hồ sơ user thật: **tốt** — đổi Space nào cũng chỉ mất 1 lượt bấm, chi phí không tăng theo số Space.

**C — Layout Profile (thư viện, gán N:1).**
- Touchpoint chính: thêm hẳn 1 màn quản lý riêng (tạo/đặt tên/sửa/xoá hồ sơ) TÁCH KHỎI màn quản lý Space — 2 nơi phải ghé qua cho cùng 1 mục đích ("layout Space này thế nào"), không đi thẳng 1 đường.
- Độ phức tạp thao tác: bằng đúng phương án A ở bước *tạo* hồ sơ (vẫn phải kéo-thả/resize y hệt, chỉ đổi đối tượng áp dụng) — CỘNG THÊM lớp thao tác gán/quản lý mới. Không giảm gánh nặng thao tác kéo-thả gốc chút nào, chỉ đổi *tần suất* phải làm (ít lần hơn nếu tái dùng đúng ý).
- Rủi ro nhầm lẫn: **cao, kiểu mới** — sửa 1 hồ sơ ảnh hưởng ngay mọi Space đang gán nó; nếu user gán nhầm/quên đã gán chung, quay lại đúng triệu chứng ban đầu ("chỉnh Space A tự nhiên đổi cả Space B") nhưng khó truy vết hơn A (phải nhớ ra là do "hồ sơ dùng chung" chứ không phải do Space). Về mặt UX, đây là phương án duy nhất có nguy cơ **tái tạo lại chính bug cảm nhận đã khiến chủ dự án chê demo**, chỉ đổi lớp gián tiếp.
- Phù hợp hồ sơ user thật: **kém** — persona có Space mục đích khác hẳn nhau (không phải nhiều Space giống nhau muốn đồng bộ) gần như không có nhu cầu tái dùng N:1 thật; lợi ích chính của mô hình thư viện chỉ phát huy khi có RẤT NHIỀU Space cùng kiểu, không khớp use-case cá nhân/nhóm nhỏ.

**D — Ghim khối nổi bật.**
- Touchpoint chính: 1 trường chọn thêm ngay trong modal "Sửa Space" đã quen thuộc — không có màn/khái niệm mới nào phải học.
- Độ phức tạp thao tác: **thấp nhất trong 5 phương án** — 1 lựa chọn, không thao tác chuột chính xác nào.
- Rủi ro nhầm lẫn: thấp về mặt thao tác; rủi ro chính nằm ở **độ phủ nhu cầu** (không phải UX khó hiểu) — nếu nhu cầu thật cũng đổi cả vị trí (không chỉ độ to/nhỏ) như 3 ảnh mẫu gợi ý, D sẽ khiến user cảm giác "tôi chọn xong mà layout chưa giống ý tôi", tạo cảm giác tính năng "chưa đủ đô" hơn là "khó dùng" — cần câu trả lời 10.7 #1 trước khi yên tâm chọn D.
- Ghi nhận thêm 1 điểm có lợi cho D không nằm trong bảng so sánh của `ba`: vì khối được ghim tăng trọng số `h` trong CÙNG hệ flex hiện có, các khối anh em cùng cột tự động **co lại theo tỉ lệ** (không cần luật riêng "khối Y nhỏ đi") — tức về mặt kỹ thuật D có thể đã ngầm giải quyết một phần "khối X to VÀ khối Y nhỏ" mà không cần thêm luật 2 chiều, khác với mô tả "chỉ 1 chiều (to lên)" ở nhược điểm mục 10.4 — đáng để `dev` xác nhận lại khi hiện thực.
- Phù hợp hồ sơ user thật: **rất tốt, nếu Q1 (10.7) xác nhận vị trí không phải vấn đề chính** — chi phí gần như bằng 0 cho mỗi Space mới.

**E — Danh sách dọc + 3 mức kích thước rời rạc.**
- Touchpoint chính: kéo-thả đổi THỨ TỰ (chỉ 1 trục dọc, không còn 4 vùng thả mơ hồ) + nút bấm rời rạc (Nhỏ/Vừa/To) ngay trên header từng khối — không còn splitter ẩn nào.
- Độ phức tạp thao tác: **thấp-vừa** — sắp xếp theo thứ tự dọc là pattern rất quen thuộc (kéo đổi chỗ trong danh sách, giống sắp xếp playlist/checklist), rõ ràng dễ hơn hẳn 2D free-form; chọn size qua nút bấm loại bỏ hoàn toàn yêu cầu về độ chính xác chuột.
- Rủi ro nhầm lẫn: thấp về thao tác mới, nhưng **mất khả năng đặt 2 khối cạnh nhau (nhiều cột song song)** là thay đổi cảm nhận lớn nhất trong 5 phương án — nếu chủ dự án/user quen mắt với bố cục nhiều cột hiện tại, đây là bước lùi thị giác rõ rệt trên màn hình rộng, cần xác nhận trước (đúng câu hỏi mở 10.7 #3).
- Phù hợp hồ sơ user thật: **tốt về mức độ dễ dùng**, nhưng là phương án có **chi phí chuyển đổi cảm nhận cao nhất** (đổi cả hình dạng Dashboard quen thuộc, không chỉ đổi cách chỉnh) — rủi ro lớn nhất trong 5 phương án là lặp lại kịch bản "demo mới cũng không hợp ý" vì đây gần như 1 sản phẩm thị giác khác hẳn, không phải tinh chỉnh.

#### 10.8.3 Đề xuất thêm — Phương án F: Preset khởi tạo + "Ghim nổi bật" tuỳ chọn (kết hợp B + D)

Không phải 1 paradigm hoàn toàn xa lạ (thành thật: đây là tổ hợp có chủ đích của B và D, không phải ý tưởng từ số 0) — nhưng đáng nêu riêng vì `ba` đặt B và D như 2 lựa chọn TÁCH BIỆT, trong khi ghép lại giải quyết đúng khoảng trống mà từng cái đơn lẻ để hở:

**Cơ chế:** Mỗi Space bắt buộc chọn 1 preset (như B) làm khung vị trí+kích thước ban đầu (bấm 1 lần, chi phí gần 0). Bổ sung tuỳ chọn "khối nổi bật" (như D) áp dụng THÊM lên trên preset đã chọn — cùng đặt trong modal "Sửa Space", không có bước/màn hình riêng nào mới so với B hoặc D đứng một mình.

**Vì sao đáng cân nhắc:**
- Giải quyết đúng nhược điểm lớn nhất của B ("nếu nhu cầu nằm giữa 2 preset thì không preset nào khớp 100%") mà không phải quay lại free-form: chọn preset gần đúng nhất, rồi ghim thêm 1 khối cần nhấn thêm — vẫn 2 lượt bấm, không rê chuột chính xác nào.
- Giải quyết đúng nhược điểm lớn nhất của D đứng một mình (chỉ đổi kích thước, khung vị trí luôn cố định 1 kiểu) — vì preset đã tự do hơn về vị trí (nhiều kiểu bố cục khác nhau), "ghim" chỉ còn phải gánh phần tinh chỉnh nhỏ, không phải gánh toàn bộ khoảng cách với nhu cầu thật.
- Dữ liệu vẫn cực gọn: `Record<spaceId, { presetId: string; pinnedBlockId?: LayoutBlockKey }>` — không có object `DashboardLayout` lồng sâu nào phải lưu/migrate.
- Không đòi hỏi bỏ hẳn engine 2D hiện có ngay lập tức — có thể tái dùng chính cấu trúc `DashboardLayout`/`AppLayout.tsx` hiện tại làm "khuôn dữ liệu" bên trong mỗi preset (preset = 1 `DashboardLayout` mẫu định nghĩa sẵn trong code, không phải schema mới), giảm rủi ro viết lại từ đầu so với phương án E.

**Đánh đổi cần nêu thẳng:** vẫn kế thừa toàn bộ nhược điểm "thiết kế bộ preset" của B (tốn công dựng bộ preset đẹp/đủ dùng, phải rà lại khi thêm khối mới vào hệ thống) — F không rẻ hơn B ở phần này, chỉ rẻ hơn A/C ở phần thao tác cho user cuối.

#### 10.8.4 Nghiêng về đâu (chưa chốt — chờ góc `dev` và câu trả lời 10.7 của chủ dự án)

Theo thuần góc UX (touchpoint thấp, không đòi hỏi độ chính xác thao tác, không có khoảng trống accessibility mới, chi phí không cộng dồn theo số Space): **nghiêng về B, hoặc F (B kết hợp thêm nhánh ghim của D) nếu chủ dự án xác nhận nhu cầu thật có phần "giữa 2 preset" cần tinh chỉnh thêm.** D đứng riêng là phương án dự phòng tối giản đáng cân nhắc **nếu và chỉ nếu** câu trả lời 10.7 #1 xác nhận rõ pain point chỉ nằm ở kích thước, không phải vị trí — khi đó D cho tỷ suất lợi ích/chi phí tốt nhất trong 5 phương án gốc.

Không nghiêng về A (lặp lại đúng root cause đã phân tích ở 10.8.1) và C (nguy cơ tái tạo lại chính triệu chứng đã bị chê, cộng thêm lớp khái niệm mới không khớp persona). E không loại bỏ nhưng xếp sau B/F/D — về lý thuyết thao tác dễ hơn A/C thật, nhưng là phương án duy nhất đổi cả hình dạng thị giác quen thuộc của Dashboard (mất bố cục nhiều cột song song) — rủi ro "demo lần 2 vẫn không hợp ý" cao nhất nếu chủ dự án thực ra vẫn muốn giữ cảm giác nhiều cột.

**Không tự chốt phương án cuối** — để `dev` góp ý thêm chi phí/rủi ro kỹ thuật (đặc biệt cho F, vì đây là tổ hợp `uiux` mới đề xuất, `dev` chưa đánh giá) rồi tổng hợp cả 3 góc nhìn cùng câu trả lời 10.7 của chủ dự án trước khi quyết định cuối cùng.

---

### 10.9 Góc nhìn kỹ thuật + khuyến nghị triển khai (dev, 2026-07-08)

Đã đọc lại trực tiếp (không suy đoán): `src/types.ts` (`DashboardLayout`/`LayoutSlot`/`Space`/`Settings`), `src/layout/useDashboardLayout.ts`, `src/layout/dashboardLayoutUtils.ts`, `src/layout/AppLayout.tsx` (762 dòng, gồm `deriveVisibleLayout`/`isBlockVisible` dòng 147-169, flex weight dòng 381), `src/state/seed.ts` (`defaultDashboardLayout()`), `src/state/reducers/settings.ts`, `src/storage/normalize.ts` (`findLegacyDashboardLayout`, `normalizeDashboardLayout`), `src/state/AppStateContext.tsx` (dòng 121-126 debounce-save private, dòng 176-209 watcher `saveSharedSpace` theo `state.spaces`), `src/features/spaces/SpaceFormModal.tsx`, `src/storage/sharedSpaceStore.ts` (`saveSharedSpace` patch fields dòng 198).

#### 10.9.0 Phát hiện quan trọng — chỗ đặt dữ liệu cho D/F phải khác mô tả gốc ở mục 10.4/10.8.3

`SpaceFormModal.tsx` (nơi `uiux` đề xuất đặt lựa chọn "khối ghim") dispatch `SPACE_SET_ENABLED_BLOCKS`/`SPACE_CREATE` — 2 action này thuộc `spacesReducer`, tác động `state.spaces`. `AppStateContext.tsx` dòng 176-209 theo dõi đúng `state.spaces` để gọi `saveSharedSpace()` cho Shared Space, patch chỉ gồm `tasks | notes | reminders | logs | name | enabledBlocks` (`sharedSpaceStore.ts` dòng 198) — ghi vào **1 hàng DUY NHẤT** `kn_shared_spaces`, dùng chung cho **mọi thành viên**. Đây chính xác là bug `enabledBlocks` vừa fix hôm 2026-07-07.

Nếu `Space.featuredBlockId` (mục 10.4) hoặc `pinnedBlockId`/`presetId` (mục 10.8.3, phương án F) được thêm thẳng vào `interface Space` rồi ghi qua 1 action kiểu `SPACE_SET_...`, nó sẽ đi đúng đường ống này — với Shared Space, 1 thành viên chọn preset/ghim khối sẽ ép hiển thị lên **mọi** thành viên khác, vi phạm thẳng ràng buộc đã chốt ở mục 10.0 ("mỗi thành viên tự sắp layout xem riêng của mình"). Đây không phải lỗi tư duy của `ba`/`uiux` — 2 bên phân tích đúng ở tầng UX/dữ liệu-tổng-quát, nhưng chưa đối chiếu với đường ống lưu trữ thật (private `Settings` vs shared `kn_shared_spaces` row) mà chỉ `dev` mới có ngữ cảnh đọc trực tiếp.

**Kết luận bắt buộc cho mọi phương án B/D/F:** dữ liệu `presetId`/`pinnedBlockId` phải nằm ở `Settings` (cấp user, trong `kn_space_state`, đúng đường ống `state.settings` dòng 121-126 — private, KHÔNG đồng bộ giữa thành viên), dạng map khoá theo `spaceId` — **cùng storage destination với phương án A**, chỉ khác object lưu nhỏ hơn nhiều (1 string/enum thay vì `DashboardLayout` lồng sâu). UI vẫn có thể đặt trong modal "Sửa Space" như `uiux` đề xuất (đọc `space.id` hiện tại làm key) — chỉ đổi action dispatch từ `SPACE_SET_...` sang 1 action mới kiểu `SETTINGS_SET_LAYOUT_PIN`/`SETTINGS_SET_LAYOUT_PRESET` ghi vào `settings`, không phải `spaces`. Không đổi kết luận UX/độ nhẹ tổng thể của D/F, chỉ đổi đúng 1 chi tiết implementation — nhưng là chi tiết **bắt buộc phải sửa trước khi giao code**, nếu không sẽ tái tạo đúng bug vừa mất công fix.

#### 10.9.1 Phương án A — Free-form per-Space

Đã có kế hoạch implementation đầy đủ ở mục 3-9 phía trên (field `dashboardLayouts: Record<spaceId, DashboardLayout>`, đọc-fallback tại chỗ, 2 rủi ro implementation 9.1/9.6 đã có hướng xử lý). Xác nhận lại: **độ phức tạp kỹ thuật thấp nhất trong 6 phương án** vì bài toán lưu trữ đã giải xong, tái dùng 100% engine hiện có (`AppLayout.tsx`, `dashboardLayoutUtils.ts`, `Splitter.tsx`), migration an toàn (single-deployment Vercel, có tiền lệ `findLegacyDashboardLayout()` đã chạy tốt qua 1 lần đổi schema tương tự — `migrateTodaySettingsMerge()` trong `normalize.ts`).

Đúng nhận định `uiux` mục 10.8.1: rẻ về code nhưng **không giải quyết root cause** đã xác nhận bằng bằng chứng code cụ thể (splitter ẩn, drop-zone không trực quan, resize không có input số, thiếu ARIA) — effort thấp không bù được rủi ro lặp lại đúng nguyên nhân khiến demo bị chê, nhân theo N Space. `dev` đồng ý không chọn A, dù đây là phương án "rẻ nhất" thuần kỹ thuật.

#### 10.9.2 Phương án B — Preset/Template

Schema đề xuất: `Settings.dashboardPresetId: Record<string, PresetId>` (key = `spaceId`, value = 1 trong ~5 chuỗi literal) — nhẹ hơn hẳn A (không có object `DashboardLayout` lồng trong map). Bộ preset (`PRESETS: Record<PresetId, DashboardLayout>`) là hằng số code, viết bằng tay giống hệt cách `defaultDashboardLayout()` đã viết (thuần data, không logic mới) — nhân lên 4-6 bản, tái dùng đúng type `DashboardLayout` gốc, không cần schema mới.

Điểm phức tạp thật nằm ở 1 quyết định chưa được `ba`/`uiux` chốt: **có bỏ hẳn UI kéo-thả/splitter (`AppLayout.tsx`) hay giữ song song?**
- Bỏ hẳn: phải tháo dỡ phần lớn `AppLayout.tsx` (drag handlers dòng ~380-503, `Splitter.tsx`, gọi `dashboardLayoutUtils.ts`) — rủi ro làm hỏng phần khác (regression) vì các phần này đan xen với phần render khác (mobile accordion, collapse khối, `deriveVisibleLayout`) trong cùng 1 file 762 dòng, cần cẩn thận không phá phần không liên quan.
- Giữ song song (preset để chọn nhanh + vẫn cho tinh chỉnh tự do sau đó): về bản chất là **A + 1 lớp preset phía trên** — phức tạp cộng dồn, không giảm so với A, và có nguy cơ user vẫn rơi vào đúng root cause kéo-thả/splitter sau khi chọn preset (không giải quyết dứt điểm vấn đề UX 10.8.1).

Cần thêm 1 UI mới hoàn toàn (gallery/thumbnail chọn preset) — không tái dùng component cũ nào, đúng như `uiux` đã nêu "tốn công thiết kế". Migration nhẹ: mọi Space cũ mặc định preset "cân bằng" (= chính `defaultDashboardLayout()` hiện có) — an toàn vì chưa Space nào từng chọn preset.

**Effort: vừa** — chủ yếu ở khối lượng thiết kế/viết bộ preset + quyết định rõ có giữ engine kéo-thả cũ hay không (câu hỏi cần chốt trước khi code, không phải chi tiết `dev` tự quyết được).

#### 10.9.3 Phương án C — Layout Profile (thư viện, gán N:1)

Xác nhận **cao nhất về độ phức tạp** trong 6 phương án theo góc kỹ thuật: cần thêm nguyên 1 CRUD mới độc lập (`Settings.layoutProfiles: Record<profileId, DashboardLayout>` + `Settings.spaceProfileMap: Record<spaceId, profileId>`) — 2 tầng dữ liệu, 2 bộ action mới (tạo/sửa/xoá/đặt tên hồ sơ, cộng gán/bỏ gán vào Space), thêm các edge case chưa từng có trong dự án (hồ sơ mồ côi, xoá hồ sơ đang được N Space dùng, đặt tên trùng...). Không tái dùng gì ngoài UI kéo-thả gốc cho bước *tạo* hồ sơ (vẫn đủ 4 vấn đề UX 10.8.1). `dev` đồng ý với `uiux`: effort/rủi ro cao nhất, giá trị (tái dùng N:1) không tương xứng ở quy mô 3-6 Space/user thực tế của dự án — không khuyến nghị.

#### 10.9.4 Phương án D — Ghim khối nổi bật (đã điều chỉnh placement theo 10.9.0)

Schema đúng: `Settings.pinnedBlock: Record<string, LayoutBlockKey | undefined>` (key = `spaceId`) — object nhỏ nhất trong tất cả phương án có yếu tố "theo Space". **Không đụng `DashboardLayout`/`dashboardLayoutUtils.ts`/`Splitter.tsx`/`useDashboardLayout.ts` một dòng nào** — vẫn giữ nguyên `Settings.dashboardLayout` đơn, dùng chung mọi Space y hệt hiện tại ở tầng dữ liệu chính.

Điểm neo kỹ thuật tốt có sẵn: `AppLayout.tsx` đã có đúng 1 lớp transform-trước-khi-render tách biệt khỏi layout gốc — `deriveVisibleLayout()` (dòng 165-169, dùng `isBlockVisible` lọc theo `enabledBlocks`, kết quả `visibleLayout` CHỈ dùng để render, KHÔNG dùng cho thao tác kéo-thả/lưu). Logic "boost `h` cho khối được ghim" nên chèn đúng vào lớp transform này (tính `visibleLayout` xong, áp thêm hệ số boost trước khi feed vào JSX) — nhất quán pattern đã có, không tạo lối rẽ mới.

Xác nhận bằng chứng code cho nhận định của `uiux` (mục 10.8.2 bullet D): `AppLayout.tsx` dòng 381 `flex: ${slot.h} 1 0` — đúng là flexbox proportional, boost `h` của 1 khối tự động khiến các khối anh em **cùng cột** co lại theo tỉ lệ, không cần luật 2 chiều riêng. Giới hạn thật: chỉ trong phạm vi cùng cột (không đổi được khối nào ở cột nào) — đúng nhược điểm đã nêu, cần Q1 (10.7) xác nhận trước.

**Effort: thấp nhất trong 6 phương án.** Reuse gần tuyệt đối (chỉ thêm 1 field Settings map + 1 hàm transform nhỏ + 1 dropdown trong modal có sẵn). Rủi ro migration ~0 (field mới optional, `undefined` = hành vi y hệt hiện tại, không cần đọc-fallback nhiều tầng như A).

#### 10.9.5 Phương án E — Danh sách dọc + size rời rạc

Xác nhận đây là thay đổi tốn công nhất theo nghĩa "viết lại", đồng ý đánh giá `ba`/`uiux`. Riêng góc migration có 1 rủi ro `ba`/`uiux` chưa nêu rõ: đổi từ `DashboardLayout` (2D, `cols`/`row`/`h`/`w` liên tục) sang `{ order: LayoutBlockKey[]; sizes: Record<...> }` (1D, rời rạc) là phép **quy đổi có mất thông tin** — không có ánh xạ 1-1 (khối đang ghép ngang trong `row` phải chọn 1 thứ tự tuyến tính, `h`/`w` % liên tục phải làm tròn về `sm`/`md`/`lg`). Khác hẳn A/D (field cũ giữ nguyên làm fallback, không cần "quy đổi", không mất thông tin), migration của E cần `ba`/`uiux` định nghĩa rõ quy tắc quy đổi cụ thể trước khi `dev` viết code — hiện chưa có, đây là điều kiện tiên quyết còn thiếu nếu chọn E.

**Effort: cao nhất + rủi ro cao nhất** (bỏ ~450 dòng code layout-engine 2D đã đầu tư `AppLayout.tsx`/`dashboardLayoutUtils.ts`/`Splitter.tsx`, cộng rủi ro migration mất thông tin trên dữ liệu thật). Không khuyến nghị trừ khi có tín hiệu rất mạnh rằng user sẵn sàng đánh đổi mất bố cục nhiều cột (câu hỏi mở 10.7 #3).

#### 10.9.6 Đánh giá riêng Phương án F (B + D, đề xuất của `uiux`)

Đúng là tổ hợp 2 cơ chế, nhưng **không phải "công sức cộng dồn 2 phương án"** — vì 2 phần ăn khớp tự nhiên:
- Phần "ghim" (D) tái dùng đúng 100% kỹ thuật đã mô tả ở 10.9.4: cùng vị trí transform (`deriveVisibleLayout`-adjacent), cùng dạng lưu trữ nhỏ (`Settings` map theo `spaceId`) — hoàn toàn có thể **gộp chung 1 field** thay vì 2 map riêng: `Settings.dashboardPerSpace: Record<string, { presetId?: PresetId; pinnedBlockId?: LayoutBlockKey }>`. Không phát sinh field/luồng lưu trữ mới ngoài những gì B và D đã cần riêng lẻ.
- Phần nặng của F **chính là phần B** (bộ preset + quyết định giữ/bỏ engine kéo-thả cũ) — không giảm, không tăng so với B đứng một mình.

→ Chi phí kỹ thuật F ≈ chi phí B + (chi phí D gần như xấp xỉ 0 cộng thêm, vì dùng lại đúng transform/storage đã làm cho D). Xác nhận nhận định `uiux` (10.8.3, bullet "tái dùng `DashboardLayout` hiện tại làm khuôn mỗi preset") là khả thi kỹ thuật thật — preset chỉ là hằng số `DashboardLayout`, dùng đúng type gốc, không cần schema mới nào ngoài `presetId`/`pinnedBlockId`.

**Cảnh báo bổ sung riêng cho F (chưa ai nêu):** ghim khối chỉ boost đúng trong phạm vi cùng cột (giới hạn D vẫn giữ nguyên trong F, không được giải quyết thêm chỉ vì có nhiều preset để chọn) — nghĩa là để "ghim" có tác dụng đúng ý, user cần chọn preset đã đặt khối cần ghim ở đúng cột mong muốn trước, rồi mới ghim. 2 bước có **phụ thuộc thứ tự** (chọn preset → rồi mới ghim) — `uiux` cần xác nhận rõ layout UI thể hiện đúng thứ tự này trong modal (đặt control ghim NGAY DƯỚI/phụ thuộc preset đã chọn, không đặt ngang hàng độc lập gây hiểu nhầm 2 lựa chọn tách rời nhau).

**Effort: vừa, gần bằng đúng B** — thấp hơn hẳn A/C/E, chỉ cao hơn D đứng riêng đúng phần công sức bộ preset của B (không có phần cộng dồn nào khác).

#### 10.9.7 Bảng effort/rủi ro tương đối (không phải giờ công chính xác, chỉ so sánh)

| Phương án | Effort code | Rủi ro migration | Reuse engine cũ | Ghi chú kỹ thuật riêng |
|---|---|---|---|---|
| A | Thấp (đã thiết kế xong ở mục 3-9) | Thấp (tiền lệ `findLegacyDashboardLayout`) | 100% | Không giải quyết root cause UX |
| B | Vừa | Thấp | Thấp-trung bình, tuỳ có bỏ engine cũ không | Cần chốt trước: giữ hay bỏ kéo-thả tự do |
| C | Cao nhất | Vừa (2 tầng dữ liệu mới) | Cao (dùng lại UI kéo-thả cho bước tạo hồ sơ) | Nhiều edge case CRUD mới |
| D | Thấp nhất | ~0 | ~100% (không đụng engine) | Giới hạn: chỉ boost cùng cột |
| E | Cao nhất | Cao nhất (quy đổi mất thông tin, cần rule rõ trước khi code) | Thấp (viết lại phần lớn) | Thiếu điều kiện tiên quyết (rule quy đổi) |
| F (B+D) | Vừa, ≈ B | Thấp | Như B + tận dụng transform của D | Phụ thuộc thứ tự thao tác preset → ghim |

*(Lưu ý chung cho B/D/F: bảng trên đã tính theo placement ĐÚNG đã sửa ở mục 10.9.0 — `Settings` map, không phải field trong `Space`.)*

#### 10.9.8 Khuyến nghị kỹ thuật cuối cùng

Đồng thuận với `uiux`: **không chọn A** (root cause UX không được giải quyết, dù rẻ nhất về code) và **không chọn C, E** (effort/rủi ro cao nhất, không tương xứng quy mô 3-6 Space/user thực tế của dự án; E còn thiếu hẳn 1 điều kiện tiên quyết — quy tắc quy đổi dữ liệu — chưa thể bắt đầu code ngay cả khi được chọn).

Giữa B, D, F — khuyến nghị lộ trình thay vì chọn cứng 1 phương án ngay:

**Làm D trước, bất kể câu trả lời Q1 (10.7) là gì.** Lý do thuần kỹ thuật: effort thấp nhất, rủi ro migration ~0, không đụng engine hiện có, và về mặt dữ liệu **D là tập con thật sự của F** (cùng field, cùng transform) — không có chi phí "làm rồi bỏ" nếu sau này nâng cấp lên F. Đây đúng tinh thần làm cuốn chiếu của dự án: build phần rẻ + ít rủi ro nhất trước để tự kiểm chứng có giải quyết đủ pain point hay không, trước khi cam kết thêm phần tốn công hơn (bộ preset của B).

**Nếu sau khi dùng D thực tế vẫn thấy "chưa đủ đô"** (đúng nghi ngại đã nêu ở 10.4/10.8.2 — nhu cầu thật cũng cần đổi vị trí, không chỉ kích thước) **→ nâng cấp thêm preset picker (B) lên trên, thành F** — tái dùng nguyên field/transform đã build cho D, không phải viết lại gì đã có, chỉ cộng thêm UI preset + bộ hằng số preset.

**Lưu ý kỹ thuật khi implement D** để đường nâng cấp lên F không phải migrate lần 2: thiết kế field `Settings` ngay từ đầu dạng object mở theo `spaceId` — `Record<string, { presetId?: PresetId; pinnedBlockId?: LayoutBlockKey }>` — dù giai đoạn D chưa dùng `presetId`, có sẵn chỗ trong shape để F chỉ cần bổ sung giá trị, không đổi cấu trúc field.

Nếu chủ dự án muốn chốt thẳng 1 phương án ngay (không đi theo lộ trình 2 bước D→F) và Q1 xác nhận vị trí cũng là vấn đề thật: khuyến nghị **F** hơn **B thuần** — theo 10.9.6, phần cộng thêm của F so với B gần như miễn phí về kỹ thuật, trong khi giải quyết đúng khoảng trống lớn nhất của B ("nhu cầu nằm giữa 2 preset"), giảm áp lực phải liên tục thêm preset mới mỗi khi có Space không khớp preset nào sẵn có.

---

## 11. KẾT LUẬN CUỐI (chốt 2026-07-08, thay thế mục 10 A-F)

> **Đây là spec chính thức duy nhất để `dev` triển khai.** Chốt trực tiếp giữa chủ dự án và phiên làm việc chính (Claude), sau khi đã xem qua toàn bộ 6 phương án A-F ở mục 10 — **không phải bất kỳ phương án nào trong A-F**, mà là 1 hướng khác: tách `DashboardLayout` hiện tại thành 2 phần lưu riêng theo phạm vi khác nhau. Mục 1-10 phía trên **giữ lại làm lịch sử quá trình bàn bạc** (đã có giá trị tham khảo kỹ thuật thật — nhiều phân tích ở mục 3-9, đặc biệt phát hiện quan trọng 10.9.0 về Shared Space, vẫn áp dụng nguyên vẹn ở mục này) — **không coi là spec để code theo nếu có mâu thuẫn với mục 11**.

### 11.1 Quyết định

Tách field `Settings.dashboardLayout` (hiện là `{ colWidths: number[3]; cols: LayoutSlot[][] }` — xem `src/types.ts`) thành **2 field lưu riêng, phạm vi khác nhau**:

| Phần | Field mới đề xuất | Phạm vi | Cơ chế |
|---|---|---|---|
| `colWidths` (độ rộng 3 cột) | `Settings.dashboardColWidths: [number, number, number]` | **Dùng chung cho MỌI Space** của user — giữ nguyên y hệt cơ chế hiện tại, không đổi gì về hành vi | 1 giá trị duy nhất, không khoá theo `spaceId` |
| `cols` (khối nào trong cột nào + chiều cao từng khối) | `Settings.dashboardCols: Record<string, LayoutSlot[][]>` | **Riêng theo từng Space** — key = `spaceId`, **TRỪ 1 ngoại lệ** (xem ngay dưới) | Map, đúng cơ chế đọc-fallback đã thiết kế ở mục 3.1/3.3/4.3 (áp dụng cho `cols`, không áp dụng cho `colWidths`) |

> **Ngoại lệ bổ sung (chốt 2026-07-08, xem chi tiết mục 11.10):** chiều cao (`h`) của riêng slot có `id === 'settings'` (khối gộp "Điều hướng + Hôm nay", `LayoutBlockKey` cố định, luôn hiển thị mọi Space, không thuộc `enabledBlocks`) **KHÔNG nằm trong phạm vi "riêng theo Space" của `cols`** như mọi khối khác trong bảng trên — mà thuộc nhóm **DÙNG CHUNG** cùng `colWidths`. Đây là ngoại lệ hẹp, áp dụng đúng 1 `LayoutBlockKey`, không áp dụng cho Task/Note/Log/Reminder/Habits/Notifications hay bất kỳ khối nào khác. **Vị trí** của khối `settings` (cột nào, thứ tự trong cột) vẫn tiếp tục riêng theo Space như bình thường — chỉ `h` là ngoại lệ.

Tên field chính xác (`dashboardColWidths`/`dashboardCols` hay tên khác) — **giao quyền quyết cho `dev`** nếu thấy tên hợp lý hơn khi bắt tay viết code (vd đặt lồng trong 1 object `Settings.dashboard = { colWidths, cols }` thay vì 2 field rời) — không phải câu hỏi mở chặn code, miễn giữ đúng 2 đặc tính: (1) `colWidths` — 1 giá trị, không khoá `spaceId`; (2) `cols` — map khoá `spaceId`.

Field đơn `Settings.dashboardLayout` cũ **giữ nguyên trong schema, không xoá**, đổi vai trò thành **fallback lịch sử, chỉ đọc** — đúng nguyên tắc đã dùng xuyên suốt tài liệu này (mục 5), không phải khái niệm mới.

### 11.2 Lý do chốt hướng này

- **Bài toán UX gốc** (chuyển Space qua lại, ranh giới 3 cột "nhảy" liên tục vì mỗi Space có `colWidths` khác nhau) được giải quyết triệt để bằng cách giữ khung 3 cột cố định — chuyển Space chỉ đổi **nội dung bên trong** từng cột (khối nào to/nhỏ/nằm đâu trong cột), không đổi **hình dạng khung** — cảm giác mượt, dễ đoán hơn hẳn so với để cả `colWidths` biến thiên theo Space.
- **Đơn giản hơn phương án A thuần** (per-Space toàn phần, mục 4.1/10.1/10.9.1) — không cần map hoá `colWidths`, tái dùng nguyên cơ chế "1 giá trị dùng chung" đã có sẵn cho đúng phần này, chỉ áp dụng cơ chế map/fallback (vốn đã thiết kế kỹ ở mục 3-9) cho phần `cols`. Bài toán thu hẹp lại đúng 1 nửa so với A ban đầu.
- Không mâu thuẫn với 2 quyết định nền tảng đã chốt trước đó (nêu rõ để không bị hiểu nhầm là đảo ngược):
  - **Shared Space: mỗi thành viên tự sắp layout riêng của mình** (mục 8 câu #1, mục 10.0) — vẫn đúng nguyên vẹn, cả `dashboardColWidths` lẫn `dashboardCols` đều nằm trong `Settings` (cấp user, `kn_space_state`), không đụng `kn_shared_spaces` — áp dụng đúng phát hiện kỹ thuật 10.9.0 (không được đặt field theo-Space vào `interface Space`/action `SPACE_SET_...`, phải đặt trong `Settings`).
  - **Space mới tạo dùng layout mặc định** (mục 9.1, AC5) — vẫn đúng: `cols` của Space mới = `defaultDashboardLayout().cols`, không copy Space đang mở. Riêng `colWidths` của Space mới không có khái niệm "khởi tạo" — tự động dùng đúng `dashboardColWidths` hiện có của user (vì dùng chung mọi Space, không có gì để "khởi tạo" riêng).

### 11.3 Hệ quả hành vi (đã giải thích và được chủ dự án chấp nhận — không phải rủi ro ẩn)

- **Kéo splitter dọc giữa 2 khối trong cùng 1 cột** (đổi trọng số `h` của `LayoutSlot`) → chỉ ghi vào `dashboardCols[spaceId]` của Space đang mở → **chỉ ảnh hưởng Space đang mở**. **Ngoại lệ:** nếu 1 trong 2 khối đang resize là `settings` → phần `h` liên quan tới `settings` ghi vào field dùng chung mô tả ở mục 11.10, không ghi vào `dashboardCols[spaceId]`.
- **Kéo-thả đổi vị trí khối** (chèn trên/dưới, ghép ngang — đổi cấu trúc `cols`) → cùng ghi vào `dashboardCols[spaceId]` → **chỉ ảnh hưởng Space đang mở**, giống hệt hành vi splitter dọc — **kể cả khi kéo-thả đổi vị trí khối `settings`** (chỉ `h` là ngoại lệ dùng chung, vị trí luôn riêng Space, xem mục 11.10.1).
- **Kéo splitter ngang giữa 2 cột** (đổi `colWidths`) → ghi vào `dashboardColWidths` (không khoá `spaceId`) → **ảnh hưởng TẤT CẢ Space của user đó cùng lúc** (kể cả Space chung mà user đang là thành viên) — **nhưng vẫn riêng theo từng USER**, không đồng bộ giữa các thành viên khác trong cùng 1 Shared Space (vì `colWidths` nằm trong `Settings`, cấp user, không phải trong `kn_shared_spaces`).
- Cần 1 dòng hint UI giải thích rõ 2 phạm vi khác nhau này (kéo dọc/kéo-thả = riêng Space này; kéo ngang giữa cột = áp dụng mọi Space của bạn) — **giao `uiux` thiết kế nội dung/vị trí cụ thể**, không phải việc của `ba`. Gợi ý điểm neo: đoạn hint đã có sẵn trong `SettingsModal.tsx` (mục 9.3 đã sửa 1 lần cho ngữ cảnh Shared Space) là nơi hợp lý để `uiux` cân nhắc bổ sung tiếp, tránh tạo pattern cảnh báo mới.

### 11.4 Migration

- `dashboardLayout.colWidths` hiện có của user → copy trực tiếp thành `dashboardColWidths` mới, **giữ nguyên giá trị, không đổi**. Đây là phép chuyển 1:1, không cần fallback nhiều tầng (khác với `cols`).
- `dashboardLayout.cols` hiện có của user → trở thành **giá trị khởi đầu (fallback) DUY NHẤT cho MỌI Space đang có** trong `dashboardCols[spaceId]` — dùng đúng cơ chế **đọc-fallback tại chỗ** đã thiết kế ở mục 3.1/3.3/4.3 (không phải eager-write ghi cứng N entry 1 lần — lý do giữ nguyên: thứ tự load Space cá nhân/Shared Space không đồng bộ, xem mục 4.3). Mỗi Space bắt đầu **giống hệt** layout cột cũ, sau đó tự "tách" ra thành entry riêng ngay khi user chỉnh sửa (kéo dọc/kéo-thả) trong Space đó.
- Field đơn `Settings.dashboardLayout` cũ **giữ nguyên trong schema**, không xoá — vẫn đóng vai trò fallback lịch sử cho `cols` (đọc `.cols`), không còn được ghi mới bởi bất kỳ hành động nào sau khi tính năng lên production. `colWidths` sau migrate không còn đọc từ field cũ này nữa (đã có `dashboardColWidths` riêng, giá trị đã copy xong).
- User hoàn toàn mới (chưa từng có `dashboardLayout` cũ): `dashboardColWidths` khởi tạo = `defaultDashboardLayout().colWidths`; `dashboardCols` khởi tạo rỗng `{}`, mọi Space fallback về `defaultDashboardLayout().cols` khi chưa có entry riêng — đúng logic đã áp dụng nhất quán trong toàn tài liệu.
- Migration riêng cho ngoại lệ `settings` (`dashboardCornerHeight`) — xem mục 11.10.3, không lặp lại ở đây.

### 11.5 Acceptance Criteria

- **AC-11.1 (colWidths dùng chung):** Ở Space A, kéo splitter ngang đổi độ rộng 3 cột → chuyển sang Space B → độ rộng 3 cột ở Space B **đổi theo giống Space A** (không phải giữ nguyên riêng).
- **AC-11.2 (cols riêng theo Space):** Ở Space A, kéo splitter dọc (đổi chiều cao khối) hoặc kéo-thả đổi vị trí khối → chuyển sang Space B → khối nào nằm cột nào/chiều cao bao nhiêu ở Space B **không đổi** so với trước khi chỉnh Space A; độ rộng 3 cột (khung) của Space B vẫn giữ nguyên vị trí quen thuộc trên màn hình (không "nhảy") vì `colWidths` không đổi giữa 2 Space.
- **AC-11.3 (quay lại Space đã chỉnh):** Quay lại Space A sau AC-11.2 → `cols` đã chỉnh vẫn giữ nguyên đúng như lúc chỉnh (không bị Space B đè lên, không reset).
- **AC-11.4 (reload):** Reload trang (F5) sau khi đã chỉnh `cols` riêng cho 2+ Space và chỉnh `colWidths` chung ít nhất 1 lần → mở lại đúng Space đang mở lúc F5 → thấy đúng `cols` riêng của Space đó **và** đúng `colWidths` chung đã chỉnh (không mất, không trộn).
- **AC-11.5 (migration không mất layout hiện có):** User đã có `dashboardLayout` (`colWidths` + `cols`) từ trước khi tính năng này lên production — sau khi nâng cấp, mở bất kỳ Space nào **chưa từng bị chỉnh riêng sau khi tính năng lên production** → thấy đúng `colWidths` cũ (copy 1:1) **và** đúng `cols` cũ (fallback) — không phải bố cục mặc định hệ thống trống trơn.
- **AC-11.6 (Space mới):** Tạo Space mới sau khi tính năng lên production → `cols` khởi tạo = `defaultDashboardLayout().cols` (không copy Space đang mở, đúng mục 9.1/AC5 đã chốt trước); `colWidths` hiển thị = `dashboardColWidths` hiện tại của user (tự nhiên dùng chung, không có bước khởi tạo riêng).
- **AC-11.7 (Shared Space — cols riêng từng thành viên):** 2 tài khoản cùng là member 1 Shared Space — tài khoản A kéo splitter dọc/kéo-thả đổi vị trí khối (đổi `cols`) → tài khoản B mở lại (kể cả sau reload) **không thấy `cols` của mình bị đổi theo A**.
- **AC-11.8 (Shared Space — colWidths riêng từng thành viên, KHÔNG đồng bộ giữa users dù dùng chung mọi Space của CHÍNH user đó):** Cùng kịch bản AC-11.7 — tài khoản A kéo splitter ngang đổi `colWidths` → tài khoản B mở lại **không thấy `colWidths` của mình bị đổi theo A** (vì `colWidths` tuy dùng chung mọi Space nhưng vẫn nằm trong `Settings` cấp user, không đồng bộ giữa các thành viên khác nhau).
- **AC-11.9 (nút "Khôi phục bố cục mặc định"):** Bấm nút này khi đang mở Space X → chỉ `dashboardCols[X]` reset về `defaultDashboardLayout().cols`; `dashboardColWidths` (khung chung) **không đổi**, `cols` của các Space khác **không đổi**. (Lý do không đụng `colWidths`: nút gắn với ngữ cảnh "Space đang mở", còn `colWidths` không thuộc về riêng Space nào — xem 11.6 mục quyết định giao `dev`.)
- **AC-11.10 (export/import):** Export JSON → Import lại đúng file đó → `dashboardColWidths` và `dashboardCols` (khớp `spaceId`) khôi phục đúng, không trộn/rơi rớt.
- **AC-11.11 (build):** `npm run build` + `npx tsc --noEmit` pass sau khi tách field — không còn chỗ nào trong code cũ giả định `Settings.dashboardLayout` là nguồn đọc/ghi duy nhất.

> AC riêng cho ngoại lệ chiều cao khối `settings` — xem mục 11.10.4 (AC-11.10.1 đến AC-11.10.3), không lặp lại ở đây.

### 11.6 Quyết định nhỏ giao quyền cho `dev` (không chặn code, nêu rõ để không bị coi là tự quyết âm thầm)

- **Tên field chính xác** (`dashboardColWidths`/`dashboardCols`, hay gộp `Settings.dashboard = { colWidths, cols }`) — `dev` chọn theo convention sẵn có trong `types.ts`.
- **Hành vi nút "Khôi phục bố cục mặc định"** — mặc định theo AC-11.9 (chỉ reset `cols` của Space đang mở, không đụng `colWidths`) vì nhất quán với phạm vi "ngữ cảnh Space đang mở" của chính nút này; nếu `dev` thấy có lý do kỹ thuật/UX mạnh để reset cả `colWidths`, cần nêu lại chứ không tự đổi hành vi ngầm.
- **Dọn dẹp entry `dashboardCols[spaceId]` mồ côi khi xoá/rời Space** — vẫn là nice-to-have như đã nêu ở mục 6.9/8 câu #3, không bắt buộc trong đợt này.

### 11.7 Change impact (mức tính năng)

1. **`src/types.ts`** — tách `Settings.dashboardLayout: DashboardLayout` (giữ nguyên, đổi vai trò fallback lịch sử) thành thêm 2 field mới: `dashboardColWidths: [number, number, number]` và `dashboardCols: Record<string, LayoutSlot[][]>`. Cập nhật lại comment (comment hiện tại nói "dùng chung mọi Space" chỉ còn đúng cho `colWidths`, không còn đúng cho `cols`). Thêm field thứ 3 cho ngoại lệ `settings` — xem mục 11.10.2/11.10.5.
2. **`src/layout/useDashboardLayout.ts`** — hiện đọc thẳng 1 object `DashboardLayout` (gồm cả `colWidths` lẫn `cols`) từ `state.settings.dashboardLayout`. Cần tách làm 2 luồng đọc độc lập: `colWidths` đọc `settings.dashboardColWidths` (fallback `dashboardLayout.colWidths` → `defaultDashboardLayout().colWidths`, KHÔNG phụ thuộc `currentSpaceId`); `cols` đọc theo `currentSpaceId` với đúng thứ tự fallback đã thiết kế ở mục 3.1 (fallback `dashboardLayout.cols` → `defaultDashboardLayout().cols`). 2 luồng set riêng: `setColWidths` (không kèm `spaceId`) và `setCols` (kèm `spaceId`). Áp dụng lại nguyên vẹn 2 rủi ro implementation đã phát hiện ở mục 9.1/9.6 (dev cũ) — nhưng **chỉ cho phần `cols`** (race-condition đổi Space giữa lúc đang kéo dọc/kéo-thả cần chốt `spaceId` vào ref tại thời điểm bắt đầu thao tác; referential-stability của fallback factory cần memo hoá) — phần `colWidths` không có rủi ro race theo `spaceId` vì không phụ thuộc `spaceId`.
3. **`src/state/reducers/settings.ts`** — tách `SETTINGS_SET_DASHBOARD_LAYOUT`/`SETTINGS_RESET_DASHBOARD_LAYOUT` hiện có (nếu đã tồn tại từ vòng phân tích trước) hoặc tạo mới thành 2 cặp action riêng: `SETTINGS_SET_COL_WIDTHS` (payload: `colWidths`, ghi thẳng `settings.dashboardColWidths`, không có `spaceId`) và `SETTINGS_SET_DASHBOARD_COLS`/`SETTINGS_RESET_DASHBOARD_COLS` (payload: `{ spaceId, cols }`, ghi đúng 1 entry `dashboardCols[spaceId]`, đúng AC-11.9).
4. **`src/state/seed.ts`** — `defaultDashboardLayout()` giữ nguyên (vẫn trả về cả `colWidths` lẫn `cols` trong 1 object) — dùng làm nguồn default cho cả 2 field mới (`.colWidths` cho `dashboardColWidths`, `.cols` cho fallback cấp cuối của `dashboardCols`). `defaultSettings()` khởi tạo `dashboardColWidths: defaultDashboardLayout().colWidths` và `dashboardCols: {}`.
5. **`src/storage/normalize.ts`** — `normalizeSettings()` cần tách xử lý: chuẩn hoá `dashboardColWidths` (1 mảng 3 số, validate tổng ~100%/giới hạn min-max như logic hiện có cho `colWidths`), và chuẩn hoá từng entry trong `dashboardCols` (tái dùng phần validate `cols` hiện có trong `normalizeDashboardLayout()`, factor ra thành hàm dùng chung nếu hợp lý). Giữ nguyên `findLegacyDashboardLayout()`/`legacyDashboardLayout` làm fallback sâu nhất (không đổi, vẫn đúng vai trò cũ).
6. **`src/features/settings/SettingsModal.tsx`** (nút "Khôi phục bố cục mặc định") — dispatch đổi sang `SETTINGS_RESET_DASHBOARD_COLS` kèm `spaceId` hiện tại, đúng AC-11.9 (không đụng `colWidths`). Nội dung hint (đã sửa 1 lần ở mục 9.3 cho ngữ cảnh Shared Space) cần bổ sung thêm câu giải thích phạm vi `colWidths` (chung mọi Space của bạn) vs `cols` (riêng Space này) — nội dung cụ thể giao `uiux` (mục 11.3).
7. **`AppLayout.tsx`/`Splitter.tsx`/`dashboardLayoutUtils.ts`** — cơ chế phân biệt 2 loại splitter (splitter cột = đổi `colWidths`; splitter hàng/kéo-thả trong cột = đổi `cols`) **đã tồn tại sẵn** trong code hiện tại (đúng bản chất 2 hàm `resizeColSplitter()`/`resizeRowSplitter()` đã nêu ở mục 9.1 cũ) — chỉ cần đổi đích commit: splitter cột → dispatch `SETTINGS_SET_COL_WIDTHS`; splitter hàng + kéo-thả đổi vị trí → dispatch `SETTINGS_SET_DASHBOARD_COLS` kèm `spaceId`. **Riêng khi 1 trong 2 slot resize là `settings`** — xem rẽ nhánh bổ sung ở mục 11.10.2.
8. **`src/state/appReducer.ts`** (`IMPORT_DATA`) — đảm bảo `ExportPayload.settings` export/import đúng cả 2 field mới lẫn field đơn cũ — không cần đổi shape `ExportPayload` (đã export nguyên `settings` object).
9. **Không đụng `src/storage/sharedSpaceStore.ts`, không đụng schema `kn_shared_spaces`** — cả 2 field mới đều nằm trong `Settings` cấp user (đúng phát hiện kỹ thuật 10.9.0, áp dụng lại nguyên vẹn cho quyết định này).
10. **`SPACE_CREATE`** (`spacesReducer`) — không cần đổi gì thêm cho `colWidths` (không có khái niệm khởi tạo riêng); `cols` của Space mới tiếp tục dùng cơ chế đọc-fallback có sẵn (không cần ghi entry mới ngay lúc tạo Space, entry chỉ xuất hiện khi user thực sự chỉnh).
11. **`docs/requirements.md`** — mục 4/4.1 (Layout Dashboard) cần cập nhật lại cho khớp: nêu rõ `colWidths` dùng chung mọi Space, `cols` riêng theo Space — thay cho câu hiện tại "dùng chung cho mọi Space" (không còn đúng toàn phần).

### 11.8 Không còn câu hỏi mở nào chặn code

Toàn bộ câu hỏi mở còn lại (mục 8 câu #2-#5 của vòng phân tích trước) đã được thay thế/trả lời trực tiếp bởi quyết định này (AC-11.9 trả lời câu #2 theo phạm vi mới; câu #4 vẫn giữ nguyên đáp án cũ — mục 9.1; câu #3/#5 vẫn là nice-to-die không chặn, xem 11.6). Câu hỏi #1 (Shared Space) đã chốt từ trước (mục 8), áp dụng nguyên vẹn ở mục 11.2/11.3 (colWidths lẫn cols đều private per-user, không đồng bộ giữa thành viên). Toàn bộ mục 10 (A-F) được coi là **đã đóng, không tiếp tục theo đuổi** — không cần `dev`/`uiux` quay lại đánh giá thêm A-F, chỉ triển khai đúng mục 11.

> Ngoại lệ mục 11.10 (chiều cao khối `settings`) có đúng 1 câu hỏi mở nhỏ CHƯA xác nhận — xem mục 11.10.1 — không chặn code phần còn lại của mục 11, chỉ ảnh hưởng đúng phạm vi khối `settings`.

---

### 11.9 UI hint phân biệt 2 loại splitter (uiux, 2026-07-08)

Giao việc từ mục 11.3: viết 1 dòng hint giải thích khác biệt phạm vi giữa "kéo splitter dọc/kéo-thả trong 1 cột" (chỉ đổi Space đang mở) và "kéo splitter ngang giữa 2 cột" (đổi mọi Space của user). Đã đọc `src/features/settings/SettingsModal.tsx` (đoạn hint dòng 224-228, đúng nơi mục 9.3 đã sửa 1 lần trước) và đọc trực tiếp `src/layout/Splitter.tsx` + `src/layout/AppLayout.tsx` (3 vị trí gọi `<Splitter>`, dòng 602-651) trước khi quyết — không suy đoán cơ chế.

**Đoạn hint soạn ở mục 9.3 (cho cả bản Space cá nhân lẫn Shared Space) coi như bản NHÁP ĐẦU, viết TRƯỚC khi có quyết định tách `colWidths`/`cols` ở mục 11 — mục 11.9 này thay thế hoàn toàn nội dung câu hint đó (không phải bổ sung song song), vì 9.3 chưa hề nhắc tới khác biệt phạm vi 2 loại splitter.**

#### 11.9.1 Vị trí đặt hint — Settings, không đặt trên Dashboard

**Quyết định: đặt trong Settings > tab Chung > khối "Bố cục Dashboard"**, đúng vị trí đã có sẵn, không thêm banner/tooltip cảnh báo nào nổi trên mặt Dashboard.

Lý do (giữ nguyên mạch lý luận đã dùng ở mục 9.3, áp dụng đúng như nhau cho trường hợp này — không phát minh tiêu chí mới):
- Kéo splitter/kéo-thả không phải thao tác hằng ngày (khác Task/Note/Habit dùng liên tục) — chỉ cần user biết thông tin này **1 lần trước khi thao tác**, đúng lúc đang ở màn cấu hình, không cần lặp lại mỗi lần mở Dashboard.
- Mức độ nghiêm trọng nếu hiểu nhầm **thấp hơn** trường hợp Shared Space ở mục 9.3 (`enabledBlocks` dùng chung khiến người KHÁC bối rối vì thấy thay đổi mà họ không làm) — ở đây, chính người kéo splitter cột tự thấy ngay hệ quả khi họ tự chuyển qua Space khác (không phải người thứ 2 phát hiện "bug" hộ), nên đặt hint education 1 lần tại Settings là đủ, không cần cảnh báo tại chỗ trên Dashboard.
- Không tạo pattern cảnh báo mới (modal/toast) cho 1 câu thông tin phụ — đúng nguyên tắc không tự sáng tạo pattern khi pattern cũ (`class="hint"`, token `--text-dim`, tự đổi theo theme sáng/tối) đã đủ dùng.

#### 11.9.2 Nội dung hint cụ thể

Sửa lại **toàn bộ** đoạn hint hiện có (dòng 224-228 `SettingsModal.tsx`) — không giữ câu "Kéo đường kẻ ẩn giữa các khối/cột để đổi kích thước" gộp chung như cũ, vì câu gộp đó không còn đúng nữa (2 loại đường kẻ giờ có phạm vi khác nhau, gộp chung dễ khiến user tưởng cả hai đều "chỉ Space này"):

- **Mọi Space (cá nhân lẫn chung) — luôn hiển thị:**
  > "Kéo-thả khối bất kỳ vào vị trí khác để sắp xếp lại (thả vào giữa khối khác để chèn trên/dưới, thả vào mép trái/phải để ghép 2 khối nằm ngang). Kéo đường kẻ ẩn giữa các khối để đổi kích thước — chỉ áp dụng cho Space này. Kéo đường kẻ ẩn giữa 2 cột lớn để đổi độ rộng cột — áp dụng cho **mọi Space** của bạn."

- **Riêng khi Space đang mở là Shared Space — nối thêm 1 câu cuối (thay thế câu đã nối ở mục 9.3, vì câu cũ chỉ nhắc "bố cục khối", chưa nhắc độ rộng cột):**
  > "... áp dụng cho mọi Space của bạn. Những gì bạn sắp xếp ở đây (cả kích thước khối lẫn độ rộng cột) chỉ hiển thị cho riêng bạn trong "{tên Space}" — không ảnh hưởng cách các thành viên khác nhìn thấy."

Cụm từ chọn có chủ đích, không dùng thuật ngữ kỹ thuật: "khối" (không nói "khối/slot"), "cột lớn" (không nói "column"/"colWidths") — phân biệt rõ với "khối" bằng tính từ "lớn" vì Dashboard có 3 cột lớn cố định, dễ nhận ra bằng mắt, khác "khối" (Việc cần làm/Ghi chú/...) nằm bên trong.

#### 11.9.3 Phát hiện kỹ thuật thêm khi đọc code — KHÔNG thể phân biệt 2 loại splitter "cột" chỉ bằng `axis`

Đọc `AppLayout.tsx` dòng 602-651 phát hiện: có **3** điểm gọi `<Splitter>`, không phải 2:
1. `axis="row"` (dòng 606-614) — splitter chiều cao giữa 2 khối xếp dọc trong 1 cột → ghi vào `dashboardCols[spaceId]` (riêng Space này).
2. `axis="col"` (dòng 625-634, `subColSplitters`, ghép ngang 2 khối trong CÙNG 1 cột) → **cũng ghi vào `dashboardCols[spaceId]`** (riêng Space này) — dù dùng `axis="col"`.
3. `axis="col"` (dòng 644-650, `colSplitters`, giữa 2 cột lớn ngoài cùng) → ghi vào `dashboardColWidths` (dùng chung mọi Space).

Nghĩa là điểm (2) và (3) **render y hệt nhau về mặt hình ảnh** (cùng `axis="col"`, cùng đường kẻ dọc, cùng màu accent khi hover — `Splitter.tsx` không có gì phân biệt thêm) nhưng lại thuộc **2 phạm vi lưu trữ khác nhau** ((2) riêng Space, (3) dùng chung mọi Space). Không thể suy ra đúng phạm vi chỉ từ prop `axis` — đây là điểm `dev` cần lưu ý khi thêm `title`/`aria-label` ở mục 11.9.4 dưới đây: phải gán tường minh theo TỪNG vị trí gọi (3 vị trí), không derive từ `axis`.

May mắn là về mặt ngôn ngữ, hint ở 11.9.2 vẫn đúng và không mơ hồ: cả (1) và (2) đều nằm **"giữa các khối"** (đúng nghĩa đen — 1 kéo theo chiều cao, 1 kéo theo chiều ngang, nhưng cả hai đều là ranh giới GIỮA 2 KHỐI nội dung, không phải giữa 2 cột lớn), chỉ (3) mới đúng nghĩa **"giữa 2 cột lớn"** (ranh giới ngoài cùng của cả Dashboard). User không cần biết khái niệm `axis`/kỹ thuật — chỉ cần phân biệt bằng mắt "đây là đường kẻ nằm giữa 2 khối nội dung" hay "đây là đường kẻ chạy dọc suốt chiều cao, ở rìa ngoài cùng giữa 2 mảng cột lớn" là đủ đúng.

#### 11.9.4 Accessibility — `title`/`aria-label` gán tường minh theo từng vị trí gọi, không đổi màu/icon

Bổ sung 1 prop mới cho `SplitterProps` (vd `title: string`) — gán `title`/`aria-label` trên `<div>` gốc của `Splitter.tsx` (hiện chưa có), với nội dung khác nhau theo đúng phạm vi thật (không theo `axis`, xem 11.9.3):

| Vị trí gọi (AppLayout.tsx) | Phạm vi | Nội dung `title`/`aria-label` đề xuất |
|---|---|---|
| `onRowSplitterMouseDown` (dòng 606) | Riêng Space này | `Đổi kích thước khối — chỉ áp dụng cho Space này` |
| `onSubColSplitterMouseDown` (dòng 625) | Riêng Space này | `Đổi kích thước khối — chỉ áp dụng cho Space này` |
| `onColSplitterMouseDown` (dòng 644) | Mọi Space của bạn | `Đổi độ rộng cột — áp dụng cho mọi Space của bạn` |

Đây là bổ sung **nhẹ, đúng lúc cần** (xuất hiện qua tooltip trình duyệt khi hover, đúng ngay điểm thao tác, không cần đọc trước ở Settings mới biết) — bù thêm cho hint ở Settings (11.9.2, chỉ đọc 1 lần, có thể quên), không thay thế nó. **Không phải bản vá đầy đủ cho khoảng trống accessibility đã nêu ở mục 10.8.1 điểm 4** (thiếu `role="slider"`, `aria-valuenow`, không có đường vào bằng bàn phím) — đó là nợ kỹ thuật lớn hơn, ngoài phạm vi tính năng nhỏ này, không tự ý mở rộng thêm.

#### 11.9.5 Có cần phân biệt trực quan (màu/icon khác nhau khi hover)? — KHÔNG, giữ nguyên style splitter

**Quyết định: không đổi màu/icon splitter.** Chỉ dùng text (11.9.2) + `title`/`aria-label` (11.9.4), giữ nguyên 100% giao diện `Splitter.tsx` hiện có (1 accent color duy nhất `var(--accent)` khi hover/active cho cả 3 loại).

Lý do:
- **Đây không phải hành động phá huỷ/không thể hoàn tác** — resize lại được bất cứ lúc nào, khác các trường hợp cần màu cảnh báo đỏ/vàng trong dự án (vd modal xoá Space, xoá Task). Thêm màu thứ 2 (vd cam/đỏ cho splitter cột) sẽ tạo cảm giác "nguy hiểm hơn thực tế", không đúng bản chất.
- **Tần suất thao tác thấp** (không phải điều khiển dùng hằng ngày) — chi phí học 1 màu mới không tương xứng lợi ích, trong khi text + tooltip đã đủ giải quyết đúng rủi ro nêu ra (bất ngờ khi kéo nhầm), theo đúng hướng "ít thay đổi nhất nhưng vẫn hiệu quả" đã được giao.
- **Rủi ro kỹ thuật thêm không cần thiết**: theo 11.9.3, splitter (2) và (3) cùng dùng `axis="col"` — muốn tô màu khác nhau đúng theo phạm vi thật (không theo `axis`) sẽ phải sửa `Splitter.tsx` nhận thêm 1 prop kiểu `scope: 'space' | 'global'` rồi rẽ nhánh class màu, tốn công hơn hẳn so với chỉ thêm `title` — trong khi lợi ích tăng thêm (nhận biết nhanh hơn 1 tick trước khi kéo) là nhỏ so với việc đã có hint đọc trước ở Settings.
- Giữ đúng nguyên tắc dự án: 1 accent color nhất quán cho mọi trạng thái tương tác splitter — không tự sáng tạo hệ màu mới cho 1 tính năng nhỏ.

#### 11.9.6 Change impact cho `dev` (bổ sung, không lặp lại mục 11.7)

- `src/features/settings/SettingsModal.tsx` (dòng 224-228): thay nội dung hint theo 11.9.2 (2 câu cố định + 1 câu điều kiện khi `isShared`, đọc `currentSpace` như đã có sẵn hướng dẫn ở mục 9.5).
- `src/layout/Splitter.tsx`: thêm prop `title: string` (bắt buộc hoặc optional-với-default), set `title`/`aria-label` trên `<div>` gốc.
- `src/layout/AppLayout.tsx`: truyền `title` tường minh tại đúng 3 vị trí gọi `<Splitter>` theo bảng ở 11.9.4 — **không** derive từ `axis`.
- Không đụng CSS/màu (`splitter-hidden-line`, `--accent`) — giữ nguyên.

---

## 11.10 Ngoại lệ bổ sung: chiều cao khối `settings` (Điều hướng + Hôm nay) dùng chung mọi Space (chốt 2026-07-08)

> Bổ sung nhỏ vào quyết định đã chốt ở mục 11 — không đảo ngược, không mở rộng phạm vi nào khác ngoài đúng field `h` của 1 `LayoutBlockKey` cụ thể. Yêu cầu trực tiếp từ chủ dự án, không qua vòng đề xuất/phản biện lại từ đầu như mục 10.

### 11.10.1 Yêu cầu và lý do

Khối `settings` (`LayoutBlockKey`, gộp "Điều hướng + Hôm nay", render qua `DashboardCornerBlock.tsx`) **luôn hiển thị ở mọi Space** — không thuộc `enabledBlocks`, không tắt được (đã chốt từ trước, xem comment `src/types.ts` dòng 118-123 và `DashboardCornerBlock.tsx` dòng 26). Theo mục 11.1, `h` của mọi slot (kể cả `settings`) thuộc `dashboardCols[spaceId]` — nghĩa là mặc định `h` của `settings` cũng riêng theo từng Space, giống mọi khối khác.

Chủ dự án yêu cầu: **chiều cao (`h`) của riêng khối `settings` cũng dùng CHUNG cho mọi Space** — cùng nhóm với `dashboardColWidths` (mục 11.1), KHÔNG per-Space. Lý do: nội dung khối này (nav + đồng hồ/ngày/quote) **giống hệt nhau ở mọi Space** — không có lý do gì để mỗi Space có 1 chiều cao khác nhau cho cùng 1 nội dung tĩnh, khác hẳn các khối nội dung khác (Nhật ký nhanh, Ghi chú...) là "khối tuỳ nhu cầu dùng thật sự" — chiều cao khác nhau giữa các Space với các khối đó có ý nghĩa thật (Space chi tiêu cần Nhật ký to, Space khác thì không).

**Phạm vi ngoại lệ — chỉ đúng 1 `LayoutBlockKey`:** áp dụng CHÍNH XÁC cho `id === 'settings'`. KHÔNG áp dụng cho bất kỳ `LayoutBlockKey` nào khác (Task/Note/Log/Reminder/Habits/Notifications) — các khối đó tiếp tục `h` riêng theo Space đúng như mục 11.1/11.5 đã chốt, không đổi. Nếu sau này có thêm 1 khối "luôn hiển thị, không tắt được" khác, đây KHÔNG tự động là tiền lệ áp dụng — cần yêu cầu riêng, không suy rộng ngầm.

### 11.10.2 Lưu trữ đề xuất

Thêm 1 field mới, cùng nhóm dùng-chung với `dashboardColWidths`:
```
Settings.dashboardCornerHeight: number   // trọng số h của riêng slot 'settings', dùng chung mọi Space
```

Khi tính layout hiệu lực của 1 Space (đọc `dashboardCols[spaceId]` theo đúng cơ chế mục 3.1/11.1): bất kỳ slot nào trong `cols` có `id === 'settings'` (dạng `{ type: 'single', id: 'settings', h }` — xem `seed.ts` dòng 35), giá trị `h` lưu trong slot đó **bị bỏ qua khi hiển thị**, thay bằng `dashboardCornerHeight` hiện tại. Đây là bước override đọc-thời-điểm-render, tương tự pattern transform-trước-khi-render `deriveVisibleLayout()` đã có sẵn trong `AppLayout.tsx` (dòng 165-169, dùng cho lọc `enabledBlocks`) — tái dùng đúng pattern kỹ thuật đã tồn tại, không tạo cơ chế mới.

Khi user resize (kéo splitter dọc liền kề khối `settings`): giá trị mới cần ghi vào `dashboardCornerHeight` (dùng chung) thay vì ghi vào entry `dashboardCols[spaceId]` như mọi splitter dọc khác.

**Ghi chú kỹ thuật cần `dev` lưu ý khi hiện thực (nêu ra để không bị bỏ sót, không tự giải chi tiết ở đây — đúng phạm vi tài liệu `ba`, không mở rộng thêm theo yêu cầu):** splitter dọc giữa `settings` và khối liền kề trong cùng cột đổi trọng số **cả 2 slot cùng lúc** (khối này to lên thì khối kia nhỏ đi, tổng `h` không đổi trong cột — cơ chế hiện có, `resizeRowSplitter()`). Khi `h` của `settings` giờ dùng chung còn khối liền kề vẫn per-Space, 1 thao tác kéo sẽ cần ghi vào **2 đích lưu trữ khác nhau cùng lúc** (`dashboardCornerHeight` dùng chung cho phần `settings` + `dashboardCols[spaceId]` riêng Space cho phần khối kia). Đây là chi tiết implementation `dev` cần thiết kế khi viết code (đúng tinh thần mục 6/11.7 — `ba` nêu change impact mức tính năng, không giải chi tiết dòng code).

### 11.10.3 Phạm vi hẹp: chỉ `h` đồng bộ — vị trí vẫn riêng theo Space (giới hạn có chủ đích)

Chỉ **chiều cao** (`h`) của khối `settings` dùng chung. **Vị trí** của khối này — nằm ở cột nào trong 3 cột, đứng trước/sau khối nào trong cùng cột — **vẫn tiếp tục lưu trong `dashboardCols[spaceId]` (riêng theo Space)** như quyết định gốc ở mục 11.1, không mở rộng phạm vi đồng bộ sang vị trí. User vẫn kéo-thả được khối `settings` sang cột khác/vị trí khác riêng ở từng Space nếu muốn — chỉ con số `h` đi theo là giá trị dùng chung.

**Đây là giới hạn phạm vi có chủ đích** (đúng đúng yêu cầu chủ dự án nêu, chỉ "height"), không phải thiếu sót của `ba` — không tự mở rộng thêm sang đồng bộ vị trí dù về mặt kỹ thuật cũng khả thi tương tự.

**Câu hỏi mở cần chủ dự án xác nhận sau (không chặn code, nhưng nên hỏi trước khi giao `dev`):** nếu khối `settings` bị kéo sang cột khác ở 1 Space cụ thể (vd Space A đặt nó ở cột 1, Space B đặt ở cột 3) trong khi `h` vẫn là 1 giá trị dùng chung — có tạo cảm giác kỳ lạ không? Về mặt kỹ thuật, `h` là **trọng số flex tương đối** trong cột (`AppLayout.tsx` dòng 381, `flex: ${slot.h} 1 0`, tính theo tỉ lệ `h / tổng h các khối cùng cột`) — KHÔNG phải kích thước pixel/phần trăm màn hình tuyệt đối, và cũng KHÔNG liên quan tới độ rộng cột (`colWidths`, chỉ ảnh hưởng chiều ngang, không ảnh hưởng chiều cao). Nghĩa là dù con số `h` lưu trữ giống hệt nhau giữa các Space, **chiều cao HIỂN THỊ thực tế** của khối `settings` vẫn phụ thuộc luôn cả tập hợp khối khác đang đứng cùng cột với nó — nếu Space A và Space B có số lượng/trọng số khối khác nhau trong cột chứa `settings`, khối này có thể trông cao thấp khác nhau giữa 2 Space dù `h` lưu trữ y hệt. Cần chủ dự án xác nhận: đây có phải hành vi chấp nhận được (đúng đủ với kỳ vọng "đồng bộ chiều cao"), hay kỳ vọng thực ra là "trông cao giống hệt nhau về mặt thị giác" giữa mọi Space — một kỳ vọng khác, không đạt được chỉ bằng cách đồng bộ con số `h`, cần thêm quyết định riêng nếu đúng vậy (vd khoá cứng `h` không co giãn theo khối lân cận — ngoài phạm vi bổ sung nhỏ này).

### 11.10.4 Migration

- Giá trị `h` của slot `settings` hiện có trong `dashboardLayout.cols` (field đơn cũ, đang là fallback lịch sử — mục 11.4) → copy 1:1 làm giá trị khởi đầu cho `dashboardCornerHeight` mới, đúng tinh thần migration `colWidths` (mục 11.4) — không cần đọc-fallback theo Space nhiều tầng (vì đây là giá trị dùng chung, giống `colWidths`, không phải giá trị per-Space).
- User hoàn toàn mới (chưa từng có `dashboardLayout` cũ): `dashboardCornerHeight` khởi tạo = `h` của slot `settings` trong `defaultDashboardLayout().cols` (hiện là `22`, xem `seed.ts` dòng 35).

### 11.10.5 Acceptance Criteria

- **AC-11.10.1 (h dùng chung):** Ở Space A, kéo splitter dọc đổi chiều cao khối `settings` → chuyển sang Space B → chiều cao khối `settings` ở Space B **đổi theo giống Space A** (không phải giữ nguyên riêng) — kể cả khi vị trí khối `settings` ở 2 Space khác cột nhau.
- **AC-11.10.2 (vị trí vẫn riêng Space):** Ở Space A, kéo-thả khối `settings` sang cột/vị trí khác → chuyển sang Space B → vị trí khối `settings` ở Space B **không đổi** theo Space A (đúng nguyên tắc `cols` riêng theo Space, mục 11.1) — chỉ `h` bị chia sẻ, vị trí không.
- **AC-11.10.3 (không lan sang khối khác):** Đổi `h` của khối `settings` ở 1 Space → `h` của các khối nội dung khác (Task/Note/Log/...) trong `dashboardCols` của MỌI Space **không tự động đổi theo** (ngoại lệ chỉ áp dụng đúng 1 `LayoutBlockKey`, không lan sang khối khác).

### 11.10.6 Change impact bổ sung (không lặp lại mục 11.7)

- Thêm field `Settings.dashboardCornerHeight: number` — cùng nhóm khởi tạo/migrate/normalize/export-import với `dashboardColWidths` (tham chiếu mục 11.7 điểm 1, 4, 5, 8, áp dụng tương tự cho field mới này).
- `useDashboardLayout.ts`/`AppLayout.tsx`: thêm bước override `h` của slot `id === 'settings'` khi tính layout hiệu lực (đọc), và rẽ nhánh đích ghi khi resize splitter liền kề khối `settings` (ghi) — xem ghi chú kỹ thuật mục 11.10.2.
- `SettingsModal.tsx` hint (mục 11.9.2) — có thể cần bổ sung 1 câu ngắn giải thích khối "Điều hướng + Hôm nay" luôn cùng chiều cao mọi Space — giao `uiux` quyết định có cần thêm câu hay hint hiện có đã đủ dùng, không phải việc `ba` viết copy cụ thể.

### 11.10.7 MỞ RỘNG PHẠM VI (chốt 2026-07-09) — áp dụng CẢ khối `reminders` (Thông báo), không chỉ `settings`

> Sửa lại phạm vi sau khi phát hiện hiểu sai lúc code mục 11.10 gốc (2026-07-08) — không phải bug, là làm rõ lại đúng ý chủ dự án đã xác nhận. Không đảo ngược nội dung 11.10.1–11.10.6 ở trên (vẫn đúng cho khối `settings`), chỉ MỞ RỘNG áp dụng đúng cơ chế đó thêm cho khối `reminders`.

**Lý do:** khối `reminders` (Thông báo, `NotificationsBlock`) **cũng LUÔN hiển thị ở mọi Space, không tắt được** — y hệt điều kiện đã dùng để quyết định `settings` dùng chung ở mục 11.10.1 (xem comment gốc `AppLayout.tsx`: "`reminders` (Thông báo) và `settings` (DashboardCorner) LUÔN hiển thị, không tắt"). Bản 11.10 gốc chỉ xử lý `settings`, bỏ sót `reminders` dù cùng điều kiện — nay bổ sung cho khớp đúng lý do đã nêu.

**Thay đổi:**
- Thêm field cặp đôi `Settings.dashboardReminderHeight: number` (KHÔNG gộp vào 1 field duy nhất với `dashboardCornerHeight` dù 2 khối này luôn đứng cùng cột trong bố cục mặc định — lý do: `h` là trọng số flex-grow tương đối, không phải % tuyệt đối phải cộng đúng 100, xem comment kỹ thuật tại field này trong `types.ts`; giữ 2 field độc lập đơn giản hơn, nhất quán pattern, không cần thêm logic chuẩn hoá tổng).
- `resolveDashboardCols()` override `h` của CẢ `settings` LẪN `reminders` khi đọc (trước đây chỉ `settings`).
- Resize splitter dọc liền kề 1 trong 2 khối này → ghi thêm vào field dùng-chung tương ứng (`SETTINGS_SET_CORNER_HEIGHT`/`SETTINGS_SET_REMINDER_HEIGHT`), độc lập nhau.
- Mọi AC ở mục 11.10.5 áp dụng tương tự cho `reminders` (đổi Space → chiều cao khối `reminders` cũng đồng bộ theo giống `settings`; vị trí khối `reminders` vẫn riêng theo Space).

Chi tiết implementation + quyết định kỹ thuật khi code — xem `docs/features/layout-theo-space-progress.md` mục "11.10 mở rộng".
