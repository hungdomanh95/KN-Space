# Nội dung Store Listing — KN-Space

Dùng khi tạo item mới trong Chrome Web Store Developer Dashboard (chrome.google.com/webstore/devconsole).

## Thông tin cơ bản

- **Tên (Name):** KN-Space
- **Tóm tắt ngắn (Summary, tối đa 132 ký tự):**
  Dashboard năng suất cá nhân: việc cần làm, nhắc việc, thói quen, ghi chú và thông báo — mở ngay khi mở tab mới.
- **Danh mục (Category):** Productivity
- **Ngôn ngữ:** Tiếng Việt (Vietnamese)
- **Chế độ hiển thị (Visibility):** Unlisted — chỉ ai có link trực tiếp mới cài được, không hiện trong tìm kiếm/duyệt Store.

## Mô tả chi tiết (Detailed description)

```
KN-Space là dashboard năng suất cá nhân, mở ngay khi bạn mở tab mới trên Chrome.

5 khối quản lý gọn trong 1 màn hình:
• Việc cần làm — quản lý task một lần, theo dõi hoàn thành, lọc theo trạng thái.
• Nhắc việc — nhắc 1 lần hoặc lặp lại theo giờ/ngày/tháng.
• Thói quen — theo dõi streak, xem 7 ngày gần nhất.
• Ghi chú — note nhanh, xem dạng lưới hoặc danh sách, tìm kiếm, sắp xếp, ẩn nội dung tạm thời khi cần riêng tư.
• Thông báo — tự tổng hợp những việc/nhắc/thói quen cần chú ý hôm nay.

Tuỳ biến:
• Đa Space — tách riêng dữ liệu theo từng không gian (vd. Cá nhân / Công việc), bật/tắt từng khối theo Space.
• Theme sáng/tối, màu chủ đạo, ảnh nền, tỉ lệ bố cục, thứ tự khối — đổi qua Settings.
• Export/Import dữ liệu dạng JSON để backup hoặc chuyển máy.

Dữ liệu lưu hoàn toàn qua chrome.storage (đồng bộ theo tài khoản Google của bạn) —
không có backend, không tài khoản riêng, không quảng cáo, không theo dõi.
```

## Quyền cần giải trình khi nộp (Permission justification — tab "Privacy practices")

- **`storage`:**
  "Used to save the user's tasks, reminders, habits, notes and display settings locally via chrome.storage, so data persists across sessions and syncs across the user's own signed-in devices."
- **Ghi đè trang Tab mới (chrome_url_overrides.newtab):**
  "Replaces the New Tab page with the KN-Space dashboard, which is the core single purpose of this extension — a personal productivity dashboard shown on every new tab."
- **Single purpose description:**
  "KN-Space is a personal productivity dashboard (tasks, reminders, habits, notes, notifications) shown on the New Tab page."
- **Data usage disclosure (mục bắt buộc trả lời trong dashboard):**
  - Không thu thập dữ liệu cá nhân nào để gửi ra ngoài thiết bị người dùng.
  - Tích chọn "This item does not collect or use user data" nếu dashboard cho phép — vì toàn bộ dữ liệu chỉ ở local/sync storage của Chrome, extension không tự gửi đi đâu.
- **Privacy policy URL:** dùng link tới [privacy-policy.md](./privacy-policy.md) sau khi host (xem hướng dẫn host bên dưới).

## Ảnh/asset cần chuẩn bị

- Icon 128x128: đã có sẵn ở `extension/icons/icon128.png`.
- Ít nhất 1 screenshot (khuyến nghị 1280x800px): chụp màn hình dashboard thật sau khi load unpacked.
- Promo tile nhỏ (440x280) — không bắt buộc với Unlisted, có thể bỏ qua.

## Cách có URL cho privacy policy

`docs/store/privacy-policy.md` hiện chỉ là file trong repo, Chrome Web Store cần 1 **URL công khai**. 2 cách nhanh:

1. **GitHub raw link** (nhanh nhất, dùng tạm): nếu repo này public trên GitHub, dùng link dạng
   `https://raw.githubusercontent.com/<user>/<repo>/main/docs/store/privacy-policy.md`
2. **GitHub Pages** (chuyên nghiệp hơn): bật GitHub Pages cho repo, trỏ tới thư mục chứa file này dưới dạng `.html` — cần chuyển file `.md` này sang `.html` đơn giản nếu muốn hiển thị đẹp, nhưng `.md` raw cũng được Chrome Web Store chấp nhận trong thực tế với extension cá nhân/Unlisted.

## Việc CHỈ bạn tự làm được (không thể tự động qua agent)

1. Tạo Google Developer Account tại Chrome Web Store Developer Dashboard, trả phí đăng ký $5 (yêu cầu thẻ thanh toán + đăng nhập Google).
2. Upload file `extension/kn-space-extension.zip` (giữ nguyên field `key` trong manifest.json để ID khớp với bản đang test).
3. Điền các mục Store listing + Privacy practices theo nội dung phía trên.
4. Chọn Visibility = Unlisted, Submit for review.
5. Theo dõi trạng thái duyệt trong dashboard — có thể bị yêu cầu bổ sung giải trình do dùng `chrome_url_overrides.newtab`.
