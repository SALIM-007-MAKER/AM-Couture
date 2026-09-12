import { useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { useCommandesQuery } from "../../commandes/hooks.js";
import CommandeStatutBadge from "../../commandes/components/CommandeStatutBadge.jsx";
import PaiementStatutBadge from "../../commandes/components/PaiementStatutBadge.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../../components/QueryState.jsx";
import Pagination from "../../../components/Pagination.jsx";
import Card from "../../../components/Card.jsx";

const PAGE_SIZE = 5;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

/** Historique des commandes d'un client — modèle choisi et statut de
 * paiement pour chacune, l'essentiel demandé pour la fiche client : "ce
 * client a-t-il déjà commandé, quel modèle, a-t-il tout payé ?" */
export default function ClienteCommandesHistory({ clienteId }) {
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error, refetch } = useCommandesQuery({ clienteId, page, pageSize: PAGE_SIZE });

  // isPending, pas isLoading — voir le commentaire détaillé dans
  // ClienteDetailPage.jsx (data.data plus bas planterait sinon sur un faux
  // négatif de isLoading sous TanStack Query v5).
  if (isPending) return <LoadingState label="Chargement des commandes…" />;
  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  if (data.data.length === 0)
    return <EmptyState icon={ClipboardList}>Aucune commande pour ce client.</EmptyState>;

  return (
    <div className="space-y-3">
      {data.data.map((commande) => {
        const soldeRestant = Number(commande.solde) > 0;
        return (
          <Link key={commande.id} to={`/commandes/${commande.id}`}>
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
      <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />
    </div>
  );
}
