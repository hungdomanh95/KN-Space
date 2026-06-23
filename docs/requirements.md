# Requirements — KN-Space Phase 1

## 1. Mục tiêu
Xây dựng **KN-Space** thành một **Chrome Extension Manifest V3** dạng dashboard full-tab cho cá nhân dùng trên desktop.

Sản phẩm gồm 2 màn: **Home** (Tabliss-style, đồng hồ + lời chào + quote trên ảnh nền full-screen) là màn mở đầu, và **Dashboard** năng suất cá nhân gồm 5 khối:
- Việc cần làm
- Nhắc việc
- Thói quen
- Ghi chú
- Thông báo

Phase 1 tập trung vào bản dùng được ngay cho cá nhân: **desktop-only, không backend, không auth, không cộng tác nhiều người**.

## 2. Đối tượng dùng
Cá nhân dùng Chrome trên một hoặc nhiều máy desktop, muốn có một dashboard gọn để quản lý việc, nhắc việc, thói quen và ghi chú.

Người dùng chấp nhận giới hạn đồng bộ của Chrome Sync và có thể dùng Export/Import JSON làm backup thủ công.

## 3. Phạm vi Phase 1
Trong phạm vi:
- Chrome Extension MV3, mở dashboard ở tab riêng/full-tab, không làm popup nhỏ.
- Lưu dữ liệu bằng `chrome.storage.sync`, fallback `chrome.storage.local` khi vượt quota.
- Màn **Home** (Tabliss-style): đồng hồ real-time, ngày, lời chào theo buổi, 1 quote/ngày, ảnh nền full-screen, nút "Vào Dashboard".
- Ảnh nền dùng **link ảnh tĩnh cố định** (hotlink `images.unsplash.com`), không gọi API random/search ảnh.
- Full dashboard 5 khối: Việc cần làm, Nhắc việc, Thói quen, Ghi chú, Thông báo, nổi trên ảnh nền chung với hiệu ứng kính mờ nhẹ.
- Nhiều Space cục bộ trong dữ liệu của một người dùng.
- Settings: theme, màu chủ đạo, ảnh nền Home (lưới preview + sửa link + tự động đổi ảnh theo thời gian), layout size, thứ tự khối, export/import.
- Ẩn/hiện nội dung từng khối và ẩn/hiện tất cả.
- Icon SVG nhất quán, modal tuỳ biến, accessibility cơ bản.
- Chuyển mockup `docs/mockup/index.html` thành extension thật, có persistence.

Ngoài phạm vi Phase 1:
- Mobile/web app.
- Auth/backend/cloud database.
- Cộng tác nhiều người, mời thành viên, phân quyền.
- SaaS công khai/billing.
- Markdown/rich text.
- Đính kèm ảnh/file trong note.
- Kanban.
- Cỡ chữ tuỳ chỉnh trong Settings.
- Ảnh nền theo API Unsplash random/search (cần Access Key, có rate-limit) — chỉ dùng link tĩnh cố định đóng gói sẵn + cho sửa link thủ công.
- Setting "Màn mặc định khi mở tab" — đã bỏ, hành vi cố định là nhớ màn cuối user rời đi.

## 4. Layout Dashboard
Dashboard gồm 3 khối chính xếp ngang trên desktop:
1. **Khối tổng hợp** bên trái:
   - Việc cần làm ở trên, full width.
   - Nhắc việc + Thói quen ở dưới, 2 cột ngang hàng.
2. **Ghi chú** ở giữa.
3. **Thông báo** bên phải.

Yêu cầu layout:
- Mỗi khối có vùng scroll riêng nếu nội dung dài.
- Resize qua Settings bằng slider/input %, không kéo splitter trực tiếp trên dashboard.
- Có các tỉ lệ layout:
  - Chiều rộng khối tổng hợp / Ghi chú / Thông báo.
  - Chiều cao Việc cần làm so với hàng Nhắc việc + Thói quen.
  - Chiều rộng Nhắc việc so với Thói quen.
- Thay đổi layout áp dụng ngay.
- Có nút **Khôi phục mặc định**.
- Đổi thứ tự 3 khối chính bằng kéo-thả header (`block-head`).
- Lưu tỉ lệ layout + thứ tự khối vào storage, dùng chung cho mọi Space.

