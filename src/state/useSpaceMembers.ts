import { useEffect, useState } from 'react';
import { listMembers } from '../storage/sharedSpaceStore';
import type { SharedSpaceMember } from '../types';

const cache = new Map<string, SharedSpaceMember[]>();

export function useSpaceMembers(sharedSpaceId: string | undefined): SharedSpaceMember[] {
  const [members, setMembers] = useState<SharedSpaceMember[]>(
    sharedSpaceId ? (cache.get(sharedSpaceId) ?? []) : [],
  );
  useEffect(() => {
    if (!sharedSpaceId) { setMembers([]); return; }
    const cached = cache.get(sharedSpaceId);
    if (cached) { setMembers(cached); return; }
    listMembers(sharedSpaceId)
      .then((m) => { cache.set(sharedSpaceId, m); setMembers(m); })
      .catch(console.warn);
  }, [sharedSpaceId]);
  return members;
}
