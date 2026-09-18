import { Link } from "react-router-dom";
import { CreditCard, Building2, AlertTriangle } from "lucide-react";
import { useAteliersAbonnementsQuery } from "../../features/ateliers/hooks.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import { useTranslation } from "../../i18n/index.js";
import { useLocaleStore } from "../../stores/localeStore.js";

const STATUT_LABEL_KEYS = {
  EN_ATTENTE: "sa.abonnements.statusPending",
  CONFIRME: "sa.abonnements.statusConfirmed",
  ANNULE: "sa.abonnements.statusCancelled",
};
const STATUT_TONES = {
  EN_ATTENTE: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400",
  CONFIRME: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400",
  ANNULE: "bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
};

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

// Lecture seule — la souscription/le paiement d'un abonnement restent une
// action de l'ADMIN de l'atelier lui-même (voir features/abonnement côté
// ADMIN), jamais du SUPERADMIN : cette page sert uniquement à voir qui est à
// jour, en attente, ou sans abonnement actif sur la plateforme.
export default function GestionAbonnementsPage() {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useAteliersAbonnementsQuery();

  return (
    <div className="space-y-5">
      <PageHeader
        icon={CreditCard}
        title={t("sa.abonnements.title")}
        subtitle={t("sa.abonnements.subtitle")}
      />

      {isPending && <LoadingState label={t("sa.abonnements.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && data.length === 0 && <EmptyState icon={CreditCard}>{t("sa.abonnements.empty")}</EmptyState>}

      {data && data.length > 0 && (
        <Card variant="outlined" padded={false} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("sa.abonnements.colWorkshop")}</th>
                <th className="px-4 py-3 font-medium">{t("sa.abonnements.colPlan")}</th>
                <th className="px-4 py-3 font-medium">{t("sa.abonnements.colStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("sa.abonnements.colExpires")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("sa.abonnements.colPrice")}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((atelier) => (
                <tr
                  key={atelier.id}
                  className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                    <Link to={`/ateliers/${atelier.id}`} className="flex items-center gap-2 hover:underline">
                      <Building2 className="size-3.5 text-neutral-400" aria-hidden="true" />
                      {atelier.nom}
                      {!atelier.actif && (
                        <span className="text-xs text-red-600 dark:text-red-400">{t("sa.abonnements.suspended")}</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {atelier.abonnement?.formule?.nom ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {atelier.abonnement ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUT_TONES[atelier.abonnement.statut]}`}
                      >
                        {t(STATUT_LABEL_KEYS[atelier.abonnement.statut])}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400 italic">{t("sa.abonnements.none")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    <span className="flex items-center gap-1.5">
                      {atelier.abonnement?.expire && <AlertTriangle className="size-3.5 text-red-500" aria-hidden="true" />}
                      {formatDate(atelier.abonnement?.dateExpiration)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-neutral-100">
                    {atelier.abonnement?.prix ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
