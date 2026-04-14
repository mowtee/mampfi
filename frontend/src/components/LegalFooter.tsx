import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export default function LegalFooter() {
  const { t } = useTranslation();
  const info = useQuery({
    queryKey: ["info"],
    queryFn: () => api.getInfo(),
    staleTime: 5 * 60_000,
  });

  const message = info.data?.footer_message;
  const legal = info.data?.legal_enabled;

  if (!message && !legal) return null;

  const parts: React.ReactNode[] = [];
  if (message) parts.push(<span key="msg">{message}</span>);
  if (legal) {
    parts.push(
      <Link key="legal" to="/legal-notice">
        {t("footer.legalNotice")}
      </Link>,
    );
    parts.push(
      <Link key="privacy" to="/privacy">
        {t("footer.privacy")}
      </Link>,
    );
    parts.push(
      <Link key="terms" to="/terms">
        {t("footer.terms")}
      </Link>,
    );
  }

  return (
    <footer
      className="muted"
      style={{
        textAlign: "center",
        padding: "24px 16px 16px",
        fontSize: 13,
      }}
    >
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {part}
        </span>
      ))}
    </footer>
  );
}
