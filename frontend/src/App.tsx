import React from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal, ModalBody, ModalActions } from "./components/ui/Modal";
import { useAuth } from "./hooks/useAuth";

export default function App() {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [helpOpen, setHelpOpen] = React.useState(false);

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
        <Link to="/" className="brand" style={{ display: "flex", alignItems: "center" }}>
          <img src="/logo.png" alt="Mampfi" style={{ height: 72 }} />
        </Link>
        <span className="spacer" />
        {user && <span className="muted">{user.name || user.email}</span>}
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
        <button
          className="btn"
          onClick={() => setHelpOpen(true)}
          aria-label="Help"
          style={{
            fontSize: 16,
            fontWeight: 700,
            width: 32,
            height: 32,
            borderRadius: "50%",
            padding: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ?
        </button>
        {user && (
          <button className="btn" onClick={logout}>
            {t("app.logout")}
          </button>
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

      {/* Help modal */}
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} size="lg" top>
        <ModalBody>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <img src="/logo.png" alt="Mampfi" style={{ height: 48, width: 48 }} />
            <h2 style={{ margin: 0 }}>{t("help.title")}</h2>
          </div>
          <p style={{ marginBottom: 20 }}>{t("help.intro")}</p>
          <div className="vstack" style={{ gap: 16 }}>
            <div>
              <h4 style={{ margin: "0 0 4px" }}>1. {t("help.createEvent")}</h4>
              <p className="muted" style={{ margin: 0 }}>
                {t("help.createEventText")}
              </p>
            </div>
            <div>
              <h4 style={{ margin: "0 0 4px" }}>2. {t("help.placeOrders")}</h4>
              <p className="muted" style={{ margin: 0 }}>
                {t("help.placeOrdersText")}
              </p>
            </div>
            <div>
              <h4 style={{ margin: "0 0 4px" }}>3. {t("help.finalize")}</h4>
              <p className="muted" style={{ margin: 0 }}>
                {t("help.finalizeText")}
              </p>
            </div>
            <div>
              <h4 style={{ margin: "0 0 4px" }}>4. {t("help.payments")}</h4>
              <p className="muted" style={{ margin: 0 }}>
                {t("help.paymentsText")}
              </p>
            </div>
            <div>
              <h4 style={{ margin: "0 0 4px" }}>{t("help.language")}</h4>
              <p className="muted" style={{ margin: 0 }}>
                {t("help.languageText")}
              </p>
            </div>
          </div>
          <h4 style={{ marginTop: 24, marginBottom: 8 }}>{t("help.glossary")}</h4>
          <ul
            className="muted"
            style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}
          >
            <li>{t("help.glossaryCutoff")}</li>
            <li>{t("help.glossaryRollover")}</li>
            <li>{t("help.glossaryFinalize")}</li>
            <li>{t("help.glossaryBalance")}</li>
          </ul>
        </ModalBody>
        <ModalActions>
          <button className="btn primary" onClick={() => setHelpOpen(false)}>
            {t("help.close")}
          </button>
        </ModalActions>
      </Modal>

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
