import React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatYMDToLocale } from "../../lib/date";
import { formatMoney } from "../../lib/money";
import { useHolidays } from "../../lib/holidays";
import { useEventContext } from "../../hooks/useEventContext";
import DayTab from "./DayTab";
import PaymentsTab from "./PaymentsTab";
import HistoryTab from "./HistoryTab";
import MembersTab from "./MembersTab";
import AdminTab from "./AdminTab";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, days: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export default function EventDetail() {
  const { eventId = "" } = useParams();
  const [forDate, setForDate] = React.useState<string>(() =>
    isoDate(new Date(Date.now() + 24 * 3600 * 1000)),
  );
  const [search, setSearch] = useSearchParams();
  const activeTab = (search.get("tab") || "day") as
    | "day"
    | "history"
    | "payments"
    | "members"
    | "admin";
  const setTab = (tab: string) =>
    setSearch((prev) => {
      const n = new URLSearchParams(prev);
      n.set("tab", tab);
      return n;
    });

  const { t } = useTranslation();

  // Prime the event-bounds query ahead of the full context so we can clamp
  // forDate before downstream queries fire. Shares its queryKey with the one
  // inside useEventContext, so TanStack Query dedupes the request.
  const evBounds = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => api.getEvent(eventId),
    enabled: !!eventId,
    staleTime: 5 * 60_000,
  });
  const startDate = evBounds.data?.start_date;
  const endDate = evBounds.data?.end_date;

  // Derivation (not effect-based sync) keeps downstream queries stable.
  const effectiveForDate = React.useMemo(() => {
    if (!startDate || !endDate) return forDate;
    if (forDate < startDate) return startDate;
    if (forDate > endDate) return endDate;
    return forDate;
  }, [forDate, startDate, endDate]);

  const ctx = useEventContext(eventId, effectiveForDate, activeTab);
  const { ev, meMember, isOwner, qc, balances, meId } = ctx;

  const holidayCountry = ev.data?.holiday_country_code;
  const holidayRegion = ev.data?.holiday_region_code;
  const holidays = useHolidays(
    holidayCountry,
    holidayRegion,
    ev.data?.start_date,
    ev.data?.end_date,
  );

  const prevDisabled = !!startDate && effectiveForDate <= startDate;
  const nextDisabled = !!endDate && effectiveForDate >= endDate;

  function changeDate(newDate: string) {
    setForDate(newDate);
    if (!eventId) return;
    qc.invalidateQueries({ queryKey: ["myOrder", eventId, newDate] });
    qc.invalidateQueries({ queryKey: ["agg", eventId, newDate] });
    qc.invalidateQueries({ queryKey: ["purchase", eventId, newDate] });
  }

  // Invalidate when date changes
  React.useEffect(() => {
    if (!eventId) return;
    qc.invalidateQueries({ queryKey: ["myOrder", eventId, effectiveForDate] });
    qc.invalidateQueries({ queryKey: ["agg", eventId, effectiveForDate] });
    qc.invalidateQueries({ queryKey: ["purchase", eventId, effectiveForDate] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveForDate]);

  if (ev.isLoading) return <p className="muted">{t("app.loading")}</p>;
  if (ev.error) return <p className="danger">{String(ev.error)}</p>;
  if (!ev.data) return <p className="danger">Event not found</p>;

  return (
    <div>
      <p>
        <Link to="/" className="btn ghost">
          ← {t("app.back")}
        </Link>
      </p>
      <h2 style={{ margin: "8px 0 4px" }}>
        <strong>{ev.data.name}</strong>
      </h2>
      <div className="row" style={{ alignItems: "center" }}>
        <div className="muted">
          {formatYMDToLocale(ev.data.start_date)} → {formatYMDToLocale(ev.data.end_date)} •{" "}
          {ev.data.currency}
        </div>
        {(() => {
          const m = meMember;
          if (!m) return null;
          if (m.left_at) {
            const left = new Date(m.left_at);
            const myBal = Number(
              (balances.data?.totals || []).find((b) => b.user_id === meId)?.balance_minor || 0,
            );
            if (myBal !== 0) {
              return (
                <span className="chip warn" style={{ marginLeft: 8 }}>
                  {t("events.removedNeedSettle", {
                    date: left.toLocaleDateString(),
                    amount: formatMoney(Math.abs(myBal), balances.data?.currency || ""),
                  })}
                </span>
              );
            }
            return (
              <span className="chip muted" style={{ marginLeft: 8 }}>
                {t("events.youLeftOn", { date: left.toLocaleDateString() })}
              </span>
            );
          }
          return (
            <>
              <span className="chip open" style={{ marginLeft: 8 }}>
                {t("events.activeMember")}
              </span>
              {isOwner && (
                <span
                  className="chip"
                  style={{ marginLeft: 4, fontWeight: 600, background: "#e5e7eb" }}
                >
                  {t("events.owner")}
                </span>
              )}
            </>
          );
        })()}
      </div>

      <div className="tabs section">
        <button
          className={`tab ${activeTab === "day" ? "active" : ""}`}
          onClick={() => setTab("day")}
        >
          {t("tabs.day")}
        </button>
        <button
          className={`tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          {t("tabs.history")}
        </button>
        <button
          className={`tab ${activeTab === "payments" ? "active" : ""}`}
          onClick={() => setTab("payments")}
        >
          {t("tabs.payments")}
        </button>
        <button
          className={`tab ${activeTab === "members" ? "active" : ""}`}
          onClick={() => setTab("members")}
        >
          {t("tabs.members")}
        </button>
        {isOwner && (
          <button
            className={`tab ${activeTab === "admin" ? "active" : ""}`}
            onClick={() => setTab("admin")}
          >
            {t("tabs.admin")}
          </button>
        )}
      </div>

      {activeTab === "day" && (
        <DayTab
          ctx={ctx}
          eventId={eventId}
          forDate={effectiveForDate}
          holidays={holidays}
          prevDisabled={prevDisabled}
          nextDisabled={nextDisabled}
          onChangeDate={changeDate}
          onAddDays={(n) => addDaysStr(effectiveForDate, n)}
          onSetTab={setTab}
        />
      )}
      {activeTab === "history" && <HistoryTab ctx={ctx} eventId={eventId} />}
      {activeTab === "payments" && <PaymentsTab ctx={ctx} eventId={eventId} />}
      {activeTab === "members" && <MembersTab ctx={ctx} eventId={eventId} />}
      {isOwner && activeTab === "admin" && <AdminTab ctx={ctx} eventId={eventId} ev={ev.data} />}
    </div>
  );
}
