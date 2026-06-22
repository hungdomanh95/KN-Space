# KN-Space — Kế hoạch phát triển (plan)

## Chiến lược
**"Cá nhân trước, thương mại sau."** Build bản dùng được cho cá nhân trên desktop trước, bằng con đường đơn giản nhất; giữ cửa mở rộng (mobile, cloud sync, chia sẻ, thương mại) cho các phase sau mà **không phải làm lại từ đầu**.

Toàn bộ UX sản phẩm (5 khối, đa Space, masonry, streak, modal tuỳ biến, icon SVG…) đã chốt ở [requirements.md](../requirements.md). Các phase chỉ đổi **nền tảng / khả năng**, không đổi bản chất sản phẩm.

## Roadmap

| Phase | Mục tiêu | Nền tảng | Trạng thái |
|---|---|---|---|
| **1 — Extension cá nhân** | Full dashboard 5 khối dùng được trên desktop | Chrome Extension MV3 + React + TypeScript + Vite + `chrome.storage` | 🚧 **Đang làm** |
| 2 — PWA + Supabase | Đưa lên web, chạy mobile, sync cloud (vẫn cá nhân) | Tái dùng React app + vite-plugin-pwa + Supabase | ⏸ Hoãn |
| 3 — Shared space | Mời người khác cùng dùng chung 1 space | Supabase `space_members` + RLS membership | ⏸ Hoãn |
| 4 — Thương mại | Tạo doanh thu | Free/Pro tier + Stripe/Paddle | ⏸ Hoãn |

## Nguyên tắc
- Mỗi phase **ship được & dùng được độc lập**.
- **Giữ cửa** cho phase sau, nhưng **KHÔNG over-build** (không dựng backend/billing khi chưa cần).
- Chốt từng phase trước khi sang phase kế.

## Files
- [phase-1-extension.md](phase-1-extension.md) — 🚧 đang làm
- [phase-2-pwa-supabase.md](phase-2-pwa-supabase.md) — ⏸ hoãn
- [phase-3-shared-space.md](phase-3-shared-space.md) — ⏸ hoãn
- [phase-4-commercial.md](phase-4-commercial.md) — ⏸ hoãn
