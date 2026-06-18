# Requirements — KN-Space (trước đây "extensionNote")

> **Đổi tên ứng dụng (vòng 21):** từ "extensionNote" sang **"KN-Space"**. Xem mục 30.
> **Cập nhật lớn nhất (vòng 22):** thêm tính năng **nhiều Space** (không gian làm việc riêng biệt, vd. "Cá nhân"/"Công ty"), mỗi Space có đủ riêng 5 khối dữ liệu, chuyển đổi qua dropdown cạnh logo. Xem mục 31 và mục 5.9.
> **Tách lại "Nhắc lặp lại" khỏi "Việc cần làm" (vòng 16)** — quyết định gộp ở vòng 6 (F22) đã bị **đảo ngược**: khối tổng hợp bên trái giờ có **3 khối con** (Việc cần làm / Nhắc việc / Thói quen) thay vì 2. Xem mục 23, mục 5.1, mục 5.3 (đã hồi sinh).

## 1. Mục tiêu
> **Cập nhật phạm vi (vòng 3):** theo yêu cầu mới của người dùng, sản phẩm chuyển từ "ứng dụng note dạng card tự do" sang **dashboard cá nhân với 5 khối cố định**, lấy lại cấu trúc ảnh "Personal Tracker" gốc (ảnh 1), bỏ qua ảnh "Cài đặt" gốc (ảnh 2 — vẫn dùng ý tưởng cũ cho Settings, không phân tích lại). Quyết định ở mục 7/8 (Pinterest masonry toàn trang) bị **thay thế** bởi mục 4 dưới đây; các mục khác (Note/Task list card, Settings, sync, export/import) vẫn giữ nguyên nhưng card giờ nằm **trong khối Ghi chú**, không chiếm toàn trang.

> **Cập nhật bố cục (vòng 5):** đổi từ mô hình "2 tầng, 5 khối ngang hàng" sang **3 khối chính xếp ngang hàng**: (1) khối tổng hợp bên trái, (2) khối **Ghi chú**, (3) khối **Thông báo** (đổi tên từ "Nhắc việc"). 3 khối chính này resize được và **đổi thứ tự ngang được** (xem mục 4).

> **Cập nhật vòng 6 (mới nhất):**
> 1. **Gộp Todo + Nhắc lặp lại thành 1 khối duy nhất "Việc cần làm"** — bỏ Kanban 4 cột, thay bằng 1 danh sách đơn giản chứa cả việc 1 lần (có ngày/giờ) và việc lặp lại (có chu kỳ + giờ), filter Tất cả/Chưa xong/Đã xong. Khối tổng hợp bên trái giờ chỉ còn 2 khối con: **Việc cần làm** + **Thói quen** (không còn 3 khối con như vòng 5).
> 2. **Nhắc lặp lại có thêm trường giờ** (vd. "Mỗi ngày lúc 07:00"), không chỉ có chu kỳ.
> 3. **Đổi cơ chế resize từ kéo-thả splitter sang điều khiển trong Settings** (slider/input số) — kéo-thả splitter tự do bị lỗi/không ổn định, chuyển sang nhập tỉ lệ % rõ ràng cho từng khối trong Settings, áp dụng ngay.
>
> Các quyết định liên quan ở mục 10/12 (F16, F17, F20 bản cũ) bị thay thế bởi mục 13 dưới đây.

Xây dựng một Chrome extension cá nhân, gọn nhẹ, gồm 3 khối chính: **khối tổng hợp** (Việc cần làm + Nhắc việc + Thói quen), **Ghi chú** (nhiều card Note có màu riêng), **Thông báo** (tự tổng hợp nhắc nhở từ khối tổng hợp, sắp xếp theo thời gian gần nhất). Người dùng chỉnh kích thước từng khối qua **Settings** (nhập % hoặc kéo slider) và **đổi thứ tự 3 khối chính** bằng kéo-thả; bố cục/theme/màu/ảnh nền là cài đặt **dùng chung cho toàn app**. Người dùng có thể tạo **nhiều Space** (không gian làm việc riêng, vd. Cá nhân/Công ty), mỗi Space có đủ riêng cả 5 khối dữ liệu, chuyển đổi qua dropdown cạnh logo. Dữ liệu lưu trữ và đồng bộ giữa các máy dùng chung một tài khoản Chrome.

## 2. Đối tượng dùng
Cá nhân dùng Chrome trên nhiều máy (nhà/công ty/laptop khác), cần một dashboard cá nhân gọn để quản lý task, note, việc lặp lại và thói quen, không muốn cài app riêng hay phụ thuộc server ngoài, chấp nhận giới hạn đồng bộ của Chrome.

## 3. Phạm vi MVP
**Trong phạm vi:**
- Layout **3 khối chính** ngang hàng, resize qua **Settings** (không kéo-thả splitter) + **đổi thứ tự được** (xem mục 4):
  1. Khối tổng hợp bên trái = **Việc cần làm** (trên, full width) + **Nhắc việc** + **Thói quen** (dưới, 2 cột ngang hàng).
  2. Khối Ghi chú.
  3. Khối Thông báo.
- Khối con **Việc cần làm**: chỉ còn **việc 1 lần** (tên + ngày/giờ tuỳ chọn), **có theo dõi hoàn thành** (checkbox done), filter Tất cả/Chưa xong/Đã xong. (Đã tách "lặp lại" ra khối riêng — xem F22, F25.)
- Khối con **Nhắc việc** (trước là "Nhắc lặp lại"): định nghĩa nhắc nhở loại **1 lần** hoặc **lặp lại**, **KHÔNG theo dõi hoàn thành** (chỉ để nhắc, không phải việc cần làm) — xem F25.
- Khối con **Thói quen**: habit hiển thị streak liên tiếp + dãy chấm tròn 7 ngày, tick hoàn thành hôm nay, lưu theo ngày cụ thể (`completedDates`), có sửa/xoá.
- Khối **Ghi chú**: nhiều card **Note** (1 loại), mỗi card có **màu riêng tự chọn**, xếp masonry thật (JS đo chiều cao, không hở khoảng trống), có tìm kiếm + sắp xếp (thủ công/tên/mới sửa).
- Khối **Thông báo**: tự tổng hợp từ Việc cần làm + Nhắc việc + Thói quen; sắp xếp theo **giờ gần nhất lên trên**; mục mới nhất chưa xong được tô nổi bật + hiệu ứng nhẹ; liên kết 2 chiều với khối gốc (trừ Nhắc việc — chỉ đọc).
- **Nhiều Space**: tạo/đổi tên/xoá space, mỗi space có riêng đủ 5 khối dữ liệu trên; bố cục/theme/màu/ảnh nền dùng chung cho mọi space.
- Settings: theme (sáng/tối), màu chủ đạo, ảnh nền (header tự đổi tông theo ảnh nền đã chọn), **tỉ lệ kích thước các khối** + nút khôi phục mặc định, Export/Import JSON.
- Lưu trữ và đồng bộ dữ liệu qua `chrome.storage.sync`, fallback `chrome.storage.local` khi vượt quota.

