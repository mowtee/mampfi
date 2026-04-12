import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "./de.json";
import en from "./en.json";

function detectLanguage(): string {
  // 1. User override (from language switcher)
  const saved = localStorage.getItem("lang");
  if (saved && (saved === "de" || saved === "en")) return saved;

  // 2. Browser locale — German-speaking locales get "de", rest gets "en"
  const browserLang = navigator.language?.toLowerCase() || "";
  if (browserLang.startsWith("de")) return "de";

  return "en";
}

i18n.use(initReactI18next).init({
  resources: { de: { translation: de }, en: { translation: en } },
  lng: detectLanguage(),
  fallbackLng: "de",
  interpolation: { escapeValue: false },
});

export default i18n;
