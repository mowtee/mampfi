import React from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function ForgotPassword() {
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
      <div style={{ maxWidth: 400, margin: "40px auto" }}>
        <h2>Check your email</h2>
        <p className="muted">
          If an account with that email exists, we sent a password reset link.
        </p>
        <Link to="/login">Back to login</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: "40px auto" }}>
      <h2>Forgot password</h2>
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
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send reset link"}
          </button>
          <div className="muted" style={{ marginTop: 8 }}>
            <Link to="/login">Back to login</Link>
          </div>
        </div>
      </form>
    </div>
  );
}
