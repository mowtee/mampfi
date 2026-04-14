import React from "react";
import { useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import LegalFooter from "../components/LegalFooter";

const API_URL = import.meta.env.VITE_API_URL || "";

export default function LegalPage() {
  const location = useLocation();
  const slug = location.pathname.replace(/^\//, "");
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith("de") ? "de" : "en";

  const { data, isLoading, error } = useQuery({
    queryKey: ["legal", slug],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/v1/legal/${slug}`);
      if (!res.ok) return null;
      return res.text();
    },
    enabled: !!slug,
    staleTime: 60_000,
  });

  return (
    <div className="site">
      <header className="topbar">
        <Link to="/" className="brand" style={{ display: "flex", alignItems: "center" }}>
          <img src="/logo.png" alt="Mampfi" style={{ height: 72 }} />
        </Link>
      </header>
      <div className="section" style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px" }}>
        <p>
          <Link to="/" className="btn ghost">
            ← {lang === "de" ? "Zurück" : "Back"}
          </Link>
        </p>
        {isLoading && <p className="muted">Loading...</p>}
        {error && <p className="danger">Error loading content.</p>}
        {data === null && !isLoading && (
          <p className="muted">
            {lang === "de"
              ? "Dieser Inhalt ist nicht verfügbar."
              : "This content is not available."}
          </p>
        )}
        {data && (
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: 15 }}>{data}</div>
        )}
      </div>
      <LegalFooter />
    </div>
  );
}
