# Requirements — KN-Space

> **Trạng thái nền tảng (cập nhật):** KN-Space đã chuyển từ Chrome Extension (Phase 1, `chrome.storage`) sang **Web App cá nhân** (Phase 2, Bước 1+2). Bản extension đã được **xoá khỏi repo**, không còn duy trì. Mục 1–3 và 10–12 dưới đây mô tả đúng nền tảng hiện hành (Web App + Supabase). Mục 4–9 mô tả UX/feature chi tiết của 5 khối + Settings + đa Space — vẫn đúng bản chất sản phẩm.

## 1. Mục tiêu
Xây dựng **KN-Space** thành một **Web App cá nhân** dạng dashboard năng suất, chạy được trên cả desktop và di động qua một URL duy nhất, dữ liệu lưu trên cloud (Supabase) và đồng bộ tự động giữa các máy/thiết bị đã đăng nhập.

Sản phẩm gồm 2 màn: **Home** (Tabliss-style, đồng hồ + lời chào + quote trên ảnh nền full-screen) là màn mở đầu, và **Dashboard** năng suất cá nhân gồm 6 khối chính thức:
- Việc cần làm
- Nhắc việc
- Thói quen
- Ghi chú
- Hôm nay (đồng hồ + ngày + quote, thuần hiển thị — xem mục 5.6)
- Thông báo

Giai đoạn hiện tại tập trung vào bản dùng được cho cá nhân (quy mô 1–2 người): **có cloud sync, có auth (Google), chạy được desktop + di động qua web/PWA, KHÔNG cộng tác nhiều người, KHÔNG SaaS công khai/billing**.

## 2. Đối tượng dùng
Cá nhân muốn có một dashboard gọn để quản lý việc, nhắc việc, thói quen và ghi chú, dùng được cả trên máy tính và điện thoại, dữ liệu tự đồng bộ qua tài khoản Google cá nhân — không phụ thuộc một trình duyệt/máy cụ thể như bản extension trước.

Người dùng chấp nhận:
- Đăng nhập bằng Google để dùng app (không có chế độ ẩn danh/không-tài khoản).
- Cảnh báo "ứng dụng chưa xác minh" (unverified app) của Google khi đăng nhập lần đầu, do app chưa qua quy trình Google verification. **Quyết định đã chốt:** không nộp Google verification — chấp nhận giữ cảnh báo này xuyên suốt giai đoạn cá nhân (1-2 người dùng), không đáng mất công verify ở quy mô này.
- Trên di động, Dashboard chỉ hiện 2 khối (Việc cần làm, Ghi chú) để giảm rối màn hẹp — xem mục 2.1. **Quyết định đã chốt:** đây là phạm vi dài hạn, không phải tạm thời — không có kế hoạch mở rộng thêm khối khác cho mobile.
- Vẫn có thể dùng Export/Import JSON làm backup thủ công.

### 2.1 Nền tảng & môi trường chạy
- **Web App**: React + TypeScript + Vite + Tailwind CSS.
- **Hosting**: Vercel, domain riêng `kn-space.io.vn`.
- **Lưu trữ**: Supabase (Postgres), không còn `chrome.storage`.
- **Đăng nhập**: Google OAuth qua Supabase Auth (không phải magic-link email).
- **Đồng bộ đa máy**: KHÔNG dùng Supabase Realtime (đã chủ động bỏ ở commit `aa00fae`, 2026-07-01 — gây 5 bug mất dữ liệu, không ổn định, không cần thiết cho tool cá nhân). Cơ chế thật: mỗi lần mở app/tải lại trang, `loadAppState()` đọc bản mới nhất từ Supabase; sửa dữ liệu chỉ lưu lên Supabase (debounce 600ms), không tự đẩy sang máy khác đang mở sẵn — máy B chỉ thấy thay đổi của máy A sau khi tự mở lại/reload.
- **PWA**: có manifest + icon để "Add to Home Screen" trên iOS/Android, mở full-screen như app gốc. **Chưa có service worker/offline-first** — đây là việc cố ý chưa làm ở bước hiện tại, không phải bug.
- **Responsive desktop/mobile** — *Cập nhật 2026-07-07: mô tả mobile trong mục này đã đối chiếu lại đúng code thật sau đợt UI audit, thay thế mô tả cũ dựa trên breakpoint 639px:*
  - **Ngưỡng chuyển đổi mô hình UI** (toàn bộ Dashboard đổi từ layout cột tự do desktop sang UI mobile "Chat-first") là **~1000px chiều rộng cửa sổ**, không phải `≤639px`: vào mobile khi width `≤999px`, chỉ thoát mobile khi width `≥1010px` (hysteresis 2 mốc khác nhau có chủ đích, chống UI nhảy qua-lại khi resize dao động sát biên giữa 2 mô hình hoàn toàn khác nhau) — xem `src/layout/useMobileLayout.ts`. Đây là ngưỡng chính áp dụng cho mọi mô tả "Responsive desktop/mobile" trong tài liệu này, trừ khi nói rõ là breakpoint Tailwind khác (xem gạch đầu dòng cuối).
  - **Mobile không còn màn Home**: khác desktop (vẫn giữ luồng Home → Dashboard, mục 4.5), trên mobile app vào thẳng UI chính ngay sau đăng nhập — không có bước xem đồng hồ/quote/ảnh nền Home trước, và các phím tắt Enter/Space (vào Dashboard) / Esc (về Home) bị vô hiệu hoàn toàn khi đang ở chế độ mobile (xem `src/App.tsx`). Ảnh nền chung Home/Dashboard (mục 4.6) vẫn hiển thị làm nền cho UI mobile.
  - **UI chính trên mobile gồm 2 tab, đổi qua `MobileTabBar` dính đáy màn hình**:
    - **"Trò chuyện" (mặc định)**: màn chat-style hoàn toàn mới (`MobileChatScreen`) — gộp Việc cần làm + Ghi chú thành các "bong bóng" theo dòng thời gian tạo (mới nhất ở dưới cùng), có avatar/tên/màu riêng theo người tạo khi ở Shared Space (phân biệt bong bóng của mình/người khác). 1 ô nhập liệu ở đáy: gõ text + Enter tạo Việc cần làm mới; gõ với tiền tố `/note ` tạo Ghi chú nhanh. Không có filter/sort/kéo-thả trong màn này.
    - **"Chi tiết"**: giữ đúng hành vi accordion đã mô tả trước đây — chỉ 2 khối Việc cần làm + Ghi chú, khối đang mở chiếm phần lớn chiều cao, khối kia thu nhỏ thành thanh tóm tắt (icon + tên + số lượng, bấm để đổi chỗ). **Sửa lại cho khớp code:** thanh tóm tắt **không có dòng preview nội dung** (đã bỏ theo phản hồi thực tế khi test — chiếm quá nhiều diện tích so với giá trị mang lại, xem comment `MobileCollapsedSummary` trong `AppLayout.tsx`), khác mô tả cũ từng ghi "+ 1 dòng preview". Mặc định mở "Việc cần làm" khi vào tab này.
    - Nhắc việc/Thói quen/Thông báo/Hôm nay vẫn bị ẩn hoàn toàn trên cả 2 tab mobile — quyết định có chủ đích và **dài hạn**, không phải bug, không có kế hoạch mở rộng thêm khối khác cho mobile.
  - Trên di động không có nút "Về Home" ở cả 2 tab — chỉ còn thanh trên cùng cố định (Space-switcher + nút Settings, dạng compact) và `MobileTabBar` dưới cùng.
  - Đa Space và toàn bộ Settings (theme, accent, ảnh nền, quote, export/import) vẫn hoạt động đầy đủ trên di động.
  - Lớp lọc "chỉ 2 khối trên di động" **tách biệt hoàn toàn** với `space.enabledBlocks` (cấu hình ẩn/hiện khối theo từng Space, áp dụng đồng thời và đồng nhất trên cả desktop/di động).
  - Lưu ý phân biệt 2 khái niệm breakpoint khác nhau, tránh nhầm lẫn tiếp: breakpoint Tailwind `≤639px` (`max-sm`) **vẫn tồn tại và có ý nghĩa riêng** ở vài chỗ nhỏ hơn bên trong UI (ví dụ ẩn chip tên người tạo trên `TaskRow` khi màn quá hẹp) — đây là 1 tinh chỉnh responsive cục bộ, **khác hẳn** ngưỡng ~1000px nói trên (ngưỡng chuyển đổi toàn bộ mô hình UI mobile/desktop).

