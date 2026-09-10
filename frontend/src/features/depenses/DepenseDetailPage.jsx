import { useParams } from "react-router-dom";
import { Receipt, Paperclip } from "lucide-react";
import { useDepenseQuery, useAnnulerDepenseMutation } from "./hooks.js";
import { LoadingState, ErrorState } from "../../components/QueryState.jsx";
import AnnulerControl from "../../components/AnnulerControl.jsx";
import AnnuleBadge from "../../components/AnnuleBadge.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

// Page volontairement sans "Modifier" : le backend n'expose aucun PATCH pour
// une dépense (événement financier historique). Seule une ANNULATION
// LOGIQUE est possible (ci-dessous) — jamais de modification/suppression de
// la ligne d'origine.
export default function DepenseDetailPage() {
  const { id } = useParams();
  const depenseQuery = useDepenseQuery(id);
  const annulerMutation = useAnnulerDepenseMutation(id);

  if (depenseQuery.isPending) return <LoadingState label="Chargement de la dépense…" />;
  if (depenseQuery.isError) return <ErrorState error={depenseQuery.error} onRetry={depenseQuery.refetch} />;

  const depense = depenseQuery.data;

  return (
    <div className="max-w-xl space-y-6">
      <PageHeader
        icon={Receipt}
        title={depense.categorie}
        subtitle={depense.annuleAt ? `Motif de l'annulation : ${depense.annuleMotif}` : undefined}
        actions={
          depense.annuleAt ? (
            <AnnuleBadge />
          ) : (
            <AnnulerControl
              onAnnuler={(motif) => annulerMutation.mutate(motif)}
              isPending={annulerMutation.isPending}
              error={annulerMutation.error}
            />
          )
        }
      />

      <Card className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <InfoRow label="Montant" value={depense.montant} />
        <InfoRow label="Date" value={formatDate(depense.date)} />
        {depense.justificatifUrl && (
          <div className="sm:col-span-2">
            <p className="text-neutral-500 text-xs mb-0.5">Justificatif</p>
            <a
              href={depense.justificatifUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline break-all hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
            >
              <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
              {depense.justificatifUrl}
            </a>
          </div>
        )}
        {depense.description && (
          <div className="sm:col-span-2">
            <p className="text-neutral-500 text-xs mb-0.5">Description</p>
            <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{depense.description}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-neutral-500 text-xs mb-0.5">{label}</p>
      <p className="text-neutral-900 dark:text-neutral-100 tabular-nums">{value || "—"}</p>
    </div>
  );
}
