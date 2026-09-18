import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { useMesCommandesQuery } from "./hooks.js";
import CommandeStatutBadge from "../commandes/components/CommandeStatutBadge.jsx";
import PaiementStatutBadge from "../commandes/components/PaiementStatutBadge.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import { useTranslation } from "../../i18n/index.js";
import { useLocaleStore } from "../../stores/localeStore.js";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export default function ClientCommandesListPage() {
  const { t } = useTranslation();
  const query = useMesCommandesQuery();
  const data = query.data?.data ?? [];

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader icon={ClipboardList} title={t("client.commandesTitle")} subtitle={t("client.commandesSubtitle")} />

      {query.isPending && <LoadingState label={t("client.commandesLoading")} />}
      {query.isError && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.data && data.length === 0 && <EmptyState icon={ClipboardList}>{t("client.commandesEmpty")}</EmptyState>}

      {query.data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((commande) => {
            const soldeRestant = Number(commande.solde) > 0;
            return (
              <Link key={commande.id} to={`/client/commandes/${commande.id}`}>
                <Card variant="outlined" className="space-y-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">{commande.numero}</p>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <CommandeStatutBadge statut={commande.statut} />
                      <PaiementStatutBadge statut={commande.statutPaiement} />
                    </div>
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {commande.modele ? commande.modele.nom : t("client.commandeSansModele")}
                    {t("client.commandeLivraisonPrevueLe")}
                    {formatDate(commande.dateLivraisonPrevue)}
                  </p>
                  <div className="flex items-center justify-between gap-3 text-sm pt-1 border-t border-neutral-100 dark:border-neutral-800">
                    <span className="text-neutral-500">
                      {t("client.commandePaye")} <span className="text-green-600 dark:text-green-400 font-medium tabular-nums">{commande.totalPaye}</span>
                      {" / "}
                      <span className="tabular-nums">{commande.prixTotal}</span>
                    </span>
                    <span className={`font-medium tabular-nums ${soldeRestant ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                      {soldeRestant ? t("client.commandeReste", { solde: commande.solde }) : t("client.commandePayeIntegralement")}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
