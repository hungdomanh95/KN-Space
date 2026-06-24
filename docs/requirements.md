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
- Màn **Home** (Tabliss-style): đồng hồ real-time, ngày, lời chào theo buổi, 1 quote (xem mục 4.5/7), ảnh nền full-screen, nút "Vào Dashboard" dạng icon tối giản, dòng đếm việc hôm nay.
- Ảnh nền dùng **link ảnh tĩnh cố định** (hotlink `images.unsplash.com`) hoặc **ảnh upload từ máy** (xem mục 4.6/7), không gọi API random/search ảnh.
- Full dashboard **3 khối chính** (không còn topbar ngang): khối tổng hợp (Việc cần làm/Nhắc việc/Thói quen), Ghi chú, Thông báo — nổi trên ảnh nền chung với hiệu ứng kính mờ nhẹ. Có widget điều hướng cố định ngay dưới khối Thông báo (xem mục 4).
- Nhiều Space cục bộ trong dữ liệu của một người dùng.
- Settings: theme, màu chủ đạo, ảnh nền Home (lưới preview + sửa link/upload + tự động đổi ảnh theo thời gian), quote Home (10 slot cố định + tần suất đổi), layout size, thứ tự khối, export/import.
- Ẩn/hiện nội dung từng khối (xem mục 8).
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
- Ảnh nền theo API Unsplash random/search (cần Access Key, có rate-limit) — chỉ dùng link tĩnh cố định đóng gói sẵn + cho sửa link thủ công + upload ảnh local.
- Đồng bộ ảnh upload giữa nhiều máy — ảnh upload chỉ lưu cục bộ trên máy đã upload (xem mục 4.6/7/10).
- Setting "Màn mặc định khi mở tab" — đã bỏ, hành vi cố định là nhớ màn cuối user rời đi.
- CRUD thêm/xoá quote tự do — quote Home cố định đúng 10 slot, chỉ sửa nội dung (xem mục 4.5/7).
- Topbar/header ngang trên Dashboard — đã bỏ hoàn toàn, thay bằng widget điều hướng cố định dưới khối Thông báo (xem mục 4).
- Nút "Ẩn tất cả/Hiện tất cả" các khối — đã bỏ hẳn, không tồn tại ở đâu trong sản phẩm (mỗi khối đã có icon mắt riêng để ẩn/hiện từng khối, xem mục 8).
- Tắt/ẩn khối Thông báo theo Space — đã bỏ, khối Thông báo luôn hiện với mọi Space (xem mục 4.1/5.5/6/8).

## 4. Layout Dashboard
Dashboard **không còn topbar/header ngang** (đã bỏ logo, dropdown space kiểu cũ, quote, cụm nút Home/Ẩn-tất-cả/Settings ở trên cùng). Dashboard chỉ còn 3 khối chính chiếm toàn màn hình, xếp ngang trên desktop:
1. **Khối tổng hợp** bên trái:
   - Việc cần làm ở trên, full width.
   - Nhắc việc + Thói quen ở dưới, 2 cột ngang hàng.
2. **Ghi chú** ở giữa.
3. **Thông báo** bên phải, nằm trong cột riêng cùng widget điều hướng cố định ngay dưới nó (xem mục 4.1).

Yêu cầu layout:
- Mỗi khối có vùng scroll riêng nếu nội dung dài.
- Resize qua Settings bằng slider/input %, không kéo splitter trực tiếp trên dashboard.
- Có các tỉ lệ layout:
  - Chiều rộng khối tổng hợp / Ghi chú (khối Thông báo **không** có slider riêng — width của nó luôn là phần còn lại sau khi trừ 2 khối kia, xem mục 4.1).
  - Chiều cao Việc cần làm so với hàng Nhắc việc + Thói quen.
  - Chiều rộng Nhắc việc so với Thói quen.
- Thay đổi layout áp dụng ngay.
- Có nút **Khôi phục mặc định**.
- Đổi thứ tự khối chính bằng kéo-thả header (`block-head`) — **chỉ áp dụng cho 2 khối: khối tổng hợp và Ghi chú**. Khối Thông báo **cố định vị trí cuối cùng**, không tham gia kéo-thả đổi thứ tự (đánh đổi để có chỗ đặt widget điều hướng cố định ngay dưới nó, xem mục 4.1).
- Lưu tỉ lệ layout + thứ tự khối vào storage, dùng chung cho mọi Space.

### 4.1 Widget điều hướng cố định (dưới khối Thông báo)
Vì Dashboard không còn topbar, các điều hướng trước đây nằm trên topbar (Home, đổi Space, Settings) được dồn vào 1 widget cố định, nằm ngay dưới khối Thông báo, full width đúng bằng khối đó (cùng cột, không phải `position: fixed` nổi tự do).

