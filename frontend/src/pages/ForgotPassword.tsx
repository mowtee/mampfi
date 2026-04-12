import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.forgotPassword(email);
    } catch {
      /* always show success to prevent email enumeration */
    }
    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <div style={{ maxWidth: 400, margin: "40px auto", padding: "0 16px" }}>
        <h2>{t("auth.checkEmail")}</h2>
        <p className="muted">{t("auth.checkEmailResetBody")}</p>
        <Link to="/login">{t("auth.backToLogin")}</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "40px auto", padding: "0 16px" }}>
      <h2>{t("auth.forgotPasswordTitle")}</h2>
      <form onSubmit={handleSubmit}>
        <div className="vstack">
          <div className="field">
            <label className="muted">{t("auth.email")}</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? t("auth.sending") : t("auth.sendResetLink")}
          </button>
          <div className="muted" style={{ marginTop: 8 }}>
            <Link to="/login">{t("auth.backToLogin")}</Link>
          </div>
        </div>
      </form>
    </div>
  );
}
