import { Link } from "react-router-dom";
import { Banknote, Bell } from "lucide-react";
import { usePaiementsAValiderQuery } from "../../features/commerce/hooks.js";
import { formatDateFr, formatPrix } from "../../features/abonnement/constants.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { useTranslation } from "../../i18n/index.js";
import { AlertesSection } from "./SuperadminDashboardPage.jsx";

// Cloche de l'en-tête du SUPERADMIN : ce qui attend une décision (paiements déclarés par les ateliers) puis les alertes sur
// les ateliers (abonnements expirés ou bientôt, ateliers suspendus, nouveaux ateliers). Tout est recalculé à chaque chargement.
function PaiementsAValider() {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = usePaiementsAValiderQuery();

  if (isPending) return <LoadingState label={t("sa.notifications.paymentsLoading")} />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  if (data.total === 0) return <EmptyState icon={Banknote}>{t("sa.notifications.noPayments")}</EmptyState>;

  return (
    <div className="space-y-2">
      {data.data.map((p) => (
        <Link key={p.id} to="/paiements-abonnement">
          <Card variant="outlined" className="flex items-center gap-3 border-amber-200 dark:border-amber-900 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
              <Banknote className="size-4" aria-hidden="true" />
            </span>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              <span className="font-medium">{p.atelierNom ?? "—"}</span> —{" "}
              {t("sa.notifications.paymentLine", { numero: p.numero, montant: formatPrix(p.montant), date: formatDateFr(p.declareLe) })}
            </p>
          </Card>
        </Link>
      ))}
      {data.total > data.data.length && (
        <Link to="/paiements-abonnement" className="block text-sm text-brand-700 dark:text-brand-400 hover:underline">
          {t("sa.notifications.paymentsMore", { count: data.total - data.data.length })}
        </Link>
      )}
    </div>
  );
}

export default function NotificationsPlateformePage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader icon={Bell} title={t("sa.notifications.title")} subtitle={t("sa.notifications.subtitle")} />
      <section className="space-y-3">
        <SectionTitle>{t("sa.notifications.paymentsTitle")}</SectionTitle>
        <PaiementsAValider />
      </section>
      <section className="space-y-3">
        <SectionTitle>{t("sa.notifications.alertsTitle")}</SectionTitle>
        <AlertesSection />
      </section>
    </div>
  );
}
