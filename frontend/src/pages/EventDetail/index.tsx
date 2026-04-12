import React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatYMDToLocale } from "../../lib/date";
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
  const tomorrow = isoDate(new Date(Date.now() + 24 * 3600 * 1000));
  const [forDate, setForDate] = React.useState<string>(tomorrow);
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
  const ctx = useEventContext(eventId, forDate, activeTab);
  const { ev, meMember, isOwner, qc } = ctx;

  const holidayCountry = ev.data?.holiday_country_code;
  const holidayRegion = ev.data?.holiday_region_code;
  const holidays = useHolidays(
    holidayCountry,
    holidayRegion,
    ev.data?.start_date,
    ev.data?.end_date,
  );

  const startDate = ev.data?.start_date;
  const endDate = ev.data?.end_date;
  const prevDisabled = !!startDate && forDate <= startDate;
  const nextDisabled = !!endDate && forDate >= endDate;

  // Clamp date to event range when data loads
  React.useEffect(() => {
    if (!startDate || !endDate) return;
    if (forDate < startDate) setForDate(startDate);
    else if (forDate > endDate) setForDate(endDate);
  }, [startDate, endDate]); // eslint-disable-line react-hooks/exhaustive-deps

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
    qc.invalidateQueries({ queryKey: ["myOrder", eventId, forDate] });
    qc.invalidateQueries({ queryKey: ["agg", eventId, forDate] });
    qc.invalidateQueries({ queryKey: ["purchase", eventId, forDate] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forDate]);

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
      <h2 style={{ margin: "8px 0 4px" }}>{ev.data.name}</h2>
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
          forDate={forDate}
          holidays={holidays}
          prevDisabled={prevDisabled}
          nextDisabled={nextDisabled}
          onChangeDate={changeDate}
          onAddDays={(n) => addDaysStr(forDate, n)}
          onSetTab={setTab}
        />
      )}
      {activeTab === "history" && (
        <HistoryTab ctx={ctx} eventId={eventId} onPickDate={(d) => setForDate(d)} />
      )}
      {activeTab === "payments" && <PaymentsTab ctx={ctx} eventId={eventId} />}
      {activeTab === "members" && <MembersTab ctx={ctx} eventId={eventId} />}
      {isOwner && activeTab === "admin" && <AdminTab ctx={ctx} eventId={eventId} ev={ev.data} />}
    </div>
  );
}
