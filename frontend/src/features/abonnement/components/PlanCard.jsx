import { Check } from "lucide-react";
import { formatPrix } from "../constants.js";
import Card from "../../../components/Card.jsx";
import { useTranslation } from "../../../i18n/index.js";

// Un plan d'abonnement : prix mensuel + fonctionnalités incluses. `courant`
// met en évidence le plan de l'abonnement en cours (même bordure de sélection
// que les autres cartes cliquables de l'app). Purement informatif.
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
