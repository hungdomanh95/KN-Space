# Phase 4 — Thương mại ⏸ HOÃN

> Chỉ xét sau khi sản phẩm đã dùng tốt cho cá nhân + nhóm nhỏ (Phase 1–3) và có tín hiệu nhu cầu thật. Đây là quyết định **chiến lược sản phẩm**, chưa thiết kế chi tiết.

## Mục tiêu
Tạo doanh thu mà không phá trải nghiệm bản miễn phí.

## Bối cảnh (từ thảo luận)
- Category "new-tab/productivity dashboard" trả phí **có bằng chứng** kiếm tiền được (vd. Momentum Plus). Thắng nhờ tệp free lớn → phễu Pro + marketing, không nhờ "là extension".
- **Chrome Web Store đã bỏ thanh toán trong store (2020–2021)** → mọi việc thu tiền phải qua **backend + cổng thanh toán riêng** (Stripe/Paddle). Vì vậy nền PWA + Supabase (Phase 2/3) là điều kiện cần.

## Hướng khả dĩ
- **Freemium**: free giới hạn (vd. số Space / số thành viên / dung lượng), **Pro** mở rộng + tính năng nâng cao.
- **B2B/team**: bán cho nhóm/công ty dùng chung (tận dụng shared space Phase 3).
- Thanh toán: Stripe/Paddle/Lemon Squeezy. Landing page + phễu free→Pro.

## KHÔNG làm sớm
Không dựng billing/Pro tier ở Phase 1–3. Chỉ giữ kiến trúc đa-tenant (spaces + membership) để sau này bật phễu là đủ, không phải làm lại data model.