**Ngoài phạm vi (đã hỏi và xác nhận KHÔNG làm):**
- Filter/gán theo người (Tôi/Vợ/Con...) ở khối Việc cần làm, Nhắc việc và Thói quen — bỏ hẳn, mọi item là của 1 người dùng duy nhất (trong 1 space).
- Đa người dùng thật (multi-account) / chia sẻ dữ liệu cho người khác — multi-**space** vẫn là 1 người dùng tự quản lý nhiều bộ dữ liệu, không phải multi-user.
- Đính kèm ảnh/file trong note.
- Markdown/rich text trong card Note.
- Kanban 4 cột (Backlog/Todo/Doing/Done) — đã bỏ từ vòng 6.
- Bố cục/theme riêng theo từng space — đã hỏi, xác nhận dùng chung 1 bộ cài đặt cho mọi space.
- Cỡ chữ tuỳ chỉnh trong Settings — đã thử (dùng `zoom`) rồi bỏ theo yêu cầu người dùng (vòng 20); cỡ chữ nền (baseline) đã được tăng lên 1 lần và giữ cố định.

> Ảnh "Cài đặt" gốc (ảnh 2) không phân tích lại theo yêu cầu — Settings vẫn giữ thiết kế đã chốt trước đó (theme/màu/ảnh nền/export-import) làm nền tham khảo.

## 4. Bố cục, resize & sắp xếp khối (F20, F21)
- **3 khối chính xếp ngang hàng** (1 hàng duy nhất):
  1. **Khối tổng hợp** (trái) — gồm **3 khối con**: **Việc cần làm** (trên, full chiều rộng của khối tổng hợp) và bên dưới là 1 hàng ngang chứa **Nhắc việc** + **Thói quen** (2 cột cạnh nhau). *(Đã đảo ngược từ mô hình 2 khối con ở vòng 6 — xem mục 23.)*
  2. **Ghi chú** (giữa).
  3. **Thông báo** (phải).
- **Resize qua Settings (F20)**: KHÔNG dùng kéo-thả splitter trực tiếp trên dashboard (đã thử, dễ lỗi/giật). Settings có mục "Bố cục" với slider/input số (%) cho:
  - Tỉ lệ chiều rộng 3 khối chính (khối tổng hợp / Ghi chú / Thông báo).
  - Tỉ lệ chiều cao của Việc cần làm so với hàng dưới (Nhắc việc + Thói quen).
  - Tỉ lệ chiều rộng Nhắc việc so với Thói quen trong hàng dưới.
  - Thay đổi áp dụng ngay (live preview), không cần bấm Lưu riêng.
  - Có nút **"Khôi phục mặc định"** để đặt lại toàn bộ tỉ lệ về giá trị gốc nếu chỉnh lỡ tay (F26, vòng 20).
- **Đổi thứ tự khối chính (F21)**: bấm-giữ vào phần header (`block-head`) của 1 trong 3 khối chính rồi kéo thả sang vị trí khác — không còn dòng nhãn/grip riêng phía trên khối (đã bỏ ở vòng 13), mỗi header có icon grip nhỏ mờ làm gợi ý.
- Tỉ lệ kích thước (cả cấp khối chính và khối con) + thứ tự khối chính là **cài đặt dùng chung cho mọi Space** (không đổi khi chuyển space) — lưu qua `chrome.storage`, áp dụng lại khi mở extension lần sau.
- Mỗi khối có vùng nội dung cuộn riêng nếu nội dung vượt chiều cao khối (không làm phình layout tổng).
- **Responsive (vòng 20)**: dưới 980px chiều rộng, 3 khối chính xếp dọc; dưới 640px, Nhắc việc/Thói quen trong khối tổng hợp cũng xếp dọc, Settings chuyển 1 cột.

## 5. Tính năng chi tiết

### 5.1 Khối Việc cần làm — F22 (đã tách lại, vòng 16)
> **F22 đã đổi nghĩa so với vòng 6**: lúc đó F22 gộp cả "1 lần" và "lặp lại" vào chung 1 khối. Đến vòng 16, người dùng nhận ra việc gộp gây nhập nhằng (1 lần cần theo dõi hoàn thành, lặp lại thì không cần) nên **tách "lặp lại" ra khối riêng** (F25 — Nhắc việc). F22 từ vòng 16 trở đi **chỉ còn nghĩa là việc 1 lần, có theo dõi hoàn thành**.

| # | Tính năng | Mô tả |
|---|---|---|
| F22a | Tạo việc | Tên + ngày/giờ tuỳ chọn — chỉ việc 1 lần, không có lựa chọn lặp lại (đã chuyển sang F25) |
| F22b | Danh sách + filter | Filter Tất cả / Chưa xong / Đã xong; mỗi dòng hiện ngày-giờ nếu có |
| F22c | Tick hoàn thành | Tick done/chưa done, giữ trạng thái — **có theo dõi hoàn thành thật** (khác F25 không theo dõi) |
| F22d | Sửa/xoá việc | Sửa tên/ngày-giờ hoặc xoá vĩnh viễn — xác nhận qua **modal tuỳ biến**, không dùng `confirm()` mặc định |
| F22e | Không filter theo người | Mọi việc thuộc 1 người dùng duy nhất (trong 1 space), không có tag/filter theo người (Tôi/Vợ/Con) |

### 5.2 Khối Ghi chú (card Note) — F1–F5, F11, F12, F15, F23, F28
> **F14 (card loại Task list) đã bỏ** — khối Todo/Việc cần làm đã đảm nhiệm việc quản lý task. Mỗi card trong khối Ghi chú chỉ có 1 loại: **Note**.

| # | Tính năng | Mô tả |
|---|---|---|
| F1 | Tạo card | Bấm "+ Thêm note" trong khối Ghi chú, đặt tên, chọn màu, tạo card Note |
| F2 | Sửa nội dung card | Click vào card để mở modal sửa nội dung note (textarea) + đổi màu |
| F3 | Đổi tên card | Sửa tên card bất kỳ lúc nào |
| F4 | Xoá card | Xoá vĩnh viễn card — xác nhận qua **modal tuỳ biến**, không dùng `confirm()`/alert mặc định của browser |
| F5 | Ẩn/hiện card | Toggle ẩn — card **giữ nguyên vị trí và tiêu đề**, chỉ thay phần nội dung bằng **placeholder có icon + chữ** ("Đã ẩn nội dung note này", đồng bộ cách trình bày với F24 ẩn khối) — không còn dùng dấu chấm "•••" hay chữ "(ẩn)" thêm vào tiêu đề (vòng 15) |
| F11 | Bố cục card trong khối — **masonry thật bằng JS** (vòng 17) | Card được đo chiều cao sau khi render và luôn chèn vào cột đang **thấp hơn** (giải thuật kiểu Pinterest thật), tránh khoảng hở lớn do CSS Grid/`column-count` ép các ô cùng hàng phải bằng chiều cao nhau (lỗi đã gặp ở các phương án trước: 1 cột dọc → CSS Grid `auto-fill` → JS masonry là phương án cuối); kéo (giữ đúng icon grip) để đổi **thứ tự** card, chỉ hoạt động khi đang sắp xếp "Thứ tự thủ công" (xem F28) |
| F12 | Định dạng nội dung | Plain text, dùng font hệ thống (system font), không hỗ trợ markdown/rich text trong MVP |
| F15 | **Mỗi card có màu riêng, tự chọn được** (đổi nghĩa ở vòng 18) | Khi tạo card mới, tự gán 1 màu xoay vòng theo bảng 6 màu (tím/xanh dương/xanh lá/cam/hồng/xám); người dùng có thể đổi màu trong modal sửa. Viền trái + badge "NOTE" lấy đúng màu đó; **nền card cũng nhuốm nhẹ theo màu đó** (~10% độ đậm) để vừa nổi bật vừa nhất quán giữa viền/nền/badge — đã thử nền trắng và nền xanh dương cố định cho mọi card trước đó nhưng đều bị nhận xét "chưa ổn"/"chìm"/"mâu thuẫn với mục đích phân biệt màu" |
| F23 | Hệ icon nhất quán | Toàn bộ icon trong UI dùng 1 bộ SVG line-icon tự vẽ (stroke-based, không dùng emoji hệ thống/mặc định của OS) |
| F28 | Tìm kiếm + sắp xếp (vòng 20) | Ô tìm kiếm theo tên/nội dung; dropdown sắp xếp: Thứ tự thủ công (mặc định, kéo-thả được) / Tên A-Z / Mới sửa gần nhất (theo `updatedAt`) |