## 4.5 Màn Home (Tabliss-style)
Home là màn đầu tiên khi mở tab mới, tách hoàn toàn khỏi Dashboard 5 khối.

Nội dung Home:
- Đồng hồ lớn giờ:phút:giây cập nhật real-time (giây hiển thị nhỏ hơn, kiểu superscript).
- Ngày hiển thị dạng "Thứ X, ngày D tháng M năm YYYY".
- Lời chào theo buổi: sáng (giờ < 11) / trưa (11–13) / chiều (14–17) / tối (từ 18h), có thể ghép tên người dùng nếu đã đặt (mặc định để trống).
- 1 câu quote ngắn, lấy từ danh sách ~7 câu đóng gói cứng trong code, chọn theo **chỉ số ngày tính từ epoch modulo số câu** — cùng ngày luôn ra cùng câu, không gọi API quote ngoài.
- Ảnh nền full-screen (xem mục 4.6), dùng chung layer với Dashboard.

Điều hướng:
- 1 nút CTA duy nhất **"Vào Dashboard"** để chuyển màn. Không có hint text, không có nút "Kéo xuống", không có cử chỉ scroll-wheel (đã loại bỏ qua nhiều vòng feedback vì dư thừa).
- Phím tắt ngầm (không hiển thị gợi ý): `Enter` hoặc `Space` khi đang ở Home và không có input/textarea/select đang focus, không có modal mở → vào Dashboard.
- Từ Dashboard: nút **Home** trên topbar hoặc phím `Esc` (khi không có modal mở) → quay lại Home.
- Chuyển màn có transition fade (~0.45s), ảnh nền giữ nguyên không nháy/reload.
- Mở tab mới luôn mở lại đúng màn cuối cùng user rời đi (Home hoặc Dashboard), lưu vào storage dưới dạng `lastScreen`. Đây là hành vi cố định, **không phải setting cho người dùng chọn**.

## 4.6 Ảnh Nền Chung (Home + Dashboard)
- Ảnh nền là **1 layer duy nhất** dùng chung cho cả Home và Dashboard — không đổi/nhảy ảnh khi chuyển màn, đảm bảo liền mạch.
- Bộ ảnh mặc định gồm 6 link ảnh phong cảnh tĩnh (rừng/núi/hồ/đồi), hotlink trực tiếp tới `images.unsplash.com` qua URL cố định trong code, **không gọi API Unsplash random/search** (không cần Access Key, không rate-limit).
- Ảnh đang dùng được chọn theo chỉ số ngày tính từ epoch khi mở app lần đầu trong ngày (đồng bộ cách chọn với quote), người dùng có thể đổi thủ công bất kỳ lúc nào.
- Khi ảnh lỗi tải (link hỏng/offline): fallback sang 1 trong các gradient đóng gói sẵn trong code, không để màn trắng vỡ.

## 5. Tính Năng Chi Tiết

### 5.1 Việc Cần Làm
Chỉ quản lý việc một lần, có theo dõi hoàn thành.

Yêu cầu:
- Tạo việc với tên + ngày/giờ tuỳ chọn.
- Danh sách phẳng.
- Filter: Tất cả / Chưa xong / Đã xong.
- Checkbox done/chưa done.
- Sửa tên/ngày/giờ.
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

## 6. Space
Phase 1 hỗ trợ nhiều Space **cục bộ cho một người dùng**.

Yêu cầu:
- Có dropdown Space cạnh logo.
- Hiển thị tên Space hiện tại.
- Bấm dropdown để xem danh sách Space.
- Click Space để chuyển ngay.
- Demo seed ban đầu có thể gồm "Cá nhân" và "Công ty" nếu storage rỗng.
- Tạo Space mới.
- Đổi tên Space.
- Xoá Space, nhưng không cho xoá nếu chỉ còn 1 Space.
- Xoá Space bằng modal xác nhận.
- Nếu xoá Space đang mở, tự chuyển sang Space còn lại.
- Có nút lên/xuống để đổi thứ tự Space trong menu.
- Thứ tự Space được lưu lại.