## 3. Phạm vi
Trong phạm vi:
- Web App chạy qua URL riêng (`kn-space.io.vn`), không phải extension.
- Đăng nhập bắt buộc bằng Google OAuth trước khi vào Dashboard.
- Lưu dữ liệu trên Supabase (Postgres), đồng bộ giữa các máy/thiết bị của cùng người dùng qua tải lại (load-on-open) — KHÔNG có push realtime tức thì (xem mục 2.1).
- PWA cơ bản: có thể "Add to Home Screen" trên di động, mở full-screen.
- Màn **Home** (Tabliss-style): đồng hồ real-time, ngày, lời chào theo buổi, 1 quote (xem mục 4.5/7), ảnh nền full-screen, nút "Vào Dashboard" dạng icon tối giản, dòng đếm việc hôm nay.
- Ảnh nền dùng **link ảnh tĩnh cố định** (hotlink `images.unsplash.com`) hoặc **ảnh upload từ máy** (xem mục 4.6/7), không gọi API random/search ảnh.
- Full dashboard 6 khối (Việc cần làm, Nhắc việc, Thói quen, Ghi chú, Hôm nay, Thông báo) — xem mục 4–9 cho chi tiết UX.
- Nhiều Space, dữ liệu thuộc về tài khoản người dùng đã đăng nhập (không còn "cục bộ trong 1 trình duyệt" như bản extension).
- Settings: theme, màu chủ đạo, ảnh nền Home (lưới preview + sửa link/upload + tự động đổi ảnh theo thời gian), quote Home (10 slot cố định + tần suất đổi), layout size, thứ tự khối, export/import.
- Ẩn/hiện nội dung từng khối (xem mục 8).
- Icon SVG nhất quán, modal tuỳ biến, accessibility cơ bản.
- Đáp ứng responsive desktop/di động như mục 2.1.
- Migrate dữ liệu từ bản extension cũ qua chính cơ chế Export/Import JSON đã có (không xây thêm).

Ngoài phạm vi hiện tại:
- Service worker / offline-first thật cho PWA (đã có manifest, chưa có phần này). Bao gồm cả hàng đợi retry tự động khi mất mạng giữa lúc sửa dữ liệu — **quyết định đã chốt:** không cần, giữ nguyên hành vi hiện tại (chỉ hiện banner cảnh báo lưu lỗi, người dùng tự sửa lại khi có mạng trở lại), đủ cho quy mô cá nhân hiện tại (xem mục 10/12).
- Mobile redesign đầy đủ cho 4 khối còn lại (Nhắc việc/Thói quen/Thông báo/Hôm nay) — hiện đang ẩn trên di động. **Quyết định đã chốt:** đây là phạm vi dài hạn, không có kế hoạch mở rộng thêm khối nào khác cho mobile (xem mục 2/2.1).
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
> **Phạm vi mục 4/4.1:** toàn bộ mô tả layout tự do dưới đây (cột, slot, kéo-thả, splitter) chỉ áp dụng cho **desktop** (ngoài vùng mobile, xem mục 2.1/10). Trên mobile, hệ layout tự do này **không được render** — thay bằng 1 UI cố định hoàn toàn khác (chat-first + accordion 2 khối, xem mục 2.1), không có khái niệm cột/slot/splitter. *Cập nhật 2026-07-07: ghi chú phạm vi này được thêm sau đợt UI audit rà lại đúng code thật, không đổi mô tả desktop bên dưới.*

