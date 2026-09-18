import { useParams } from "react-router-dom";
import { ClipboardList, Shirt, Banknote, Wallet, Truck, FileText, Download } from "lucide-react";
import { useMaCommandeQuery, useGenererRecuMutation } from "./hooks.js";
import { recuPdfUrl } from "./api.js";
import { prioriteLabel, modeLabel } from "../commandes/constants.js";
import { CATEGORIES_VETEMENT } from "../modeles/constants.js";
import { LoadingState, ErrorState, GlobalFormError } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import CommandeStatutBadge from "../commandes/components/CommandeStatutBadge.jsx";
import PaiementStatutBadge from "../commandes/components/PaiementStatutBadge.jsx";

function categorieLabelLocal(value) {
  return CATEGORIES_VETEMENT.find((c) => c.value === value)?.label ?? value;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-neutral-500 text-xs mb-0.5">{label}</p>
      <p className="text-neutral-900 dark:text-neutral-100">{value || "—"}</p>
    </div>
  );
}

// Vue en LECTURE SEULE — l'équivalent client de CommandeDetailPage.jsx (côté
// ADMIN), sans aucune action de modification (transitions de statut,
// paiements, livraisons) : un USER consulte, il n'agit jamais directement
// sur les données métier (voir requireClient, backend/src/middlewares/auth.middleware.js).
// Seule exception, comme la proposition de nouvelle commande (voir
// ClientDemandeFormPage.jsx) : générer SON PROPRE reçu récapitulatif
// (GenererRecuButton plus bas) — ne crée qu'un document à partir de données
// déjà existantes, jamais une écriture métier.
export default function ClientCommandeDetailPage() {
  const { id } = useParams();
  const query = useMaCommandeQuery(id);

  if (query.isPending) return <LoadingState label="Chargement de la commande…" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const commande = query.data;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        icon={ClipboardList}
        title={commande.numero}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <CommandeStatutBadge statut={commande.statut} />
            <PaiementStatutBadge statut={commande.statutPaiement} />
            {prioriteLabel(commande.priorite)}
          </span>
        }
      />

      <div className="space-y-2">
        <SectionTitle icon={Shirt}>Détails</SectionTitle>
        <Card className="text-sm space-y-3">
          {commande.modele ? (
            <p className="font-medium text-neutral-900 dark:text-neutral-100">{commande.modele.nom}</p>
          ) : (
            <p className="text-neutral-500">Aucun modèle du catalogue associé — commande sur mesure directe.</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <InfoRow label="Type" value={categorieLabelLocal(commande.typeVetement)} />
            <InfoRow label="Couleur" value={commande.couleur} />
            <InfoRow label="Tissu" value={commande.tissu} />
            <InfoRow label="Date de commande" value={formatDate(commande.dateCommande)} />
            <InfoRow label="Livraison prévue" value={formatDate(commande.dateLivraisonPrevue)} />
          </div>
          {commande.description && (
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">Description</p>
              <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{commande.description}</p>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Banknote}>Finances</SectionTitle>
        <Card className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-center">
          <div>
            <p className="text-neutral-500 text-xs">Prix total</p>
            <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100 mt-0.5">{commande.prixTotal}</p>
          </div>
          <div>
            <p className="text-neutral-500 text-xs">Payé</p>
            <p className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400 mt-0.5">{commande.totalPaye}</p>
          </div>
          <div>
            <p className="text-neutral-500 text-xs">Reste à payer</p>
            <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100 mt-0.5">{commande.solde}</p>
          </div>
        </Card>
        {Number(commande.totalPaye) > 0 && <GenererRecuButton commandeId={commande.id} />}
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Wallet}>Paiements</SectionTitle>
        {commande.paiements.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucun paiement enregistré pour l'instant.</p>
        ) : (
          <div className="space-y-2">
            {commande.paiements.map((p) => (
              <Card key={p.id} variant="outlined" className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-500">
                  {formatDate(p.date)} — {modeLabel(p.mode)}
                </span>
                <span className="font-medium tabular-nums text-neutral-900 dark:text-neutral-100">{p.montant}</span>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Truck}>Livraisons</SectionTitle>
        {commande.livraisons.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucune livraison enregistrée pour l'instant.</p>
        ) : (
          <div className="space-y-2">
            {commande.livraisons.map((l) => (
              <Card key={l.id} variant="outlined" className="text-sm">
                <p className="text-neutral-900 dark:text-neutral-100">Livrée le {formatDate(l.dateLivraison)}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Voir le commentaire en tête de fichier — seule action d'écriture possible
// depuis l'espace client sur une commande, et seulement pour produire un
// document, jamais pour modifier quoi que ce soit. Même repli "un seul
// bouton, une carte de résultat" que InviterClientButton.jsx (côté ADMIN).
function GenererRecuButton({ commandeId }) {
  const mutation = useGenererRecuMutation(commandeId);

  if (mutation.data) {
    return (
      <Card variant="outlined" className="flex items-center justify-between gap-3 text-sm">
        <span className="text-green-700 dark:text-green-400">Reçu {mutation.data.numero} généré.</span>
        <Button as="a" href={recuPdfUrl(mutation.data.id)} target="_blank" rel="noreferrer" variant="secondary" size="sm" icon={Download}>
          Télécharger
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <GlobalFormError error={mutation.error} />
      <Button variant="secondary" size="sm" icon={FileText} loading={mutation.isPending} onClick={() => mutation.mutate()}>
        Générer un reçu
      </Button>
    </div>
  );
}
