import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
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
  const { t } = useTranslation();
  const { invites } = ctx;

  return (
    <>
      <section className="section">
        <div className="card">
          <h3>{t("admin.priceList")}</h3>
          <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>
            {t("admin.priceListHint")}
          </div>
          <PriceListAdmin eventId={eventId} currency={ev.currency} />
        </div>
      </section>
      <section className="section">
        <div className="card">
          <h3>{t("admin.cutoff")}</h3>
          <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>
            {t("admin.cutoffHint")}
          </div>
          <CutoffEditor eventId={eventId} currentCutoff={ev.cutoff_time} />
        </div>
      </section>
      <section className="section">
        <div className="card">
          <h3>{t("admin.deliveryFee")}</h3>
          <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>
            {t("admin.deliveryFeeHint")}
          </div>
          <DeliveryFeeEditor
            eventId={eventId}
            currentFee={ev.delivery_fee_minor ?? null}
            currency={ev.currency}
          />
        </div>
      </section>
      <section className="section">
        <div className="card">
          <h3>{t("admin.holidays")}</h3>
          <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>
            {t("admin.holidaysHint")}
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
          <h3>{t("admin.invites")}</h3>
          {invites.isLoading && <p>{t("app.loading")}</p>}
          {invites.error && String(invites.error).includes("HTTP 403") && (
            <p className="muted">{t("admin.ownerOnly")}</p>
          )}
          {!invites.error && invites.data && (
            <>
              <h4 style={{ marginTop: 0 }}>{t("admin.groupInvites")}</h4>
              <div style={{ marginBottom: 16 }}>
                <CreateGroupInviteButton eventId={eventId} />
              </div>

              <h4>{t("admin.singleInvites")}</h4>
              <div style={{ marginBottom: 16 }}>
                <CreateSingleInviteLink eventId={eventId} />
              </div>

              <h4>{t("admin.emailInvites")}</h4>
              <p className="muted" style={{ marginTop: -4, marginBottom: 8 }}>
                {t("admin.emailInvitesHint")}
              </p>
              <div style={{ marginBottom: 16 }}>
                <SendEmailInvites eventId={eventId} />
              </div>

              <h4>{t("admin.invites")}</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("admin.id")}</th>
                    <th>{t("admin.expires")}</th>
                    <th>{t("admin.uses")}</th>
                    <th>{t("admin.revoked")}</th>
                    <th>{t("app.actions")}</th>
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
      <section className="section">
        <div className="card">
          <DeleteEventButton eventId={eventId} />
        </div>
      </section>
    </>
  );
}

// --- Sub-components ---

