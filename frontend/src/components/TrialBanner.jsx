import { Link } from "react-router-dom";
import { Gift, Hourglass } from "lucide-react";
import { useEtatAbonnementQuery } from "../features/abonnement/hooks.js";
import { formatDateFr } from "../features/abonnement/constants.js";
import Card from "./Card.jsx";
import Button from "./Button.jsx";
import { useTranslation } from "../i18n/index.js";

/**
 * Bannière du Dashboard, pilotée par l'état d'abonnement serveur
 * (GET /api/abonnements/etat — voir features/abonnement) :
 *   ESSAI  -> compte à rebours de l'essai gratuit ;
 *   EXPIRE -> essai terminé / abonnement expiré + lien vers /abonnement ;
 *   ACTIF, EN_ATTENTE, AUCUN, chargement, erreur -> rien.
 * Complète PaywallBanner.jsx (qui bloque TOUTE page une fois l'accès coupé).
 *
 * Composants/tons déjà existants, aucun style inventé : essai actif -> même
 * dégradé doré + texte sombre que le variant "accent" de Button.jsx ; expiré
 * -> même palette rouge que PaywallBanner.jsx.
 */
export default function TrialBanner() {
  const { t } = useTranslation();
  const { data: etat } = useEtatAbonnementQuery();

  if (!etat) return null;

  if (etat.statut === "EXPIRE") {
    return (
      <Card
        variant="outlined"
        className="flex items-center justify-between gap-3 flex-wrap border-red-200 dark:border-red-900"
      >
        <span className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
          <Hourglass className="size-4 shrink-0" aria-hidden="true" />
          {t("trialBanner.expired")}
        </span>
        <Button as={Link} to="/abonnement" variant="secondary" size="sm">
          {t("trialBanner.viewSubscriptions")}
        </Button>
      </Card>
    );
  }

  if (etat.statut !== "ESSAI" || !etat.essai) return null;

  const { joursRestants, trialEndsAt } = etat.essai;
  return (
    <Card
      padded={false}
      // Fond doré plein + texte sombre — mêmes tokens que le variant
      // "accent" de Button.jsx, jamais une couleur inventée pour l'occasion.
      className="flex items-center gap-2 text-sm px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 font-medium"
    >
      <Gift className="size-4 shrink-0" aria-hidden="true" />
      {t("trialBanner.active", {
        jours: joursRestants,
        plural: joursRestants > 1 ? "s" : "",
        date: formatDateFr(trialEndsAt),
      })}
    </Card>
  );
}
