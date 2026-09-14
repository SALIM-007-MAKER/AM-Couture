import { Link } from "react-router-dom";
import { CreditCard, Building2, AlertTriangle } from "lucide-react";
import { useAteliersAbonnementsQuery } from "../../features/ateliers/hooks.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";

const STATUT_LABELS = { EN_ATTENTE: "En attente", CONFIRME: "Confirmé", ANNULE: "Annulé" };
const STATUT_TONES = {
  EN_ATTENTE: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400",
  CONFIRME: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400",
  ANNULE: "bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400",
};

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

// Lecture seule — la souscription/le paiement d'un abonnement restent une
// action de l'ADMIN de l'atelier lui-même (voir features/abonnement côté
// ADMIN), jamais du SUPERADMIN : cette page sert uniquement à voir qui est à
// jour, en attente, ou sans abonnement actif sur la plateforme.
export default function GestionAbonnementsPage() {
  const { data, isPending, isError, error, refetch } = useAteliersAbonnementsQuery();

  return (
    <div className="space-y-5">
      <PageHeader
        icon={CreditCard}
        title="Abonnements"
        subtitle="Statut d'abonnement de chaque atelier de la plateforme (lecture seule)."
      />

      {isPending && <LoadingState label="Chargement des abonnements…" />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && data.length === 0 && <EmptyState icon={CreditCard}>Aucun atelier pour l'instant.</EmptyState>}

      {data && data.length > 0 && (
        <Card variant="outlined" padded={false} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Atelier</th>
                <th className="px-4 py-3 font-medium">Formule</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Expire le</th>
                <th className="px-4 py-3 font-medium text-right">Prix</th>
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
                        <span className="text-xs text-red-600 dark:text-red-400">(suspendu)</span>
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
                        {STATUT_LABELS[atelier.abonnement.statut]}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400 italic">Aucun</span>
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
