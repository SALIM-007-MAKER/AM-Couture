import { Link } from "react-router-dom";
import { Inbox, Plus } from "lucide-react";
import { useMesDemandesQuery } from "./hooks.js";
import StatutDemandeBadge from "../demandes/components/StatutDemandeBadge.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { useTranslation } from "../../i18n/index.js";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export default function ClientDemandesPage() {
  const { t } = useTranslation();
  const query = useMesDemandesQuery();
  const data = query.data?.data ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        icon={Inbox}
        title={t("client.demandesTitle")}
        subtitle={t("client.demandesSubtitle")}
        actions={
          <Button as={Link} to="/client/demandes/nouvelle" variant="primary" icon={Plus}>
            {t("client.nouvelleDemande")}
          </Button>
        }
      />

      {query.isPending && <LoadingState label={t("client.demandesLoading")} />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={Inbox}>{t("client.demandesEmpty")}</EmptyState>}

      {query.data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((demande) => (
            <Card key={demande.id} variant="outlined" className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <StatutDemandeBadge statut={demande.statut} />
                <span className="text-xs text-neutral-400">{formatDate(demande.createdAt)}</span>
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {demande.modele ? t("client.modeleSouhaite", { nom: demande.modele.nom }) : ""}
                {demande.description || t("client.aucuneDescription")}
              </p>
              {demande.statut === "ACCEPTEE" && demande.commande && (
                <Link to={`/client/commandes/${demande.commande.id}`} className="text-sm font-medium hover:underline">
                  {t("client.voirCommandeFleche", { numero: demande.commande.numero })}
                </Link>
              )}
              {demande.statut === "REFUSEE" && demande.motifRefus && (
                <p className="text-sm text-neutral-500">{t("client.motifRefus", { motif: demande.motifRefus })}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
