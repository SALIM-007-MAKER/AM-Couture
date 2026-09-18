import { Link } from "react-router-dom";
import { FileText, Download } from "lucide-react";
import { useMesRecusQuery } from "./hooks.js";
import { recuPdfUrl } from "./api.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export default function ClientRecusPage() {
  const query = useMesRecusQuery();
  const data = query.data?.data ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={FileText} title="Mes reçus" subtitle="Documents émis pour vos paiements et commandes." />

      {query.isPending && <LoadingState label="Chargement de vos reçus…" />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={FileText}>Aucun reçu pour l'instant.</EmptyState>}

      {query.data && data.length > 0 && (
        <div className="space-y-2">
          {data.map((recu) => (
            <Card key={recu.id} variant="outlined" className="flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium text-neutral-900 dark:text-neutral-100">{recu.numero}</p>
                <p className="text-neutral-500 text-xs mt-0.5">
                  {formatDate(recu.createdAt)} —{" "}
                  <Link to={`/client/commandes/${recu.commande.id}`} className="hover:underline">
                    {recu.commande.numero}
                  </Link>
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">{recu.montantPaye}</span>
                <Button as="a" href={recuPdfUrl(recu.id)} target="_blank" rel="noreferrer" variant="secondary" size="sm" icon={Download}>
                  PDF
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
