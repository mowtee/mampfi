import React from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatMoney } from "../../lib/money";
import { Modal, ModalBody, ModalActions } from "../../components/ui/Modal";
import DateField from "../../components/DateField";
import type { EventContextType } from "../../hooks/useEventContext";
import type { AggregateItem } from "../../lib/types";

type WSLine = {
  key: string;
  price_item_id: string;
  name: string;
  unit_price_minor: number;
  delivered: Record<string, number>;
};

type DayTabProps = {
  ctx: EventContextType;
  eventId: string;
  forDate: string;
  holidays: { labelByDate: Map<string, string> };
  prevDisabled: boolean;
  nextDisabled: boolean;
  onChangeDate: (d: string) => void;
  onAddDays: (n: number) => string;
  onSetTab: (tab: string) => void;
};

export default function DayTab({
  ctx,
  eventId,
  forDate,
  holidays,
  prevDisabled,
  nextDisabled,
  onChangeDate,
  onAddDays,
  onSetTab,
}: DayTabProps) {
  const {
    ev,
    meQ,
    price,
    myOrder,
    agg,
    purchase,
    members,
    lockInfo,
    readOnly,
    inactiveForDate,
    statusChip,
    meMember,
    memberLabel,
    priceName,
    qc,
  } = ctx;

  // --- Local state ---
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});
  const prefKey = React.useMemo(
    () => (meQ.data?.id ? `rollover:${eventId}:${meQ.data.id}` : null),
    [eventId, meQ.data?.id],
  );
  const [rolloverEnabled, setRolloverEnabled] = React.useState(true);
  React.useEffect(() => {
    if (!prefKey) return;
    const v = localStorage.getItem(prefKey);
    setRolloverEnabled(v ? v === "1" : true);
  }, [prefKey]);
  const toggleRollover = React.useCallback(() => {
    if (!prefKey) return;
    setRolloverEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(prefKey, next ? "1" : "0");
      return next;
    });
  }, [prefKey]);

  React.useEffect(() => {
    if (myOrder.data?.is_rolled_over && !rolloverEnabled) {
      setQuantities({});
      return;
    }
    const q: Record<string, number> = {};
    myOrder.data?.items?.forEach((it) => (q[it.price_item_id] = it.qty));
    setQuantities(q);
  }, [myOrder.data, rolloverEnabled]);

  // Fallback: derive from aggregate when no explicit order
  React.useEffect(() => {
    if (!meQ.data?.id) return;
    if (myOrder.data && (myOrder.data.items || []).length > 0) return;
    if (!agg.data || !(agg.data.items || []).length) return;
    const mine: Record<string, number> = {};
    for (const it of agg.data.items) {
      const mineRow = (it.consumers || []).find((c) => c.user_id === meQ.data!.id);
      if (mineRow && Number(mineRow.qty) > 0) {
        mine[it.price_item_id] = Number(mineRow.qty);
      }
    }
    if (Object.keys(mine).length > 0) setQuantities(mine);
  }, [agg.data, myOrder.data, meQ.data?.id]);

  // --- Mutations ---
  const upsert = useMutation({
    mutationFn: () => {
      const activeIds = new Set((price.data || []).map((pi) => pi.id));
      const items = Object.entries(quantities)
        .filter(([pid, qty]) => qty > 0 && activeIds.has(pid))
        .map(([price_item_id, qty]) => ({ price_item_id, qty }));
      return api.upsertMyOrder(eventId, forDate, items);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["myOrder", eventId, forDate] });
      qc.invalidateQueries({ queryKey: ["agg", eventId, forDate] });
    },
  });

  type ModalState = "closed" | "precheck" | "finalize" | "worksheet";
  const [modal, setModal] = React.useState<ModalState>("closed");
  const [ws, setWs] = React.useState<WSLine[]>([]);
  const [wsNotes, setWsNotes] = React.useState("");
  const [addItemId, setAddItemId] = React.useState("");

  const finalize = useMutation({
    mutationFn: async () => {
      if (!agg.data) throw new Error("No aggregate data");
      const lines = (agg.data.items || [])
        .filter((it) => Number(it.total_qty || 0) > 0)
        .map((it) => ({
          type: "price_item" as const,
          price_item_id: it.price_item_id,
          name: it.name,
          qty_final: Number(it.total_qty || 0),
          unit_price_minor: Number(it.unit_price_minor || 0),
          allocations: (it.consumers || []).map((c) => ({ user_id: c.user_id, qty: c.qty })),
        }));
      return api.createPurchase(eventId, forDate, lines);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase", eventId, forDate] });
      qc.invalidateQueries({ queryKey: ["balances", eventId] });
      qc.invalidateQueries({ queryKey: ["payments", eventId] });
    },
  });

  const finalizeAdjust = useMutation({
    mutationFn: async ({
      lines,
      notes,
    }: {
      lines: {
        type: "price_item";
        price_item_id: string;
        qty_final: number;
        unit_price_minor: number;
        allocations?: { user_id: string; qty: number }[];
      }[];
      notes?: string;
    }) => {
      return api.createPurchase(eventId, forDate, lines, notes);
    },
    onSuccess: () => {
      setModal("closed");
      qc.invalidateQueries({ queryKey: ["purchase", eventId, forDate] });
      qc.invalidateQueries({ queryKey: ["balances", eventId] });
      qc.invalidateQueries({ queryKey: ["payments", eventId] });
    },
  });

  function finalizeFromWorksheet() {
    const lines = ws
      .map((ln) => {
        const allocs = Object.entries(ln.delivered)
          .map(([user_id, qty]) => ({ user_id, qty: Number(qty || 0) }))
          .filter((a) => a.qty > 0);
        const qty_final = allocs.reduce((s, a) => s + a.qty, 0);
        return {
          type: "price_item" as const,
          price_item_id: ln.price_item_id as string,
          qty_final,
          unit_price_minor: ln.unit_price_minor,
          allocations: allocs,
        };
      })
      .filter((x) => x.qty_final > 0);
    if (!lines.length) {
      alert("No delivered items to finalize.");
      return;
    }
    finalizeAdjust.mutate({ lines, notes: wsNotes });
  }

  function openWorksheetFromAggregate() {
    if (!agg.data) return;
    const lines: WSLine[] = [];
    for (const it of agg.data.items || []) {
      const total = Number(it.total_qty || 0);
      if (total <= 0) continue;
      const delivered: Record<string, number> = {};
      for (const c of it.consumers || []) {
        const q = Number(c.qty || 0);
        if (q > 0) delivered[c.user_id] = q;
      }
      lines.push({
        key: `pi:${it.price_item_id}`,
        price_item_id: it.price_item_id,
        name: it.name || "",
        unit_price_minor: Number(it.unit_price_minor || 0),
        delivered,
      });
    }
    setWs(lines);
    setModal("worksheet");
  }

  if (!ev.data) return null;
  const currency = ev.data.currency;

  return (
    <>
      <div className="toolbar section">
        <label className="muted">Date</label>
        <div className="row" style={{ alignItems: "center" }}>
          <button
            className="btn"
            onClick={() => !prevDisabled && onChangeDate(onAddDays(-1))}
            disabled={prevDisabled}
          >
            ◀
          </button>
          <DateField
            value={forDate}
            onChange={(d) => onChangeDate(d)}
            style={{ width: 200, maxWidth: "100%" }}
            holidaysLabelByDate={holidays.labelByDate}
          />
          <button
            className="btn"
            onClick={() => !nextDisabled && onChangeDate(onAddDays(1))}
            disabled={nextDisabled}
          >
            ▶
          </button>
        </div>
        <span className={statusChip.className} style={{ marginLeft: 8 }}>
          {statusChip.text}
        </span>
        <span className="muted" style={{ marginLeft: 12 }}>
          Orders lock on the previous day at {String(ev.data.cutoff_time || "").slice(0, 5)}.
        </span>
        {holidays.labelByDate.get(forDate) && (
          <span className="chip muted" style={{ marginLeft: 8 }}>
            {holidays.labelByDate.get(forDate)}
          </span>
        )}
        <span className="spacer" />
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <label className="muted">Rollover</label>
          <button className="btn" onClick={toggleRollover}>
            {rolloverEnabled ? "On" : "Off"}
          </button>
        </div>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        Your latest order rolls over to tomorrow unless changed before cutoff.
      </div>

      {/* Your Order */}
      <section className="section">
        <div className="card">
          <h3>Your Order</h3>
          {myOrder.data?.is_rolled_over && rolloverEnabled && (
            <div className="chip warn" style={{ marginBottom: 8 }}>
              Using rolled-over order from a previous day
            </div>
          )}
          {myOrder.data?.is_rolled_over && !rolloverEnabled && (
            <div className="chip muted" style={{ marginBottom: 8 }}>
              Rollover disabled — starting empty for this day
            </div>
          )}
          {price.isLoading && <p>Loading price…</p>}
          {myOrder.isLoading && <p>Loading your order…</p>}
          {inactiveForDate && (
            <div className="muted">
              {meMember?.left_at
                ? `You left this event on ${new Date(meMember.left_at).toLocaleDateString()}. Orders after this date are not available.`
                : "You are not an active member for this date."}
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: "right" }}>Unit</th>
                <th style={{ textAlign: "right" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {price.data?.map((pi) => {
                const qty = quantities[pi.id] || 0;
                const total = qty * pi.unit_price_minor;
                return (
                  <tr key={pi.id}>
                    <td>{pi.name}</td>
                    <td style={{ textAlign: "right" }}>
                      {formatMoney(pi.unit_price_minor, currency)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="qty-stepper">
                        <button
                          className="btn"
                          onClick={() =>
                            setQuantities((cur) => ({
                              ...cur,
                              [pi.id]: Math.max(0, (cur[pi.id] || 0) - 1),
                            }))
                          }
                          disabled={readOnly || qty <= 0}
                        >
                          −
                        </button>
                        <span className="qty">{qty}</span>
                        <button
                          className="btn"
                          onClick={() =>
                            setQuantities((cur) => ({
                              ...cur,
                              [pi.id]: (cur[pi.id] || 0) + 1,
                            }))
                          }
                          disabled={readOnly}
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>{formatMoney(total, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {(() => {
            const list = price.data || [];
            let subtotal = 0;
            for (const pi of list) {
              const qty = quantities[pi.id] || 0;
              if (qty > 0) subtotal += qty * Number(pi.unit_price_minor || 0);
            }
            return (
              <div className="sticky-total">
                <strong>Your total: {formatMoney(subtotal, currency)}</strong>
              </div>
            );
          })()}
          <button
            onClick={() => upsert.mutate()}
            disabled={upsert.isPending || !!purchase.data || lockInfo.locked || inactiveForDate}
            className="btn primary"
            style={{ marginTop: 10 }}
          >
            {purchase.data ? "Finalized" : upsert.isPending ? "Saving…" : "Save Order"}
          </button>
          {upsert.error && <div className="danger">{String(upsert.error)}</div>}
          {lockInfo.locked && (
            <div className="muted" style={{ marginTop: 6 }}>
              Orders are locked since {String(ev.data.cutoff_time || "").slice(0, 5)}.
            </div>
          )}
          {(() => {
            const activeIds = new Set((price.data || []).map((pi) => pi.id));
            const inactive = (myOrder.data?.items || []).filter(
              (it) => !activeIds.has(it.price_item_id),
            );
            if (inactive.length === 0) return null;
            return (
              <div className="muted" style={{ marginTop: 8 }}>
                Note: {inactive.length} item(s) in your saved order are no longer available and will
                be ignored when saving.
              </div>
            );
          })()}
        </div>
      </section>

      {/* Aggregated For Date */}
      <section className="section">
        <div className="card">
          <h3>Aggregated For Date</h3>
          {agg.isLoading && <p>Loading aggregate…</p>}
          {agg.error && <p className="danger">{String(agg.error)}</p>}
          {agg.data && (
            <div>
              <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
                <strong>
                  Group Total: {formatMoney(Number(agg.data.total_minor || 0), currency)}
                </strong>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Unit</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.data.items.map((it: AggregateItem) => (
                    <tr key={it.price_item_id}>
                      <td>{it.name || it.price_item_id}</td>
                      <td style={{ textAlign: "right" }}>{it.total_qty}</td>
                      <td style={{ textAlign: "right" }}>
                        {formatMoney(Number(it.unit_price_minor || 0), currency)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {formatMoney(Number(it.item_total_minor || 0), currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Per-member delivery overview */}
              {(() => {
                const perMember = new Map<
                  string,
                  { name: string; items: { label: string; qty: number }[] }
                >();
                const list = agg.data?.items || [];
                list.forEach((it) => {
                  const label = it.name || priceName(it.price_item_id) || it.price_item_id;
                  (it.consumers || []).forEach((c) => {
                    const id = c.user_id;
                    const qty = Number(c.qty || 0);
                    if (qty <= 0) return;
                    if (!perMember.has(id)) perMember.set(id, { name: memberLabel(id), items: [] });
                    perMember.get(id)!.items.push({ label, qty });
                  });
                });
                const rows = Array.from(perMember.entries());
                if (rows.length === 0) return null;
                return (
                  <div style={{ marginTop: 14 }}>
                    <h4 style={{ margin: "8px 0" }}>Per-member delivery</h4>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>Items</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(([id, v]) => (
                          <tr key={id}>
                            <td>{v.name}</td>
                            <td>
                              {(v.items || []).map((x, i) => (
                                <span key={i} style={{ marginRight: 10 }}>
                                  {x.qty}× {x.label}
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
        </div>
      </section>

      {/* Purchase Finalization */}
      <section className="section">
        <div className="card">
          <h3>Purchase Finalization</h3>
          {purchase.isLoading && <p>Checking purchase…</p>}
          {purchase.data && (
            <div className="vstack">
              <div>Buyer: {memberLabel(purchase.data.buyer_id)}</div>
              <div>Total: {formatMoney(Number(purchase.data.total_minor || 0), currency)}</div>
              <details style={{ marginTop: 8 }}>
                <summary>Lines</summary>
                <ul>
                  {purchase.data.lines.map((ln, idx) => {
                    const label = ln.name || priceName(ln.price_item_id) || ln.price_item_id;
                    return (
                      <li key={idx}>
                        {label}: {ln.qty_final} ×{" "}
                        {formatMoney(Number(ln.unit_price_minor || 0), currency)}
                      </li>
                    );
                  })}
                </ul>
              </details>
            </div>
          )}
          {purchase.error && String(purchase.error).includes("HTTP 404") && (
            <div>
              {!agg.data || (agg.data.items || []).length === 0 ? (
                <p className="muted">
                  Nothing to finalize yet.{" "}
                  <button className="btn ghost" onClick={() => onSetTab("day")}>
                    Go to Day
                  </button>
                </p>
              ) : (
                <button
                  onClick={() => setModal("precheck")}
                  disabled={finalize.isPending}
                  className="btn primary"
                >
                  {finalize.isPending ? "Finalizing…" : "Finalize from Aggregate"}
                </button>
              )}
              {finalize.error && <div className="danger">{String(finalize.error)}</div>}
            </div>
          )}

          {/* Finalize confirmation modal */}
          {modal === "finalize" && agg.data && (
            <Modal
              open={true}
              onClose={() => !finalize.isPending && setModal("closed")}
              size="lg"
              top
            >
              <ModalBody>
                <h3>Finalize purchase</h3>
                <div className="muted" style={{ marginBottom: 8 }}>
                  {forDate} • Buyer: {memberLabel(meQ.data?.id)}
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ textAlign: "right" }}>Qty</th>
                      <th style={{ textAlign: "right" }}>Unit</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(agg.data.items || [])
                      .filter((it) => Number(it.total_qty || 0) > 0)
                      .map((it) => (
                        <tr key={it.price_item_id}>
                          <td>{it.name || priceName(it.price_item_id) || it.price_item_id}</td>
                          <td style={{ textAlign: "right" }}>{it.total_qty}</td>
                          <td style={{ textAlign: "right" }}>
                            {formatMoney(Number(it.unit_price_minor || 0), currency)}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {formatMoney(Number(it.item_total_minor || 0), currency)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} style={{ textAlign: "right" }}>
                        <strong>Total</strong>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{formatMoney(Number(agg.data.total_minor || 0), currency)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </ModalBody>
              <ModalActions>
                <button
                  className="btn"
                  onClick={() => setModal("closed")}
                  disabled={finalize.isPending}
                >
                  Cancel
                </button>
                <button
                  className="btn primary"
                  onClick={() => finalize.mutate()}
                  disabled={finalize.isPending}
                >
                  {finalize.isPending ? "Finalizing…" : "Confirm finalize"}
                </button>
              </ModalActions>
            </Modal>
          )}

          {/* Precheck modal */}
          {modal === "precheck" && (
            <Modal open={true} onClose={() => setModal("closed")} size="sm" top>
              <ModalBody>
                <h3>Everything bought as ordered?</h3>
                <p className="muted">
                  Did you buy all items as requested, or do you need to record adjustments
                  (shortages or substitutions)?
                </p>
              </ModalBody>
              <ModalActions>
                <button className="btn" onClick={() => setModal("closed")}>
                  Cancel
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    setModal("finalize");
                  }}
                >
                  Yes, finalize as is
                </button>
                <button className="btn" onClick={openWorksheetFromAggregate}>
                  No, make adjustments
                </button>
              </ModalActions>
            </Modal>
          )}

          {/* Worksheet modal */}
          {modal === "worksheet" && (
            <Modal open={true} onClose={() => setModal("closed")} size="lg" top dim>
              <ModalBody>
                <h3>Finalize with adjustments</h3>
                <div className="muted" style={{ marginBottom: 8 }}>
                  {forDate} • Buyer: {memberLabel(meQ.data?.id)}
                </div>
                {!ws.length && <div className="muted">No lines to adjust.</div>}
                <div className="worksheet-row" style={{ marginBottom: 8 }}>
                  <strong>Add price list item</strong>
                  <div className="row" style={{ marginTop: 6, alignItems: "center", gap: 8 }}>
                    {(() => {
                      const wsIds = new Set(ws.map((w) => w.price_item_id));
                      const items = (price.data || []).filter(
                        (pi) => pi && pi.id && !wsIds.has(pi.id),
                      );
                      return (
                        <>
                          <select
                            className="input select"
                            value={addItemId}
                            onChange={(e) => setAddItemId(e.target.value)}
                            style={{ minWidth: 280 }}
                          >
                            <option value="">-- choose item --</option>
                            {items.map((pi) => (
                              <option key={pi.id} value={pi.id}>
                                {pi.name} •{" "}
                                {formatMoney(Number(pi.unit_price_minor || 0), currency)}
                              </option>
                            ))}
                          </select>
                          <button
                            className="btn"
                            onClick={() => {
                              const id = addItemId;
                              if (!id) return;
                              const pi = (price.data || []).find(
                                (x) => String(x.id) === String(id),
                              );
                              if (!pi) return;
                              setWs((cur) => [
                                ...cur,
                                {
                                  key: `pi:${id}:${Date.now()}`,
                                  price_item_id: String(id),
                                  name: String(pi.name || ""),
                                  unit_price_minor: Number(pi.unit_price_minor || 0),
                                  delivered: {},
                                },
                              ]);
                              setAddItemId("");
                            }}
                          >
                            Add
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>
                {ws.map((ln, idx) => {
                  const sum = Object.values(ln.delivered).reduce((s, q) => s + Number(q || 0), 0);
                  return (
                    <div key={ln.key} className="worksheet-row" style={{ marginBottom: 8 }}>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <strong>
                            {ln.name || priceName(ln.price_item_id) || ln.price_item_id}
                          </strong>
                          <span className="mini muted">
                            • {formatMoney(ln.unit_price_minor, currency)}
                          </span>
                        </div>
                        <div className="row" style={{ alignItems: "center", gap: 8 }}>
                          <span className="mini">Delivered total: {sum}</span>
                        </div>
                      </div>
                      <table className="table" style={{ marginTop: 6 }}>
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th style={{ textAlign: "right" }}>Delivered</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.keys(ln.delivered).map((uid) => (
                            <tr key={uid}>
                              <td>{memberLabel(uid)}</td>
                              <td style={{ textAlign: "right" }}>
                                <div className="qty-stepper">
                                  <button
                                    className="btn"
                                    onClick={() =>
                                      setWs((cur) =>
                                        cur.map((w, i) =>
                                          i === idx
                                            ? {
                                                ...w,
                                                delivered: {
                                                  ...w.delivered,
                                                  [uid]: Math.max(
                                                    0,
                                                    Number((w.delivered[uid] || 0) - 1),
                                                  ),
                                                },
                                              }
                                            : w,
                                        ),
                                      )
                                    }
                                  >
                                    −
                                  </button>
                                  <span className="qty">{ln.delivered[uid] || 0}</span>
                                  <button
                                    className="btn"
                                    onClick={() =>
                                      setWs((cur) =>
                                        cur.map((w, i) =>
                                          i === idx
                                            ? {
                                                ...w,
                                                delivered: {
                                                  ...w.delivered,
                                                  [uid]: Number((w.delivered[uid] || 0) + 1),
                                                },
                                              }
                                            : w,
                                        ),
                                      )
                                    }
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td>
                                <button
                                  className="btn"
                                  onClick={() =>
                                    setWs((cur) =>
                                      cur.map((w, i) => {
                                        if (i !== idx) return w;
                                        const d = { ...w.delivered };
                                        delete d[uid];
                                        return { ...w, delivered: d };
                                      }),
                                    )
                                  }
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr>
                            <td colSpan={3}>
                              {(() => {
                                const existing = new Set(Object.keys(ln.delivered));
                                const candidates = (members.data || [])
                                  .map((m) => m.user_id)
                                  .filter((id) => id && !existing.has(id));
                                if (candidates.length === 0)
                                  return <div className="mini muted">All members included.</div>;
                                let local = "" as string;
                                return (
                                  <div className="row">
                                    <label className="muted mini">Add member</label>
                                    <select
                                      className="input select"
                                      defaultValue=""
                                      onChange={(e) => {
                                        local = e.target.value;
                                      }}
                                      style={{ minWidth: 240 }}
                                    >
                                      <option value="">-- choose member --</option>
                                      {candidates.map((id) => (
                                        <option key={id} value={id}>
                                          {memberLabel(id)}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      className="btn"
                                      onClick={() => {
                                        if (local)
                                          setWs((cur) =>
                                            cur.map((w, i) =>
                                              i === idx
                                                ? {
                                                    ...w,
                                                    delivered: { ...w.delivered, [local]: 1 },
                                                  }
                                                : w,
                                            ),
                                          );
                                      }}
                                    >
                                      Add
                                    </button>
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="row" style={{ marginTop: 10 }}>
                        <button
                          className="btn"
                          onClick={() =>
                            setWs((cur) =>
                              cur.map((w, i) =>
                                i === idx
                                  ? {
                                      ...w,
                                      delivered: Object.fromEntries(
                                        Object.keys(w.delivered).map((k) => [k, 0]),
                                      ),
                                    }
                                  : w,
                              ),
                            )
                          }
                        >
                          Set all 0
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="row" style={{ marginTop: 8, justifyContent: "space-between" }}>
                  <div className="row">
                    <label className="muted">Notes</label>
                    <input
                      className="input"
                      value={wsNotes}
                      onChange={(e) => setWsNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      style={{ minWidth: 280 }}
                    />
                  </div>
                </div>
              </ModalBody>
              <ModalActions>
                <button className="btn" onClick={() => setModal("closed")}>
                  Close
                </button>
                <button className="btn primary" onClick={() => finalizeFromWorksheet()}>
                  Submit adjustments
                </button>
              </ModalActions>
            </Modal>
          )}
        </div>
      </section>
    </>
  );
}
