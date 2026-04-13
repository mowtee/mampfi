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
                <th>{t("members.role")}</th>
                <th>{t("members.status")}</th>
                <th>{t("members.joined")}</th>
                {isOwner && <th>{t("app.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {members.data.map((m) => {
                const name = (m.name && m.name.trim()) || m.email || m.user_id;
                const isMe = m.user_id === meId;
                const isActive = !m.left_at;
                return (
                  <tr key={m.user_id} style={{ verticalAlign: "middle" }}>
                    <td>
                      {name}
                      {isMe && <span className="muted"> ({t("app.you")})</span>}
                    </td>
                    <td>
                      {m.role === "owner" ? (
                        <span className="chip" style={{ background: "#e5e7eb", fontWeight: 600 }}>
                          {t("members.owner")}
                        </span>
                      ) : (
                        <span className="muted">{t("members.member")}</span>
                      )}
                    </td>
                    <td>
                      {isActive ? (
                        <span className="chip open">{t("members.active")}</span>
                      ) : (
                        <span className="chip muted">{t("members.left")}</span>
                      )}
                    </td>
                    <td className="muted">
                      {formatYMDToLocale(m.joined_at?.slice(0, 10) || "")}
                    </td>
                    {isOwner && (
                      <td>
                        {isActive && !isMe && m.role !== "owner" && (
                          <button
                            className="btn"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (window.confirm(t("members.confirmRemove", { name }))) {
                                remove.mutate(m.user_id);
                              }
                            }}
                          >
                            {t("members.remove")}
                          </button>
                        )}
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