Widget gồm 3 phần theo thứ tự ngang:
- Nút **Về Home** (icon-only).
- **Space-switcher** dạng dropdown, chiếm phần rộng còn lại, căn giữa nội dung trong nút, gồm:
  - Dot màu riêng từng Space (xoay vòng theo bảng màu cố định theo index, không đổi khi sắp xếp lại thứ tự Space).
  - Tên Space hiện tại.
  - Khi mở dropdown: mỗi Space hiển thị dòng phụ nhỏ mờ dạng preview `"X việc hôm nay · Y note"` (X = số task có ngày hôm nay và chưa xong, Y = tổng số note của Space đó).
  - Gợi ý phím tắt `Alt+số` (Windows/Linux) hoặc `Cmd+số` (Mac) hiển thị cạnh tên cho **9 Space đầu tiên** theo thứ tự trong danh sách (Space thứ 10+ không có gợi ý phím tắt).
  - Vẫn giữ các thao tác tạo/đổi tên/xoá/đổi thứ tự Space như mục 6.
- Nút **Settings** (icon-only).

Khối Thông báo **luôn hiện với mọi Space, không thể tắt/ẩn theo Space** (khác 4 khối còn lại, xem mục 5.5/6/8) — chính vì lý do này, widget điều hướng cố định (cùng cột với khối Thông báo) cũng luôn hiện theo, đảm bảo Dashboard luôn có cách đổi Space/mở Settings mà không phụ thuộc cấu hình bật/tắt khối của từng Space.

## 4.5 Màn Home (Tabliss-style)
Home là màn đầu tiên khi mở tab mới, tách hoàn toàn khỏi Dashboard.

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

Điều hướng:
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
- Khối này **cố định vị trí cuối cùng** trong layout 3 khối chính và **width luôn tự động = phần còn lại** (không có slider riêng, không kéo-thả đổi thứ tự) — xem mục 4/4.1.
- Khối Thông báo **luôn hiện với mọi Space, không thể tắt/ẩn theo Space** — khác với 4 khối dữ liệu còn lại (Việc cần làm/Nhắc việc/Thói quen/Ghi chú, xem mục 6/8). Lý do: khối này dùng chung cột layout với widget điều hướng cố định (Về Home/Space-switcher/Settings, xem mục 4.1); nếu cho tắt sẽ mất luôn widget điều hướng của Space đó, không còn cách đổi Space/mở Settings từ Dashboard (chỉ còn `Esc` về Home). Khối Thông báo vẫn có icon mắt để ẩn/hiện **nội dung** (như mục 8), chỉ không có trong danh sách khối được phép tắt hẳn theo Space.

## 6. Space
Phase 1 hỗ trợ nhiều Space **cục bộ cho một người dùng**.

Yêu cầu:
- Đổi Space qua **Space-switcher dạng dropdown** trong widget điều hướng cố định dưới khối Thông báo (xem mục 4.1) — không còn dropdown cạnh logo trên topbar (đã bỏ topbar).
- Hiển thị tên Space hiện tại + dot màu riêng từng Space.
- Bấm dropdown để xem danh sách Space, mỗi Space kèm preview "X việc hôm nay · Y note".
- Click Space để chuyển ngay.
- Demo seed ban đầu có thể gồm "Cá nhân" và "Công ty" nếu storage rỗng.
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
- Cấu hình bật/tắt khối (`enabledBlocks`) cho **4 khối** (modal "Sửa Space" chỉ liệt kê 4 khối này để chọn bật/tắt):
  - Việc cần làm.
  - Nhắc việc.
  - Thói quen.
  - Ghi chú.
- Khối Thông báo **không nằm trong `enabledBlocks` có thể tắt** — luôn hiện với mọi Space (xem mục 4.1/5.5/8), không xuất hiện trong checkbox chọn khối ở modal "Sửa Space".
- Khối nào trong 4 khối trên bị tắt thì ẩn hẳn khỏi dashboard của Space đó.
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
Settings trình bày dạng **3 tab**, modal Settings có **kích thước cố định** (không co giãn theo nội dung) — header, thanh tab, vùng nút hành động luôn cố định, chỉ phần nội dung từng tab (`.settings-body`) cuộn riêng, không cuộn cả modal:
- Tab **"Chung"**: Theme sáng/tối, Màu chủ đạo, Bố cục/kích thước khối, Export/Import.
- Tab **"Ảnh nền"**: lưới ảnh nền Home (6 slot, mỗi slot là link hoặc upload), tuỳ chọn "Tự động đổi ảnh".
- Tab **"Quote"**: lưới 10 slot quote Home, tuỳ chọn tần suất đổi quote.

