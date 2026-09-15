import { useTranslation } from "../i18n/index.js";

const LANGUES = [
  { code: "fr", label: "FR" },
  { code: "en", label: "EN" },
];

/**
 * Bascule FR/EN — utilisable aussi bien avant connexion (LoginPage, où
 * User.langue n'existe pas encore) qu'après (header de AppLayout, où
 * LocaleSync.jsx prend le relais dès que la préférence du compte est
 * connue). Couleurs en paire clair/sombre standard : LoginPage force
 * `.dark` sur sa racine (voir son commentaire), donc la variante ambrée
 * s'y applique automatiquement sans code séparé.
 */
export default function LanguageSwitcher({ className = "" }) {
  const { locale, setLocale } = useTranslation();
  return (
    <div className={`inline-flex rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 p-0.5 text-xs ${className}`}>
      {LANGUES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLocale(l.code)}
          className={`px-2.5 py-1 rounded-md transition-colors ${
            locale === l.code
              ? "bg-brand-600 text-white dark:bg-amber-500 dark:text-neutral-950 font-medium"
              : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
          }`}
          aria-pressed={locale === l.code}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
