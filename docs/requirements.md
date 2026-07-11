# Requirements — KN-Space

> **Trạng thái nền tảng (cập nhật):** KN-Space đã chuyển từ Chrome Extension (Phase 1, `chrome.storage`) sang **Web App cá nhân** (Phase 2, Bước 1+2). Bản extension đã được **xoá khỏi repo**, không còn duy trì. Mục 1–3 và 10–12 dưới đây mô tả đúng nền tảng hiện hành (Web App + Supabase). Mục 4–9 mô tả UX/feature chi tiết của 6 khối dữ liệu + Widget điều hướng gộp + Settings + đa Space — vẫn đúng bản chất sản phẩm.

## 1. Mục tiêu
Xây dựng **KN-Space** thành một **Web App cá nhân** dạng dashboard năng suất, chạy được trên cả desktop và di động qua một URL duy nhất, dữ liệu lưu trên cloud (Supabase) và đồng bộ tự động giữa các máy/thiết bị đã đăng nhập.

Sản phẩm gồm 2 màn: **Home** (Tabliss-style, đồng hồ + lời chào + quote trên ảnh nền full-screen) là màn mở đầu, và **Dashboard** năng suất cá nhân gồm 6 khối chính thức:
- Việc cần làm
- Nhắc việc
- Thói quen
- Ghi chú
- **Nhật ký nhanh** (mới, 2026-07-07 — log 1 dòng bất biến, không có trạng thái hoàn thành, xem mục 5.7 và `docs/features/nhat-ky-nhanh.md`)
- Thông báo

> **Cập nhật 2026-07-07:** khối "Hôm nay" (đồng hồ + ngày + quote) **không còn là 1 trong 6 khối chính thức độc lập** — đã **gộp vào Widget điều hướng** thành 1 khối duy nhất (2 hàng dọc: hàng điều hướng + hàng ambient đồng hồ/ngày/quote), luôn hiện, không thể tắt riêng theo Space nữa. Xem mục 4.1 (mô tả đầy đủ + change impact) và mục 5.6 (đã rút gọn, trỏ sang 4.1).

Giai đoạn hiện tại tập trung vào bản dùng được cho cá nhân (quy mô 1–2 người): **có cloud sync, có auth (Google), chạy được desktop + di động qua web/PWA, KHÔNG cộng tác nhiều người, KHÔNG SaaS công khai/billing**.

## 2. Đối tượng dùng
Cá nhân muốn có một dashboard gọn để quản lý việc, nhắc việc, thói quen và ghi chú, dùng được cả trên máy tính và điện thoại, dữ liệu tự đồng bộ qua tài khoản Google cá nhân — không phụ thuộc một trình duyệt/máy cụ thể như bản extension trước.

Người dùng chấp nhận:
- Đăng nhập bằng Google để dùng app (không có chế độ ẩn danh/không-tài khoản).
- Cảnh báo "ứng dụng chưa xác minh" (unverified app) của Google khi đăng nhập lần đầu, do app chưa qua quy trình Google verification. **Quyết định đã chốt:** không nộp Google verification — chấp nhận giữ cảnh báo này xuyên suốt giai đoạn cá nhân (1-2 người dùng), không đáng mất công verify ở quy mô này.
- Trên di động, Dashboard hiện **3 khối** (Việc cần làm, Ghi chú, **Nhật ký nhanh**) để giảm rối màn hẹp — xem mục 2.1. **Cập nhật 2026-07-07:** tăng từ 2 lên 3 khối là thay đổi phạm vi **có chủ đích** (thêm Nhật ký nhanh, mục 5.7 — root cause: khối "Việc cần làm" đang bị lạm dụng làm nhật ký chi tiêu qua mobile chat), không phải nới lỏng giới hạn chung — **vẫn giữ nguyên** quyết định dài hạn không mở rộng thêm khối khác (Nhắc việc/Thói quen/Thông báo/hàng ambient "Hôm nay") cho mobile.
- Vẫn có thể dùng Export/Import JSON làm backup thủ công.

### 2.1 Nền tảng & môi trường chạy
- **Web App**: React + TypeScript + Vite + Tailwind CSS.
- **Hosting**: Vercel, domain riêng `kn-space.io.vn`.
- **Lưu trữ**: Supabase (Postgres), không còn `chrome.storage`.
- **Đăng nhập**: Google OAuth qua Supabase Auth (không phải magic-link email).
- **Đồng bộ đa máy**: KHÔNG dùng Supabase Realtime (đã chủ động bỏ ở commit `aa00fae`, 2026-07-01 — gây 5 bug mất dữ liệu, không ổn định, không cần thiết cho tool cá nhân). Cơ chế thật gồm 2 phần: (1) **load-on-open** — mỗi lần mở app/tải lại trang, `AppStateContext` đọc bản mới nhất từ Supabase (settings qua `loadAppState()`, Space cá nhân/Shared Space qua `loadPrivateSpaces()`/`loadSharedSpaces()`, 5 entity con qua các store riêng — xem mục 10/11); (2) **refresh khi tab quay lại active** (`visibilitychange`, gọi nội bộ "Hướng 2") — tự tải lại Space đang mở khi tab được focus lại, bỏ qua Space đang có thao tác chưa ghi xong để không đè mất dữ liệu vừa sửa cục bộ. Sửa dữ liệu ở máy A không tự đẩy sang máy B đang mở sẵn — máy B chỉ thấy thay đổi sau khi tự mở lại/reload hoặc quay lại tab.
- **PWA**: có manifest + icon để "Add to Home Screen" trên iOS/Android, mở full-screen như app gốc. **Chưa có service worker/offline-first** — đây là việc cố ý chưa làm ở bước hiện tại, không phải bug.
- **Responsive desktop/mobile** — *Cập nhật 2026-07-07: mô tả mobile trong mục này đã đối chiếu lại đúng code thật sau đợt UI audit, thay thế mô tả cũ dựa trên breakpoint 639px:*
  - **Ngưỡng chuyển đổi mô hình UI** (toàn bộ Dashboard đổi từ layout cột tự do desktop sang UI mobile "Chat-first") là **~1000px chiều rộng cửa sổ**, không phải `≤639px`: vào mobile khi width `≤999px`, chỉ thoát mobile khi width `≥1010px` (hysteresis 2 mốc khác nhau có chủ đích, chống UI nhảy qua-lại khi resize dao động sát biên giữa 2 mô hình hoàn toàn khác nhau) — xem `src/layout/useMobileLayout.ts`. Đây là ngưỡng chính áp dụng cho mọi mô tả "Responsive desktop/mobile" trong tài liệu này, trừ khi nói rõ là breakpoint Tailwind khác (xem gạch đầu dòng cuối).
  - **Mobile không còn màn Home**: khác desktop (vẫn giữ luồng Home → Dashboard, mục 4.5), trên mobile app vào thẳng UI chính ngay sau đăng nhập — không có bước xem đồng hồ/quote/ảnh nền Home trước, và các phím tắt Enter/Space (vào Dashboard) / Esc (về Home) bị vô hiệu hoàn toàn khi đang ở chế độ mobile (xem `src/App.tsx`). Ảnh nền chung Home/Dashboard (mục 4.6) vẫn hiển thị làm nền cho UI mobile.
  - **UI chính trên mobile gồm 2 tab, đổi qua `MobileTabBar` dính đáy màn hình**:
    - **"Trò chuyện" (mặc định)**: màn chat-style hoàn toàn mới (`MobileChatScreen`) — gộp Việc cần làm + Ghi chú + **Nhật ký nhanh** (mới, xem mục 5.7) thành các "bong bóng"/dòng log theo dòng thời gian tạo (mới nhất ở dưới cùng), có avatar/tên/màu riêng theo người tạo khi ở Shared Space (phân biệt bong bóng của mình/người khác). **Cập nhật 2026-07-07:** phía trên ô nhập liệu có 1 hàng chọn loại nội dung dạng segmented `[ Việc ] [ Log ] [ Note ]`, thay cho cơ chế cũ "gõ trơn luôn tạo Việc, gõ tiền tố `/note ` mới tạo Ghi chú" — xem luồng chi tiết ở `docs/features/nhat-ky-nhanh.md` mục "Capture qua mobile chat". Không có filter/sort/kéo-thả trong màn này.
    - **"Chi tiết"**: giữ đúng hành vi accordion đã mô tả trước đây, nhưng **tăng từ 2 lên 3 khối** (Việc cần làm / Ghi chú / **Nhật ký nhanh** — mục 5.7) — khối đang mở chiếm phần lớn chiều cao, 2 khối còn lại thu nhỏ thành thanh tóm tắt (icon + tên + số lượng, bấm để đổi chỗ). Thanh tóm tắt **không có dòng preview nội dung** (giữ nguyên quyết định trước, xem comment `MobileCollapsedSummary` trong `AppLayout.tsx`). Mặc định mở "Việc cần làm" khi vào tab này.
    - Nhắc việc/Thói quen/Thông báo/hàng ambient "Hôm nay" (nay đã gộp vào Widget điều hướng, mục 4.1) vẫn bị ẩn hoàn toàn trên cả 2 tab mobile — quyết định có chủ đích và **dài hạn**. Việc thêm Nhật ký nhanh (2026-07-07) là **ngoại lệ duy nhất** đã cân nhắc kỹ (root cause cụ thể: mobile chat bị lạm dụng để log nhanh vào Việc cần làm), không phải tiền lệ mở khoá thêm khối khác cho mobile.
  - Trên di động không có nút "Về Home" ở cả 2 tab — chỉ còn thanh trên cùng cố định (Space-switcher + nút Settings, dạng compact) và `MobileTabBar` dưới cùng. **Cập nhật 2026-07-07:** thanh trên cùng này render riêng (`<DashboardCorner compact />`, tách khỏi hệ layout tự do, xem mục 4.1) — chỉ gồm **hàng nav** của widget gộp, **không** hiện hàng ambient (đồng hồ/ngày/quote) — giữ đúng hành vi cũ của khối Hôm nay ("không hiện trên di động"), không phải hành vi mới.
  - Đa Space và toàn bộ Settings (theme, accent, ảnh nền, quote, export/import) vẫn hoạt động đầy đủ trên di động.
  - Lớp lọc "chỉ 3 khối trên di động" **tách biệt hoàn toàn** với `space.enabledBlocks` (cấu hình ẩn/hiện khối theo từng Space, áp dụng đồng thời và đồng nhất trên cả desktop/di động).
  - Lưu ý phân biệt 2 khái niệm breakpoint khác nhau, tránh nhầm lẫn tiếp: breakpoint Tailwind `≤639px` (`max-sm`) **vẫn tồn tại và có ý nghĩa riêng** ở vài chỗ nhỏ hơn bên trong UI (ví dụ ẩn chip tên người tạo trên `TaskRow` khi màn quá hẹp) — đây là 1 tinh chỉnh responsive cục bộ, **khác hẳn** ngưỡng ~1000px nói trên (ngưỡng chuyển đổi toàn bộ mô hình UI mobile/desktop).

## 3. Phạm vi
Trong phạm vi:
- Web App chạy qua URL riêng (`kn-space.io.vn`), không phải extension.
- Đăng nhập bắt buộc bằng Google OAuth trước khi vào Dashboard.
- Lưu dữ liệu trên Supabase (Postgres), đồng bộ giữa các máy/thiết bị của cùng người dùng qua tải lại (load-on-open) — KHÔNG có push realtime tức thì (xem mục 2.1).
- PWA cơ bản: có thể "Add to Home Screen" trên di động, mở full-screen.
- Màn **Home** (Tabliss-style): đồng hồ real-time, ngày, lời chào theo buổi, 1 quote (xem mục 4.5/7), ảnh nền full-screen, nút "Vào Dashboard" dạng icon tối giản, dòng đếm việc hôm nay.
- Ảnh nền dùng **link ảnh tĩnh cố định** (hotlink `images.unsplash.com`) hoặc **ảnh upload từ máy** (xem mục 4.6/7), không gọi API random/search ảnh.
- Full dashboard 6 khối (Việc cần làm, Nhắc việc, Thói quen, Ghi chú, **Nhật ký nhanh**, Thông báo) — xem mục 4–9 cho chi tiết UX.
- Nhiều Space, dữ liệu thuộc về tài khoản người dùng đã đăng nhập (không còn "cục bộ trong 1 trình duyệt" như bản extension).
- Settings: theme, màu chủ đạo, ảnh nền Home (lưới preview + sửa link/upload + tự động đổi ảnh theo thời gian), quote Home (10 slot cố định + tần suất đổi), layout size, thứ tự khối, export/import.
- Ẩn/hiện nội dung từng khối (xem mục 8).
- Icon SVG nhất quán, modal tuỳ biến, accessibility cơ bản.
- Đáp ứng responsive desktop/di động như mục 2.1.
- Migrate dữ liệu từ bản extension cũ qua chính cơ chế Export/Import JSON đã có (không xây thêm).

