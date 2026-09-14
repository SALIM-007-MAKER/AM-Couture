import { Link } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  ShieldCheck,
  ShieldOff,
  UserCircle,
  Users,
  ClipboardList,
  Bell,
  Sparkles,
  AlertTriangle,
  CreditCard,
  TrendingUp,
} from "lucide-react";
import { useAteliersResumeQuery, useAteliersAlertesQuery, useAteliersTendancesQuery } from "../../features/ateliers/hooks.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";

const KPI_TONES = {
  neutral: "bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
  success: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400",
  danger: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400",
};

// Même composant visuel que Kpi (DashboardPage.jsx, non exporté de là) —
// dupliqué ici plutôt qu'exporté/partagé : deux pages qui n'ont sinon aucune
// autre dépendance croisée (une ADMIN, une SUPERADMIN), un partage forcé
// ajouterait un couplage pour un simple bloc visuel de 10 lignes.
function Kpi({ icon: Icon, label, value, tone = "neutral" }) {
  return (
    <Card className="flex items-start gap-3 min-w-0">
      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${KPI_TONES[tone]}`}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-neutral-500 leading-tight">{label}</p>
        <p className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50 mt-0.5 break-words">
          {value}
        </p>
      </div>
    </Card>
  );
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

// Construites à partir des données déjà existantes (ateliers, abonnements) —
// PAS un nouveau système de notifications persistées (pas de "lu/non lu",
// rien stocké, recalculé à chaque chargement) : même décision que le fil
// "Activité récente" de la fiche atelier (voir AtelierDetailPage.jsx).
function AlertesSection() {
  const { data, isPending, isError, error, refetch } = useAteliersAlertesQuery();

  if (isPending) return <LoadingState label="Chargement des alertes…" />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;

  const { nouveauxAteliers, ateliersSuspendus, abonnementsAlerte } = data;
  const total = nouveauxAteliers.length + ateliersSuspendus.length + abonnementsAlerte.length;

  if (total === 0) {
    return <EmptyState icon={Bell}>Rien à signaler pour l'instant.</EmptyState>;
  }

  return (
    <div className="space-y-2">
      {abonnementsAlerte.map((a) => (
        <Link key={`abo-${a.id}`} to={`/ateliers/${a.id}`}>
          <Card
            variant="outlined"
            className={`flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors ${a.expire ? "border-red-200 dark:border-red-900" : "border-amber-200 dark:border-amber-900"}`}
          >
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${a.expire ? "bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400" : "bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400"}`}>
              <CreditCard className="size-4" aria-hidden="true" />
            </span>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              <span className="font-medium">{a.nom}</span> —{" "}
              {a.expire ? "abonnement expiré" : "abonnement expire bientôt"} ({formatDate(a.dateExpiration)})
            </p>
          </Card>
        </Link>
      ))}

      {ateliersSuspendus.map((a) => (
        <Link key={`sus-${a.id}`} to={`/ateliers/${a.id}`}>
          <Card variant="outlined" className="flex items-center gap-3 border-red-200 dark:border-red-900 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950 text-red-600 dark:text-red-400">
              <AlertTriangle className="size-4" aria-hidden="true" />
            </span>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              <span className="font-medium">{a.nom}</span> — suspendu le {formatDate(a.suspenduLe)}
            </p>
          </Card>
        </Link>
      ))}

      {nouveauxAteliers.map((a) => (
        <Link key={`new-${a.id}`} to={`/ateliers/${a.id}`}>
          <Card variant="outlined" className="flex items-center gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-300">
              <Sparkles className="size-4" aria-hidden="true" />
            </span>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              <span className="font-medium">{a.nom}</span> — nouvel atelier ({formatDate(a.createdAt)})
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function moisLabel(cle) {
  const [annee, mois] = cle.split("-").map(Number);
  return new Date(annee, mois - 1, 1).toLocaleDateString("fr-FR", { month: "short" });
}

// Un seul axe, une seule teinte par graphique (voir skill dataviz) — deux
// mesures d'échelles différentes (un compte d'ateliers, une somme d'argent)
// ne partagent donc jamais le même graphique à deux axes ; deux mini-graphes
// séparés à la place (voir TendancesSection). Étiquette de valeur directe
// au-dessus de chaque barre plutôt qu'une légende (une seule série ici).
function MiniBarChart({ data, valueKey, colorClass, formatValue }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <div className="flex items-end gap-2 h-28">
      {data.map((d) => {
        const valeur = d[valueKey];
        const hauteurPct = Math.max(2, (valeur / max) * 100);
        return (
          <div key={d.mois} className="flex-1 flex flex-col items-center gap-1 h-full min-w-0">
            <div
              className="w-full flex-1 flex flex-col justify-end items-center min-w-0"
              title={`${moisLabel(d.mois)} : ${formatValue(valeur)}`}
            >
              {valeur > 0 && (
                <span className="text-[10px] font-medium tabular-nums text-neutral-600 dark:text-neutral-400 truncate w-full text-center">
                  {formatValue(valeur)}
                </span>
              )}
              <div className={`w-full rounded-t ${colorClass}`} style={{ height: `${hauteurPct}%` }} />
            </div>
            <span className="text-[10px] text-neutral-500 shrink-0">{moisLabel(d.mois)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Revenus de la PLATEFORME (abonnements payés par les ateliers) — jamais le
// chiffre d'affaires des ateliers eux-mêmes (données privées de chaque
// atelier, hors de portée du SUPERADMIN). Voir commentaire backend,
// GET /api/ateliers/tendances.
function TendancesSection() {
  const { data, isPending, isError, error, refetch } = useAteliersTendancesQuery();
  if (isPending) return <LoadingState label="Chargement des tendances…" />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card variant="outlined">
        <p className="text-xs font-medium text-neutral-500 mb-3">Nouveaux ateliers par mois</p>
        <MiniBarChart
          data={data}
          valueKey="nouveauxAteliers"
          colorClass="bg-brand-500 dark:bg-brand-400"
          formatValue={(v) => String(v)}
        />
      </Card>
      <Card variant="outlined">
        <p className="text-xs font-medium text-neutral-500 mb-3">Revenus de la plateforme par mois</p>
        <MiniBarChart
          data={data}
          valueKey="revenus"
          colorClass="bg-amber-500 dark:bg-amber-400"
          formatValue={(v) => v.toLocaleString("fr-FR")}
        />
      </Card>
    </div>
  );
}

export default function SuperadminDashboardPage() {
  const { data, isPending, isError, error, refetch } = useAteliersResumeQuery();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Vue d'ensemble"
        subtitle="Totaux de la plateforme Gestion d'Atelier, tous ateliers confondus."
      />

      {isPending && <LoadingState label="Chargement des statistiques…" />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <Kpi icon={Building2} label="Ateliers" value={data.nombreAteliers} />
          <Kpi icon={ShieldCheck} label="Ateliers actifs" value={data.nombreAteliersActifs} tone="success" />
          <Kpi
            icon={ShieldOff}
            label="Ateliers suspendus"
            value={data.nombreAteliersSuspendus}
            tone={data.nombreAteliersSuspendus > 0 ? "danger" : "neutral"}
          />
          <Kpi icon={UserCircle} label="Comptes admin" value={data.nombreComptes} />
          <Kpi icon={Users} label="Clientes (toutes plateformes)" value={data.nombreClientes} />
          <Kpi icon={ClipboardList} label="Commandes (toutes plateformes)" value={data.nombreCommandes} />
        </div>
      )}

      <div className="space-y-3">
        <SectionTitle icon={TrendingUp}>Tendances (6 derniers mois)</SectionTitle>
        <TendancesSection />
      </div>

      <div className="space-y-3">
        <SectionTitle icon={Bell}>Alertes</SectionTitle>
        <AlertesSection />
      </div>
    </div>
  );
}
