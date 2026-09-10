import { CalendarDays, ChevronDown } from "lucide-react";

// Reflète exactement PERIODES du backend (lib/period.js) — la résolution
// réelle des bornes reste 100% côté serveur, ceci ne fait que construire les
// paramètres `?period=` ou `?from=&to=` envoyés à l'API.
const PERIODES = [
  { value: "today", label: "Aujourd'hui" },
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
  { value: "quarter", label: "Ce trimestre" },
  { value: "year", label: "Cette année" },
];

/**
 * `value` : { period?: string, from?: string, to?: string } — `from`/`to`
 * (période personnalisée) sont prioritaires sur `period` si présents, comme
 * côté backend (voir resolvePeriod, lib/period.js).
 *
 * Remplace l'ancienne rangée de 5 boutons + 2 champs date toujours visibles
 * par un menu déroulant compact ("Période : [Ce mois ▾]") — les deux champs
 * date n'apparaissent que si "Personnalisée" est sélectionnée. Même contrat
 * value/onChange qu'avant : aucune page consommatrice à modifier.
 */
export default function PeriodSelector({ value, onChange }) {
  const isCustom = Boolean(value.from || value.to);
  const selectValue = isCustom ? "custom" : (value.period ?? "month");

  function handleSelectChange(next) {
    if (next === "custom") {
      onChange({ period: undefined, from: value.from, to: value.to });
    } else {
      onChange({ period: next, from: undefined, to: undefined });
    }
  }

  function setCustom(patch) {
    onChange({ period: undefined, from: value.from, to: value.to, ...patch });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-neutral-500 hidden sm:inline">Période</span>
      <div className="relative">
        <CalendarDays
          className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400 pointer-events-none"
          aria-hidden="true"
        />
        <select
          value={selectValue}
          onChange={(e) => handleSelectChange(e.target.value)}
          className="appearance-none rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 pl-8 pr-7 py-1.5 text-sm font-medium text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
        >
          {PERIODES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value="custom">Personnalisée</option>
        </select>
        <ChevronDown
          className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-neutral-400 pointer-events-none"
          aria-hidden="true"
        />
      </div>

      {isCustom && (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={value.from ?? ""}
            onChange={(e) => setCustom({ from: e.target.value || undefined })}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
          <span className="text-neutral-500">au</span>
          <input
            type="date"
            value={value.to ?? ""}
            onChange={(e) => setCustom({ to: e.target.value || undefined })}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
        </div>
      )}
    </div>
  );
}