function PriceListAdmin({ eventId, currency }: { eventId: string; currency: string }) {
  const { t } = useTranslation();
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
          placeholder={t("admin.itemName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input"
          placeholder={t("admin.pricePlaceholder")}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          style={{ width: 160 }}
        />
        <span className="muted">{currency}</span>
        <button onClick={() => add.mutate()} disabled={add.isPending || disabled} className="btn">
          {add.isPending ? t("admin.adding") : t("admin.addItem")}
        </button>
        {add.error && <span className="danger">{String(add.error)}</span>}
      </div>
      {!name.trim() && <div className="muted">{t("admin.enterName")}</div>}
      {(!price || !isFinite(priceMinor)) && <div className="muted">{t("admin.enterPrice")}</div>}
      {isFinite(priceMinor) && priceMinor <= 0 && (
        <div className="muted">{t("admin.pricePositive")}</div>
      )}

      {items.isLoading && <p className="muted">{t("admin.loadingItems")}</p>}
      {items.error && <p className="danger">{String(items.error)}</p>}
      {items.data && (
        <table className="table">
          <thead>
            <tr>
              <th>{t("admin.name")}</th>
              <th style={{ textAlign: "right" }}>{t("admin.unit")}</th>
              <th>{t("admin.active")}</th>
              <th>{t("app.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {items.data.map((pi) => (
              <tr key={pi.id}>
                <td>{pi.name}</td>
                <td style={{ textAlign: "right" }}>{formatMoney(pi.unit_price_minor, currency)}</td>
                <td>{pi.active ? t("app.yes") : t("app.no")}</td>
                <td>
                  {pi.active ? (
                    <button
                      className="btn"
                      onClick={() => deactivate.mutate(pi.id)}
                      disabled={deactivate.isPending}
                    >
                      {t("admin.deactivate")}
                    </button>
                  ) : (
                    <button
                      className="btn"
                      onClick={() => activate.mutate(pi.id)}
                      disabled={activate.isPending}
                    >
                      {t("admin.activate")}
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
  const { t } = useTranslation();
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
          <label className="muted">{t("admin.country")}</label>
          <input
            className="input"
            placeholder="DE"
            value={c}
            onChange={(e) => setC(e.target.value)}
            style={{ width: 120 }}
          />
        </div>
        <div className="field">
          <label className="muted">{t("admin.regionOptional")}</label>
          <input
            className="input"
            placeholder="DE-BE"
            value={r}
            onChange={(e) => setR(e.target.value)}
            style={{ width: 160 }}
          />
        </div>
        <button className="btn" onClick={() => update.mutate()} disabled={update.isPending}>
          {t("app.save")}
        </button>
      </div>
      {update.error && <span className="danger">{String(update.error)}</span>}
      {update.isSuccess && <span className="ok">{t("admin.saved")}</span>}
    </div>
  );
}

function CreateGroupInviteButton({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
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
        {t("admin.createGroupInvite")}
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
                <strong>{t("admin.inviteUrl")}</strong>{" "}
                <span className="code" style={{ overflowWrap: "anywhere" }}>
                  {absolute}
                </span>
                <button className="btn" onClick={() => navigator.clipboard?.writeText(absolute)}>
                  {t("admin.copyUrl")}
                </button>
              </div>
            );
          })()}
          <div>
            <strong>{t("admin.token")}</strong> <span className="code">{created.token}</span>
          </div>
          <div className="muted">{t("admin.shareHint")}</div>
        </div>
      )}
    </div>
  );
}

function RevokeInviteButton({ eventId, inviteId }: { eventId: string; inviteId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => api.revokeInvite(eventId, inviteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", eventId] }),
  });
  return (
    <button onClick={() => revoke.mutate()} disabled={revoke.isPending} className="btn">
      {t("admin.revoke")}
    </button>
  );
}

function CreateSingleInviteLink({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [created, setCreated] = React.useState<{ token: string; invite_url: string } | null>(null);
  const create = useMutation({
    mutationFn: () => api.createSingleInvite(eventId, 14),
    onSuccess: (res) => {
      setCreated({ token: res.token, invite_url: res.invite_url });
      qc.invalidateQueries({ queryKey: ["invites", eventId] });
    },
  });
  return (
    <div>
      <button onClick={() => create.mutate()} disabled={create.isPending} className="btn">
        {t("admin.createSingleInvite")}
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
                <strong>{t("admin.inviteUrl")}</strong>{" "}
                <span className="code" style={{ overflowWrap: "anywhere" }}>
                  {absolute}
                </span>
                <button className="btn" onClick={() => navigator.clipboard?.writeText(absolute)}>
                  {t("admin.copyUrl")}
                </button>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function SendEmailInvites({ eventId }: { eventId: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [emails, setEmails] = React.useState("");
  const [result, setResult] = React.useState<{ sent: number } | null>(null);
  const send = useMutation({
    mutationFn: () => api.sendEmailInvites(eventId, emails.trim(), i18n.language),
    onSuccess: (res) => {
      setResult(res);
      setEmails("");
      qc.invalidateQueries({ queryKey: ["invites", eventId] });
    },
  });
  return (
    <div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <input
          className="input"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={t("admin.emailPlaceholder")}
          style={{ minWidth: 300 }}
        />
        <button
          onClick={() => send.mutate()}
          disabled={send.isPending || !emails.trim()}
          className="btn primary"
        >
          {send.isPending ? t("admin.sending") : t("admin.sendInvites")}
        </button>
      </div>
      {send.error && (
        <div className="danger" style={{ marginTop: 6 }}>
          {String(send.error)}
        </div>
      )}
      {result && (
        <div className="ok" style={{ marginTop: 6 }}>
          {t("admin.sentCount", { count: result.sent })}
        </div>
      )}
    </div>
  );
}

function CutoffEditor({ eventId, currentCutoff }: { eventId: string; currentCutoff: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [cutoff, setCutoff] = React.useState(String(currentCutoff || "20:00").slice(0, 5));
  const update = useMutation({
    mutationFn: () => api.updateEvent(eventId, { cutoff_time: cutoff + ":00" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", eventId] });
    },
  });
  const unchanged = cutoff === String(currentCutoff || "20:00").slice(0, 5);
  return (
    <div className="row">
      <input
        className="input"
        type="time"
        value={cutoff}
        onChange={(e) => setCutoff(e.target.value)}
        style={{ width: 120 }}
      />
      <button
        className="btn"
        onClick={() => update.mutate()}
        disabled={update.isPending || unchanged}
      >
        {t("app.save")}
      </button>
      {update.error && <span className="danger">{String(update.error)}</span>}
      {update.isSuccess && !unchanged && <span className="ok">{t("admin.saved")}</span>}
    </div>
  );
}

function DeliveryFeeEditor({
  eventId,
  currentFee,
  currency,
}: {
  eventId: string;
  currentFee: number | null;
  currency: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [fee, setFee] = React.useState(
    currentFee != null && currentFee > 0 ? (currentFee / 100).toFixed(2) : "",
  );
  const update = useMutation({
    mutationFn: () => {
      const trimmed = fee.trim();
      const value = trimmed === "" ? 0 : parseMoneyToMinor(trimmed);
      return api.updateEvent(eventId, { delivery_fee_minor: value });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event", eventId] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
  const currentDisplay = currentFee != null && currentFee > 0 ? (currentFee / 100).toFixed(2) : "";
  const unchanged = fee.trim() === currentDisplay;
  return (
    <div className="row">
      <input
        className="input"
        placeholder={t("admin.deliveryFeePlaceholder")}
        value={fee}
        onChange={(e) => setFee(e.target.value)}
        inputMode="decimal"
        style={{ width: 160 }}
      />
      <span className="muted">{currency}</span>
      <button
        className="btn"
        onClick={() => update.mutate()}
        disabled={update.isPending || unchanged}
      >
        {t("app.save")}
      </button>
      {update.error && <span className="danger">{String(update.error)}</span>}
      {update.isSuccess && !unchanged && <span className="ok">{t("admin.saved")}</span>}
    </div>
  );
}

function DeleteEventButton({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const del = useMutation({
    mutationFn: () => api.deleteEvent(eventId),
    onSuccess: () => {
      navigate("/");
    },
  });
  return (
    <div>
      <button
        className="btn danger"
        onClick={() => {
          if (window.confirm(t("admin.deleteEventConfirm"))) {
            del.mutate();
          }
        }}
        disabled={del.isPending}
      >
        {t("admin.deleteEvent")}
      </button>
      {del.error && (
        <span className="danger" style={{ marginLeft: 8 }}>
          {String(del.error)}
        </span>
      )}
    </div>
  );
}