Ngoài phạm vi hiện tại:
- Service worker / offline-first thật cho PWA (đã có manifest, chưa có phần này). Bao gồm cả hàng đợi retry tự động khi mất mạng giữa lúc sửa dữ liệu — **quyết định đã chốt:** không cần, giữ nguyên hành vi hiện tại (chỉ hiện banner cảnh báo lưu lỗi, người dùng tự sửa lại khi có mạng trở lại), đủ cho quy mô cá nhân hiện tại (xem mục 10/12).
- Mobile redesign đầy đủ cho các khối còn lại (Nhắc việc/Thói quen/Thông báo/hàng ambient "Hôm nay" — nay thuộc Widget điều hướng gộp, mục 4.1) — hiện đang ẩn trên di động. **Quyết định đã chốt:** đây là phạm vi dài hạn; việc thêm Nhật ký nhanh (2026-07-07) là ngoại lệ đã cân nhắc riêng (mục 2/2.1/5.7), không mở ra kế hoạch thêm khối khác cho mobile.
- Google OAuth verification chính thức (gỡ cảnh báo "unverified app"). **Quyết định đã chốt:** không có kế hoạch nộp verification — app chỉ 1-2 người dùng, chấp nhận cảnh báo "unverified app" xuyên suốt giai đoạn cá nhân, không đáng mất công verify (xem mục 2/10).
- Cộng tác nhiều người, mời thành viên, phân quyền, shared space (Phase 3).
- SaaS công khai/billing (Phase 4).
- Markdown/rich text.
- Đính kèm ảnh/file trong note.
- Kanban.
- Cỡ chữ tuỳ chỉnh trong Settings.
- Ảnh nền theo API Unsplash random/search (cần Access Key, có rate-limit) — chỉ dùng link tĩnh cố định đóng gói sẵn + cho sửa link thủ công + upload ảnh local.
- Setting "Màn mặc định khi mở tab" — đã bỏ, hành vi cố định là nhớ màn cuối user rời đi.
- CRUD thêm/xoá quote tự do — quote Home cố định đúng 10 slot, chỉ sửa nội dung (xem mục 4.5/7).
- Nút "Ẩn tất cả/Hiện tất cả" các khối — đã bỏ hẳn, không tồn tại ở đâu trong sản phẩm (mỗi khối đã có icon mắt riêng để ẩn/hiện từng khối, xem mục 8).
- Tắt/ẩn khối Thông báo theo Space — đã bỏ, khối Thông báo luôn hiện với mọi Space (xem mục 4.1/5.5/6/8).

## 4. Layout Dashboard
> **Phạm vi mục 4/4.1:** toàn bộ mô tả layout tự do dưới đây (cột, slot, kéo-thả, splitter) chỉ áp dụng cho **desktop** (ngoài vùng mobile, xem mục 2.1/10). Trên mobile, hệ layout tự do này **không được render** — thay bằng 1 UI cố định hoàn toàn khác (chat-first + accordion 3 khối, xem mục 2.1), không có khái niệm cột/slot/splitter. *Cập nhật 2026-07-07: mục 4/4.1 đã viết lại theo Quyết định 1 (gộp Hôm nay + Widget điều hướng) — xem change impact chi tiết cuối mục 4.1. Mục 4 (trừ 4.1) vẫn giữ khung mô tả cũ, chỉ đổi thành phần khối tham gia.*

Dashboard **không còn topbar/header ngang** (đã bỏ logo, dropdown space kiểu cũ, quote, cụm nút Home/Ẩn-tất-cả/Settings ở trên cùng). Toàn bộ điều hướng + 6 khối dữ liệu được xếp trong một **hệ layout tự do (free-form)**: nhiều cột chiếm toàn màn hình trên desktop, mỗi cột là một danh sách các "slot" xếp dọc; người dùng tự kéo-thả để chèn khối trên/dưới hoặc ghép 2 khối nằm ngang trong cùng 1 slot, và tự kéo resize qua các đường splitter ẩn — không còn khái niệm "3 khối cố định" hay slider % trong Settings.

**7 phần tử tham gia layout** (đều bình đẳng, không phần tử nào bị khoá vị trí):
- 6 khối dữ liệu: Việc cần làm (`tasks`), Nhắc việc (`reminder`), Thói quen (`habits`), Ghi chú (`notes`), **Nhật ký nhanh** (`logs`, mới — xem mục 5.7), Thông báo (`reminders`).
- **Widget điều hướng + Hôm nay (gộp)** (giữ key `settings`, xem mục 4.1): trước 2026-07-07 là 2 phần tử riêng (`today` + `settings`) — từ 2026-07-07 gộp thành **1** phần tử duy nhất, tham gia layout tự do y như các khối khác (kéo-thả đổi chỗ được), luôn hiện với mọi Space, không thuộc `enabledBlocks`. Chỉ 1 phần trong nó (hàng nav) khoá chiều cao — xem mục 4.1.

> Tổng số phần tử tham gia layout tự do vẫn là **7** (không đổi so với trước 2026-07-07) — chỉ đổi thành phần: mất `today` (đã gộp vào `settings`), thêm `logs` (mới).

### Cấu trúc 1 "slot"
Mỗi cột là danh sách slot xếp dọc, mỗi slot thuộc 1 trong 2 dạng:
- **`single`**: chứa đúng 1 khối, chiếm trọn chiều rộng cột.
- **`row`**: chứa đúng 2 khối ghép nằm ngang cạnh nhau trong cùng 1 slot (kết quả của thao tác "ghép ngang" khi kéo-thả).

### Bố cục mặc định (desktop)
> **Cập nhật 2026-07-07:** đổi theo Quyết định 1 (gộp Hôm nay + Widget điều hướng) và Quyết định 2 (thêm Nhật ký nhanh). Các con số `h` dưới đây là **gợi ý tham khảo** — `dev`/`uiux` tinh chỉnh chính xác khi code, không cần khớp tuyệt đối.

3 cột, tỉ lệ chiều rộng khởi tạo 32% / 36% / 32%:
- Cột 1: **Nhật ký nhanh** (trên — thay đúng vị trí khối "Hôm nay" cũ) + Ghi chú (dưới, chiếm phần lớn chiều cao, không đổi).
- Cột 2: Việc cần làm (trên cùng, cao nhất) + Nhắc việc + Thói quen (xếp dưới) — không đổi.
- Cột 3: **Widget điều hướng gộp** (trên — 2 hàng dọc: nav cao cố định + ambient đồng hồ/ngày/quote co giãn) + Thông báo (dưới, chiếm phần lớn chiều cao, giảm nhẹ trọng số `h` so với trước để nhường chỗ cho hàng ambient mới — ví dụ tham khảo: khối gộp `h≈20-24` thay `settings.h=14` cũ, Thông báo giảm từ `h=86` xuống `~66-70`).

Đây chỉ là **vị trí khởi tạo** — không phải bố cục cố định. Người dùng có thể kéo bất kỳ khối nào (kể cả Thông báo và Widget điều hướng gộp) sang vị trí/cột khác, ghép ngang với khối khác, hoặc đổi cả số lượng slot trong mỗi cột.

### Kéo-thả (chèn trên/dưới, ghép ngang, đổi cột)
- Với 6 khối dữ liệu có header (Việc cần làm/Nhắc việc/Thói quen/Ghi chú/**Nhật ký nhanh**/Thông báo): chỉ bấm-giữ đúng vào phần **header khối** (`.block-head`) mới bắt đầu kéo được — tránh xung đột với kéo-thả sắp xếp item con bên trong khối (task/note) hoặc thao tác chọn nhiều (Nhật ký nhanh, mục 5.7). Với **Widget điều hướng gộp** (giữ key `settings`, không có header riêng dạng `.block-head` cho toàn khối — xem mục 4.1): bấm-giữ ở bất kỳ đâu trong khối (cả hàng nav lẫn hàng ambient, trừ vùng các control tương tác như dropdown Space/nút Settings/nút Home) đều kéo được — khối "Hôm nay" cũ không còn tồn tại độc lập, hành vi "bấm bất kỳ đâu để kéo" của nó được kế thừa nguyên vẹn vào khối gộp.
- Vị trí con trỏ khi thả xác định "zone" thả, tính theo % chiều rộng/cao của khối đích:
  - Thả vào 25% mép trái hoặc 25% mép phải của khối đích (chỉ áp dụng khi khối đích đang là slot `single`, chưa ghép ngang) → **ghép ngang**: tạo 1 slot `row` mới gồm khối đang kéo + khối đích, chia trọng số chiều rộng 50/50.
  - Thả vào nửa trên (top) hoặc nửa dưới (bottom) của khối đích → **chèn dọc**: tách khối đang kéo thành 1 slot `single` mới, chèn ngay trên/dưới khối đích trong cùng cột.
  - Thả vào vùng trống của 1 cột (không đè lên khối nào) → khối đang kéo được thêm vào **cuối cột** đó.
- Khối đang kéo được gỡ khỏi vị trí cũ trước; nếu vị trí cũ là 1 slot `row` chỉ còn 1 khối sau khi gỡ, slot đó tự rút gọn về `single`.
- Không giới hạn khối nào được/không được kéo — hiện tại cả 7 phần tử đều kéo-thả tự do như nhau, kể cả Thông báo và Widget điều hướng gộp.

### Resize qua splitter ẩn
- Không còn slider/input % trong Settings để chỉnh tỉ lệ — toàn bộ resize thực hiện bằng cách **kéo trực tiếp trên Dashboard**, qua các đường splitter trong suốt (không nhìn thấy, chỉ hiện gợi ý khi hover/kéo) chèn đúng vào khoảng gap 12px sẵn có giữa các khối/cột.
- 3 loại splitter:
  - **Splitter chiều cao** giữa 2 slot xếp dọc liền kề trong cùng 1 cột — kéo đổi trọng số `h` (flex-grow) của 2 slot đó.
  - **Splitter chiều rộng giữa 2 cột** liền kề — kéo đổi % chiều rộng (`colWidths`) của 2 cột đó. Splitter này **ẩn hoàn toàn** khi màn hình hẹp dưới breakpoint `lg` (979px, các cột dồn xuống xếp chồng dọc, đổi chiều rộng cột không còn ý nghĩa). *Xác nhận (`ba`, 2026-07-07):* điều kiện `lg`/979px này thực chất là **dead code** — từ khi ngưỡng chuyển mobile/desktop nâng lên ~1000px (mục 2.1, hysteresis 999/1010px), mọi viewport `≤979px` đã sớm chuyển hẳn sang UI mobile riêng (`isMobileBlocksOnly` true) từ trước khi chạm ngưỡng `lg`, nên nhánh desktop có splitter/`#cols-wrap` không bao giờ còn render được ở độ rộng đó nữa. Không tự xoá code trong đợt rà soát tài liệu này — để dev cân nhắc dọn khi có dịp sửa `AppLayout.tsx`.
  - **Splitter chiều rộng giữa 2 khối ghép ngang** trong cùng 1 slot `row` — kéo đổi trọng số `w` của 2 khối đó.
- **Widget điều hướng gộp** (giữ key `settings`) **không còn khoá cứng toàn khối** như widget điều hướng cũ — đây là thay đổi hành vi quan trọng: từ 2026-07-07, khối gộp tham gia trọng số `h` bình thường như 1 khối dữ liệu (resize được qua splitter), nhưng chỉ tác động đúng bằng phần hàng ambient bên trong (hàng nav phía trên vẫn khoá cứng chiều cao, ở cấp CSS nội bộ component — không co giãn theo splitter). Nói cách khác: khoá cứng chuyển từ cấp *layout-engine* (toàn khối, `HEIGHT_LOCKED_IDS`) xuống cấp *nội bộ component* (chỉ hàng nav bên trong) — xem change impact ở mục 4.1.
  **Cập nhật 2026-07-09:** vẫn resize được qua splitter như trên, nhưng riêng khối `settings` có thêm **trần chiều cao 150px** (`SLOT_MAX_HEIGHT_PX` trong `dashboardLayoutUtils.ts`, áp ở cấp slot wrapper trong `AppLayout.renderSlot`) — lý do: nội dung khối (giờ/ngày/quote) vốn gọn, canh giữa đúng theo chiều cao khối, nhưng quote luôn là dòng thứ 2 trong cột text nên không thể tự nó nằm giữa toàn khối; kéo càng cao khoảng trống dư càng lộ rõ. Khi chạm trần, phần chiều cao dư được CSS flex tự nhường cho khối liền kề cùng cột (không để trống) — trừ khi khối đứng 1 mình trong cột, khi đó phần dư sẽ là khoảng trống dưới khối. Con số 150px đo thật từ nội dung tự nhiên (nav 48px + ambient ~76-100px tuỳ quote 2-3 dòng), thử ban đầu ở 220px cho thấy dư ~60px mỗi bên nhìn trống trải nên đã giảm xuống.
