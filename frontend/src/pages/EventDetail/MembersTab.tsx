import React from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Member } from "../../lib/api";
import { formatMoney } from "../../lib/money";
import { Modal, ModalActions, ModalBody } from "../../components/ui/Modal";
import type { EventContextType } from "../../hooks/useEventContext";
import { formatYMDToLocale } from "../../lib/date";

type MembersTabProps = {
  ctx: EventContextType;
  eventId: string;
};

export default function MembersTab({ ctx, eventId }: MembersTabProps) {
  const { t } = useTranslation();
  const { members, meId, isOwner, balances } = ctx;
  const qc = useQueryClient();

  const [removeTarget, setRemoveTarget] = React.useState<Member | null>(null);
  const [banChecked, setBanChecked] = React.useState(false);

  const remove = useMutation({
    mutationFn: (vars: { userId: string; ban: boolean }) =>
      api.removeMember(eventId, vars.userId, vars.ban),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", eventId] });
      qc.invalidateQueries({ queryKey: ["balances", eventId] });
      setRemoveTarget(null);
      setBanChecked(false);
    },
  });

  const unban = useMutation({
    mutationFn: (userId: string) => api.unbanMember(eventId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", eventId] });
    },
  });

  const promote = useMutation({
    mutationFn: (userId: string) => api.promoteMember(eventId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", eventId] });
    },
  });

  const setNote = useMutation({
    mutationFn: (note: string | null) => api.setMemberNote(eventId, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", eventId] });
    },
  });

  const openRemove = (m: Member) => {
    setRemoveTarget(m);
    setBanChecked(false);
  };

  const targetBalance = React.useMemo(() => {
    if (!removeTarget || !balances.data) return 0;
    const bal = balances.data.totals.find((b) => b.user_id === removeTarget.user_id);
    return Number(bal?.balance_minor || 0);
  }, [removeTarget, balances.data]);

  return (
    <section className="section">
      <div className="card">
        <h3>{t("members.title")}</h3>
        {members.isLoading && <p className="muted">{t("app.loading")}</p>}
        {members.error && <p className="danger">{String(members.error)}</p>}
        {members.data && members.data.length === 0 && (
          <p className="muted">{t("members.noMembers")}</p>
        )}
        {members.data && members.data.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>{t("members.name")}</th>
                <th style={{ whiteSpace: "nowrap", textAlign: "center" }}>{t("members.role")}</th>
                <th style={{ whiteSpace: "nowrap", textAlign: "center" }}>{t("members.status")}</th>
                <th style={{ whiteSpace: "nowrap" }}>{t("members.joined")}</th>
                {isOwner && <th style={{ whiteSpace: "nowrap" }}>{t("app.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {members.data.map((m) => {
                const name = (m.name && m.name.trim()) || m.email || m.user_id;
                const isMe = m.user_id === meId;
                const isBanned = !!m.banned_at;
                const isActive = !m.left_at;
                return (
                  <tr key={m.user_id}>
                    <td>
                      {name}
                      {isMe && <span className="muted"> ({t("app.you")})</span>}
                      {m.note && !isMe && (
                        <button
                          className="btn"
                          title={m.note}
                          onClick={() => window.alert(m.note)}
                          style={{
                            padding: "2px 6px",
                            fontSize: 14,
                            marginLeft: 4,
                            verticalAlign: "middle",
                          }}
                        >
                          ℹ️
                        </button>
                      )}
                      {isMe && (
                        <button
                          className="btn"
                          title={
                            m.note ? `${t("members.noteBtn")}: ${m.note}` : t("members.setNote")
                          }
                          disabled={setNote.isPending}
                          onClick={() => {
                            const current = m.note || "";
                            const input = window.prompt(t("members.noteHint"), current);
                            if (input !== null) {
                              setNote.mutate(input.trim() || null);
                            }
                          }}
                          style={{
                            padding: "2px 6px",
                            fontSize: 14,
                            marginLeft: 4,
                            verticalAlign: "middle",
                          }}
                        >
                          {m.note ? "✏️" : "📝"}
                        </button>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {m.role === "owner" ? (
                        <span className="chip" style={{ background: "#e5e7eb", fontWeight: 600 }}>
                          {t("members.owner")}
                        </span>
                      ) : (
                        <span className="chip muted">{t("members.member")}</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {isBanned ? (
                        <span className="chip warn">{t("members.banned")}</span>
                      ) : isActive ? (
                        <span className="chip open">{t("members.active")}</span>
                      ) : (
                        <span className="chip muted">{t("members.left")}</span>
                      )}
                    </td>
                    <td className="muted">{formatYMDToLocale(m.joined_at?.slice(0, 10) || "")}</td>
                    {isOwner && (
                      <td>
                        <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                          {isActive && !isMe && m.role !== "owner" && (
                            <button
                              className="btn"
                              title={t("members.promote")}
                              disabled={promote.isPending}
                              onClick={() => {
                                if (window.confirm(t("members.confirmPromote", { name }))) {
                                  promote.mutate(m.user_id);
                                }
                              }}
                              style={{ padding: "4px 8px", fontSize: 16 }}
                            >
                              ⬆
                            </button>
                          )}
                          {isActive && !isMe && m.role !== "owner" && (
                            <button
                              className="btn"
                              title={t("members.remove")}
                              disabled={remove.isPending}
                              onClick={() => openRemove(m)}
                              style={{ padding: "4px 8px", fontSize: 16 }}
                            >
                              ✕
                            </button>
                          )}
                          {isBanned && !isMe && (
                            <button
                              className="btn"
                              title={t("members.unban")}
                              disabled={unban.isPending}
                              onClick={() => {
                                if (window.confirm(t("members.confirmUnban", { name }))) {
                                  unban.mutate(m.user_id);
                                }
                              }}
                              style={{ padding: "4px 8px", fontSize: 16 }}
                            >
                              ↻
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {remove.error && (
          <div className="danger" style={{ marginTop: 8 }}>
            {String(remove.error)}
          </div>
        )}
        {unban.error && (
          <div className="danger" style={{ marginTop: 8 }}>
            {String(unban.error)}
          </div>
        )}
      </div>

      {removeTarget && (
        <Modal open onClose={() => setRemoveTarget(null)} size="sm" top>
          <ModalBody>
            <h3 style={{ marginTop: 0 }}>{t("members.remove")}</h3>
            <p>
              {targetBalance !== 0
                ? t("members.confirmRemoveUnbalanced", {
                    name: removeTarget.name || removeTarget.email || removeTarget.user_id,
                    amount: formatMoney(Math.abs(targetBalance), balances.data?.currency || ""),
                  })
                : t("members.confirmRemove", {
                    name: removeTarget.name || removeTarget.email || removeTarget.user_id,
                  })}
            </p>
            <label className="row" style={{ alignItems: "center", gap: 8, marginTop: 12 }}>
              <input
                type="checkbox"
                checked={banChecked}
                onChange={(e) => setBanChecked(e.target.checked)}
              />
              <span>{t("members.banOption")}</span>
            </label>
            {banChecked && (
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {t("members.banHint")}
              </p>
            )}
          </ModalBody>
          <ModalActions>
            <button
              className="btn"
              onClick={() => setRemoveTarget(null)}
              disabled={remove.isPending}
            >
              {t("app.cancel")}
            </button>
            <button
              className="btn danger"
              onClick={() => remove.mutate({ userId: removeTarget.user_id, ban: banChecked })}
              disabled={remove.isPending}
            >
              {t("members.remove")}
            </button>
          </ModalActions>
        </Modal>
      )}
    </section>
  );
}
