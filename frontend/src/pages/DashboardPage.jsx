import { useSearchParams, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Clock,
  Truck,
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  Wallet,
  Receipt,
  TrendingUp,
  ClipboardList,
  ArrowRight,
} from "lucide-react";
import { useDashboardSummaryQuery } from "../features/dashboard/hooks.js";
import { useCommandesQuery } from "../features/commandes/hooks.js";
import { useCommandesEnRetardQuery, useCommandesALivrerQuery } from "../features/rapports/hooks.js";
import CommandeStatutBadge from "../features/commandes/components/CommandeStatutBadge.jsx";
import { useTranslation } from "../i18n/index.js";
import PageHeader from "../components/PageHeader.jsx";
import PeriodSelector from "../components/PeriodSelector.jsx";
import Card from "../components/Card.jsx";
import TrialBanner from "../components/TrialBanner.jsx";
import { LoadingState, ErrorState, EmptyState } from "../components/QueryState.jsx";
import { useLocaleStore } from "../stores/localeStore.js";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

function isToday(iso) {
  const d = new Date(iso);
  const now = new Date();
  return d.getUTCFullYear() === now.getFullYear() && d.getUTCMonth() === now.getMonth() && d.getUTCDate() === now.getDate();
}

const KPI_TONES = {
  neutral: "bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
  success: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400",
  warning: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400",
  danger: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400",
};

/**
 * KPI à poids visuel VARIABLE (pas tous identiques, voir demande de refonte) :
 * `tone="danger"` ajoute un contour rouge — réservé aux situations qui
 * exigent une action (ex: commandes en retard > 0). Les KPI purement
 * informationnels restent en `neutral`, sans essayer d'attirer l'œil.
 */
