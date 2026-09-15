import { Link, useParams } from "react-router-dom";
import { Package, Pencil, History, AlertTriangle } from "lucide-react";
import { useArticleStockQuery, useArchiveArticleStockMutation, useRestoreArticleStockMutation } from "./hooks.js";
import { uniteLabel } from "./constants.js";
import { useTranslation } from "../../i18n/index.js";
import MouvementsSection from "./components/MouvementsSection.jsx";
import { LoadingState, ErrorState } from "../../components/QueryState.jsx";
import StatutBadge from "../../components/StatutBadge.jsx";
import ArchiveRestoreControl from "../../components/ArchiveRestoreControl.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";

// enAlerte : même condition que GET /api/stock/alertes (quantite <=
// seuilAlerte) — voir StockListPage.jsx pour la même logique côté liste.
function enAlerte(article) {
  return article.seuilAlerte != null && Number(article.quantite) <= Number(article.seuilAlerte);
}

export default function ArticleStockDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const articleQuery = useArticleStockQuery(id);
  const archiveMutation = useArchiveArticleStockMutation(id);
  const restoreMutation = useRestoreArticleStockMutation(id);

  if (articleQuery.isPending) return <LoadingState label={t("common.loading")} />;
  if (articleQuery.isError) return <ErrorState error={articleQuery.error} onRetry={articleQuery.refetch} />;

  const article = articleQuery.data;
  const alerte = enAlerte(article);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        icon={Package}
        title={article.nom}
        subtitle={
          <span className="flex items-center gap-2">
            <StatutBadge archivedAt={article.archivedAt} activeLabel={t("common.active")} archivedLabel={t("common.archived")} />
            {article.categorie || t("stock.sansCategorie")}
          </span>
        }
        actions={
          <>
            {!article.archivedAt && (
              <Button as={Link} to={`/stock/${id}/modifier`} variant="secondary" icon={Pencil}>
                {t("common.edit")}
              </Button>
            )}
            <ArchiveRestoreControl
              archived={Boolean(article.archivedAt)}
              onArchive={(onSuccess) => archiveMutation.mutate(undefined, { onSuccess })}
              onRestore={(onSuccess) => restoreMutation.mutate(undefined, { onSuccess })}
              isPending={archiveMutation.isPending || restoreMutation.isPending}
              error={archiveMutation.error || restoreMutation.error}
              confirmQuestion={article.archivedAt ? t("stock.confirmRestaurer") : t("stock.confirmArchiver")}
            />
          </>
        }
      />

      {alerte && (
        <Card variant="outlined" className="flex items-center gap-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {t("stock.detailAlert", { seuil: `${article.seuilAlerte} ${uniteLabel(article.unite)}` })}
          </p>
        </Card>
      )}

      <Card className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <InfoRow
          label={t("stock.quantiteEnStock")}
          value={`${article.quantite} ${uniteLabel(article.unite)}`}
          emphasize
          tone={alerte ? "danger" : "neutral"}
        />
        <InfoRow label={t("stock.seuilAlerte")} value={article.seuilAlerte ? `${article.seuilAlerte} ${uniteLabel(article.unite)}` : null} />
        <InfoRow label={t("stock.prixUnitaire")} value={article.prixUnitaire} />
        <InfoRow label={t("stock.unite")} value={uniteLabel(article.unite)} />
        {article.notes && (
          <div className="sm:col-span-2">
            <p className="text-neutral-500 text-xs mb-0.5">{t("stock.notes")}</p>
            <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{article.notes}</p>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <SectionTitle icon={History}>{t("stock.movements")}</SectionTitle>
        <MouvementsSection articleId={id} unite={article.unite} archived={Boolean(article.archivedAt)} />
      </div>
    </div>
  );
}

function InfoRow({ label, value, emphasize = false, tone = "neutral" }) {
  const toneClass = tone === "danger" ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-neutral-100";
  return (
    <div>
      <p className="text-neutral-500 text-xs mb-0.5">{label}</p>
      <p className={`tabular-nums ${emphasize ? "text-lg font-semibold" : ""} ${toneClass}`}>{value || "—"}</p>
    </div>
  );
}
