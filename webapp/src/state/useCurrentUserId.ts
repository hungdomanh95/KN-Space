import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

let cached: string | null = null;

// Eager init: đọc session từ localStorage ngay khi module load — không cần network
// → khi component mount, cached đã có giá trị nếu user đã đăng nhập
void supabase.auth.getSession().then(({ data }) => {
  if (!cached && data.session?.user?.id) cached = data.session.user.id;
});

export function useCurrentUserId(): string | null {
  const [id, setId] = useState<string | null>(cached);
  useEffect(() => {
    if (cached) { setId(cached); return; }
    // getSession() đọc từ localStorage, không cần network round-trip
    supabase.auth.getSession().then(({ data }) => {
      cached = data.session?.user?.id ?? null;
      setId(cached);
    });
  }, []);
  return id;
}
