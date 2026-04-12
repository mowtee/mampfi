import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";

export default function ResetPassword() {
  const { t } = useTranslation();
  const [search] = useSearchParams();
  const token = search.get("token") || "";
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div style={{ maxWidth: 400, margin: "40px auto", padding: "0 16px" }}>
        <p className="danger">{t("auth.missingToken")}</p>
        <Link to="/login">{t("auth.backToLogin")}</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ maxWidth: 400, margin: "40px auto", padding: "0 16px" }}>
        <h2>{t("auth.passwordUpdated")}</h2>
        <p className="ok">{t("auth.passwordUpdatedBody")}</p>
        <Link to="/login" className="btn primary">
          {t("auth.login")}
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "40px auto", padding: "0 16px" }}>
      <h2>{t("auth.resetPassword")}</h2>
      <form onSubmit={handleSubmit}>
        <div className="vstack">
          <div className="field">
            <label className="muted">{t("auth.newPassword")}</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoFocus
            />
          </div>
          {error && <div className="danger">{error}</div>}
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? t("auth.saving") : t("auth.setNewPassword")}
          </button>
        </div>
      </form>
    </div>
  );
}
