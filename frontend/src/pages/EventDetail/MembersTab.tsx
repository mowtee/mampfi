import React from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { EventContextType } from "../../hooks/useEventContext";
import { formatYMDToLocale } from "../../lib/date";

type MembersTabProps = {
  ctx: EventContextType;
  eventId: string;
};

export default function MembersTab({ ctx, eventId }: MembersTabProps) {
  const { t } = useTranslation();
  const { members, meId, isOwner } = ctx;
  const qc = useQueryClient();

  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(eventId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", eventId] });
      qc.invalidateQueries({ queryKey: ["balances", eventId] });
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
                      {isActive ? (
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
                              onClick={() => {
                                if (window.confirm(t("members.confirmRemove", { name }))) {
                                  remove.mutate(m.user_id);
                                }
                              }}
                              style={{ padding: "4px 8px", fontSize: 16 }}
                            >
                              ✕
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
      </div>
    </section>
  );
}