- Resize áp dụng ngay khi kéo (mượt theo chuyển động chuột), chỉ ghi xuống storage 1 lần khi thả chuột (không ghi dồn dập theo từng pixel di chuyển).
- Vẫn có nút **Khôi phục bố cục mặc định** trong Settings (tab "Chung") để trả layout về đúng bố cục mặc định mô tả ở trên.
- Lưu toàn bộ cấu trúc layout (số cột, slot, trọng số `h`/`w`, `colWidths`) vào storage (`settings.dashboardLayout`), **dùng chung cho mọi Space** (không lưu riêng theo từng Space).
- **Cập nhật 2026-07-08 (đang xem xét, CHƯA chốt — xem `docs/features/layout-theo-space.md`):** chủ dự án đề nghị đảo ngược quyết định "dùng chung cho mọi Space" ở gạch đầu dòng trên — muốn layout (vị trí/kích thước từng khối) độc lập theo từng Space (căn cứ 3 ảnh Dashboard thật ở 3 Space khác nhau: "Chi tiêu gia đình Kino" ưu tiên Nhật ký nhanh to, "MAFC" ưu tiên Ghi chú, "Cá nhân" bố cục khác hẳn — đổi layout ở Space này hiện đang làm hỏng layout Space khác). `ba` đã phân tích đầy đủ phương án lưu trữ, migration, change impact, acceptance criteria và câu hỏi mở (đặc biệt cách xử lý Shared Space — layout có nên đồng bộ giữa các thành viên hay không) tại `docs/features/layout-theo-space.md`, khuyến nghị lưu theo cặp (user, Space): vẫn ở cấp `Settings` (không đồng bộ giữa thành viên Shared Space), đổi từ 1 `DashboardLayout` duy nhất thành map khoá theo `spaceId`. **CHƯA triển khai** — còn 1 câu hỏi mở quan trọng cần chủ dự án xác nhận trước khi giao `uiux`/`dev` (cách xử lý Shared Space). Mô tả "dùng chung cho mọi Space" ở trên vẫn đúng với code thật hiện tại cho tới khi có xác nhận và cập nhật lại mục này.

### Ẩn khối theo Space không phá vỡ layout đã lưu
- Khi 1 khối bị tắt theo `enabledBlocks` của Space hiện tại (mục 6), khối đó chỉ **không render**, vị trí của nó trong cấu trúc layout đã lưu vẫn giữ nguyên — bật lại đúng chỗ cũ khi đổi Space khác hoặc bật lại `enabledBlocks`.
- Nếu khối bị ẩn nằm trong 1 slot `row` ghép ngang với khối khác, layout hiển thị (không phải layout lưu) tự hạ slot đó về `single` chỉ chứa khối còn hiển thị, để không giữ khoảng trống theo trọng số `w` của khối đã ẩn. Nếu cả cột không còn slot nào hiển thị, cột đó bị ẩn hẳn khỏi màn hình (nhưng vẫn còn trong dữ liệu lưu).

### 4.1 Widget điều hướng (đã gộp với khối "Hôm nay" — cập nhật 2026-07-07, tinh chỉnh style 2026-07-08)

> **Quyết định đã chốt** (chủ dự án, phối hợp `ba`/`uiux`, 2026-07-07): Widget điều hướng và khối "Hôm nay" (mục 5.6 cũ) — trước đây là 2 `LayoutBlockKey` riêng (`settings` và `today`) — được **gộp thành 1 khối duy nhất**. Đây là thay đổi cấu trúc thật, không phải chỉnh sửa nhỏ — xem change impact ở cuối mục này.

Vì Dashboard không còn topbar, các điều hướng trước đây nằm trên topbar (Home, đổi Space, Settings) được dồn vào 1 widget, cộng thêm phần hiển thị thuần đồng hồ/ngày/quote (trước đây là khối "Hôm nay" riêng) — tất cả nằm trong **1 card duy nhất, xếp 2 hàng dọc**, tham gia layout tự do như 1 khối bình thường (kéo-thả đổi vị trí được, xem mục 4).

**Hàng trên — Nav** (y hệt nội dung/hành vi widget điều hướng cũ, không đổi hành vi — riêng **nền chung của cả khối** đã đổi 2026-07-08, xem "Style hợp nhất nav + ambient" bên dưới):
- Nút **Về Home** (icon-only).
- **Space-switcher** dạng dropdown, chiếm phần rộng còn lại, căn giữa nội dung trong nút, gồm:
  - Dot màu riêng từng Space (xoay vòng theo bảng màu cố định theo index, không đổi khi sắp xếp lại thứ tự Space).
  - Tên Space hiện tại.
  - Khi mở dropdown: mỗi Space hiển thị dòng phụ nhỏ mờ dạng preview `"X việc hôm nay · Y note"` (X = số task có ngày hôm nay và chưa xong, Y = tổng số note của Space đó).
  - Gợi ý phím tắt `Alt+số` (Windows/Linux) hoặc `Cmd+số` (Mac) hiển thị cạnh tên cho **9 Space đầu tiên** theo thứ tự trong danh sách (Space thứ 10+ không có gợi ý phím tắt).
  - Vẫn giữ các thao tác tạo/đổi tên/xoá/đổi thứ tự Space như mục 6.
- Nút **Settings** (icon-only).
- **Chiều cao hàng này khoá cứng** theo nội dung thật (chỉ 1 dòng icon, không co giãn thêm) — giữ đúng hành vi khoá cứng cũ, nhưng giờ khoá ở cấp CSS nội bộ component, không phải cấp trọng số `h` toàn khối (xem "Resize qua splitter ẩn" phía trên).
- 3 control (nút Về Home, nút Space-switcher, nút Settings) **giữ nguyên 100%, không đổi** — mỗi nút tự có nền `--raised` riêng, không phụ thuộc lớp nền/overlay chung của cả khối (xem "Style hợp nhất nav + ambient" bên dưới).

**Hàng dưới — Ambient** (y hệt nội dung/hành vi khối "Hôm nay" cũ, mục 5.6 cũ):
- Đồng hồ giờ:phút (không có giây — khác đồng hồ ở màn Home, mục 4.5, có giây).
- Ngày dạng ngắn.
- 1 câu quote, lấy từ cùng nguồn 10 slot quote với màn Home (`settings.homeQuotes`) — cùng một thời điểm, hàng ambient và Home luôn hiển thị cùng 1 câu quote đang active (cùng `index`).
- Thuần hiển thị: không CRUD, không có thao tác sửa/xoá/thêm nào.
- **Resize tự do** theo trọng số `h` chung của cả khối gộp — khi user kéo splitter đổi chiều cao cả khối, chỉ hàng ambient này giãn/co, hàng nav phía trên giữ nguyên (khoá cứng).
- Chữ trắng cố định, không đổi theo theme sáng/tối (giữ đúng style `TodayBlock.tsx` cũ) — nền cụ thể xem "Style hợp nhất nav + ambient" bên dưới (đã đổi 2026-07-08, không còn dùng riêng nền/overlay khác với hàng nav như trước).
- Không có header riêng (không `.block-head`), không áp dụng cơ chế icon mắt ẩn/hiện nội dung mục 8 cho riêng hàng này (đồng nhất với hành vi cũ của khối Hôm nay).

**Style hợp nhất nav + ambient (cập nhật 2026-07-08 — thay thế quyết định "2 hàng không dung hoà style" đã chốt 2026-07-07):** Đã xem bản demo thật (`DashboardCornerBlock.tsx`, Phần 5 đã code xong) và nhận thấy 2 hàng trông như "2 mảng dán lại" chứ không phải 1 khối liền mạch — do nền cũ của hàng nav (~88-90% `--panel-bg`, đổi theo theme) là kết quả trộn theme + ảnh nền blur phía sau, màu không kiểm soát được. `uiux` đề xuất, chủ dự án đã đồng ý (`ok`) phương án sau:
- Bỏ hẳn nền `color-mix(panel-bg)` gần đặc đổi theo theme, bỏ `saturate(1.15)`, bỏ `border-b` chia 2 hàng của hàng nav.
- Cả khối (nav + ambient) dùng chung **1 lớp overlay gradient đen dọc duy nhất** (`180deg`, chạy suốt từ đỉnh hàng nav tới đáy hàng ambient): `rgba(0,0,0,.14)` ở đỉnh → `rgba(0,0,0,.32)` ở đáy (giữ nguyên giá trị đậm nhất `.32` đã dùng cho hàng ambient từ trước), không đổi theo theme sáng/tối, không phụ thuộc ảnh nền.
- Giữ `backdrop-filter: blur(8px)` nhẹ cho cả khối (bỏ `saturate(1.15)` từng chỉ áp cho hàng nav).
- 3 control trong hàng nav (Home/Space-switcher/Settings) giữ nguyên 100%, không đổi — đã tự có nền `--raised` riêng, không phụ thuộc lớp overlay này.

Khối gộp **luôn hiện, không phụ thuộc `enabledBlocks` của Space nào** (kế thừa đúng tính chất "luôn hiện" của cả 2 khối cũ) — đảm bảo Dashboard luôn có cách đổi Space/mở Settings/về Home/xem giờ, bất kể Space hiện tại tắt bao nhiêu khối dữ liệu khác. Khối Thông báo cũng luôn hiện với mọi Space, không thể tắt (mục 5.5/6/8) — đây vẫn là 2 ràng buộc **độc lập**, có thể nằm ở 2 vị trí bất kỳ trong layout tự do, không nhất thiết cùng cột/cạnh nhau.

**Trên mobile:** thanh trên cùng cố định (`<DashboardCorner compact />`, tách khỏi hệ layout tự do — mục 2.1) chỉ render **hàng nav**, không render hàng ambient — giữ đúng hành vi cũ ("Hôm nay" chưa từng hiện trên mobile, mục 5.6 cũ), không phải hành vi mới cần code thêm.

---

#### Change impact — gộp Hôm nay + Widget điều hướng

1. **Mất khả năng tắt riêng khối "Hôm nay" theo từng Space.** Trước đây `enabledBlocks.today` cho phép từng Space ẩn/hiện hàng ambient độc lập (mục 6/8 cũ). Sau khi gộp, hàng ambient đi theo khối nav (luôn hiện), **không còn cách nào ẩn riêng nó theo Space nữa** — đây là thay đổi hành vi thật, không phải hiệu ứng phụ vô tình. Modal "Sửa Space" bỏ hẳn checkbox "Hôm nay" khỏi danh sách khối chọn bật/tắt (mục 6).
2. **Migration layout đã lưu (bắt buộc, ảnh hưởng mọi user hiện có):** `settings.dashboardLayout` cũ có 2 slot độc lập cho `id:'today'` và `id:'settings'`. Cần logic migrate 1 lần khi load layout cũ:
   - Vị trí neo: dùng đúng vị trí (cột + index) của slot `settings` cũ (vì nav luôn ổn định hơn, ít khả năng đã bị kéo đi chỗ khác).
   - Nếu user đã kéo `today` sang vị trí khác/ghép ngang với khối khác — vị trí `today` cũ bị **bỏ hẳn** sau migrate (không giữ được 2 vị trí cho 1 khối gộp); slot chứa `today` (nếu là `single`) bị xoá khỏi cột, nếu là 1 phần tử trong `row` thì slot đó rút về `single` chỉ chứa khối còn lại (tái dùng logic `removeIdFromLayout` sẵn có trong `dashboardLayoutUtils.ts`).
   - Chiều cao slot gộp mới: kế thừa/nội suy hợp lý từ `h` cũ của `today` (vì đây là phần giờ co giãn được) — không cần khớp chính xác tuyệt đối, chỉ cần không bị `0`/âm. `dev` tự chọn công thức nội suy hợp lý khi code (vd `max(today.h, settings.h)` hoặc cộng có trọng số), ghi chú lại trong code.
   - Migrate chạy **tự động, 1 chiều**, khi phát hiện layout cũ còn `id:'today'` — không cần UI riêng cho user, không cần thông báo (thay đổi visual nhỏ, không mất dữ liệu nghiệp vụ).
