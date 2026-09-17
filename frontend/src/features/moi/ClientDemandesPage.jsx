import { Link } from "react-router-dom";
import { Inbox, Plus } from "lucide-react";
import { useMesDemandesQuery } from "./hooks.js";
import StatutDemandeBadge from "../demandes/components/StatutDemandeBadge.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export default function ClientDemandesPage() {
  const query = useMesDemandesQuery();
  const data = query.data?.data ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        icon={Inbox}
        title="Mes demandes"
        subtitle="Vos propositions de nouvelle commande envoyées à l'atelier."
        actions={
          <Button as={Link} to="/client/demandes/nouvelle" variant="primary" icon={Plus}>
            Nouvelle demande
          </Button>
        }
      />

      {query.isPending && <LoadingState label="Chargement de vos demandes…" />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={Inbox}>Vous n'avez encore envoyé aucune demande.</EmptyState>}

      {query.data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((demande) => (
            <Card key={demande.id} variant="outlined" className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <StatutDemandeBadge statut={demande.statut} />
                <span className="text-xs text-neutral-400">{formatDate(demande.createdAt)}</span>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {demande.modele ? `Modèle souhaité : ${demande.modele.nom}. ` : ""}
                {demande.description || "Aucune description fournie."}
              </p>
              {demande.statut === "ACCEPTEE" && demande.commande && (
                <Link to={`/client/commandes/${demande.commande.id}`} className="text-sm font-medium hover:underline">
                  Voir la commande {demande.commande.numero} →
                </Link>
              )}
              {demande.statut === "REFUSEE" && demande.motifRefus && (
                <p className="text-sm text-neutral-500">Motif : {demande.motifRefus}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
