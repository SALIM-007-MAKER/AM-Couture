import { Link, useParams } from "react-router-dom";
import { Package, Pencil, History, AlertTriangle } from "lucide-react";
import { useArticleStockQuery, useArchiveArticleStockMutation, useRestoreArticleStockMutation } from "./hooks.js";
import { uniteLabel } from "./constants.js";
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
  const { id } = useParams();
  const articleQuery = useArticleStockQuery(id);
  const archiveMutation = useArchiveArticleStockMutation(id);
  const restoreMutation = useRestoreArticleStockMutation(id);

  if (articleQuery.isPending) return <LoadingState label="Chargement de l'article…" />;
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
            <StatutBadge archivedAt={article.archivedAt} activeLabel="Actif" archivedLabel="Archivé" />
            {article.categorie || "Sans catégorie"}
          </span>
        }
        actions={
          <>
            {!article.archivedAt && (
              <Button as={Link} to={`/stock/${id}/modifier`} variant="secondary" icon={Pencil}>
                Modifier
              </Button>
            )}
            <ArchiveRestoreControl
              archived={Boolean(article.archivedAt)}
              onArchive={(onSuccess) => archiveMutation.mutate(undefined, { onSuccess })}
              onRestore={(onSuccess) => restoreMutation.mutate(undefined, { onSuccess })}
              isPending={archiveMutation.isPending || restoreMutation.isPending}
              error={archiveMutation.error || restoreMutation.error}
              confirmQuestion={article.archivedAt ? "Restaurer cet article ?" : "Archiver cet article ?"}
            />
          </>
        }
      />

      {alerte && (
        <Card variant="outlined" className="flex items-center gap-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Quantité au niveau ou en dessous du seuil d'alerte ({article.seuilAlerte} {uniteLabel(article.unite)}).
          </p>
        </Card>
      )}

      <Card className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <InfoRow
          label="Quantité en stock"
          value={`${article.quantite} ${uniteLabel(article.unite)}`}
          emphasize
          tone={alerte ? "danger" : "neutral"}
        />
        <InfoRow label="Seuil d'alerte" value={article.seuilAlerte ? `${article.seuilAlerte} ${uniteLabel(article.unite)}` : null} />
        <InfoRow label="Prix unitaire" value={article.prixUnitaire} />
        <InfoRow label="Unité" value={uniteLabel(article.unite)} />
        {article.notes && (
          <div className="sm:col-span-2">
            <p className="text-neutral-500 text-xs mb-0.5">Notes</p>
            <p className="text-neutral-900 dark:text-neutral-100 whitespace-pre-wrap">{article.notes}</p>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <SectionTitle icon={History}>Mouvements</SectionTitle>
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
