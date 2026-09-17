import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import { useMesPaiementsQuery } from "./hooks.js";
import { modeLabel } from "../commandes/constants.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export default function ClientPaiementsPage() {
  const query = useMesPaiementsQuery();
  const data = query.data?.data ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={Wallet} title="Mes paiements" subtitle="Historique de vos encaissements, toutes commandes confondues." />

      {query.isPending && <LoadingState label="Chargement de vos paiements…" />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={Wallet}>Aucun paiement enregistré pour l'instant.</EmptyState>}

      {query.data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((p) => (
            <Card key={p.id} variant="outlined" className="flex items-center justify-between gap-3 text-sm">
              <div>
                <Link to={`/client/commandes/${p.commande.id}`} className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline">
                  {p.commande.numero}
                </Link>
                <p className="text-neutral-500 text-xs mt-0.5">
                  {formatDate(p.date)} — {modeLabel(p.mode)}
                </p>
              </div>
              <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">{p.montant}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