Mỗi Space có:
- Dữ liệu riêng cho các khối.
- Cấu hình bật/tắt khối (`enabledBlocks`) cho 5 khối:
  - Việc cần làm.
  - Nhắc việc.
  - Thói quen.
  - Ghi chú.
  - Thông báo.
- Khối nào tắt thì ẩn hẳn khỏi dashboard của Space đó.
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
- Tỉ lệ layout.
- Thứ tự khối chính.

## 7. Settings
Settings gồm:
- Theme Sáng/Tối.
- Màu chủ đạo từ bảng màu có sẵn.
- Ảnh nền Home (xem chi tiết bên dưới).
- Layout size bằng slider/input.
- Khôi phục layout mặc định.
- Export JSON.
- Import JSON.

Ảnh nền Home:
- Lưới preview 6 ô, mỗi ô tương ứng 1 link trong bộ ảnh mặc định (mục 4.6).
- Click vào ảnh trong ô để áp dụng ngay làm ảnh nền hiện tại (dùng chung Home + Dashboard).
- Mỗi ô có input cho sửa trực tiếp link ảnh; áp dụng khi blur hoặc nhấn Enter.
- Ô có link lỗi (load ảnh thất bại) hiện cảnh báo "Link lỗi" đè lên thumbnail, không tự đổi ảnh.
- Có tuỳ chọn "Tự động đổi ảnh" theo khoảng thời gian: Tắt / Mỗi 1 phút / Mỗi 15 phút / Mỗi 1 giờ.
- Đã gỡ hẳn mục Ảnh nền gradient/Trơn cũ và cơ chế "header tint đổi theo tông ảnh nền" — không còn dùng.

Export/Import:
- Export xuất toàn bộ spaces + settings ra file `.json`.
- Import đọc file `.json` và thay thế dữ liệu hiện tại sau khi người dùng xác nhận.
- Sau import, UI reset về trạng thái mặc định hợp lý: Space hợp lệ, filter Tất cả, note sort Thứ tự thủ công.

## 8. Ẩn/Hiện Khối
Áp dụng cho 5 khối:
- Việc cần làm.
- Nhắc việc.
- Thói quen.
- Ghi chú.
- Thông báo.

Yêu cầu:
- Mỗi khối có icon mắt ở header.
- Bấm icon để ẩn/hiện nội dung khối.
- Khi ẩn, khối **giữ nguyên kích thước**, chỉ thay body bằng placeholder căn giữa.
- Placeholder gồm icon mắt-gạch + text "Đã ẩn nội dung [tên khối]".
- Các nút phụ trong header như filter/+Thêm ẩn theo.
- Có nút header app **Ẩn tất cả / Hiện tất cả**.
- Nút này tự đổi nhãn theo trạng thái hiện tại.

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
  - Drag item/block có opacity khi kéo.
  - Drop target có outline/nhấn nhẹ.
- Không dùng phong cách Duolingo.
- **Dashboard dùng kính mờ nhẹ** (đảo ngược quyết định cũ "không glassmorphism"): từ khi Dashboard nổi trên ảnh nền chung, các khối chính/sub-block/topbar dùng nền bán-trong-suốt + `backdrop-filter: blur()`, alpha cao ~88-90% (đủ đọc rõ chữ, khác biệt với kính mờ trong suốt mạnh kiểu Duolingo). Ảnh nền lộ ra ở viền ngoài dashboard và khe (gap) giữa các khối. Quyết định này đã thử nghiệm qua nhiều vòng so sánh (gồm cả biến thể "nền đặc không kính mờ" và "kính mờ trong suốt cao"), chốt phương án kính mờ nhẹ vì giữ được độ rõ chữ tốt nhất trong khi vẫn tạo cảm giác khối "nổi trên" ảnh.

Accessibility cơ bản:
- Nút chỉ có icon phải có `title` và `aria-label`.
- Checkbox tuỳ biến có `role="checkbox"` và `aria-checked`.
- Swatch màu/ảnh nền có focus visible.
- Các nút quan trọng có focus outline.