Dashboard **không còn topbar/header ngang** (đã bỏ logo, dropdown space kiểu cũ, quote, cụm nút Home/Ẩn-tất-cả/Settings ở trên cùng). Toàn bộ điều hướng + 6 khối dữ liệu được xếp trong một **hệ layout tự do (free-form)**: nhiều cột chiếm toàn màn hình trên desktop, mỗi cột là một danh sách các "slot" xếp dọc; người dùng tự kéo-thả để chèn khối trên/dưới hoặc ghép 2 khối nằm ngang trong cùng 1 slot, và tự kéo resize qua các đường splitter ẩn — không còn khái niệm "3 khối cố định" hay slider % trong Settings.

**7 phần tử tham gia layout** (đều bình đẳng, không phần tử nào bị khoá vị trí):
- 6 khối dữ liệu: Việc cần làm (`tasks`), Nhắc việc (`reminder`), Thói quen (`habits`), Ghi chú (`notes`), **Hôm nay** (`today`, xem mục 5.6), Thông báo (`reminders`).
- **Widget điều hướng** (`settings`, xem mục 4.1): không phải khối dữ liệu, nhưng tham gia layout tự do y như các khối khác (có thể kéo-thả đổi chỗ), chỉ khác ở chỗ **chiều cao luôn khoá theo nội dung thật** (không co giãn theo trọng số `h`, không resize được theo trục dọc).

### Cấu trúc 1 "slot"
Mỗi cột là danh sách slot xếp dọc, mỗi slot thuộc 1 trong 2 dạng:
- **`single`**: chứa đúng 1 khối, chiếm trọn chiều rộng cột.
- **`row`**: chứa đúng 2 khối ghép nằm ngang cạnh nhau trong cùng 1 slot (kết quả của thao tác "ghép ngang" khi kéo-thả).

### Bố cục mặc định (desktop)
3 cột, tỉ lệ chiều rộng khởi tạo 32% / 36% / 32%:
- Cột 1: Hôm nay (trên) + Ghi chú (dưới, chiếm phần lớn chiều cao).
- Cột 2: Việc cần làm (trên cùng, cao nhất) + Nhắc việc + Thói quen (xếp dưới).
- Cột 3: Widget điều hướng (trên, cao cố định theo nội dung) + Thông báo (dưới, chiếm phần lớn chiều cao).

Đây chỉ là **vị trí khởi tạo** — không phải bố cục cố định. Người dùng có thể kéo bất kỳ khối nào (kể cả Thông báo và Widget điều hướng) sang vị trí/cột khác, ghép ngang với khối khác, hoặc đổi cả số lượng slot trong mỗi cột.

### Kéo-thả (chèn trên/dưới, ghép ngang, đổi cột)
- Với 5 khối dữ liệu có header (Việc cần làm/Nhắc việc/Thói quen/Ghi chú/Thông báo): chỉ bấm-giữ đúng vào phần **header khối** (`.block-head`) mới bắt đầu kéo được — tránh xung đột với kéo-thả sắp xếp item con bên trong khối (task/note). Với Hôm nay (`today`, không có header riêng — xem mục 5.6) và Widget điều hướng (không có header riêng dạng `.block-head`): bấm-giữ ở bất kỳ đâu trong khối đều kéo được.
- Vị trí con trỏ khi thả xác định "zone" thả, tính theo % chiều rộng/cao của khối đích:
  - Thả vào 25% mép trái hoặc 25% mép phải của khối đích (chỉ áp dụng khi khối đích đang là slot `single`, chưa ghép ngang) → **ghép ngang**: tạo 1 slot `row` mới gồm khối đang kéo + khối đích, chia trọng số chiều rộng 50/50.
  - Thả vào nửa trên (top) hoặc nửa dưới (bottom) của khối đích → **chèn dọc**: tách khối đang kéo thành 1 slot `single` mới, chèn ngay trên/dưới khối đích trong cùng cột.
  - Thả vào vùng trống của 1 cột (không đè lên khối nào) → khối đang kéo được thêm vào **cuối cột** đó.
- Khối đang kéo được gỡ khỏi vị trí cũ trước; nếu vị trí cũ là 1 slot `row` chỉ còn 1 khối sau khi gỡ, slot đó tự rút gọn về `single`.
- Không giới hạn khối nào được/không được kéo — khác bố cục cũ (nơi khối Thông báo bị khoá cứng vị trí cuối); hiện tại **cả 7 phần tử đều kéo-thả tự do như nhau**, kể cả Thông báo và Widget điều hướng.

