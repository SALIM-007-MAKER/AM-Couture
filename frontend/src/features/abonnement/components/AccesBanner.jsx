import { Link } from "react-router-dom";
import { Hourglass, Lock } from "lucide-react";
import { useEtatAbonnementQuery } from "../hooks.js";
import { bandeauAcces } from "../paiement.js";
import { formatDateFr } from "../constants.js";
import { useMeQuery } from "../../../hooks/useAuth.js";
import Button from "../../../components/Button.jsx";
import { useTranslation } from "../../../i18n/index.js";

/**
 * Bandeau d'accès, visible sur toute page de l'atelier quand l'abonnement ou l'essai est terminé :
 *  - période de grâce : tout fonctionne encore, avertissement ambre avec la date de fin ;
 *  - lecture seule : consultation et exports seulement, avertissement rouge ;
 *  - abonnement suspendu : lecture seule décidée par la plateforme.
 * L'état vient du serveur (GET /api/abonnements/etat). Pendant une impersonation SUPERADMIN, aucune restriction ne
 * s'applique : pas de bandeau.
 */
export default function AccesBanner() {
  const { t } = useTranslation();
  const { data: user } = useMeQuery();
  const { data: etat } = useEtatAbonnementQuery();
  const bandeau = bandeauAcces(etat);
  if (!bandeau || user?.impersonation) return null;

  const grace = bandeau.type === "GRACE";
  const Icone = grace ? Hourglass : Lock;
  const message =
    bandeau.type === "GRACE"
      ? bandeau.date
        ? t("accesBanner.grace", { date: formatDateFr(bandeau.date), jours: bandeau.jours ?? 0 })
        : t("accesBanner.graceNoDate")
      : bandeau.type === "SUSPENDU"
        ? t("accesBanner.suspended")
        : t("accesBanner.readOnly");

  return (
    <div
      role="status"
      data-testid="acces-banner"
      data-mode={bandeau.type}
      className={`flex items-center justify-center gap-3 text-sm px-4 py-2 flex-wrap ${
        grace ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-red-600 text-white"
      }`}
    >
      <span className="flex items-center gap-1.5 font-medium">
        <Icone className="size-4 shrink-0" aria-hidden="true" />
        {message}
      </span>
      <Button as={Link} to="/abonnement" variant="secondary" size="sm">
        {t("accesBanner.action")}
      </Button>
    </div>
  );
}
