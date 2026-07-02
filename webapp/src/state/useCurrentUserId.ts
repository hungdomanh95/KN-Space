import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

let cached: string | null = null;

export function useCurrentUserId(): string | null {
  const [id, setId] = useState<string | null>(cached);
  useEffect(() => {
    if (cached) { setId(cached); return; }
    supabase.auth.getUser().then(({ data }) => {
      cached = data.user?.id ?? null;
      setId(cached);
    });
  }, []);
  return id;
}