### Resize qua splitter ẩn
- Không còn slider/input % trong Settings để chỉnh tỉ lệ — toàn bộ resize thực hiện bằng cách **kéo trực tiếp trên Dashboard**, qua các đường splitter trong suốt (không nhìn thấy, chỉ hiện gợi ý khi hover/kéo) chèn đúng vào khoảng gap 12px sẵn có giữa các khối/cột.
- 3 loại splitter:
  - **Splitter chiều cao** giữa 2 slot xếp dọc liền kề trong cùng 1 cột — kéo đổi trọng số `h` (flex-grow) của 2 slot đó.
  - **Splitter chiều rộng giữa 2 cột** liền kề — kéo đổi % chiều rộng (`colWidths`) của 2 cột đó. Splitter này **ẩn hoàn toàn** khi màn hình hẹp dưới breakpoint `lg` (979px, các cột dồn xuống xếp chồng dọc, đổi chiều rộng cột không còn ý nghĩa). *Xác nhận (`ba`, 2026-07-07):* điều kiện `lg`/979px này thực chất là **dead code** — từ khi ngưỡng chuyển mobile/desktop nâng lên ~1000px (mục 2.1, hysteresis 999/1010px), mọi viewport `≤979px` đã sớm chuyển hẳn sang UI mobile riêng (`isMobileBlocksOnly` true) từ trước khi chạm ngưỡng `lg`, nên nhánh desktop có splitter/`#cols-wrap` không bao giờ còn render được ở độ rộng đó nữa. Không tự xoá code trong đợt rà soát tài liệu này — để dev cân nhắc dọn khi có dịp sửa `AppLayout.tsx` (xem thêm câu hỏi mở cuối tài liệu).
  - **Splitter chiều rộng giữa 2 khối ghép ngang** trong cùng 1 slot `row` — kéo đổi trọng số `w` của 2 khối đó.
- Widget điều hướng (`settings`) có chiều cao khoá cứng theo nội dung thật (không theo trọng số `h`) — splitter chiều cao cạnh nó chỉ tác động lên slot còn lại (không đổi được chiều cao widget điều hướng qua kéo splitter). Khối Hôm nay (`today`) **không** bị khoá chiều cao — resize được như mọi khối dữ liệu khác (xem mục 5.6).
- Resize áp dụng ngay khi kéo (mượt theo chuyển động chuột), chỉ ghi xuống storage 1 lần khi thả chuột (không ghi dồn dập theo từng pixel di chuyển).
- Vẫn có nút **Khôi phục bố cục mặc định** trong Settings (tab "Chung") để trả layout về đúng bố cục mặc định mô tả ở trên.
- Lưu toàn bộ cấu trúc layout (số cột, slot, trọng số `h`/`w`, `colWidths`) vào storage (`settings.dashboardLayout`), **dùng chung cho mọi Space** (không lưu riêng theo từng Space).

### Ẩn khối theo Space không phá vỡ layout đã lưu
- Khi 1 khối bị tắt theo `enabledBlocks` của Space hiện tại (mục 6), khối đó chỉ **không render**, vị trí của nó trong cấu trúc layout đã lưu vẫn giữ nguyên — bật lại đúng chỗ cũ khi đổi Space khác hoặc bật lại `enabledBlocks`.
- Nếu khối bị ẩn nằm trong 1 slot `row` ghép ngang với khối khác, layout hiển thị (không phải layout lưu) tự hạ slot đó về `single` chỉ chứa khối còn hiển thị, để không giữ khoảng trống theo trọng số `w` của khối đã ẩn. Nếu cả cột không còn slot nào hiển thị, cột đó bị ẩn hẳn khỏi màn hình (nhưng vẫn còn trong dữ liệu lưu).

### 4.1 Widget điều hướng
Vì Dashboard không còn topbar, các điều hướng trước đây nằm trên topbar (Home, đổi Space, Settings) được dồn vào 1 widget, tham gia layout tự do như 1 khối bình thường (kéo-thả đổi vị trí được, xem mục 4), chỉ khác ở chỗ chiều cao luôn khoá theo nội dung thật (chỉ 1 dòng icon, không co giãn thêm).

Widget gồm 3 phần theo thứ tự ngang:
- Nút **Về Home** (icon-only).
- **Space-switcher** dạng dropdown, chiếm phần rộng còn lại, căn giữa nội dung trong nút, gồm:
  - Dot màu riêng từng Space (xoay vòng theo bảng màu cố định theo index, không đổi khi sắp xếp lại thứ tự Space).
  - Tên Space hiện tại.
  - Khi mở dropdown: mỗi Space hiển thị dòng phụ nhỏ mờ dạng preview `"X việc hôm nay · Y note"` (X = số task có ngày hôm nay và chưa xong, Y = tổng số note của Space đó).
  - Gợi ý phím tắt `Alt+số` (Windows/Linux) hoặc `Cmd+số` (Mac) hiển thị cạnh tên cho **9 Space đầu tiên** theo thứ tự trong danh sách (Space thứ 10+ không có gợi ý phím tắt).
  - Vẫn giữ các thao tác tạo/đổi tên/xoá/đổi thứ tự Space như mục 6.
- Nút **Settings** (icon-only).

Widget điều hướng **luôn hiện, không phụ thuộc `enabledBlocks` của Space nào** (không nằm trong danh sách các khối có thể tắt ở mục 6/8) — đảm bảo Dashboard luôn có cách đổi Space/mở Settings/về Home, bất kể Space hiện tại tắt bao nhiêu khối dữ liệu. Khối Thông báo cũng luôn hiện với mọi Space, không thể tắt (xem mục 5.5/6/8) — nhưng đây là 2 ràng buộc **độc lập** với nhau (khác bố cục cũ, nơi 2 thứ này bị buộc chung 1 cột); trong bố cục tự do hiện tại, Thông báo và Widget điều hướng có thể nằm ở 2 vị trí bất kỳ, không nhất thiết cùng cột/cạnh nhau.

