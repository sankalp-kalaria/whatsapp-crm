"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/types";

/**
 * Count of unread active notifications for the current user. Used by the
 * sidebar to surface a badge on the Notifications nav entry.
 */
export function useUnreadNotifications(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const refreshCount = async () => {
      const { count: unreadCount, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .is("read_at", null)
        .neq("status", "deleted");
      if (cancelled || error) return;
      setCount(unreadCount ?? 0);
    };

    refreshCount();

    const channel = supabase
      .channel("notifications-unread-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          refreshCount();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return count;
}
