import { useState } from "react";
import { useChangeStatutMutation } from "../hooks.js";
import { STATUT_TRANSITIONS, statutLabel, STATUT_ICONS } from "../constants.js";
import { GlobalFormError } from "../../../components/QueryState.jsx";
import Button from "../../../components/Button.jsx";
import { useTranslation } from "../../../i18n/index.js";

// LIVREE est volontairement EXCLU des transitions génériques proposées ici,
// même si STATUT_TRANSITIONS l'autorise depuis TERMINEE : passer par
// POST /commandes/:id/statut avec statut=LIVREE court-circuiterait la
// création de la Livraison (snapshot montantRestant, paiement final éventuel
// — voir livraisons.routes.js). La seule voie vers LIVREE reste le flux
// dédié (voir LivraisonSection.jsx). Règle métier reflétée ici, pas
// inventée : le backend refuse maintenant explicitement statut=LIVREE sur
// cette route (409, voir commandes.routes.js) — ce filtre frontend évite
// juste à l'utilisateur de se heurter à cette erreur pour rien.
export default function StatutTransitions({ commandeId, statutActuel }) {
  const { t } = useTranslation();
  const [target, setTarget] = useState(null);
  const mutation = useChangeStatutMutation(commandeId);
  const transitions = (STATUT_TRANSITIONS[statutActuel] ?? []).filter((s) => s !== "LIVREE");

  if (transitions.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {transitions.map((statut) => {
          const isTarget = mutation.isPending && target === statut;
          return (
            <Button
              key={statut}
              variant="secondary"
              size="sm"
              icon={STATUT_ICONS[statut]}
              loading={isTarget}
              disabled={mutation.isPending}
              onClick={() => {
                setTarget(statut);
                mutation.mutate(statut);
              }}
            >
              {t("cmd.passerA", { statut: statutLabel(statut) })}
            </Button>
          );
        })}
      </div>
      <GlobalFormError error={mutation.error} />
    </div>
  );
}
