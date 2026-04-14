import React from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatYMDToLocale } from "../../lib/date";
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
  const { t } = useTranslation();
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
    meMember,
    memberLabel,
    priceName,
    isOwner,
    qc,
  } = ctx;

  const statusChip = React.useMemo(() => {
    if (purchase.data) return { className: "chip finalized", text: t("day.finalized") };
    if (lockInfo.locked) return { className: "chip locked", text: t("day.locked") };
    // Show cutoff time only for tomorrow (the next lockable date)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    if (forDate === tomorrow) {
      return {
        className: "chip open",
        text: t("day.openUntil", { time: lockInfo.cutoffTime }),
      };
    }
    return { className: "chip open", text: t("day.open") };
  }, [purchase.data, lockInfo, t, forDate]);

  // --- Rollover (server-side preference) ---
  const rolloverEnabled = ctx.meMember?.rollover_enabled ?? true;
  const toggleRollover = React.useCallback(() => {
    api.setRollover(eventId, !rolloverEnabled).then(() => {
      qc.invalidateQueries({ queryKey: ["members", eventId] });
      qc.invalidateQueries({ queryKey: ["myOrder", eventId] });
      qc.invalidateQueries({ queryKey: ["agg", eventId] });
    });
  }, [eventId, rolloverEnabled, qc]);

  // --- Local state ---
  const [quantities, setQuantities] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    const q: Record<string, number> = {};
    myOrder.data?.items?.forEach((it) => (q[it.price_item_id] = it.qty));
    setQuantities(q);
  }, [myOrder.data]);

  // Check if quantities differ from saved order
  const orderUnchanged = React.useMemo(() => {
    const saved: Record<string, number> = {};
    (myOrder.data?.items || []).forEach((it) => {
      saved[it.price_item_id] = it.qty;
    });
    const activeIds = new Set((price.data || []).map((pi) => pi.id));
    // Compare only active items
    for (const id of activeIds) {
      const q = quantities[id] || 0;
      const s = saved[id] || 0;
      if (q !== s) return false;
    }
    return true;
  }, [quantities, myOrder.data, price.data]);

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
  const hasDeliveryFee = !!ev.data?.delivery_fee_minor && ev.data.delivery_fee_minor > 0;
  const [deliveryFeeChecked, setDeliveryFeeChecked] = React.useState(true);

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
      return api.createPurchase(
        eventId,
        forDate,
        lines,
        undefined,
        hasDeliveryFee && deliveryFeeChecked,
      );
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
      return api.createPurchase(
        eventId,
        forDate,
        lines,
        notes,
        hasDeliveryFee && deliveryFeeChecked,
      );
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
      alert(t("day.noDeliveredItems"));
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
        <div className="row" style={{ alignItems: "center", flexWrap: "nowrap" }}>
          <label className="muted" style={{ whiteSpace: "nowrap" }}>
            {t("day.date")}
          </label>
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
            min={ev.data?.start_date}
            max={ev.data?.end_date}
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
        {holidays.labelByDate.get(forDate) && (
          <span className="chip muted" style={{ marginLeft: 8, border: "1px solid #d1d5db" }}>
            {holidays.labelByDate.get(forDate)}
          </span>
        )}
        <span className="spacer" />
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          <label className="muted">{t("day.rollover")}</label>
          <button className="btn" onClick={toggleRollover}>
            {rolloverEnabled ? t("app.on") : t("app.off")}
          </button>
        </div>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        {rolloverEnabled ? t("day.rolloverHintOn") : t("day.rolloverHintOff")}
      </div>

      {/* Your Order */}
      <section className="section">
        <div className="card">
          <h3>{t("day.yourOrder")}</h3>
          {myOrder.data?.is_rolled_over && myOrder.data?.rolled_from_date && (
            <div className="chip" style={{ marginBottom: 8, background: "#e5e7eb" }}>
              {t("day.rolledOver", { date: formatYMDToLocale(myOrder.data.rolled_from_date) })}
            </div>
          )}
          {myOrder.data?.is_explicit && (
            <div className="chip open" style={{ marginBottom: 8 }}>
              {t("day.explicitOrder")}
            </div>
          )}
          {!myOrder.data?.is_rolled_over && !myOrder.data?.is_explicit && !myOrder.isLoading && (
            <div className="chip muted" style={{ marginBottom: 8 }}>
              {t("day.noOrder")}
            </div>
          )}
          {price.isLoading && <p>{t("day.loadingPrice")}</p>}
          {myOrder.isLoading && <p>{t("day.loadingOrder")}</p>}
          {inactiveForDate && (
            <div className="muted">
              {meMember?.left_at
                ? t("day.leftEvent", { date: new Date(meMember.left_at).toLocaleDateString() })
                : t("day.notActiveMember")}
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>{t("day.item")}</th>
                <th style={{ textAlign: "right" }}>{t("day.unit")}</th>
                <th style={{ textAlign: "right" }}>{t("day.qty")}</th>
                <th style={{ textAlign: "right" }}>{t("day.total")}</th>
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
                <strong>{t("day.yourTotal", { amount: formatMoney(subtotal, currency) })}</strong>
              </div>
            );
          })()}
          <button
            onClick={() => upsert.mutate()}
            disabled={
              upsert.isPending ||
              !!purchase.data ||
              lockInfo.locked ||
              inactiveForDate ||
              orderUnchanged
            }
            className="btn primary"
            style={{ marginTop: 10 }}
          >
            {purchase.data
              ? t("day.finalized")
              : upsert.isPending
                ? t("day.saving")
                : t("day.saveOrder")}
          </button>
          {upsert.error && <div className="danger">{String(upsert.error)}</div>}
          {lockInfo.locked && (
            <div className="muted" style={{ marginTop: 6 }}>
              {t("day.lockedSince", { time: String(ev.data.cutoff_time || "").slice(0, 5) })}
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
                {t("day.inactiveItems", { count: inactive.length })}
              </div>
            );
          })()}
        </div>
      </section>

      {/* Aggregated For Date */}
      <section className="section">
        <div className="card">
          <h3>{t("day.aggregated")}</h3>
          {agg.isLoading && <p>{t("day.loadingAggregate")}</p>}
          {agg.error && <p className="danger">{String(agg.error)}</p>}
          {agg.data && (
            <div>
              <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
                <strong>
                  {t("day.groupTotal", {
                    amount: formatMoney(Number(agg.data.total_minor || 0), currency),
                  })}
                </strong>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("day.item")}</th>
                    <th style={{ textAlign: "right" }}>{t("day.qty")}</th>
                    <th style={{ textAlign: "right" }}>{t("day.unit")}</th>
                    <th style={{ textAlign: "right" }}>{t("day.total")}</th>
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
                    <h4 style={{ margin: "8px 0" }}>{t("day.perMember")}</h4>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t("day.member")}</th>
                          <th>{t("day.items")}</th>
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
          <h3>{purchase.data ? t("day.purchaseCompleted") : t("day.forBuyer")}</h3>
          <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
            {purchase.data ? t("day.purchaseCompletedHint") : t("day.forBuyerHint")}
          </p>
          {purchase.isLoading && <p>{t("day.checkingPurchase")}</p>}
          {purchase.data && (
            <div className="vstack">
              <div>
                {t("day.buyer")}: {memberLabel(purchase.data.buyer_id)}
              </div>
              <div>
                {t("day.total")}: {formatMoney(Number(purchase.data.total_minor || 0), currency)}
              </div>
              <details style={{ marginTop: 8 }}>
                <summary>{t("day.lines")}</summary>
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
              {/* Receipt upload / view */}
              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                {purchase.data.has_receipt ? (
                  <button
                    className="btn"
                    onClick={() => window.open(api.getReceiptUrl(eventId, forDate), "_blank")}
                  >
                    {t("day.viewReceipt")}
                  </button>
                ) : (
                  <label className="btn" style={{ cursor: "pointer" }}>
                    {t("day.uploadReceipt")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          await api.uploadReceipt(eventId, forDate, file);
                          qc.invalidateQueries({ queryKey: ["purchase", eventId, forDate] });
                        } catch (err) {
                          alert(String(err));
                        }
                      }}
                    />
                  </label>
                )}
              </div>
              {/* Admin: invalidate */}
              {isOwner && !purchase.data.invalidated_at && (
                <div style={{ marginTop: 12 }}>
                  <button
                    className="btn"
                    onClick={() => {
                      const reason = window.prompt(t("day.invalidateReason"));
                      if (reason) {
                        api.invalidatePurchase(eventId, forDate, reason).then(() => {
                          qc.invalidateQueries({ queryKey: ["purchase", eventId, forDate] });
                          qc.invalidateQueries({ queryKey: ["purchases", eventId] });
                          qc.invalidateQueries({ queryKey: ["balances", eventId] });
                        });
                      }
                    }}
                  >
                    {t("day.invalidate")}
                  </button>
                </div>
              )}
              {purchase.data.invalidated_at && (
                <div className="chip warn" style={{ marginTop: 8 }}>
                  {t("day.invalidatedBy", {
                    name: memberLabel(purchase.data.invalidated_by || undefined),
                    reason: purchase.data.invalidation_reason || "",
                  })}
                </div>
              )}
            </div>
          )}
          {purchase.error && String(purchase.error).includes("HTTP 404") && (
            <div>
              {!agg.data || (agg.data.items || []).length === 0 ? (
                <p className="muted">
                  {t("day.nothingToFinalize")}{" "}
                  <button className="btn" onClick={() => onSetTab("day")}>
                    {t("day.goToDay")}
                  </button>
                </p>
              ) : (
                <>
                  <button
                    onClick={() => setModal("precheck")}
                    disabled={finalize.isPending || forDate > new Date().toISOString().slice(0, 10)}
                    className="btn primary"
                  >
                    {finalize.isPending ? t("day.finalizing") : t("day.finalizeFromAggregate")}
                  </button>
                  {forDate > new Date().toISOString().slice(0, 10) && (
                    <p className="muted" style={{ marginTop: 4 }}>
                      {t("day.cannotFinalizeFuture")}
                    </p>
                  )}
                </>
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
                <h3>{t("day.finalizePurchase")}</h3>
                <div className="muted" style={{ marginBottom: 8 }}>
                  {forDate} • {t("day.buyer")}: {memberLabel(meQ.data?.id)}
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("day.item")}</th>
                      <th style={{ textAlign: "right" }}>{t("day.qty")}</th>
                      <th style={{ textAlign: "right" }}>{t("day.unit")}</th>
                      <th style={{ textAlign: "right" }}>{t("day.total")}</th>
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
                        <strong>{t("day.total")}</strong>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <strong>{formatMoney(Number(agg.data.total_minor || 0), currency)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {hasDeliveryFee && (
                  <div className="row" style={{ marginTop: 12, alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={deliveryFeeChecked}
                      onChange={(e) => setDeliveryFeeChecked(e.target.checked)}
                      id="delivery-fee-check"
                    />
                    <label htmlFor="delivery-fee-check">
                      {t("day.deliveryFeeApplied", {
                        amount: formatMoney(ev.data?.delivery_fee_minor || 0, currency),
                      })}
                    </label>
                  </div>
                )}
              </ModalBody>
              <ModalActions>
                <button
                  className="btn"
                  onClick={() => setModal("closed")}
                  disabled={finalize.isPending}
                >
                  {t("app.cancel")}
                </button>
                <button
                  className="btn primary"
                  onClick={() => finalize.mutate()}
                  disabled={finalize.isPending}
                >
                  {finalize.isPending ? t("day.finalizing") : t("day.confirmFinalize")}
                </button>
              </ModalActions>
            </Modal>
          )}

          {/* Precheck modal */}
          {modal === "precheck" && (
            <Modal open={true} onClose={() => setModal("closed")} size="sm" top>
              <ModalBody>
                <h3>{t("day.everythingAsOrdered")}</h3>
                <p className="muted">{t("day.everythingAsOrderedDesc")}</p>
              </ModalBody>
              <ModalActions>
                <button className="btn" onClick={() => setModal("closed")}>
                  {t("app.cancel")}
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    setModal("finalize");
                  }}
                >
                  {t("day.yesFinalizeAsIs")}
                </button>
                <button className="btn" onClick={openWorksheetFromAggregate}>
                  {t("day.noMakeAdjustments")}
                </button>
              </ModalActions>
            </Modal>
          )}

          {/* Worksheet modal */}
          {modal === "worksheet" && (
            <Modal open={true} onClose={() => setModal("closed")} size="lg" top dim>
              <ModalBody>
                <h3>{t("day.finalizeWithAdjustments")}</h3>
                <div className="muted" style={{ marginBottom: 8 }}>
                  {forDate} • {t("day.buyer")}: {memberLabel(meQ.data?.id)}
                </div>
                {!ws.length && <div className="muted">{t("day.noLinesToAdjust")}</div>}
                <div className="worksheet-row" style={{ marginBottom: 8 }}>
                  <strong>{t("day.addPriceListItem")}</strong>
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
                            <option value="">{t("day.chooseItem")}</option>
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
                            {t("app.add")}
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
                          <span className="mini">{t("day.deliveredTotal", { count: sum })}</span>
                        </div>
                      </div>
                      <table className="table" style={{ marginTop: 6 }}>
                        <thead>
                          <tr>
                            <th>{t("day.member")}</th>
                            <th style={{ textAlign: "right" }}>{t("day.delivered")}</th>
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
                                  {t("app.remove")}
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
                                  return (
                                    <div className="mini muted">{t("day.allMembersIncluded")}</div>
                                  );
                                let local = "" as string;
                                return (
                                  <div className="row">
                                    <label className="muted mini">{t("day.addMember")}</label>
                                    <select
                                      className="input select"
                                      defaultValue=""
                                      onChange={(e) => {
                                        local = e.target.value;
                                      }}
                                      style={{ minWidth: 240 }}
                                    >
                                      <option value="">{t("day.chooseMember")}</option>
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
                                      {t("app.add")}
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
                          {t("day.setAllZero")}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="row" style={{ marginTop: 8, justifyContent: "space-between" }}>
                  <div className="row">
                    <label className="muted">{t("day.notes")}</label>
                    <input
                      className="input"
                      value={wsNotes}
                      onChange={(e) => setWsNotes(e.target.value)}
                      placeholder={t("day.notesPlaceholder")}
                      style={{ minWidth: 280 }}
                    />
                  </div>
                </div>
              </ModalBody>
              <ModalActions>
                <button className="btn" onClick={() => setModal("closed")}>
                  {t("app.close")}
                </button>
                <button className="btn primary" onClick={() => finalizeFromWorksheet()}>
                  {t("day.submitAdjustments")}
                </button>
              </ModalActions>
            </Modal>
          )}
        </div>
      </section>
    </>
  );
}
