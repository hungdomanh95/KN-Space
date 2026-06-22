# Chính sách quyền riêng tư — KN-Space

Cập nhật: 2026-06-23

KN-Space là tiện ích mở rộng (Chrome Extension) cá nhân dùng để quản lý việc cần làm, nhắc việc, thói quen và ghi chú ngay trên trình duyệt.

## Dữ liệu nào được xử lý

KN-Space lưu các dữ liệu sau, do chính người dùng nhập vào trong lúc sử dụng:

- Việc cần làm (tên, ngày/giờ, trạng thái hoàn thành)
- Nhắc việc (tên, lịch nhắc)
- Thói quen và lịch sử hoàn thành theo ngày
- Ghi chú (tiêu đề, nội dung, màu)
- Cấu hình hiển thị (theme, màu sắc, ảnh nền, bố cục, thứ tự khối)

## Dữ liệu được lưu ở đâu

Toàn bộ dữ liệu trên được lưu **cục bộ trong trình duyệt Chrome** của người dùng, thông qua API tiêu chuẩn `chrome.storage` (`chrome.storage.sync` và `chrome.storage.local`):

- `chrome.storage.sync`: được Google Chrome tự đồng bộ giữa các thiết bị **của cùng một tài khoản Google đã đăng nhập Chrome**, theo đúng cơ chế đồng bộ chuẩn của Chrome.
- `chrome.storage.local`: chỉ lưu trên máy hiện tại, dùng làm phương án dự phòng khi dữ liệu vượt giới hạn dung lượng của `chrome.storage.sync`.

## KN-Space KHÔNG làm gì với dữ liệu của bạn

- **Không** gửi dữ liệu tới bất kỳ máy chủ, dịch vụ bên thứ ba, hay máy chủ riêng nào của nhà phát triển.
- **Không** có backend, không có tài khoản đăng nhập riêng, không có quảng cáo, không theo dõi (tracking), không thu thập số liệu phân tích (analytics).
- **Không** chia sẻ, bán, hay chuyển giao dữ liệu cho bên thứ ba dưới bất kỳ hình thức nào.
- Việc đồng bộ dữ liệu giữa các thiết bị hoàn toàn do hạ tầng `chrome.storage.sync` của Google Chrome xử lý, KN-Space không tự thực hiện bất kỳ kết nối mạng nào.

## Quyền (permissions) mà extension yêu cầu

- `storage`: để lưu dữ liệu người dùng bằng `chrome.storage`, như mô tả ở trên.
- Ghi đè trang Tab mới (`chrome_url_overrides.newtab`): để hiển thị dashboard KN-Space mỗi khi mở tab mới, thay cho trang Tab mới mặc định của Chrome. Không có mục đích nào khác ngoài việc hiển thị giao diện chính của extension.

## Xoá dữ liệu

Người dùng có thể xoá toàn bộ dữ liệu bất kỳ lúc nào bằng cách xoá từng mục trong giao diện extension, hoặc gỡ extension / xoá dữ liệu tiện ích qua `chrome://extensions`.

## Liên hệ

Nếu có câu hỏi về chính sách này, vui lòng liên hệ qua email được cung cấp trong trang Chrome Web Store của extension.
