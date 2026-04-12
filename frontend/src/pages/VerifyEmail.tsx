import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export default function VerifyEmail() {
  const [search] = useSearchParams();
  const token = search.get("token") || "";
  const [status, setStatus] = React.useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Missing verification token.");
      return;
    }
    api
      .verifyEmail(token)
      .then(() => setStatus("ok"))
      .catch((err) => {
        setStatus("error");
        setError(String(err));
      });
  }, [token]);

  return (
    <div style={{ maxWidth: 400, margin: "40px auto" }}>
      <h2>Email Verification</h2>
      {status === "loading" && <p className="muted">Verifying...</p>}
      {status === "ok" && (
        <div>
          <p className="ok">Email verified successfully.</p>
          <Link to="/login" className="btn primary">
            Log in
          </Link>
        </div>
      )}
      {status === "error" && (
        <div>
          <p className="danger">{error || "Verification failed."}</p>
          <Link to="/login">Back to login</Link>
        </div>
      )}
    </div>
  );
}
