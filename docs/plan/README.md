# KN-Space — Kế hoạch phát triển (plan)

## Chiến lược
**"Cá nhân trước, thương mại sau."** Build bản dùng được cho cá nhân trước, bằng con đường đơn giản nhất; giữ cửa mở rộng (mobile, cloud sync, chia sẻ, thương mại) cho các phase sau mà **không phải làm lại từ đầu**.

Toàn bộ UX sản phẩm (5 khối, đa Space, masonry, streak, modal tuỳ biến, icon SVG…) đã chốt ở [requirements.md](../requirements.md). Các phase chỉ đổi **nền tảng / khả năng**, không đổi bản chất sản phẩm.

> Cập nhật quan trọng: **Phase 1 (Chrome Extension) đã bị thay thế hoàn toàn bởi Phase 2 (Web App)**. Thư mục `extension/` đã bị xoá khỏi repo. Lý do/diễn biến xem [phase-1-extension.md](phase-1-extension.md) (giữ lại làm lịch sử) và [phase-2-pwa-supabase.md](phase-2-pwa-supabase.md) (nền tảng hiện hành).

## Roadmap

| Phase | Mục tiêu | Nền tảng | Trạng thái |
|---|---|---|---|
| 1 — Extension cá nhân | Full dashboard 5 khối dùng được trên desktop | Chrome Extension MV3 + React + TypeScript + Vite + `chrome.storage` | ✅ **Đã thay thế bởi Phase 2** (không còn duy trì, code đã xoá khỏi repo) |
| **2 — Web App + Supabase** | Đưa lên web, chạy được cả desktop/mobile, sync cloud (vẫn cá nhân) | React + TypeScript + Vite + Tailwind, Supabase (Postgres + Auth + Realtime), Google OAuth, Vercel, PWA manifest | 🚧 **Đang làm** (Bước 1 + phần lớn Bước 2 đã build và chạy thật) |
| 3 — Shared space | Mời người khác cùng dùng chung 1 space | Supabase `space_members` + RLS membership | ⏸ Hoãn |
| 4 — Thương mại | Tạo doanh thu | Free/Pro tier + Stripe/Paddle | ⏸ Hoãn |

## Nguyên tắc
- Mỗi phase **ship được & dùng được độc lập**.
- **Giữ cửa** cho phase sau, nhưng **KHÔNG over-build** (không dựng backend/billing khi chưa cần).
- Chốt từng phase trước khi sang phase kế.
- Khi một phase thay thế hoàn toàn phase trước (như Phase 2 thay Phase 1), file plan của phase cũ **không bị xoá** — giữ lại làm lịch sử quyết định, chỉ đánh dấu trạng thái rõ ràng ở đầu file.

## Files
- [phase-1-extension.md](phase-1-extension.md) — ✅ đã hoàn thành, đã thay thế bởi Phase 2 (lịch sử)
- [phase-2-pwa-supabase.md](phase-2-pwa-supabase.md) — 🚧 đang làm, đã build và chạy thật một phần lớn
- [phase-3-shared-space.md](phase-3-shared-space.md) — ⏸ hoãn
- [phase-4-commercial.md](phase-4-commercial.md) — ⏸ hoãn
- [storage-decision.md](storage-decision.md) — ghi nhận quyết định storage cho Phase 1 (lịch sử, đã không còn áp dụng — xem [phase-2-pwa-supabase.md](phase-2-pwa-supabase.md) cho quyết định storage hiện hành)
