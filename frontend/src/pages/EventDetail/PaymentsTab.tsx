import React from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatMoney, parseMoneyToMinor } from "../../lib/money";
import type { EventContextType } from "../../hooks/useEventContext";
import type { BalanceLine, LeaveErrorPayload, Payment } from "../../lib/types";

type PaymentsTabProps = {
  ctx: EventContextType;
  eventId: string;
};

export default function PaymentsTab({ ctx, eventId }: PaymentsTabProps) {
  const { balances, payments, meQ, members, memberLabel, qc } = ctx;
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

  return (
    <>
      {/* Balances */}
      <section className="section">
        <div className="card">
          <h3>Balances</h3>
          {balances.isLoading && <p>Loading balances…</p>}
          {balances.error && <p className="danger">{String(balances.error)}</p>}
          {balances.data && (
            <>
              {(() => {
                const leavers = (balances.data?.totals || []).filter((t) => t.wants_to_leave);
                if (leavers.length === 0) return null;
                return (
                  <div className="muted" style={{ marginBottom: 8 }}>
                    Members preparing to leave:{" "}
                    {leavers.map((t) => memberLabel(t.user_id)).join(", ")}
                  </div>
                );
              })()}
              <table className="table" style={{ maxWidth: 520 }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th style={{ textAlign: "right" }}>Balance</th>
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
                              Leaving
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
                  onCreatePayment={(to, amount, note) =>
                    createPay.mutate({ to_user_id: to, amount_minor: amount, note })
                  }
                  isCreating={createPay.isPending}
                />
              )}

              {/* Leave intent */}
              {(() => {
                if (!meId || !balances.data) return null;
                const my = (balances.data.totals || []).find((t) => t.user_id === meId);
                const myBal = Number(my?.balance_minor || 0);
                const wants = !!my?.wants_to_leave;
                return (
                  <div className="card" style={{ marginTop: 12 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <strong>Leaving the event</strong>
                        <div className="muted">
                          Mark your intent and settle your balance to leave.
                        </div>
                      </div>
                      <div className="row">
                        <label className="muted">Preparing to leave</label>
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
                        {myBal === 0 ? "Leave event" : "Try leave (show payout plan)"}
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
                              note: "Balance settlement",
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
          <h3>Payments</h3>
          {payments.isLoading && <p>Loading payments…</p>}
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
                    <th>From → To</th>
                    <th>Note</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p: Payment) => {
                    const isRecipient = meId && p.to_user_id === meId;
                    const isProposer = meId && p.from_user_id === meId;
                    const statusLabel =
                      p.status === "pending"
                        ? isRecipient
                          ? "Awaiting you"
                          : "Awaiting recipient"
                        : p.status === "confirmed"
                          ? "Confirmed"
                          : p.status === "declined"
                            ? "Declined"
                            : p.status === "canceled"
                              ? "Canceled"
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
                        </td>
                        <td
                          style={{
                            maxWidth: 360,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.note}
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
                                Confirm
                              </button>
                              <button
                                onClick={() => {
                                  const reason =
                                    window.prompt("Decline reason (optional)") || undefined;
                                  declinePay.mutate({ id: p.id, reason });
                                }}
                                disabled={declinePay.isPending}
                                className="btn"
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {p.status === "pending" && isProposer && (
                            <button
                              onClick={() => cancelPay.mutate(p.id)}
                              disabled={cancelPay.isPending}
                              className="btn"
                            >
                              Cancel
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

          {/* Log a payment */}
          {(() => {
            if (!meId) return null;
            const candidates = (members.data || [])
              .map((m) => m.user_id)
              .filter((id) => id && id !== meId);
            return (
              <div style={{ marginTop: 12 }}>
                <h4 style={{ margin: "6px 0" }}>Log a payment</h4>
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
              </div>
            );
          })()}
          {createPay.error && <div className="danger">{String(createPay.error)}</div>}
        </div>
      </section>
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
  const [payTo, setPayTo] = React.useState("");
  const [payAmount, setPayAmount] = React.useState("");
  const [payNote, setPayNote] = React.useState("");

  const filtered = candidates.filter((id) => id && id !== me);
  const parsedMinor = parseMoneyToMinor(payAmount);
  const disabled = !payTo || !payAmount || !isFinite(parsedMinor) || parsedMinor <= 0;

  const myBal = Number((totals || []).find((t) => t.user_id === me)?.balance_minor || 0);
  const toBal = Number((totals || []).find((t) => t.user_id === payTo)?.balance_minor || 0);

  React.useEffect(() => {
    if (!payTo) return;
    if (myBal < 0 && toBal > 0) {
      const exact = Math.min(-myBal, toBal);
      setPayAmount((exact / 100).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payTo]);

  return (
    <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <h4 style={{ margin: 0, marginBottom: 8 }}>New Payment</h4>
      <div className="row">
        <label className="muted">To</label>
        <select
          className="input select"
          value={payTo}
          onChange={(e) => setPayTo(e.target.value)}
          style={{ width: 320 }}
        >
          <option value="">-- choose recipient --</option>
          {filtered.map((id) => (
            <option key={id} value={id}>
              {label(id)}
            </option>
          ))}
        </select>
        <label className="muted">Amount</label>
        <input
          className="input"
          value={payAmount}
          onChange={(e) => setPayAmount(e.target.value)}
          placeholder={`0,00`}
          inputMode="decimal"
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
              Exact my balance
            </button>
          </div>
        )}
        <input
          className="input"
          value={payNote}
          onChange={(e) => setPayNote(e.target.value)}
          placeholder="Note (optional)"
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
          Create
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
  onCreatePayment,
  isCreating,
}: {
  me?: string;
  totals: BalanceLine[];
  currency: string;
  label: (id?: string) => string;
  onCreatePayment: (to: string, amount_minor: number, note?: string) => void;
  isCreating?: boolean;
}) {
  const my = totals.find((t) => t.user_id === me);
  if (!me || !my) return null;
  const myBal = Number(my.balance_minor || 0);
  if (myBal === 0)
    return (
      <p className="ok" style={{ marginTop: 8 }}>
        You are even.
      </p>
    );

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
    return (
      <div style={{ marginTop: 12 }}>
        <h4 style={{ margin: "6px 0" }}>Settle my balance</h4>
        <p className="muted">
          You owe {(-myBal / 100).toFixed(2)} {currency}. Pay the following to get even:
        </p>
        <ul>
          {plan.map((p, i) => (
            <li key={i}>
              Pay {(p.amount / 100).toFixed(2)} {currency} to {label(p.to)}
              <button
                className="btn"
                style={{ marginLeft: 8 }}
                onClick={() => onCreatePayment(p.to, p.amount, "Balance settlement")}
                disabled={!!isCreating}
              >
                Create payment
              </button>
            </li>
          ))}
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
        <h4 style={{ margin: "6px 0" }}>Settle my balance</h4>
        <p className="muted">
          You should receive {(myBal / 100).toFixed(2)} {currency}. Ask the following to pay you:
        </p>
        <ul>
          {plan.map((p, i) => (
            <li key={i}>
              {label(p.from)} should pay you {(p.amount / 100).toFixed(2)} {currency}
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
  const payload: LeaveErrorPayload | undefined =
    detail && typeof detail === "object" && "detail" in detail
      ? (detail as { detail: LeaveErrorPayload }).detail
      : (detail as LeaveErrorPayload | undefined);
  const [dismissed, setDismissed] = React.useState(false);
  const isValid = !!payload && payload.reason === "balance_not_zero";
  if (!isValid) {
    return <div className="danger">Unable to leave.</div>;
  }
  if (dismissed) return <div className="muted">Dismissed.</div>;
  const bal = Number(payload.balance_minor || 0);
  const plan = Array.isArray(payload.plan) ? payload.plan : [];
  return (
    <div>
      {bal < 0 ? (
        <div>
          <div className="danger">
            Your balance is not zero. You owe {(-bal / 100).toFixed(2)} {currency}.
          </div>
          <div className="muted">Pay the following to get even:</div>
          <ul>
            {plan.map((p, i) => {
              const toId = "to_user_id" in p ? p.to_user_id : "";
              const amt = Number(p.amount_minor);
              return (
                <li key={i}>
                  <input type="checkbox" readOnly style={{ marginRight: 6 }} />
                  Pay {(amt / 100).toFixed(2)} {currency} to {label(toId)}
                  <button
                    className="btn"
                    style={{ marginLeft: 8 }}
                    onClick={() => onCreatePayment(toId, amt)}
                    disabled={!!creating}
                  >
                    Create payment
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="btn" onClick={() => setDismissed(true)}>
            Dismiss
          </button>
        </div>
      ) : (
        <div>
          <div className="danger">
            Your balance is not zero. You should receive {(bal / 100).toFixed(2)} {currency}.
          </div>
          <div className="muted">Ask the following to pay you:</div>
          <ul>
            {plan.map((p, i) => {
              const fromId = "from_user_id" in p ? p.from_user_id : "";
              const amt = Number(p.amount_minor);
              return (
                <li key={i}>
                  <input type="checkbox" readOnly style={{ marginRight: 6 }} />
                  {label(fromId)} should pay you {(amt / 100).toFixed(2)} {currency}
                </li>
              );
            })}
          </ul>
          <button className="btn" onClick={() => setDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
