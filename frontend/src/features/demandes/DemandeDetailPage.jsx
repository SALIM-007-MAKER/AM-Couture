import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Inbox, User, ClipboardList, Check, X, Plus } from "lucide-react";
import { useDemandeQuery, useAccepterDemandeMutation, useRefuserDemandeMutation } from "./hooks.js";
import { useCommandesQuery } from "../commandes/hooks.js";
import StatutDemandeBadge from "./components/StatutDemandeBadge.jsx";
import { LoadingState, ErrorState, GlobalFormError } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { Field, inputClass } from "../../components/FormField.jsx";
import { useTranslation } from "../../i18n/index.js";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export default function DemandeDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const query = useDemandeQuery(id);

  if (query.isPending) return <LoadingState label={t("demandesAdmin.detailLoading")} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  return <DemandeDetailContent id={id} demande={query.data} />;
}

function DemandeDetailContent({ id, demande }) {
  const { t } = useTranslation();
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        icon={Inbox}
        title={`${demande.cliente.nom} ${demande.cliente.prenom}`}
        subtitle={<StatutDemandeBadge statut={demande.statut} />}
        actions={
          <Button as={Link} to={`/clientes/${demande.cliente.id}`} variant="secondary" size="sm" icon={User}>
            {t("demandesAdmin.voirFicheClient")}
          </Button>
        }
      />

      <div className="space-y-2">
        <SectionTitle icon={ClipboardList}>{t("demandesAdmin.sectionDemande")}</SectionTitle>
        <Card className="space-y-3 text-sm">
          <p className="text-neutral-500 text-xs">{t("demandesAdmin.envoyeeLe", { date: formatDate(demande.createdAt) })}</p>
          {demande.modele && (
            <p>
              <span className="text-neutral-500">{t("demandesAdmin.modeleSouhaiteLabel")}</span>
              <Link to={`/modeles/${demande.modele.id}`} className="text-neutral-900 dark:text-neutral-100 hover:underline">
                {demande.modele.nom}
              </Link>
            </p>
          )}
          <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">
            {demande.description || t("client.aucuneDescription")}
          </p>
          <p className="text-neutral-500">
            {t("demandesAdmin.telephoneLabel")}
            <span className="text-neutral-900 dark:text-neutral-100">{demande.cliente.telephone}</span>
          </p>
        </Card>
      </div>

      {demande.statut === "EN_ATTENTE" && <TraiterDemande id={id} clienteId={demande.cliente.id} />}

      {demande.statut === "ACCEPTEE" && demande.commande && (
        <Card variant="outlined" className="text-sm">
          {t("demandesAdmin.lieeCommande")}{" "}
          <Link to={`/commandes/${demande.commande.id}`} className="font-medium hover:underline">
            {demande.commande.numero}
          </Link>
          .
        </Card>
      )}

      {demande.statut === "REFUSEE" && (
        <Card variant="outlined" className="text-sm text-neutral-600 dark:text-neutral-400">
          {demande.motifRefus ? t("demandesAdmin.refuseeMotif", { motif: demande.motifRefus }) : `${t("demandesAdmin.refusee")}.`}
        </Card>
      )}
    </div>
  );
}

// Un USER propose, l'ADMIN décide : accepter ne crée jamais de Commande ici,
// seulement un lien vers une commande DÉJÀ créée via le flux normal (voir
// commentaire de accepterDemandeSchema, backend/src/schemas/demandeCommande.schema.js)
// — si elle n'existe pas encore, l'ADMIN la crée d'abord via "Nouvelle commande"
// ci-dessous puis revient l'accepter.
function TraiterDemande({ id, clienteId }) {
  const { t } = useTranslation();
  const [commandeId, setCommandeId] = useState("");
  const [motifRefus, setMotifRefus] = useState("");
  const [refusing, setRefusing] = useState(false);
  const commandesQuery = useCommandesQuery({ clienteId, pageSize: 100 });
  const accepterMutation = useAccepterDemandeMutation(id);
  const refuserMutation = useRefuserDemandeMutation(id);

  const commandes = commandesQuery.data?.data ?? [];

  function handleAccepter(e) {
    e.preventDefault();
    accepterMutation.mutate(commandeId);
  }

  function handleRefuser(e) {
    e.preventDefault();
    refuserMutation.mutate(motifRefus || undefined);
  }

  return (
    <div className="space-y-2">
      <SectionTitle icon={Check}>{t("demandesAdmin.sectionTraiter")}</SectionTitle>
      <Card className="space-y-4">
        <GlobalFormError error={accepterMutation.error} />
        <form onSubmit={handleAccepter} className="space-y-3">
          <Field label={t("demandesAdmin.lierCommandeLabel")} hint={t("demandesAdmin.lierCommandeHint")}>
            <div className="flex gap-2">
              <select value={commandeId} onChange={(e) => setCommandeId(e.target.value)} className={inputClass}>
                <option value="">
                  {commandesQuery.isPending ? t("demandesAdmin.chargementCommandes") : t("demandesAdmin.choisirCommande")}
                </option>
                {commandes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} — {c.modele ? c.modele.nom : t("demandesAdmin.sansModele")}
                  </option>
                ))}
              </select>
              <Button as={Link} to={`/commandes/nouvelle?clienteId=${clienteId}`} variant="secondary" icon={Plus}>
                {t("demandesAdmin.nouvelle")}
              </Button>
            </div>
          </Field>
          <Button type="submit" variant="primary" icon={Check} disabled={!commandeId} loading={accepterMutation.isPending}>
            {t("demandesAdmin.accepterEtLier")}
          </Button>
        </form>

        <div className="border-t border-neutral-200 dark:border-neutral-800 pt-4">
          <GlobalFormError error={refuserMutation.error} />
          {refusing ? (
            <form onSubmit={handleRefuser} className="space-y-3">
              <Field label={t("demandesAdmin.motifRefusOptionnel")}>
                <textarea value={motifRefus} onChange={(e) => setMotifRefus(e.target.value)} rows={2} className={inputClass} />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant="danger" icon={X} loading={refuserMutation.isPending}>
                  {t("demandesAdmin.confirmerRefus")}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setRefusing(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="danger-ghost" icon={X} onClick={() => setRefusing(true)}>
              {t("demandesAdmin.refuserCetteDemande")}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