Ảnh nền Home (tab "Ảnh nền"):
- Lưới preview 6 ô, mỗi ô tương ứng 1 slot trong bộ ảnh mặc định (mục 4.6), mỗi slot là link ảnh hoặc ảnh upload.
- Click vào ảnh trong ô để áp dụng ngay làm ảnh nền hiện tại (dùng chung Home + Dashboard).
- Mỗi ô có input cho sửa trực tiếp link ảnh; áp dụng khi blur hoặc nhấn Enter.
- Mỗi ô có nút **Upload ảnh** để chọn file ảnh từ máy (qua `FileReader`), thay slot đó sang dạng `upload` (base64); nhập link mới vào ô đang ở dạng upload sẽ chuyển ô đó trở lại dạng `url`.
- Trước khi lưu ảnh upload: resize cạnh dài tối đa ~1920px, nén JPEG quality ~80-85% nếu vẫn còn nặng — xử lý ở client trước khi lưu, không lưu file gốc nguyên bản.
- Ảnh upload lưu vào `chrome.storage.local` (không sync, xem mục 10), nên không đồng bộ giữa các máy — chỉ hiển thị đúng trên máy đã upload.
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

## 8. Ẩn/Hiện Khối
Áp dụng cho 5 khối dữ liệu (Việc cần làm, Nhắc việc, Thói quen, Ghi chú, Thông báo) — tương ứng 3 khối chính trên Dashboard (khối tổng hợp gộp 3 khối dữ liệu con, Ghi chú, Thông báo). Đây là cơ chế **ẩn/hiện nội dung từng khối** qua icon mắt, áp dụng đều cho cả 5 khối kể cả Thông báo, khác với cơ chế **tắt hẳn khối khỏi Space** (`enabledBlocks`) chỉ áp dụng cho 4/5 khối, xem chi tiết bên dưới.

Yêu cầu:
- Mỗi khối có icon mắt ở header.
- Bấm icon để ẩn/hiện nội dung khối.
- Khi ẩn, khối **giữ nguyên kích thước**, chỉ thay body bằng placeholder căn giữa.
- Placeholder gồm icon mắt-gạch + text "Đã ẩn nội dung [tên khối]".
- Các nút phụ trong header như filter/+Thêm ẩn theo.
- Tắt hẳn khối khỏi Dashboard theo từng Space (`enabledBlocks`, xem mục 6) chỉ áp dụng cho **4 khối**: Việc cần làm, Nhắc việc, Thói quen, Ghi chú. Khối Thông báo **không** có cấu hình tắt hẳn theo Space — luôn hiện với mọi Space (xem mục 4.1/5.5/6), chỉ có icon mắt để ẩn/hiện nội dung như mọi khối khác.
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
Extension:
- Chrome Extension Manifest V3.
- Desktop-only.
- Permission: `storage` + `unlimitedStorage` (cần cho ảnh upload base64 lưu ở `chrome.storage.local`, xem mục Storage bên dưới).
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
- Ảnh upload là data-URL base64 (không phải request mạng) nên không cần thêm `host_permissions`/CSP riêng, nhưng `img-src` phải cho phép `data:`.

Storage:
- `chrome.storage.sync` là nguồn chính cho dữ liệu thường (spaces, settings, layout, link ảnh nền dạng `url`, 10 slot quote).
- `chrome.storage.local` là fallback khi vượt quota cho dữ liệu thường, và là nơi lưu **chính thức, bắt buộc** cho ảnh nền dạng `upload` (base64) — không thử lưu ảnh upload vào `sync` vì vượt xa quota ~8KB/item.
- Ảnh upload không đồng bộ giữa các máy (chỉ tồn tại trên máy đã upload); đây là đánh đổi đã chấp nhận, không phải bug.
- Không lưu toàn bộ app thành một blob lớn.
- Tách key theo space/settings/layout để né giới hạn khoảng 8KB/item.
- Cần debounce khi ghi storage.
- Seed dữ liệu demo chỉ khi storage rỗng lần đầu.
- Sau lần đầu, reload phải đọc dữ liệu thật từ storage.
- Mỗi task có field `order` (số nguyên, dùng cho kéo-thả sắp xếp thủ công) và field `content` (string tuỳ chọn, nội dung chi tiết) — cần migrate dữ liệu cũ (nếu có) gán `order` mặc định theo thứ tự hiện tại và `content` mặc định rỗng.
- Lưu thêm `lastScreen` (Home/Dashboard), cấu hình ảnh nền (6 slot hiện tại — mỗi slot kèm `type`: `url`/`upload` — + chỉ số đang chọn + khoảng tự động đổi ảnh), và cấu hình quote (10 slot nội dung + chỉ số đang chọn + tần suất đổi `quoteRotateMode`: `daily`/`onopen`/`every15m`/`every1h`) vào storage.

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
- `manifest.json`: MV3, permission `storage` + `unlimitedStorage`, `host_permissions` cho `images.unsplash.com`, action, background service worker, icons.
- `background.js`: click icon mở/focus tab dashboard.
- `index.html`: entry HTML cho React app, không inline script.
- `src/main.tsx` + `src/App.tsx`: bootstrap và shell dashboard, gồm cả màn Home.
- `src/features/`: UI/logic theo từng khối chức năng (bao gồm Home).
- `src/storage/chromeStorage.ts`: load/seed/save debounce, sync + local fallback, xử lý riêng nhánh ảnh upload (luôn local).
- `lucide-react`: icon UI line-icon nhất quán trong dashboard.
- `icons/`: icon 16/32/48/128.

