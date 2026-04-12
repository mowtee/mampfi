import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";

export default function VerifyEmail() {
  const { t } = useTranslation();
  const [search] = useSearchParams();
  const token = search.get("token") || "";
  const [status, setStatus] = React.useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) {
      setStatus("error");
      setError(t("auth.missingToken"));
      return;
    }
    api
      .verifyEmail(token)
      .then(() => setStatus("ok"))
      .catch((err) => {
        setStatus("error");
        setError(errorMessage(err));
      });
  }, [token, t]);

  return (
    <div style={{ maxWidth: 400, margin: "40px auto" }}>
      <h2>{t("auth.verifyEmail")}</h2>
      {status === "loading" && <p className="muted">{t("auth.verifying")}</p>}
      {status === "ok" && (
        <div>
          <p className="ok">{t("auth.verified")}</p>
          <Link to="/login" className="btn primary">
            {t("auth.login")}
          </Link>
        </div>
      )}
      {status === "error" && (
        <div>
          <p className="danger">{error || t("auth.verifyFailed")}</p>
          <Link to="/login">{t("auth.backToLogin")}</Link>
        </div>
      )}
    </div>
  );
}