3. **`LayoutBlockKey`** (`src/types.ts` dòng ~101, hiện `'tasks' | 'reminder' | 'habits' | 'notes' | 'reminders' | 'settings' | 'today'`) đổi thành: bỏ `'today'`, thêm `'logs'` (mục 5.7), **giữ `'settings'`** làm key cho khối gộp (đỡ đổi mapping cũ ở nhiều nơi: `HEIGHT_LOCKED_IDS`, `ENABLED_BLOCKS_KEY`, `MOBILE_VISIBLE_BLOCKS`, `blockRefs`...). Tên key chính xác là quyết định implementation của `dev` khi code — có thể đổi tên nếu thấy `settings` gây hiểu lầm, không bắt buộc.
4. **`HEIGHT_LOCKED_IDS`** (`dashboardLayoutUtils.ts`) hiện chứa `'settings'` — sau khi gộp, **phải bỏ `'settings'` khỏi tập này** (khối gộp không còn khoá cứng toàn khối ở cấp layout-engine). Khoá cứng cho hàng nav chuyển xuống CSS nội bộ (`flex: 0 0 auto` cho hàng nav, `flex: 1 1 auto` cho hàng ambient, trong cùng 1 component).
5. **`ENABLED_BLOCKS_KEY`** (`AppLayout.tsx`) hiện map `today: 'today'` — xoá dòng này (khối gộp không thuộc `enabledBlocks` nào, giống `reminders`/`settings` cũ, trả `true` mặc định trong `isBlockVisible`).
6. **`MOBILE_VISIBLE_BLOCKS`** (`AppLayout.tsx`, hiện `Set(['tasks', 'notes'])`) cần thêm `'logs'` → `Set(['tasks', 'notes', 'logs'])`. Không cần thêm `'today'`/`'settings'` vào set này vì khối gộp luôn hiện độc lập với set này (điều kiện `id !== 'settings'` đã có sẵn trong `isBlockVisible`).
7. **`EnabledBlocks`** (`src/types.ts`) mất field `today`, thêm field `logs` (mục 5.7) — ảnh hưởng `createSeedSpaces()` (`seed.ts`) và mọi nơi validate/normalize `enabledBlocks` từ storage cũ (`src/storage/normalize.ts` — cần fallback cho dữ liệu cũ còn field `today` thừa/thiếu field `logs`).
8. **`CollapsedBlocks`** (`src/types.ts`) cần thêm field `logs: boolean` (Nhật ký nhanh có header + icon mắt, tham gia cơ chế mục 8 — khác Hôm nay cũ không có field này).
9. **`defaultDashboardLayout()`** (`seed.ts`) đổi theo bố cục mặc định mới ở mục 4 phía trên (`today`→`logs` ở cột 1, `settings` giữ vị trí cột 3 nhưng đổi `h`, `reminders` giảm `h`).
10. `renderBlock()`/`case 'today':` trong `AppLayout.tsx` bị xoá; `case 'settings':` đổi sang render component gộp mới (đề xuất giữ tên file `DashboardCorner.tsx` mở rộng thêm hàng ambient, hoặc tách thêm 1 sub-component cho hàng ambient bên trong — quyết định implementation của `dev`).
11. `TodayBlock.tsx` như 1 file/component riêng **không còn là 1 `LayoutBlockKey` độc lập** — nội dung (JSX/style/logic đồng hồ) được tái sử dụng làm hàng ambient bên trong khối gộp. `dev` quyết định giữ file này như 1 sub-component được import vào `DashboardCorner.tsx`, hay merge code trực tiếp — không ảnh hưởng yêu cầu nghiệp vụ.
12. Mục 5.6 (mô tả khối "Hôm nay") trong tài liệu này **không còn mô tả 1 khối độc lập** — nội dung chi tiết chuyển vào mục 4.1 phía trên; mục 5.6 giữ lại số mục (rút gọn, trỏ sang 4.1) để không vỡ tham chiếu chéo ở nơi khác.
13. Mục 8 (Ẩn/Hiện khối): danh sách khối có thể tắt hẳn theo Space (`enabledBlocks`) đổi từ 5 khối (`tasks/reminder/habits/notes/today`) thành `tasks/reminder/habits/notes/logs` (mất `today`, thêm `logs`).
14. **(Bổ sung 2026-07-08)** CSS hàng nav (`DashboardCornerBlock.tsx`): xoá nền `color-mix(panel-bg)` + `saturate(1.15)` + `border-b` riêng của hàng nav; thay bằng 1 lớp overlay gradient đen dọc `180deg` dùng chung cho cả khối (nav + ambient), `backdrop-filter: blur(8px)` áp dụng chung. Không ảnh hưởng cấu trúc DOM/hành vi khoá chiều cao đã mô tả ở mục 3/9 change impact phía trên — chỉ đổi CSS nền.

**Acceptance Criteria — Quyết định 1 (gộp Hôm nay + Widget điều hướng):**
- AC1: Trên desktop, chỉ có đúng 1 card duy nhất chứa cả nav (Home/Space-switcher/Settings) và ambient (đồng hồ/ngày/quote) — không còn 2 card tách rời cho `today` và `settings`.
- AC2: Hàng nav trong card gộp không đổi chiều cao dù kéo splitter chiều cao của slot chứa nó (chỉ hàng ambient co giãn).
- AC3: Card gộp luôn hiển thị ở mọi Space, kể cả khi Space đó đã tắt hết `enabledBlocks` khác — không có cách nào ẩn nó qua modal "Sửa Space".
- AC4: Modal "Sửa Space" không còn checkbox "Hôm nay" trong danh sách khối chọn bật/tắt.
- AC5: Load layout đã lưu từ trước khi gộp (còn `id:'today'` riêng) không gây lỗi/crash — tự động migrate về 1 slot gộp đúng vị trí cột của `settings` cũ, không mất khối/dữ liệu Space khác.
- AC6: Trên mobile (≤999px), thanh trên cùng chỉ hiện hàng nav (nút Home ẩn theo `compact`, Space-switcher, Settings) — không hiện đồng hồ/ngày/quote, giống hệt hành vi trước khi gộp.
- AC7: Bấm-giữ ở bất kỳ đâu trong card gộp (ngoài vùng dropdown Space/nút Settings/nút Home) đều bắt đầu kéo-thả đổi vị trí được, giống hành vi widget điều hướng cũ.
- AC8 (**cập nhật 2026-07-08**, thay thế AC8 cũ 2026-07-07 "Style 2 hàng khác nhau rõ rệt... không có yêu cầu dung hoà"): Cả khối (nav + ambient) dùng chung đúng 1 lớp overlay gradient đen dọc (`180deg`, `rgba(0,0,0,.14)` ở đỉnh nav → `rgba(0,0,0,.32)` ở đáy ambient), không đổi theo theme sáng/tối, không phụ thuộc ảnh nền, cùng `backdrop-filter: blur(8px)`. Hàng nav không còn nền `color-mix(panel-bg)`, không còn `saturate`, không còn `border-b` chia 2 hàng. 3 control trong hàng nav (nút Về Home/Space-switcher/Settings) giữ nguyên nền `--raised` gốc, không đổi.

**Câu hỏi mở cần xác nhận (giữ nguyên từ trước, không liên quan Quyết định 1/2):**
1. ~~Mục 5.5, mục 6, mục 8 và mục 12 hiện vẫn còn câu chữ tham chiếu bố cục cũ...~~ **Đã chốt (`ba`, 2026-07-07):** rà lại toàn bộ — mục 6/8 vốn đã mô tả đúng layout tự do (không cần sửa); mục 5.5 (câu "cố định vị trí cuối cùng") và mục 12 (dòng verification mobile) đã cập nhật lại đúng code thật ngay tại chỗ.
2. Có cần giới hạn số cột tối đa hay số khối ghép ngang tối đa trong 1 slot (hiện tại tối đa 2 khối/slot `row`, không hỗ trợ ghép 3 khối trở lên) không, hay giữ nguyên như code thật?
3. *Phát sinh 2026-07-07 (đợt rà soát mobile):* mô tả splitter chiều rộng giữa cột "ẩn khi màn hình hẹp dưới breakpoint `lg` (979px), các cột dồn xuống xếp chồng dọc" (đoạn "Resize qua splitter ẩn" phía trên) dường như là hành vi **không còn khả năng xảy ra trên thực tế**: ngưỡng chuyển sang UI mobile (`≤999px`, xem mục 2.1) luôn kích hoạt TRƯỚC khi cửa sổ desktop co xuống dưới 979px. Cần xác nhận: đây có phải hành vi tồn dư (vestigial) từ thời breakpoint mobile còn là `≤639px`, chưa dọn sau khi nâng ngưỡng, hay có kịch bản thực tế nào khác khiến nhánh dồn-cột này vẫn xuất hiện được?

## 4.5 Màn Home (Tabliss-style)
> **Cập nhật 2026-07-07 (phạm vi chỉ desktop):** toàn bộ mục 4.5 mô tả đúng hành vi **desktop**. Trên mobile, màn Home đã bị bỏ hẳn — app vào thẳng UI chính (chat-first, xem mục 2.1/10), không qua Home, không có phím tắt Enter/Space/Esc mô tả ở phần "Điều hướng" bên dưới. Không đổi mô tả desktop bên dưới.

Home là màn đầu tiên khi mở tab mới (trên desktop), tách hoàn toàn khỏi Dashboard.

Nội dung Home:
- Đồng hồ lớn giờ:phút:giây cập nhật real-time (giây hiển thị nhỏ hơn, kiểu superscript).
- Ngày hiển thị dạng "Thứ X, ngày D tháng M năm YYYY".
- Lời chào theo buổi: sáng (giờ < 11) / trưa (11–13) / chiều (14–17) / tối (từ 18h), có thể ghép tên người dùng nếu đã đặt (mặc định để trống).
- 1 câu quote ngắn, lấy từ danh sách **10 slot cố định** đóng gói cứng trong code (không phải CRUD thêm/xoá tự do, sửa nội dung qua Settings tab "Quote", xem mục 7):
  - Mặc định chọn theo **chỉ số ngày tính từ epoch modulo 10** (cùng ngày luôn ra cùng câu) — tần suất "Mỗi ngày".
  - Có thể đổi sang 1 trong 3 tần suất khác (xem mục 7): Mỗi lần mở Home / Mỗi 15 phút / Mỗi 1 giờ.
  - Đổi quote có hiệu ứng crossfade nhẹ (fade-out ngắn rồi fade-in), không đổi tức thì.
  - Không gọi API quote ngoài.
- Ảnh nền full-screen (xem mục 4.6), dùng chung layer với Dashboard.
- Dòng nhỏ "X việc cần làm hôm nay" ở góc dưới-phải Home: đếm số task có ngày = hôm nay và chưa xong, **của Space hiện tại**. Tự ẩn hoàn toàn (không chiếm khoảng trống) khi count = 0, không hiện "0 việc".

Điều hướng (chỉ desktop — xem ghi chú phạm vi ở đầu mục):
- 1 nút CTA duy nhất để chuyển sang Dashboard, đổi sang phong cách tối giản: chỉ gồm 1 icon mũi tên to (có animation nảy nhẹ liên tục, lặp vô hạn) kèm caption nhỏ uppercase ngay dưới icon — không khung/nền/viền/shadow/blur quanh icon. Vẫn là 1 nút bấm thật (giữ đầy đủ semantics/accessibility), có thể bấm bất kỳ đâu trong vùng icon + caption (vùng bấm mở rộng hơn phần nhìn thấy).
- Không có hint text khác, không có nút "Kéo xuống", không có cử chỉ scroll-wheel (đã loại bỏ qua nhiều vòng feedback vì dư thừa).
- Phím tắt ngầm (không hiển thị gợi ý): `Enter` hoặc `Space` khi đang ở Home và không có input/textarea/select đang focus, không có modal mở → vào Dashboard.
- Từ Dashboard: nút **Về Home** trong widget điều hướng cố định (mục 4.1) hoặc phím `Esc` (khi không có modal mở) → quay lại Home.
- Chuyển màn có transition fade (~0.45s), ảnh nền giữ nguyên không nháy/reload.
- Mở tab mới luôn mở lại đúng màn cuối cùng user rời đi (Home hoặc Dashboard), lưu vào storage dưới dạng `lastScreen`. Đây là hành vi cố định, **không phải setting cho người dùng chọn**.

## 4.6 Ảnh Nền Chung (Home + Dashboard)
- Ảnh nền là **1 layer duy nhất** dùng chung cho cả Home và Dashboard — không đổi/nhảy ảnh khi chuyển màn, đảm bảo liền mạch.
- Bộ ảnh mặc định gồm 6 slot ảnh phong cảnh tĩnh (rừng/núi/hồ/đồi). Mỗi slot là một trong hai dạng:
  - `{type:'url', value: string}` — link ảnh hotlink trực tiếp tới `images.unsplash.com` qua URL cố định trong code, **không gọi API Unsplash random/search** (không cần Access Key, không rate-limit). Đây là dạng mặc định ban đầu cho 6 slot.
  - `{type:'upload', value: base64}` — ảnh người dùng upload từ máy (xem chi tiết mục 7). Slot ở dạng này không đồng bộ giữa các máy (mục 10).
