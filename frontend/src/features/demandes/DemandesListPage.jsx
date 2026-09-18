import { useState } from "react";
import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";
import { useDemandesQuery } from "./hooks.js";
import { STATUTS_DEMANDE } from "./constants.js";
import StatutDemandeBadge from "./components/StatutDemandeBadge.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import Pagination from "../../components/Pagination.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import { useTranslation } from "../../i18n/index.js";

const PAGE_SIZE = 20;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

// Un client USER propose (voir POST /api/moi/demandes), l'ADMIN décide ici —
// accepter LIE une commande déjà créée via le flux normal, jamais de
// création directe (voir DemandeDetailPage.jsx).
export default function DemandesListPage() {
  const { t } = useTranslation();
  const [statut, setStatut] = useState("");
  const [page, setPage] = useState(1);
  const query = useDemandesQuery({ statut: statut || undefined, page, pageSize: PAGE_SIZE });
  const data = query.data?.data ?? [];
  const filtres = [{ value: "", label: t("demandesAdmin.filterAll") }, ...STATUTS_DEMANDE];

  function changerFiltre(next) {
    setStatut(next);
    setPage(1);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader icon={Inbox} title={t("demandesAdmin.title")} subtitle={t("demandesAdmin.subtitle")} />

      <div className="flex gap-2 flex-wrap">
        {filtres.map((f) => (
          <Button key={f.value} variant={statut === f.value ? "primary" : "secondary"} size="sm" onClick={() => changerFiltre(f.value)}>
            {f.label}
          </Button>
        ))}
      </div>

      {query.isPending && <LoadingState label={t("demandesAdmin.loading")} />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={Inbox}>{t("demandesAdmin.empty")}</EmptyState>}

      {query.data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((demande) => (
            <Link key={demande.id} to={`/demandes/${demande.id}`}>
              <Card variant="outlined" className="space-y-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {demande.cliente.nom} {demande.cliente.prenom}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <StatutDemandeBadge statut={demande.statut} />
                    <span className="text-xs text-neutral-400">{formatDate(demande.createdAt)}</span>
                  </div>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
                  {demande.modele ? t("client.modeleSouhaite", { nom: demande.modele.nom }) : ""}
                  {demande.description || t("client.aucuneDescription")}
                </p>
              </Card>
            </Link>
          ))}
          <Pagination page={query.data.meta.page} totalPages={query.data.meta.totalPages} total={query.data.meta.total} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
