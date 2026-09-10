import { Link, useParams } from "react-router-dom";
import { ClipboardList, Pencil, User, Shirt, Ruler, Banknote, Wallet, Truck, FileText } from "lucide-react";
import { useCommandeQuery } from "./hooks.js";
import { prioriteLabel } from "./constants.js";
import { CATEGORIES_VETEMENT } from "../modeles/constants.js";
import { MESURE_FIELDS } from "../clientes/constants.js";
import { useDerniereMesureQuery } from "../clientes/hooks.js";
import { LoadingState, ErrorState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import CommandeStatutBadge from "./components/CommandeStatutBadge.jsx";
import StatutTransitions from "./components/StatutTransitions.jsx";
import PaiementsSection from "./components/PaiementsSection.jsx";
import LivraisonSection from "./components/LivraisonSection.jsx";
import RecusSection from "../recus/components/RecusSection.jsx";
import { useRecusQuery } from "../recus/hooks.js";
import { ApiError } from "../../lib/apiClient.js";

function categorieLabelLocal(value) {
  return CATEGORIES_VETEMENT.find((c) => c.value === value)?.label ?? value;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export default function CommandeDetailPage() {
  const { id } = useParams();
  const commandeQuery = useCommandeQuery(id);

  if (commandeQuery.isPending) return <LoadingState label="Chargement de la commande…" />;
  if (commandeQuery.isError) return <ErrorState error={commandeQuery.error} onRetry={commandeQuery.refetch} />;

  const commande = commandeQuery.data;

  return <CommandeDetailContent id={id} commande={commande} />;
}

function CommandeDetailContent({ id, commande }) {
  // Chargée une seule fois ici, partagée entre PaiementsSection (lien "voir
  // le reçu" par ligne) et RecusSection (liste + émission récapitulative) —
  // pas de requête dupliquée.
  const recusQuery = useRecusQuery(id);
  const recus = recusQuery.data?.data ?? [];

  // Dernière prise de mesures de la cliente, affichée directement sur la
  // fiche commande (demande de refonte) — endpoint déjà existant côté
  // backend (GET /clientes/:id/mesures/derniere), rien à ajouter côté API.
  const mesureQuery = useDerniereMesureQuery(commande.cliente.id);
  const mesureNotFound =
    mesureQuery.isError && mesureQuery.error instanceof ApiError && mesureQuery.error.status === 404;
  const mesure = mesureQuery.data;
  const populatedMesures = mesure ? MESURE_FIELDS.filter((f) => mesure[f.name] != null) : [];

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={ClipboardList}
        title={commande.numero}
        subtitle={
          <span className="flex items-center gap-2">
            <CommandeStatutBadge statut={commande.statut} />
            {prioriteLabel(commande.priorite)}
          </span>
        }
        actions={
          <Button as={Link} to={`/commandes/${id}/modifier`} variant="secondary" icon={Pencil}>
            Modifier
          </Button>
        }
      />

      <StatutTransitions commandeId={id} statutActuel={commande.statut} />

      <div className="space-y-2">
        <SectionTitle icon={User}>Client</SectionTitle>
        <Card>
          <Link
            to={`/clientes/${commande.cliente.id}`}
            className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline"
          >
            {commande.cliente.nom} {commande.cliente.prenom}
          </Link>
          <p className="text-neutral-500 text-sm mt-0.5">{commande.cliente.telephone}</p>
        </Card>
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Shirt}>Modèle</SectionTitle>
        <Card className="text-sm space-y-3">
          {commande.modele ? (
            <Link
              to={`/modeles/${commande.modele.id}`}
              className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline"
            >
              {commande.modele.nom}
            </Link>
          ) : (
            <p className="text-neutral-500">Aucun modèle du catalogue associé — commande sur mesure directe.</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
            <InfoRow label="Type" value={categorieLabelLocal(commande.typeVetement)} />
            <InfoRow label="Couleur" value={commande.couleur} />
            <InfoRow label="Tissu" value={commande.tissu} />
            <InfoRow label="Quantité" value={commande.quantite} />
            <InfoRow label="Date de commande" value={formatDate(commande.dateCommande)} />
            <InfoRow label="Livraison prévue" value={formatDate(commande.dateLivraisonPrevue)} />
          </div>
          {commande.description && (
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">Description</p>
              <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{commande.description}</p>
            </div>
          )}
          {commande.observations && (
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">Observations</p>
              <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{commande.observations}</p>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-2">
        <SectionTitle
          icon={Ruler}
          actions={
            <Button as={Link} to={`/clientes/${commande.cliente.id}`} variant="ghost" size="sm">
              Historique complet
            </Button>
          }
        >
          Mesures du client
        </SectionTitle>
        <Card className="text-sm">
          {mesureQuery.isPending ? (
            <LoadingState label="Chargement des mesures…" />
          ) : mesureNotFound || populatedMesures.length === 0 ? (
            <p className="text-neutral-500">Aucune mesure enregistrée pour ce client.</p>
          ) : (
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              {populatedMesures.map((f) => (
                <div key={f.name}>
                  <dt className="text-neutral-500 text-xs">{f.label}</dt>
                  <dd className="text-neutral-900 dark:text-neutral-100 tabular-nums">{mesure[f.name]} cm</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Banknote}>Finances</SectionTitle>
        <Card className="grid grid-cols-3 gap-3 text-sm text-center">
          <div>
            <p className="text-neutral-500 text-xs">Prix total</p>
            <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100 mt-0.5">
              {commande.prixTotal}
            </p>
          </div>
          <div>
            <p className="text-neutral-500 text-xs">Encaissé</p>
            <p className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400 mt-0.5">
              {commande.totalPaye}
            </p>
          </div>
          <div>
            <p className="text-neutral-500 text-xs">Reste à payer</p>
            <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100 mt-0.5">
              {commande.solde}
            </p>
          </div>
        </Card>
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Truck}>Livraison</SectionTitle>
        <LivraisonSection
          commandeId={id}
          statutActuel={commande.statut}
          livraisons={commande.livraisons}
          solde={commande.solde}
        />
      </div>

      <div className="space-y-2">
        <SectionTitle icon={Wallet}>Paiements</SectionTitle>
        <PaiementsSection commandeId={id} statutActuel={commande.statut} recus={recus} />
      </div>

      <div className="space-y-2">
        <SectionTitle icon={FileText}>Reçus</SectionTitle>
        <RecusSection commandeId={id} recus={recus} isLoading={recusQuery.isPending} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-neutral-500 text-xs mb-0.5">{label}</p>
      <p className="text-neutral-900 dark:text-neutral-100">{value || "—"}</p>
    </div>
  );
}
