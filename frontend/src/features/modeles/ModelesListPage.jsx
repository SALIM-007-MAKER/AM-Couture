import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Shirt, Plus, Search, Eye } from "lucide-react";
import { useModelesQuery } from "./hooks.js";
import { CATEGORIES_VETEMENT, categorieLabel } from "./constants.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import Pagination from "../../components/Pagination.jsx";
import StatutBadge from "../../components/StatutBadge.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { inputClass } from "../../components/FormField.jsx";
import { useTranslation } from "../../i18n/index.js";

const PAGE_SIZE = 20;

export default function ModelesListPage() {
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

  const params = { q, archived, categorie: categorie || undefined, page, pageSize: PAGE_SIZE };
  const { data, isPending, isError, error, refetch, isFetching } = useModelesQuery(params);

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
        icon={Shirt}
        title={t("nav.models")}
        subtitle={t("modele.list.subtitle")}
        actions={
          <Button as={Link} to="/modeles/nouveau" variant="primary" icon={Plus}>
            {t("modele.list.new")}
          </Button>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            placeholder={t("modele.list.search")}
            value={qInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
        <select
          value={categorie}
          onChange={(e) => updateParams({ categorie: e.target.value, page: undefined })}
          className={`${inputClass} w-auto`}
        >
          <option value="">{t("modele.list.allCategories")}</option>
          {CATEGORIES_VETEMENT.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
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

      {isPending && <LoadingState label={t("modele.list.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState icon={Shirt}>
          {q || categorie ? t("modele.list.emptyFiltered") : t("modele.list.emptyAll")}
        </EmptyState>
      )}

      {data && data.data.length > 0 && (
        <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
          {/* Tableau (desktop/tablette) */}
          <Card variant="outlined" padded={false} className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("modele.list.colName")}</th>
                  <th className="px-4 py-3 font-medium">{t("modele.list.colCategory")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("modele.list.colPrice")}</th>
                  <th className="px-4 py-3 font-medium">{t("commandes.colStatut")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((modele) => (
                  <tr
                    key={modele.id}
                    className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{modele.nom}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {categorieLabel(modele.categorie)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                      {modele.prixIndicatif ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatutBadge archivedAt={modele.archivedAt} activeLabel={t("common.active")} archivedLabel={t("common.archived")} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button as={Link} to={`/modeles/${modele.id}`} variant="ghost" size="sm" icon={Eye}>
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
            {data.data.map((modele) => (
              <li key={modele.id}>
                <Link to={`/modeles/${modele.id}`}>
                  <Card variant="outlined" className="space-y-1 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">{modele.nom}</span>
                      <StatutBadge archivedAt={modele.archivedAt} activeLabel={t("common.active")} archivedLabel={t("common.archived")} />
                    </div>
                    <p className="text-neutral-600 dark:text-neutral-400 text-sm">
                      {categorieLabel(modele.categorie)}
                      {modele.prixIndicatif ? ` — ${modele.prixIndicatif}` : ""}
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