### 5.3 Khối Nhắc việc — F25 (hồi sinh, đổi tên từ "Nhắc lặp lại", vòng 16+19)
> Lịch sử: bị gộp vào F22 ở vòng 6 → tách lại thành khối riêng "Nhắc lặp lại" ở vòng 16 (chỉ hỗ trợ lặp lại) → đổi tên thành **"Nhắc việc"** và bổ sung loại **1 lần** ở vòng 19, sau khi BA phân tích: khối này về bản chất là "định nghĩa nhắc nhở" (không cần biết đã làm hay chưa), nên hợp lý hơn khi hỗ trợ cả nhắc 1 lần và nhắc lặp lại, không chỉ lặp lại.

| # | Tính năng | Mô tả |
|---|---|---|
| F25a | Tạo nhắc việc | Chọn loại: **1 lần** (tên + ngày + giờ tuỳ chọn) hoặc **Lặp lại** (tên + chu kỳ "Mỗi [N] [đơn vị]" — Giờ/Ngày/Tháng, N≥1; nếu đơn vị Tháng có thêm **chọn ngày trong tháng** (1–31); nếu đơn vị Ngày/Tháng có thêm **giờ trong ngày tuỳ chọn**; đơn vị Giờ không cần giờ cụ thể) |
| F25b | KHÔNG có trạng thái hoàn thành | Khác hẳn F22 (Việc cần làm) — Nhắc việc chỉ để nhắc, không có checkbox/done, không tick được ở đây |
| F25c | Sửa/xoá | Sửa lại loại/tên/ngày-giờ-chu kỳ, hoặc xoá — xác nhận qua modal tuỳ biến |
| F25d | Không filter theo người | Giống F22e |

### 5.4 Khối Thói quen — F18
| # | Tính năng | Mô tả |
|---|---|---|
| F18a | Habit + dãy chấm 7 ngày | Mỗi habit hiển thị 7 chấm tròn tương ứng 7 ngày gần nhất, tick hoàn thành hôm nay |
| F18b | Streak liên tiếp | Đếm số ngày **liên tiếp** hoàn thành tính từ hôm nay lùi về trước — hiển thị dạng pill "🔥 N ngày liên tiếp"; 7 ngày gần nhất hiển thị dạng **dãy chấm tròn nhỏ** (chấm tô màu = đã hoàn thành, chấm rỗng = chưa), chấm hôm nay có viền nhấn nhẹ, tên ngày (T2–CN) hiện qua tooltip khi hover |
| F18c | Lưu theo ngày cụ thể (`completedDates`) | Mỗi lần tick được lưu là 1 chuỗi ngày (yyyy-mm-dd) vào danh sách `completedDates`, KHÔNG dùng cờ `doneToday: true/false` đơn lẻ — lý do: nếu chỉ dùng cờ true/false, app không biết được "đã qua bao nhiêu chu kỳ chưa tick" khi người dùng không mở app vài ngày, dẫn đến hiển thị sai (vẫn báo "đã xong" dù đã bỏ lỡ nhiều ngày). Ngày nào không có trong danh sách = chưa hoàn thành ngày đó |
| F18d | Sửa/xoá thói quen | Sửa tên hoặc xoá vĩnh viễn (xác nhận qua modal tuỳ biến) |

### 5.5 Khối Thông báo (trước đây gọi "Nhắc việc" — tên đó nay thuộc về F25) — F19
| # | Tính năng | Mô tả |
|---|---|---|
| F19a | Tổng hợp tự động | Liệt kê: việc 1 lần có ngày = hôm nay (từ F22), nhắc việc 1 lần/lặp lại (từ F25), habit chưa hoàn thành hôm nay (F18) |
| F19b | Đánh dấu "Xong" không ẩn | Bấm "Xong" (chỉ áp dụng cho mục từ F22/F18) chỉ đổi UI trạng thái (gạch ngang, đổi màu mờ) — **mục vẫn hiển thị trong danh sách**, không bị xoá |
| F19c | Liên kết 2 chiều với khối gốc | Đánh dấu Xong ở Thông báo cho mục từ Việc cần làm/Thói quen → tự cập nhật trạng thái done ở khối gốc, và ngược lại |
| F19d | **Mục từ Nhắc việc (F25) KHÔNG có nút "Xong"** (vòng 19) | Vì F25 không có khái niệm hoàn thành — mục này trong Thông báo chỉ để đọc, hiển thị bằng chấm màu riêng (xanh ngọc) để phân biệt với mục có thể tick |
| F19e | **Sắp xếp theo giờ gần nhất + nổi bật mục mới (vòng 18)** | Mục có giờ cụ thể được sắp xếp **giảm dần theo giờ** (gần nhất lên đầu); mục không có giờ rõ ràng (nhắc lặp lại theo giờ, habit) xếp sau. Mục đầu tiên **chưa xong** trong danh sách đã sắp xếp được tô nổi bật (nền nhấn nhẹ + hiệu ứng pulse + nhãn "Mới") để dễ nhận biết ngay |

### 5.6 Settings & lưu trữ — F6–F10, F13, F26
| # | Tính năng | Mô tả |
|---|---|---|
| F6 | Settings — Theme | Chọn giao diện Sáng / Tối |
| F7 | Settings — Màu chủ đạo | Chọn 1 trong bảng màu có sẵn, áp dụng cho accent UI |
| F8 | Settings — Ảnh nền (đổi cách header phản ứng, vòng 21) | Đóng gói sẵn vài gradient/màu cố định (không tải ảnh từ internet). Khi chọn 1 gradient, **header đổi sang 1 màu pastel nhạt lấy theo tông gradient đó** (đặc, không trong suốt) để đồng bộ với nền trang — đã thử để header trong suốt cho gradient gốc lộ thẳng ra nhưng bị nhận xét "không ổn" (mất kiểm soát tương phản/độ rực), nên đổi sang cách "rút tông màu" có kiểm soát này; đổi theo cả theme sáng/tối |
| F9 | Đồng bộ dữ liệu | Toàn bộ dữ liệu các khối (theo từng space) + settings dùng chung lưu qua `chrome.storage.sync`, tự đồng bộ giữa các máy đăng nhập cùng Chrome account |
| F10 | Fallback lưu trữ | Khi dữ liệu vượt quota `sync` (~100KB tổng / 8KB mỗi item / 512 item), hiện cảnh báo cho người dùng (không tự âm thầm chuyển sang local) |
| F13 | Export / Import dữ liệu | Trong Settings: nút Export xuất toàn bộ dữ liệu (mọi space + settings) ra file `.json`; nút Import đọc file `.json` để khôi phục |
| F26 | Khôi phục bố cục mặc định (vòng 20) | Nút trong mục "Bố cục" đặt lại toàn bộ tỉ lệ % các khối về giá trị gốc, không cần chỉnh tay từng slider nếu lỡ kéo sai |

