import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { useMesCommandesQuery } from "./hooks.js";
import CommandeStatutBadge from "../commandes/components/CommandeStatutBadge.jsx";
import PaiementStatutBadge from "../commandes/components/PaiementStatutBadge.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export default function ClientCommandesListPage() {
  const query = useMesCommandesQuery();
  const data = query.data?.data ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={ClipboardList} title="Mes commandes" subtitle="Toutes vos commandes chez votre atelier." />

      {query.isPending && <LoadingState label="Chargement de vos commandes…" />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={ClipboardList}>Aucune commande pour l'instant.</EmptyState>}

      {query.data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((commande) => {
            const soldeRestant = Number(commande.solde) > 0;
            return (
              <Link key={commande.id} to={`/client/commandes/${commande.id}`}>
                <Card variant="outlined" className="space-y-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">{commande.numero}</p>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <CommandeStatutBadge statut={commande.statut} />
                      <PaiementStatutBadge statut={commande.statutPaiement} />
                    </div>
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {commande.modele ? commande.modele.nom : "Sur mesure (sans modèle du catalogue)"}
                    {" — livraison prévue le "}
                    {formatDate(commande.dateLivraisonPrevue)}
                  </p>
                  <div className="flex items-center justify-between gap-3 text-sm pt-1 border-t border-neutral-100 dark:border-neutral-800">
                    <span className="text-neutral-500">
                      Payé <span className="text-green-600 dark:text-green-400 font-medium tabular-nums">{commande.totalPaye}</span>
                      {" / "}
                      <span className="tabular-nums">{commande.prixTotal}</span>
                    </span>
                    <span className={`font-medium tabular-nums ${soldeRestant ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                      {soldeRestant ? `Reste ${commande.solde}` : "Payé intégralement"}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
