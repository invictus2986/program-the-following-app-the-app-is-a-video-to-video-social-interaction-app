import { supabase } from "@/integrations/supabase/client";

// Returns set of user_ids that should be invisible to the current user
// (people they blocked + people who blocked them). Tracked by user_id so
// it survives username changes.
export async function getBlockedUserIds(currentUserId?: string | null): Promise<Set<string>> {
  if (!currentUserId) return new Set();
  const [{ data: outgoing }, { data: incoming }] = await Promise.all([
    supabase.from("blocks").select("blocked_id").eq("blocker_id", currentUserId),
    supabase.from("blocks").select("blocker_id").eq("blocked_id", currentUserId),
  ]);
  const set = new Set<string>();
  (outgoing ?? []).forEach((r: any) => set.add(r.blocked_id));
  (incoming ?? []).forEach((r: any) => set.add(r.blocker_id));
  return set;
}

export function filterByBlocks<T extends { user_id: string }>(rows: T[], blocked: Set<string>): T[] {
  if (!blocked.size) return rows;
  return rows.filter((r) => !blocked.has(r.user_id));
}

export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const { data } = await supabase
    .from("blocks")
    .select("blocker_id")
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`)
    .limit(1);
  return (data?.length ?? 0) > 0;
}