> **Đã thử rồi bỏ — Cỡ chữ tuỳ chỉnh**: từng thêm 1 slider "Cỡ chữ/kích thước UI" dùng CSS `zoom` để co giãn toàn bộ UI theo tỉ lệ; người dùng sau đó yêu cầu bỏ tính năng này (vòng 20) vì cỡ chữ mặc định ban đầu quá nhỏ nên không cần chỉnh thêm — đã **tăng cỡ chữ nền (baseline) lên 1 lần cố định** (vd. 12.5px→14px ở nội dung chính) thay cho việc có slider điều chỉnh.

### 5.7 Bố cục & sắp xếp — F20, F21, F24, F27
| # | Tính năng | Mô tả |
|---|---|---|
| F20 | Resize qua Settings | Mục "Bố cục" trong Settings có slider/input % cho tỉ lệ các khối; áp dụng ngay khi chỉnh, không dùng kéo-thả splitter trực tiếp |
| F21 | Đổi thứ tự khối chính | Bấm-giữ vào phần header (`block-head`) của khối chính rồi kéo thả để đổi vị trí ngang giữa 3 khối, thứ tự được lưu lại |
| F24 | Ẩn/hiện nội dung khối (5 khối con: Việc cần làm, Nhắc việc, Thói quen, Ghi chú, Thông báo) — **đổi cơ chế ở vòng 15** | ~~Bản đầu: khối co lại thành dải nhỏ~~ — sau phản hồi "nhìn kỳ quá" đã đổi sang: **giữ nguyên kích thước khối**, chỉ thay phần `block-body` bằng 1 placeholder căn giữa (icon mắt-gạch + chữ "Đã ẩn nội dung [tên khối]"), các nút phụ (filter/+Thêm) cũng ẩn theo. Cách này tránh layout bị lệch/trống bất thường so với bản co dải đầu tiên |
| F27 | Nút "Ẩn tất cả" / "Hiện tất cả" trên header (vòng 15) | 1 nút ở header app, bấm 1 lần ẩn nội dung cả 5 khối con cùng lúc (dùng lại F24); nhãn nút tự đổi qua lại "Ẩn tất cả" ↔ "Hiện tất cả" theo trạng thái hiện tại, tự đồng bộ nếu người dùng ẩn/hiện từng khối riêng lẻ bằng tay |

### 5.8 Hoàn thiện UI/UX & khả năng tiếp cận (vòng 20)
| # | Tính năng | Mô tả |
|---|---|---|
| F29 | Accessibility cho nút chỉ-có-icon | Mọi nút chỉ có icon (sửa/xoá/ẩn-hiện/grip/swatch màu/ảnh nền) có `title` + `aria-label`; checkbox tuỳ biến (Việc cần làm, Thói quen) có `role="checkbox"` + `aria-checked` |
| F30 | Hiệu ứng chuyển động nhẹ | Resize khối qua Settings có transition mượt (~0.15s); kéo-thả đổi thứ tự khối/card có hiệu ứng mờ dần (opacity) khi đang kéo, viền nhấn (outline) khi thả vào đúng vị trí |
| F31 | Click ra ngoài modal để đóng | Bấm vào vùng nền tối (không phải vào nội dung modal) của BẤT KỲ modal nào trong app sẽ tự đóng modal đó, tương đương bấm "Hủy" |

### 5.9 Space — nhiều không gian làm việc riêng biệt (F32, mới nhất — vòng 22)
> Yêu cầu gốc: "sẽ có nhiều space, mỗi space có nội dung khác nhau, ví dụ Space cá nhân (nhắc việc, việc cần làm cá nhân) và Space công ty (nhắc việc, việc cần làm công ty), chuyển đổi qua lại được". Sau khi BA làm rõ phạm vi, đã chốt: **toàn bộ 5 khối dữ liệu** tách riêng theo space (không chỉ Việc cần làm/Nhắc việc), còn **bố cục/theme/màu/ảnh nền dùng chung** cho mọi space.

| # | Tính năng | Mô tả |
|---|---|---|
| F32a | Mỗi Space có riêng đủ 5 khối dữ liệu | Việc cần làm, Nhắc việc, Thói quen, Ghi chú — tách biệt hoàn toàn theo từng space; khối Thông báo tự tính lại theo dữ liệu của space đang active (không lưu riêng) |
| F32b | Dropdown chuyển đổi Space | Đặt cạnh logo "KN-Space" ở header; hiện tên space đang chọn + icon mũi tên; bấm mở danh sách các space, click 1 space để chuyển ngay (re-render toàn bộ 5 khối theo dữ liệu space đó) |
| F32c | Tạo / đổi tên / xoá Space | Trong dropdown: "+ Thêm space mới" (modal nhập tên); icon sửa để đổi tên; icon xoá (modal xác nhận, hiển thị rõ sẽ mất toàn bộ dữ liệu 4 khối của space đó) — **chặn xoá nếu chỉ còn 1 space** (luôn phải có ít nhất 1 space) |
| F32d | Bố cục/theme dùng chung | Tỉ lệ kích thước khối, thứ tự khối, theme sáng/tối, màu chủ đạo, ảnh nền — **không đổi** khi chuyển qua space khác (đã hỏi và xác nhận, không lưu riêng theo từng space để giảm phức tạp) |
| F32e | Reset trạng thái UI tạm thời khi chuyển space | Khi chuyển space: filter "Việc cần làm" về lại "Tất cả", ô tìm kiếm + sắp xếp Ghi chú reset về rỗng/"Thứ tự thủ công" — tránh hiểu lầm dữ liệu "biến mất" do filter của space cũ còn áp dụng |

