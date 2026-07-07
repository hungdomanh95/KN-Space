const KEY = 'kn-space:current-space-id';

/**
 * "Space đang mở" là trạng thái ĐIỀU HƯỚNG của riêng từng máy/trình duyệt — KHÔNG phải dữ
 * liệu cần đồng bộ. Đổi Space trên desktop không nên kéo điện thoại đổi theo (và ngược lại),
 * dù cùng 1 tài khoản — giống việc mở 2 tab xem 2 chỗ khác nhau là bình thường. Lưu riêng
 * localStorage từng máy, KHÔNG gửi lên Supabase để dùng làm nguồn xác định Space hiện tại
 * (cột `current_space_id` trên server vẫn tồn tại để thoả NOT NULL, nhưng không ai đọc lại).
 */
export function readLocalCurrentSpaceId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // Private mode/storage bị chặn — bỏ qua, dùng fallback ở caller.
  }
}

export function writeLocalCurrentSpaceId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Im lặng bỏ qua — không có localStorage thì máy này không nhớ được, không phải lỗi nghiêm trọng.
  }
}
