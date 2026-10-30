"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Client, Investor, MessageTemplate, Notification } from "@/types";
import {
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  Clock,
  FileText,
  FileWarning,
  Landmark,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  Sparkles,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  buildClientExpiryItem,
  buildInvestorExpiryItem,
  recalculateNotificationOnTheSpot,
  type EnrichedNotification,
} from "@/lib/investors/check-expiries";

// Icon per notification type.
const TYPE_ICON: Record<Notification["type"], typeof Bell> = {
  conversation_assigned: UserPlus,
  agreement_expiring: Clock,
  agreement_expired: FileWarning,
  rent_expiring: Clock,
};

type NotificationFilterTab = "all" | "clients" | "investors";

interface DirectRecipientItem {
  key: string;
  notificationId?: string;
  entityType: "client" | "investor";
  entityId: string;
  name: string;
  phone: string;
  flatDetails?: string | null;
  endDate?: string | null;
  daysRemaining?: number;
  isExpired?: boolean;
  isDueToday?: boolean;
  daysStatusLabel?: string;
  title: string;
  body: string;
  whatsappMessage: string;
  isUnread?: boolean;
  createdAt?: string;
}

export default function NotificationsPage() {
  const t = useTranslations("Notifications");
  const router = useRouter();
  const { accountId } = useAuth();
  const [notifications, setNotifications] = useState<Notification[] | null>(
    null,
  );
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [clients, setClients] = useState<
    (Client & { investor?: Investor | null })[]
  >([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("auto");
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationFilterTab>("all");
  const [sendingKeys, setSendingKeys] = useState<Record<string, boolean>>({});
  const [sentKeys, setSentKeys] = useState<Record<string, string>>({});
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());
  // Timestamp state used so every calculation uses the current live date on the spot
  const [nowDate, setNowDate] = useState<Date>(() => new Date());

  const load = useCallback(
    async (showRefreshToast = false) => {
      if (!accountId) return;
      if (showRefreshToast) setRefreshing(true);

      // Update current reference date for on-the-spot calculation
      setNowDate(new Date());

      // Trigger expiry check so DB notifications are synced with today's date
      try {
        await fetch("/api/investors/check-expiries");
      } catch {
        // Non-fatal
      }

      const supabase = createClient();
      const [notifRes, invRes, clientRes, tplRes] = await Promise.all([
        supabase
          .from("notifications")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("investors")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false }),
        supabase
          .from("clients")
          .select("*, investor:investors(*)")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false }),
        supabase
          .from("message_templates")
          .select("*")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false }),
      ]);

      setRefreshing(false);

      if (notifRes.error) {
        setError(notifRes.error.message);
        return;
      }

      setNotifications((notifRes.data ?? []) as Notification[]);
      setInvestors((invRes.data ?? []) as Investor[]);
      setClients(
        (clientRes.data ?? []) as (Client & { investor?: Investor | null })[],
      );
      setTemplates((tplRes.data ?? []) as MessageTemplate[]);

      if (showRefreshToast) {
        toast.success("Notifications recalculated with current date");
      }
    },
    [accountId],
  );

  const handleSyncTemplates = useCallback(async () => {
    setSyncingTemplates(true);
    try {
      const res = await fetch("/api/notifications/templates", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Failed to sync notification templates");
        return;
      }
      if (Array.isArray(data.templates)) {
        setTemplates(data.templates);
      }
      toast.success(
        "Synced Notification & Reminder Templates with Meta WhatsApp API",
      );
    } catch {
      toast.error("Failed to sync templates");
    } finally {
      setSyncingTemplates(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Realtime — new assignments/notifications or changes to clients/investors recalculate on the spot
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload) => {
          setNowDate(new Date());
          if (payload.eventType === "INSERT") {
            const row = payload.new as Notification;
            setNotifications((prev) => {
              if (!prev) return [row];
              if (prev.some((n) => n.id === row.id)) return prev;
              return [row, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Notification;
            setNotifications(
              (prev) =>
                prev?.map((n) => (n.id === row.id ? { ...n, ...row } : n)) ??
                prev,
            );
          } else if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Partial<Notification>;
            setNotifications(
              (prev) => prev?.filter((n) => n.id !== oldRow.id) ?? prev,
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "investors" },
        () => {
          load();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clients" },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  // On-the-spot recalculated notifications using current date (`nowDate`)
  const enrichedNotifications: EnrichedNotification[] = useMemo(() => {
    if (!notifications) return [];
    return notifications.map((n) =>
      recalculateNotificationOnTheSpot(n, investors, clients, nowDate),
    );
  }, [notifications, investors, clients, nowDate]);

  // Build complete on-the-spot Client & Investor items so every client and every investor
  // has a "Send Notification" button and live days calculation (past or due)
  const clientNotificationItems: DirectRecipientItem[] = useMemo(() => {
    return clients.map((cl) => {
      const built = buildClientExpiryItem(cl, nowDate);
      const matchingNotif = enrichedNotifications.find(
        (n) =>
          (n.recipientType === "client" && n.recipientEntityId === cl.id) ||
          (n.entity_type === "client" && n.entity_id === cl.id),
      );
      const flatName = cl.investor?.purchase_flat_details || "Rented Unit";

      if (built) {
        return {
          key: `client-${cl.id}`,
          notificationId: matchingNotif?.id,
          entityType: "client" as const,
          entityId: cl.id,
          name: cl.name,
          phone: cl.phone,
          flatDetails: flatName,
          endDate: built.endDate,
          daysRemaining: built.daysRemaining,
          isExpired: built.isExpired,
          isDueToday: built.isDueToday,
          daysStatusLabel: built.daysStatusLabel,
          title: built.notificationTitle,
          body: built.notificationBody,
          whatsappMessage: built.suggestedWhatsAppMessage,
          isUnread: matchingNotif ? !matchingNotif.read_at : false,
          createdAt: matchingNotif?.created_at || cl.updated_at || cl.created_at,
        };
      }

      const defaultMsg = `Hello ${cl.name}, this is an update regarding your tenancy agreement for ${flatName}. Please let us know if you need any assistance.`;
      return {
        key: `client-${cl.id}`,
        notificationId: matchingNotif?.id,
        entityType: "client" as const,
        entityId: cl.id,
        name: cl.name,
        phone: cl.phone,
        flatDetails: flatName,
        endDate: cl.agreement_end_date,
        title: `Client Notification: ${cl.name}`,
        body: `Tenancy status: ${cl.status.replace(/_/g, " ")} • Contact: ${cl.phone}`,
        whatsappMessage: defaultMsg,
        isUnread: matchingNotif ? !matchingNotif.read_at : false,
        createdAt: matchingNotif?.created_at || cl.updated_at || cl.created_at,
      };
    });
  }, [clients, enrichedNotifications, nowDate]);

  const investorNotificationItems: DirectRecipientItem[] = useMemo(() => {
    return investors.map((inv) => {
      const built = buildInvestorExpiryItem(inv, nowDate);
      const matchingNotif = enrichedNotifications.find(
        (n) =>
          (n.recipientType === "investor" && n.recipientEntityId === inv.id) ||
          (n.entity_type === "investor" && n.entity_id === inv.id),
      );
      const flatName = inv.purchase_flat_details || "Flat/Property";

      if (built) {
        return {
          key: `investor-${inv.id}`,
          notificationId: matchingNotif?.id,
          entityType: "investor" as const,
          entityId: inv.id,
          name: inv.name,
          phone: inv.phone,
          flatDetails: flatName,
          endDate: built.endDate,
          daysRemaining: built.daysRemaining,
          isExpired: built.isExpired,
          isDueToday: built.isDueToday,
          daysStatusLabel: built.daysStatusLabel,
          title: built.notificationTitle,
          body: built.notificationBody,
          whatsappMessage: built.suggestedWhatsAppMessage,
          isUnread: matchingNotif ? !matchingNotif.read_at : false,
          createdAt:
            matchingNotif?.created_at || inv.updated_at || inv.created_at,
        };
      }

      const defaultMsg = `Hello ${inv.name}, this is an update regarding your property (${flatName}). Please let us know if you have any questions.`;
      return {
        key: `investor-${inv.id}`,
        notificationId: matchingNotif?.id,
        entityType: "investor" as const,
        entityId: inv.id,
        name: inv.name,
        phone: inv.phone,
        flatDetails: flatName,
        endDate: inv.agreement_end_date || inv.rent_end_date,
        title: `Investor Notification: ${inv.name} (${flatName})`,
        body: `Rental status: ${inv.rental_status.replace(/_/g, " ")} • Contact: ${inv.phone}`,
        whatsappMessage: defaultMsg,
        isUnread: matchingNotif ? !matchingNotif.read_at : false,
        createdAt:
          matchingNotif?.created_at || inv.updated_at || inv.created_at,
      };
    });
  }, [investors, enrichedNotifications, nowDate]);

  const deleteNotification = useCallback(
    async (e: React.MouseEvent, notificationId?: string, cardKey?: string) => {
      e.stopPropagation();

      if (cardKey) {
        setDismissedKeys((prev) => new Set(prev).add(cardKey));
      }
      if (notificationId) {
        setNotifications(
          (prev) => prev?.filter((n) => n.id !== notificationId) ?? prev,
        );
        try {
          const res = await fetch(
            `/api/notifications?id=${encodeURIComponent(notificationId)}`,
            { method: "DELETE" },
          );
          if (!res.ok) {
            const supabase = createClient();
            await supabase
              .from("notifications")
              .delete()
              .eq("id", notificationId);
          }
          toast.success("Notification deleted");
        } catch {
          toast.error("Failed to delete notification");
        }
      } else {
        toast.success("Notification removed");
      }
    },
    [],
  );

  const markRead = useCallback(
    async (id: string) => {
      setNotifications(
        (prev) =>
          prev?.map((n) =>
            n.id === id && !n.read_at
              ? { ...n, read_at: new Date().toISOString() }
              : n,
          ) ?? prev,
      );
      const supabase = createClient();
      const { error: updateErr } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .is("read_at", null);
      if (updateErr) {
        toast.error(t("markReadFailed"));
        load();
      }
    },
    [load, t],
  );

  const handleSendWhatsAppNotification = useCallback(
    async (
      e: React.MouseEvent,
      params: {
        key: string;
        notificationId?: string;
        entityType?: "investor" | "client";
        entityId?: string;
        phone?: string;
        name?: string;
        message?: string;
        flatDetails?: string | null;
        endDate?: string | null;
        daysStatusLabel?: string | null;
        forceTemplate?: boolean;
        templateName?: string;
      },
    ) => {
      e.stopPropagation();

      if (!params.phone && !params.entityId) {
        toast.error("No contact phone number available for this notification.");
        return;
      }

      const chosenTemplate =
        params.templateName ||
        (selectedTemplate !== "auto" ? selectedTemplate : undefined);
      const shouldForceTemplate =
        Boolean(params.forceTemplate) || Boolean(chosenTemplate);

      setSendingKeys((prev) => ({ ...prev, [params.key]: true }));
      try {
        const res = await fetch("/api/notifications/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notificationId: params.notificationId,
            entityType: params.entityType,
            entityId: params.entityId,
            phone: params.phone,
            name: params.name,
            message: params.message,
            flatDetails: params.flatDetails,
            endDate: params.endDate,
            daysStatusLabel: params.daysStatusLabel,
            forceTemplate: shouldForceTemplate,
            templateName: chosenTemplate,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.fallbackWaLink) {
            toast.error(
              data.error ||
                "WhatsApp API could not deliver directly — opening WhatsApp chat.",
            );
            window.open(data.fallbackWaLink, "_blank");
          } else {
            toast.error(data.error || "Failed to send notification");
          }
          return;
        }

        const modeLabel =
          data.sentAs === "template"
            ? `Sent via Template (${data.templateName})`
            : "Notification Sent";

        setSentKeys((prev) => ({ ...prev, [params.key]: modeLabel }));
        if (params.notificationId) {
          setNotifications(
            (prev) =>
              prev?.map((n) =>
                n.id === params.notificationId && !n.read_at
                  ? { ...n, read_at: new Date().toISOString() }
                  : n,
              ) ?? prev,
          );
        }

        if (data.sentAs === "template") {
          toast.success(
            `Notification template "${data.templateName}" sent to ${data.recipientName || params.name || "recipient"} (${data.recipientPhone || params.phone})`,
          );
        } else {
          toast.success(
            `Notification sent to ${data.recipientName || params.name || "recipient"} (${data.recipientPhone || params.phone})`,
          );
        }
      } catch {
        toast.error("Network error while sending notification");
      } finally {
        setSendingKeys((prev) => ({ ...prev, [params.key]: false }));
      }
    },
    [selectedTemplate],
  );

  const handleClick = useCallback(
    (n: EnrichedNotification) => {
      if (!n.read_at) markRead(n.id);
      if (n.entity_type === "investor" || n.recipientType === "investor") {
        router.push("/investors");
      } else if (n.entity_type === "client" || n.recipientType === "client") {
        router.push("/clients");
      } else if (n.conversation_id) {
        router.push(`/inbox?c=${n.conversation_id}`);
      }
    },
    [markRead, router],
  );

  const unreadIds =
    notifications?.filter((n) => !n.read_at).map((n) => n.id) ?? [];

  const markAllRead = useCallback(async () => {
    if (unreadIds.length === 0) return;
    setMarkingAll(true);
    const now = new Date().toISOString();
    setNotifications(
      (prev) =>
        prev?.map((n) => (n.read_at ? n : { ...n, read_at: now })) ?? prev,
    );
    const supabase = createClient();
    const { error: updateErr } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .is("read_at", null);
    setMarkingAll(false);
    if (updateErr) {
      toast.error(t("markAllFailed"));
      load();
    }
  }, [unreadIds.length, load, t]);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  if (notifications === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const todayFormatted = nowDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const approvedTemplates = templates.filter(
    (tpl) => (tpl.status || "").toUpperCase() === "APPROVED",
  );

  const renderDaysBadge = (item: {
    daysRemaining?: number;
    isExpired?: boolean;
    isDueToday?: boolean;
    daysStatusLabel?: string;
    endDate?: string | null;
  }) => {
    if (!item.daysStatusLabel) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
          item.isExpired
            ? "border border-red-500/30 bg-red-500/10 text-red-400"
            : item.isDueToday
              ? "border border-orange-500/30 bg-orange-500/10 text-orange-400"
              : (item.daysRemaining ?? 999) <= 30
                ? "border border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        )}
      >
        <CalendarClock className="size-3" />
        {item.daysStatusLabel}
        {item.endDate ? ` • ${item.endDate}` : ""}
      </span>
    );
  };

  const renderRecipientCard = (item: DirectRecipientItem) => {
    if (dismissedKeys.has(item.key)) return null;
    const isSending = !!sendingKeys[item.key];
    const sentLabel = sentKeys[item.key];
    const EntityIcon = item.entityType === "investor" ? Landmark : UserCheck;

    return (
      <li key={item.key}>
        <div
          onClick={() =>
            router.push(
              item.entityType === "investor" ? "/investors" : "/clients",
            )
          }
          className={cn(
            "flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border p-4 transition-colors cursor-pointer",
            item.isUnread
              ? "border-primary/30 bg-primary/5 hover:border-primary/50"
              : "border-border bg-card hover:border-border/70",
          )}
        >
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={cn(
                "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
                item.isExpired
                  ? "bg-red-500/15 text-red-400"
                  : item.entityType === "investor"
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-primary/15 text-primary",
              )}
            >
              <EntityIcon className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {item.entityType === "investor" ? "Investor" : "Client"}
                </span>
                <span className="text-sm font-semibold text-foreground truncate">
                  {item.name}
                </span>
                {item.phone && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="size-3" />
                    {item.phone}
                  </span>
                )}
                {renderDaysBadge(item)}
              </div>

              <p className="text-xs font-medium text-foreground/90">
                {item.title}
              </p>
              <p className="text-xs text-muted-foreground">{item.body}</p>
              <p className="text-[11px] text-muted-foreground/80 bg-muted/40 rounded-md px-2.5 py-1.5 border border-border/50">
                <span className="font-medium text-foreground/80">
                  WhatsApp Message:{" "}
                </span>
                {item.whatsappMessage}
              </p>
            </div>
          </div>

          <div
            className="flex items-center gap-2 self-end sm:self-center shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              type="button"
              size="sm"
              disabled={isSending || !item.phone}
              onClick={(e) =>
                handleSendWhatsAppNotification(e, {
                  key: item.key,
                  notificationId: item.notificationId,
                  entityType: item.entityType,
                  entityId: item.entityId,
                  phone: item.phone,
                  name: item.name,
                  message: item.whatsappMessage,
                  flatDetails: item.flatDetails,
                  endDate: item.endDate,
                  daysStatusLabel: item.daysStatusLabel,
                })
              }
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm"
            >
              {isSending ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : sentLabel ? (
                <Check className="size-3.5 mr-1.5" />
              ) : (
                <Send className="size-3.5 mr-1.5" />
              )}
              {isSending
                ? "Sending..."
                : sentLabel
                  ? sentLabel
                  : "Send Notification"}
            </Button>

            {item.phone && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                title="Open in WhatsApp"
                onClick={(e) => {
                  e.stopPropagation();
                  const clean = item.phone.replace(/[^0-9]/g, "");
                  const normalized =
                    clean.length === 10 && /^[6-9]\d{9}$/.test(clean)
                      ? `91${clean}`
                      : clean;
                  window.open(
                    `https://wa.me/${normalized}?text=${encodeURIComponent(item.whatsappMessage)}`,
                    "_blank",
                  );
                }}
                className="text-xs px-2.5"
              >
                <MessageSquare className="size-3.5" />
              </Button>
            )}

            <button
              type="button"
              title="Delete notification"
              aria-label="Delete notification"
              onClick={(e) =>
                deleteNotification(e, item.notificationId, item.key)
              }
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              <CalendarClock className="size-3.5" />
              Live Calculation • Today: {todayFormatted}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            All agreement &amp; rental notification days are calculated on the
            spot from today&apos;s date (past due or upcoming). Automatically
            uses Approved WhatsApp Templates when outside the 24-hour customer
            reply window.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={syncingTemplates}
            onClick={handleSyncTemplates}
            title="Create & sync Agreement Notification and Reminder templates with Meta WhatsApp API"
          >
            {syncingTemplates ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1.5 text-emerald-400" />
            )}
            Sync Notification Templates
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => load(true)}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-1.5", refreshing && "animate-spin")}
            />
            Recalculate Now
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={unreadIds.length === 0 || markingAll}
            onClick={markAllRead}
          >
            {markingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            {t("markAllRead")}
          </Button>
        </div>
      </div>

      {/* WhatsApp Notification & Reminder Template Selector Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <FileText className="size-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">
              WhatsApp 24h Window &amp; Reminder Template Mode
            </p>
            <p className="text-[11px] text-muted-foreground">
              When a client/investor hasn&apos;t replied in the last 24 hours
              (Meta code 131047), notifications are automatically delivered
              using an Approved WhatsApp Template (
              <code className="text-emerald-400">
                agreement_notification_alert
              </code>{" "}
              /{" "}
              <code className="text-emerald-400">
                agreement_reminder_template
              </code>
              ).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <label
            htmlFor="notif-template-select"
            className="text-xs font-medium text-muted-foreground whitespace-nowrap"
          >
            Delivery Mode:
          </label>
          <select
            id="notif-template-select"
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="h-8 rounded-md border border-border bg-card px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="auto">
              Auto (24h Text / Approved Template Fallback)
            </option>
            {approvedTemplates.map((tpl) => (
              <option key={tpl.id} value={tpl.name}>
                Template: {tpl.name} ({tpl.status})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter Tabs: All Notifications / Clients / Investors */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <Button
          variant={activeTab === "all" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("all")}
          className="text-xs"
        >
          <Bell className="size-3.5 mr-1.5" />
          All Notifications ({enrichedNotifications.length})
        </Button>
        <Button
          variant={activeTab === "clients" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("clients")}
          className="text-xs"
        >
          <UserCheck className="size-3.5 mr-1.5" />
          Clients ({clientNotificationItems.length})
        </Button>
        <Button
          variant={activeTab === "investors" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("investors")}
          className="text-xs"
        >
          <Landmark className="size-3.5 mr-1.5" />
          Investors ({investorNotificationItems.length})
        </Button>
      </div>

      {activeTab === "clients" ? (
        clientNotificationItems.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
            <UserCheck className="h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">
              No clients found
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {clientNotificationItems.map(renderRecipientCard)}
          </ul>
        )
      ) : activeTab === "investors" ? (
        investorNotificationItems.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
            <Landmark className="h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">
              No investors found
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {investorNotificationItems.map(renderRecipientCard)}
          </ul>
        )
      ) : (
        <div className="space-y-6">
          {/* System Notifications List (with on-the-spot days calculation & Send Notification button) */}
          {enrichedNotifications.length === 0 &&
          clientNotificationItems.length === 0 &&
          investorNotificationItems.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <p className="mt-3 text-sm font-medium text-foreground">
                {t("emptyTitle")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("emptyDesc")}
              </p>
            </div>
          ) : (
            <>
              {enrichedNotifications.length > 0 && (
                <ul className="space-y-2.5">
                  {enrichedNotifications.map((n) => {
                    const Icon = TYPE_ICON[n.type] ?? Bell;
                    const isUnread = !n.read_at;
                    const rowKey = `notif-${n.id}`;
                    const isSending = !!sendingKeys[rowKey];
                    const sentLabel = sentKeys[rowKey];
                    const hasRecipient = !!(
                      n.recipientPhone ||
                      n.recipientEntityId ||
                      n.entity_type === "investor" ||
                      n.entity_type === "client"
                    );

                    return (
                      <li key={n.id}>
                        <div
                          onClick={() => handleClick(n)}
                          className={cn(
                            "flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors cursor-pointer",
                            isUnread
                              ? "border-primary/30 bg-primary/5 hover:border-primary/50"
                              : "border-border bg-card hover:border-border/70",
                          )}
                        >
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div
                              className={cn(
                                "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
                                n.isExpired
                                  ? "bg-red-500/15"
                                  : isUnread
                                    ? "bg-primary/15"
                                    : "bg-muted",
                              )}
                              aria-hidden
                            >
                              <Icon
                                className={cn(
                                  "h-5 w-5",
                                  n.isExpired
                                    ? "text-red-400"
                                    : isUnread
                                      ? "text-primary"
                                      : "text-muted-foreground",
                                )}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                {n.recipientType && (
                                  <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    {n.recipientType === "investor"
                                      ? "Investor"
                                      : "Client"}
                                  </span>
                                )}
                                <span
                                  className={cn(
                                    "text-sm font-semibold",
                                    isUnread
                                      ? "text-foreground"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {n.liveTitle}
                                </span>
                                {n.recipientPhone && (
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <Phone className="size-3" />
                                    {n.recipientPhone}
                                  </span>
                                )}
                                {renderDaysBadge(n)}
                                {isUnread && (
                                  <span
                                    aria-label={t("unread")}
                                    className="h-2 w-2 flex-shrink-0 rounded-full bg-primary"
                                  />
                                )}
                              </div>
                              {n.liveBody && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {n.liveBody}
                                </p>
                              )}
                              <p className="mt-1 text-[11px] text-muted-foreground/70">
                                {formatDistanceToNow(new Date(n.created_at), {
                                  addSuffix: true,
                                })}
                              </p>
                            </div>
                          </div>

                          <div
                            className="flex items-center gap-2 self-end sm:self-center shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {hasRecipient && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={isSending}
                                  onClick={(e) =>
                                    handleSendWhatsAppNotification(e, {
                                      key: rowKey,
                                      notificationId: n.id,
                                      entityType:
                                        n.recipientType ||
                                        (n.entity_type === "investor" ||
                                        n.entity_type === "client"
                                          ? n.entity_type
                                          : undefined),
                                      entityId:
                                        n.recipientEntityId || n.entity_id,
                                      phone: n.recipientPhone,
                                      name: n.recipientName,
                                      message:
                                        n.suggestedWhatsAppMessage ||
                                        n.liveBody ||
                                        n.liveTitle,
                                      flatDetails: n.flatDetails,
                                      endDate: n.endDate,
                                      daysStatusLabel: n.daysStatusLabel,
                                    })
                                  }
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm"
                                >
                                  {isSending ? (
                                    <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                                  ) : sentLabel ? (
                                    <Check className="size-3.5 mr-1.5" />
                                  ) : (
                                    <Send className="size-3.5 mr-1.5" />
                                  )}
                                  {isSending
                                    ? "Sending..."
                                    : sentLabel
                                      ? sentLabel
                                      : "Send Notification"}
                                </Button>

                                {n.recipientPhone && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    title="Open in WhatsApp"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const clean = (
                                        n.recipientPhone || ""
                                      ).replace(/[^0-9]/g, "");
                                      const normalized =
                                        clean.length === 10 &&
                                        /^[6-9]\d{9}$/.test(clean)
                                          ? `91${clean}`
                                          : clean;
                                      const msg =
                                        n.suggestedWhatsAppMessage ||
                                        n.liveBody ||
                                        n.liveTitle;
                                      window.open(
                                        `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`,
                                        "_blank",
                                      );
                                    }}
                                    className="text-xs px-2.5"
                                  >
                                    <MessageSquare className="size-3.5" />
                                  </Button>
                                )}
                              </>
                            )}

                            <button
                              type="button"
                              title="Delete notification"
                              aria-label="Delete notification"
                              onClick={(e) =>
                                deleteNotification(e, n.id, rowKey)
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {/* Direct Client & Investor Notification Sections on the All tab */}
              {clientNotificationItems.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <UserCheck className="size-4 text-primary" />
                      Client Notifications ({clientNotificationItems.length})
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      Calculated on the spot from {todayFormatted}
                    </span>
                  </div>
                  <ul className="space-y-2.5">
                    {clientNotificationItems.map(renderRecipientCard)}
                  </ul>
                </div>
              )}

              {investorNotificationItems.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Landmark className="size-4 text-amber-400" />
                      Investor Notifications ({investorNotificationItems.length})
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      Calculated on the spot from {todayFormatted}
                    </span>
                  </div>
                  <ul className="space-y-2.5">
                    {investorNotificationItems.map(renderRecipientCard)}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
