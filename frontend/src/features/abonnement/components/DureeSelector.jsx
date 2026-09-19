import { useTranslation } from "../../../i18n/index.js";

// Sélecteur de durée segmenté (même pattern que ThemeSwitcher : radiogroup,
// puce blanche sur la valeur active). Les durées viennent des tarifs des plans
// (GET /api/plans-abonnement) — jamais codées en dur. Le badge n'apparaît que
// si au moins une formule a une remise pour la durée choisie.
export default function DureeSelector({ durees, value, onChange, remiseMax }) {
  const { t } = useTranslation();
  if (durees.length < 2) return null;

  return (
    <div className="flex items-center justify-center gap-3 flex-wrap">
      <div
        role="radiogroup"
        aria-label={t("sub.durationAria")}
        className="inline-flex flex-wrap gap-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-1"
      >
        {durees.map((mois) => {
          const active = value === mois;
          return (
            <button
              key={mois}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(mois)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                active
                  ? "bg-white dark:bg-neutral-700 text-brand-700 dark:text-brand-300 shadow-sm"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {t("sub.months", { mois })}
            </button>
          );
        })}
      </div>
      {remiseMax > 0 && (
        <span className="rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 px-2.5 py-1 text-xs font-medium">
          {t("sub.saveUpTo", { pourcent: remiseMax })}
        </span>
      )}
    </div>
  );
}
