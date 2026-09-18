import { Check } from "lucide-react";
import { formatPrix } from "../constants.js";
import Card from "../../../components/Card.jsx";
import { useTranslation } from "../../../i18n/index.js";

// Une formule : prix mensuel, tarif selon la durée (mensuel × mois, exactement
// le prix figé à l'activation — voir ateliersAbonnement.routes.js) et
// fonctionnalités incluses. `courant`
// met en évidence le plan de l'abonnement en cours (même bordure de sélection
// que les autres cartes cliquables de l'app). Purement informatif.
const DUREES = [1, 3, 6, 12];

export default function PlanCard({ plan, courant }) {
  const { t } = useTranslation();
  return (
    <Card variant="outlined" className={`space-y-3 ${courant ? "border-brand-600 bg-brand-50 dark:bg-brand-950" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{plan.nom}</p>
        {courant && (
          <span className="shrink-0 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 px-2 py-0.5 text-xs font-medium">
            {t("sub.currentPlan")}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100">
          {formatPrix(plan.prixMensuel)}{" "}
          <span className="text-xs font-normal text-neutral-500">FCFA {t("sub.perMonth")}</span>
        </p>
        {plan.description && <p className="text-xs text-neutral-500 mt-1">{plan.description}</p>}
      </div>
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-xs space-y-1">
        <p className="font-medium text-neutral-500">{t("sub.byDuration")}</p>
        {DUREES.map((mois) => (
          <div key={mois} className="flex items-center justify-between gap-2 text-neutral-600 dark:text-neutral-400">
            <span>{t("sub.months", { mois })}</span>
            <span className="tabular-nums font-medium text-neutral-900 dark:text-neutral-100">
              {formatPrix(Number(plan.prixMensuel) * mois)} FCFA
            </span>
          </div>
        ))}
      </div>
      {plan.fonctionnalites.length > 0 && (
        <p className="text-xs font-medium text-neutral-500">{t("sub.included")}</p>
      )}
      {plan.fonctionnalites.length > 0 && (
        <ul className="space-y-1.5 text-sm text-neutral-600 dark:text-neutral-400">
          {plan.fonctionnalites.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="size-4 shrink-0 mt-0.5 text-green-600 dark:text-green-400" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
