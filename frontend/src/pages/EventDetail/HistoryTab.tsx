import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatMoney } from "../../lib/money";
import type { EventContextType } from "../../hooks/useEventContext";
import type { PurchaseLine, PurchaseSummary } from "../../lib/types";

type HistoryTabProps = {
  ctx: EventContextType;
  eventId: string;
  onPickDate: (d: string) => void;
};

export default function HistoryTab({ ctx, eventId, onPickDate }: HistoryTabProps) {
  const { t } = useTranslation();
  const { ev, memberLabel, priceName } = ctx;
  if (!ev.data) return null;

  return (
    <section className="section">
      <div className="card">
        <h3>{t("history.title")}</h3>
        <PurchasesHistory
          eventId={eventId}
          currency={ev.data.currency}
          onPickDate={onPickDate}
          label={memberLabel}
          itemName={priceName}
        />
      </div>
    </section>
  );
}

function PurchasesHistory({
  eventId,
  currency,
  onPickDate,
  label,
  itemName,
}: {
  eventId: string;
  currency: string;
  onPickDate: (d: string) => void;
  label: (id?: string) => string;
  itemName: (id?: string) => string;
}) {
  const { t } = useTranslation();
  const list = useQuery({
    queryKey: ["purchases", eventId],
    queryFn: () => api.listPurchases(eventId),
    enabled: !!eventId,
  });
  if (list.isLoading) return <p className="muted">{t("history.loadingPurchases")}</p>;
  if (list.error) return <p className="danger">{String(list.error)}</p>;
  if (!list.data || list.data.length === 0)
    return <p className="muted">{t("history.noPurchases")}</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th></th>
          <th>{t("history.date")}</th>
          <th>{t("history.buyer")}</th>
          <th style={{ textAlign: "right" }}>{t("history.total")}</th>
          <th>{t("app.actions")}</th>
        </tr>
      </thead>
      <tbody>
        {list.data.map((p: PurchaseSummary) => (
          <PurchaseRow
            key={p.date}
            eventId={eventId}
            row={p}
            currency={currency}
            label={label}
            itemName={itemName}
            onPickDate={onPickDate}
          />
        ))}
      </tbody>
    </table>
  );
}

function PurchaseRow({
  eventId,
  row,
  currency,
  label,
  itemName,
  onPickDate,
}: {
  eventId: string;
  row: PurchaseSummary;
  currency: string;
  label: (id?: string) => string;
  itemName: (id?: string) => string;
  onPickDate: (d: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const details = useQuery({
    queryKey: ["purchase", eventId, row.date],
    queryFn: () => api.getPurchase(eventId, row.date),
    enabled: open,
    retry: false,
  });
  return (
    <>
      <tr>
        <td>
          <button className="btn" onClick={() => setOpen((v) => !v)}>
            {open ? "−" : "+"}
          </button>
        </td>
        <td>{row.date}</td>
        <td>{label(row.buyer_id)}</td>
        <td style={{ textAlign: "right" }}>
          {formatMoney(Number(row.total_minor || 0), currency)}
        </td>
        <td>
          <button className="btn" onClick={() => onPickDate(row.date)}>
            {t("history.view")}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td></td>
          <td colSpan={4}>
            {details.isLoading && <div className="muted">{t("app.loading")}</div>}
            {details.error && <div className="danger">{String(details.error)}</div>}
            {details.data && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("history.aggregate")}</div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("history.item")}</th>
                      <th style={{ textAlign: "right" }}>{t("history.qty")}</th>
                      <th style={{ textAlign: "right" }}>{t("history.unit")}</th>
                      <th style={{ textAlign: "right" }}>{t("history.total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.data.lines.map((ln: PurchaseLine, idx: number) => {
                      const labelText = ln.name || itemName(ln.price_item_id) || ln.price_item_id;
                      const unit = formatMoney(Number(ln.unit_price_minor || 0), currency);
                      const total = formatMoney(
                        Number((ln.qty_final || 0) * (ln.unit_price_minor || 0)),
                        currency,
                      );
                      return (
                        <tr key={idx}>
                          <td>{labelText}</td>
                          <td style={{ textAlign: "right" }}>{ln.qty_final}</td>
                          <td style={{ textAlign: "right" }}>{unit}</td>
                          <td style={{ textAlign: "right" }}>{total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(() => {
                  const per: Map<
                    string,
                    { name: string; items: { label: string; qty: number }[] }
                  > = new Map();
                  for (const ln of details.data.lines) {
                    const lbl = ln.name || itemName(ln.price_item_id) || ln.price_item_id || "";
                    const allocs = Array.isArray(ln.allocations) ? ln.allocations : [];
                    for (const a of allocs) {
                      const id = String(a.user_id);
                      const qty = Number(a.qty || 0);
                      if (qty <= 0) continue;
                      if (!per.has(id)) per.set(id, { name: label(id), items: [] });
                      per.get(id)!.items.push({ label: lbl, qty });
                    }
                  }
                  const rows = Array.from(per.entries());
                  if (rows.length === 0) return null;
                  rows.sort((a, b) => a[1].name.localeCompare(b[1].name));
                  return (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {t("history.perMember")}
                      </div>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t("history.member")}</th>
                            <th>{t("history.items")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(([id, v]) => (
                            <tr key={id}>
                              <td>{v.name}</td>
                              <td>
                                {v.items.map((it, i) => (
                                  <span key={i} style={{ marginRight: 10 }}>
                                    {it.qty}× {it.label}
                                  </span>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
