import i18n from "../i18n";

export function formatYMDToLocale(dateStr: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return dateStr;
    const dt = new Date(Date.UTC(y, m - 1, d));
    const locale = i18n.language === "de" ? "de-DE" : "en-US";
    const fmt = new Intl.DateTimeFormat(locale, opts || { dateStyle: "medium" });
    return fmt.format(dt);
  } catch {
    return dateStr;
  }
}
