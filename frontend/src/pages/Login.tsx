import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";
import LegalFooter from "../components/LegalFooter";

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search] = useSearchParams();
  const next = search.get("next") || localStorage.getItem("authNext") || "/";
  const justDeleted = search.get("deleted") === "1";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.login(email, password);
      localStorage.removeItem("authNext");
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      navigate(next, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 32, marginTop: 16 }}>
        <img src="/logo.png" alt="Mampfi" style={{ height: 180 }} />
      </div>
      {justDeleted && (
        <div className="ok" style={{ marginBottom: 16, textAlign: "center" }}>
          {t("auth.accountDeleted")}
        </div>
      )}
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
            {loading ? t("auth.loggingIn") : t("auth.login")}
          </button>
          <div className="muted" style={{ marginTop: 8 }}>
            <Link to={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>
              {t("auth.noAccount")}
            </Link>
            {" | "}
            <Link to="/forgot-password">{t("auth.forgotPassword")}</Link>
          </div>
        </div>
      </form>
      <LegalFooter />
    </div>
  );
}
