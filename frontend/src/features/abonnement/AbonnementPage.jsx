import { useState } from "react";
import { CreditCard, Clock3, Gift, Layers } from "lucide-react";
import { useEtatAbonnementQuery, usePlansQuery } from "./hooks.js";
import { formatDateFr, formatPrix } from "./constants.js";
import StatutAbonnementBadge from "./components/StatutAbonnementBadge.jsx";
import PlanCard from "./components/PlanCard.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import DureeSelector from "./components/DureeSelector.jsx";
import PlansIncluded from "./components/PlansIncluded.jsx";
import PlansFaq from "./components/PlansFaq.jsx";
import ContactBanner from "./components/ContactBanner.jsx";
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
  const whatsapp = etat?.contact?.whatsapp;
  const plans = plansQuery.data ?? [];

  // Durées proposées = union des tarifs de tous les plans (données serveur).
  // Par défaut : la durée de l'abonnement actif si elle existe, sinon la plus courte.
  const durees = [...new Set(plans.flatMap((p) => p.tarifs.map((x) => x.dureeMois)))].sort((a, b) => a - b);
  const [dureeChoisie, setDureeChoisie] = useState(null);
  const dureeParDefaut = etat?.statut === "ACTIF" && durees.includes(abonnement?.dureeMois) ? abonnement.dureeMois : durees[0];
  const duree = durees.includes(dureeChoisie) ? dureeChoisie : dureeParDefaut;
  const remiseMax = Math.max(0, ...plans.map((p) => p.tarifs.find((x) => x.dureeMois === duree)?.remisePourcent ?? 0));

  return (
    <div className="max-w-5xl space-y-6">
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
                  label={t("sub.price")}
                  value={abonnement.prix != null ? `${formatPrix(abonnement.prix)} FCFA` : "—"}
                />
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

      <div className="space-y-4">
        <SectionTitle icon={Layers}>{t("sub.plansTitle")}</SectionTitle>
        {plansQuery.isPending && <LoadingState label={t("common.loading")} />}
        {plansQuery.isError && <ErrorState error={plansQuery.error} onRetry={plansQuery.refetch} />}
        {plansQuery.data && plans.length === 0 && <EmptyState icon={Layers}>{t("sub.plansEmpty")}</EmptyState>}
        {plans.length > 0 && (
          <>
            <DureeSelector durees={durees} value={duree} onChange={setDureeChoisie} remiseMax={remiseMax} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  dureeMois={duree}
                  courant={etat?.statut === "ACTIF" && abonnement?.planNom === plan.nom}
                  whatsapp={whatsapp}
                />
              ))}
            </div>
            <PlansIncluded plans={plans} />
          </>
        )}
      </div>

      <PlansFaq />

      <ContactBanner whatsapp={whatsapp} />
    </div>
  );
}