**Câu hỏi mở cần xác nhận:**
1. ~~Mục 5.5, mục 6, mục 8 và mục 12 hiện vẫn còn câu chữ tham chiếu bố cục cũ...~~ **Đã chốt (`ba`, 2026-07-07):** rà lại toàn bộ — mục 6/8 vốn đã mô tả đúng layout tự do (không cần sửa); mục 5.5 (câu "cố định vị trí cuối cùng") và mục 12 (dòng verification mobile) đã cập nhật lại đúng code thật ngay tại chỗ.
2. Có cần giới hạn số cột tối đa hay số khối ghép ngang tối đa trong 1 slot (hiện tại tối đa 2 khối/slot `row`, không hỗ trợ ghép 3 khối trở lên) không, hay giữ nguyên như code thật?
3. *Phát sinh 2026-07-07 (đợt rà soát mobile):* mô tả splitter chiều rộng giữa cột "ẩn khi màn hình hẹp dưới breakpoint `lg` (979px), các cột dồn xuống xếp chồng dọc" (đoạn "Resize qua splitter ẩn" phía trên) dường như là hành vi **không còn khả năng xảy ra trên thực tế**: ngưỡng chuyển sang UI mobile (`≤999px`, xem mục 2.1) luôn kích hoạt TRƯỚC khi cửa sổ desktop co xuống dưới 979px (mobile "nuốt" mất vùng 639-999px từng là desktop-hẹp trước khi ngưỡng mobile được nâng lên ~1000px). Cần xác nhận: đây có phải hành vi tồn dư (vestigial) từ thời breakpoint mobile còn là `≤639px`, chưa dọn sau khi nâng ngưỡng, hay có kịch bản thực tế nào khác (vd. do hysteresis, cửa sổ có thể ở trạng thái desktop trong khoảng 979-999px) khiến nhánh dồn-cột này vẫn xuất hiện được?

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

### 5.6 Hôm nay
Khối hiển thị thuần (**read-only**) tổng hợp đồng hồ + ngày + 1 câu quote, không phải khối CRUD dữ liệu — khác hẳn 5 khối còn lại (5.1–5.5).

Yêu cầu:
- Hiển thị đồng hồ giờ:phút (không có giây — khác đồng hồ ở màn Home, mục 4.5, có giây).
- Hiển thị ngày dạng ngắn.
- Hiển thị 1 câu quote, lấy từ cùng nguồn 10 slot quote với màn Home (`settings.homeQuotes`, xem mục 4.5/7) — tại cùng một thời điểm, Hôm nay và Home luôn hiển thị cùng 1 câu quote đang active (cùng `index`).
- **Không có header riêng** (không có `.block-head`) — do đó không có nút phụ (filter/+Thêm), và **không áp dụng cơ chế icon mắt ẩn/hiện nội dung** ở mục 8 (không có nơi đặt icon).
- Thuần hiển thị: không CRUD, không có thao tác sửa/xoá/thêm nào trong khối này.
- Tham gia kéo-thả tự do trong layout như mọi khối khác (mục 4); vì không có `.block-head`, bấm-giữ ở **bất kỳ đâu** trong khối để bắt đầu kéo (giống Widget điều hướng, khác 5 khối có header).
- Chiều cao **co giãn theo trọng số `h`** như khối dữ liệu thường, resize được qua splitter — **không** bị khoá cứng (khác Widget điều hướng, mục 4.1, có chiều cao khoá cứng).
- Có field riêng trong `enabledBlocks` của Space (`enabledBlocks.today`) — modal "Sửa Space" có checkbox riêng để bật/tắt khối này theo từng Space, cùng nhóm hành vi với Việc cần làm/Nhắc việc/Thói quen/Ghi chú (mục 6), **khác** Thông báo và Widget điều hướng (2 phần tử luôn hiện, không thể tắt theo Space). Khối này không có dữ liệu riêng theo Space — bật/tắt chỉ ảnh hưởng có hiển thị hay không.
- Không hiện trên di động (mục 2.1/10 — trên mobile chỉ render 2 khối Việc cần làm + Ghi chú).
- Style: nền trong suốt hơn các khối khác (nền alpha thấp ~40% + blur nhẹ + overlay gradient tối cố định, chữ trắng cố định không đổi theo theme sáng/tối) để luôn đọc rõ dù đè lên ảnh nền sáng hay tối — mục đích để lộ ảnh nền chung Home/Dashboard qua khối này.

**Đã chốt (2026-07-03):** ban đầu có nghi vấn mô tả khối này lệch với code thật (comment cũ trong `TodayBlock.tsx` từng nói "chiều cao khoá cố định, luôn hiện không thuộc `enabledBlocks`") — chủ dự án đã xác nhận **giữ đúng hành vi code hiện tại** (resize được + có thể tắt theo Space qua `enabledBlocks.today`), mục 5.6 phía trên là nguồn sự thật chính thức. Comment lệch trong `TodayBlock.tsx` đã được sửa lại cho khớp. Nhãn checkbox "Today" trong modal "Sửa Space" đã đổi thành "Hôm nay".

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
- Cấu hình bật/tắt khối (`enabledBlocks`) cho **5 khối** (modal "Sửa Space" liệt kê 5 khối này để chọn bật/tắt):
  - Việc cần làm.
  - Nhắc việc.
  - Thói quen.
  - Ghi chú.
  - Hôm nay (chỉ bật/tắt hiển thị, không có dữ liệu riêng theo Space — xem mục 5.6; xem thêm câu hỏi mở trong mục 5.6 về việc khối này có nên thuộc `enabledBlocks` hay không).
- Khối Thông báo và Widget điều hướng **không nằm trong `enabledBlocks` có thể tắt** — luôn hiện với mọi Space (xem mục 4.1/5.5/8), không xuất hiện trong checkbox chọn khối ở modal "Sửa Space".
- Khối nào trong 5 khối trên bị tắt thì ẩn hẳn khỏi dashboard của Space đó.
- Các khối còn lại tự giãn lấp khoảng trống.

Khi chuyển Space:
- Filter Việc cần làm reset về **Tất cả**.
- Tìm kiếm note reset rỗng.
- Sắp xếp note reset về **Thứ tự thủ công**.
- Trạng thái ẩn nội dung note reset.

