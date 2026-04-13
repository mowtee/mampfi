import React from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatYMDToLocale } from "../../lib/date";
import { formatMoney } from "../../lib/money";
import type { EventContextType } from "../../hooks/useEventContext";
import type { PurchaseLine, PurchaseSummary } from "../../lib/types";

type HistoryTabProps = {
  ctx: EventContextType;
  eventId: string;
};

export default function HistoryTab({ ctx, eventId }: HistoryTabProps) {
  const { t } = useTranslation();
  const { ev, meId, memberLabel, priceName } = ctx;
  if (!ev.data) return null;

  return (
    <>
      <section className="section">
        <div className="card">
          <h3>{t("history.personalHistory")}</h3>
          <PersonalHistory
            eventId={eventId}
            meId={meId}
            currency={ev.data.currency}
            priceName={priceName}
          />
        </div>
      </section>
      <section className="section">
        <div className="card">
          <h3>{t("history.title")}</h3>
          <PurchasesHistory
            eventId={eventId}
            currency={ev.data.currency}
            label={memberLabel}
            itemName={priceName}
          />
        </div>
      </section>
    </>
  );
}

function PurchasesHistory({
  eventId,
  currency,
  label,
  itemName,
}: {
  eventId: string;
  currency: string;
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
}: {
  eventId: string;
  row: PurchaseSummary;
  currency: string;
  label: (id?: string) => string;
  itemName: (id?: string) => string;
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
      </tr>
      {open && (
        <tr>
          <td></td>
          <td colSpan={3}>
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
                    { name: string; items: { label: string; qty: number }[]; totalMinor: number }
                  > = new Map();
                  for (const ln of details.data.lines) {
                    const lbl = ln.name || itemName(ln.price_item_id) || ln.price_item_id || "";
                    const unitPrice = Number(ln.unit_price_minor || 0);
                    const allocs = Array.isArray(ln.allocations) ? ln.allocations : [];
                    for (const a of allocs) {
                      const id = String(a.user_id);
                      const qty = Number(a.qty || 0);
                      if (qty <= 0) continue;
                      if (!per.has(id)) per.set(id, { name: label(id), items: [], totalMinor: 0 });
                      const entry = per.get(id)!;
                      entry.items.push({ label: lbl, qty });
                      entry.totalMinor += qty * unitPrice;
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
                            <th style={{ textAlign: "right" }}>{t("history.total")}</th>
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
                              <td style={{ textAlign: "right" }}>
                                {formatMoney(v.totalMinor, currency)}
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

function PersonalHistory({
  eventId,
  meId,
  currency,
  priceName,
}: {
  eventId: string;
  meId: string | undefined;
  currency: string;
  priceName: (id?: string) => string;
}) {
  const { t } = useTranslation();
  const list = useQuery({
    queryKey: ["purchases", eventId],
    queryFn: () => api.listPurchases(eventId),
    enabled: !!eventId,
  });

  // Fetch all purchase details to extract personal allocations
  const details = useQuery({
    queryKey: ["personalHistory", eventId, meId],
    queryFn: async () => {
      if (!list.data || !meId) return [];
      const results = await Promise.all(list.data.map((p) => api.getPurchase(eventId, p.date)));
      return results
        .map((purchase) => {
          const myItems: { label: string; qty: number; subtotal: number }[] = [];
          let total = 0;
          for (const ln of purchase.lines) {
            const allocs = ln.allocations || [];
            const mine = allocs.find((a) => a.user_id === meId);
            if (mine && Number(mine.qty) > 0) {
              const qty = Number(mine.qty);
              const unit = Number(ln.unit_price_minor || 0);
              const sub = qty * unit;
              myItems.push({
                label: ln.name || priceName(ln.price_item_id) || ln.price_item_id || "",
                qty,
                subtotal: sub,
              });
              total += sub;
            }
          }
          if (myItems.length === 0) return null;
          return { date: purchase.date, items: myItems, totalMinor: total };
        })
        .filter(Boolean) as {
        date: string;
        items: { label: string; qty: number; subtotal: number }[];
        totalMinor: number;
      }[];
    },
    enabled: !!list.data && !!meId,
  });

  if (list.isLoading || details.isLoading) return <p className="muted">{t("app.loading")}</p>;
  if (!details.data || details.data.length === 0)
    return <p className="muted">{t("history.noPurchases")}</p>;

  return (
    <table className="table">
      <thead>
        <tr>
          <th>{t("history.date")}</th>
          <th>{t("history.order")}</th>
          <th style={{ textAlign: "right" }}>{t("history.total")}</th>
        </tr>
      </thead>
      <tbody>
        {details.data.map((row) => (
          <tr key={row.date}>
            <td>{formatYMDToLocale(row.date)}</td>
            <td>
              {row.items.map((it, i) => (
                <span key={i} style={{ marginRight: 10 }}>
                  {it.qty}× {it.label}
                </span>
              ))}
            </td>
            <td style={{ textAlign: "right" }}>{formatMoney(row.totalMinor, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
