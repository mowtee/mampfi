import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";

export default function Signup() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [search] = useSearchParams();
  const next = search.get("next") || "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.signup(email, password, name || undefined, i18n.language);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 400, margin: "40px auto", padding: "0 16px" }}>
        <h2>{t("auth.checkEmail")}</h2>
        <p
          dangerouslySetInnerHTML={{
            __html:
              t("auth.checkEmailBody", { email }) +
              ` <a href="/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}">${t("auth.login")}</a>.`,
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ textAlign: "center", marginBottom: 32, marginTop: 16 }}>
        <img src="/logo.png" alt="Mampfi" style={{ height: 120 }} />
      </div>
      <h2 style={{ marginBottom: 20 }}>{t("auth.createAccount")}</h2>
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
          <div className="field">
            <label className="muted">{t("auth.name")}</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="muted">{t("auth.password")}</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {error && <div className="danger">{error}</div>}
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? t("auth.creating") : t("auth.createAccount")}
          </button>
          <div className="muted" style={{ marginTop: 8 }}>
            {t("auth.alreadyHaveAccount")}{" "}
            <Link to={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>
              {t("auth.login")}
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
