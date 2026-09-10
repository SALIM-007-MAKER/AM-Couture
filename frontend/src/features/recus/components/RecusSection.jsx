import { FileText, Receipt, Download } from "lucide-react";
import { useCreateRecapitulatifMutation } from "../hooks.js";
import { recuPdfUrl } from "../api.js";
import { EmptyState, GlobalFormError } from "../../../components/QueryState.jsx";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

// Sans en-tête propre : englobé par une SectionTitle "Reçus" fournie par
// CommandeDetailPage.jsx. `recus` : liste déjà chargée par CommandeDetailPage
// (une seule requête, partagée avec PaiementsSection) — pas de requête
// supplémentaire ici.
export default function RecusSection({ commandeId, recus, isLoading }) {
  const mutation = useCreateRecapitulatifMutation(commandeId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button type="button" variant="secondary" size="sm" icon={FileText} loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Émettre un reçu récapitulatif
        </Button>
      </div>
      <GlobalFormError error={mutation.error} />

      {!isLoading && recus.length === 0 && (
        <EmptyState icon={Receipt}>Aucun reçu émis pour cette commande.</EmptyState>
      )}
      {recus.length > 0 && (
        <ul className="space-y-2">
          {recus.map((recu) => (
            <li key={recu.id}>
              <Card variant="outlined" className="flex items-center justify-between">
                <div>
                  <p className="text-neutral-900 dark:text-neutral-100">{recu.numero}</p>
                  <p className="text-neutral-500 text-sm">
                    {formatDate(recu.createdAt)} — {recu.paiementId ? "lié à un paiement" : "récapitulatif"} —{" "}
                    {recu.montantPaye}
                  </p>
                </div>
                <Button as="a" href={recuPdfUrl(recu.id)} target="_blank" rel="noreferrer" variant="ghost" size="sm" icon={Download}>
                  PDF
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
