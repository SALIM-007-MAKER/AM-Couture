import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Package, Plus, Search, Eye, Download, AlertTriangle } from "lucide-react";
import { useArticlesStockQuery, useAlertesStockQuery } from "./hooks.js";
import { stockExportUrl } from "./api.js";
import { uniteLabel } from "./constants.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { useTranslation } from "../../i18n/index.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import Pagination from "../../components/Pagination.jsx";
import StatutBadge from "../../components/StatutBadge.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { inputClass } from "../../components/FormField.jsx";

const PAGE_SIZE = 20;

// Rouge dès que la quantité descend au niveau du seuil d'alerte (ou en
// dessous) — même condition que GET /api/stock/alertes côté backend
// (quantite <= seuilAlerte), jamais recalculée différemment ici.
function enAlerte(article) {
  return article.seuilAlerte != null && Number(article.quantite) <= Number(article.seuilAlerte);
}

function AlertesBanner() {
  const { t } = useTranslation();
  const query = useAlertesStockQuery();
  if (!query.data || query.data.data.length === 0) return null;
  return (
    <Card variant="outlined" className="flex items-start gap-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
      <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <p className="text-sm text-amber-800 dark:text-amber-300">
        {t("stock.alertBanner", { nombre: query.data.data.length, noms: query.data.data.map((a) => a.nom).join(", ") })}
      </p>
    </Card>
  );
}

export default function StockListPage() {
  const { t } = useTranslation();
  const ARCHIVED_OPTIONS = [
    { value: "false", label: t("common.activeFilter") },
    { value: "true", label: t("common.archivedFilter") },
    { value: "all", label: t("common.all") },
  ];
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const archived = searchParams.get("archived") ?? "false";
  const categorie = searchParams.get("categorie") ?? "";
  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const q = useDebouncedValue(qInput, 300);

  const filters = { q: q || undefined, categorie: categorie || undefined, archived };
  const params = { ...filters, page, pageSize: PAGE_SIZE };
  const { data, isPending, isError, error, refetch, isFetching } = useArticlesStockQuery(params);

  function updateParams(patch) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "" || value === null) next.delete(key);
      else next.set(key, String(value));
    }
    // replace: true — évite d'empiler une entrée d'historique par frappe
    // (voir ClientesListPage.jsx pour l'explication complète).
    setSearchParams(next, { replace: true });
  }

  function handleSearchChange(value) {
    setQInput(value);
    updateParams({ q: value || undefined, page: undefined });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Package}
        title={t("stock.title")}
        subtitle={t("stock.subtitle")}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              as="a"
              href={stockExportUrl(filters)}
              variant="secondary"
              icon={Download}
              title={t("stock.exportTitle")}
            >
              {t("common.exportCsv")}
            </Button>
            <Button as={Link} to="/stock/nouveau" variant="primary" icon={Plus}>
              {t("stock.newArticle")}
            </Button>
          </div>
        }
      />

      <AlertesBanner />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            placeholder={t("stock.searchPlaceholder")}
            value={qInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
        <select
          value={archived}
          onChange={(e) => updateParams({ archived: e.target.value, page: undefined })}
          className={`${inputClass} w-auto`}
        >
          {ARCHIVED_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isPending && <LoadingState label={t("common.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState icon={Package}>
          {q || categorie ? t("stock.emptyFiltered") : t("stock.emptyAll")}
        </EmptyState>
      )}

      {data && data.data.length > 0 && (
        <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
          {/* Tableau (desktop/tablette) */}
          <Card variant="outlined" padded={false} className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("stock.colNom")}</th>
                  <th className="px-4 py-3 font-medium">{t("stock.colCategorie")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("stock.colQuantite")}</th>
                  <th className="px-4 py-3 font-medium">{t("stock.colStatut")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((article) => (
                  <tr
                    key={article.id}
                    className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{article.nom}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{article.categorie || "—"}</td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${
                        enAlerte(article)
                          ? "text-red-600 dark:text-red-400 font-medium"
                          : "text-neutral-900 dark:text-neutral-100"
                      }`}
                    >
                      {article.quantite} {uniteLabel(article.unite)}
                    </td>
                    <td className="px-4 py-3">
                      <StatutBadge archivedAt={article.archivedAt} activeLabel={t("common.active")} archivedLabel={t("common.archived")} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button as={Link} to={`/stock/${article.id}`} variant="ghost" size="sm" icon={Eye}>
                        {t("common.view")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Cartes (mobile) */}
          <ul className="md:hidden space-y-2">
            {data.data.map((article) => (
              <li key={article.id}>
                <Link to={`/stock/${article.id}`}>
                  <Card variant="outlined" className="space-y-1 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">{article.nom}</span>
                      <StatutBadge archivedAt={article.archivedAt} activeLabel={t("common.active")} archivedLabel={t("common.archived")} />
                    </div>
                    <p className="text-neutral-600 dark:text-neutral-400 text-sm">
                      {article.categorie || "—"} —{" "}
                      <span className={enAlerte(article) ? "text-red-600 dark:text-red-400 font-medium" : ""}>
                        {article.quantite} {uniteLabel(article.unite)}
                      </span>
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            onChange={(p) => updateParams({ page: p })}
          />
        </div>
      )}
    </div>
  );
}
