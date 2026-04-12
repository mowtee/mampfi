import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export default function Signup() {
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
      await api.signup(email, password, name || undefined);
      setDone(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div style={{ maxWidth: 400, margin: "40px auto" }}>
        <h2>Check your email</h2>
        <p>
          We sent a verification link to <strong>{email}</strong>. Click it to activate your
          account, then{" "}
          <Link to={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>
            log in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "40px auto" }}>
      <h2>Create account</h2>
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
            <label className="muted">Name (optional)</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
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
            {loading ? "Creating..." : "Create account"}
          </button>
          <div className="muted" style={{ marginTop: 8 }}>
            Already have an account?{" "}
            <Link to={`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>
              Log in
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
