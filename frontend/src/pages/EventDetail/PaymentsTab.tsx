import React from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { formatMoney, parseMoneyToMinor } from "../../lib/money";
import MoneyInput from "../../components/MoneyInput";
import type { EventContextType } from "../../hooks/useEventContext";
import type { BalanceLine, LeaveErrorPayload, Payment } from "../../lib/types";

type PaymentsTabProps = {
  ctx: EventContextType;
  eventId: string;
};

export default function PaymentsTab({ ctx, eventId }: PaymentsTabProps) {
  const { t } = useTranslation();
  const { balances, payments, meQ, members, memberLabel, meMember, qc } = ctx;
  const meId = meQ.data?.id;
  const currency = balances.data?.currency || "";

  // Payment mutations
  const [paymentFormKey, setPaymentFormKey] = React.useState(0);
  const createPay = useMutation({
    mutationFn: (vars: { to_user_id: string; amount_minor: number; note?: string }) =>
      api.createPayment(eventId, vars.to_user_id, vars.amount_minor, vars.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments", eventId] });
      qc.invalidateQueries({ queryKey: ["balances", eventId] });
      setPaymentFormKey((k) => k + 1);
    },
  });
  const confirmPay = useMutation({
    mutationFn: (id: string) => api.confirmPayment(eventId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments", eventId] });
      qc.invalidateQueries({ queryKey: ["balances", eventId] });
    },
  });
  const declinePay = useMutation({
    mutationFn: (vars: { id: string; reason?: string }) =>
      api.declinePayment(eventId, vars.id, vars.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments", eventId] });
    },
  });
  const cancelPay = useMutation({
    mutationFn: (id: string) => api.cancelPayment(eventId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments", eventId] });
    },
  });

  // Leave intent + leave actions
  const setLeaveIntent = useMutation({
    mutationFn: (wants: boolean) => api.setLeaveIntent(eventId, wants),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["balances", eventId] });
      qc.invalidateQueries({ queryKey: ["members", eventId] });
    },
  });
  const leave = useMutation({
    mutationFn: () => api.leaveEvent(eventId),
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  // Clear stale leave error when balances update
  React.useEffect(() => {
    if (leave.error) leave.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balances.data]);

  return (
    <>
      {/* Balances */}
      <section className="section">
        <div className="card">
          <h3>{t("payments.balances")}</h3>
          {balances.isLoading && <p>{t("payments.loadingBalances")}</p>}
          {balances.error && <p className="danger">{String(balances.error)}</p>}
          {balances.data && (
            <>
              {(() => {
                const leavers = (balances.data?.totals || []).filter((t) => t.wants_to_leave);
                if (leavers.length === 0) return null;
                return (
                  <div className="muted" style={{ marginBottom: 8 }}>
                    {t("payments.leaversHint", {
                      names: leavers.map((l) => memberLabel(l.user_id)).join(", "),
                    })}
                  </div>
                );
              })()}
              <table className="table" style={{ maxWidth: 520 }}>
                <thead>
                  <tr>
                    <th>{t("payments.user")}</th>
                    <th style={{ textAlign: "right" }}>{t("payments.balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(balances.data.totals || [])]
                    .sort((a, b) => (a.user_id < b.user_id ? -1 : 1))
                    .map((b) => (
                      <tr key={b.user_id}>
                        <td>
                          {memberLabel(b.user_id)}
                          {b.wants_to_leave && (
                            <span className="chip warn" style={{ marginLeft: 6 }}>
                              {t("payments.leaving")}
                            </span>
                          )}
                        </td>
                        <td
                          style={{ textAlign: "right" }}
                          className={(b.balance_minor || 0) < 0 ? "danger" : "ok"}
                        >
                          {formatMoney(Number(b.balance_minor || 0), balances.data?.currency)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>

              {balances.data && (
                <SettleMyBalance
                  me={meId}
                  totals={balances.data?.totals || []}
                  currency={balances.data?.currency}
                  label={memberLabel}
                  payments={payments.data || []}
                  onCreatePayment={(to, amount, note) =>
                    createPay.mutate({ to_user_id: to, amount_minor: amount, note })
                  }
                  isCreating={createPay.isPending}
                />
              )}

              {/* Leave intent / removed member message */}
              {(() => {
                if (!meId || !balances.data) return null;
                const my = (balances.data.totals || []).find((t) => t.user_id === meId);
                const myBal = Number(my?.balance_minor || 0);

                // Member was already removed by admin
                if (meMember?.left_at) {
                  return (
                    <div className="card" style={{ marginTop: 12 }}>
                      {myBal !== 0 ? (
                        <div>
                          <strong>{t("payments.removedByAdmin")}</strong>
                          <div className="muted" style={{ marginTop: 4 }}>
                            {t("payments.yourBalance", {
                              amount: formatMoney(Math.abs(myBal), currency),
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="ok">
                          <strong>{t("payments.balanceSettledLeft")}</strong>
                        </div>
                      )}
                    </div>
                  );
                }

                const wants = !!my?.wants_to_leave;
                return (
                  <div className="card" style={{ marginTop: 12 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <strong>{t("payments.leavingEvent")}</strong>
                        <div className="muted">{t("payments.leaveHint")}</div>
                      </div>
                      <div className="row">
                        <label className="muted">{t("payments.preparingToLeave")}</label>
                        <input
                          type="checkbox"
                          checked={wants}
                          onChange={(e) => setLeaveIntent.mutate(e.target.checked)}
                        />
                      </div>
                    </div>
                    <div className="row" style={{ marginTop: 8 }}>
                      <button
                        className="btn"
                        onClick={() => leave.mutate()}
                        disabled={leave.isPending}
                      >
                        {myBal === 0 ? t("payments.leaveEvent") : t("payments.tryLeave")}
                      </button>
                    </div>
                    {leave.error && (
                      <div style={{ marginTop: 8 }}>
                        <LeavePlanView
                          detail={(leave.error as Error & { detail?: unknown }).detail}
                          currency={balances.data.currency}
                          label={memberLabel}
                          onCreatePayment={(to, amt) =>
                            createPay.mutate({
                              to_user_id: to,
                              amount_minor: amt,
                              note: t("payments.balanceSettlement"),
                            })
                          }
                          creating={createPay.isPending}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </section>

      {/* Payments list */}
      <section className="section">
        <div className="card">
          <h3>{t("payments.paymentsTitle")}</h3>
          {payments.isLoading && <p>{t("payments.loadingPayments")}</p>}
          {payments.error && <p className="danger">{String(payments.error)}</p>}
          {(() => {
            let list = (payments.data || []).filter(
              (p) => !meId || p.from_user_id === meId || p.to_user_id === meId,
            );
            if (meId) {
              list = list.sort((a, b) => {
                const aPin = a.status === "pending" && a.to_user_id === meId ? 1 : 0;
                const bPin = b.status === "pending" && b.to_user_id === meId ? 1 : 0;
                return bPin - aPin;
              });
            }
            if (!list.length) return null;
            return (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("payments.fromTo")}</th>
                    <th className="hide-mobile">{t("payments.note")}</th>
                    <th style={{ textAlign: "right" }}>{t("payments.amount")}</th>
                    <th>{t("payments.status")}</th>
                    <th>{t("app.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p: Payment) => {
                    const isRecipient = meId && p.to_user_id === meId;
                    const isProposer = meId && p.from_user_id === meId;
                    const statusLabel =
                      p.status === "pending"
                        ? isRecipient
                          ? t("payments.awaitingYou")
                          : t("payments.awaitingRecipient")
                        : p.status === "confirmed"
                          ? t("payments.confirmed")
                          : p.status === "declined"
                            ? t("payments.declined")
                            : p.status === "canceled"
                              ? t("payments.canceled")
                              : p.status;
                    const statusClass =
                      p.status === "pending"
                        ? isRecipient
                          ? "chip warn"
                          : "chip"
                        : p.status === "confirmed"
                          ? "chip ok"
                          : p.status === "declined" || p.status === "canceled"
                            ? "chip locked"
                            : "chip";
                    return (
                      <tr
                        key={p.id}
                        className={p.status === "pending" && isRecipient ? "needs-action" : ""}
                      >
                        <td>
                          {memberLabel(p.from_user_id)} → {memberLabel(p.to_user_id)}
                          {p.note && (
                            <div
                              className="muted show-mobile-only"
                              style={{ fontSize: 12, wordBreak: "break-word" }}
                            >
                              {p.note}
                            </div>
                          )}
                          {p.decline_reason && (
                            <div
                              className="muted show-mobile-only"
                              style={{ fontSize: 12, fontStyle: "italic" }}
                            >
                              {t("payments.declineReason", { reason: p.decline_reason })}
                            </div>
                          )}
                        </td>
                        <td
                          className="hide-mobile"
                          style={{ maxWidth: 360, wordBreak: "break-word" }}
                        >
                          {p.note}
                          {p.decline_reason && (
                            <div className="muted" style={{ fontSize: 13, fontStyle: "italic" }}>
                              {t("payments.declineReason", { reason: p.decline_reason })}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {formatMoney(Number(p.amount_minor), p.currency)}
                        </td>
                        <td>
                          <span className={statusClass}>{statusLabel}</span>
                        </td>
                        <td>
                          {p.status === "pending" && isRecipient && (
                            <>
                              <button
                                onClick={() => confirmPay.mutate(p.id)}
                                disabled={confirmPay.isPending}
                                className="btn"
                                style={{ marginRight: 8 }}
                              >
                                {t("payments.confirmBtn")}
                              </button>
                              <button
                                onClick={() => {
                                  const reason =
                                    window.prompt(t("payments.declineReasonPrompt")) || undefined;
                                  declinePay.mutate({ id: p.id, reason });
                                }}
                                disabled={declinePay.isPending}
                                className="btn"
                              >
                                {t("payments.declineBtn")}
                              </button>
                            </>
                          )}
                          {p.status === "pending" && isProposer && (
                            <button
                              onClick={() => cancelPay.mutate(p.id)}
                              disabled={cancelPay.isPending}
                              className="btn"
                            >
                              {t("payments.cancelBtn")}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })()}
        </div>
      </section>

      {/* Log a payment */}
      {(() => {
        if (!meId) return null;
        const candidates = (members.data || [])
          .map((m) => m.user_id)
          .filter((id) => id && id !== meId);
        return (
          <section className="section">
            <div className="card">
              <NewPaymentForm
                key={paymentFormKey}
                currency={currency}
                me={meId}
                candidates={candidates}
                totals={balances.data?.totals || []}
                label={memberLabel}
                onSubmit={(to, amount_minor, note) =>
                  createPay.mutate({ to_user_id: to, amount_minor, note })
                }
              />
              {createPay.error && <div className="danger">{String(createPay.error)}</div>}
            </div>
          </section>
        );
      })()}
    </>
  );
}

// --- Sub-components ---

function NewPaymentForm({
  currency,
  me,
  candidates,
  totals,
  label,
  onSubmit,
}: {
  currency: string;
  me?: string;
  candidates: string[];
  totals: BalanceLine[];
  label: (id?: string) => string;
  onSubmit: (to: string, amount_minor: number, note?: string) => void;
}) {
  const { t } = useTranslation();
  const [payTo, setPayTo] = React.useState("");
  const [payAmount, setPayAmount] = React.useState("");
  const [payNote, setPayNote] = React.useState("");

  const filtered = candidates.filter((id) => id && id !== me);
  const parsedMinor = parseMoneyToMinor(payAmount);
  const disabled = !payTo || !payAmount || !isFinite(parsedMinor) || parsedMinor <= 0;

  const myBal = Number((totals || []).find((t) => t.user_id === me)?.balance_minor || 0);
  const toBal = Number((totals || []).find((t) => t.user_id === payTo)?.balance_minor || 0);

  // Pre-fill the amount to settle up exactly when the recipient is selected.
  const selectPayTo = (id: string) => {
    setPayTo(id);
    if (!id) return;
    const recipientBal = Number(
      (totals || []).find((t) => t.user_id === id)?.balance_minor || 0,
    );
    if (myBal < 0 && recipientBal > 0) {
      const exact = Math.min(-myBal, recipientBal);
      setPayAmount((exact / 100).toFixed(2));
    }
  };

  return (
    <div>
      <h4 style={{ margin: 0, marginBottom: 8 }}>{t("payments.newPayment")}</h4>
      <div className="row">
        <label className="muted">{t("payments.to")}</label>
        <select
          className="input select"
          value={payTo}
          onChange={(e) => selectPayTo(e.target.value)}
          style={{ width: 320 }}
        >
          <option value="">{t("payments.chooseRecipient")}</option>
          {filtered.map((id) => (
            <option key={id} value={id}>
              {label(id)}
            </option>
          ))}
        </select>
        <label className="muted">{t("payments.amount")}</label>
        <MoneyInput
          value={payAmount}
          onChange={setPayAmount}
          placeholder={t("payments.amountPlaceholder")}
          style={{ width: 140 }}
        />
        <span className="muted">{currency}</span>
        {myBal < 0 && toBal > 0 && (
          <div className="hstack">
            <button
              type="button"
              className="btn"
              onClick={() => setPayAmount((Math.min(-myBal, toBal) / 100).toFixed(2))}
            >
              {t("payments.exactMyBalance")}
            </button>
          </div>
        )}
        <input
          className="input"
          value={payNote}
          onChange={(e) => setPayNote(e.target.value)}
          placeholder={t("payments.notePlaceholder")}
          maxLength={150}
          style={{ minWidth: 240 }}
        />
        <button
          className="btn"
          onClick={() => {
            const amount_minor = parseMoneyToMinor(payAmount);
            if (isFinite(amount_minor) && amount_minor > 0 && payTo) {
              onSubmit(payTo, amount_minor, payNote || undefined);
            }
          }}
          disabled={disabled}
        >
          {t("app.create")}
        </button>
      </div>
    </div>
  );
}

function SettleMyBalance({
  me,
  totals,
  currency,
  label,
  payments,
  onCreatePayment,
  isCreating,
}: {
  me?: string;
  totals: BalanceLine[];
  currency: string;
  label: (id?: string) => string;
  payments: Payment[];
  onCreatePayment: (to: string, amount_minor: number, note?: string) => void;
  isCreating?: boolean;
}) {
  const { t } = useTranslation();
  const my = totals.find((t) => t.user_id === me);
  if (!me || !my) return null;
  const myBal = Number(my.balance_minor || 0);
  if (myBal === 0)
    return (
      <p className="ok" style={{ marginTop: 8 }}>
        {t("payments.youAreEven")}
      </p>
    );

  const pendingAmountTo = (toId: string) =>
    payments
      .filter((p) => p.from_user_id === me && p.to_user_id === toId && p.status === "pending")
      .reduce((sum, p) => sum + Number(p.amount_minor || 0), 0);

  const creditors = totals.filter((t) => Number(t.balance_minor) > 0 && t.user_id !== me);
  const debtors = totals.filter((t) => Number(t.balance_minor) < 0 && t.user_id !== me);

  if (myBal < 0) {
    const ordered = [...creditors];
    ordered.sort((a, b) => {
      const la = a.wants_to_leave ? 1 : 0;
      const lb = b.wants_to_leave ? 1 : 0;
      if (la !== lb) return lb - la;
      return Number(b.balance_minor) - Number(a.balance_minor);
    });
    let remaining = -myBal;
    const plan: { to: string; amount: number }[] = [];
    for (const c of ordered) {
      if (remaining <= 0) break;
      const canPay = Math.min(remaining, Number(c.balance_minor || 0));
      if (canPay > 0) {
        plan.push({ to: c.user_id, amount: canPay });
        remaining -= canPay;
      }
    }

    const allPending = plan.length > 0 && plan.every((p) => pendingAmountTo(p.to) >= p.amount);
    if (allPending) {
      return (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ margin: "6px 0" }}>{t("payments.settleMyBalance")}</h4>
          <p className="chip warn">{t("payments.allSettlementsPending")}</p>
        </div>
      );
    }

    return (
      <div style={{ marginTop: 12 }}>
        <h4 style={{ margin: "6px 0" }}>{t("payments.settleMyBalance")}</h4>
        <p className="muted">
          {t("payments.youOwe", { amount: (-myBal / 100).toFixed(2), currency })}
        </p>
        <ul>
          {plan.map((p, i) => {
            const pending = pendingAmountTo(p.to);
            const remaining = Math.max(0, p.amount - pending);
            const fullyCovered = pending >= p.amount;
            return (
              <li key={i}>
                {t("payments.payTo", {
                  amount: (p.amount / 100).toFixed(2),
                  currency,
                  name: label(p.to),
                })}
                {fullyCovered ? (
                  <span className="chip warn" style={{ marginLeft: 8 }}>
                    {t("payments.settlementPending")}
                  </span>
                ) : (
                  <>
                    {pending > 0 && (
                      <span className="chip warn" style={{ marginLeft: 8 }}>
                        {t("payments.partiallyPending", {
                          amount: (pending / 100).toFixed(2),
                          currency,
                        })}
                      </span>
                    )}
                    <button
                      className="btn"
                      style={{ marginLeft: 8 }}
                      onClick={() =>
                        onCreatePayment(p.to, remaining, t("payments.balanceSettlement"))
                      }
                      disabled={!!isCreating}
                    >
                      {pending > 0
                        ? t("payments.payRemaining", {
                            amount: (remaining / 100).toFixed(2),
                            currency,
                          })
                        : t("payments.createPayment")}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  } else {
    let remaining = myBal;
    const plan: { from: string; amount: number }[] = [];
    const ordered = [...debtors];
    ordered.sort((a, b) => {
      const la = a.wants_to_leave ? 1 : 0;
      const lb = b.wants_to_leave ? 1 : 0;
      if (la !== lb) return lb - la;
      return Number(a.balance_minor) - Number(b.balance_minor);
    });
    for (const d of ordered) {
      if (remaining <= 0) break;
      const willPay = Math.min(remaining, -Number(d.balance_minor || 0));
      if (willPay > 0) {
        plan.push({ from: d.user_id, amount: willPay });
        remaining -= willPay;
      }
    }
    return (
      <div style={{ marginTop: 12 }}>
        <h4 style={{ margin: "6px 0" }}>{t("payments.settleMyBalance")}</h4>
        <p className="muted">
          {t("payments.youShouldReceive", { amount: (myBal / 100).toFixed(2), currency })}
        </p>
        <ul>
          {plan.map((p, i) => (
            <li key={i}>
              {t("payments.shouldPayYou", {
                name: label(p.from),
                amount: (p.amount / 100).toFixed(2),
                currency,
              })}
            </li>
          ))}
        </ul>
      </div>
    );
  }
}

function LeavePlanView({
  detail,
  currency,
  label,
  onCreatePayment,
  creating,
}: {
  detail: unknown;
  currency: string;
  label: (id?: string) => string;
  onCreatePayment: (to: string, amount_minor: number) => void;
  creating?: boolean;
}) {
  const { t } = useTranslation();
  const payload: LeaveErrorPayload | undefined =
    detail && typeof detail === "object" && "detail" in detail
      ? (detail as { detail: LeaveErrorPayload }).detail
      : (detail as LeaveErrorPayload | undefined);
  const [dismissed, setDismissed] = React.useState(false);
  const isValid = !!payload && payload.reason === "balance_not_zero";
  if (!isValid) {
    return <div className="danger">{t("payments.unableToLeave")}</div>;
  }
  if (dismissed) return <div className="muted">{t("payments.dismissed")}</div>;
  const bal = Number(payload.balance_minor || 0);
  const plan = Array.isArray(payload.plan) ? payload.plan : [];
  return (
    <div>
      {bal < 0 ? (
        <div>
          <div className="danger">
            {t("payments.balanceNotZeroOwe", { amount: (-bal / 100).toFixed(2), currency })}
          </div>
          <div className="muted">{t("payments.payToGetEven")}</div>
          <ul>
            {plan.map((p, i) => {
              const toId = "to_user_id" in p ? p.to_user_id : "";
              const amt = Number(p.amount_minor);
              return (
                <li key={i}>
                  <input type="checkbox" readOnly style={{ marginRight: 6 }} />
                  {t("payments.payTo", {
                    amount: (amt / 100).toFixed(2),
                    currency,
                    name: label(toId),
                  })}
                  <button
                    className="btn"
                    style={{ marginLeft: 8 }}
                    onClick={() => onCreatePayment(toId, amt)}
                    disabled={!!creating}
                  >
                    {t("payments.createPayment")}
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="btn" onClick={() => setDismissed(true)}>
            {t("payments.dismiss")}
          </button>
        </div>
      ) : (
        <div>
          <div className="danger">
            {t("payments.balanceNotZeroReceive", { amount: (bal / 100).toFixed(2), currency })}
          </div>
          <div className="muted">{t("payments.askToPayYou")}</div>
          <ul>
            {plan.map((p, i) => {
              const fromId = "from_user_id" in p ? p.from_user_id : "";
              const amt = Number(p.amount_minor);
              return (
                <li key={i}>
                  <input type="checkbox" readOnly style={{ marginRight: 6 }} />
                  {t("payments.shouldPayYou", {
                    name: label(fromId),
                    amount: (amt / 100).toFixed(2),
                    currency,
                  })}
                </li>
              );
            })}
          </ul>
          <button className="btn" onClick={() => setDismissed(true)}>
            {t("payments.dismiss")}
          </button>
        </div>
      )}
    </div>
  );
}