## 10. Ràng Buộc Kỹ Thuật
Extension:
- Chrome Extension Manifest V3.
- Desktop-only.
- Permission tối thiểu: `storage`.
- `host_permissions` cho `https://images.unsplash.com/*` — cần vì Home/Dashboard tải ảnh nền qua `<img>`/CSS `background-image` hotlink tới domain ngoài (link tĩnh, không phải fetch ảnh qua code/API key).
- Icon extension mở/focus tab dashboard.
- Không popup nhỏ.
- Không backend/auth/hosting.
- Frontend Phase 1 dùng **React + TypeScript + Vite**.
- Dùng **lucide-react** làm thư viện icon chính.
- Mockup `docs/mockup/index.html` là nguồn UX/prototype để port sang component React, không phải runtime cần copy nguyên trạng.

MV3 CSP:
- Bản extension không được dùng inline `<script>`.
- Bản extension không được dùng inline handler trong HTML build output.
- React event handlers hợp lệ vì nằm trong JS bundle external.
- Vite build không được cần `eval` hoặc remote script.
- Ảnh nền hotlink từ `images.unsplash.com` cần được CSP cho phép ở `img-src`/`connect-src` tương ứng trong manifest.

Storage:
- `chrome.storage.sync` là nguồn chính.
- `chrome.storage.local` là fallback khi vượt quota.
- Không lưu toàn bộ app thành một blob lớn.
- Tách key theo space/settings/layout để né giới hạn khoảng 8KB/item.
- Cần debounce khi ghi storage.
- Seed dữ liệu demo chỉ khi storage rỗng lần đầu.
- Sau lần đầu, reload phải đọc dữ liệu thật từ storage.
- Lưu thêm `lastScreen` (Home/Dashboard) và cấu hình ảnh nền (6 link hiện tại + chỉ số đang chọn + khoảng tự động đổi ảnh) vào storage.

Drag & drop:
- Khối chính và card note đều có drag/drop độc lập.
- Khi xử lý drag ở cấp khối cha, phải kiểm tra target để tránh event của card nổi bọt làm kích hoạt kéo nhầm khối.
- Kéo-thả đổi thứ tự khối chỉ trên desktop.

## 11. Cấu Trúc Extension Dự Kiến
```
extension/
  manifest.json
  background.js
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    types.ts
    storage/
      chromeStorage.ts
    state/
      appReducer.ts
      seed.ts
    components/
    features/
  icons/
```

Vai trò:
- `manifest.json`: MV3, permission `storage`, `host_permissions` cho `images.unsplash.com`, action, background service worker, icons.
- `background.js`: click icon mở/focus tab dashboard.
- `index.html`: entry HTML cho React app, không inline script.
- `src/main.tsx` + `src/App.tsx`: bootstrap và shell dashboard, gồm cả màn Home.
- `src/features/`: UI/logic theo từng khối chức năng (bao gồm Home).
- `src/storage/chromeStorage.ts`: load/seed/save debounce, sync + local fallback.
- `lucide-react`: icon UI line-icon nhất quán trong dashboard.
- `icons/`: icon 16/32/48/128.

## 12. Verification Phase 1
Dev cần kiểm tra:
- Load unpacked extension thành công.
- Click icon mở/focus dashboard full-tab.
- `npm run build` thành công.
- Console không có lỗi CSP/runtime.
- Mở tab mới hiện đúng màn Home/Dashboard theo `lastScreen` đã lưu.
- Home: đồng hồ chạy đúng giờ máy, quote/ảnh nền cùng ngày ra cùng kết quả, nút "Vào Dashboard" + phím Enter/Space hoạt động, Esc từ Dashboard quay lại Home.
- Ảnh nền lỗi/offline rơi về gradient fallback, không vỡ layout.
- Đổi/sửa link ảnh nền trong Settings áp dụng đúng, ô lỗi link hiện cảnh báo.
- Tự động đổi ảnh theo khoảng thời gian đã chọn hoạt động.
- CRUD đủ 5 khối.
- Tạo/đổi tên/xoá/sắp xếp Space.
- Bật/tắt khối theo Space.
- Đổi theme/màu/layout/thứ tự khối.
- Reload tab vẫn giữ dữ liệu.
- Export JSON tải file đúng.
- Import JSON khôi phục đúng sau xác nhận.
- Khi dữ liệu lớn vượt quota sync, fallback local hoạt động và có cảnh báo nhẹ.
