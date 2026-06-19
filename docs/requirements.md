# Requirements — KN-Space (trước đây "extensionNote")

> **CHUYỂN SANG SHARED SPACE (vòng 24):** mô hình dữ liệu đảo ngược từ "mỗi user data riêng" sang **Space dùng chung kiểu Notion/Trello workspace** — người tạo Space **mời người khác qua email** để cùng dùng chung; **mọi thành viên ngang quyền** (xem/thêm/sửa/xoá mọi thứ, kể cả quản lý thành viên). Dữ liệu (notes/tasks/reminders/habits) giờ thuộc về **Space** (có `space_id`), quyền truy cập đi qua bảng **`space_members`**; RLS đổi từ `auth.uid() = user_id` sang "user là thành viên của space chứa dòng đó". Tính năng mời/quản lý thành viên build **NGAY GĐ1**. Đảo ngược câu hỏi mở #11. Xem mục 32 (vòng 24), mục 5.9 (F32), mục 5.11 (F36 mới), mục 6 (model dữ liệu + RLS), mục 6b (GĐ1 mở rộng).
> **PIVOT KIẾN TRÚC LỚN NHẤT (vòng 23):** sản phẩm chuyển **TỪ Chrome Extension (Manifest V3 + `chrome.storage.sync`) SANG PWA (React + Vite + vite-plugin-pwa) + Supabase** (Postgres + Auth + Realtime) làm nguồn dữ liệu duy nhất, chạy được trên cả desktop lẫn điện thoại qua 1 URL. Lý do: nhu cầu thật là **note nhanh trên điện thoại**, mà Chrome extension không chạy được trên Chrome mobile. Toàn bộ tính năng/UX sản phẩm (5 khối, đa Space, masonry, ẩn/hiện, streak, modal tuỳ biến, icon SVG...) **giữ nguyên**; chỉ đổi nền tảng kỹ thuật + storage, **thêm auth**, **thêm yêu cầu mobile responsive**, và **chia build theo 3 giai đoạn**. Xem mục 30 (vòng 23), mục 6 (ràng buộc kỹ thuật mới), mục 6b (phạm vi build theo giai đoạn).
> **Đổi tên ứng dụng (vòng 21):** từ "extensionNote" sang **"KN-Space"**. Xem mục 28.
> **Cập nhật lớn nhất về tính năng (vòng 22):** thêm tính năng **nhiều Space** (không gian làm việc riêng biệt, vd. "Cá nhân"/"Công ty"), mỗi Space có đủ riêng 5 khối dữ liệu, chuyển đổi qua dropdown cạnh logo. Xem mục 29 và mục 5.9.
> **Tách lại "Nhắc lặp lại" khỏi "Việc cần làm" (vòng 16)** — quyết định gộp ở vòng 6 (F22) đã bị **đảo ngược**: khối tổng hợp bên trái giờ có **3 khối con** (Việc cần làm / Nhắc việc / Thói quen) thay vì 2. Xem mục 23, mục 5.1, mục 5.3 (đã hồi sinh).

## 1. Mục tiêu
> **PIVOT nền tảng (vòng 23):** sản phẩm không còn là "Chrome extension" mà là **PWA web app** (React + Vite + Supabase) cài được trên desktop và điện thoại qua 1 URL. Mô tả "Chrome extension" / "đồng bộ giữa các máy dùng chung một tài khoản Chrome" bên dưới **đã bị thay thế** bởi "PWA + Supabase + đăng nhập tài khoản riêng" — xem mục 30 và mục 6. Mục tiêu sản phẩm (dashboard cá nhân 5 khối) **không đổi**.

> **Cập nhật phạm vi (vòng 3):** theo yêu cầu mới của người dùng, sản phẩm chuyển từ "ứng dụng note dạng card tự do" sang **dashboard cá nhân với 5 khối cố định**, lấy lại cấu trúc ảnh "Personal Tracker" gốc (ảnh 1), bỏ qua ảnh "Cài đặt" gốc (ảnh 2 — vẫn dùng ý tưởng cũ cho Settings, không phân tích lại). Quyết định ở mục 7/8 (Pinterest masonry toàn trang) bị **thay thế** bởi mục 4 dưới đây; các mục khác (Note/Task list card, Settings, sync, export/import) vẫn giữ nguyên nhưng card giờ nằm **trong khối Ghi chú**, không chiếm toàn trang.

> **Cập nhật bố cục (vòng 5):** đổi từ mô hình "2 tầng, 5 khối ngang hàng" sang **3 khối chính xếp ngang hàng**: (1) khối tổng hợp bên trái, (2) khối **Ghi chú**, (3) khối **Thông báo** (đổi tên từ "Nhắc việc"). 3 khối chính này resize được và **đổi thứ tự ngang được** (xem mục 4).

> **Cập nhật vòng 6 (mới nhất):**
> 1. **Gộp Todo + Nhắc lặp lại thành 1 khối duy nhất "Việc cần làm"** — bỏ Kanban 4 cột, thay bằng 1 danh sách đơn giản chứa cả việc 1 lần (có ngày/giờ) và việc lặp lại (có chu kỳ + giờ), filter Tất cả/Chưa xong/Đã xong. Khối tổng hợp bên trái giờ chỉ còn 2 khối con: **Việc cần làm** + **Thói quen** (không còn 3 khối con như vòng 5).
> 2. **Nhắc lặp lại có thêm trường giờ** (vd. "Mỗi ngày lúc 07:00"), không chỉ có chu kỳ.
> 3. **Đổi cơ chế resize từ kéo-thả splitter sang điều khiển trong Settings** (slider/input số) — kéo-thả splitter tự do bị lỗi/không ổn định, chuyển sang nhập tỉ lệ % rõ ràng cho từng khối trong Settings, áp dụng ngay.
>
> Các quyết định liên quan ở mục 10/12 (F16, F17, F20 bản cũ) bị thay thế bởi mục 13 dưới đây.

> **~~Bản trước vòng 23 (Chrome extension):~~** Xây dựng một Chrome extension cá nhân, gọn nhẹ, gồm 3 khối chính... lưu trữ và đồng bộ giữa các máy dùng chung một tài khoản Chrome. **→ đã thay thế bởi đoạn mục tiêu PWA dưới đây.**

> **Cập nhật mô hình dữ liệu (vòng 24):** cụm từ "gắn với **tài khoản đăng nhập của người dùng**" dưới đây được hiểu lại theo mô hình **shared space**: dữ liệu thuộc về **Space**, và một Space có thể được nhiều người dùng cùng truy cập (qua mời email). Người dùng vẫn đăng nhập tài khoản riêng để xác thực, nhưng dữ liệu họ thấy là dữ liệu của các Space mà họ là **thành viên**. Xem mục 32 + F36.

Xây dựng một **PWA (Progressive Web App) cá nhân**, gọn nhẹ, cài được trên cả desktop lẫn điện thoại qua 1 URL (add-to-homescreen trên mobile), gồm 3 khối chính: **khối tổng hợp** (Việc cần làm + Nhắc việc + Thói quen), **Ghi chú** (nhiều card Note có màu riêng), **Thông báo** (tự tổng hợp nhắc nhở từ khối tổng hợp, sắp xếp theo thời gian gần nhất). Người dùng chỉnh kích thước từng khối qua **Settings** (nhập % hoặc kéo slider) và **đổi thứ tự 3 khối chính** bằng kéo-thả; bố cục/theme/màu/ảnh nền là cài đặt **dùng chung cho toàn app**. Người dùng có thể tạo **nhiều Space** (không gian làm việc, vd. Cá nhân/Công ty), mỗi Space có đủ riêng cả 5 khối dữ liệu, chuyển đổi qua dropdown cạnh logo; một Space có thể **chia sẻ cho nhiều người** qua mời email, mọi thành viên ngang quyền (vòng 24). Dữ liệu lưu trên **Supabase (Postgres)** theo từng **Space** (truy cập qua membership), đồng bộ tức thời giữa desktop và điện thoại; hoạt động **offline-first** (ghi local trước, đẩy lên Supabase ngầm).

## 2. Đối tượng dùng
> **PIVOT (vòng 23):** đối tượng cốt lõi là **người cần note nhanh trên điện thoại** (động lực chính của pivot), dùng cùng dữ liệu trên cả điện thoại lẫn desktop qua 1 web app. Quy mô **1-2 người dùng cố định** (cá nhân + có thể vợ/chồng) — KHÔNG phải SaaS công khai cho người lạ. Mô tả "dùng Chrome trên nhiều máy / chấp nhận giới hạn đồng bộ của Chrome" bên dưới đã không còn đúng.
> **Mở rộng (vòng 24):** với shared space, đối tượng gồm **nhóm nhỏ vài người cùng dùng chung 1 Space** (vd. gia đình, cặp đôi, nhóm bạn nhỏ) chứ không chỉ 1 cá nhân — nhưng vẫn là **nhóm tin cậy do người tạo Space chủ động mời**, KHÔNG phải SaaS công khai cho người lạ tự đăng ký vào space.