Settings dùng chung mọi Space:
- Theme.
- Màu chủ đạo.
- Ảnh nền (Home + Dashboard).
- Quote Home (10 slot + tần suất đổi).
- Tỉ lệ layout.
- Thứ tự khối chính.

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
Đây là cơ chế **ẩn/hiện nội dung từng khối qua icon mắt ở header** (`.block-head`), áp dụng cho **5 khối có header**: Việc cần làm, Nhắc việc, Thói quen, Ghi chú, Thông báo. Khối **Hôm nay** không có header riêng nên không có icon mắt, không thuộc cơ chế này (xem mục 5.6). Đây là cơ chế **khác** với cơ chế **tắt hẳn khối khỏi Space** (`enabledBlocks`, mục 6) — 2 danh sách khối áp dụng không trùng nhau hoàn toàn, xem chi tiết bên dưới.

Yêu cầu:
- Mỗi khối có icon mắt ở header.
- Bấm icon để ẩn/hiện nội dung khối.
- Khi ẩn, khối **giữ nguyên kích thước**, chỉ thay body bằng placeholder căn giữa.
- Placeholder gồm icon mắt-gạch + text "Đã ẩn nội dung [tên khối]".
- Các nút phụ trong header như filter/+Thêm ẩn theo.
- Tắt hẳn khối khỏi Dashboard theo từng Space (`enabledBlocks`, xem mục 6) áp dụng cho **5 khối**: Việc cần làm, Nhắc việc, Thói quen, Ghi chú, Hôm nay. Khối Thông báo và Widget điều hướng **không** có cấu hình tắt hẳn theo Space — luôn hiện với mọi Space (xem mục 4.1/5.5/6).
- Lưu ý 2 cơ chế **độc lập nhau**, không phải khối nào cũng tham gia cả hai: khối **Hôm nay** có thể tắt hẳn theo Space nhưng **không** có icon mắt ẩn nội dung (không có header); khối **Thông báo** có icon mắt ẩn nội dung nhưng **không** thể tắt hẳn theo Space (xem mục 5.5/5.6 — mục 5.6 cũng ghi câu hỏi mở về việc đây có phải hành vi đúng ý định thiết kế hay không).
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
- Card/khối có shadow nhẹ, viền mỏng.
- Checkbox tuỳ biến, không dùng checkbox mặc định của OS.
- Modal nền đặc, dễ đọc (modal **không** áp dụng kính mờ).
- Xác nhận xoá dùng modal tuỳ biến, không dùng `window.confirm()`.
- Click ra ngoài modal để đóng, tương đương Hủy.
- Hiệu ứng nhẹ:
  - Resize layout transition khoảng 0.15s.
  - Drag item/block có opacity khi kéo (áp dụng cả 3 khối được phép kéo-thả thứ tự, note card, và task row).
  - Drop target có outline/nhấn nhẹ.
  - Đổi ảnh nền/quote dùng crossfade mượt (không đổi tức thì).
- Không dùng phong cách Duolingo.
- **Dashboard dùng kính mờ nhẹ** (đảo ngược quyết định cũ "không glassmorphism"): từ khi Dashboard nổi trên ảnh nền chung, các khối chính/sub-block/widget điều hướng cố định dùng nền bán-trong-suốt + `backdrop-filter: blur()`, alpha cao ~88-90% (đủ đọc rõ chữ, khác biệt với kính mờ trong suốt mạnh kiểu Duolingo). Ảnh nền lộ ra ở viền ngoài dashboard và khe (gap) giữa các khối. Quyết định này đã thử nghiệm qua nhiều vòng so sánh (gồm cả biến thể "nền đặc không kính mờ" và "kính mờ trong suốt cao"), chốt phương án kính mờ nhẹ vì giữ được độ rõ chữ tốt nhất trong khi vẫn tạo cảm giác khối "nổi trên" ảnh.

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
- 1 bảng `kn_space_state`, **1 hàng/user** (PK = `user_id`), gồm cột `spaces` (jsonb), `current_space_id` (text), `settings` (jsonb), `updated_at`.
- **Không tách bảng riêng theo task/note/habit/reminder/space** — gộp toàn bộ vào 2 cột jsonb để đơn giản hoá ở quy mô 1-2 người dùng; lý do tách-key 8KB/item của `chrome.storage.sync` (bản extension cũ) không còn áp dụng với Postgres jsonb.
- RLS bảng `kn_space_state` (Space cá nhân): 4 policy `select/insert/update/delete` đều ràng buộc `auth.uid() = user_id` — mỗi user chỉ đọc/ghi đúng hàng của chính mình. Shared Space (Phase 3, đang code tích cực — xem `docs/features/shared-space.md`) dùng RLS membership-based riêng qua bảng `space_members`, không phải khái niệm này.
- **Không dùng Supabase Realtime** — đã chủ động bỏ (commit `aa00fae`, 2026-07-01) vì gây bug mất dữ liệu, không cần thiết cho quy mô cá nhân/nhóm nhỏ. Đồng bộ đa máy chỉ qua load-on-open: mở app/reload trang mới đọc bản mới nhất từ Supabase, không có push tức thì khi máy khác đang mở sẵn cùng lúc.
- Ghi dữ liệu có **debounce 600ms** sau mỗi mutation (note/task/habit/reminder/space/theme/layout/thứ tự khối) — giữ nguyên cơ chế từ bản extension cũ để tránh ghi network dồn dập theo từng keystroke/tick checkbox.
- Seed dữ liệu demo (Cá nhân/Công ty) chỉ khi user mới đăng nhập lần đầu, chưa có hàng nào trong `kn_space_state`.
- Mỗi task có field `order` (số nguyên, dùng cho kéo-thả sắp xếp thủ công) và field `content` (string tuỳ chọn, nội dung chi tiết).
- Lưu thêm `lastScreen` (Home/Dashboard), cấu hình ảnh nền (6 slot — mỗi slot kèm `type`: `url`/`upload` — + chỉ số đang chọn + khoảng tự động đổi ảnh), và cấu hình quote (10 slot nội dung + chỉ số đang chọn + tần suất đổi `quoteRotateMode`: `daily`/`onopen`/`every15m`/`every1h`) trong cột `settings`.
- Ảnh upload (base64) lưu trong cùng cột `settings` (jsonb) — **đồng bộ giữa các máy** vì cùng nằm trên Supabase (khác hẳn bản extension cũ, nơi ảnh upload chỉ tồn tại cục bộ trên máy đã upload do giới hạn `chrome.storage.local`).
- **Mất mạng giữa lúc sửa dữ liệu — quyết định đã chốt:** không cần hàng đợi/retry tự động. Giữ nguyên hành vi hiện tại: `flushSave` lỗi → chỉ hiện banner cảnh báo lưu lỗi, người dùng tự sửa lại (thường chỉ 1 lần) khi có mạng trở lại. Đủ cho quy mô cá nhân hiện tại (1-2 người dùng); không xây thêm cơ chế lưu tạm/queue (xem mục 12).

