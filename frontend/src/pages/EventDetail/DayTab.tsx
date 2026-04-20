import React from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatYMDToLocale } from "../../lib/date";
import { formatMoney, parseMoneyToMinor } from "../../lib/money";
import { Modal, ModalBody, ModalActions } from "../../components/ui/Modal";
import DateField from "../../components/DateField";
import MoneyInput from "../../components/MoneyInput";
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

  // Active purchase = not invalidated
  const activePurchase = purchase.data && !purchase.data.invalidated_at ? purchase.data : null;
  const canFinalize = !activePurchase && (purchase.error || purchase.data?.invalidated_at);

  // Snapshot "tomorrow" once per mount — chip label doesn't need sub-day accuracy.
  const [tomorrow] = React.useState(() =>
    new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  );

  const statusChip = React.useMemo(() => {
    if (activePurchase) return { className: "chip finalized", text: t("day.finalized") };
    if (lockInfo.locked) return { className: "chip locked", text: t("day.locked") };
    if (forDate === tomorrow) {
      return {
        className: "chip open",
        text: t("day.openUntil", { time: lockInfo.cutoffTime }),
      };
    }
    return { className: "chip open", text: t("day.open") };
  }, [activePurchase, lockInfo, t, forDate, tomorrow]);

  // --- Rollover (server-side preference) ---
  const rolloverEnabled = ctx.meMember?.rollover_enabled ?? true;
  const toggleRollover = React.useCallback(() => {
    api.setRollover(eventId, !rolloverEnabled).then(() => {
      qc.refetchQueries({ queryKey: ["members", eventId] });
      qc.invalidateQueries({ queryKey: ["myOrder", eventId, forDate] });
      qc.invalidateQueries({ queryKey: ["agg", eventId, forDate] });
    });
  }, [eventId, forDate, rolloverEnabled, qc]);

  // --- Local state ---
  // Derive saved quantities from the server; overlay user edits via `dirty`.
  // When dirty is null, the form shows the server value. Reset via setDirty(null).
  const saved = React.useMemo(() => {
    const q: Record<string, number> = {};
    myOrder.data?.items?.forEach((it) => (q[it.price_item_id] = it.qty));
    return q;
  }, [myOrder.data]);
  const [dirty, setDirty] = React.useState<Record<string, number> | null>(null);
  const quantities = dirty ?? saved;

  // Check if quantities differ from saved order
  const orderUnchanged = React.useMemo(() => {
    if (dirty === null) return true;
    const activeIds = new Set((price.data || []).map((pi) => pi.id));
    for (const id of activeIds) {
      if ((dirty[id] || 0) !== (saved[id] || 0)) return false;
    }
    return true;
  }, [dirty, saved, price.data]);

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
      setDirty(null);
      qc.invalidateQueries({ queryKey: ["myOrder", eventId, forDate] });
      qc.invalidateQueries({ queryKey: ["agg", eventId, forDate] });
    },
  });

  type ModalState = "closed" | "precheck" | "finalize" | "worksheet" | "amounts";
  const [modal, setModal] = React.useState<ModalState>("closed");
  const [ws, setWs] = React.useState<WSLine[]>([]);
  const [wsNotes, setWsNotes] = React.useState("");
  const [addItemId, setAddItemId] = React.useState("");
  const hasDeliveryFee = !!ev.data?.delivery_fee_minor && ev.data.delivery_fee_minor > 0;
  const [deliveryFeeChecked, setDeliveryFeeChecked] = React.useState(true);
  const [receiptFile, setReceiptFile] = React.useState<File | null>(null);
  const [amountsByUser, setAmountsByUser] = React.useState<Record<string, string>>({});
  const [amountsNotes, setAmountsNotes] = React.useState("");

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
    onSuccess: async () => {
      if (receiptFile) {
        try {
          await api.uploadReceipt(eventId, forDate, receiptFile);
          setReceiptFile(null);
        } catch {
          /* receipt upload optional */
        }
      }
      setModal("closed");
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
    onSuccess: async () => {
      if (receiptFile) {
        try {
          await api.uploadReceipt(eventId, forDate, receiptFile);
          setReceiptFile(null);
        } catch {
          /* receipt upload optional */
        }
      }
      setModal("closed");
      qc.invalidateQueries({ queryKey: ["purchase", eventId, forDate] });
      qc.invalidateQueries({ queryKey: ["balances", eventId] });
      qc.invalidateQueries({ queryKey: ["payments", eventId] });
    },
  });

  const finalizeAmounts = useMutation({
    mutationFn: async (payload: { amounts: Record<string, number>; notes: string }) => {
      const name = payload.notes.trim() || t("day.amountsDefaultLine");
      const lines = Object.entries(payload.amounts)
        .filter(([, minor]) => minor > 0)
        .map(([user_id, minor]) => ({
          type: "custom" as const,
          name,
          qty_final: 1,
          unit_price_minor: minor,
          allocations: [{ user_id, qty: 1 }],
        }));
      if (!lines.length) throw new Error(t("day.amountsEmpty"));
      return api.createPurchase(
        eventId,
        forDate,
        lines,
        payload.notes.trim() || undefined,
        hasDeliveryFee && deliveryFeeChecked,
      );
    },
    onSuccess: async () => {
      if (receiptFile) {
        try {
          await api.uploadReceipt(eventId, forDate, receiptFile);
          setReceiptFile(null);
        } catch {
          /* receipt upload optional */
        }
      }
      setModal("closed");
      setAmountsByUser({});
      setAmountsNotes("");
      qc.invalidateQueries({ queryKey: ["purchase", eventId, forDate] });
      qc.invalidateQueries({ queryKey: ["balances", eventId] });
      qc.invalidateQueries({ queryKey: ["payments", eventId] });
    },
  });

  function openAmountsModal() {
    setAmountsByUser({});
    setAmountsNotes("");
    setModal("amounts");
  }

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
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>{t("day.yourOrder")}</h3>
            {myOrder.data?.is_rolled_over && myOrder.data?.rolled_from_date && (
              <div className="chip" style={{ background: "#e5e7eb" }}>
                {t("day.rolledOver", { date: formatYMDToLocale(myOrder.data.rolled_from_date) })}
              </div>
            )}
            {myOrder.data?.is_explicit && <div className="chip open">{t("day.explicitOrder")}</div>}
            {!myOrder.data?.is_rolled_over && !myOrder.data?.is_explicit && !myOrder.isLoading && (
              <div className="chip muted">{t("day.noOrder")}</div>
            )}
          </div>
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
                            setDirty((cur) => {
                              const base = cur ?? saved;
                              return {
                                ...base,
                                [pi.id]: Math.max(0, (base[pi.id] || 0) - 1),
                              };
                            })
                          }
                          disabled={readOnly || qty <= 0}
                        >
                          −
                        </button>
                        <span className="qty">{qty}</span>
                        <button
                          className="btn"
                          onClick={() =>
                            setDirty((cur) => {
                              const base = cur ?? saved;
                              return { ...base, [pi.id]: (base[pi.id] || 0) + 1 };
                            })
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
              !!activePurchase ||
              lockInfo.locked ||
              inactiveForDate ||
              orderUnchanged
            }
            className="btn primary"
            style={{ marginTop: 10 }}
          >
            {activePurchase
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
              <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                <strong>
                  {t("day.groupTotal", {
                    amount: formatMoney(Number(agg.data.total_minor || 0), currency),
                  })}
                </strong>
              </div>
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
                  <div style={{ marginTop: 20 }}>
                    <h4 style={{ margin: "12px 0 8px" }}>{t("day.perMember")}</h4>
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
          <h3>{activePurchase ? t("day.purchaseCompleted") : t("day.forBuyer")}</h3>
          <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
            {activePurchase ? t("day.purchaseCompletedHint") : t("day.forBuyerHint")}
          </p>
          {purchase.isLoading && <p>{t("day.checkingPurchase")}</p>}
          {activePurchase && (
            <div className="vstack">
              <div>
                {t("day.buyer")}: {memberLabel(activePurchase.buyer_id)}
              </div>
              <div>
                {t("day.total")}: {formatMoney(Number(activePurchase.total_minor || 0), currency)}
              </div>
              <details style={{ marginTop: 8 }}>
                <summary>{t("day.lines")}</summary>
                <ul>
                  {activePurchase.lines.map((ln, idx) => {
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
              {/* Receipt view */}
              {activePurchase.has_receipt && (
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn"
                    onClick={() => window.open(api.getReceiptUrl(eventId, forDate), "_blank")}
                  >
                    {t("day.viewReceipt")}
                  </button>
                </div>
              )}
              {/* Admin: invalidate */}
              {isOwner && !activePurchase.invalidated_at && (
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
              {activePurchase.invalidated_at && (
                <div className="chip warn" style={{ marginTop: 8 }}>
                  {t("day.invalidatedBy", {
                    name: memberLabel(activePurchase.invalidated_by || undefined),
                    reason: activePurchase.invalidation_reason || "",
                  })}
                </div>
              )}
            </div>
          )}
          {canFinalize && (
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
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                    {t("day.receiptHint")}
                  </div>
                  <label
                    className="btn receipt-upload"
                    style={{ cursor: "pointer", display: "inline-block" }}
                  >
                    {receiptFile ? `✓ ${receiptFile.name}` : t("day.uploadReceipt")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
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
                {hasDeliveryFee && (
                  <div className="row" style={{ marginTop: 12, alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={deliveryFeeChecked}
                      onChange={(e) => setDeliveryFeeChecked(e.target.checked)}
                      id="precheck-delivery-fee"
                    />
                    <label htmlFor="precheck-delivery-fee">
                      {t("day.deliveryFeeApplied", {
                        amount: formatMoney(ev.data?.delivery_fee_minor || 0, currency),
                      })}
                    </label>
                  </div>
                )}
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
                <button className="btn" onClick={openAmountsModal}>
                  {t("day.justAmounts")}
                </button>
              </ModalActions>
            </Modal>
          )}

          {/* Worksheet modal */}
          {modal === "worksheet" && (
            <Modal open={true} onClose={() => setModal("precheck")} size="lg" top dim>
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
                {hasDeliveryFee && (
                  <div className="row" style={{ marginTop: 12, alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={deliveryFeeChecked}
                      onChange={(e) => setDeliveryFeeChecked(e.target.checked)}
                      id="delivery-fee-ws"
                    />
                    <label htmlFor="delivery-fee-ws">
                      {t("day.deliveryFeeApplied", {
                        amount: formatMoney(ev.data?.delivery_fee_minor || 0, currency),
                      })}
                    </label>
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                    {t("day.receiptHint")}
                  </div>
                  <label
                    className="btn receipt-upload"
                    style={{ cursor: "pointer", display: "inline-block" }}
                  >
                    {receiptFile ? `✓ ${receiptFile.name}` : t("day.uploadReceipt")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </ModalBody>
              <ModalActions>
                <button className="btn" onClick={() => setModal("precheck")}>
                  {t("app.cancel")}
                </button>
                <button className="btn primary" onClick={() => finalizeFromWorksheet()}>
                  {t("day.submitAdjustments")}
                </button>
              </ModalActions>
            </Modal>
          )}

          {/* Amounts modal: per-member sum finalization (non-standard days) */}
          {modal === "amounts" &&
            (() => {
              const activeMembers = (members.data || []).filter((m) => !m.left_at);

              // Build per-user order summary from aggregate
              const summaryByUser = new Map<string, string>();
              for (const it of agg.data?.items || []) {
                for (const c of it.consumers || []) {
                  const q = Number(c.qty || 0);
                  if (q <= 0) continue;
                  const prev = summaryByUser.get(c.user_id);
                  const chunk = `${q}× ${it.name || t("day.item")}`;
                  summaryByUser.set(c.user_id, prev ? `${prev}, ${chunk}` : chunk);
                }
              }

              const sortedMembers = [...activeMembers].sort((a, b) => {
                const aHas = summaryByUser.has(a.user_id) ? 0 : 1;
                const bHas = summaryByUser.has(b.user_id) ? 0 : 1;
                if (aHas !== bHas) return aHas - bHas;
                return memberLabel(a.user_id).localeCompare(memberLabel(b.user_id));
              });

              const totalMinor = Object.values(amountsByUser).reduce((sum, v) => {
                const n = parseMoneyToMinor(v);
                return sum + (isFinite(n) && n > 0 ? n : 0);
              }, 0);
              const canSubmit = totalMinor > 0 && !finalizeAmounts.isPending;

              return (
                <Modal open={true} onClose={() => setModal("precheck")} size="md" top>
                  <ModalBody>
                    <h3 style={{ marginTop: 0 }}>{t("day.amountsTitle")}</h3>
                    <div className="muted" style={{ marginBottom: 4 }}>
                      {forDate} • {t("day.buyer")}: {memberLabel(meQ.data?.id)}
                    </div>
                    <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                      {t("day.amountsHint")}
                    </div>
                    <div className="vstack" style={{ gap: 10 }}>
                      {sortedMembers.map((m) => {
                        const summary = summaryByUser.get(m.user_id);
                        return (
                          <div
                            key={m.user_id}
                            className="row"
                            style={{
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div>{memberLabel(m.user_id)}</div>
                              <div
                                className="muted"
                                style={{ fontSize: 12, wordBreak: "break-word" }}
                              >
                                {summary
                                  ? t("day.amountsOrderedSummary", { items: summary })
                                  : t("day.amountsNoneOrdered")}
                              </div>
                            </div>
                            <div
                              className="row"
                              style={{ gap: 4, alignItems: "center", flexShrink: 0 }}
                            >
                              <MoneyInput
                                value={amountsByUser[m.user_id] || ""}
                                onChange={(v) =>
                                  setAmountsByUser((prev) => ({ ...prev, [m.user_id]: v }))
                                }
                                placeholder="0,00"
                                style={{ width: 90 }}
                              />
                              <span className="muted">{currency}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
                      <strong>
                        {t("day.amountsTotal", { amount: formatMoney(totalMinor, currency) })}
                      </strong>
                    </div>
                    {hasDeliveryFee && (
                      <div className="row" style={{ marginTop: 12, alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={deliveryFeeChecked}
                          onChange={(e) => setDeliveryFeeChecked(e.target.checked)}
                          id="delivery-fee-amounts"
                        />
                        <label htmlFor="delivery-fee-amounts">
                          {t("day.deliveryFeeApplied", {
                            amount: formatMoney(ev.data?.delivery_fee_minor || 0, currency),
                          })}
                        </label>
                      </div>
                    )}
                    <div className="field" style={{ marginTop: 12 }}>
                      <label className="muted" style={{ fontSize: 13 }}>
                        {t("day.notes")}
                      </label>
                      <input
                        className="input"
                        value={amountsNotes}
                        onChange={(e) => setAmountsNotes(e.target.value)}
                        placeholder={t("day.amountsNotePlaceholder")}
                        maxLength={200}
                      />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                        {t("day.receiptHint")}
                      </div>
                      <label
                        className="btn receipt-upload"
                        style={{ cursor: "pointer", display: "inline-block" }}
                      >
                        {receiptFile ? `✓ ${receiptFile.name}` : t("day.uploadReceipt")}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          style={{ display: "none" }}
                          onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                    {finalizeAmounts.error && (
                      <div className="danger" style={{ marginTop: 8 }}>
                        {String(finalizeAmounts.error)}
                      </div>
                    )}
                  </ModalBody>
                  <ModalActions>
                    <button
                      className="btn"
                      onClick={() => setModal("precheck")}
                      disabled={finalizeAmounts.isPending}
                    >
                      {t("app.cancel")}
                    </button>
                    <button
                      className="btn primary"
                      onClick={() => {
                        const amounts: Record<string, number> = {};
                        for (const [uid, v] of Object.entries(amountsByUser)) {
                          const n = parseMoneyToMinor(v);
                          if (isFinite(n) && n > 0) amounts[uid] = n;
                        }
                        finalizeAmounts.mutate({ amounts, notes: amountsNotes });
                      }}
                      disabled={!canSubmit}
                    >
                      {finalizeAmounts.isPending ? t("day.finalizing") : t("day.confirmFinalize")}
                    </button>
                  </ModalActions>
                </Modal>
              );
            })()}
        </div>
      </section>
    </>
  );
}