- Ảnh đang dùng được chọn theo chỉ số ngày tính từ epoch khi mở app lần đầu trong ngày (đồng bộ cách chọn với quote mặc định "Mỗi ngày"), người dùng có thể đổi thủ công bất kỳ lúc nào, áp dụng cho slot dạng `url` hoặc `upload` đều như nhau.
- Đổi ảnh (thủ công, shuffle, hay auto-rotate) có hiệu ứng chuyển mượt (crossfade 2 layer, không đổi tức thì/giật).
- Khi ảnh lỗi tải (link hỏng/offline): fallback sang 1 trong các gradient đóng gói sẵn trong code, không để màn trắng vỡ.

## 5. Tính Năng Chi Tiết

### 5.1 Việc Cần Làm
Chỉ quản lý việc một lần, có theo dõi hoàn thành.

Yêu cầu:
- Tạo việc với tên + ngày/giờ tuỳ chọn + nội dung chi tiết tuỳ chọn (field `content`, textarea, ghi chú thêm như nội dung cần chuẩn bị/link tài liệu).
- Modal "Thêm/Sửa việc" dùng kích thước modal rộng (cùng class với modal Note, rộng hơn modal mặc định), gồm: tên việc, nội dung (textarea tuỳ chọn), ngày/giờ tuỳ chọn.
- Task có nội dung chi tiết (`content` không rỗng) hiển thị icon nhỏ cạnh tên việc trong danh sách để báo có ghi chú chi tiết.
- Danh sách phẳng, có field `order` riêng từng task để lưu thứ tự sắp xếp thủ công.
- Kéo-thả sắp xếp thủ công qua icon grip (cùng cơ chế đã có ở Ghi chú): kéo-thả ghi lại `order` cho **toàn bộ task** theo thứ tự hiển thị mới.
- Khi filter là "Tất cả": task **Đã xong tự động xuống cuối danh sách khi hiển thị**, nhưng **không đổi field `order` lưu trữ** lúc tick done — chỉ ảnh hưởng thứ tự hiển thị (nhóm chưa-xong sắp theo `order`, nối tiếp nhóm đã-xong sắp theo `order` riêng của nhóm đó). Bỏ tick lại thì task về đúng vị trí cũ trong nhóm chưa xong vì `order` gốc không đổi.
- Khi filter là "Chưa xong" hoặc "Đã xong": danh sách đã đồng nhất 1 nhóm, sắp xếp thẳng theo `order`, không cần tách nhóm.
- Filter: Tất cả / Chưa xong / Đã xong.
- Checkbox done/chưa done.
- Sửa tên/nội dung/ngày/giờ.
- Xoá bằng modal xác nhận tuỳ biến.
- Không có lặp lại trong khối này.
- Không filter/gán theo người.

### 5.2 Nhắc Việc
Khối này dùng để định nghĩa nhắc nhở, không phải task, nên **không có trạng thái hoàn thành**.

Yêu cầu:
- Tạo nhắc việc loại **1 lần**: tên + ngày + giờ tuỳ chọn.
- Tạo nhắc việc loại **lặp lại**:
  - Tên.
  - Chu kỳ dạng `Mỗi [N] [đơn vị]`.
  - Đơn vị: Giờ / Ngày / Tháng.
  - `N >= 1`.
  - Nếu đơn vị là Tháng: có thêm ngày trong tháng `1-31`.
  - Nếu đơn vị là Ngày/Tháng: có giờ trong ngày tuỳ chọn.
  - Nếu đơn vị là Giờ: không cần giờ cụ thể.
- Sửa/xoá nhắc việc.
- Xoá bằng modal xác nhận tuỳ biến.
- Không checkbox, không done.
- Không filter/gán theo người.

### 5.3 Thói Quen
Yêu cầu:
- Tạo thói quen với tên.
- Tick hoàn thành hôm nay.
- Lưu theo danh sách ngày cụ thể `completedDates` (`yyyy-mm-dd`), không dùng cờ `doneToday` đơn lẻ.
- Hiển thị streak liên tiếp tính từ hôm nay lùi về trước.
- Hiển thị 7 ngày gần nhất bằng dãy chấm tròn:
  - Chấm tô màu = đã hoàn thành.
  - Chấm rỗng = chưa hoàn thành.
  - Chấm hôm nay có nhấn nhẹ.
  - Tên ngày hiển thị qua tooltip.
- Sửa/xoá thói quen.
- Xoá bằng modal xác nhận tuỳ biến.

### 5.4 Ghi Chú
Chỉ có một loại card: **Note**.

Yêu cầu:
- Bấm **+ Thêm note** để tạo note.
- Mỗi note có:
  - Tiêu đề.
  - Nội dung plain text.
  - Màu riêng.
  - `updatedAt`.
  - `order`.
- Khi tạo mới, tự gán màu xoay vòng theo bảng màu có sẵn.
- Người dùng đổi màu note trong modal sửa.
- Click thân card mở modal **xem** read-only.
- Từ modal xem hoặc icon trên card có thể mở modal sửa.
- Xoá note bằng modal xác nhận tuỳ biến.
- Không markdown/rich text.
- Không đính kèm ảnh/file.

Hiển thị note:
- Có 2 chế độ: **Grid** và **List**.
- Grid dùng CSS grid, mặc định.
- List hiển thị mỗi note một dòng/card full width.
- Không dùng masonry.
- Có tìm kiếm theo tiêu đề/nội dung.
- Có sắp xếp:
  - Thứ tự thủ công.
  - Tên A-Z.
  - Mới sửa gần nhất.
- Kéo-thả đổi thứ tự card chỉ khả dụng khi đang sắp xếp **Thứ tự thủ công**.

Ẩn/hiện nội dung note:
- Mỗi card có icon mắt để toggle ẩn/hiện nội dung riêng card đó.
- Khi ẩn, tiêu đề vẫn hiển thị.
- Nội dung bị mask bằng `***` theo từng dòng.
- Trạng thái ẩn chỉ tồn tại trong phiên xem hiện tại, không lưu xuống storage.
- Khi đổi Space, trạng thái ẩn note reset.
- Modal xem có icon mắt đồng bộ trạng thái với card.

### 5.5 Thông Báo
Khối Thông báo tự tổng hợp từ Việc cần làm, Nhắc việc và Thói quen.

Yêu cầu:
- Hiển thị việc một lần có ngày là hôm nay.
- Hiển thị nhắc việc một lần/lặp lại phù hợp.
- Hiển thị thói quen chưa hoàn thành hôm nay.
- Sắp xếp mục có giờ cụ thể theo giờ gần nhất lên trên.
- Mục không có giờ rõ ràng xếp sau.
- Mục đầu tiên chưa xong được tô nổi bật nhẹ + nhãn "Mới".
- Với mục từ Việc cần làm/Thói quen: có nút **Xong**, không ẩn khỏi danh sách, chỉ đổi trạng thái UI và đồng bộ về khối gốc.
- Với mục từ Nhắc việc: chỉ đọc, không có nút Xong.
- Khối này **cố định vị trí cuối cùng** trong cột chứa widget điều hướng (không phải "3 khối chính" — layout thật là hệ cột/slot tự do, xem mục 4/4.1) và **width luôn tự động = phần còn lại** (không có slider riêng, không kéo-thả đổi thứ tự) — xem mục 4/4.1.
- Khối Thông báo **luôn hiện với mọi Space, không thể tắt/ẩn theo Space** — khác với các khối dữ liệu còn lại có thể bật/tắt qua `enabledBlocks` (xem mục 6/8). Lý do: khối này dùng chung cột layout với widget điều hướng cố định (Về Home/Space-switcher/Settings, xem mục 4.1); nếu cho tắt sẽ mất luôn widget điều hướng của Space đó, không còn cách đổi Space/mở Settings từ Dashboard (chỉ còn `Esc` về Home). Khối Thông báo vẫn có icon mắt để ẩn/hiện **nội dung** (như mục 8), chỉ không có trong danh sách khối được phép tắt hẳn theo Space.

### 5.6 Hôm nay (đã gộp vào Widget điều hướng — xem mục 4.1)

> **Cập nhật 2026-07-07:** khối "Hôm nay" không còn là 1 khối độc lập trong hệ layout tự do (không còn `LayoutBlockKey` riêng `today`) — đã gộp làm **hàng ambient** bên trong Widget điều hướng (mục 4.1). Toàn bộ nội dung/hành vi mô tả trước đây ở mục này (đồng hồ giờ:phút không giây, ngày ngắn, quote dùng chung nguồn 10 slot với Home, style nền trong suốt/chữ trắng cố định, resize tự do, không hiện trên mobile) **vẫn giữ nguyên y hệt** — chỉ khác chỗ đặt. Đọc mục 4.1 để xem mô tả đầy đủ; mục 5.6 này giữ lại số mục để không vỡ tham chiếu chéo ở nơi khác trong tài liệu.
>
> Khác biệt hành vi quan trọng nhất so với trước: khối này **không còn thuộc `enabledBlocks`** — mất khả năng tắt riêng theo từng Space (trước đây có `enabledBlocks.today`). Xem change impact đầy đủ ở mục 4.1.

### 5.7 Nhật ký nhanh

> **Mới (2026-07-07).** Khối content thứ 6 trong Dashboard, thay thế đúng vị trí "Hôm nay" cũ trong danh sách 6 khối chính thức (mục 1). Tài liệu chi tiết đầy đủ (User Stories, Luồng chi tiết, Permission, UX, Edge Cases, Schema): `docs/features/nhat-ky-nhanh.md`. Tóm tắt:

- **Entity mới hoàn toàn** (`LogEntry`), không lai vào Note — record **bất biến**, chỉ tạo và xoá, không sửa, không có ngày/giờ hẹn/trạng thái hoàn thành/màu/`order` thủ công (luôn sắp theo `createdAt`).
- **Item-level** (mỗi log = 1 record riêng) — bắt buộc để tương thích an toàn với Last-Write-Wins + load-on-open của Shared Space.
- `LayoutBlockKey` mới: `logs` (tên chính xác do `dev` quyết) — tham gia đầy đủ layout tự do desktop, **có trong `enabledBlocks`** (tắt/bật riêng theo Space, giống Task/Note/Habit), và tham gia accordion mobile (tab "Chi tiết" tăng từ 2 lên 3 khối — mục 2.1).
- Capture chính qua `MobileChatScreen` — hàng chọn loại segmented `[ Việc ] [ Log ] [ Note ]` thay cho cơ chế gõ-trơn-luôn-là-Task + tiền tố `/note ` trước đây.
- Hiển thị: list phẳng 1 cột, mỗi dòng = giờ + nội dung (clamp 2 dòng) + tên người tạo (Shared Space, nếu không phải mình) + nút xoá; sort Mới nhất/Cũ nhất; hỗ trợ xoá hàng loạt (chế độ chọn, không có "Chọn tất cả").
- Không có nút thêm log trên desktop — capture chỉ qua mobile chat, desktop chỉ xem lại/xoá/bulk-delete (quyết định mặc định, xem lý do trong feature doc).
- RLS/quyền: giống hệt Task/Note hiện có (`auth.uid()` cá nhân, `space_members` Shared Space, mọi member sửa/xoá được item của nhau).

## 6. Space
Hỗ trợ nhiều Space, dữ liệu thuộc về tài khoản người dùng đã đăng nhập (lưu trên Supabase, không còn "cục bộ trong 1 trình duyệt" như bản extension cũ).

Yêu cầu:
- Đổi Space qua **Space-switcher dạng dropdown** trong widget điều hướng cố định dưới khối Thông báo (xem mục 4.1) — không còn dropdown cạnh logo trên topbar (đã bỏ topbar).
- Hiển thị tên Space hiện tại + dot màu riêng từng Space.
- Bấm dropdown để xem danh sách Space, mỗi Space kèm preview "X việc hôm nay · Y note".
- Click Space để chuyển ngay.
- Demo seed ban đầu có thể gồm "Cá nhân" và "Công ty" nếu chưa có dữ liệu (user mới, chưa có hàng nào trong Supabase).
- Tạo Space mới.
- Đổi tên Space.
- Xoá Space, nhưng không cho xoá nếu chỉ còn 1 Space.
- Xoá Space bằng modal xác nhận.
- Nếu xoá Space đang mở, tự chuyển sang Space còn lại.
- Có nút lên/xuống để đổi thứ tự Space trong menu.
- Thứ tự Space được lưu lại.
- Phím tắt đổi nhanh Space: `Alt+1-9` (Windows/Linux) hoặc `Cmd+1-9` (Mac, tự nhận diện OS qua `navigator.userAgent`/`navigator.platform`) để chuyển sang Space theo thứ tự trong danh sách (chỉ 9 Space đầu có phím tắt). Chỉ hoạt động khi không đang gõ trong input/textarea/select và không có modal nào mở.

