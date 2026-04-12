import React from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { Modal, ModalBody, ModalActions } from "./components/ui/Modal";

export default function App() {
  const [email, setEmail] = React.useState<string>(() => localStorage.getItem("devEmail") || "");
  const navigate = useNavigate();
  const [devOpen, setDevOpen] = React.useState(false);

  function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem("devEmail", email.trim());
    // force refresh of data by navigating (optional)
    navigate(0);
  }

  return (
    <div className="site">
      <header className="topbar">
        <Link to="/" className="brand">
          Mampfi
        </Link>
        <span className="spacer" />
        {import.meta.env.DEV && (
          <>
            {/* Inline on larger screens */}
            <form onSubmit={saveEmail} className="row sm-hidden" style={{ marginLeft: 8 }}>
              <span className="muted">Dev Email</span>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ width: 240 }}
              />
              <button type="submit" className="btn">
                Save
              </button>
            </form>
            {/* Compact toggle on small screens */}
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              // mimic form submit
              localStorage.setItem("devEmail", email.trim());
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