PWA:
- `public/manifest.webmanifest`: tên, icon 192/512, `display: standalone`, `theme_color`/`background_color` — đủ để "Add to Home Screen" trên iOS/Android, mở full-screen như app gốc.
- **Chưa có service worker / offline-first** — cố ý chưa làm, không phải bug; có thể bổ sung sau nếu phát sinh nhu cầu dùng khi mất mạng.

Responsive desktop/di động:
- **Cập nhật 2026-07-07:** mô tả breakpoint/mobile dưới đây đã đối chiếu lại đúng code thật sau đợt UI audit, thay thế mô tả cũ dựa trên breakpoint `≤639px` (xem thêm mục 2.1 cho phần mô tả đầy đủ hơn).
- **Ngưỡng chuyển đổi mô hình UI mobile/desktop**: `useMobileLayout()` (`src/layout/useMobileLayout.ts`) — vào mobile khi width `≤999px` (`MOBILE_ENTER_MAX`), chỉ thoát mobile khi width `≥1010px` (`MOBILE_EXIT_MIN`) — hysteresis 2 mốc để chống UI nhảy qua-lại khi resize dao động sát biên giữa 2 mô hình UI khác hẳn nhau (cột tự do desktop / chat-first mobile). Đây là breakpoint chính, khác breakpoint Tailwind `≤639px` (`max-sm`) vẫn còn dùng riêng cho vài tinh chỉnh responsive nhỏ hơn bên trong UI (ví dụ ẩn chip tên người tạo trên `TaskRow`) — 2 khái niệm độc lập, không nhầm lẫn.
- Trên mobile: bỏ hẳn màn Home (`src/App.tsx`), vào thẳng UI chính. UI chính gồm 2 tab đổi qua `MobileTabBar` dính đáy: **"Trò chuyện"** (mặc định — màn chat-style mới `MobileChatScreen`, gộp Việc cần làm + Ghi chú thành bong bóng theo dòng thời gian, nhập nhanh qua 1 ô input + Enter, tiền tố `/note ` để tạo Ghi chú) và **"Chi tiết"** (accordion 2 khối Việc cần làm + Ghi chú như bản mô tả trước — không có dòng preview nội dung ở thanh tóm tắt, đã bỏ theo test thực tế). Mặc định mở "Việc cần làm" trong tab "Chi tiết". Không có nút "Về Home" ở cả 2 tab (chỉ còn thanh Space-switcher + Settings dạng compact trên cùng). **Quyết định đã chốt:** phạm vi 2 khối + ẩn Nhắc việc/Thói quen/Thông báo/Hôm nay trên mobile là dài hạn, không có kế hoạch mở rộng thêm khối khác.
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
      supabaseStore.ts
      normalize.ts
      types.ts
    state/
      AppStateContext.tsx
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
      notifications/
      today/
      spaces/
      settings/
  supabase/
    schema.sql
