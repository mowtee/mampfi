import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatYMDToLocale } from "../lib/date";

export default function EventsList() {
  const q = useQuery({ queryKey: ["events"], queryFn: api.listEvents });
  return (
    <div>
      <div className="row" style={{ alignItems: "center", margin: "8px 0 12px" }}>
        <h2 style={{ margin: 0 }}>Your Events</h2>
        <span className="spacer" />
        <Link to="/events/new" className="btn">
          New Event
        </Link>
      </div>
      {!q.data && q.isLoading && <p className="muted">Loading…</p>}
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
                    <span className="chip muted">Left</span>
                  ) : (
                    <span className="chip open">Active</span>
                  )}
                </div>
                <div className="muted">
                  {formatYMDToLocale(ev.start_date)} → {formatYMDToLocale(ev.end_date)} •{" "}
                  {ev.currency}
                </div>
              </div>
              <Link to={`/events/${ev.id}`} className="btn primary">
                Open
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {!q.data?.length && !q.isLoading && (
        <p className="muted">No events yet. Ask an owner for an invite.</p>
      )}
    </div>
  );
}