function Kpi({ icon: Icon, label, value, sub, tone = "neutral" }) {
  return (
    <Card
      className={`flex items-start gap-3 min-w-0 ${tone === "danger" ? "ring-1 ring-red-300 dark:ring-red-800" : ""}`}
    >
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${KPI_TONES[tone]}`}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-neutral-500 leading-tight">{label}</p>
        <p className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50 mt-0.5 break-words">
          {value}
        </p>
        {sub && <p className="text-xs text-neutral-500 mt-0.5 leading-tight">{sub}</p>}
      </div>
    </Card>
  );
}

/** Liste scannable "en retard" / "à livrer" — une seule couleur porte le
 * sens (rouge=retard, orange=échéance proche), jamais un dégradé décoratif.
 * `isPending`/`isError` explicites : afficher "Aucune commande en retard"
 * alors que la requête n'a même pas encore répondu serait un FAUX négatif
 * rassurant, particulièrement trompeur ici (section d'alerte) — bug réel
 * trouvé en testant avec des données réelles. */
function WatchList({ icon: Icon, tone, title, items, isPending, isError, error, onRetry, renderMeta, emptyLabel, viewAllTo }) {
  const { t } = useTranslation();
  const toneText = tone === "danger" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400";
  return (
    <Card variant="outlined" padded={false}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
        <h3 className={`flex items-center gap-2 text-sm font-semibold ${toneText}`}>
          <Icon className="size-4" aria-hidden="true" />
          {title}
        </h3>
        {!isPending && !isError && items.length > 0 && (
          <Link to={viewAllTo} className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 inline-flex items-center gap-0.5">
            {t("common.viewAll")} <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        )}
      </div>
      {isPending ? (
        <div className="px-4 py-4">
          <LoadingState label={t("common.loading")} />
        </div>
      ) : isError ? (
        <div className="p-4">
          <ErrorState error={error} onRetry={onRetry} />
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-neutral-500">{emptyLabel}</p>
      ) : (
        <ul>
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm border-b border-neutral-100 dark:border-neutral-800 last:border-0">
              <Link to={`/commandes/${c.id}`} className="min-w-0 truncate hover:underline text-neutral-900 dark:text-neutral-100">
                {c.numero} — {c.cliente.nom} {c.cliente.prenom}
              </Link>
              <span className={`shrink-0 text-xs font-medium ${toneText}`}>{renderMeta(c)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const periodValue = {
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

  const summaryQuery = useDashboardSummaryQuery(periodValue);
  // "En retard" / "à livrer" reflètent toujours l'état ACTUEL de l'atelier,
  // indépendamment de la période sélectionnée pour les KPI financiers (une
  // commande en retard l'est aujourd'hui, pas "pendant telle période
  // passée") — même logique déjà établie dans Rapports.
  const enRetardQuery = useCommandesEnRetardQuery({ page: 1, pageSize: 5 });
  // 3 jours (demande Phase 4) — remplace l'horizon 7 jours utilisé jusqu'ici
  // ici uniquement ; /rapports garde son propre horizon indépendant.
  const HORIZON_JOURS = 3;
  const aLivrerQuery = useCommandesALivrerQuery({ page: 1, pageSize: 5, horizonJours: HORIZON_JOURS });
  const recentesQuery = useCommandesQuery({ page: 1, pageSize: 6 });

  const nombreEnRetard = summaryQuery.data?.commandes.enRetard ?? 0;
  const aLivrerAujourdhui = (aLivrerQuery.data?.data ?? []).filter((c) => isToday(c.dateLivraisonPrevue)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        actions={<PeriodSelector value={periodValue} onChange={handlePeriodChange} />}
      />

      <TrialBanner />

      {summaryQuery.isPending && <LoadingState label={t("common.loading")} />}
      {summaryQuery.isError && <ErrorState error={summaryQuery.error} onRetry={summaryQuery.refetch} />}

      {summaryQuery.data && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-600">
            {t("dashboard.overview")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <Kpi icon={Clock} label={t("dashboard.kpiEnCours")} value={summaryQuery.data.commandes.enCours} tone="neutral" />
            <Kpi
              icon={CheckCircle2}
              label={t("dashboard.kpiPretes")}
              value={summaryQuery.data.commandes.terminees}
              sub={t("dashboard.kpiPretesSub")}
              tone={summaryQuery.data.commandes.terminees > 0 ? "warning" : "neutral"}
            />
            <Kpi
              icon={Truck}
              label={t("dashboard.kpiLivraison", { jours: HORIZON_JOURS })}
              value={aLivrerQuery.data?.meta.total ?? "—"}
              sub={aLivrerAujourdhui > 0 ? t("dashboard.kpiLivraisonSub", { nombre: aLivrerAujourdhui }) : undefined}
              tone={aLivrerAujourdhui > 0 ? "warning" : "neutral"}
            />
            <Kpi
              icon={nombreEnRetard > 0 ? AlertTriangle : CheckCircle2}
              label={t("dashboard.kpiEnRetard")}
              value={nombreEnRetard}
              tone={nombreEnRetard > 0 ? "danger" : "success"}
            />
            <Kpi
              icon={CircleOff}
              label={t("dashboard.kpiNonPayees")}
              value={summaryQuery.data.commandes.nonPayees}
              sub={t("dashboard.kpiNonPayeesSub")}
              tone={summaryQuery.data.commandes.nonPayees > 0 ? "warning" : "neutral"}
            />
            <Kpi
              icon={Wallet}
              label={t("dashboard.kpiEncaisse")}
              value={summaryQuery.data.finances.totalEncaisse}
              sub={t("dashboard.paiementsSub", { nombre: summaryQuery.data.finances.nombrePaiements })}
              tone="success"
            />
            <Kpi
              icon={Receipt}
              label={t("dashboard.kpiDepenses")}
              value={summaryQuery.data.finances.totalDepenses}
              sub={t("dashboard.depensesSub", { nombre: summaryQuery.data.finances.nombreDepenses })}
              tone="neutral"
            />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-600">
          {t("dashboard.todo")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <WatchList
            icon={AlertTriangle}
            tone="danger"
            title={t("dashboard.lateOrders")}
            items={enRetardQuery.data?.data ?? []}
            isPending={enRetardQuery.isPending}
            isError={enRetardQuery.isError}
            error={enRetardQuery.error}
            onRetry={enRetardQuery.refetch}
            renderMeta={(c) => t("dashboard.lateOrdersMeta", { jours: c.joursDeRetard })}
            emptyLabel={t("dashboard.lateOrdersEmpty")}
            viewAllTo="/rapports"
          />
          <WatchList
            icon={Truck}
            tone="warning"
            title={t("dashboard.upcomingDeliveries", { jours: HORIZON_JOURS })}
            items={aLivrerQuery.data?.data ?? []}
            isPending={aLivrerQuery.isPending}
            isError={aLivrerQuery.isError}
            error={aLivrerQuery.error}
            onRetry={aLivrerQuery.refetch}
            renderMeta={(c) => (isToday(c.dateLivraisonPrevue) ? t("common.today") : formatDate(c.dateLivraisonPrevue))}
            emptyLabel={t("dashboard.upcomingDeliveriesEmpty", { jours: HORIZON_JOURS })}
            viewAllTo="/rapports"
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-600">
            <ClipboardList className="size-3.5" aria-hidden="true" />
            {t("dashboard.recentOrders")}
          </h2>
          <Link to="/commandes" className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 inline-flex items-center gap-0.5">
            {t("common.viewAll")} <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
        {recentesQuery.isPending && <LoadingState label={t("common.loading")} />}
        {recentesQuery.isError && <ErrorState error={recentesQuery.error} onRetry={recentesQuery.refetch} />}
        {recentesQuery.data && recentesQuery.data.data.length === 0 && (
          <EmptyState icon={ClipboardList}>{t("dashboard.recentOrdersEmpty")}</EmptyState>
        )}
        {recentesQuery.data && recentesQuery.data.data.length > 0 && (
          <Card variant="outlined" padded={false} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("dashboard.colNumero")}</th>
                  <th className="px-4 py-3 font-medium">{t("dashboard.colClient")}</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">{t("dashboard.colModele")}</th>
                  <th className="px-4 py-3 font-medium">{t("dashboard.colStatut")}</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">{t("dashboard.colLivraison")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("dashboard.colMontant")}</th>
                  <th className="px-4 py-3 font-medium text-right hidden sm:table-cell">{t("dashboard.colReste")}</th>
                </tr>
              </thead>
              <tbody>
                {recentesQuery.data.data.map((c) => (
                  <tr key={c.id} className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <Link to={`/commandes/${c.id}`} className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline">
                        {c.numero}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {c.cliente.nom} {c.cliente.prenom}
                    </td>
                    <td className="px-4 py-3 text-neutral-500 hidden md:table-cell">{c.modele?.nom ?? "—"}</td>
                    <td className="px-4 py-3">
                      <CommandeStatutBadge statut={c.statut} />
                    </td>
                    <td className="px-4 py-3 text-neutral-500 hidden sm:table-cell">{formatDate(c.dateLivraisonPrevue)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-neutral-100">{c.prixTotal}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500 hidden sm:table-cell">{c.solde}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {summaryQuery.data && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-600">
            {t("dashboard.financesPeriode")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi
              icon={ClipboardList}
              label={t("dashboard.valeurCommandes")}
              value={summaryQuery.data.commandes.valeurTotale}
              sub={t("dashboard.commandesCreees", { nombre: summaryQuery.data.commandes.nombre })}
            />
            <Kpi icon={Wallet} label={t("dashboard.kpiEncaisse")} value={summaryQuery.data.finances.totalEncaisse} tone="success" />
            <Kpi icon={Receipt} label={t("dashboard.kpiDepenses")} value={summaryQuery.data.finances.totalDepenses} />
            <Kpi
              icon={TrendingUp}
              label={t("dashboard.resultatTresorerie")}
              value={summaryQuery.data.finances.resultatTresorerie}
              sub={t("dashboard.resultatTresorerieSub")}
            />
          </div>
        </section>
      )}
    </div>
  );
}