Mỗi Space có:
- Dữ liệu riêng cho các khối.
- Cấu hình bật/tắt khối (`enabledBlocks`) cho **5 khối** (modal "Sửa Space" liệt kê 5 khối này để chọn bật/tắt) — *cập nhật 2026-07-07*:
  - Việc cần làm.
  - Nhắc việc.
  - Thói quen.
  - Ghi chú.
  - **Nhật ký nhanh** (mới, 2026-07-07 — thay cho "Hôm nay" cũ, xem mục 5.7; hàng ambient "Hôm nay" nay luôn hiện cùng Widget điều hướng, không còn trong danh sách này — xem mục 4.1).
- Khối Thông báo và Widget điều hướng gộp (kể cả hàng ambient "Hôm nay") **không nằm trong `enabledBlocks` có thể tắt** — luôn hiện với mọi Space (xem mục 4.1/5.5/8), không xuất hiện trong checkbox chọn khối ở modal "Sửa Space".
- Khối nào trong 5 khối trên bị tắt thì ẩn hẳn khỏi dashboard của Space đó.
- Các khối còn lại tự giãn lấp khoảng trống.

Khi chuyển Space:
- Filter Việc cần làm reset về **Tất cả**.
- Tìm kiếm note reset rỗng.
- Sắp xếp note reset về **Thứ tự thủ công**.
- Trạng thái ẩn nội dung note reset.
- **Mới (2026-07-07):** sắp xếp Nhật ký nhanh reset về **Mới nhất**; chế độ chọn nhiều (bulk-select) của Nhật ký nhanh tự thoát (xem mục 5.7/`docs/features/nhat-ky-nhanh.md`).

Settings dùng chung mọi Space:
- Theme.
- Màu chủ đạo.
- Ảnh nền (Home + Dashboard).
- Quote Home (10 slot + tần suất đổi).
- Tỉ lệ layout.
- Thứ tự khối chính.

> **Cập nhật 2026-07-08 (đang xem xét, CHƯA chốt — xem `docs/features/layout-theo-space.md`):** 2 gạch đầu dòng cuối ("Tỉ lệ layout", "Thứ tự khối chính") đang được cân nhắc đổi từ "dùng chung mọi Space" sang "riêng theo từng (user, Space)" — theo yêu cầu chủ dự án (3 Space dùng khác nhau, đổi layout Space này hiện đang phá layout Space khác). Chưa có thay đổi trong code — danh sách "Settings dùng chung mọi Space" ở trên vẫn đúng thực tế hiện tại cho tới khi chốt hướng và cập nhật lại mục này.

## 7. Settings
Settings trình bày dạng **3 tab**, modal Settings có **kích thước cố định** (không co giãn theo nội dung): header, thanh tab, vùng nút hành động luôn cố định, chỉ phần nội dung từng tab (`.settings-body`) cuộn riêng, không cuộn cả modal:
- Tab **"Chung"**: Theme sáng/tối, Màu chủ đạo, Bố cục/kích thước khối, Export/Import.
- Tab **"Ảnh nền"**: lưới ảnh nền Home (6 slot, mỗi slot là link hoặc upload), tuỳ chọn "Tự động đổi ảnh".
- Tab **"Quote"**: lưới 10 slot quote Home, tuỳ chọn tần suất đổi quote.

Ảnh nền Home (tab "Ảnh nền"):
- Lưới preview 6 ô, mỗi ô tương ứng 1 slot trong bộ ảnh mặc định (mục 4.6), mỗi slot là link ảnh hoặc ảnh upload.
- Click vào ảnh trong ô để áp dụng ngay làm ảnh nền hiện tại (dùng chung Home + Dashboard).
- Mỗi ô có input cho sửa trực tiếp link ảnh; áp dụng khi blur hoặc nhấn Enter.
- Mỗi ô có nút **Upload ảnh** để chọn file ảnh từ máy (qua `FileReader`), thay slot đó sang dạng `upload` (base64); nhập link mới vào ô đang ở dạng upload sẽ chuyển ô đó trở lại dạng `url`.
- Trước khi lưu ảnh upload: resize cạnh dài tối đa ~1920px, nén JPEG quality ~80-85% nếu vẫn còn nặng — xử lý ở client trước khi lưu, không lưu file gốc nguyên bản.
- Ảnh upload lưu trong cùng cột `settings` (jsonb) trên Supabase như mọi cấu hình khác — đã đồng bộ giữa các máy/thiết bị (khác bản extension cũ, nơi ảnh upload chỉ tồn tại cục bộ trên máy đã upload).
- Ô có link lỗi (load ảnh thất bại) hiện cảnh báo "Link lỗi" đè lên thumbnail, không tự đổi ảnh.
- Có tuỳ chọn "Tự động đổi ảnh" theo khoảng thời gian: Tắt / Mỗi 1 phút / **Mỗi 15 phút (mặc định)** / Mỗi 1 giờ.
- Đã gỡ hẳn mục Ảnh nền gradient/Trơn cũ và cơ chế "header tint đổi theo tông ảnh nền" — không còn dùng.

Quote Home (tab "Quote"):
- Lưới **10 slot cố định** (không CRUD thêm/xoá), mỗi ô là 1 textarea sửa trực tiếp nội dung câu quote tại chỗ.
- Ô đang được hiển thị trên Home có viền nổi (active-slot), giống cách đánh dấu slot ảnh nền đang dùng.
- Mỗi ô có nút nhỏ "Dùng câu này" để áp dụng ngay slot đó làm quote hiện tại trên Home.
- Có tuỳ chọn **tần suất đổi quote**, 4 lựa chọn:
  - **Mỗi ngày (mặc định)**: chọn theo chỉ số ngày tính từ epoch modulo 10, như cách chọn ảnh nền theo ngày.
  - **Mỗi lần mở Home**: đổi quote mỗi khi quay lại màn Home.
  - **Mỗi 15 phút**: đổi theo interval cố định, không phụ thuộc reload trang.
  - **Mỗi 1 giờ**: đổi theo interval cố định.
- Đổi quote (theo bất kỳ tần suất nào) có hiệu ứng crossfade nhẹ, không đổi tức thì.

Export/Import (tab "Chung"):
- Export xuất toàn bộ spaces + settings (gồm cả 10 slot quote và 6 slot ảnh nền) ra file `.json`, là cơ chế **full backup cá nhân** — bao gồm đầy đủ ảnh upload (base64 inline), không tách bản nhẹ riêng.
- File export có thể nặng (vài MB) nếu có nhiều ảnh upload — đánh đổi đã được chấp nhận (đối tượng dùng 1-2 người, ưu tiên backup đầy đủ hơn file nhẹ).
- Import đọc file `.json` và thay thế dữ liệu hiện tại sau khi người dùng xác nhận.
- Sau import, UI reset về trạng thái mặc định hợp lý: Space hợp lệ, filter Tất cả, note sort Thứ tự thủ công.
- Export/Import JSON cũng chính là cơ chế **migrate dữ liệu từ bản extension cũ** sang web app mới: export từ extension cũ → đăng nhập web app → import file đó vào.

## 8. Ẩn/Hiện Khối
Đây là cơ chế **ẩn/hiện nội dung từng khối qua icon mắt ở header** (`.block-head`), áp dụng cho **6 khối có header** (*cập nhật 2026-07-07, thêm Nhật ký nhanh*): Việc cần làm, Nhắc việc, Thói quen, Ghi chú, **Nhật ký nhanh**, Thông báo. Widget điều hướng gộp (bao gồm hàng ambient "Hôm nay" cũ) không có header riêng nên không có icon mắt, không thuộc cơ chế này (xem mục 4.1). Đây là cơ chế **khác** với cơ chế **tắt hẳn khối khỏi Space** (`enabledBlocks`, mục 6) — 2 danh sách khối áp dụng không trùng nhau hoàn toàn, xem chi tiết bên dưới.

Yêu cầu:
- Mỗi khối có icon mắt ở header.
- Bấm icon để ẩn/hiện nội dung khối.
- Khi ẩn, khối **giữ nguyên kích thước**, chỉ thay body bằng placeholder căn giữa.
- Placeholder gồm icon mắt-gạch + text "Đã ẩn nội dung [tên khối]".
- Các nút phụ trong header như filter/+Thêm ẩn theo. Với Nhật ký nhanh: nút "Chọn" (bulk-delete, mục 5.7) và dropdown sort cũng ẩn theo khi nội dung bị ẩn.
- Tắt hẳn khối khỏi Dashboard theo từng Space (`enabledBlocks`, xem mục 6) áp dụng cho **5 khối** (*cập nhật 2026-07-07*): Việc cần làm, Nhắc việc, Thói quen, Ghi chú, **Nhật ký nhanh** (thay cho "Hôm nay" cũ — hàng ambient "Hôm nay" giờ luôn hiện cùng Widget điều hướng, không còn tắt được theo Space, xem mục 4.1). Khối Thông báo và Widget điều hướng gộp không có cấu hình tắt hẳn theo Space — luôn hiện với mọi Space (xem mục 4.1/5.5/6).
- Lưu ý 2 cơ chế độc lập nhau, không phải khối nào cũng tham gia cả hai: khối **Nhật ký nhanh** tham gia **cả hai** cơ chế (có header + icon mắt, và có trong `enabledBlocks`) — khác "Hôm nay" cũ (trước đây có `enabledBlocks` nhưng không có header/icon mắt). Khối Thông báo có icon mắt ẩn nội dung nhưng không thể tắt hẳn theo Space (mục 5.5).
- Không có nút "Ẩn tất cả/Hiện tất cả" — đã bỏ hẳn khỏi sản phẩm (không có ở Dashboard cũ trên topbar, cũng không có trong Settings); mỗi khối tự ẩn/hiện độc lập qua icon mắt riêng.

## 9. UI/UX
Yêu cầu:
- Không dùng emoji làm icon chính.
- Dùng hệ icon SVG line-icon nhất quán.
- Mỗi khối có icon-chip màu riêng:
  - Việc cần làm: xanh/accent.
  - Nhắc việc: xanh ngọc.
  - Thói quen: cam.
  - Ghi chú: tím.
  - Thông báo: hồng.
  - **Nhật ký nhanh** (mới, 2026-07-07): xám/slate trung tính — chủ đích chọn màu trung tính vì log không có "mức độ quan trọng" như task/note (mặc định `ba` đề xuất, `uiux` có thể tinh chỉnh khi thiết kế chi tiết).
- Card/khối có shadow nhẹ, viền mỏng.
- Checkbox tuỳ biến, không dùng checkbox mặc định của OS.
- Modal nền đặc, dễ đọc (modal **không** áp dụng kính mờ).
- Xác nhận xoá dùng modal tuỳ biến, không dùng `window.confirm()`.
- Click ra ngoài modal để đóng, tương đương Hủy.
- Hiệu ứng nhẹ:
  - Resize layout transition khoảng 0.15s.
  - Drag item/block có opacity khi kéo (áp dụng cả 3 khối được phép kéo-thả thứ tự thủ công — Task/Note/Habit không nằm trong nhóm này thực chất chỉ Task/Note có grip kéo-thả sắp xếp — **Nhật ký nhanh không tham gia** nhóm này vì luôn sắp theo `createdAt`, không có sắp xếp thủ công, mục 5.7).
  - Drop target có outline/nhấn nhẹ.
  - Đổi ảnh nền/quote dùng crossfade mượt (không đổi tức thì).
- Không dùng phong cách Duolingo.
- **Dashboard dùng kính mờ nhẹ** (đảo ngược quyết định cũ "không glassmorphism"): từ khi Dashboard nổi trên ảnh nền chung, các khối chính/sub-block dùng nền bán-trong-suốt + `backdrop-filter: blur()`, alpha cao ~88-90% (đủ đọc rõ chữ, khác biệt với kính mờ trong suốt mạnh kiểu Duolingo). Ảnh nền lộ ra ở viền ngoài dashboard và khe (gap) giữa các khối. Quyết định này đã thử nghiệm qua nhiều vòng so sánh (gồm cả biến thể "nền đặc không kính mờ" và "kính mờ trong suốt cao"), chốt phương án kính mờ nhẹ vì giữ được độ rõ chữ tốt nhất trong khi vẫn tạo cảm giác khối "nổi trên" ảnh. **Ngoại lệ (cập nhật 2026-07-08):** hàng nav của Widget điều hướng gộp (mục 4.1) không dùng alpha ~88-90% `--panel-bg` này nữa — dùng chung 1 lớp overlay gradient đen cố định (`.14`→`.32`) với hàng ambient bên dưới nó, xem "Style hợp nhất nav + ambient" ở mục 4.1.

