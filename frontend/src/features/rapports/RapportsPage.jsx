import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  Wallet,
  TrendingUp,
  ClipboardList,
  AlertTriangle,
  Truck,
  Users,
  Shirt,
} from "lucide-react";
import {
  useFinancesQuery,
  useEvolutionQuery,
  useCommandesStatsQuery,
  useCommandesEnRetardQuery,
  useCommandesALivrerQuery,
  useClientesStatsQuery,
  useModelesStatsQuery,
} from "./hooks.js";
import PeriodSelector from "../../components/PeriodSelector.jsx";
import Pagination from "../../components/Pagination.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { inputClass } from "../../components/FormField.jsx";
import { statutLabel, prioriteLabel } from "../commandes/constants.js";
import { categorieLabel } from "../modeles/constants.js";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

const STAT_TONES = {
  neutral: "",
  success: "text-green-600 dark:text-green-400",
  danger: "text-red-600 dark:text-red-400",
};

/** Une carte de statistique — `emphasize` agrandit la valeur pour les
 * chiffres qui doivent ressortir (ex: solde de trésorerie), évitant que
 * toutes les cartes d'une section aient exactement le même poids visuel. */
function Stat({ label, value, sub, tone = "neutral", emphasize = false }) {
  return (
    <Card>
      <p className="text-neutral-500 text-xs">{label}</p>
      <p className={`font-semibold tabular-nums mt-0.5 ${emphasize ? "text-2xl" : "text-lg"} ${STAT_TONES[tone]} ${tone === "neutral" ? "text-neutral-900 dark:text-neutral-100" : ""}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>}
    </Card>
  );
}

function FinancesSection({ period }) {
  const query = useFinancesQuery(period);
  if (query.isPending) return <LoadingState label="Chargement des finances…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const d = query.data;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
      <Stat label="Valeur des commandes créées" value={d.totalCommandes} sub={`${d.nombreCommandes} commande(s)`} />
      <Stat label="Encaissé" value={d.totalEncaisse} sub={`${d.nombrePaiements} paiement(s)`} tone="success" />
      <Stat label="Dépenses" value={d.totalDepenses} sub={`${d.nombreDepenses} dépense(s)`} />
      {/* Chiffre le plus important de la section — mis en avant, jamais présenté comme un "bénéfice". */}
      <Stat
        label="Solde de trésorerie"
        value={d.solde}
        sub="Encaissé − dépenses (pas un bénéfice comptable)"
        emphasize
      />
    </div>
  );
}

function EvolutionSection() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = useEvolutionQuery({ from: from || undefined, to: to || undefined });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <label className="flex items-center gap-1.5">
          Du
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} w-auto py-1.5`} />
        </label>
        <label className="flex items-center gap-1.5">
          au
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} w-auto py-1.5`} />
        </label>
        <span className="text-neutral-500 text-xs">(12 derniers mois par défaut)</span>
      </div>
      {query.isPending && <LoadingState label="Chargement de l'évolution…" />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && (
        <Card variant="outlined" padded={false} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="px-3 py-3 font-medium">Mois</th>
                <th className="px-3 py-3 font-medium text-right">Commandes</th>
                <th className="px-3 py-3 font-medium text-right">Ventes</th>
                <th className="px-3 py-3 font-medium text-right">Encaissements</th>
                <th className="px-3 py-3 font-medium text-right">Dépenses</th>
                <th className="px-3 py-3 font-medium text-right">Résultat</th>
              </tr>
            </thead>
            <tbody>
              {query.data.data.map((row) => (
                <tr key={row.mois} className="border-t border-neutral-100 dark:border-neutral-800">
                  <td className="px-3 py-2.5 text-neutral-900 dark:text-neutral-100">{row.mois}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{row.commandes}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{row.ventes}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{row.encaissements}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{row.depenses}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-neutral-900 dark:text-neutral-100">{row.resultat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function RepartitionList({ title, rows, labelFor }) {
  const total = rows.reduce((sum, r) => sum + r.nombre, 0);
  return (
    <div>
      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{title}</p>
      <ul className="space-y-0.5 text-sm">
        {rows.map((r) => (
          <li key={labelFor(r)} className="flex justify-between gap-2 text-neutral-600 dark:text-neutral-400">
            <span>{labelFor(r)}</span>
            <span className="tabular-nums">{r.nombre}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-neutral-500 mt-1">Total : {total}</p>
    </div>
  );
}

function CommandesStatsSection({ period }) {
  const query = useCommandesStatsQuery(period);
  if (query.isPending) return <LoadingState label="Chargement…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const d = query.data;
  return (
    <div className="space-y-4">
      <Stat label="Commandes créées sur la période" value={d.creees.nombre} sub={`Valeur : ${d.creees.valeurTotale}`} />
      <Card className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <RepartitionList title="Par statut" rows={d.parStatut} labelFor={(r) => statutLabel(r.statut)} />
        <RepartitionList title="Par priorité" rows={d.parPriorite} labelFor={(r) => prioriteLabel(r.priorite)} />
        <RepartitionList title="Par catégorie" rows={d.parCategorie} labelFor={(r) => categorieLabel(r.categorie)} />
      </Card>
    </div>
  );
}

function EnRetardSection() {
  const [page, setPage] = useState(1);
  const query = useCommandesEnRetardQuery({ page, pageSize: 10 });
  if (query.isPending) return <LoadingState label="Chargement…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (query.data.data.length === 0) return <EmptyState icon={AlertTriangle}>Aucune commande en retard.</EmptyState>;
  return (
    <div className="space-y-2">
      <Card variant="outlined" padded={false}>
        <ul>
          {query.data.data.map((c) => (
            <li key={c.id} className="flex items-center justify-between text-sm px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
              <Link to={`/commandes/${c.id}`} className="hover:underline text-neutral-900 dark:text-neutral-100">
                {c.numero} — {c.cliente.nom} {c.cliente.prenom}
              </Link>
              <span className="text-red-600 dark:text-red-400 text-xs font-medium">{c.joursDeRetard} j de retard</span>
            </li>
          ))}
        </ul>
      </Card>
      <Pagination page={query.data.meta.page} totalPages={query.data.meta.totalPages} total={query.data.meta.total} onChange={setPage} />
    </div>
  );
}

function ALivrerSection() {
  const [page, setPage] = useState(1);
  const [horizonJours, setHorizonJours] = useState(7);
  const query = useCommandesALivrerQuery({ page, pageSize: 10, horizonJours });
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-neutral-500">
        Horizon (jours)
        <input
          type="number"
          min="1"
          max="90"
          value={horizonJours}
          onChange={(e) => {
            setHorizonJours(Number(e.target.value));
            setPage(1);
          }}
          className={`${inputClass} w-20 py-1.5`}
        />
      </label>
      {query.isPending && <LoadingState label="Chargement…" />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && query.data.data.length === 0 && (
        <EmptyState icon={Truck}>Aucune commande à livrer dans cet horizon.</EmptyState>
      )}
      {query.data && query.data.data.length > 0 && (
        <>
          <Card variant="outlined" padded={false}>
            <ul>
              {query.data.data.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
                  <Link to={`/commandes/${c.id}`} className="hover:underline text-neutral-900 dark:text-neutral-100">
                    {c.numero} — {c.cliente.nom} {c.cliente.prenom}
                  </Link>
                  <span className="text-neutral-500 text-xs">{formatDate(c.dateLivraisonPrevue)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Pagination page={query.data.meta.page} totalPages={query.data.meta.totalPages} total={query.data.meta.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function ClientesStatsSection({ period }) {
  const query = useClientesStatsQuery(period);
  if (query.isPending) return <LoadingState label="Chargement…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const d = query.data;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Actives" value={d.actives} />
        <Stat label="Archivées" value={d.archivees} />
        <Stat label="Nouvelles (période)" value={d.nouvelles} />
        <Stat label="Ayant commandé (période)" value={d.ayantCommande} />
      </div>
      {d.topClientes.length > 0 && (
        <Card>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Clients les plus actifs</p>
          <ul className="space-y-1 text-sm">
            {d.topClientes.map((c) => (
              <li key={c.id} className="flex justify-between gap-2 text-neutral-600 dark:text-neutral-400">
                <Link to={`/clientes/${c.id}`} className="hover:underline">
                  {c.nom} {c.prenom}
                </Link>
                <span className="tabular-nums">{c.nombreCommandes} commande(s)</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ModelesStatsSection({ period }) {
  const query = useModelesStatsQuery(period);
  if (query.isPending) return <LoadingState label="Chargement…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const d = query.data;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Modèles actifs" value={d.actifs} />
        <Stat label="Modèles archivés" value={d.archives} />
      </div>
      {d.plusUtilises.length > 0 && (
        <Card>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Modèles les plus utilisés</p>
          <ul className="space-y-1 text-sm">
            {d.plusUtilises.map((m) => (
              <li key={m.id} className="flex justify-between gap-2 text-neutral-600 dark:text-neutral-400">
                <Link to={`/modeles/${m.id}`} className="hover:underline">
                  {m.nom}
                </Link>
                <span className="tabular-nums">{m.nombreCommandes} commande(s)</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function RapportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = {
    period: searchParams.get("from") || searchParams.get("to") ? undefined : (searchParams.get("period") ?? "month"),
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };

  function handlePeriodChange(next) {
    const params = new URLSearchParams();
    if (next.period) params.set("period", next.period);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    setSearchParams(params);
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <PageHeader
        icon={BarChart3}
        title="Rapports"
        subtitle={
          <>
            Finances, Commandes, Clients et Modèles suivent la période choisie. "En retard" et "à livrer" reflètent
            toujours l'état actuel.
          </>
        }
        actions={<PeriodSelector value={period} onChange={handlePeriodChange} />}
      />

      <div className="space-y-3">
        <SectionTitle icon={Wallet}>Finances</SectionTitle>
        <FinancesSection period={period} />
      </div>

      <div className="space-y-3">
        <SectionTitle icon={TrendingUp}>Évolution mensuelle</SectionTitle>
        <EvolutionSection />
      </div>

      <div className="space-y-3">
        <SectionTitle icon={ClipboardList}>Commandes</SectionTitle>
        <CommandesStatsSection period={period} />
      </div>

      <div className="space-y-3">
        <SectionTitle icon={AlertTriangle}>Commandes en retard</SectionTitle>
        <EnRetardSection />
      </div>

      <div className="space-y-3">
        <SectionTitle icon={Truck}>Commandes à livrer prochainement</SectionTitle>
        <ALivrerSection />
      </div>

      <div className="space-y-3">
        <SectionTitle icon={Users}>Clients</SectionTitle>
        <ClientesStatsSection period={period} />
      </div>

      <div className="space-y-3">
        <SectionTitle icon={Shirt}>Modèles</SectionTitle>
        <ModelesStatsSection period={period} />
      </div>
    </div>
  );
}