## 12. Verification Phase 1
Dev cần kiểm tra:
- Load unpacked extension thành công.
- Click icon mở/focus dashboard full-tab.
- `npm run build` thành công.
- Console không có lỗi CSP/runtime.
- Mở tab mới hiện đúng màn Home/Dashboard theo `lastScreen` đã lưu.
- Home: đồng hồ chạy đúng giờ máy, quote/ảnh nền theo đúng tần suất đã chọn (mặc định "Mỗi ngày" ra cùng kết quả trong ngày), nút "Vào Dashboard" (icon tối giản + caption, có bounce nhẹ) hoạt động kèm phím Enter/Space, Esc từ Dashboard quay lại Home, dòng "X việc cần làm hôm nay" hiện đúng số và ẩn hẳn khi = 0.
- Ảnh nền lỗi/offline rơi về gradient fallback, không vỡ layout; đổi ảnh có crossfade mượt, không giật.
- Đổi/sửa link ảnh nền trong Settings áp dụng đúng, ô lỗi link hiện cảnh báo.
- Upload ảnh nền từ máy: ảnh được resize/nén trước khi lưu, slot chuyển đúng sang dạng upload, áp dụng được làm ảnh nền hiện tại, vẫn còn sau reload (đọc từ `chrome.storage.local`).
- Tự động đổi ảnh theo khoảng thời gian đã chọn hoạt động, mặc định đúng "Mỗi 15 phút" khi chưa từng cấu hình.
- Sửa nội dung quote trong Settings tab "Quote" áp dụng đúng, 10 slot không cho thêm/xoá; đổi tần suất quote ("Mỗi ngày"/"Mỗi lần mở Home"/"Mỗi 15 phút"/"Mỗi 1 giờ") hoạt động đúng từng kiểu.
- Settings hiển thị đúng 3 tab "Chung"/"Ảnh nền"/"Quote", chuyển tab giữ đúng trạng thái từng nhóm control; modal Settings giữ kích thước cố định, chỉ nội dung tab cuộn riêng (không cuộn cả modal).
- Dashboard không còn topbar ngang; widget điều hướng cố định dưới khối Thông báo hiển thị đủ 3 phần (Về Home, Space-switcher, Settings), Space-switcher hiện đúng dot màu + preview "X việc hôm nay · Y note" + gợi ý phím tắt cho 9 Space đầu.
- Phím tắt `Alt+1-9`/`Cmd+1-9` đổi đúng Space theo thứ tự, không kích hoạt khi đang gõ input/textarea hoặc có modal mở.
- Khối Thông báo cố định cuối layout, không kéo-thả đổi thứ tự được, width luôn = phần còn lại (không có slider riêng); 2 khối còn lại (tổng hợp, Ghi chú) vẫn kéo-thả đổi thứ tự bình thường.
- Task: kéo-thả icon grip sắp xếp lại thứ tự, field `order` cập nhật đúng cho toàn bộ danh sách; tick "Đã xong" ở filter "Tất cả" đẩy task xuống cuối hiển thị nhưng không đổi `order` lưu trữ, bỏ tick về đúng vị trí cũ. Modal Thêm/Sửa việc có ô "Nội dung" lưu đúng field `content`, modal dùng kích thước rộng (cùng class modal Note).
- CRUD đủ 5 khối.
- Tạo/đổi tên/xoá/sắp xếp Space.
- Bật/tắt khối theo Space: modal "Sửa Space" chỉ hiện checkbox cho **4 khối** (Việc cần làm/Nhắc việc/Thói quen/Ghi chú); khối Thông báo không có checkbox, luôn hiện ở mọi Space dù tắt hết 4 khối kia.
- Đổi theme/màu/layout/thứ tự khối.
- Reload tab vẫn giữ dữ liệu.
- Export JSON tải file đúng, bao gồm đầy đủ ảnh upload base64 inline và 10 slot quote.
- Import JSON khôi phục đúng sau xác nhận, bao gồm khôi phục đúng ảnh upload vào `chrome.storage.local`.
- Khi dữ liệu lớn vượt quota sync, fallback local hoạt động và có cảnh báo nhẹ.