~~Cá nhân dùng Chrome trên nhiều máy (nhà/công ty/laptop khác), cần một dashboard cá nhân gọn để quản lý task, note, việc lặp lại và thói quen, không muốn cài app riêng hay phụ thuộc server ngoài, chấp nhận giới hạn đồng bộ của Chrome.~~ **→ thay bằng:** Cá nhân (và một nhóm nhỏ người thân/được mời) cần một dashboard gọn để quản lý task, note, việc lặp lại và thói quen, **truy cập từ cả điện thoại lẫn desktop** qua 1 URL; ưu tiên thao tác **note nhanh trên điện thoại**; cần dữ liệu đồng bộ tức thời giữa các thiết bị và **giữa các thành viên cùng Space**; chấp nhận đăng nhập 1 lần để bảo vệ dữ liệu của Space.

## 3. Phạm vi MVP
> **PIVOT (vòng 23):** "MVP" giờ được hiểu lại theo **3 giai đoạn build** (xem mục 6b). Giai đoạn 1 (MVP pivot) **chỉ build khối Ghi chú + auth tối giản + 1 Space + sync mobile↔desktop + offline-first** để kiểm chứng kiến trúc PWA+Supabase. Các khối còn lại (Việc cần làm/Nhắc việc/Thói quen/Thông báo) và đa Space/Settings tuỳ biến/Export-Import được dời sang giai đoạn 2-3. Toàn bộ danh sách dưới đây vẫn là **phạm vi sản phẩm đầy đủ** (không bị cắt bỏ), chỉ **sắp xếp lại theo giai đoạn**.
> **Cập nhật (vòng 24):** GĐ1 **mở rộng** — không còn là "1 Space duy nhất" mà gồm **tạo/chuyển nhiều Space + mời & quản lý thành viên qua email (shared space)** ngay từ GĐ1 (chủ dự án chốt làm luôn). Xem mục 6b đã cập nhật.

**Trong phạm vi (sản phẩm đầy đủ — chia giai đoạn ở mục 6b):**
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
- **Chia sẻ Space & thành viên (vòng 24)**: mời người khác vào space qua **email**, xem danh sách thành viên, xoá thành viên, rời space; **mọi thành viên ngang quyền** (xem/thêm/sửa/xoá mọi thứ trong space, kể cả quản lý thành viên). — xem F36.
- Settings: theme (sáng/tối), màu chủ đạo, ảnh nền (header tự đổi tông theo ảnh nền đã chọn), **tỉ lệ kích thước các khối** + nút khôi phục mặc định, Export/Import JSON.
- **Đăng nhập (Supabase Auth)** tối giản — bắt buộc để biết dữ liệu thuộc về ai và để Row Level Security (RLS) hoạt động. *(Mới ở vòng 23 — xem F33, mục 6.)*
- **Offline-first**: ghi local ngay (optimistic update), đẩy lên Supabase ngầm; queue mutation khi mất mạng, replay khi online lại. *(Mới ở vòng 23 — xem F9/F10 đã viết lại, mục 6.)*
- Lưu trữ và đồng bộ dữ liệu qua **Supabase (Postgres)** theo từng Space *(thay cho `chrome.storage.sync` cũ — xem F9 đã viết lại)*.

**Ngoài phạm vi (đã hỏi và xác nhận KHÔNG làm):**
- Filter/gán theo người (Tôi/Vợ/Con...) ở khối Việc cần làm, Nhắc việc và Thói quen — bỏ hẳn; trong 1 space dữ liệu **không gắn theo từng cá nhân thành viên**, mọi item là item chung của space (mọi thành viên đều thấy và sửa được). *(Vòng 24: vẫn giữ — shared space không có nghĩa là gán item theo người; chỉ là nhiều người cùng truy cập chung 1 bộ dữ liệu space.)*
- Phân vai trò (owner/editor/viewer) trong space — **ngoài phạm vi**, mọi thành viên ngang quyền (giữ đơn giản theo chốt vòng 24). `created_by` chỉ để ghi nhận ai tạo space, không tạo đặc quyền.
- Đa người dùng thật kiểu SaaS công khai / cho người lạ tự đăng ký vào space — **vẫn ngoài phạm vi**; vào space chỉ qua **lời mời email** do thành viên hiện hữu chủ động gửi.
- Đính kèm ảnh/file trong note.
- Markdown/rich text trong card Note.
- Kanban 4 cột (Backlog/Todo/Doing/Done) — đã bỏ từ vòng 6.
- Bố cục/theme riêng theo từng space — đã hỏi, xác nhận dùng chung 1 bộ cài đặt cho mọi space.
- Cỡ chữ tuỳ chỉnh trong Settings — đã thử (dùng `zoom`) rồi bỏ theo yêu cầu người dùng (vòng 20); cỡ chữ nền (baseline) đã được tăng lên 1 lần và giữ cố định.

> Ảnh "Cài đặt" gốc (ảnh 2) không phân tích lại theo yêu cầu — Settings vẫn giữ thiết kế đã chốt trước đó (theme/màu/ảnh nền/export-import) làm nền tham khảo.

## 4. Bố cục, resize & sắp xếp khối (F20, F21)
> **PIVOT (vòng 23) — mobile là biến thể thiết kế riêng, không chỉ media query:** layout mô tả dưới đây là **desktop-first** (3 khối ngang hàng, slider % layout, drag-drop đổi thứ tự khối, masonry nhiều cột). Các tương tác này dựa trên chuột (mouse) nên **không phù hợp mobile**. Cần thiết kế biến thể mobile có chủ đích: khối **xếp dọc**, **bỏ slider %/drag ngang trên mobile** (dùng preset đơn giản), masonry mobile thường **1 cột**, **modal full-screen** trên màn nhỏ. Đây là **redesign cho mobile**, không phải chỉ thêm `@media`. Chi tiết thiết kế do agent `uiux` làm sau — xem F34 và câu hỏi mở #12.

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
- Tỉ lệ kích thước (cả cấp khối chính và khối con) + thứ tự khối chính là **cài đặt dùng chung cho mọi Space** (không đổi khi chuyển space) — lưu trên **Supabase** *(thay cho `chrome.storage` cũ)*, áp dụng lại khi mở app lần sau. *(Vòng 24: settings này gắn theo **user**, không theo space — vì là tuỳ biến hiển thị cá nhân; xem mục 6 model dữ liệu.)*
- Mỗi khối có vùng nội dung cuộn riêng nếu nội dung vượt chiều cao khối (không làm phình layout tổng).
- **Responsive (vòng 20, mở rộng ở vòng 23)**: dưới 980px chiều rộng, 3 khối chính xếp dọc; dưới 640px, Nhắc việc/Thói quen trong khối tổng hợp cũng xếp dọc, Settings chuyển 1 cột. **Vòng 23 nâng yêu cầu này thành redesign mobile có chủ đích** (xem blockquote đầu mục + F34), không chỉ là các ngưỡng media query trên.

## 5. Tính năng chi tiết

### 5.1 Khối Việc cần làm — F22 (đã tách lại, vòng 16)
> **F22 đã đổi nghĩa so với vòng 6**: lúc đó F22 gộp cả "1 lần" và "lặp lại" vào chung 1 khối. Đến vòng 16, người dùng nhận ra việc gộp gây nhập nhằng (1 lần cần theo dõi hoàn thành, lặp lại thì không cần) nên **tách "lặp lại" ra khối riêng** (F25 — Nhắc việc). F22 từ vòng 16 trở đi **chỉ còn nghĩa là việc 1 lần, có theo dõi hoàn thành**.

| # | Tính năng | Mô tả |
|---|---|---|
| F22a | Tạo việc | Tên + ngày/giờ tuỳ chọn — chỉ việc 1 lần, không có lựa chọn lặp lại (đã chuyển sang F25) |
| F22b | Danh sách + filter | Filter Tất cả / Chưa xong / Đã xong; mỗi dòng hiện ngày-giờ nếu có |
| F22c | Tick hoàn thành | Tick done/chưa done, giữ trạng thái — **có theo dõi hoàn thành thật** (khác F25 không theo dõi) |
| F22d | Sửa/xoá việc | Sửa tên/ngày-giờ hoặc xoá vĩnh viễn — xác nhận qua **modal tuỳ biến**, không dùng `confirm()` mặc định |
| F22e | Không filter theo người | Mọi việc thuộc về **space** (không gắn theo từng cá nhân thành viên), không có tag/filter theo người (Tôi/Vợ/Con). Trong shared space, mọi thành viên cùng thấy và cùng tick được. |

### 5.2 Khối Ghi chú (card Note) — F1–F5, F11, F12, F15, F23, F28
> **F14 (card loại Task list) đã bỏ** — khối Todo/Việc cần làm đã đảm nhiệm việc quản lý task. Mỗi card trong khối Ghi chú chỉ có 1 loại: **Note**.
> **Vòng 23:** khối Ghi chú là **trọng tâm Giai đoạn 1 (MVP pivot)** vì đây chính là use case "note nhanh" — động lực của pivot. Card vẫn giữ nguyên hành vi dưới đây, chỉ đổi nguồn lưu trữ sang Supabase + offline-first và bổ sung biến thể masonry 1 cột trên mobile (xem F11 + mục 4).
> **Vòng 24:** card Note giờ thuộc về **space** (có `space_id`); trong shared space, mọi thành viên của space đều thấy/sửa/xoá được card — đồng bộ realtime giữa các thành viên (last-write-wins khi cùng sửa 1 card).

