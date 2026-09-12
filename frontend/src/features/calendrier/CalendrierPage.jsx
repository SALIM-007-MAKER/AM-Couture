import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, ChevronLeft, ChevronRight, Plus, ClipboardList } from "lucide-react";
import { useCommandesQuery } from "../commandes/hooks.js";
import CommandeStatutBadge from "../commandes/components/CommandeStatutBadge.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";

// Toute la logique de dates ci-dessous travaille en UTC, comme le fait déjà
// le backend pour dateLivraisonPrevue (voir dateField.js — une date "sans
// heure" est toujours interprétée comme minuit UTC) : évite un décalage de
// civil-day entre le calendrier affiché et les commandes qu'on y range.
function startOfMonthUTC(year, month) {
  return new Date(Date.UTC(year, month, 1));
}
function daysInMonthUTC(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}
function toISODate(date) {
  return date.toISOString().slice(0, 10);
}
function todayUTC() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
function isSameDayUTC(a, b) {
  return a && b && toISODate(a) === toISODate(b);
}

const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MOIS_LABEL = (date) => date.toLocaleDateString("fr-FR", { year: "numeric", month: "long", timeZone: "UTC" });
const JOUR_LABEL = (date) =>
  date.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export default function CalendrierPage() {
  const [cursor, setCursor] = useState(() => {
    const t = todayUTC();
    return startOfMonthUTC(t.getUTCFullYear(), t.getUTCMonth());
  });
  const [selected, setSelected] = useState(() => todayUTC());

  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const numDays = daysInMonthUTC(year, month);
  const first = startOfMonthUTC(year, month);
  const last = new Date(Date.UTC(year, month, numDays));

  // Livraison prévue dans le mois affiché — voir listCommandesQuerySchema
  // (livraisonDu/livraisonAu déjà pris en charge côté backend, rien à ajouter).
  const query = useCommandesQuery({ livraisonDu: toISODate(first), livraisonAu: toISODate(last), pageSize: 100 });
  const commandes = query.data?.data ?? [];

  const parJour = {};
  for (const c of commandes) {
    const d = new Date(c.dateLivraisonPrevue);
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
      const jour = d.getUTCDate();
      (parJour[jour] ??= []).push(c);
    }
  }

  // Lundi = premier jour de semaine (convention FR) : getUTCDay() donne
  // 0=dimanche..6=samedi, on décale pour que lundi vaille 0.
  const decalage = (first.getUTCDay() + 6) % 7;
  const cellules = [
    ...Array(decalage).fill(null),
    ...Array.from({ length: numDays }, (_, i) => i + 1),
  ];

  function moisPrecedent() {
    setCursor(startOfMonthUTC(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1));
  }
  function moisSuivant() {
    setCursor(startOfMonthUTC(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1));
  }
  function allerAujourdhui() {
    const t = todayUTC();
    setCursor(startOfMonthUTC(t.getUTCFullYear(), t.getUTCMonth()));
    setSelected(t);
  }

  const commandesJourSelectionne = selected && selected.getUTCMonth() === month && selected.getUTCFullYear() === year
    ? (parJour[selected.getUTCDate()] ?? [])
    : [];

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader icon={Calendar} title="Calendrier" subtitle="Commandes par date de livraison prévue." />

      <Card variant="outlined">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={moisPrecedent} aria-label="Mois précédent" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 capitalize">
              {MOIS_LABEL(cursor)}
            </span>
            <Button variant="ghost" size="sm" onClick={allerAujourdhui}>
              Aujourd'hui
            </Button>
          </div>
          <Button variant="ghost" size="sm" icon={ChevronRight} onClick={moisSuivant} aria-label="Mois suivant" />
        </div>

        {query.isPending && <LoadingState label="Chargement du calendrier…" />}
        {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}

        {!query.isPending && !query.isError && (
          <div className="grid grid-cols-7 gap-1 text-center">
            {JOURS_SEMAINE.map((j) => (
              <div key={j} className="text-xs font-medium text-neutral-400 py-1">
                {j}
              </div>
            ))}
            {cellules.map((jour, i) => {
              if (jour === null) return <div key={`vide-${i}`} />;
              const date = new Date(Date.UTC(year, month, jour));
              const nb = (parJour[jour] ?? []).length;
              const isSelected = isSameDayUTC(date, selected);
              const isToday = isSameDayUTC(date, todayUTC());
              return (
                <button
                  key={jour}
                  type="button"
                  onClick={() => setSelected(date)}
                  className={`relative flex flex-col items-center justify-center gap-0.5 rounded-lg aspect-square text-sm transition-colors ${
                    isSelected
                      ? "bg-brand-600 text-white font-semibold"
                      : isToday
                        ? "bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300 font-semibold"
                        : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  {jour}
                  {nb > 0 && (
                    <span
                      className={`size-1.5 rounded-full ${isSelected ? "bg-white" : "bg-amber-500"}`}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {selected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 capitalize">
              {JOUR_LABEL(selected)}
            </h2>
            <Button
              as={Link}
              to={`/commandes/nouvelle?dateLivraisonPrevue=${toISODate(selected)}`}
              variant="primary"
              size="sm"
              icon={Plus}
            >
              Nouvelle commande ce jour
            </Button>
          </div>

          {commandesJourSelectionne.length === 0 ? (
            <EmptyState icon={ClipboardList}>Aucune commande à livrer ce jour-là.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {commandesJourSelectionne.map((c) => (
                <li key={c.id}>
                  <Link to={`/commandes/${c.id}`}>
                    <Card
                      variant="outlined"
                      className="flex items-center justify-between gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 dark:text-neutral-100">{c.numero}</p>
                        <p className="text-sm text-neutral-500 truncate">
                          {c.cliente.nom} {c.cliente.prenom} — {c.modele?.nom ?? "Sur mesure (sans modèle)"}
                        </p>
                      </div>
                      <CommandeStatutBadge statut={c.statut} />
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
