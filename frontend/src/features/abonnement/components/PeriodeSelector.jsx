import { useTranslation } from "../../../i18n/index.js";

// Sélecteur de période segmenté (même pattern que ThemeSwitcher : radiogroup, puce blanche sur la valeur active) : Mensuel /
// Annuel. Les périodes proposées viennent des offres du catalogue (GET /api/plans-abonnement) — jamais codées en dur : une
// période n'apparaît que si au moins une formule a un prix pour elle. Le badge « mois offerts » est INFORMATIF (économie annuelle
// calculée par le serveur), il n'apparaît que si au moins une formule en offre.
export default function PeriodeSelector({ periodes, value, onChange, moisOffertsMax }) {
  const { t } = useTranslation();
  if (periodes.length < 2) return null;

  return (
    <div className="flex items-center justify-center gap-3 flex-wrap">
      <div
        role="radiogroup"
        aria-label={t("sub.periodAria")}
        className="inline-flex flex-wrap gap-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-1"
      >
        {periodes.map((periode) => {
          const active = value === periode;
          return (
            <button
              key={periode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(periode)}
              data-testid={`periode-${periode}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                active
                  ? "bg-white dark:bg-neutral-700 text-brand-700 dark:text-brand-300 shadow-sm"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              {t(periode === "ANNUEL" ? "sub.periodYearly" : "sub.periodMonthly")}
            </button>
          );
        })}
      </div>
      {moisOffertsMax > 0 && (
        <span className="rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 px-2.5 py-1 text-xs font-medium" data-testid="badge-mois-offerts">
          {t("sub.monthsFree", { mois: moisOffertsMax })}
        </span>
      )}
    </div>
  );
}
