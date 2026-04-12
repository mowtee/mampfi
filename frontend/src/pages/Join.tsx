import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function Join() {
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
      // go to events list after joining
      navigate("/");
    },
  });

  const hasToken = !!token;
  const ok = preview.data && !preview.error;
  const eventName = preview.data?.event?.name;

  return (
    <div>
      <div className="card" style={{ maxWidth: 700 }}>
        <h2>Join Event</h2>
        {!hasToken && (
          <>
            <p className="muted">Paste your invite token below to join the event.</p>
            <div className="row">
              <input
                className="input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Invite token"
                style={{ width: 400 }}
              />
              <button
                onClick={() => redeem.mutate()}
                disabled={!token || redeem.isPending}
                className="btn primary"
              >
                Redeem
              </button>
            </div>
          </>
        )}
        {hasToken && (
          <>
            {preview.isLoading && <p className="muted">Checking invite…</p>}
            {preview.error && <p className="danger">{String(preview.error)}</p>}
            {ok && (
              <div className="vstack">
                <p>
                  Invite to: <strong>{eventName}</strong>
                </p>
                <div className="row">
                  <button
                    onClick={() => redeem.mutate()}
                    disabled={redeem.isPending}
                    className="btn primary"
                  >
                    Join {eventName}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {redeem.error && (
          <div className="danger" style={{ marginTop: 8 }}>
            {String(redeem.error)}
          </div>
        )}
      </div>
    </div>
  );
}
