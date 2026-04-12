import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Event } from "../../lib/api";
import { formatMoney, parseMoneyToMinor } from "../../lib/money";
import type { EventContextType } from "../../hooks/useEventContext";
import type { Invite } from "../../lib/types";

type AdminTabProps = {
  ctx: EventContextType;
  eventId: string;
  ev: Event;
};

export default function AdminTab({ ctx, eventId, ev }: AdminTabProps) {
  const { invites } = ctx;

  return (
    <>
      <section className="section">
        <div className="card">
          <h3>Price List (Owner)</h3>
          <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>
            Prices are fixed; to change prices, add a new item and deactivate the old one.
          </div>
          <PriceListAdmin eventId={eventId} currency={ev.currency} />
        </div>
      </section>
      <section className="section">
        <div className="card">
          <h3>Holidays</h3>
          <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>
            Configure which public holidays to show in the calendar and day view.
          </div>
          <EventHolidaysSettings
            eventId={eventId}
            country={ev.holiday_country_code}
            region={ev.holiday_region_code}
          />
        </div>
      </section>
      <section className="section">
        <div className="card">
          <h3>Invites</h3>
          {invites.isLoading && <p>Loading invites…</p>}
          {invites.error && String(invites.error).includes("HTTP 403") && (
            <p className="muted">Owner-only section.</p>
          )}
          {!invites.error && invites.data && (
            <>
              <div className="row" style={{ marginBottom: 8 }}>
                <CreateGroupInviteButton eventId={eventId} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <CreateSingleInviteForm eventId={eventId} />
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Expires</th>
                    <th>Uses</th>
                    <th>Revoked</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invites.data.map((inv: Invite) => (
                    <tr key={inv.id}>
                      <td className="code">{inv.id}</td>
                      <td>{new Date(inv.expires_at).toLocaleString()}</td>
                      <td>
                        {inv.used_count}
                        {inv.max_uses ? ` / ${inv.max_uses}` : ""}
                      </td>
                      <td>{inv.revoked_at ? new Date(inv.revoked_at).toLocaleString() : "-"}</td>
                      <td>
                        {!inv.revoked_at && (
                          <RevokeInviteButton eventId={eventId} inviteId={inv.id} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </section>
    </>
  );
}

// --- Sub-components ---

function PriceListAdmin({ eventId, currency }: { eventId: string; currency: string }) {
  const qc = useQueryClient();
  const items = useQuery({
    queryKey: ["priceAll", eventId],
    queryFn: () => api.listPriceItems(eventId, true),
    enabled: !!eventId,
  });
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");

  const add = useMutation({
    mutationFn: () => api.addPriceItem(eventId, name.trim(), parseMoneyToMinor(price)),
    onSuccess: () => {
      setName("");
      setPrice("");
      qc.invalidateQueries({ queryKey: ["priceAll", eventId] });
      qc.invalidateQueries({ queryKey: ["price", eventId] });
    },
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => api.deactivatePriceItem(eventId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["priceAll", eventId] });
      qc.invalidateQueries({ queryKey: ["price", eventId] });
    },
  });
  const activate = useMutation({
    mutationFn: (id: string) => api.activatePriceItem(eventId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["priceAll", eventId] });
      qc.invalidateQueries({ queryKey: ["price", eventId] });
    },
  });

  const priceMinor = parseMoneyToMinor(price);
  const disabled = !name.trim() || !price || !isFinite(priceMinor) || priceMinor <= 0;

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          className="input"
          placeholder="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input"
          placeholder="Price (e.g. 1,50)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          style={{ width: 160 }}
        />
        <span className="muted">{currency}</span>
        <button onClick={() => add.mutate()} disabled={add.isPending || disabled} className="btn">
          {add.isPending ? "Adding…" : "Add Item"}
        </button>
        {add.error && <span className="danger">{String(add.error)}</span>}
      </div>
      {!name.trim() && <div className="muted">Enter a name.</div>}
      {(!price || !isFinite(priceMinor)) && (
        <div className="muted">Enter a valid price, e.g. 1,50.</div>
      )}
      {isFinite(priceMinor) && priceMinor <= 0 && (
        <div className="muted">Price must be greater than 0.</div>
      )}

      {items.isLoading && <p className="muted">Loading items…</p>}
      {items.error && <p className="danger">{String(items.error)}</p>}
      {items.data && (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ textAlign: "right" }}>Unit</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.data.map((pi) => (
              <tr key={pi.id}>
                <td>{pi.name}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(pi.unit_price_minor, currency)}</td>
                <td>{pi.active ? "Yes" : "No"}</td>
                <td>
                  {pi.active ? (
                    <button
                      className="btn"
                      onClick={() => deactivate.mutate(pi.id)}
                      disabled={deactivate.isPending}
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      className="btn"
                      onClick={() => activate.mutate(pi.id)}
                      disabled={activate.isPending}
                    >
                      Activate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EventHolidaysSettings({
  eventId,
  country,
  region,
}: {
  eventId: string;
  country?: string | null;
  region?: string | null;
}) {
  const qc = useQueryClient();
  const [c, setC] = React.useState(country || "");
  const [r, setR] = React.useState(region || "");
  const update = useMutation({
    mutationFn: () =>
      api.updateEvent(eventId, {
        holiday_country_code: c.trim() ? c.trim().toUpperCase() : null,
        holiday_region_code: r.trim() ? r.trim().toUpperCase() : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", eventId] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
  return (
    <div className="vstack">
      <div className="row">
        <div className="field">
          <label className="muted">Country</label>
          <input
            className="input"
            placeholder="DE"
            value={c}
            onChange={(e) => setC(e.target.value)}
            style={{ width: 120 }}
          />
        </div>
        <div className="field">
          <label className="muted">Region (optional)</label>
          <input
            className="input"
            placeholder="DE-BE"
            value={r}
            onChange={(e) => setR(e.target.value)}
            style={{ width: 160 }}
          />
        </div>
        <button className="btn" onClick={() => update.mutate()} disabled={update.isPending}>
          Save
        </button>
      </div>
      {update.error && <span className="danger">{String(update.error)}</span>}
      {update.isSuccess && <span className="ok">Saved.</span>}
    </div>
  );
}

function CreateGroupInviteButton({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const [created, setCreated] = React.useState<{ token: string; invite_url: string } | null>(null);
  const create = useMutation({
    mutationFn: () => api.createGroupInvite(eventId),
    onSuccess: (res) => {
      setCreated({ token: res.token, invite_url: res.invite_url });
      qc.invalidateQueries({ queryKey: ["invites", eventId] });
    },
  });
  return (
    <div>
      <button onClick={() => create.mutate()} disabled={create.isPending} className="btn">
        Create/Rotate Group Invite
      </button>
      {create.error && (
        <span className="danger" style={{ marginLeft: 8 }}>
          {String(create.error)}
        </span>
      )}
      {created && (
        <div className="card" style={{ marginTop: 8 }}>
          {(() => {
            const absolute = new URL(created.invite_url, window.location.origin).toString();
            return (
              <div className="row" style={{ alignItems: "center" }}>
                <strong>Invite URL:</strong>{" "}
                <span className="code" style={{ overflowWrap: "anywhere" }}>
                  {absolute}
                </span>
                <button className="btn" onClick={() => navigator.clipboard?.writeText(absolute)}>
                  Copy URL
                </button>
              </div>
            );
          })()}
          <div>
            <strong>Token:</strong> <span className="code">{created.token}</span>
          </div>
          <div className="muted">Share either the URL or token. Users can redeem at /join.</div>
        </div>
      )}
    </div>
  );
}

function RevokeInviteButton({ eventId, inviteId }: { eventId: string; inviteId: string }) {
  const qc = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => api.revokeInvite(eventId, inviteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", eventId] }),
  });
  return (
    <button onClick={() => revoke.mutate()} disabled={revoke.isPending} className="btn">
      Revoke
    </button>
  );
}

function CreateSingleInviteForm({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = React.useState("");
  const [ttl, setTtl] = React.useState(14);
  const [created, setCreated] = React.useState<{ token: string; invite_url: string } | null>(null);
  const create = useMutation({
    mutationFn: () => api.createSingleInvite(eventId, ttl, email || undefined),
    onSuccess: (res) => {
      setCreated({ token: res.token, invite_url: res.invite_url });
      qc.invalidateQueries({ queryKey: ["invites", eventId] });
      setEmail("");
    },
  });
  return (
    <div className="row">
      <label className="muted">Single-use Invite</label>
      <input
        className="input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email (optional)"
      />
      <label className="muted">TTL days</label>
      <input
        className="input"
        type="number"
        min={1}
        value={ttl}
        onChange={(e) => setTtl(Math.max(1, parseInt(e.target.value || "1")))}
        style={{ width: 100 }}
      />
      <button onClick={() => create.mutate()} disabled={create.isPending} className="btn">
        Create
      </button>
      {create.error && <span className="danger">{String(create.error)}</span>}
      {created && (
        <div className="card" style={{ width: "100%" }}>
          {(() => {
            const absolute = new URL(created.invite_url, window.location.origin).toString();
            return (
              <div className="row" style={{ alignItems: "center" }}>
                <strong>Invite URL:</strong>{" "}
                <span className="code" style={{ overflowWrap: "anywhere" }}>
                  {absolute}
                </span>
                <button className="btn" onClick={() => navigator.clipboard?.writeText(absolute)}>
                  Copy URL
                </button>
              </div>
            );
          })()}
          <div>
            <strong>Token:</strong> <span className="code">{created.token}</span>
          </div>
        </div>
      )}
    </div>
  );
}
