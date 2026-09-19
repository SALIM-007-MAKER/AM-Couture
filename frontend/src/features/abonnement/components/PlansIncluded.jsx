import { Check } from "lucide-react";
import Card from "../../../components/Card.jsx";
import { useTranslation } from "../../../i18n/index.js";

// Fonctionnalités communes à TOUTES les formules (intersection calculée à
// partir des données réelles). Rien si moins de 2 formules ou aucune commune.
export default function PlansIncluded({ plans }) {
  const { t } = useTranslation();
  if (plans.length < 2) return null;
  const communes = plans[0].fonctionnalites.filter((f) => plans.every((p) => p.fonctionnalites.includes(f)));
  if (communes.length === 0) return null;

  return (
    <Card className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 sm:max-w-32">
        {t("sub.includedAll")}
      </p>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-700 dark:text-neutral-300">
        {communes.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <Check className="size-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
            {f}
          </li>
        ))}
      </ul>
    </Card>
  );
}
