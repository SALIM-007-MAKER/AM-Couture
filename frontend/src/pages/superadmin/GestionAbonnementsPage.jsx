import { Link } from "react-router-dom";
import { CreditCard, Building2 } from "lucide-react";
import { useAteliersAbonnementsQuery } from "../../features/ateliers/hooks.js";
import EtatAbonnementBadge from "../../features/ateliers/components/EtatAbonnementBadge.jsx";
import { formatDateAbonnement } from "../../features/ateliers/dates.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import { useTranslation } from "../../i18n/index.js";

function dateFinLigne(atelier) {
  if (atelier.statut === "ESSAI" && atelier.essai) return formatDateAbonnement(atelier.essai.trialEndsAt);
  return formatDateAbonnement(atelier.abonnement?.dateExpiration);
}

// Vue d'ensemble : qui est en essai, actif, expiré ou en attente. L'activation
// se fait atelier par atelier, depuis la fiche de l'atelier (section
// « Abonnement ») — aucun paiement en ligne n'existe pour l'instant.
export default function GestionAbonnementsPage() {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useAteliersAbonnementsQuery();

  return (
    <div className="space-y-5">
      <PageHeader icon={CreditCard} title={t("saSub.overview.title")} subtitle={t("saSub.overview.subtitle")} />

      {isPending && <LoadingState label={t("saSub.overview.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && data.length === 0 && <EmptyState icon={CreditCard}>{t("saSub.overview.empty")}</EmptyState>}

      {data && data.length > 0 && (
        <Card variant="outlined" padded={false} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("saSub.overview.colWorkshop")}</th>
                <th className="px-4 py-3 font-medium">{t("saSub.overview.colStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("saSub.overview.colPlan")}</th>
                <th className="px-4 py-3 font-medium">{t("saSub.overview.colExpires")}</th>
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
                        <span className="text-xs text-red-600 dark:text-red-400">{t("saSub.overview.suspended")}</span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <EtatAbonnementBadge statut={atelier.statut} />
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{atelier.abonnement?.planNom ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {dateFinLigne(atelier)}
                    {atelier.statut === "ESSAI" && (
                      <span className="ml-1 text-xs text-neutral-400">{t("saSub.overview.trialMark")}</span>
                    )}
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
