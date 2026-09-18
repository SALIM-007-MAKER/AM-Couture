import { CreditCard, Clock3, Gift, Layers, Info } from "lucide-react";
import { useEtatAbonnementQuery, usePlansQuery } from "./hooks.js";
import { formatDateFr } from "./constants.js";
import StatutAbonnementBadge from "./components/StatutAbonnementBadge.jsx";
import PlanCard from "./components/PlanCard.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { useTranslation } from "../../i18n/index.js";

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-neutral-500 text-xs mb-0.5">{label}</p>
      <p className="text-neutral-900 dark:text-neutral-100">{value}</p>
    </div>
  );
}

// Page Abonnement du PDG — LECTURE SEULE : aucun paiement en ligne n'existe
// encore, l'abonnement est activé manuellement par le SUPERADMIN (voir
// backend/src/routes/ateliersAbonnement.routes.js). Aucune action possible ici,
// aucun clic n'est jamais une confirmation : l'état affiché vient uniquement
// du serveur (GET /api/abonnements/etat, rafraîchi automatiquement).
export default function AbonnementPage() {
  const { t } = useTranslation();
  const etatQuery = useEtatAbonnementQuery();
  const plansQuery = usePlansQuery();
  const etat = etatQuery.data;
  const abonnement = etat?.abonnement;
  const essai = etat?.essai;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader icon={CreditCard} title={t("nav.subscription")} subtitle={t("sub.subtitle")} />

      <div className="space-y-2">
        <SectionTitle icon={Clock3}>{t("sub.currentStatus")}</SectionTitle>
        {etatQuery.isPending && <LoadingState label={t("common.loading")} />}
        {etatQuery.isError && <ErrorState error={etatQuery.error} onRetry={etatQuery.refetch} />}
        {etat && (
          <Card variant="outlined" className="space-y-4">
            <StatutAbonnementBadge statut={etat.statut} />

            {abonnement && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <InfoRow label={t("sub.plan")} value={abonnement.planNom ?? "—"} />
                <InfoRow
                  label={t("sub.startDate")}
                  value={abonnement.dateDebut ? formatDateFr(abonnement.dateDebut) : "—"}
                />
                <InfoRow
                  label={t("sub.expiryDate")}
                  value={abonnement.dateExpiration ? formatDateFr(abonnement.dateExpiration) : "—"}
                />
                {etat.statut === "ACTIF" && abonnement.joursRestants != null && (
                  <InfoRow label={t("sub.daysLeftLabel")} value={t("sub.daysLeft", { jours: abonnement.joursRestants })} />
                )}
                {abonnement.dureeMois && (
                  <InfoRow label={t("sub.duration")} value={t("sub.months", { mois: abonnement.dureeMois })} />
                )}
              </div>
            )}

            {etat.statut === "EN_ATTENTE" && abonnement?.dateDebut && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {t("sub.pendingNote", { date: formatDateFr(abonnement.dateDebut) })}
              </p>
            )}
            {etat.statut === "EXPIRE" && <p className="text-sm text-red-700 dark:text-red-400">{t("sub.expiredNote")}</p>}
            {etat.statut === "AUCUN" && <p className="text-sm text-neutral-500">{t("sub.noSubscription")}</p>}
          </Card>
        )}
      </div>

      {essai && (
        <div className="space-y-2">
          <SectionTitle icon={Gift}>{t("sub.trialTitle")}</SectionTitle>
          <Card
            variant="outlined"
            className={`flex items-center gap-2 text-sm ${
              essai.actif
                ? "border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400"
                : "border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400"
            }`}
          >
            <Gift className="size-4 shrink-0" aria-hidden="true" />
            {essai.actif
              ? t("sub.trialLeft", { jours: essai.joursRestants, date: formatDateFr(essai.trialEndsAt) })
              : t("sub.trialEnded", { date: formatDateFr(essai.trialEndsAt) })}
          </Card>
        </div>
      )}

      <div className="space-y-2">
        <SectionTitle icon={Layers}>{t("sub.plansTitle")}</SectionTitle>
        {plansQuery.isPending && <LoadingState label={t("common.loading")} />}
        {plansQuery.isError && <ErrorState error={plansQuery.error} onRetry={plansQuery.refetch} />}
        {plansQuery.data && plansQuery.data.length === 0 && <EmptyState icon={Layers}>{t("sub.plansEmpty")}</EmptyState>}
        {plansQuery.data && plansQuery.data.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plansQuery.data.map((plan) => (
              <PlanCard key={plan.id} plan={plan} courant={etat?.statut === "ACTIF" && abonnement?.planNom === plan.nom} />
            ))}
          </div>
        )}

        <Card variant="outlined" className="flex items-start gap-2 text-sm text-neutral-600 dark:text-neutral-400">
          <Info className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          {t("sub.contactMessage")}
        </Card>
      </div>
    </div>
  );
}