Accessibility cơ bản:
- Nút chỉ có icon phải có `title` và `aria-label`.
- Checkbox tuỳ biến có `role="checkbox"` và `aria-checked`.
- Swatch màu/ảnh nền có focus visible.
- Các nút quan trọng có focus outline.

## 10. Ràng Buộc Kỹ Thuật
Nền tảng:
- Web App: React + TypeScript + Vite + Tailwind CSS.
- Hosting: Vercel, domain riêng `kn-space.io.vn` (DNS: A record `216.198.79.1` + CNAME `www`, mua tại matbao.net).
- Không phải Chrome Extension, không cần permission/manifest MV3, không có CSP riêng của extension.
- Dùng **lucide-react** làm thư viện icon chính.

Auth:
- Google OAuth qua Supabase Auth (`supabase.auth.signInWithOAuth({ provider: 'google' })`), không có chế độ dùng không cần đăng nhập.
- App Google Cloud ở chế độ "In production" (không giới hạn số test user) nhưng **chưa qua Google verification** — chấp nhận hiển thị cảnh báo "unverified app". **Quyết định đã chốt (không phải tạm thời):** không nộp Google verification — app chỉ 1-2 người dùng, chấp nhận cảnh báo "unverified app" xuyên suốt giai đoạn cá nhân, không đáng mất công verify.
- Không dùng magic-link/email — đã thử trước đó, bỏ vì rate-limit gửi mail của Supabase free tier quá thấp cho UX đăng nhập thực tế.

Lưu trữ (Supabase):
- **Kiến trúc đã tách bảng theo từng Space + từng entity con** (khác mô tả cũ "1 bảng `kn_space_state` duy nhất, 1 hàng/user, gộp hết Space vào cột `spaces` jsonb" — mô tả đó đã LỖI THỜI, giữ lại chỉ để lịch sử ở `docs/features/storage-architecture-fix.md`/`item-level-entity-tables.md`). Cấu trúc thật hiện tại:
  - `kn_space_state`: vẫn còn tồn tại nhưng phạm vi đã thu hẹp — **1 hàng/user** (PK = `user_id`), CHỈ còn dùng để lưu `settings` (jsonb). Cột `current_space_id` là cột chết (Space đang mở lưu ở `localStorage`, riêng từng máy, xem `src/storage/localCurrentSpace.ts`); cột `spaces` (jsonb) vẫn còn trên DB nhưng KHÔNG còn được code đọc/ghi (chưa xoá khỏi schema, chờ dọn ở đợt sau).
  - `kn_private_spaces`: Space CÁ NHÂN, **1 hàng/Space** (không phải 1 hàng/user gộp hết Space như `kn_space_state` cũ) — mỗi hàng có cột `version` + trigger tự tăng riêng, tránh 1 tab giữ bản cũ ghi đè mất toàn bộ Space khác.
  - `kn_shared_spaces` + `kn_space_members` + `kn_space_invites`: Shared Space (Phase 3) — xem `docs/features/shared-space.md`.
  - 5 entity con (Việc cần làm/Ghi chú/Thói quen/Nhắc việc/Nhật ký nhanh) đã tách khỏi mảng jsonb trong Space sang bảng riêng theo từng item: `kn_private_<entity>`/`kn_shared_<entity>` (trừ Thói quen chỉ có bản private, KHÔNG có bản Shared) — xem `docs/features/item-level-entity-tables.md`. Cột jsonb tương ứng (`tasks`/`notes`/`habits`/`reminders`/`logs`) trong `kn_private_spaces`/`kn_shared_spaces` VẪN CÒN nhưng chỉ là nhánh ghi dự phòng (dual-write), KHÔNG còn là nguồn đọc thật.
- RLS: Space cá nhân (`kn_space_state`, `kn_private_spaces`, 5 bảng `kn_private_<entity>`) đều ràng buộc `auth.uid() = user_id` — mỗi user chỉ đọc/ghi đúng hàng của chính mình. Shared Space (`kn_shared_spaces`, `kn_space_members`, 4 bảng `kn_shared_<entity>` — không có Thói quen) dựa trên hàm `is_space_member(space_id)`/`is_space_owner(space_id)` (SECURITY DEFINER, tránh đệ quy RLS) theo membership trong `kn_space_members`, không dùng khái niệm `auth.uid() = user_id`.
- **Cơ chế ghi: blind last-write-wins, KHÔNG version-check/optimistic-locking** — quyết định đã chốt, xem `docs/features/conflict-handling-simplification.md`. Mọi bảng vẫn có cột `version` + trigger tự tăng vô điều kiện mỗi UPDATE, nhưng tầng application chỉ dùng trigger này để có `updated_at` "miễn phí" — KHÔNG gửi kèm điều kiện `AND version = expected` khi ghi, KHÔNG có logic retry khi phát hiện version lệch.
- **Không dùng Supabase Realtime** — đã chủ động bỏ (commit `aa00fae`, 2026-07-01) vì gây bug mất dữ liệu, không cần thiết cho quy mô cá nhân/nhóm nhỏ. Đồng bộ đa máy qua 2 cơ chế: load-on-open (mở app/reload trang mới đọc bản mới nhất từ Supabase) và refresh khi tab quay lại active (`visibilitychange`, xem mục 2.1) — không có push tức thì khi máy khác đang mở sẵn cùng lúc.
- Ghi dữ liệu có **debounce 600ms** sau mỗi mutation (task/note/habit/reminder/log/space/theme/layout/thứ tự khối) — với 5 entity con, debounce theo đơn vị `itemId` (`src/state/itemPersist.ts`, gộp nhiều sửa liên tiếp CÙNG 1 item); với settings/Space/layout, debounce theo kênh riêng (`supabaseStore.ts`/`AppStateContext.tsx`).
- Seed dữ liệu demo (Cá nhân/Công ty) chỉ khi user mới đăng nhập lần đầu, chưa có hàng settings nào trong `kn_space_state` — Space demo được tạo riêng qua `kn_private_spaces` (không phải cột `spaces` jsonb cũ).
- Mỗi task/note có field `order` — kéo-thả sắp xếp thủ công dùng **fractional-index** (số thực, không phải số nguyên cũ): 1 lần kéo-thả chỉ tính lại `order` của ĐÚNG 1 item vừa kéo (`src/state/fractionalOrder.ts`), các item khác giữ nguyên giá trị, khác hẳn cách cũ reindex `0..n-1` toàn mảng mỗi lần kéo-thả. Task còn có field `content` (string tuỳ chọn, nội dung chi tiết).
- **Mới (2026-07-07):** mỗi Space có thêm entity `logs: LogEntry[]` (Nhật ký nhanh, mục 5.7) — entity mới, immutable, field tối thiểu `id/content/createdBy?/createdAt`, không có `order`/`updatedAt`/`done` (xem schema tại `docs/features/item-level-log-schema.sql`, đã gộp vào `supabase/schema.sql`). `EnabledBlocks` thêm field `logs`, mất field `today`; `CollapsedBlocks` thêm field `logs`.
- Lưu thêm `lastScreen` (Home/Dashboard), cấu hình ảnh nền (6 slot — mỗi slot kèm `type`: `url`/`upload` — + chỉ số đang chọn + khoảng tự động đổi ảnh), và cấu hình quote (10 slot nội dung + chỉ số đang chọn + tần suất đổi `quoteRotateMode`: `daily`/`onopen`/`every15m`/`every1h`) trong cột `settings` của `kn_space_state`.
- Ảnh upload (base64) lưu trong cùng cột `settings` (jsonb) — **đồng bộ giữa các máy** vì cùng nằm trên Supabase (khác hẳn bản extension cũ, nơi ảnh upload chỉ tồn tại cục bộ trên máy đã upload do giới hạn `chrome.storage.local`).
- **Mất mạng giữa lúc sửa dữ liệu — quyết định đã chốt:** không cần hàng đợi/retry tự động. Giữ nguyên hành vi hiện tại: lưu lỗi → chỉ hiện banner cảnh báo lưu lỗi, người dùng tự sửa lại (thường chỉ 1 lần) khi có mạng trở lại. Đủ cho quy mô cá nhân hiện tại (1-2 người dùng); không xây thêm cơ chế lưu tạm/queue (xem mục 12).

PWA:
- `public/manifest.webmanifest`: tên, icon 192/512, `display: standalone`, `theme_color`/`background_color` — đủ để "Add to Home Screen" trên iOS/Android, mở full-screen như app gốc.
- **Chưa có service worker / offline-first** — cố ý chưa làm, không phải bug; có thể bổ sung sau nếu phát sinh nhu cầu dùng khi mất mạng.

Responsive desktop/di động:
- **Cập nhật 2026-07-07:** mô tả breakpoint/mobile dưới đây đã đối chiếu lại đúng code thật sau đợt UI audit, thay thế mô tả cũ dựa trên breakpoint `≤639px` (xem thêm mục 2.1 cho phần mô tả đầy đủ hơn).
- **Ngưỡng chuyển đổi mô hình UI mobile/desktop**: `useMobileLayout()` (`src/layout/useMobileLayout.ts`) — vào mobile khi width `≤999px` (`MOBILE_ENTER_MAX`), chỉ thoát mobile khi width `≥1010px` (`MOBILE_EXIT_MIN`) — hysteresis 2 mốc để chống UI nhảy qua-lại khi resize dao động sát biên giữa 2 mô hình UI khác hẳn nhau (cột tự do desktop / chat-first mobile). Đây là breakpoint chính, khác breakpoint Tailwind `≤639px` (`max-sm`) vẫn còn dùng riêng cho vài tinh chỉnh responsive nhỏ hơn bên trong UI (ví dụ ẩn chip tên người tạo trên `TaskRow`) — 2 khái niệm độc lập, không nhầm lẫn.
- Trên mobile: bỏ hẳn màn Home (`src/App.tsx`), vào thẳng UI chính. UI chính gồm 2 tab đổi qua `MobileTabBar` dính đáy: **"Trò chuyện"** (mặc định — màn chat-style mới `MobileChatScreen`, gộp Việc cần làm + Ghi chú + **Nhật ký nhanh** thành bong bóng/dòng log theo dòng thời gian, nhập nhanh qua 1 ô input + Enter, chọn loại qua segmented `[Việc][Log][Note]` — cập nhật 2026-07-07, thay tiền tố `/note `) và **"Chi tiết"** (accordion **3 khối** Việc cần làm + Ghi chú + Nhật ký nhanh — không có dòng preview nội dung ở thanh tóm tắt). Mặc định mở "Việc cần làm" trong tab "Chi tiết". Không có nút "Về Home" ở cả 2 tab (chỉ còn thanh Space-switcher + Settings dạng compact trên cùng). **Quyết định đã chốt:** phạm vi 3 khối + ẩn Nhắc việc/Thói quen/Thông báo/hàng ambient "Hôm nay" trên mobile là dài hạn, không có kế hoạch mở rộng thêm khối khác.
- Khối điều hướng (Space-switcher + Settings) luôn hiện trên cả desktop/mobile, không tính vào danh sách khối nội dung bị ẩn trên mobile.

## 11. Cấu Trúc Web App
```
index.html
  package.json
  tsconfig.json
  vite.config.ts
  tailwind.config.js
  postcss.config.js
  public/
    manifest.webmanifest
    icons/
  src/
    main.tsx
    App.tsx
    types.ts
    lib/
      supabaseClient.ts
    auth/
      AuthContext.tsx
      LoginScreen.tsx
    storage/
      supabaseStore.ts       # settings (kn_space_state) + điều phối seed
      privateSpaceStore.ts   # kn_private_spaces (Space cá nhân)
      sharedSpaceStore.ts    # kn_shared_spaces + kn_space_members/invites
      taskStore.ts / noteStore.ts / habitStore.ts / reminderStore.ts / logStore.ts
                              # 5 entity con, mỗi entity 1 bảng private (+ shared, trừ habit)
      normalize.ts
      types.ts
    state/
      AppStateContext.tsx
      itemPersist.ts          # debounce ghi theo itemId cho 5 entity con
      reducers/                # tasks/notes/habits/reminders/logs/spaces/settings
      fractionalOrder.ts       # tính lại `order` khi kéo-thả (không reindex toàn mảng)
      seed.ts
    layout/
      AppLayout.tsx
      useDashboardLayout.ts
      dashboardLayoutUtils.ts
    components/
    features/
      tasks/
      reminders/
      habits/
      notes/
      logs/        # Nhật ký nhanh (mới, mục 5.7) — entity/UI riêng, không lai Note
      notifications/
      today/       # nội dung tái dùng làm hàng ambient trong DashboardCorner (mục 4.1) — không còn là LayoutBlockKey riêng từ 2026-07-07
      spaces/
      settings/
  supabase/
    schema.sql
```

