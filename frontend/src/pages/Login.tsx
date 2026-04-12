import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function Login() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search] = useSearchParams();
  const next = search.get("next") || "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.login(email, password);
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
      navigate(next, { replace: true });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "40px auto" }}>
      <h2>Log in</h2>
      <form onSubmit={handleSubmit}>
        <div className="vstack">
          <div className="field">
            <label className="muted">Email</label>
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
            <label className="muted">Password</label>
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
            {loading ? "Logging in..." : "Log in"}
          </button>
          <div className="muted" style={{ marginTop: 8 }}>
            <Link to={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>
              Create an account
            </Link>
            {" | "}
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        </div>
      </form>
    </div>
  );
}
