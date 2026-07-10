# Design Tokens — KN-Space

Bảng tra cứu nhanh các CSS custom property định nghĩa ở `src/styles.css` (`:root` + `[data-theme="dark"]`). Dùng khi review alignment/spacing/màu cho UI mới — đối chiếu token thật thay vì dựa trí nhớ "pattern cũ đã dùng". Không lặp lại toàn bộ giá trị hex ở đây khi dễ đổi — chỉ ghi mục đích + nơi dùng; xem giá trị thật trực tiếp ở `src/styles.css`.

## Màu nền & bề mặt

| Token | Mục đích | Ghi chú |
|---|---|---|
| `--bg` | Nền toàn app phía sau lớp kính mờ | Off-black ở dark mode, không pure `#000`/`#fff` |
| `--panel-bg` | Nền card/block chính (glassmorphism alpha cao ~88-90%) | |
| `--modal-bg` | Nền modal | |
| `--raised` | Nền phần tử nổi lên trên panel (vd input, item trong list) | |
| `--border` | Viền mặc định | |
| `--border-control` | Viền phần tử tương tác (checkbox, circle habit) — đậm hơn `--border` vì nền sáng `--border` quá nhạt | |
| `--border-hairline` | Viền 1px tối giản cho card chính, nhạt hơn `--border` | |

## Màu chữ

| Token | Mục đích | Ghi chú |
|---|---|---|
| `--text` | Chữ chính | |
| `--text-dim` | Chữ phụ/hint | Đã qua UI audit 2026-07 để đạt contrast AA ≥4.5:1 trên cả `--raised`/`--panel-bg` — không tự đổi giá trị mà không kiểm tra lại contrast, xem `docs/features/ui-audit-2026-07.md` |

## Màu accent & theo khối dữ liệu

| Token | Mục đích |
|---|---|
| `--accent` | Màu thương hiệu chính (nút primary, focus ring, scrollbar) |
| `--task-color` | Khối Việc cần làm (= `--accent`) |
| `--recurring-color` | Việc lặp lại |
| `--habit-color` | Khối Thói quen |
| `--reminder-color` | Khối Nhắc việc — **cũng là màu quy ước cho hành động nguy hiểm/xoá** (xem `ConfirmModal.tsx`, `ErrorState.tsx`) |
| `--note-color` | Khối Ghi chú |
| `--log-color` | Khối Nhật ký nhanh — neutral slate, cố ý khác 5 màu khối còn lại, chỉ định nghĩa 1 lần ở `:root` (không override riêng theo dark mode) |
| `--done` | Trạng thái hoàn thành |
| `--purple`, `--amber` | 2 token bổ sung cho preset hạng mục chi tiêu (không đủ token màu khối nào khác biệt để tái dùng) |

## Hiệu ứng & chuyển động

| Token | Mục đích |
|---|---|
| `--shadow` | Đổ bóng card/panel |
| `--ease-standard` | Easing dùng chung cho modal/collapse/hover — chỉ animate `transform`/`opacity` |
| `--accent-rgb` | Dạng RGB của `--accent` để dùng trong `rgba()` (scrollbar, glow, nền icon nhạt) |

## Quy ước dùng token

- Mọi màu trong component **phải** qua biến CSS (`text-[var(--text-dim)]`, `bg-[var(--panel-bg)]`) — không hardcode hex mới trừ khi đúng là màu one-off không tái dùng (vd 2 token `--purple`/`--amber` ở trên là ví dụ hợp lệ khi thực sự không có token nào đủ khác biệt).
- Đa số token **không** override riêng theo `[data-theme="dark"]` (accent theo khối, `--shadow` là ngoại lệ có override) — nếu thêm token màu mới theo khối, mặc định không cần override dark mode trừ khi đo contrast thấy không đạt AA.
- `prefers-reduced-motion` đã được xử lý ở mức global (`src/styles.css`, cuối file) — animation lặp vô hạn (`animate-homeEnterBounce`, `animate-newestPulse`) tự tắt khi user bật giảm chuyển động; animation một lần (<250ms) giữ nguyên. Thêm animation lặp mới phải bổ sung vào danh sách tắt này.

## Nguồn tham chiếu

Giá trị thật (hex/rgba cụ thể) luôn lấy trực tiếp từ `src/styles.css` — file này chỉ là bảng tra mục đích, không phải bản sao giá trị (tránh lệch nhau khi giá trị đổi mà quên cập nhật ở đây).
