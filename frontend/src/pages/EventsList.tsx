import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { formatYMDToLocale } from "../lib/date";

export default function EventsList() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ["events"], queryFn: api.listEvents });
  return (
    <div>
      <div className="row" style={{ alignItems: "center", margin: "8px 0 12px" }}>
        <h2 style={{ margin: 0 }}>
          <strong>{t("events.title")}</strong>
        </h2>
        <span className="spacer" />
        <Link to="/events/new" className="btn">
          {t("events.create")}
        </Link>
      </div>
      {!q.data && q.isLoading && <p className="muted">{t("app.loading")}</p>}
      {q.error && <p className="danger">{String(q.error)}</p>}
      <ul className="grid" style={{ padding: 0, listStyle: "none" }}>
        {q.data?.map((ev) => (
          <li key={ev.id} className="card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>{ev.name}</span>
                  {ev.left_at ? (
                    <span className="chip muted">{t("events.left")}</span>
                  ) : (
                    <span className="chip open">{t("events.activeMember")}</span>
                  )}
                  {ev.role === "owner" && (
                    <span className="chip" style={{ background: "#e5e7eb", fontWeight: 600 }}>
                      {t("events.owner")}
                    </span>
                  )}
                </div>
                <div className="muted">
                  {formatYMDToLocale(ev.start_date)} → {formatYMDToLocale(ev.end_date)} •{" "}
                  {ev.currency}
                </div>
              </div>
              <Link to={`/events/${ev.id}`} className="btn primary">
                {t("events.open")}
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {!q.data?.length && !q.isLoading && <p className="muted">{t("events.noEvents")}</p>}
    </div>
  );
}