| # | Tính năng | Mô tả |
|---|---|---|
| F1 | Tạo card | Bấm "+ Thêm note" trong khối Ghi chú, đặt tên, chọn màu, tạo card Note |
| F2 | Sửa nội dung card | Click vào card để mở modal sửa nội dung note (textarea) + đổi màu |
| F3 | Đổi tên card | Sửa tên card bất kỳ lúc nào |
| F4 | Xoá card | Xoá vĩnh viễn card — xác nhận qua **modal tuỳ biến**, không dùng `confirm()`/alert mặc định của browser |
| F5 | Ẩn/hiện card | Toggle ẩn — card **giữ nguyên vị trí và tiêu đề**, chỉ thay phần nội dung bằng **placeholder có icon + chữ** ("Đã ẩn nội dung note này", đồng bộ cách trình bày với F24 ẩn khối) — không còn dùng dấu chấm "•••" hay chữ "(ẩn)" thêm vào tiêu đề (vòng 15) |
| F11 | Bố cục card trong khối — **masonry thật bằng JS** (vòng 17) | Card được đo chiều cao sau khi render và luôn chèn vào cột đang **thấp hơn** (giải thuật kiểu Pinterest thật), tránh khoảng hở lớn do CSS Grid/`column-count` ép các ô cùng hàng phải bằng chiều cao nhau (lỗi đã gặp ở các phương án trước: 1 cột dọc → CSS Grid `auto-fill` → JS masonry là phương án cuối); kéo (giữ đúng icon grip) để đổi **thứ tự** card, chỉ hoạt động khi đang sắp xếp "Thứ tự thủ công" (xem F28). **Vòng 23: trên mobile masonry rút về 1 cột** (xem F34/mục 4) |
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
> **PIVOT (vòng 23):** F9/F10 đã được **viết lại hoàn toàn** từ "`chrome.storage.sync` + fallback quota" sang "Supabase + offline-first". Xem bên dưới và mục 6.

| # | Tính năng | Mô tả |
|---|---|---|
| F6 | Settings — Theme | Chọn giao diện Sáng / Tối |
| F7 | Settings — Màu chủ đạo | Chọn 1 trong bảng màu có sẵn, áp dụng cho accent UI |
| F8 | Settings — Ảnh nền (đổi cách header phản ứng, vòng 21) | Đóng gói sẵn vài gradient/màu cố định (không tải ảnh từ internet). Khi chọn 1 gradient, **header đổi sang 1 màu pastel nhạt lấy theo tông gradient đó** (đặc, không trong suốt) để đồng bộ với nền trang — đã thử để header trong suốt cho gradient gốc lộ thẳng ra nhưng bị nhận xét "không ổn" (mất kiểm soát tương phản/độ rực), nên đổi sang cách "rút tông màu" có kiểm soát này; đổi theo cả theme sáng/tối |
| F9 | **Đồng bộ dữ liệu qua Supabase (viết lại — vòng 23)** | ~~Lưu qua `chrome.storage.sync`, tự đồng bộ giữa các máy đăng nhập cùng Chrome account.~~ **→ thay bằng:** toàn bộ dữ liệu các khối (theo từng space) lưu trên **Supabase (Postgres)**, truy cập qua **membership** (`space_members`) thay vì trực tiếp theo `user_id` *(vòng 24)*; settings hiển thị (theme/màu/layout) gắn theo **user**. Đồng bộ giữa desktop↔mobile **và giữa các thành viên cùng space** qua **Supabase Realtime** (hoặc polling nhẹ nếu Realtime phức tạp ở GĐ1). Conflict resolution **last-write-wins** — vòng 24 lưu ý: nay có thể xảy ra giữa **nhiều người** cùng sửa 1 space, không chỉ giữa các thiết bị của 1 người (đánh đổi đã biết, chấp nhận cho quy mô nhỏ) |
| F10 | **Offline-first (viết lại — vòng 23)** | ~~Khi vượt quota `sync` (~100KB/8KB/512 item) thì cảnh báo, không tự chuyển local.~~ **→ thay bằng:** ghi vào **local state/IndexedDB ngay** (optimistic update → UI phản hồi tức thời như chrome.storage trước đây), đẩy lên Supabase **ngầm phía sau**; service worker cache app shell + **local queue cho mutation khi mất mạng, replay khi online lại**. Ràng buộc quota chrome.storage **không còn áp dụng** (Supabase free tier ~500MB DB/5GB bandwidth/50k MAU — dư cho quy mô nhỏ) |
| F13 | Export / Import dữ liệu | Trong Settings: nút Export xuất toàn bộ dữ liệu (mọi space mà user là thành viên + settings) ra file `.json`; nút Import đọc file `.json` để khôi phục |
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

### 5.9 Space — nhiều không gian làm việc (F32, vòng 22; shared space vòng 24)
> Yêu cầu gốc: "sẽ có nhiều space, mỗi space có nội dung khác nhau, ví dụ Space cá nhân (nhắc việc, việc cần làm cá nhân) và Space công ty (nhắc việc, việc cần làm công ty), chuyển đổi qua lại được". Sau khi BA làm rõ phạm vi, đã chốt: **toàn bộ 5 khối dữ liệu** tách riêng theo space (không chỉ Việc cần làm/Nhắc việc), còn **bố cục/theme/màu/ảnh nền dùng chung** cho mọi space.
> **~~Vòng 23:~~** ~~đa Space được dời sang Giai đoạn 3. Giai đoạn 1 chỉ chạy 1 Space duy nhất để giảm phức tạp khi kiểm chứng kiến trúc.~~ **→ đảo ngược ở vòng 24:** đa Space + chia sẻ thành viên được **kéo lên Giai đoạn 1** (chủ dự án chốt làm luôn) vì shared space là yêu cầu nền tảng, không nên hoãn. Model dữ liệu Space được ánh xạ sang bảng Supabase (xem mục 6, model dữ liệu).
> **Vòng 24 — chuyển sang shared space:** Space không còn là "không gian riêng của 1 user". Một Space có thể được **nhiều người cùng dùng chung** (mời qua email, mọi thành viên ngang quyền). Quyền truy cập đi qua bảng `space_members`. Chi tiết chia sẻ & thành viên ở **F36 (mục 5.11)**.

| # | Tính năng | Mô tả |
|---|---|---|
| F32a | Mỗi Space có riêng đủ 5 khối dữ liệu | Việc cần làm, Nhắc việc, Thói quen, Ghi chú — tách biệt hoàn toàn theo từng space (gắn `space_id`); khối Thông báo tự tính lại theo dữ liệu của space đang active (không lưu riêng) |
| F32b | Dropdown chuyển đổi Space | Đặt cạnh logo "KN-Space" ở header; hiện tên space đang chọn + icon mũi tên; bấm mở danh sách **các space mà user là thành viên**, click 1 space để chuyển ngay (re-render toàn bộ 5 khối theo dữ liệu space đó) |
| F32c | Tạo / đổi tên / xoá Space | Trong dropdown: "+ Thêm space mới" (modal nhập tên; người tạo tự thành thành viên đầu tiên, ghi `created_by`); icon sửa để đổi tên (mọi thành viên đổi tên được); **icon xoá cả space CHỈ hiện với người tạo (`created_by`)** — chốt #15: thành viên khác không xoá được cả space (tránh mất data mọi người). Modal xác nhận hiển thị rõ sẽ mất toàn bộ dữ liệu các khối của space đó **và ảnh hưởng mọi thành viên**. Nếu xoá space đang mở → **tự chuyển về space khác + thông báo** (chốt #18) |
| F32d | ~~Mỗi space data riêng của 1 user~~ → **Dữ liệu tách theo space, 1 space có thể nhiều thành viên (vòng 24)** | ~~Bản vòng 22: dữ liệu mỗi space là của riêng 1 user.~~ **→ điều chỉnh:** dữ liệu vẫn **tách theo từng space** (mỗi space 1 bộ 5 khối), nhưng **một space có thể có nhiều thành viên cùng truy cập** (qua `space_members`); mọi thành viên thấy chung và sửa chung dữ liệu của space. Bố cục/theme dùng chung **gắn theo user** (mỗi user có tuỳ biến hiển thị riêng), không đổi khi chuyển space và không phụ thuộc space nào |
| F32e | Reset trạng thái UI tạm thời khi chuyển space | Khi chuyển space: filter "Việc cần làm" về lại "Tất cả", ô tìm kiếm + sắp xếp Ghi chú reset về rỗng/"Thứ tự thủ công" — tránh hiểu lầm dữ liệu "biến mất" do filter của space cũ còn áp dụng |

### 5.10 Tài khoản & nền tảng PWA (F33, F34, F35 — mới vòng 23)
> Các tính năng này **mới phát sinh từ pivot** sang PWA + Supabase. Auth và offline-first nằm trong Giai đoạn 1; cài đặt PWA (installability) đi kèm ngay từ GĐ1 vì là điều kiện để "note nhanh trên điện thoại".

