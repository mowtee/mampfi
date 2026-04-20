import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Member } from "../lib/api";

export function useEventContext(eventId: string, forDate: string, activeTab: string) {
  const qc = useQueryClient();
  const isDay = activeTab === "day";
  const isPayments = activeTab === "payments";
  const isMembers = activeTab === "members";
  const isHistory = activeTab === "history";

  // Static or slow-changing data gets longer staleTime to reduce refetches
  const STATIC = 5 * 60_000; // 5 min — event metadata, price items
  const MODERATE = 60_000; // 1 min — members list

  const ev = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => api.getEvent(eventId),
    enabled: !!eventId,
    staleTime: STATIC,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => api.getMe(), staleTime: STATIC });
  const price = useQuery({
    queryKey: ["price", eventId],
    queryFn: () => api.listPriceItems(eventId),
    enabled: !!eventId,
    staleTime: STATIC,
  });
  const priceAll = useQuery({
    queryKey: ["priceAll", eventId],
    queryFn: () => api.listPriceItems(eventId, true),
    enabled: !!eventId,
    staleTime: STATIC,
  });
  const members = useQuery({
    queryKey: ["members", eventId],
    queryFn: () => api.listMembers(eventId),
    enabled: !!eventId,
    staleTime: MODERATE,
    refetchInterval: isMembers ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

  const meId = meQ.data?.id;
  const meMember: Member | undefined = React.useMemo(
    () => (members.data || []).find((m) => m.user_id === meId),
    [members.data, meId],
  );

  // Intl formatting is cheap; React Compiler can't verify the optional-chain
  // deps here, so we skip manual memoization.
  let leftLocalDate: string | null = null;
  if (meMember?.left_at && ev.data) {
    const d = new Date(meMember.left_at);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: ev.data.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = fmt.formatToParts(d);
    const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value || "";
    leftLocalDate = `${get("year")}-${get("month")}-${get("day")}`;
  }

  const inactiveForDate = !!leftLocalDate && forDate >= leftLocalDate;

  const myOrder = useQuery({
    queryKey: ["myOrder", eventId, forDate],
    queryFn: () => api.getMyOrder(eventId, forDate),
    enabled: !!eventId && !inactiveForDate,
    retry: false,
  });
  const agg = useQuery({
    queryKey: ["agg", eventId, forDate],
    queryFn: () => api.aggregate(eventId, forDate),
    enabled: !!eventId,
  });
  const purchase = useQuery({
    queryKey: ["purchase", eventId, forDate],
    queryFn: () => api.getPurchase(eventId, forDate),
    enabled: !!eventId,
    retry: false,
  });
  const balances = useQuery({
    queryKey: ["balances", eventId],
    queryFn: () => api.getBalances(eventId),
    enabled: !!eventId,
  });
  const payments = useQuery({
    queryKey: ["payments", eventId],
    queryFn: () => api.listPayments(eventId),
    enabled: !!eventId,
  });

  const isOwner = meMember?.role === "owner";

  const invites = useQuery({
    queryKey: ["invites", eventId],
    queryFn: () => api.listInvites(eventId),
    enabled: !!eventId && !!isOwner,
    retry: false,
  });

  const memberLabel = React.useMemo(() => {
    const map = new Map<string, string>();
    members.data?.forEach((m) => {
      const label = (m.name && m.name.trim()) || m.email || m.user_id;
      map.set(m.user_id, label as string);
    });
    return (id?: string) => (id ? map.get(id) || id : "");
  }, [members.data]);

  const priceName = React.useMemo(() => {
    const dict: Record<string, string> = {};
    const list = priceAll.data ?? price.data ?? [];
    for (const pi of list) {
      if (pi && pi.id) dict[String(pi.id)] = String(pi.name || "");
    }
    return (id?: string) => (id ? dict[id] || "" : "");
  }, [priceAll.data, price.data]);

  const lockInfo = React.useMemo(() => {
    if (!ev.data) return { locked: false, label: "" };
    const tz = ev.data.timezone;
    const cutoffTime = String(ev.data.cutoff_time || "20:00").slice(0, 5);
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    const parts = fmt.formatToParts(new Date());
    const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value || "";
    const nowDate = `${get("year")}-${get("month")}-${get("day")}`;
    const nowHM = `${get("hour")}:${get("minute")}`;
    function prevDateStr(d: string) {
      const [y, m, da] = d.split("-").map(Number);
      const dt = new Date(Date.UTC(y, (m || 1) - 1, da || 1));
      dt.setUTCDate(dt.getUTCDate() - 1);
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    }
    const prev = prevDateStr(forDate);
    let locked = false;
    if (nowDate > prev) locked = true;
    else if (nowDate === prev) locked = nowHM >= cutoffTime;
    return { locked, cutoffTime };
  }, [ev.data, forDate]);

  const activePurchase = purchase.data && !purchase.data?.invalidated_at;
  const readOnly = !!activePurchase || lockInfo.locked || inactiveForDate;

  // statusChip removed — computed in DayTab with i18n

  // Tab-aware polling intervals
  const dayInterval: number | false = isDay
    ? inactiveForDate
      ? false
      : lockInfo.locked
        ? 60000
        : 8000
    : false;
  const payInterval: number | false = isPayments ? 8000 : false;

  // Polling registrations (TanStack Query dedupes by key)
  useQuery({
    queryKey: ["myOrder", eventId, forDate],
    queryFn: () => api.getMyOrder(eventId, forDate),
    enabled: !!eventId && isDay && !inactiveForDate,
    retry: false,
    refetchInterval: dayInterval,
    refetchIntervalInBackground: false,
  });
  useQuery({
    queryKey: ["agg", eventId, forDate],
    queryFn: () => api.aggregate(eventId, forDate),
    enabled: !!eventId,
    refetchInterval: dayInterval,
    refetchIntervalInBackground: false,
  });
  useQuery({
    queryKey: ["balances", eventId],
    queryFn: () => api.getBalances(eventId),
    enabled: !!eventId,
    refetchInterval: payInterval,
    refetchIntervalInBackground: false,
  });
  useQuery({
    queryKey: ["payments", eventId],
    queryFn: () => api.listPayments(eventId),
    enabled: !!eventId,
    refetchInterval: payInterval,
    refetchIntervalInBackground: false,
  });

  // Invalidate on tab change to pull fresh data immediately
  React.useEffect(() => {
    if (!eventId) return;
    if (isDay) {
      qc.invalidateQueries({ queryKey: ["myOrder", eventId, forDate] });
      qc.invalidateQueries({ queryKey: ["agg", eventId, forDate] });
      qc.invalidateQueries({ queryKey: ["purchase", eventId, forDate] });
    } else if (isPayments) {
      qc.invalidateQueries({ queryKey: ["payments", eventId] });
      qc.invalidateQueries({ queryKey: ["balances", eventId] });
    } else if (isHistory) {
      qc.invalidateQueries({ queryKey: ["purchases", eventId] });
      qc.invalidateQueries({ queryKey: ["personalHistory", eventId] });
    } else if (isMembers) {
      qc.invalidateQueries({ queryKey: ["members", eventId] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return {
    qc,
    ev,
    meQ,
    price,
    priceAll,
    members,
    myOrder,
    agg,
    purchase,
    balances,
    payments,
    invites,
    meId,
    meMember,
    isOwner,
    inactiveForDate,
    leftLocalDate,
    memberLabel,
    priceName,
    lockInfo,
    readOnly,
  };
}

export type EventContextType = ReturnType<typeof useEventContext>;