## 6. Ràng buộc kỹ thuật
- Chrome Extension **Manifest V3**.
- Stack: **React + Vite**.
- Lưu trữ: `chrome.storage.sync` (chính), `chrome.storage.local` (fallback khi vượt quota, có cảnh báo).
- Permission tối thiểu cần: `storage`. Không xin permission ngoài phạm vi cần dùng.
- Giao diện chính chạy ở **trang riêng full-tab** (mở qua `chrome.tabs.create`, hoặc thay thế New Tab Page), không dùng popup nhỏ — để đủ không gian cho layout 3 khối chính (mục 4). Icon extension trên toolbar dùng để mở/focus tab này.
- Cần logic tính toán **thời gian/chu kỳ** ở client (so sánh ngày/giờ hiện tại với việc 1 lần ở F22/F25, chu kỳ+giờ+ngày-trong-tháng của nhắc lặp lại, ngày hôm nay của habit) để khối Thông báo (F19) tổng hợp và **sắp xếp theo giờ gần nhất** (F19e) đúng — không cần cron/server.
- State các khối có quan hệ tham chiếu (Thông báo tham chiếu dữ liệu Việc cần làm + Nhắc việc + Thói quen) — cần thiết kế model dữ liệu rõ ràng để tránh đồng bộ lệch khi cập nhật 2 chiều (F19c); riêng dữ liệu từ Nhắc việc (F25) không cần đồng bộ 2 chiều vì không có trạng thái done.
- Layout cần model 2 cấp: thứ tự + tỉ lệ của 3 khối chính, và tỉ lệ của các khối con bên trong khối tổng hợp — lưu riêng trong `chrome.storage`, chỉnh qua Settings UI, **dùng chung cho mọi Space** (F32d), không qua kéo-thả splitter trực tiếp (F20, F21).
- **Model dữ liệu Space (F32)**: cấu trúc dạng `{ spaces: [{ id, name, tasks, reminderItems, habits, noteCards }], currentSpaceId }`. Khi chuyển space, toàn bộ state 4 mảng (tasks/reminderItems/habits/noteCards) phải được thay thế bằng dữ liệu của space mới và re-render lại cả 5 khối; cần đồng bộ cẩn thận để tránh tình trạng sửa dữ liệu ở 1 mảng (sau khi reassign biến, vd. filter ra mảng mới) mà quên ghi lại vào đúng object space đang chứa nó — nên ưu tiên 1 hàm "đồng bộ về space hiện tại" gọi lại trước mỗi lần render, thay vì rải logic ghi-lại ở từng nơi.
- **Bài học kỹ thuật về kéo-thả (drag & drop) lồng nhau**: khi 1 khối cha và phần tử con bên trong nó (vd. card Ghi chú) đều có thể kéo-thả độc lập, sự kiện `dragstart`/`dragend` của phần tử con sẽ **nổi bọt (bubble)** lên khối cha và kích hoạt nhầm listener của khối cha nếu không kiểm tra `event.target === phần tử đang lắng nghe`. Lỗi này từng khiến cả khối Ghi chú bị mờ đi khi chỉ kéo 1 card bên trong — cách khắc phục đúng là luôn kiểm tra `e.target` trước khi xử lý logic kéo-thả ở cấp cha.

### Độ tin cậy / rủi ro mất dữ liệu của `chrome.storage.sync`
- Dữ liệu được Google đồng bộ qua tài khoản Chrome đăng nhập — về bản chất khá bền (tương tự bookmark/extension settings khác), nhưng KHÔNG phải backup vô hạn:
  - Nếu người dùng gỡ extension → toàn bộ dữ liệu storage của extension đó (kể cả sync) **bị xoá**.
  - Nếu tài khoản Google bị xoá/khoá, hoặc người dùng "Xoá dữ liệu duyệt web" có chọn mục liên quan đến extension, dữ liệu có thể mất.
  - Giới hạn dung lượng (100KB tổng) — nếu cố ghi vượt quota, Chrome từ chối ghi và báo lỗi `QUOTA_BYTES` thay vì mất dữ liệu cũ, nhưng phần mới sẽ không được lưu nếu không xử lý fallback.
  - Đồng bộ có độ trễ vài giây, không realtime tức khắc giữa các máy.
- Để giảm rủi ro: nên có chức năng **xuất/nhập dữ liệu (export/import JSON)** thủ công làm backup — đề xuất thêm vào MVP, xem câu hỏi mở #7.

## 7. Tiêu chí "gọn nhẹ"
- Bundle JS sau build nhắm dưới ~200KB (chưa gzip) — tăng nhẹ so với mốc cũ (150KB) do scope lớn hơn (5 khối thay vì chỉ card note), vẫn ưu tiên tối giản dependency.
- Không thêm state management library nặng (Redux, v.v.) — dùng React state/context là đủ cho quy mô MVP. Nếu cần thư viện splitter/resize, chọn 1 lib nhỏ (vd. `re-resizable`/tự viết bằng pointer events) thay vì framework layout lớn.
- Không thêm dependency UI framework lớn (Material UI, Ant Design) — tự viết CSS nhẹ hoặc dùng utility CSS tối giản.
- Không cần backend/server riêng — toàn bộ chạy client-side qua Chrome storage API, tính toán ngày/giờ/chu kỳ bằng JS thuần (không cần thư viện date nặng như moment.js).

