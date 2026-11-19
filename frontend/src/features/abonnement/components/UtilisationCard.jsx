import { Gauge, Info } from "lucide-react";
import { useUtilisationQuery } from "../hooks.js";
import { formaterLimite, pourcentage, teintesJauge } from "../quotas.js";
import { LoadingState, ErrorState } from "../../../components/QueryState.jsx";
import Card from "../../../components/Card.jsx";
import SectionTitle from "../../../components/SectionTitle.jsx";
import { useTranslation } from "../../../i18n/index.js";

function Jauge({ jauge }) {
  const { t } = useTranslation();
  const limite = formaterLimite(jauge.limite);
  const teinte = teintesJauge(jauge.etat);
  return (
    <li className="space-y-1.5" data-testid={`jauge-${jauge.cle}`} data-etat={jauge.etat}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-neutral-800 dark:text-neutral-200">{t(`quotas.ressources.${jauge.cle}`)}</span>
        <span className="tabular-nums text-neutral-700 dark:text-neutral-300" data-testid={`jauge-${jauge.cle}-valeur`}>
          {limite == null
            ? t("quotas.utilisation.usageIllimite", { usage: jauge.usage.toLocaleString() })
            : t("quotas.utilisation.usage", { usage: jauge.usage.toLocaleString(), limite })}
        </span>
      </div>
      {jauge.limite != null && (
        <div
          className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={jauge.limite}
          aria-valuenow={Math.min(jauge.usage, jauge.limite)}
          aria-label={t(`quotas.ressources.${jauge.cle}`)}
        >
          <div className={`h-full rounded-full ${teinte.barre}`} style={{ width: `${pourcentage(jauge.usage, jauge.limite)}%` }} />
        </div>
      )}
      <p className={`text-xs ${teinte.texte}`}>
        {t(`quotas.utilisation.etat.${jauge.etat}`)}
        {jauge.plancherApplique && <span className="text-neutral-500"> · {t("quotas.utilisation.plancher")}</span>}
      </p>
    </li>
  );
}

/** Consommation des quotas de la formule (PDG) : une jauge par ressource, ce qui s'applique et pourquoi. */
export default function UtilisationCard() {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useUtilisationQuery();

  return (
    <div className="space-y-2" data-testid="utilisation-formule">
      <SectionTitle icon={Gauge}>{t("quotas.utilisation.titre")}</SectionTitle>
      {isPending && <LoadingState label={t("common.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && (
        <Card variant="outlined" className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-400" data-testid="utilisation-raison">
            <Info className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
            {t(`quotas.utilisation.raison.${data.raison}`, { formule: data.formule ?? "" })}
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            {data.jauges.map((j) => (
              <Jauge key={j.cle} jauge={j} />
            ))}
          </ul>
          {data.jauges.some((j) => j.etat === "depasse" || j.etat === "atteint") && (
            <p className="text-xs text-neutral-500" data-testid="utilisation-note-limite">
              {t("quotas.utilisation.noteLimite")}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
