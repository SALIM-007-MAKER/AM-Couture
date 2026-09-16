import { Link, useParams } from "react-router-dom";
import { User, Pencil, Ruler, Plus, ClipboardList } from "lucide-react";
import {
  useClienteQuery,
  useArchiveClienteMutation,
  useRestoreClienteMutation,
  useClienteTotauxQuery,
} from "./hooks.js";
import { SEXE_OPTIONS } from "./constants.js";
import { LoadingState, ErrorState } from "../../components/QueryState.jsx";
import StatutBadge from "../../components/StatutBadge.jsx";
import ArchiveRestoreControl from "../../components/ArchiveRestoreControl.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import MesuresHistory from "./components/MesuresHistory.jsx";
import ClienteCommandesHistory from "./components/ClienteCommandesHistory.jsx";
import RappelButton from "./components/RappelButton.jsx";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export default function ClienteDetailPage() {
  const { id } = useParams();
  const clienteQuery = useClienteQuery(id);
  const archiveMutation = useArchiveClienteMutation(id);
  const restoreMutation = useRestoreClienteMutation(id);

  // isPending (pas isLoading) : sous TanStack Query v5, isLoading ne couvre
  // que isPending && isFetching, et peut redevenir false alors que `data`
  // est encore undefined — accéder à cliente.nom plus bas plante alors toute
  // la page (aucune Error Boundary) au lieu d'afficher l'état de chargement.
  // isPending, lui, reste vrai tant que data === undefined (invariant
  // garanti par la lib), quel que soit fetchStatus. Bug réel trouvé en
  // testant une fiche via un id invalide (voir rapport du module Clientes).
  if (clienteQuery.isPending) return <LoadingState label="Chargement de la fiche…" />;
  if (clienteQuery.isError) return <ErrorState error={clienteQuery.error} onRetry={clienteQuery.refetch} />;

  const cliente = clienteQuery.data;

  return <ClienteDetailContent id={id} cliente={cliente} archiveMutation={archiveMutation} restoreMutation={restoreMutation} />;
}

function ClienteDetailContent({ id, cliente, archiveMutation, restoreMutation }) {
  // isPending/isError volontairement peu mis en avant : un total agrégé
  // reste un complément d'information, jamais bloquant pour le reste de la
  // fiche (même logique que le logo dans AppLayout.jsx) — l'historique
  // détaillé juste en dessous (ClienteCommandesHistory) reste la source de
  // vérité même si ce bloc n'a pas encore chargé.
  const totauxQuery = useClienteTotauxQuery(id);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={User}
        title={`${cliente.nom} ${cliente.prenom}`}
        subtitle={<StatutBadge archivedAt={cliente.archivedAt} activeLabel="Actif" archivedLabel="Archivé" />}
        actions={
          <>
            {!cliente.archivedAt && (
              <Button as={Link} to={`/clientes/${id}/modifier`} variant="secondary" icon={Pencil}>
                Modifier
              </Button>
            )}
            <ArchiveRestoreControl
              archived={Boolean(cliente.archivedAt)}
              onArchive={(onSuccess) => archiveMutation.mutate(undefined, { onSuccess })}
              onRestore={(onSuccess) => restoreMutation.mutate(undefined, { onSuccess })}
              isPending={archiveMutation.isPending || restoreMutation.isPending}
              error={archiveMutation.error || restoreMutation.error}
              confirmQuestion={cliente.archivedAt ? "Restaurer ce client ?" : "Archiver ce client ?"}
            />
          </>
        }
      />

      <div className="space-y-2">
        <SectionTitle icon={User}>Informations</SectionTitle>
        <Card className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <InfoRow label="Téléphone" value={cliente.telephone} />
          <InfoRow label="Téléphone 2" value={cliente.telephone2} />
          <InfoRow label="Sexe" value={SEXE_OPTIONS.find((o) => o.value === cliente.sexe)?.label} />
          <InfoRow label="Adresse" value={cliente.adresse} />
          <InfoRow label="Client depuis" value={formatDate(cliente.createdAt)} />
          {cliente.notes && (
            <div className="sm:col-span-2">
              <p className="text-neutral-500 text-xs mb-0.5">Notes</p>
              <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{cliente.notes}</p>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-2">
        <SectionTitle
          icon={ClipboardList}
          actions={
            !cliente.archivedAt && (
              <div className="flex flex-wrap gap-2 justify-end">
                {totauxQuery.data && <RappelButton cliente={cliente} totalRestant={totauxQuery.data.totalRestant} />}
                <Button as={Link} to={`/commandes/nouvelle?clienteId=${id}`} variant="secondary" size="sm" icon={Plus}>
                  Nouvelle commande
                </Button>
              </div>
            )
          }
        >
          Commandes
        </SectionTitle>
        {totauxQuery.data && (
          <Card className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-center">
            <div>
              <p className="text-neutral-500 text-xs">Total commandes</p>
              <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100 mt-0.5">
                {totauxQuery.data.totalCommandes}
              </p>
            </div>
            <div>
              <p className="text-neutral-500 text-xs">Total payé</p>
              <p className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400 mt-0.5">
                {totauxQuery.data.totalPaye}
              </p>
            </div>
            <div>
              <p className="text-neutral-500 text-xs">Total restant</p>
              <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100 mt-0.5">
                {totauxQuery.data.totalRestant}
              </p>
            </div>
          </Card>
        )}
        <ClienteCommandesHistory clienteId={id} />
      </div>

      <div className="space-y-2">
        <SectionTitle
          icon={Ruler}
          actions={
            !cliente.archivedAt && (
              <Button as={Link} to={`/clientes/${id}/mesures/nouvelle`} variant="secondary" size="sm" icon={Plus}>
                Nouvelle mesure
              </Button>
            )
          }
        >
          Mesures
        </SectionTitle>
        <MesuresHistory clienteId={id} />
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
