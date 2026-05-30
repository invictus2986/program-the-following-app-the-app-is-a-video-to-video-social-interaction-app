import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Heart, MessageSquare, Bell, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import type { NotificationRow } from "@/hooks/useNotifications";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

type Actor = { user_id: string; username: string; display_name: string | null; avatar_url: string | null };
type Item = NotificationRow & { actor: Actor | null };

function NotificationsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const load = async () => {
    if (!user) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const { data: notifs } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    const list = (notifs ?? []) as NotificationRow[];
    const actorIds = Array.from(new Set(list.map((n) => n.actor_id)));
    let actors: Record<string, Actor> = {};
    if (actorIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id,username,display_name,avatar_url")
        .in("user_id", actorIds);
      actors = Object.fromEntries((profs ?? []).map((p) => [p.user_id, p as Actor]));
    }
    setItems(list.map((n) => ({ ...n, actor: actors[n.actor_id] ?? null })));
    setBusy(false);

    // Mark all as read
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`notif-list-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setItems((s) => s.filter((i) => i.id !== id));
  };

  const clearAll = async () => {
    if (!user) return;
    const { error } = await supabase.from("notifications").delete().eq("user_id", user.id);
    if (error) return toast.error(error.message);
    setItems([]);
    toast.success("All notifications cleared");
  };

  return (
    <AppShell>
      <div className="px-4 py-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <h1 className="text-2xl font-bold">Notifications</h1>
          </div>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll}>Clear all</Button>
          )}
        </div>

        {busy ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No notifications yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              When someone likes or replies to your videos, it will show up here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((n) => (
              <NotificationItem key={n.id} item={n} onDelete={() => remove(n.id)} />
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function NotificationItem({ item, onDelete }: { item: Item; onDelete: () => void }) {
  const actor = item.actor;
  const name = actor?.display_name || actor?.username || "Someone";
  const username = actor?.username;

  let icon = <Heart className="h-4 w-4 text-rose-500" />;
  let text = "interacted with your video";
  if (item.type === "like_video") {
    icon = <Heart className="h-4 w-4 text-rose-500" />;
    text = "liked your video";
  } else if (item.type === "reply_to_video") {
    icon = <MessageSquare className="h-4 w-4 text-primary" />;
    text = "replied to your video";
  } else if (item.type === "like_reply") {
    icon = <Heart className="h-4 w-4 text-rose-500" />;
    text = "liked your reply";
  }

  const linkProps = item.video_id
    ? { to: "/v/$videoId" as const, params: { videoId: item.video_id } }
    : null;

  const time = new Date(item.created_at);
  const ago = formatTimeAgo(time);

  return (
    <li className={`group rounded-xl border border-border p-3 flex items-start gap-3 ${item.read ? "" : "bg-muted/40"}`}>
      {linkProps ? (
        <Link {...linkProps} className="flex items-start gap-3 flex-1 min-w-0">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={actor?.avatar_url ?? undefined} />
            <AvatarFallback>{(name[0] ?? "?").toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm">
              <span className="font-semibold">{name}</span>
              {username && <span className="text-muted-foreground"> @{username}</span>}
              <span className="text-muted-foreground"> {text}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              {icon}
              <span>{ago}</span>
              <span className="text-primary underline ml-1">View video →</span>
            </div>
          </div>
        </Link>
      ) : (
        <div className="flex-1 min-w-0 text-sm">{text}</div>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100"
        title="Dismiss"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

function formatTimeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return date.toLocaleDateString();
}