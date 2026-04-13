import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { errorMessage } from "../lib/errors";
import { useAuth } from "../hooks/useAuth";

export default function Join() {
  const { t } = useTranslation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = React.useState<string>(() => params.get("token") || "");
  React.useEffect(() => {
    setToken(params.get("token") || "");
  }, [params]);

  const preview = useQuery({
    queryKey: ["invitePreview", token],
    queryFn: () => api.previewInvite(token),
    enabled: !!token,
    retry: false,
  });

  const redeem = useMutation({
    mutationFn: () => api.redeemInvite(token.trim()),
    onSuccess: () => {
      navigate("/");
    },
  });

  const hasToken = !!token;
  const ok = preview.data && !preview.error;
  const eventName = preview.data?.event?.name;
  const joinUrl = `/join?token=${encodeURIComponent(token)}`;

  return (
    <div style={{ maxWidth: 500, margin: "40px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
        <img src="/logo.png" alt="Mampfi" style={{ height: 100 }} />
      </div>
      <div className="card">
        <h2>
          <strong>{t("join.title")}</strong>
        </h2>
        {!hasToken && (
          <>
            <p className="muted">{t("join.pasteToken")}</p>
            <div className="row">
              <input
                className="input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t("join.inviteToken")}
              />
              <button
                onClick={() => redeem.mutate()}
                disabled={!token || redeem.isPending || !isAuthenticated}
                className="btn primary"
              >
                {t("join.redeem")}
              </button>
            </div>
          </>
        )}
        {hasToken && (
          <>
            {preview.isLoading && <p className="muted">{t("app.loading")}</p>}
            {preview.error && <p className="danger">{errorMessage(preview.error)}</p>}
            {ok && (
              <div className="vstack">
                <p dangerouslySetInnerHTML={{ __html: t("join.inviteTo", { name: eventName }) }} />

                {authLoading && <p className="muted">{t("app.loading")}</p>}

                {isAuthenticated && (
                  <div className="row">
                    <button
                      onClick={() => redeem.mutate()}
                      disabled={redeem.isPending}
                      className="btn primary"
                    >
                      {redeem.isPending
                        ? t("app.loading")
                        : t("join.joinEvent", { name: eventName })}
                    </button>
                  </div>
                )}

                {!authLoading && !isAuthenticated && (
                  <div className="vstack" style={{ marginTop: 8 }}>
                    <p className="muted">{t("join.loginRequired")}</p>
                    <div className="row" style={{ gap: 8 }}>
                      <Link
                        to={`/login?next=${encodeURIComponent(joinUrl)}`}
                        className="btn primary"
                      >
                        {t("auth.login")}
                      </Link>
                      <Link to={`/signup?next=${encodeURIComponent(joinUrl)}`} className="btn">
                        {t("auth.createAccount")}
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {redeem.error && (
          <div className="danger" style={{ marginTop: 8 }}>
            {errorMessage(redeem.error)}
          </div>
        )}
      </div>
    </div>
  );
}
