import { Link } from "react-router-dom";
import { Gauge } from "lucide-react";
import { useUtilisationQuery } from "../hooks.js";
import { useTranslation } from "../../../i18n/index.js";

/**
 * Avertissement en tête d'un formulaire de CRÉATION quand le quota de la formule est atteint pour cette ressource. Purement
 * informatif : le serveur reste l'autorité (409, details.quota). N'apparaît que pour le PDG (seul à pouvoir lire la
 * consommation) et seulement quand une limite s'applique ; sinon, aucun appel inutile n'affiche quoi que ce soit.
 */
export default function AvertissementQuota({ ressource }) {
  const { t } = useTranslation();
  const { data } = useUtilisationQuery();
  const jauge = data?.jauges?.find((j) => j.cle === ressource);
  if (!jauge || (jauge.etat !== "atteint" && jauge.etat !== "depasse")) return null;
  return (
    <div
      className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-sm px-3 py-2"
      role="status"
      data-testid="avertissement-quota"
    >
      <Gauge className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
      <p>
        {t(`quotas.atteint.${ressource}`, { limite: jauge.limite.toLocaleString(), usage: jauge.usage.toLocaleString() })}{" "}
        <Link to="/abonnement" className="underline">
          {t("quotas.utilisation.voirAbonnement")}
        </Link>
      </p>
    </div>
  );
}