```

Vai trò:
- `index.html` + `src/main.tsx` + `src/App.tsx`: bootstrap web app, gồm cả màn Home.
- `src/auth/`: Google OAuth qua Supabase, context phiên đăng nhập (`AuthContext`), màn đăng nhập (`LoginScreen`).
- `src/storage/supabaseStore.ts`: load/seed/save (debounce 600ms), thay hoàn toàn `chromeStorage.ts` cũ. Không có Realtime subscribe (đã bỏ chủ động, xem mục 10).
- `src/layout/`: hệ layout Dashboard tự do (kéo-thả + resize qua splitter), bao gồm logic responsive mobile (ẩn khối, accordion).
- `src/features/`: UI/logic theo từng khối chức năng (bao gồm Home).
- `lucide-react`: icon UI line-icon nhất quán trong dashboard.
- `public/manifest.webmanifest` + `public/icons/`: cấu hình PWA "Add to Home Screen".
- `supabase/schema.sql`: schema + RLS, chạy 1 lần trên Supabase Dashboard > SQL Editor. File còn 1 dòng `alter publication supabase_realtime add table ...` sót lại từ trước khi bỏ Realtime — vô hại (không ảnh hưởng gì vì không còn code nào subscribe) nhưng có thể dọn sau.

## 12. Verification
Dev cần kiểm tra:
- `npm run build` thành công.
- Đăng nhập Google OAuth thành công, redirect đúng về app sau khi xác thực.
- Đăng xuất hoạt động, quay lại màn đăng nhập.
- User mới (chưa có hàng trong `kn_space_state`) được seed dữ liệu demo đúng, lưu thành công lên Supabase.
- User cũ đăng nhập lại trên máy khác thấy đúng dữ liệu đã lưu (đồng bộ qua Supabase).
- Sửa dữ liệu ở máy A → máy B (cùng tài khoản) thấy đúng thay đổi **sau khi tự reload/mở lại app** — KHÔNG kỳ vọng tự cập nhật khi máy B đang mở sẵn cùng lúc (không có Realtime, xem mục 10).
- Mở tab mới hiện đúng màn Home/Dashboard theo `lastScreen` đã lưu.
- Home: đồng hồ chạy đúng giờ máy, quote/ảnh nền theo đúng tần suất đã chọn, nút "Vào Dashboard" hoạt động kèm phím Enter/Space, Esc từ Dashboard quay lại Home, dòng "X việc cần làm hôm nay" hiện đúng số và ẩn hẳn khi = 0.
- Ảnh nền lỗi/offline rơi về gradient fallback, không vỡ layout; đổi ảnh có crossfade mượt, không giật.
- Upload ảnh nền từ máy: ảnh được resize/nén trước khi lưu, áp dụng được làm ảnh nền hiện tại, vẫn còn sau reload và **đồng bộ đúng khi đăng nhập từ máy khác**.
- CRUD đủ 5 khối, đồng bộ đúng lên Supabase (debounce 600ms).
- Tạo/đổi tên/xoá/sắp xếp Space.
- Bật/tắt khối theo Space: modal "Sửa Space" hiện checkbox cho **5 khối** (gồm cả Hôm nay); khối Thông báo và Widget điều hướng không có checkbox, luôn hiện ở mọi Space.
- Đổi theme/màu/layout/thứ tự khối, lưu và đồng bộ đúng.
- Export JSON tải file đúng, bao gồm đầy đủ ảnh upload base64 inline và 10 slot quote.
- Import JSON khôi phục đúng sau xác nhận — verify thêm: import file export từ bản extension cũ vào web app mới, dữ liệu lên đúng Supabase.
- Trên di động (ngưỡng ~1000px, xem mục 2.1): không có màn Home, mặc định vào thẳng tab "Trò chuyện" (feed hợp nhất Task+Note dạng bong bóng chat, quick-add có prefix `/note `), chuyển được sang tab "Chi tiết" (accordion Task+Note) qua `MobileTabBar`; Space-switcher + Settings vẫn dùng được trong `DashboardCorner` thu gọn.
- "Add to Home Screen" trên iOS/Android mở app full-screen đúng theme/icon.
- Mất mạng giữa lúc sửa dữ liệu: có cảnh báo, không crash app (chưa có offline-first/queue — quyết định đã chốt, không cần, xem mục 10).

## Câu hỏi mở / việc tồn đọng
1. ~~Mục 4/4.1 (Layout Dashboard tự do) đã được rà soát lại đúng code thật~~ (`src/layout/AppLayout.tsx`, `useDashboardLayout.ts`, `dashboardLayoutUtils.ts`) — khối "Hôm nay" đã được bổ sung mô tả riêng ở **mục 5.6**. **Đã chốt (`ba`, 2026-07-07):** câu hỏi về mục 5.5/6/8/12 đã xử lý xong (xem câu hỏi mở cuối mục 4.1); câu hỏi về giới hạn số khối ghép ngang tối đa/slot vẫn còn mở, chưa cần quyết định gấp.
2. ~~Phát sinh khi viết mục 5.6: hành vi khối Hôm nay không khớp mô tả ban đầu~~ — **đã chốt (2026-07-03)**: giữ đúng code thật (resize được + tắt/bật theo Space), xem ghi chú "Đã chốt" cuối mục 5.6.
3. **Mục 2.1/4/4.5/10 đã rà soát lại đúng code thật về hành vi mobile (2026-07-07)**, theo phát hiện của `uiux` (`docs/features/ui-audit-2026-07.md` mục 3, câu hỏi mở #1): breakpoint mobile chính đổi từ `≤639px` (sai) sang ~1000px (999/1010 hysteresis, `useMobileLayout.ts`), mobile bỏ hẳn màn Home, thêm mô tả màn "Trò chuyện" (`MobileChatScreen`) + `MobileTabBar`. **Đã chốt (`ba`, 2026-07-07)** — đã đọc lại toàn bộ code liên quan (`useMobileLayout.ts`, `App.tsx`, `AppLayout.tsx`, `MobileChatScreen.tsx`) và xác nhận đây là **1 quyết định thiết kế trọn vẹn, nhất quán nội bộ**, không phải trạng thái dở dang (nhánh mobile `return` sớm hoàn toàn tách khỏi nhánh desktop, `MobileChatScreen` là feature đầy đủ, việc bỏ Home mobile có comment xác nhận với chủ dự án). 2 việc tồn đọng đã xử lý luôn trong đợt này:
   - Mục 12 (Verification): đã sửa dòng kiểm thử mobile để đúng ngưỡng ~1000px và luồng "Trò chuyện"/"Chi tiết" (không còn ghi `≤639px`/chỉ-accordion).
   - Câu hỏi splitter "ẩn dưới breakpoint `lg` 979px" (mục 4): **xác nhận là dead code** — vì ngưỡng vào-mobile là `≤999px` không có hysteresis ở chiều "đang desktop" (`MOBILE_ENTER_MAX=999`), nên tại mọi độ rộng `≤979px` app đã sớm chuyển sang UI mobile riêng (nhánh desktop chứa splitter/`#cols-wrap` không còn được render) — không còn kịch bản nào khiến điều kiện `lg`/979px này còn ý nghĩa thực tế. Đã ghi chú kết luận này ngay tại mục 4 (không tự xoá code — để dev cân nhắc dọn khi có dịp sửa `AppLayout.tsx`).
