import { Check } from "lucide-react";
import { statutLabel } from "../commandes/constants.js";
import { etatsEtapes } from "./etapes.js";
import { useTranslation } from "../../i18n/index.js";

/**
 * Suivi visuel d'une commande pour la cliente : ne montre que le statut (déjà visible sur la fiche), jamais d'information
 * interne (employé, coûts, notes). Les étapes passées sont cochées, l'étape en cours est marquée pour les lecteurs d'écran.
 */
export default function EtapesCommande({ statut }) {
  const { t } = useTranslation();
  const etapes = etatsEtapes(statut);

  if (etapes.length === 0) {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-400" data-testid="etapes-annulee">
        {t("etapes.annulee")}
      </p>
    );
  }

  return (
    <ol aria-label={t("etapes.titre")} data-testid="etapes-commande">
      {etapes.map(({ etape, etat }, i) => {
        const fait = etat === "fait";
        const enCours = etat === "en-cours";
        return (
          <li key={etape} className="flex items-stretch gap-3" aria-current={enCours ? "step" : undefined} data-etat={etat}>
            <div className="flex flex-col items-center">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs ${
                  fait
                    ? "border-green-600 bg-green-600 text-white"
                    : "border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900" + (enCours ? " !border-neutral-900 dark:!border-neutral-100" : "")
                }`}
                aria-hidden="true"
              >
                {fait ? <Check className="size-3.5" /> : enCours ? <span className="size-2 rounded-full bg-neutral-900 dark:bg-neutral-100" /> : null}
              </span>
              {i < etapes.length - 1 && <span className={`w-0.5 flex-1 min-h-4 ${fait ? "bg-green-600" : "bg-neutral-300 dark:bg-neutral-700"}`} aria-hidden="true" />}
            </div>
            <div className="pb-3 text-sm">
              <p className={enCours ? "font-semibold text-neutral-900 dark:text-neutral-100" : fait ? "text-neutral-700 dark:text-neutral-300" : "text-neutral-500"}>{statutLabel(etape)}</p>
              {enCours && <p className="text-xs text-neutral-500">{t(`etapes.aide.${etape}`)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
