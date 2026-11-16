import { Gift } from "lucide-react";
import { useEtatAbonnementQuery } from "../features/abonnement/hooks.js";
import { formatDateFr } from "../features/abonnement/constants.js";
import Card from "./Card.jsx";
import { useTranslation } from "../i18n/index.js";

/**
 * Bannière du Dashboard, pilotée par l'état d'abonnement serveur
 * (GET /api/abonnements/etat — voir features/abonnement) :
 *   ESSAI  -> compte à rebours de l'essai gratuit ;
 *   autres états -> rien (l'avertissement de fin d'essai ou d'abonnement est dans AccesBanner, global).
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