## 8. Quyết định đã chốt (từ câu hỏi mở vòng 1)
1. **Định dạng nội dung:** plain text, font hệ thống — không markdown/rich text trong MVP. → F12.
2. **Đồng bộ:** xác nhận chỉ cần chung 1 Google account (Chrome Sync), không cần tài khoản/server riêng. Rủi ro mất dữ liệu: xem phân tích ở mục 5 — chấp nhận rủi ro ở mức "tương đương extension khác", khuyến nghị thêm export/import JSON làm backup (xem câu hỏi mở #7 dưới).
3. **Sắp xếp card:** bố cục masonry kiểu Pinterest (card trái/phải/dưới theo chiều cao nội dung), kéo để đổi vị trí, vị trí lưu lại. → F11.
4. **Card ẩn:** giữ nguyên vị trí trong layout, chỉ ẩn title + nội dung, phân biệt bằng màu/style. → F5 (đã cập nhật).
5. **Giới hạn dung lượng:** không chặn cứng, khi đạt/gần đạt quota `chrome.storage.sync` thì hiện cảnh báo cho người dùng. → F10 (đã cập nhật).

## 9. Quyết định đã chốt (từ câu hỏi mở vòng 2)
6. **Không gian UI:** mở extension thành **trang riêng full-tab** (`chrome.tabs.create`, hoặc thay New Tab Page) — không dùng popup nhỏ chuẩn. → cập nhật ràng buộc kỹ thuật ở mục 6.
7. **Backup dữ liệu:** thêm tính năng **Export/Import JSON** vào MVP (xuất toàn bộ dữ liệu + settings ra file `.json`, đọc lại để khôi phục) — đặt trong Settings. → F13.
8. **Lưu vị trí card trong khối Ghi chú:** chỉ lưu **thứ tự (order index)**, không lưu toạ độ tuyệt đối. → F11.

> Quyết định #6 ở vòng 2 ban đầu gắn với lý do "đủ không gian cho masonry toàn trang" — nay vẫn giữ full-tab nhưng lý do cập nhật thành "đủ không gian cho layout 5 khối" (mục 4).

## 10. Quyết định đã chốt (từ câu hỏi mở vòng 3 — pivot sang dashboard 5 khối)
9. **Bố cục khối:** giữ cấu trúc 2 tầng giống ảnh gốc — tầng trên Todo + Nhắc việc, tầng dưới Nhắc lặp lại + Thói quen + Ghi chú. → mục 4.
10. **Cơ chế resize:** kéo thanh chia (splitter) giữa 2 khối liền kề, khối liền kề tự co/giãn theo, tổng kích thước luôn khớp viewport. → F20.
11. **Khối Ghi chú:** vẫn giữ nhiều card Note/Task list (F1–F5, F11–F15), chỉ thu nhỏ lại trong khối cố định, cuộn dọc khi nhiều card.
12. **Ngày/giờ task Todo:** mỗi task có ngày/giờ tuỳ chọn, dùng làm nguồn dữ liệu cho khối Nhắc việc. → F16b, F19a.
13. **Filter theo người:** bỏ hẳn ở khối Nhắc lặp lại và Thói quen — không cần multi-user, mọi item thuộc 1 người dùng. → F17c.
14. **Hành vi "Xong" ở Nhắc việc:** không ẩn khỏi danh sách, chỉ đổi trạng thái UI (vd. gạch ngang); có liên kết 2 chiều với khối gốc (Nhắc lặp lại/Thói quen) — tick ở đâu cũng đồng bộ trạng thái done sang nơi khác. → F19b, F19c.

Tất cả câu hỏi mở (3 vòng) đã được xác nhận — requirements sẵn sàng cho bước thiết kế UI lại (agent `uiux`) theo layout 5 khối mới.

## 11. Cập nhật vòng 4
15. **Bỏ card loại Task list trong khối Ghi chú:** vì khối Todo đã đảm nhiệm quản lý việc cần làm, card trong khối Ghi chú chỉ còn 1 loại — **Note**. → F14 bị loại bỏ, F1/F2/F15 cập nhật lại ở mục 5.2.

## 12. Cập nhật vòng 5 — đổi bố cục thành 3 khối chính + đổi thứ tự
16. **Gộp Todo + Nhắc lặp lại + Thói quen thành 1 khối tổng hợp** xếp dọc, đặt cố định bên trái. → mục 4, mục 5.1/5.3/5.4 giữ nguyên nội dung con.
17. **Đổi tên "Nhắc việc" → "Thông báo"** — chỉ đổi tên hiển thị, hành vi F19a/b/c giữ nguyên. → mục 5.5.
18. **Thêm khả năng đổi thứ tự 3 khối chính** (khối tổng hợp / Ghi chú / Thông báo) bằng kéo-thả header, ngoài việc resize đã có. → F21 (mới), mục 5.7.
19. **Bố cục đổi từ 2 tầng sang 1 hàng 3 khối chính** — quyết định #9 ở vòng 3 (mục 10) bị thay thế bởi quyết định #16/#18 này.

## 13. Cập nhật vòng 6 — gộp Việc cần làm, thêm giờ cho lặp lại, resize qua Settings
20. **Gộp Todo + Nhắc lặp lại thành 1 khối "Việc cần làm"**, bỏ Kanban 4 cột, dùng danh sách phẳng + filter Tất cả/Chưa xong/Đã xong. Lý do: 2 khối cũ có chức năng quá giống nhau (cùng là "việc cần làm", chỉ khác có lặp lại hay không). → F22 (mới), thay thế F16 + F17. Khối tổng hợp bên trái giờ chỉ còn 2 khối con (Việc cần làm + Thói quen) thay vì 3.
21. **Việc lặp lại có thêm trường giờ tuỳ chọn** (vd. "Mỗi ngày lúc 07:00") bên cạnh chu kỳ. → F22a.
22. **Đổi cơ chế resize (F20) từ kéo-thả splitter trực tiếp sang điều khiển trong Settings** (slider/input %) vì kéo-thả splitter thực tế bị lỗi/giật khi nhiều khối liên động co giãn theo nhau. Đổi thứ tự khối (F21) vẫn giữ kéo-thả vì không gặp vấn đề tương tự.

## 14. Cập nhật vòng 7 — nâng cấp UI, bỏ icon emoji mặc định
23. **Thay toàn bộ icon emoji (📋🔥✅🔔📝⠿✎✕◐📌🔁☀🌙⬇⬆) bằng 1 bộ SVG line-icon tự vẽ** (stroke-based, 24x24, nhất quán độ dày nét) — lý do: emoji hệ thống render khác nhau theo OS/font, trông "mặc định"/đơn điệu, không chuyên nghiệp cho 1 dashboard cá nhân. → F23 (mới).
24. **Bổ sung polish UI tổng thể** để giảm cảm giác đơn điệu: mỗi khối có icon-chip màu riêng (Việc cần làm = xanh, Thói quen = cam, Ghi chú = tím, Thông báo = hồng), card/khối có shadow nhẹ thay vì chỉ viền phẳng, checkbox tuỳ biến (không dùng checkbox input mặc định của OS), nút/tag có trạng thái hover rõ ràng.

## 15. Cập nhật vòng 8 — chu kỳ lặp lại linh hoạt theo giờ
25. **Chu kỳ việc lặp lại đổi từ danh sách cố định (mỗi ngày/2 ngày/tháng) sang dạng "Mỗi [N] [đơn vị]"** với đơn vị chọn được **Giờ / Ngày / Tháng** và N là số tuỳ chỉnh ≥1 — đáp ứng nhu cầu lặp theo giờ (mỗi giờ, mỗi 3 giờ, mỗi 6 giờ...) ngoài lặp theo ngày/tháng như trước. → F22a cập nhật.
26. **Trường giờ trong ngày chỉ hiển thị khi đơn vị là Ngày hoặc Tháng** — đơn vị Giờ không cần giờ cụ thể vì bản chất là khoảng lặp tương đối tính từ thời điểm tạo/lần hoàn thành gần nhất, không gắn với 1 mốc giờ cố định trong ngày.

## 16. Cập nhật vòng 9 — bỏ confirm() mặc định khi xoá
27. **Xác nhận xoá (card Note, việc cần làm) đổi từ `window.confirm()` mặc định của browser sang modal tuỳ biến** cùng style với modal sửa (tiêu đề + mô tả + nút Hủy/Xoá màu cảnh báo) — alert mặc định trông không đồng bộ với giao diện đã thiết kế. → F4, F22d cập nhật.

## 17. Cập nhật vòng 10 — sửa cách hiển thị streak Thói quen
28. **Streak đổi từ "tổng số ô tick trong 7 ngày" sang "số ngày liên tiếp tính từ hôm nay lùi về trước"** — cách tính cũ gây hiểu lầm vì số hiển thị không khớp với phần cuối dãy 7 ô (vd. ô cuối tuần trống nhưng vẫn cộng các ô tick rải rác ở giữa). → F18b cập nhật.
29. **Thêm nhãn ngày (T2–CN) dưới mỗi ô tuần + icon check trong ô đã hoàn thành + viền nhấn ô hôm nay** — giúp người dùng đọc đúng ý nghĩa của dãy 7 ô mà không cần đoán, giải quyết phản hồi "hiển thị lộn xộn".

## 18. Cập nhật vòng 11 — thử rồi bỏ phong cách Duolingo
30. **Đã thử phong cách Duolingo** (màu bão hoà cao, viền dày + đổ bóng đáy) cho toàn bộ UI, sau đó thu hẹp chỉ áp dụng cho khối Thói quen — cuối cùng người dùng quyết định **bỏ hẳn, không hợp** với tổng thể sản phẩm. → Toàn bộ UI (kể cả khối Thói quen) quay lại đúng giao diện trung tính của vòng 10 (viền 1px mỏng, shadow nhẹ `--shadow`, màu pastel, checkbox/ô tuần/streak-pill dùng style phẳng nhẹ nhàng như trước khi thử Duolingo). Không có thay đổi tính năng, chỉ là quyết định cuối cùng về ngôn ngữ thiết kế: **không dùng phong cách Duolingo ở bất kỳ phần nào**.

## 19. Cập nhật vòng 12 — đổi cách thể hiện 7 ngày của Thói quen
31. **Lưới ô-vuông + nhãn ngày dưới mỗi ô bị lỗi hiển thị** (ô bị kéo giãn thành hình chữ nhật do flexbox phân bổ khoảng trống giữa các cột `justify-content: space-between`) — đã thử vá bằng `flex: 0 0 auto`/`min-width`/`max-width` nhưng người dùng vẫn thấy chưa ổn và muốn đổi hẳn cách thể hiện.
32. **Đổi sang dãy chấm tròn nhỏ (`week-dot`)** thay cho lưới ô vuông có nhãn: 7 chấm tròn 13px nằm trên 1 dòng, chấm tô màu cam = đã hoàn thành, chấm viền xám = chưa, chấm của hôm nay có viền nhấn nhẹ (box-shadow vòng ngoài) — tên ngày (T2–CN) hiển thị qua `title` tooltip khi hover thay vì label cố định, giúp bố cục đơn giản, không còn cấu trúc cột dễ vỡ. → F18b cập nhật.

## 20. Cập nhật vòng 13 — bỏ dòng nhãn/grip phía trên mỗi khối chính
33. **Bỏ dòng label in hoa kèm icon grip phía trên mỗi khối chính** (vd. "VIỆC CẦN LÀM · THÓI QUEN", "GHI CHÚ", "THÔNG BÁO") — dòng này tạo cảm giác mất cân đối, đặc biệt ở khối tổng hợp (label ghép 2 tên khối con) so với 2 khối còn lại (label trùng tên với block-head bên dưới, gây trùng lặp). → F21 cập nhật: handle kéo-thả chuyển sang chính phần header (`block-head`) sẵn có của từng khối, không cần thêm dòng riêng.
34. **Đồng bộ gợi ý kéo-thả giữa cả 4 header con** (Việc cần làm, Thói quen, Ghi chú, Thông báo): thêm 1 icon grip nhỏ (mờ, không chữ) ngay trong header có sẵn của từng khối — thay cho phương án thêm dòng riêng (gây lệch độ dài text) hoặc bỏ hẳn gợi ý kéo-thả (giảm khả năng phát hiện tính năng F21). Đây là phương án cân bằng giữa đồng bộ thị giác và khả năng phát hiện thao tác.

## 21. Cập nhật vòng 14 — thêm tính năng ẩn/mở lại khối (F24)
35. **Thêm icon ẩn/hiện (con mắt) vào header của 4 khối con** (Việc cần làm, Thói quen, Ghi chú, Thông báo). Khi ẩn: khối co lại thành dải nhỏ cố định (≈46–56px), ẩn phần nội dung + nút phụ (filter/+Thêm), các khối còn lại **tự giãn lấp khoảng trống** nhờ cơ chế flexbox (không cần code tính lại tỉ lệ % của khối khác — chỉ khối bị ẩn có flex-basis cố định nhỏ, phần còn lại vẫn theo tỉ lệ flex-grow đã đặt ở F20). Dải nhỏ còn lại vẫn hiện icon-chip + nút mắt để bấm mở lại bất kỳ lúc nào — khối không biến mất hoàn toàn khỏi layout. → F24 (mới).

## 22. Cập nhật vòng 15 — sửa cơ chế ẩn khối, Thói quen có sửa/xoá, lưu theo ngày
36. **Cơ chế ẩn khối (F24) đổi ngay sau vòng 14** — bản "co thành dải nhỏ" bị nhận xét "nhìn kỳ quá". Đổi sang: **giữ nguyên kích thước khối**, chỉ thay `block-body` bằng placeholder căn giữa (icon + chữ "Đã ẩn nội dung..."). → F24 cập nhật, mục 5.7.
37. **Thêm sửa/xoá cho Thói quen** (trước đó chỉ có tạo + tick) — icon ✎/✕ hiện khi hover, xoá có modal xác nhận. → F18d (mới).
38. **Sửa lỗi lưu trạng thái Thói quen**: đổi từ cờ `doneToday: true/false` đơn lẻ sang lưu **danh sách ngày cụ thể đã hoàn thành** (`completedDates`) — lý do: cờ đơn lẻ không biết được đã bỏ lỡ bao nhiêu ngày nếu không mở app liên tục, dẫn đến hiển thị sai trạng thái. → F18c (mới).
39. **Thêm icon ẩn/hiện toàn bộ ("Ẩn tất cả" / "Hiện tất cả") trên header app** — ẩn nội dung cả 5 khối con cùng lúc bằng 1 nút, dùng lại cơ chế F24; nhãn nút tự đồng bộ theo trạng thái thực tế (kể cả khi người dùng ẩn/hiện từng khối riêng lẻ). → F27 (mới).

## 23. Cập nhật vòng 16 — tách "Nhắc lặp lại" khỏi "Việc cần làm" (đảo ngược quyết định vòng 6)
40. **Nhận ra việc gộp Todo + Nhắc lặp lại ở vòng 6 (F22) gây nhập nhằng**: việc 1 lần cần theo dõi hoàn thành (checkbox done có ý nghĩa thật), còn việc lặp lại theo người dùng chỉ cần **nhắc**, không cần biết đã làm hay chưa — dùng chung 1 checkbox cho 2 khái niệm khác bản chất là sai. → Quyết định **tách lại thành khối riêng**: "Việc cần làm" (chỉ 1 lần, có done) và "Nhắc lặp lại" (chỉ lặp lại, KHÔNG có done/checkbox nào). Khối tổng hợp bên trái quay lại **3 khối con** (đã từng có ở vòng 5, nhưng nay với nội dung con khác — không phải Todo Kanban nữa). → F22 đổi nghĩa (chỉ còn 1 lần), F25 ra đời thay cho phần "lặp lại" đã tách.
41. **Nút "Xong" trong Thông báo cho mục Nhắc lặp lại bị bỏ hẳn** (đã từng cân nhắc "tạm ẩn tới chu kỳ sau" nhưng người dùng chốt bỏ thẳng nút) — mục thuộc Nhắc lặp lại trong Thông báo chỉ đọc, không tương tác. → F19d (mới).
42. **Bố cục khối tổng hợp**: ban đầu thử kính mờ (`backdrop-filter`) cho nền các khối để màu/gradient nền trang lộ rõ hơn qua khối — bị nhận xét "xấu quá", **bỏ ngay**, quay lại nền đặc như trước. Đồng thời đổi cách xếp 3 khối con: **Việc cần làm full chiều rộng ở trên, Nhắc lặp lại + Thói quen nằm ngang nhau ở dưới** (không xếp dọc 3 khối như thử ban đầu). → mục 4.

## 24. Cập nhật vòng 17 — Ghi chú: sửa lỗi kéo-thả, đổi layout masonry, thêm tìm kiếm/sắp xếp
43. **Sửa lỗi kéo card làm mờ cả khối Ghi chú**: do sự kiện `dragstart` của card nổi bọt lên khối cha (vốn cũng đang nghe sự kiện kéo để đổi thứ tự khối chính F21), khiến khối cha hiểu nhầm là đang bị kéo. → Thêm kiểm tra `e.target === khối` ở mọi handler cấp khối cha; đồng thời `draggable` của khối chính giờ chỉ bật khi bấm-giữ đúng vào `block-head`, giúp bôi đen/copy nội dung card hoạt động lại bình thường (trước đó bị cả khối "draggable" đè mất khả năng chọn text).
44. **Layout card Ghi chú trải qua 3 phiên bản** để giải quyết đồng thời 2 yêu cầu trái nhau (thứ tự dễ đoán + không phí không gian ngang):
    - (a) 1 cột dọc — dễ đoán thứ tự nhưng card ngắn chiếm hết chiều ngang, phí không gian.
    - (b) CSS Grid `auto-fill` nhiều cột — đỡ phí không gian hơn, nhưng Grid ép các ô **cùng 1 hàng phải bằng chiều cao nhau**, gây khoảng hở lớn khi 1 card trong hàng dài hơn các card khác.
    - (c) **Masonry thật bằng JS** (cuối cùng, giữ lại) — đo `offsetHeight` từng cột sau khi chèn, luôn đưa card tiếp theo vào cột đang thấp hơn, không còn khoảng hở. → F11 cập nhật.
45. **Thêm tìm kiếm + sắp xếp** (Thứ tự thủ công / Tên A-Z / Mới sửa gần nhất) — kéo-thả đổi thứ tự chỉ khả dụng ở chế độ "Thứ tự thủ công" (icon grip ẩn khi đang ở 2 chế độ sắp xếp khác). → F28 (mới).
46. **Mỗi card Note có màu riêng, tự chọn được**: gán xoay vòng theo bảng 6 màu khi tạo mới, có thể đổi trong modal sửa (picker giống chọn màu chủ đạo ở Settings). Viền trái + badge + **nền card** đều theo đúng màu đó (nền nhuốm nhẹ ~10%). Đã thử 2 phương án nền cố định trước đó (trắng, rồi xanh dương nhạt) nhưng đều bị nhận xét UIUX là "chìm"/"chưa ổn"/"mâu thuẫn với mục đích phân biệt màu" — phương án nền theo màu riêng từng card là bản cuối, vừa nổi bật vừa nhất quán. → F15 đổi nghĩa.
47. **Card ẩn dùng placeholder đồng bộ với cách ẩn khối (F24)** — bỏ dấu chấm "•••" và chữ "(ẩn)" thêm vào tiêu đề, thay bằng icon + chữ "Đã ẩn nội dung note này", giữ tiêu đề card không đổi. → F5 cập nhật.
48. **Giảm spacing card** (padding/margin) cho gọn hơn theo phản hồi "spacing hơi nhiều".

## 25. Cập nhật vòng 18 — Thông báo: sắp xếp theo gần nhất + nổi bật mục mới
49. **Thông báo sắp xếp theo giờ gần nhất lên đầu** (mục có giờ cụ thể sắp giảm dần theo giờ; mục không có giờ rõ ràng như nhắc lặp lại theo giờ/habit xếp sau) — mục **đầu tiên chưa xong** trong danh sách đã sắp được tô nổi bật (nền nhấn nhẹ + hiệu ứng pulse + nhãn "Mới") để dễ nhận biết ngay không cần đọc hết danh sách. → F19e (mới).

## 26. Cập nhật vòng 19 — đổi "Nhắc lặp lại" thành "Nhắc việc"
50. **BA phân tích theo yêu cầu người dùng**: khối "Nhắc lặp lại" (tách ra ở vòng 16) về bản chất là "định nghĩa nhắc nhở", không có khái niệm hoàn thành — việc giới hạn nó chỉ hỗ trợ "lặp lại" là không cần thiết, vì nhắc nhở 1 lần (vd. "nhắc tôi gọi điện chúc mừng sinh nhật mẹ lúc 19h hôm nay") cũng hoàn toàn phù hợp với cùng bản chất đó, khác với "Việc cần làm" (luôn cần theo dõi hoàn thành). → Đổi tên khối thành **"Nhắc việc"**, thêm lựa chọn loại **1 lần** (ngày+giờ, không lặp) bên cạnh **Lặp lại** (như cũ); cả 2 loại đều KHÔNG có checkbox/done. → F25 (đổi tên + bổ sung loại, thay cho F17/"Nhắc lặp lại" cũ).
51. **Đổi tên toàn bộ id/biến/nhãn liên quan** trong code (vd. `reminderItems`, `sub-reminder`, slider Settings "Nhắc việc") để khớp tên mới, tránh nhầm lẫn khi đọc code về sau.

## 27. Cập nhật vòng 20 — hoàn thiện UI/UX & khả năng tiếp cận
52. Theo đề xuất tự rà soát của UIUX (5 điểm) — đã triển khai toàn bộ: **accessibility** (title/aria-label cho nút chỉ-có-icon, role="checkbox") (F29); **responsive** màn hình hẹp (mục 4); **nút khôi phục bố cục mặc định** (F26); **hiệu ứng chuyển động nhẹ** khi resize/kéo-thả (F30); **tìm kiếm + sắp xếp** cho Ghi chú (đã ghi ở vòng 17, F28).
53. **Thêm "click ra ngoài modal để đóng"** cho mọi modal trong app (không chỉ riêng Settings như yêu cầu ban đầu) — bấm vào nền tối quanh modal tương đương bấm Hủy. → F31 (mới).
54. **Thử thêm rồi bỏ slider "Cỡ chữ"** trong Settings (dùng CSS `zoom`) — sau khi cỡ chữ nền (baseline) đã được tăng lên 1 lần, người dùng thấy không cần thêm tuỳ chọn chỉnh nữa nên yêu cầu bỏ slider này, chỉ giữ lại baseline đã tăng.
55. **Thêm chọn ngày-trong-tháng cho Nhắc lặp lại/Nhắc việc** khi đơn vị chu kỳ là Tháng (vd. "Mỗi tháng (ngày 27)"). → F25a cập nhật.

## 28. Cập nhật vòng 21 — đổi tên ứng dụng thành "KN-Space"
56. **Đổi tên app từ "extensionNote" sang "KN-Space"** — theo yêu cầu gắn tiền tố "KN-", đã đề xuất 5 lựa chọn (KN-Hub, KN-Daily, KN-Space, KN-Flow, KN-Nest), người dùng chọn **KN-Space**. Đổi ở `<title>` trang và logo header.
57. **Header tự đổi tông màu theo ảnh nền đã chọn trong Settings** — trước đó thử để header trong suốt cho gradient gốc lộ thẳng ra (bị nhận xét "không ổn"), đổi sang dùng 1 màu pastel nhạt "rút tông" từ gradient, áp dụng theo cả theme sáng/tối. → F8 cập nhật.

## 29. Cập nhật vòng 22 — thêm tính năng nhiều Space (lớn nhất, mới nhất)
58. **Mở rộng theo yêu cầu**: "sẽ có nhiều space, mỗi space có nội dung khác nhau... có thể chuyển đổi qua lại giữa các space". BA làm rõ phạm vi qua 3 câu hỏi, chốt: **cả 5 khối** (không chỉ Việc cần làm/Nhắc việc) tách riêng theo space; **bố cục/theme dùng chung**; **dropdown switcher đặt cạnh logo**. → F32 (mới), mục 5.9.
59. **Demo sẵn 2 space** ("Cá nhân", "Công ty") với dữ liệu mẫu riêng biệt để minh hoạ; có thể tạo thêm, đổi tên, xoá (trừ khi chỉ còn 1 space).