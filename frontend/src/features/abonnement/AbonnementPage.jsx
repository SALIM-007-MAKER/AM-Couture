import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CreditCard, Clock3, History, Hourglass } from "lucide-react";
import { useAbonnementActuelQuery, useAbonnementsQuery, isNotFound } from "./hooks.js";
import { STATUT_ABONNEMENT_LABELS, STATUT_TRANSACTION_LABELS, moyenPaiementInfo, formatDateFr } from "./constants.js";
import { useParametresQuery } from "../parametres/hooks.js";
import SouscrireCard from "./components/SouscrireCard.jsx";
import TransactionsEnAttente from "./components/TransactionsEnAttente.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { useTranslation } from "../../i18n/index.js";

// Essai gratuit (§ plan trial) — dérivé de GET /api/parametres
// (atelier.trialEndsAt + essaiExpire, jamais recalculé côté client au-delà
// d'un simple affichage). `trialEndsAt` absent (atelier "légataire", créé
// avant cette fonctionnalité) -> rien n'est affiché, pas de section.
function EssaiSection() {
  const { t } = useTranslation();
  const { data: atelier } = useParametresQuery();
  if (!atelier?.trialEndsAt) return null;

  const finEssai = new Date(atelier.trialEndsAt);
  const joursRestants = Math.ceil((finEssai.getTime() - new Date().getTime()) / 86_400_000);

  return (
    <Card
      variant="outlined"
      className={`flex items-center gap-2 text-sm ${
        atelier.essaiExpire
          ? "border-red-200 dark:border-red-900 text-red-700 dark:text-red-400"
          : "border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-400"
      }`}
    >
      <Hourglass className="size-4 shrink-0" aria-hidden="true" />
      {atelier.essaiExpire
        ? t("abo.trialEnded", { date: formatDateFr(atelier.trialEndsAt) })
        : t("abo.trialLeft", { jours: joursRestants, date: formatDateFr(atelier.trialEndsAt) })}
    </Card>
  );
}

const STATUT_TONES = {
  ACTIF: "text-green-600 dark:text-green-400",
  EXPIRE: "text-red-600 dark:text-red-400",
  EN_ATTENTE: "text-amber-600 dark:text-amber-400",
  ANNULE: "text-neutral-500",
};

export default function AbonnementPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  // "succes"/"echec" : purement indicatif (redirection Wave, voir
  // success_url/error_url dans abonnements.routes.js) — jamais la source de
  // vérité. Le statut affiché ci-dessous vient toujours de /abonnements/actuel,
  // mis à jour uniquement après la vérification serveur (webhook + relecture).
  const paiement = searchParams.get("paiement");
  const actuelQuery = useAbonnementActuelQuery();
  const historiqueQuery = useAbonnementsQuery({ page: 1, pageSize: 10 });

  useEffect(() => {
    if (!paiement) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      next.delete("paiement");
      setSearchParams(next, { replace: true });
    }, 6000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line
  }, [paiement]);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={CreditCard} title={t("nav.subscription")} subtitle={t("abo.subtitle")} />

      <EssaiSection />

      {paiement === "succes" && (
        <Card className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 text-sm">
          {t("abo.verifying")}
        </Card>
      )}
      {paiement === "echec" && (
        <Card className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 text-sm">
          {t("abo.failed")}
        </Card>
      )}

      <div className="space-y-2">
        <SectionTitle icon={Clock3}>{t("abo.currentStatus")}</SectionTitle>
        {actuelQuery.isPending && <LoadingState label={t("common.loading")} />}
        {actuelQuery.isError && !isNotFound(actuelQuery.error) && (
          <ErrorState error={actuelQuery.error} onRetry={actuelQuery.refetch} />
        )}
        {actuelQuery.data && (
          <Card variant="outlined" className="space-y-1">
            <p className={`text-sm font-semibold ${STATUT_TONES[actuelQuery.data.statutEffectif]}`}>
              {STATUT_ABONNEMENT_LABELS[actuelQuery.data.statutEffectif]}
            </p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t("abo.planLine", { nom: actuelQuery.data.formule.nom, prix: actuelQuery.data.prix })}
            </p>
            {actuelQuery.data.dateExpiration && (
              <p className="text-xs text-neutral-500">
                {actuelQuery.data.statutEffectif === "ACTIF"
                  ? t("abo.expiresOn", { date: formatDateFr(actuelQuery.data.dateExpiration) })
                  : t("abo.expiredOn", { date: formatDateFr(actuelQuery.data.dateExpiration) })}
              </p>
            )}
          </Card>
        )}
        {isNotFound(actuelQuery.error) && (
          <Card variant="outlined">
            <p className="text-sm text-neutral-500">{t("abo.none")}</p>
          </Card>
        )}
      </div>

      <div className="space-y-2">
        <SectionTitle icon={CreditCard}>{t("abo.subscribeRenew")}</SectionTitle>
        <SouscrireCard />
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Clock3}>{t("abo.pendingManual")}</SectionTitle>
        <TransactionsEnAttente />
      </div>

      <div className="space-y-2">
        <SectionTitle icon={History}>{t("abo.history")}</SectionTitle>
        {historiqueQuery.isPending && <LoadingState label={t("common.loading")} />}
        {historiqueQuery.isError && <ErrorState error={historiqueQuery.error} onRetry={historiqueQuery.refetch} />}
        {historiqueQuery.data && historiqueQuery.data.data.length === 0 && (
          <EmptyState icon={History}>{t("abo.historyEmpty")}</EmptyState>
        )}
        {historiqueQuery.data && historiqueQuery.data.data.length > 0 && (
          <ul className="space-y-2">
            {historiqueQuery.data.data.map((a) => (
              <li key={a.id}>
                <Card variant="outlined" className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">
                      {a.numero} — {a.formule.nom}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      {a.transactions
                        .map(
                          (trx) =>
                            `${moyenPaiementInfo(trx.moyenPaiement)?.label ?? trx.moyenPaiement} : ${STATUT_TRANSACTION_LABELS[trx.statut]}`,
                        )
                        .join(" · ")}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium ${STATUT_TONES[a.statutEffectif]}`}>
                    {STATUT_ABONNEMENT_LABELS[a.statutEffectif]}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
