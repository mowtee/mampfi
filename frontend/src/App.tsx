import React from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal, ModalBody, ModalActions } from "./components/ui/Modal";
import { useAuth } from "./hooks/useAuth";

export default function App() {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  // Dev mode state
  const [devEmail, setDevEmail] = React.useState<string>(
    () => localStorage.getItem("devEmail") || "",
  );
  const [devOpen, setDevOpen] = React.useState(false);

  function saveDevEmail(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem("devEmail", devEmail.trim());
    navigate(0);
  }

  return (
    <div className="site">
      <header className="topbar">
        <Link to="/" className="brand">
          Mampfi
        </Link>
        <span className="spacer" />
        <select
          className="input select"
          value={i18n.language}
          onChange={(e) => {
            i18n.changeLanguage(e.target.value);
            localStorage.setItem("lang", e.target.value);
          }}
          style={{ width: 60 }}
        >
          <option value="de">DE</option>
          <option value="en">EN</option>
        </select>
        {user && (
          <div className="row" style={{ alignItems: "center", gap: 8 }}>
            <span className="muted">{user.name || user.email}</span>
            <button className="btn" onClick={logout}>
              {t("app.logout")}
            </button>
          </div>
        )}
        {import.meta.env.DEV && (
          <>
            <form onSubmit={saveDevEmail} className="row sm-hidden" style={{ marginLeft: 8 }}>
              <span className="muted">Dev</span>
              <input
                className="input"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ width: 200 }}
              />
              <button type="submit" className="btn">
                Set
              </button>
            </form>
            <button
              className="btn sm-only"
              onClick={() => setDevOpen(true)}
              aria-label="Set dev email"
            >
              Dev
            </button>
          </>
        )}
      </header>
      <div className="section">
        <Outlet />
      </div>

      <Modal open={import.meta.env.DEV && devOpen} onClose={() => setDevOpen(false)} size="sm" top>
        <h3>Developer Email</h3>
        <ModalBody>
          <div className="vstack">
            <div className="field">
              <label className="muted">Dev Email</label>
              <input
                className="input"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
          </div>
        </ModalBody>
        <ModalActions>
          <button className="btn" onClick={() => setDevOpen(false)}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              localStorage.setItem("devEmail", devEmail.trim());
              setDevOpen(false);
              navigate(0);
            }}
          >
            Save
          </button>
        </ModalActions>
      </Modal>
    </div>
  );
}
