import { Link } from "react-router-dom";
import { Gift, Hourglass } from "lucide-react";
import { useParametresQuery } from "../features/parametres/hooks.js";
import { useAbonnementActuelQuery, isNotFound } from "../features/abonnement/hooks.js";
import { formatDateFr } from "../features/abonnement/constants.js";
import Card from "./Card.jsx";
import Button from "./Button.jsx";
import { useTranslation } from "../i18n/index.js";

/**
 * Bannière d'essai gratuit du Dashboard (§ plan trial) — complète
 * PaywallBanner.jsx (qui, lui, bloque TOUTE page une fois l'essai expiré ET
 * redirige vers /abonnement) : ici, on donne de la visibilité au COMPTE À
 * REBOURS pendant que l'essai est encore actif, ce qu'aucune autre page
 * n'affichait avant que l'atelier n'atteigne /abonnement lui-même.
 *
 * Composants/tons déjà existants dans l'app, aucun style inventé : essai
 * actif -> même dégradé doré + texte sombre que le variant "accent" de
 * Button.jsx (réservé aux moments particuliers) ; essai expiré -> même
 * palette rouge que PaywallBanner.jsx. Calcul des jours restants identique
 * à EssaiSection (AbonnementPage.jsx).
 *
 * Disparaît automatiquement si un abonnement est ACTIF, quelle que soit
 * l'échéance de l'essai — un atelier qui a payé n'a plus besoin de voir un
 * compte à rebours d'essai gratuit.
 */
export default function TrialBanner() {
  const { t } = useTranslation();
  const { data: atelier } = useParametresQuery();
  const abonnementQuery = useAbonnementActuelQuery();

  if (!atelier?.trialEndsAt) return null;
  if (abonnementQuery.data?.statutEffectif === "ACTIF") return null;
  // Abonnement pas encore chargé (isPending) ou 404 (jamais souscrit, voir
  // isNotFound) : dans les deux cas, rien ne prouve un abonnement actif —
  // on affiche l'état de l'essai plutôt que d'attendre indéfiniment.
  if (abonnementQuery.isError && !isNotFound(abonnementQuery.error)) return null;

  const finEssai = new Date(atelier.trialEndsAt);
  const joursRestants = Math.ceil((finEssai.getTime() - new Date().getTime()) / 86_400_000);

  if (atelier.essaiExpire) {
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

  return (
    <Card
      padded={false}
      // Fond doré plein + texte sombre — mêmes tokens que le variant
      // "accent" de Button.jsx (réservé aux moments particuliers, voir son
      // commentaire), jamais une couleur inventée pour l'occasion.
      className="flex items-center gap-2 text-sm px-5 py-3 bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 font-medium"
    >
      <Gift className="size-4 shrink-0" aria-hidden="true" />
      {t("trialBanner.active", {
        jours: joursRestants,
        plural: joursRestants > 1 ? "s" : "",
        date: formatDateFr(atelier.trialEndsAt),
      })}
    </Card>
  );
}
