import { WifiOff } from "lucide-react";
import { useConnexionStore } from "../lib/connexion.js";
import { useMeQuery } from "../hooks/useAuth.js";
import { useTranslation } from "../i18n/index.js";
import { useLocaleStore } from "../stores/localeStore.js";

/**
 * Bandeau affiché tant que le serveur est injoignable (7.5) : l'utilisateur consulte les données enregistrées sur son
 * appareil, et sait jusqu'à quand elles datent. Les modifications échouent explicitement (rien n'est mis en attente).
 */
export default function HorsLigneBanner() {
  const { t } = useTranslation();
  const horsLigne = useConnexionStore((s) => s.horsLigne);
  const { dataUpdatedAt } = useMeQuery();
  const locale = useLocaleStore((s) => s.locale);
  if (!horsLigne) return null;
  const date = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "medium", timeStyle: "short" })
    : null;
  return (
    <div role="status" data-testid="hors-ligne" className="flex items-start gap-2 bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 text-sm px-4 py-2">
      <WifiOff className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        {t("horsLigne.banniere")}
        {date && <> {t("horsLigne.verifie", { date })}</>} {t("horsLigne.ecritures")}
      </span>
    </div>
  );
}