| # | Tính năng | Mô tả |
|---|---|---|
| F33 | **Đăng nhập tối giản (Supabase Auth — Google OAuth)** | Bắt buộc đăng nhập để biết user là ai + để RLS hoạt động. Đăng nhập **Google (OAuth qua Supabase)** — bấm 1 nút (câu hỏi mở #10 đã chốt). Phải thiết kế **RLS** đúng: **vòng 24** — không còn là `auth.uid() = user_id` đơn thuần, mà là "user truy cập được 1 dòng nếu user đó là **thành viên** của space chứa dòng đó" (RLS qua subquery/join tới `space_members`). Xem mục 6 + F36 |
| F34 | **Biến thể giao diện cho mobile (redesign có chủ đích)** | Khối xếp dọc; **bỏ slider %/drag ngang trên mobile**, dùng preset bố cục đơn giản; masonry mobile **1 cột**; **modal full-screen** trên màn nhỏ; tối ưu thao tác chạm (touch target đủ lớn). Đây là yêu cầu thiết kế, chi tiết do agent `uiux` thực hiện sau — xem mục 4 + câu hỏi mở #12 |
| F35 | **Cài đặt PWA (installability)** | App có `manifest.webmanifest` (tên, icon, theme color, display standalone) + **service worker** (cache app shell) qua `vite-plugin-pwa`; cài được lên màn hình chính trên iOS/Android và desktop. **HTTPS bắt buộc** (cho installability + Supabase auth callback) |

### 5.11 Chia sẻ & thành viên Space (F36 — mới vòng 24)
> **Mới ở vòng 24.** Chủ dự án chốt mô hình **shared space kiểu Notion/Trello workspace**: người tạo Space mời người khác qua **email** để cùng dùng chung; **mọi thành viên ngang quyền** (giữ đơn giản, không phân vai trò). Build **ngay GĐ1**. Quyền truy cập dữ liệu đi qua bảng `space_members` (xem mục 6). Đây là phần ảnh hưởng schema/RLS lớn nhất mà dev đã cảnh báo — nay đã chốt theo hướng shared.

| # | Tính năng | Mô tả |
|---|---|---|
| F36a | Mời thành viên qua email | Trong 1 space, bất kỳ thành viên nào cũng có thể mời người mới bằng cách **nhập email**. Hệ thống tạo lời mời gắn email đó với space. Không cần biết người được mời đã có tài khoản hay chưa |
| F36b | Người được mời chưa có tài khoản → pending-invite | Nếu email được mời **chưa từng đăng nhập** (chưa có user trong Supabase Auth), lời mời được lưu dạng **pending-invite theo email** (bảng riêng, vd. `space_invites`: `space_id`, `email`, `invited_by`, `created_at`, hoặc một dòng `space_members` chưa gắn `user_id`). Khi người đó **lần đầu đăng nhập Google bằng đúng email đó**, hệ thống tự **chuyển pending-invite thành membership** (gắn `user_id` thật vào `space_members`) → họ thấy ngay space được mời. Cần cơ chế "resolve invite on first login" (trigger phía Supabase hoặc bước hậu-đăng-nhập ở client) |
| F36c | Người được mời đã có tài khoản → vào space ngay | Nếu email đã ứng với 1 user đang tồn tại, thêm thẳng dòng `space_members` (`space_id`, `user_id`) → lần mở app/refresh kế tiếp họ thấy space mới trong dropdown (F32b) |
| F36d | Danh sách thành viên | Trong space, xem danh sách thành viên hiện tại (email/tên) + các lời mời đang chờ (pending). Mọi thành viên đều xem được |
| F36e | Xoá thành viên | Bất kỳ thành viên nào cũng có thể **xoá thành viên khác** (xoá dòng `space_members`) và **huỷ lời mời pending** — vì mọi thành viên ngang quyền (kể cả quyền quản lý thành viên). Xác nhận qua modal tuỳ biến |
| F36f | Rời space | Thành viên tự rời space (xoá dòng `space_members` của chính mình). Sau khi rời, space đó biến mất khỏi dropdown của họ. Cần chặn để user **không rời space cuối cùng** của mình (luôn còn ≥1 space) hoặc xử lý điều hướng phù hợp |
| F36g | Mọi thành viên NGANG QUYỀN (1 ngoại lệ) | Không có vai trò owner/viewer riêng. Ai trong space cũng xem/thêm/sửa/xoá mọi dữ liệu + mời/xoá thành viên + đổi tên space. **Ngoại lệ duy nhất (chốt #15): chỉ `created_by` được XOÁ CẢ space.** Ngoài quyền xoá-space đó ra, `created_by` không có đặc quyền nào khác |

## 6. Ràng buộc kỹ thuật
> **PIVOT (vòng 23):** toàn bộ ràng buộc "Manifest V3 / `chrome.storage` / permission extension / trang full-tab extension" **đã bị thay thế** bởi ràng buộc PWA + Supabase dưới đây. Các gạch đầu dòng cũ được giữ lại dạng gạch ngang để lưu lịch sử.
> **Cập nhật RLS & model dữ liệu (vòng 24):** RLS đổi từ `auth.uid() = user_id` sang **membership-based** (qua `space_members`). Model dữ liệu Space viết lại bên dưới có thêm bảng `space_members` (+ `space_invites` cho pending-invite). Đây là quyết định ảnh hưởng schema/RLS lớn nhất — nay chốt theo hướng shared.

**Ràng buộc cũ — đã thay thế (giữ để lưu lịch sử):**
- ~~Chrome Extension **Manifest V3**.~~ → thay bằng **PWA** (vite-plugin-pwa).
- ~~Lưu trữ: `chrome.storage.sync` (chính), `chrome.storage.local` (fallback khi vượt quota).~~ → thay bằng **Supabase (Postgres)** + offline-first (IndexedDB/local queue).
- ~~Permission tối thiểu `storage`; không xin permission ngoài phạm vi.~~ → **bỏ permission model extension**; thay bằng auth + RLS của Supabase.
- ~~Giao diện chạy ở **trang riêng full-tab** (`chrome.tabs.create` / thay New Tab Page); icon extension mở/focus tab.~~ → thay bằng **web app tại 1 URL**, mở qua trình duyệt, cài PWA lên màn hình chính (xem F35; mục 9 quyết định #6 đã cập nhật).
- ~~Background service worker kiểu extension.~~ → thay bằng **service worker PWA** (cache app shell, queue offline) — bản chất khác, không phải background extension.

**Ràng buộc mới (vòng 23):**
- **Stack: React + Vite + PWA** (`vite-plugin-pwa` sinh `manifest.webmanifest` + service worker). Bỏ hẳn Manifest V3, background service worker kiểu extension, permission model extension.
- **Lưu trữ: Supabase (Postgres)** là **nguồn dữ liệu duy nhất** thay cho chrome.storage.sync. Bỏ toàn bộ ràng buộc quota chrome.storage (100KB tổng / 8KB mỗi item / 512 item). Supabase free tier (~500MB DB / 5GB bandwidth / 50k MAU) dư cho quy mô nhỏ.
- **Auth: Supabase Auth** — Google OAuth (câu hỏi mở #10 đã chốt). Bắt buộc để gắn dữ liệu với user và để **Row Level Security (RLS)** hoạt động. **~~Policy `auth.uid() = user_id` (mỗi user chỉ đọc/ghi dữ liệu của mình)~~ → đảo ngược ở vòng 24:** RLS theo **membership** — xem phần RLS dưới.
- **Offline-first + performance (phần kỹ thuật quan trọng nhất):** ghi vào local state/IndexedDB ngay (optimistic update → UI phản hồi tức thời như chrome.storage cũ), đẩy lên Supabase ngầm; service worker cache app shell + **local queue cho mutation khi mất mạng, replay khi online lại**. Đồng bộ desktop↔mobile **và giữa các thành viên cùng space** qua **Supabase Realtime** hoặc polling nhẹ. **Conflict resolution: last-write-wins** — vòng 24: nay có thể xảy ra giữa **nhiều người** cùng sửa 1 space (không chỉ giữa các thiết bị của 1 người); vẫn chấp nhận cho quy mô nhỏ, ghi nhận là đánh đổi đã biết.
- **Hosting/Deploy:** web app cần hosting tĩnh (**Vercel** — câu hỏi mở #9 đã chốt; free tier đủ). **HTTPS bắt buộc** (cho PWA installability + Supabase auth callback). Khác hẳn extension (load unpacked / Chrome Web Store).
- **Responsive cho mobile:** mockup hiện tại desktop-first; cần **biến thể mobile có chủ đích** (khối xếp dọc, bỏ slider %/drag ngang, masonry 1 cột, modal full-screen) — không chỉ thêm media query. Ghi nhận yêu cầu; thiết kế chi tiết do agent `uiux` (xem F34, mục 4).
- Cần logic tính toán **thời gian/chu kỳ** ở client (so sánh ngày/giờ hiện tại với việc 1 lần ở F22/F25, chu kỳ+giờ+ngày-trong-tháng của nhắc lặp lại, ngày hôm nay của habit) để khối Thông báo (F19) tổng hợp và **sắp xếp theo giờ gần nhất** (F19e) đúng — vẫn tính ở client, không cần cron/server (Supabase chỉ làm storage + auth + realtime).
- State các khối có quan hệ tham chiếu (Thông báo tham chiếu dữ liệu Việc cần làm + Nhắc việc + Thói quen) — cần thiết kế model dữ liệu rõ ràng để tránh đồng bộ lệch khi cập nhật 2 chiều (F19c); riêng dữ liệu từ Nhắc việc (F25) không cần đồng bộ 2 chiều vì không có trạng thái done.
- Layout cần model 2 cấp: thứ tự + tỉ lệ của 3 khối chính, và tỉ lệ của các khối con bên trong khối tổng hợp — lưu trên **Supabase** (gắn **user**, dùng chung cho mọi Space — F32d; tuỳ biến hiển thị là của riêng từng user, không phải của space), chỉnh qua Settings UI, không qua kéo-thả splitter trực tiếp (F20, F21).
- **Model dữ liệu Space trên Supabase — viết lại theo shared space (vòng 24):** ~~ánh xạ sang các bảng có `user_id` + `space_id` với RLS theo `auth.uid()`~~ **→ thay bằng** sơ đồ membership-based dưới đây:
  - **`spaces`**: `id` (PK), `name`, `created_by` (user_id của người tạo — chỉ ghi nhận, không tạo đặc quyền), `created_at`.
  - **`space_members`**: `space_id` (FK→spaces), `user_id` (FK→auth.users), `created_at`. **Bảng membership trung tâm**: 1 user thuộc nhiều space, 1 space có nhiều user (quan hệ N-N). PK kép (`space_id`, `user_id`) hoặc unique trên cặp này.
  - **`space_invites`** (cho pending-invite F36b): `id`, `space_id` (FK), `email` (người được mời, chưa có user), `invited_by`, `created_at`. Khi người được mời lần đầu đăng nhập Google bằng email khớp → chuyển thành dòng `space_members` rồi xoá invite (resolve-on-first-login).
  - **Các bảng nội dung** (`note_cards`, `tasks`, `reminders`, `habits`) đều gắn **`space_id`** (FK→spaces) thay vì `user_id`. Có thể giữ thêm `created_by`/`updated_by` để ghi nhận, nhưng quyền không dựa vào đó.
  - **`user_settings`** (theme/màu/ảnh nền/layout — tuỳ biến hiển thị): gắn `user_id`, **không gắn space** (dùng chung mọi space, riêng theo từng user — F32d).
  - **RLS (membership-based):** với bảng nội dung và `spaces`, một dòng đọc/ghi được nếu **`auth.uid()` là thành viên của space tương ứng** — policy dạng `EXISTS (SELECT 1 FROM space_members m WHERE m.space_id = <bảng>.space_id AND m.user_id = auth.uid())`. Với `space_members`: user thấy/sửa được các dòng của những space mà chính họ là thành viên (cẩn thận tránh đệ quy policy — có thể dùng SECURITY DEFINER function hoặc policy phẳng). Với `user_settings`: vẫn `auth.uid() = user_id`. **Bắt buộc test RLS kỹ** (rò rỉ dữ liệu giữa các space là rủi ro lớn nhất).
  - GĐ1 cần các bảng: `spaces` + `space_members` + `space_invites` + `note_cards` + `user_settings`; các bảng nội dung còn lại (`tasks`/`reminders`/`habits`) thêm ở GĐ2.
  - Vẫn cần đồng bộ cẩn thận local state ↔ Supabase để tránh ghi đè nhầm khi nhiều thiết bị / **nhiều thành viên** cùng sửa (last-write-wins).
- **Bài học kỹ thuật về kéo-thả (drag & drop) lồng nhau** (giữ nguyên giá trị, vẫn áp dụng cho desktop): khi 1 khối cha và phần tử con bên trong nó (vd. card Ghi chú) đều có thể kéo-thả độc lập, sự kiện `dragstart`/`dragend` của phần tử con sẽ **nổi bọt (bubble)** lên khối cha và kích hoạt nhầm listener của khối cha nếu không kiểm tra `event.target === phần tử đang lắng nghe`. Cách khắc phục đúng là luôn kiểm tra `e.target` trước khi xử lý logic kéo-thả ở cấp cha. *(Lưu ý: drag-drop chỉ áp dụng desktop; mobile dùng preset, không drag ngang — xem F34.)*

### Độ tin cậy / rủi ro mất dữ liệu — Supabase (viết lại vòng 23)
> ~~Phần "Độ tin cậy của `chrome.storage.sync`" cũ (gỡ extension là mất data, quota 100KB, đồng bộ trễ vài giây...) đã không còn áp dụng~~ vì dữ liệu không còn nằm trong chrome.storage. Thay bằng phân tích cho Supabase dưới đây.

- Dữ liệu nằm trong Postgres trên Supabase, **không mất khi gỡ app/đổi máy** (chỉ cần đăng nhập lại) — bền hơn chrome.storage trước đây.
- Rủi ro mới cần lưu ý: phụ thuộc dịch vụ bên thứ ba (Supabase còn hoạt động / project free tier không bị tạm dừng do không hoạt động lâu — Supabase có thể pause project free tier sau thời gian không dùng); **rò rỉ dữ liệu giữa các space nếu RLS membership cấu hình sai (bắt buộc test RLS kỹ — rủi ro lớn hơn trước vì dữ liệu nay được nhiều người truy cập)**.
- Offline-first giảm rủi ro mất thao tác khi mạng chập chờn (queue + replay), nhưng cần xử lý trường hợp xung đột khi nhiều thiết bị / **nhiều thành viên** offline cùng sửa rồi online (last-write-wins — chấp nhận cho quy mô nhỏ).
- **Export/Import JSON (F13)** vẫn nên giữ làm backup thủ công độc lập với Supabase (đề phòng sự cố nhà cung cấp). Giữ trong phạm vi (GĐ3).

## 6b. Phạm vi build theo GIAI ĐOẠN (mới — vòng 23, chủ dự án đã chốt; GĐ1 mở rộng vòng 24)
> KHÔNG build toàn bộ 5 khối cùng lúc. Mục tiêu là **kiểm chứng nhanh kiến trúc PWA + Supabase chạy ổn trên cả điện thoại lẫn desktop** trước, rồi mới mở rộng tính năng. Đây là thông tin định hướng cho agent `dev`.
> **Cập nhật vòng 24:** GĐ1 **mở rộng** — không còn là "Ghi chú + 1 Space duy nhất" tối giản. Chủ dự án chốt làm luôn **đa Space + mời/quản lý thành viên qua email (shared space)** ngay GĐ1. Ghi nhận rõ: GĐ1 nay **lớn hơn** mục tiêu "validate kiến trúc tối giản" ban đầu (RLS membership + invite flow phức tạp hơn), nhưng là **lựa chọn có chủ đích** của chủ dự án vì shared space là yêu cầu nền tảng, không nên hoãn.

**Giai đoạn 1 — MVP pivot (kiến trúc + shared space):**
- Khối **Ghi chú** (note card — chính là use case "note nhanh", động lực của pivot).
- **Auth** (F33 — Google OAuth).
- **~~1 Space duy nhất~~ → Space + chia sẻ thành viên (vòng 24):** tạo/đổi tên/xoá + **chuyển nhiều Space** (F32) + **mời/quản lý thành viên qua email** (F36: mời, danh sách, xoá thành viên, rời space, pending-invite resolve-on-first-login).
- **RLS membership-based** (qua `space_members`) — không còn `auth.uid() = user_id` đơn thuần.
- **Sync mobile↔desktop và giữa các thành viên** (Supabase Realtime hoặc polling nhẹ).
- **Offline-first** (F10 viết lại: optimistic + IndexedDB queue + replay).
- **Cài PWA** (F35) để dùng được trên điện thoại.
- Mục tiêu: chứng minh PWA + Supabase + **shared space** chạy ổn trên cả 2 thiết bị; note nhanh mượt như chrome.storage cũ; nhiều người dùng chung 1 space đồng bộ đúng.

**Giai đoạn 2 — các khối tracking + thông báo:**
- **Việc cần làm** (F22), **Nhắc việc** (F25), **Thói quen** (F18), **Thông báo** (F19, đồng bộ trạng thái 2 chiều) — các bảng nội dung này gắn `space_id`, dùng chung RLS membership đã dựng ở GĐ1.

**Giai đoạn 3 — tuỳ biến + backup:**
- **Settings tuỳ biến** (theme/màu/ảnh nền/layout — F6/F7/F8/F20/F21/F26), **Export/Import** (F13). *(Đa Space đã chuyển lên GĐ1 ở vòng 24, không còn ở GĐ3.)*

## 7. Tiêu chí "gọn nhẹ"
> **PIVOT (vòng 23):** mốc "bundle < 200KB của extension" **không còn là ràng buộc nghiêm ngặt** như trước (web app PWA có thêm runtime React + client Supabase + service worker), nhưng **vẫn ưu tiên nhẹ**: lazy-load phần Settings/đa Space, tránh dependency thừa, giữ thời gian tải lần đầu nhanh (đặc biệt trên mobile mạng yếu — quan trọng cho "note nhanh").

- ~~Bundle JS sau build nhắm dưới ~200KB (chưa gzip).~~ → **không còn ràng buộc cứng**; thay bằng mục tiêu mềm: bundle khởi tạo nhỏ nhất có thể, code-split theo giai đoạn/route, ưu tiên tải nhanh trên mobile.
- Không thêm state management library nặng (Redux, v.v.) — dùng React state/context (hoặc 1 store nhỏ như Zustand nếu cần) là đủ cho quy mô này.
- Không thêm dependency UI framework lớn (Material UI, Ant Design) — tự viết CSS nhẹ hoặc dùng utility CSS tối giản.
- **Supabase client là dependency mới chấp nhận được** (thay cho việc không có backend trước đây) — đây là đánh đổi có chủ đích để có sync mobile↔desktop + auth + offline + **shared space**; ngoài client Supabase và 1 lib offline-queue/IndexedDB nhỏ, vẫn tối giản dependency.
- Tính toán ngày/giờ/chu kỳ bằng JS thuần (không cần thư viện date nặng như moment.js).

## 8. Quyết định đã chốt (từ câu hỏi mở vòng 1)
1. **Định dạng nội dung:** plain text, font hệ thống — không markdown/rich text trong MVP. → F12.
2. **Đồng bộ:** ~~chỉ cần chung 1 Google account (Chrome Sync), không cần tài khoản/server riêng.~~ **→ đảo ngược ở vòng 23:** dùng **Supabase + đăng nhập tài khoản riêng** (cần server-as-a-service, không còn dựa Chrome Sync). Vẫn khuyến nghị export/import JSON làm backup (F13). Xem mục 30.
3. **Sắp xếp card:** bố cục masonry kiểu Pinterest (card trái/phải/dưới theo chiều cao nội dung), kéo để đổi vị trí, vị trí lưu lại. → F11. *(Trên mobile rút về 1 cột — F34.)*
4. **Card ẩn:** giữ nguyên vị trí trong layout, chỉ ẩn title + nội dung, phân biệt bằng màu/style. → F5 (đã cập nhật).
5. **Giới hạn dung lượng:** ~~khi gần đạt quota `chrome.storage.sync` thì cảnh báo.~~ **→ không còn áp dụng ở vòng 23** (Supabase free tier dư dung lượng). → F10 đã viết lại.

## 9. Quyết định đã chốt (từ câu hỏi mở vòng 2)
6. **Không gian UI:** ~~mở extension thành **trang riêng full-tab** (`chrome.tabs.create` / thay New Tab Page) — không dùng popup nhỏ.~~ **→ đảo ngược ở vòng 23:** sản phẩm là **PWA web app tại 1 URL** (mở qua trình duyệt trên desktop/mobile, cài lên màn hình chính). Layout 5 khối vẫn cần đủ không gian trên desktop; trên mobile dùng biến thể xếp dọc (F34). → cập nhật ràng buộc kỹ thuật ở mục 6 + F35.
7. **Backup dữ liệu:** thêm tính năng **Export/Import JSON** vào MVP (xuất toàn bộ dữ liệu + settings ra file `.json`, đọc lại để khôi phục) — đặt trong Settings. → F13. *(Vòng 23: dời sang Giai đoạn 3; vẫn giữ vì là backup độc lập với Supabase.)*
8. **Lưu vị trí card trong khối Ghi chú:** chỉ lưu **thứ tự (order index)**, không lưu toạ độ tuyệt đối. → F11.

> Quyết định #6 ở vòng 2 ban đầu gắn với lý do "đủ không gian cho masonry toàn trang" → cập nhật vòng 5 thành "đủ không gian cho layout 5 khối" → **vòng 23 đảo ngược nền tảng**: không còn là tab extension mà là PWA web app (xem trên).

## 10. Quyết định đã chốt (từ câu hỏi mở vòng 3 — pivot sang dashboard 5 khối)
9. **Bố cục khối:** giữ cấu trúc 2 tầng giống ảnh gốc — tầng trên Todo + Nhắc việc, tầng dưới Nhắc lặp lại + Thói quen + Ghi chú. → mục 4. *(Sau đó đổi sang 3 khối ngang ở vòng 5.)*
10. **Cơ chế resize:** kéo thanh chia (splitter) giữa 2 khối liền kề. → F20. *(Sau đó đổi sang resize qua Settings ở vòng 6.)*
11. **Khối Ghi chú:** vẫn giữ nhiều card Note/Task list (F1–F5, F11–F15), chỉ thu nhỏ lại trong khối cố định, cuộn dọc khi nhiều card.
12. **Ngày/giờ task Todo:** mỗi task có ngày/giờ tuỳ chọn, dùng làm nguồn dữ liệu cho khối Nhắc việc. → F16b, F19a.
13. **Filter theo người:** bỏ hẳn ở khối Nhắc lặp lại và Thói quen — không cần multi-user, mọi item thuộc 1 người dùng. → F17c.
14. **Hành vi "Xong" ở Nhắc việc:** không ẩn khỏi danh sách, chỉ đổi trạng thái UI (vd. gạch ngang); có liên kết 2 chiều với khối gốc. → F19b, F19c.

Tất cả câu hỏi mở (3 vòng) đã được xác nhận — requirements sẵn sàng cho bước thiết kế UI lại (agent `uiux`) theo layout 5 khối mới. *(Vòng 23 phát sinh thêm câu hỏi mở mới — xem mục 31.)*

## 11. Cập nhật vòng 4
15. **Bỏ card loại Task list trong khối Ghi chú:** vì khối Todo đã đảm nhiệm quản lý việc cần làm, card trong khối Ghi chú chỉ còn 1 loại — **Note**. → F14 bị loại bỏ, F1/F2/F15 cập nhật lại ở mục 5.2.

## 12. Cập nhật vòng 5 — đổi bố cục thành 3 khối chính + đổi thứ tự
16. **Gộp Todo + Nhắc lặp lại + Thói quen thành 1 khối tổng hợp** xếp dọc, đặt cố định bên trái. → mục 4, mục 5.1/5.3/5.4 giữ nguyên nội dung con.
17. **Đổi tên "Nhắc việc" → "Thông báo"** — chỉ đổi tên hiển thị, hành vi F19a/b/c giữ nguyên. → mục 5.5.
18. **Thêm khả năng đổi thứ tự 3 khối chính** (khối tổng hợp / Ghi chú / Thông báo) bằng kéo-thả header, ngoài việc resize đã có. → F21 (mới), mục 5.7.
19. **Bố cục đổi từ 2 tầng sang 1 hàng 3 khối chính** — quyết định #9 ở vòng 3 (mục 10) bị thay thế bởi quyết định #16/#18 này.

## 13. Cập nhật vòng 6 — gộp Việc cần làm, thêm giờ cho lặp lại, resize qua Settings
20. **Gộp Todo + Nhắc lặp lại thành 1 khối "Việc cần làm"**, bỏ Kanban 4 cột, dùng danh sách phẳng + filter Tất cả/Chưa xong/Đã xong. → F22 (mới), thay thế F16 + F17. Khối tổng hợp bên trái giờ chỉ còn 2 khối con (Việc cần làm + Thói quen) thay vì 3.
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
35. **Thêm icon ẩn/hiện (con mắt) vào header của 4 khối con** (Việc cần làm, Thói quen, Ghi chú, Thông báo). Khi ẩn: khối co lại thành dải nhỏ cố định (≈46–56px), ẩn phần nội dung + nút phụ (filter/+Thêm), các khối còn lại **tự giãn lấp khoảng trống** nhờ cơ chế flexbox. Dải nhỏ còn lại vẫn hiện icon-chip + nút mắt để bấm mở lại bất kỳ lúc nào. → F24 (mới).

## 22. Cập nhật vòng 15 — sửa cơ chế ẩn khối, Thói quen có sửa/xoá, lưu theo ngày
36. **Cơ chế ẩn khối (F24) đổi ngay sau vòng 14** — bản "co thành dải nhỏ" bị nhận xét "nhìn kỳ quá". Đổi sang: **giữ nguyên kích thước khối**, chỉ thay `block-body` bằng placeholder căn giữa (icon + chữ "Đã ẩn nội dung..."). → F24 cập nhật, mục 5.7.
37. **Thêm sửa/xoá cho Thói quen** (trước đó chỉ có tạo + tick) — icon ✎/✕ hiện khi hover, xoá có modal xác nhận. → F18d (mới).
38. **Sửa lỗi lưu trạng thái Thói quen**: đổi từ cờ `doneToday: true/false` đơn lẻ sang lưu **danh sách ngày cụ thể đã hoàn thành** (`completedDates`) — lý do: cờ đơn lẻ không biết được đã bỏ lỡ bao nhiêu ngày nếu không mở app liên tục, dẫn đến hiển thị sai trạng thái. → F18c (mới).
39. **Thêm icon ẩn/hiện toàn bộ ("Ẩn tất cả" / "Hiện tất cả") trên header app** — ẩn nội dung cả 5 khối con cùng lúc bằng 1 nút, dùng lại cơ chế F24; nhãn nút tự đồng bộ theo trạng thái thực tế. → F27 (mới).

## 23. Cập nhật vòng 16 — tách "Nhắc lặp lại" khỏi "Việc cần làm" (đảo ngược quyết định vòng 6)
40. **Nhận ra việc gộp Todo + Nhắc lặp lại ở vòng 6 (F22) gây nhập nhằng**: việc 1 lần cần theo dõi hoàn thành, còn việc lặp lại theo người dùng chỉ cần **nhắc**, không cần biết đã làm hay chưa — dùng chung 1 checkbox cho 2 khái niệm khác bản chất là sai. → Quyết định **tách lại thành khối riêng**: "Việc cần làm" (chỉ 1 lần, có done) và "Nhắc lặp lại" (chỉ lặp lại, KHÔNG có done). → F22 đổi nghĩa, F25 ra đời.
41. **Nút "Xong" trong Thông báo cho mục Nhắc lặp lại bị bỏ hẳn** — mục thuộc Nhắc lặp lại trong Thông báo chỉ đọc, không tương tác. → F19d (mới).
42. **Bố cục khối tổng hợp**: thử kính mờ (`backdrop-filter`) cho nền các khối — bị nhận xét "xấu quá", **bỏ ngay**, quay lại nền đặc. Đồng thời đổi cách xếp 3 khối con: **Việc cần làm full chiều rộng ở trên, Nhắc lặp lại + Thói quen nằm ngang nhau ở dưới**. → mục 4.

## 24. Cập nhật vòng 17 — Ghi chú: sửa lỗi kéo-thả, đổi layout masonry, thêm tìm kiếm/sắp xếp
43. **Sửa lỗi kéo card làm mờ cả khối Ghi chú**: do sự kiện `dragstart` của card nổi bọt lên khối cha. → Thêm kiểm tra `e.target === khối` ở mọi handler cấp khối cha; `draggable` của khối chính chỉ bật khi bấm-giữ đúng vào `block-head`.
44. **Layout card Ghi chú trải qua 3 phiên bản**: (a) 1 cột dọc — phí không gian; (b) CSS Grid `auto-fill` — ép cùng hàng bằng chiều cao, gây hở; (c) **Masonry thật bằng JS** (cuối cùng) — đo `offsetHeight` từng cột, đưa card vào cột thấp hơn, không hở. → F11 cập nhật.
45. **Thêm tìm kiếm + sắp xếp** (Thứ tự thủ công / Tên A-Z / Mới sửa gần nhất) — kéo-thả đổi thứ tự chỉ khả dụng ở chế độ "Thứ tự thủ công". → F28 (mới).
46. **Mỗi card Note có màu riêng, tự chọn được**: gán xoay vòng theo bảng 6 màu khi tạo mới, đổi được trong modal sửa. Viền trái + badge + **nền card** đều theo đúng màu đó (nền nhuốm nhẹ ~10%). → F15 đổi nghĩa.
47. **Card ẩn dùng placeholder đồng bộ với cách ẩn khối (F24)** — bỏ "•••"/"(ẩn)", thay bằng icon + chữ "Đã ẩn nội dung note này". → F5 cập nhật.
48. **Giảm spacing card** (padding/margin) cho gọn hơn theo phản hồi "spacing hơi nhiều".

## 25. Cập nhật vòng 18 — Thông báo: sắp xếp theo gần nhất + nổi bật mục mới
49. **Thông báo sắp xếp theo giờ gần nhất lên đầu**; mục **đầu tiên chưa xong** được tô nổi bật (nền nhấn nhẹ + pulse + nhãn "Mới"). → F19e (mới).

## 26. Cập nhật vòng 19 — đổi "Nhắc lặp lại" thành "Nhắc việc"
50. **BA phân tích theo yêu cầu người dùng**: khối "Nhắc lặp lại" về bản chất là "định nghĩa nhắc nhở", không có khái niệm hoàn thành — nên hỗ trợ cả nhắc 1 lần lẫn lặp lại. → Đổi tên khối thành **"Nhắc việc"**, thêm loại **1 lần**; cả 2 loại đều KHÔNG có checkbox/done. → F25.
51. **Đổi tên toàn bộ id/biến/nhãn liên quan** trong code (`reminderItems`, `sub-reminder`, slider Settings "Nhắc việc") để khớp tên mới.

## 27. Cập nhật vòng 20 — hoàn thiện UI/UX & khả năng tiếp cận
52. Theo đề xuất tự rà soát của UIUX — đã triển khai: **accessibility** (F29); **responsive** màn hình hẹp (mục 4); **nút khôi phục bố cục mặc định** (F26); **hiệu ứng chuyển động nhẹ** (F30); **tìm kiếm + sắp xếp** cho Ghi chú (F28).
53. **Thêm "click ra ngoài modal để đóng"** cho mọi modal trong app. → F31 (mới).
54. **Thử thêm rồi bỏ slider "Cỡ chữ"** (dùng CSS `zoom`) — chỉ giữ baseline đã tăng.
55. **Thêm chọn ngày-trong-tháng cho Nhắc việc** khi đơn vị chu kỳ là Tháng (vd. "Mỗi tháng (ngày 27)"). → F25a cập nhật.

## 28. Cập nhật vòng 21 — đổi tên ứng dụng thành "KN-Space"
56. **Đổi tên app từ "extensionNote" sang "KN-Space"** — người dùng chọn KN-Space trong 5 lựa chọn. Đổi ở `<title>` trang và logo header.
57. **Header tự đổi tông màu theo ảnh nền đã chọn trong Settings** — dùng 1 màu pastel nhạt "rút tông" từ gradient, áp dụng theo cả theme sáng/tối. → F8 cập nhật.

## 29. Cập nhật vòng 22 — thêm tính năng nhiều Space
58. **Mở rộng theo yêu cầu**: "sẽ có nhiều space, mỗi space có nội dung khác nhau... chuyển đổi qua lại". BA làm rõ phạm vi, chốt: **cả 5 khối** tách riêng theo space; **bố cục/theme dùng chung**; **dropdown switcher cạnh logo**. → F32 (mới), mục 5.9.
59. **Demo sẵn 2 space** ("Cá nhân", "Công ty") với dữ liệu mẫu riêng biệt; có thể tạo thêm, đổi tên, xoá (trừ khi chỉ còn 1 space).

## 30. Cập nhật vòng 23 — PIVOT sang PWA + Supabase (kiến trúc lớn nhất)
> **Bối cảnh:** nhu cầu thật của chủ dự án là **note nhanh trên điện thoại** (không phải lúc nào cũng ngồi máy tính). Chrome extension **không chạy được trên Chrome mobile** (giới hạn cứng của platform). Phương án "ghi tạm app khác rồi copy tay" bị bác bỏ (sai nhu cầu, tốn công gấp đôi). Phương án hybrid (giữ extension + PWA nhỏ đồng bộ về) bị loại vì tạo 2 nguồn dữ liệu + sync 2 chiều phức tạp hơn cả pivot toàn bộ. Cả agent `ba` và `dev` sau khi phân tích sâu đều đồng thuận: **pivot toàn bộ là phương án đúng và ít rủi ro làm lại nhất**. Toàn bộ 59 quyết định sản phẩm (5 khối, đa Space, masonry, ẩn/hiện, streak, modal tuỳ biến, icon SVG...) **giữ nguyên** — pivot này chỉ đổi nền tảng kỹ thuật.

60. **Pivot nền tảng: Chrome Extension (Manifest V3) → PWA (React + Vite + `vite-plugin-pwa`)** — sinh `manifest.webmanifest` + service worker, cài được trên desktop và điện thoại qua 1 URL. Bỏ hẳn Manifest V3, background service worker kiểu extension, permission model extension, trang full-tab extension. → mục 1, mục 6 (ràng buộc cũ đã gạch ngang), F35 (mới), mục 9 quyết định #6 (đảo ngược).
61. **Lưu trữ: `chrome.storage.sync` → Supabase (Postgres) là nguồn dữ liệu duy nhất.** Bỏ toàn bộ ràng buộc quota chrome.storage (100KB/8KB/512 item). Supabase free tier (~500MB DB / 5GB bandwidth / 50k MAU) dư cho quy mô nhỏ. → F9/F10 viết lại, mục 6, mục 8 quyết định #2/#5 (đảo ngược).
62. **Thêm Auth (Supabase Auth) tối giản + RLS.** Quy mô **1-2 người dùng cố định** (cá nhân + có thể vợ/chồng), không phải SaaS công khai → magic-link hoặc email/password, không cần đăng ký công khai phức tạp. Phải thiết kế **RLS** để mỗi user chỉ đọc/ghi dữ liệu của mình. → F33 (mới), mục 6, câu hỏi mở #10. *(Vòng 24: RLS đổi sang membership-based — xem mục 32.)*
63. **Offline-first + performance (phần kỹ thuật quan trọng nhất).** Local-first: optimistic update vào local state/IndexedDB ngay → UI phản hồi tức thời như chrome.storage cũ; đẩy lên Supabase ngầm; service worker cache app shell + local queue mutation khi mất mạng, replay khi online. Sync desktop↔mobile qua Supabase Realtime/polling nhẹ. Conflict: last-write-wins. → F10 viết lại, mục 6.
64. **Hosting/Deploy + HTTPS.** Web app cần hosting tĩnh (Vercel/Netlify/Cloudflare Pages — free tier đủ), **HTTPS bắt buộc** (PWA installability + Supabase auth callback). Khác hẳn extension. → mục 6, câu hỏi mở #9.
65. **Mobile responsive là redesign có chủ đích (không chỉ media query).** Mockup hiện tại desktop-first (3 khối ngang, slider % layout, drag-drop, masonry nhiều cột — đều là tương tác chuột). Mobile cần: khối xếp dọc, bỏ slider %/drag ngang (preset đơn giản), masonry 1 cột, modal full-screen. Ghi nhận yêu cầu; chi tiết do agent `uiux`. → F34 (mới), mục 4, câu hỏi mở #12.
66. **Chia build theo 3 giai đoạn** (mục 6b): GĐ1 = Ghi chú + auth + 1 Space + sync + offline-first (MVP pivot, kiểm chứng kiến trúc); GĐ2 = Việc cần làm + Nhắc việc + Thói quen + Thông báo; GĐ3 = đa Space + Settings tuỳ biến + Export/Import. → mục 6b (mới). *(Vòng 24: GĐ1 mở rộng gồm đa Space + shared space; xem mục 6b cập nhật + mục 32.)*
67. **Tiêu chí "gọn nhẹ" nới lại:** mốc bundle < 200KB của extension **không còn là ràng buộc cứng** (thêm runtime React + Supabase client + service worker), nhưng **vẫn ưu tiên nhẹ** (code-split theo giai đoạn, tải nhanh trên mobile). → mục 7 cập nhật.

## 31. Câu hỏi mở vòng 23 — ĐÃ CHỐT (2026-06-18)
> Các câu hỏi 1-8 (3 vòng đầu) đã chốt ở mục 8-10. Câu hỏi 9-14 phát sinh từ pivot, nay **đã được chủ dự án xác nhận** — sẵn sàng sang bước thiết kế UI (`uiux`) / code (`dev`).

9. **Hosting:** ✅ **Vercel** (free tier, tích hợp Vite tốt).
10. **Phương thức đăng nhập:** ✅ **Đăng nhập Google (OAuth qua Supabase Auth)** — bấm 1 nút, mượt trên cả desktop/mobile. Cần cấu hình Google OAuth client + redirect callback trong Supabase. Bỏ phương án magic-link/password.
11. **Mô hình chia sẻ dữ liệu:** ~~✅ **Mỗi user data hoàn toàn riêng** — RLS theo `auth.uid() = user_id`, KHÔNG share space giữa các user, KHÔNG cần bảng membership. (Đơn giản hoá; nếu sau này thực sự cần share thì xét lại ở GĐ3.)~~ **→ ĐẢO NGƯỢC ở vòng 24 (2026-06-19):** chủ dự án chốt **shared space** — người tạo Space **mời người khác qua email** để dùng chung; **mọi thành viên ngang quyền**; dữ liệu thuộc về **Space** (qua `space_members`), **RLS membership-based** (không còn `auth.uid() = user_id`); build **ngay GĐ1**. Xem mục 32 (vòng 24), F32 (mục 5.9), F36 (mục 5.11), mục 6 (model + RLS). Quyết định "data riêng" cũ **không còn áp dụng**.
12. **Trải nghiệm mobile GĐ1 (note nhanh):** ⏳ Giao agent `uiux` thiết kế chi tiết (nút thêm note dễ chạm, vào thẳng danh sách, bàn phím không che ô nhập...). Không chặn bước hiện tại.
13. **Push notification mobile:** ✅ **Chỉ hiển thị trong-app ở GĐ2**; cân nhắc Web Push sau nếu thực sự cần.
14. **Migrate dữ liệu cũ:** ✅ **Không cần** — bản extension chưa từng được build (chỉ có mockup tĩnh), không có dữ liệu production nào để chuyển. Bắt đầu mới hoàn toàn trên Supabase.

## 32. Cập nhật vòng 24 — chuyển sang SHARED SPACE (đảo ngược câu hỏi mở #11)
> **Bối cảnh:** chủ dự án **đảo ngược** quyết định "mỗi user data riêng" (đã chốt ở vòng 23, câu hỏi #11). Lý do: muốn **tạo Space rồi thêm người dùng khác vào để cùng sử dụng chung** (mô hình workspace kiểu Notion/Trello), không phải mỗi người 1 không gian tách biệt. Đây là phần ảnh hưởng schema/RLS lớn nhất mà dev đã cảnh báo — nay chốt theo hướng shared. Toàn bộ tính năng/UX sản phẩm khác **giữ nguyên**; chỉ đổi mô hình dữ liệu nền tảng + RLS + kéo đa Space/membership lên GĐ1.

68. **Chuyển từ "data riêng từng user" sang "shared space".** Người tạo Space mời người khác **qua email** để cùng dùng chung; **mọi thành viên ngang quyền** (xem/thêm/sửa/xoá mọi thứ trong space, kể cả quản lý thành viên); **không có vai trò owner/viewer** (giữ đơn giản); vẫn lưu `created_by` để ghi nhận ai tạo (không tạo đặc quyền). Build **ngay GĐ1**.
   - **Tham số đã chốt:** (a) cách thêm = mời qua email, người được mời đăng nhập Google đúng email đó là vào được; (b) phân quyền = mọi thành viên ngang quyền; (c) thời điểm = GĐ1.
   - **Tác động data model:** dữ liệu (notes/tasks/reminders/habits) gắn **`space_id`** (thuộc về space, không thuộc trực tiếp user); thêm bảng **`spaces`** (id, name, created_by, created_at), **`space_members`** (space_id, user_id, created_at), **`space_invites`** (pending-invite theo email cho người chưa đăng nhập). Settings hiển thị (theme/màu/layout) vẫn gắn **user** (`user_settings`). → mục 6 (model viết lại), F32d điều chỉnh, F36 (mới).
   - **Tác động RLS:** đổi từ `auth.uid() = user_id` sang **"user truy cập được 1 dòng nếu là thành viên của space chứa dòng đó"** (RLS qua subquery/join `space_members`). Phải test kỹ tránh rò rỉ dữ liệu giữa các space. → F33, mục 6.
   - **Tác động conflict resolution:** last-write-wins nay có thể xảy ra giữa **nhiều người** cùng sửa 1 space đồng thời (không chỉ giữa các thiết bị của 1 người). Vẫn chấp nhận cho quy mô nhỏ — **đánh đổi đã biết, ghi nhận rõ**. → F9, mục 6.
   - **Tác động phạm vi GĐ1:** GĐ1 **nở rộng** — không còn "Ghi chú + 1 Space duy nhất" tối giản, mà = đăng nhập Google + **tạo/chuyển nhiều Space** + **mời/quản lý thành viên qua email** + khối Ghi chú + sync realtime (cả giữa thành viên) + offline-first. Ghi nhận: GĐ1 nay **lớn hơn** mục tiêu "validate kiến trúc tối giản" ban đầu, nhưng là **lựa chọn có chủ đích** của chủ dự án. → mục 6b cập nhật, mục 3.
69. **Xử lý người được mời chưa có tài khoản (pending-invite).** Lưu lời mời theo **email** (bảng `space_invites`) cho tới khi người đó **lần đầu đăng nhập Google bằng đúng email đó**, lúc ấy tự **chuyển thành membership** (`space_members`). Cần cơ chế "resolve invite on first login" (trigger Supabase hoặc bước hậu-đăng-nhập ở client). → F36b.

> **Câu hỏi mở từ shared space — ĐÃ CHỐT (2026-06-19):**
> 15. **Xoá Space có nhiều thành viên:** ✅ **Chỉ người tạo space (`created_by`) mới xoá được cả space.** Đây là ngoại lệ có chủ đích so với "ngang quyền" — phần nội dung (notes/tasks/...) và quản lý thành viên vẫn ngang quyền, nhưng huỷ cả space (mất data mọi người) chỉ dành cho người tạo, tránh thành viên khác lỡ tay. → cập nhật F32c, F36g.
> 16. **Pending-invite & cơ chế mời:** ✅ **Chỉ tạo bản ghi chờ trong `space_invites`, KHÔNG gửi email thật.** Người được mời tự vào space khi **đăng nhập Google bằng đúng email được mời** (auto-join, không cần bước "chấp nhận"). Chưa đặt thời hạn hết hạn cho lời mời (có thể thêm sau). → F36b giữ nguyên hướng resolve-on-first-login.
> 17. **Giới hạn số thành viên / số Space:** ✅ **Chưa đặt trần cứng** (nhóm nhỏ tin nhau); có thể thêm cảnh báo nhẹ sau nếu cần.
> 18. **Rời / bị xoá khỏi space đang mở:** ✅ **Tự chuyển về space khác + hiện thông báo** khi space đang mở bị xoá hoặc user bị remove khỏi đó.
