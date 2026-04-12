import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export default function ResetPassword() {
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
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div style={{ maxWidth: 400, margin: "40px auto" }}>
        <p className="danger">Missing reset token.</p>
        <Link to="/login">Back to login</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ maxWidth: 400, margin: "40px auto" }}>
        <h2>Password updated</h2>
        <p className="ok">Your password has been reset.</p>
        <Link to="/login" className="btn primary">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "40px auto" }}>
      <h2>Reset password</h2>
      <form onSubmit={handleSubmit}>
        <div className="vstack">
          <div className="field">
            <label className="muted">New password</label>
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
            {loading ? "Saving..." : "Set new password"}
          </button>
        </div>
      </form>
    </div>
  );
}
