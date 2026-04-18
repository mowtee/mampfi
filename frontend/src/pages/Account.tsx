import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { formatMoney } from "../lib/money";
import { useAuth } from "../hooks/useAuth";
import { Modal, ModalActions, ModalBody } from "../components/ui/Modal";
import { errorMessage } from "../lib/errors";

export default function Account() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [nameDraft, setNameDraft] = React.useState(user?.name || "");
  const [nameSaved, setNameSaved] = React.useState(false);

  React.useEffect(() => {
    setNameDraft(user?.name || "");
  }, [user?.name]);

  const updateName = useMutation({
    mutationFn: (name: string) => api.updateMe(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    },
  });

  const nameChanged = nameDraft.trim() !== (user?.name || "") && nameDraft.trim().length > 0;

  const [modalOpen, setModalOpen] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const preview = useQuery({
    queryKey: ["delete-account-preview"],
    queryFn: () => api.previewDeleteAccount(),
    enabled: modalOpen,
    staleTime: 0,
  });

  const deleteMut = useMutation({
    mutationFn: (email: string) => api.deleteAccount(email),
    onSuccess: () => {
      navigate("/login?deleted=1", { replace: true });
    },
    onError: (err) => {
      setError(errorMessage(err));
    },
  });

  const hasBlockers =
    !!preview.data &&
    (preview.data.sole_owner_events.length > 0 ||
      preview.data.balance_events.length > 0 ||
      preview.data.pending_payments.length > 0);

  const canSubmit = !!user && confirmation.trim().toLowerCase() === user.email.trim().toLowerCase();

  return (
    <>
      <p>
        <Link to="/" className="btn ghost">
          ← {t("app.back")}
        </Link>
      </p>
      <h2>
        <strong>{t("account.title")}</strong>
      </h2>

      <section className="section">
        <div className="card">
          <h3>{t("account.info")}</h3>
          <div className="muted" style={{ marginBottom: 4 }}>
            {t("auth.email")}
          </div>
          <div style={{ marginBottom: 16 }}>{user?.email}</div>
          <div className="muted" style={{ marginBottom: 4 }}>
            {t("auth.name")}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input
              className="input"
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setNameSaved(false);
              }}
              minLength={1}
              maxLength={200}
              style={{ maxWidth: 320 }}
            />
            <button
              className="btn primary"
              onClick={() => updateName.mutate(nameDraft.trim())}
              disabled={!nameChanged || updateName.isPending}
            >
              {updateName.isPending ? t("app.loading") : t("app.save")}
            </button>
            {nameSaved && <span className="ok">{t("account.nameSaved")}</span>}
            {updateName.error && <span className="danger">{String(updateName.error)}</span>}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="card" style={{ borderColor: "#e76f51" }}>
          <h3 style={{ color: "#e76f51" }}>{t("account.dangerZone")}</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {t("account.deleteHint")}
          </p>
          <button
            className="btn danger"
            onClick={() => {
              setConfirmation("");
              setError(null);
              setModalOpen(true);
            }}
          >
            {t("account.deleteButton")}
          </button>
        </div>
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md" top>
        <ModalBody>
          <h3 style={{ marginTop: 0 }}>{t("account.deleteTitle")}</h3>
          {preview.isLoading && <p className="muted">{t("app.loading")}</p>}
          {preview.error && <p className="danger">{String(preview.error)}</p>}
          {preview.data && hasBlockers && (
            <>
              <p>{t("account.blockersIntro")}</p>
              {preview.data.sole_owner_events.length > 0 && (
                <>
                  <h4 style={{ marginBottom: 4 }}>{t("account.soleOwnerTitle")}</h4>
                  <ul className="muted" style={{ marginTop: 0 }}>
                    {preview.data.sole_owner_events.map((e) => (
                      <li key={e.id}>
                        <Link to={`/events/${e.id}?tab=members`}>{e.name}</Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {preview.data.balance_events.length > 0 && (
                <>
                  <h4 style={{ marginBottom: 4 }}>{t("account.balanceTitle")}</h4>
                  <ul className="muted" style={{ marginTop: 0 }}>
                    {preview.data.balance_events.map((e) => (
                      <li key={e.id}>
                        <Link to={`/events/${e.id}?tab=payments`}>
                          {e.name} — {formatMoney(e.balance_minor, e.currency)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {preview.data.pending_payments.length > 0 && (
                <>
                  <h4 style={{ marginBottom: 4 }}>{t("account.pendingTitle")}</h4>
                  <ul className="muted" style={{ marginTop: 0 }}>
                    {preview.data.pending_payments.map((p) => (
                      <li key={p.id}>
                        <Link to={`/events/${p.event_id}?tab=payments`}>
                          {formatMoney(p.amount_minor, p.currency)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          {preview.data && !hasBlockers && (
            <>
              <p>{t("account.readyToDelete")}</p>
              <div className="field" style={{ marginTop: 12 }}>
                <label className="muted" style={{ fontSize: 13 }}>
                  {t("account.confirmLabel", { email: user?.email })}
                </label>
                <input
                  className="input"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder={user?.email}
                  autoComplete="off"
                />
              </div>
              {error && (
                <div className="danger" style={{ marginTop: 8 }}>
                  {error}
                </div>
              )}
            </>
          )}
        </ModalBody>
        <ModalActions>
          <button
            className="btn"
            onClick={() => setModalOpen(false)}
            disabled={deleteMut.isPending}
          >
            {t("app.cancel")}
          </button>
          {preview.data && !hasBlockers && (
            <button
              className="btn danger"
              disabled={!canSubmit || deleteMut.isPending}
              onClick={() => {
                setError(null);
                deleteMut.mutate(confirmation.trim());
              }}
            >
              {deleteMut.isPending ? t("account.deleting") : t("account.deleteFinal")}
            </button>
          )}
        </ModalActions>
      </Modal>
    </>
  );
}