Vai trò:
- `index.html` + `src/main.tsx` + `src/App.tsx`: bootstrap web app, gồm cả màn Home.
- `src/auth/`: Google OAuth qua Supabase, context phiên đăng nhập (`AuthContext`), màn đăng nhập (`LoginScreen`).
- `src/storage/supabaseStore.ts`: chỉ còn load/save `settings` (`kn_space_state`, debounce 600ms) + điều phối seed dữ liệu demo. Space cá nhân/Shared Space/5 entity con đọc/ghi qua các store riêng cùng thư mục (`privateSpaceStore.ts`/`sharedSpaceStore.ts`/`taskStore.ts`/`noteStore.ts`/`habitStore.ts`/`reminderStore.ts`/`logStore.ts`) — thay hoàn toàn `chromeStorage.ts` cũ. Không có Realtime subscribe (đã bỏ chủ động, xem mục 10).
- `src/state/itemPersist.ts`: điểm gọi duy nhất từ `AppStateContext.tsx` cho mọi mutation của 5 entity con — debounce 600ms theo `itemId` (không phải theo Space), gộp nhiều sửa liên tiếp cùng 1 item trước khi ghi lên bảng item-level tương ứng.
- `src/layout/`: hệ layout Dashboard tự do (kéo-thả + resize qua splitter), bao gồm logic responsive mobile (ẩn khối, accordion).
- `src/features/`: UI/logic theo từng khối chức năng (bao gồm Home).
- `lucide-react`: icon UI line-icon nhất quán trong dashboard.
- `public/manifest.webmanifest` + `public/icons/`: cấu hình PWA "Add to Home Screen".
- `supabase/schema.sql`: schema + RLS đầy đủ (Space cá nhân/chung + 5 entity con item-level), chạy 1 lần trên Supabase Dashboard > SQL Editor để dựng schema từ đầu. Không có dòng `alter publication supabase_realtime add table ...` nào (đã dọn sạch — xem mục 10).

## 12. Verification
Dev cần kiểm tra:
- `npm run build` thành công.
- Đăng nhập Google OAuth thành công, redirect đúng về app sau khi xác thực.
- Đăng xuất hoạt động, quay lại màn đăng nhập.
- User mới (chưa có hàng settings trong `kn_space_state`, chưa có Space nào trong `kn_private_spaces`) được seed dữ liệu demo đúng, lưu thành công lên Supabase.
- User cũ đăng nhập lại trên máy khác thấy đúng dữ liệu đã lưu (đồng bộ qua Supabase).
- Sửa dữ liệu ở máy A → máy B (cùng tài khoản) thấy đúng thay đổi **sau khi tự reload/mở lại app, hoặc sau khi quay lại tab** (refresh khi tab active lại) — KHÔNG kỳ vọng tự cập nhật ngay lập tức khi máy B đang mở sẵn cùng lúc (không có Realtime, xem mục 10).
- Mở tab mới hiện đúng màn Home/Dashboard theo `lastScreen` đã lưu.
- Home: đồng hồ chạy đúng giờ máy, quote/ảnh nền theo đúng tần suất đã chọn, nút "Vào Dashboard" hoạt động kèm phím Enter/Space, Esc từ Dashboard quay lại Home, dòng "X việc cần làm hôm nay" hiện đúng số và ẩn hẳn khi = 0.
- Ảnh nền lỗi/offline rơi về gradient fallback, không vỡ layout; đổi ảnh có crossfade mượt, không giật.
- Upload ảnh nền từ máy: ảnh được resize/nén trước khi lưu, áp dụng được làm ảnh nền hiện tại, vẫn còn sau reload và **đồng bộ đúng khi đăng nhập từ máy khác**.
- CRUD đủ các khối (Task/Reminder/Habit/Note/**Log**), đồng bộ đúng lên Supabase (debounce 600ms).
- Tạo/đổi tên/xoá/sắp xếp Space.
- Bật/tắt khối theo Space: modal "Sửa Space" hiện checkbox cho **5 khối** (Việc cần làm/Nhắc việc/Thói quen/Ghi chú/**Nhật ký nhanh**); khối Thông báo và Widget điều hướng gộp (kể cả hàng ambient "Hôm nay") không có checkbox, luôn hiện ở mọi Space.
- Đổi theme/màu/layout/thứ tự khối, lưu và đồng bộ đúng.
- Export JSON tải file đúng, bao gồm đầy đủ ảnh upload base64 inline, 10 slot quote, và **`logs[]` của mọi Space**.
- Import JSON khôi phục đúng sau xác nhận — verify thêm: import file export từ bản extension cũ vào web app mới, dữ liệu lên đúng Supabase.
- Trên di động (ngưỡng ~1000px, xem mục 2.1): không có màn Home, mặc định vào thẳng tab "Trò chuyện" (feed hợp nhất Task+Note+**Log** dạng bong bóng chat, quick-add có segmented `[Việc][Log][Note]`), chuyển được sang tab "Chi tiết" (accordion **3 khối** Task+Note+Log) qua `MobileTabBar`; Space-switcher + Settings vẫn dùng được trong `DashboardCorner` thu gọn.
- **Widget điều hướng gộp (mới, 2026-07-07; style tinh chỉnh 2026-07-08):** hiển thị đúng 2 hàng (nav cố định chiều cao + ambient co giãn), resize qua splitter chỉ ảnh hưởng hàng ambient, hàng nav không đổi kích thước. Layout đã lưu từ trước (còn `id:'today'`/`id:'settings'` riêng) migrate đúng 1 lần thành 1 slot gộp, không mất vị trí/mất dữ liệu Space khác. Trên mobile chỉ hiện hàng nav (compact), không hiện hàng ambient. Cả 2 hàng dùng chung 1 lớp overlay gradient đen dọc cố định (không đổi theo theme) + `backdrop-filter: blur(8px)`, không còn nền `color-mix(panel-bg)` riêng của hàng nav — xem mục 4.1 AC8.
- **Nhật ký nhanh (mới, mục 5.7):** tạo/xoá log qua `MobileChatScreen` (segmented `[Việc][Log][Note]`, nhớ lựa chọn gần nhất trong phiên); log hiển thị đúng list phẳng trên khối desktop, sort Mới nhất/Cũ nhất; bulk-delete hoạt động đúng (chế độ Chọn, không có "Chọn tất cả", modal xác nhận tuỳ biến, tự thoát khi đổi Space/chuyển tab mobile/thu gọn accordion); bật/tắt theo Space qua `enabledBlocks.logs`; đồng bộ đúng ở Shared Space (mọi member sửa/xoá được log của nhau, giống Task/Note).
- "Add to Home Screen" trên iOS/Android mở app full-screen đúng theme/icon.
- Mất mạng giữa lúc sửa dữ liệu: có cảnh báo, không crash app (chưa có offline-first/queue — quyết định đã chốt, không cần, xem mục 10).

## Câu hỏi mở / việc tồn đọng
1. ~~Mục 4/4.1 (Layout Dashboard tự do) đã được rà soát lại đúng code thật~~ (`src/layout/AppLayout.tsx`, `useDashboardLayout.ts`, `dashboardLayoutUtils.ts`) — khối "Hôm nay" đã được bổ sung mô tả riêng ở **mục 5.6** (nay đã gộp vào mục 4.1, xem mục 4/4.1/5.6/5.7). **Đã chốt (`ba`, 2026-07-07):** câu hỏi về mục 5.5/6/8/12 đã xử lý xong (xem câu hỏi mở cuối mục 4.1); câu hỏi về giới hạn số khối ghép ngang tối đa/slot vẫn còn mở, chưa cần quyết định gấp.
2. ~~Phát sinh khi viết mục 5.6: hành vi khối Hôm nay không khớp mô tả ban đầu~~ — **đã chốt (2026-07-03)**: giữ đúng code thật (resize được + tắt/bật theo Space). *Lưu ý 2026-07-07: quyết định "tắt/bật theo Space" ở đây đã bị **thay thế** bởi Quyết định 1 (gộp vào Widget điều hướng, luôn hiện, không còn tắt được theo Space) — xem mục 4.1/5.6.*
3. **Mục 2.1/4/4.5/10 đã rà soát lại đúng code thật về hành vi mobile (2026-07-07)**, theo phát hiện của `uiux` (`docs/features/ui-audit-2026-07.md` mục 3, câu hỏi mở #1): breakpoint mobile chính đổi từ `≤639px` (sai) sang ~1000px (999/1010 hysteresis, `useMobileLayout.ts`), mobile bỏ hẳn màn Home, thêm mô tả màn "Trò chuyện" (`MobileChatScreen`) + `MobileTabBar`. **Đã chốt (`ba`, 2026-07-07)** — đã đọc lại toàn bộ code liên quan (`useMobileLayout.ts`, `App.tsx`, `AppLayout.tsx`, `MobileChatScreen.tsx`) và xác nhận đây là **1 quyết định thiết kế trọn vẹn, nhất quán nội bộ**, không phải trạng thái dở dang. 2 việc tồn đọng đã xử lý luôn trong đợt này:
   - Mục 12 (Verification): đã sửa dòng kiểm thử mobile để đúng ngưỡng ~1000px và luồng "Trò chuyện"/"Chi tiết" (không còn ghi `≤639px`/chỉ-accordion).
   - Câu hỏi splitter "ẩn dưới breakpoint `lg` 979px" (mục 4): **xác nhận là dead code** — vì ngưỡng vào-mobile là `≤999px` không có hysteresis ở chiều "đang desktop" (`MOBILE_ENTER_MAX=999`), nên tại mọi độ rộng `≤979px` app đã sớm chuyển sang UI mobile riêng (nhánh desktop chứa splitter/`#cols-wrap` không còn được render) — không còn kịch bản nào khiến điều kiện `lg`/979px này còn ý nghĩa thực tế. Đã ghi chú kết luận này ngay tại mục 4 (không tự xoá code — để dev cân nhắc dọn khi có dịp sửa `AppLayout.tsx`).
4. **Gộp "Hôm nay" + Widget điều hướng, và thêm khối "Nhật ký nhanh" (`ba`, 2026-07-07):** đã chốt đầy đủ qua trao đổi với chủ dự án + `uiux` trong phiên làm việc — xem mục 4.1 (change impact chi tiết), mục 5.7, và `docs/features/nhat-ky-nhanh.md`. **Không còn câu hỏi mở nào chặn việc bắt đầu code** cho 2 quyết định này. 2 điểm từng để mở đã tự chọn default (ghi rõ trong `docs/features/nhat-ky-nhanh.md` mục Câu hỏi mở): giới hạn hiển thị bubble trong `MobileChatScreen` (tăng ngưỡng, có số cụ thể) và không làm nút "+ Ghi nhanh" trên desktop cho Nhật ký (chỉ capture qua mobile chat, xem lại trên desktop). Các điểm còn lại (tên `LayoutBlockKey` chính xác, màu icon-chip Nhật ký, con số `h` mặc định chính xác trong `defaultDashboardLayout()`) là quyết định implementation của `dev`/`uiux`, không cần `ba`/chủ dự án duyệt lại trước khi code.
5. **Tinh chỉnh style hàng nav Widget điều hướng gộp (`ba`+`uiux`, 2026-07-08):** đã chốt qua xem bản demo thật (`DashboardCornerBlock.tsx`) — thay AC8 cũ ("2 hàng không dung hoà style") bằng style hợp nhất dùng chung 1 overlay gradient đen cố định cho cả nav + ambient, xem mục 4.1 (đoạn "Style hợp nhất nav + ambient", change impact mục #14, AC8 mới). Không có câu hỏi mở nào phát sinh — quyết định đóng ngay trong phiên.
6. **Layout Dashboard độc lập theo từng Space (`ba`, 2026-07-08 — MỚI, CHƯA chốt):** chủ dự án yêu cầu đảo ngược quyết định "layout dùng chung mọi Space" (mục 4/6) — mỗi Space (đặc biệt 3 Space thật đang dùng: "Chi tiêu gia đình Kino", "MAFC", "Cá nhân") cần layout riêng, vì hiện đổi layout ở Space này đang phá layout Space khác. `ba` đã phân tích đầy đủ tại `docs/features/layout-theo-space.md`: khuyến nghị lưu theo cặp (user, Space) — `Settings.dashboardLayouts: Record<spaceId, DashboardLayout>` thay cho 1 object đơn hiện tại, migrate bằng cơ chế đọc-fallback (không cần ghi cứng 1 lần), không đụng schema/RLS Shared Space. **Câu hỏi mở quan trọng nhất cần chủ dự án xác nhận trước khi giao `uiux`/`dev`:** layout của Shared Space có nên riêng theo từng thành viên (đề xuất của `ba`) hay dùng chung cho cả nhóm giống `enabledBlocks`? Xem đầy đủ 5 câu hỏi mở tại file trên, mục 8.
