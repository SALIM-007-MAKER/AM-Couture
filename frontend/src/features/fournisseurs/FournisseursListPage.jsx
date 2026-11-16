import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Store, Plus, Search, Eye } from "lucide-react";
import { useFournisseursQuery } from "./hooks.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { useCan } from "../../hooks/usePermissions.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import Pagination from "../../components/Pagination.jsx";
import StatutBadge from "../../components/StatutBadge.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { inputClass } from "../../components/FormField.jsx";
import { useTranslation } from "../../i18n/index.js";

const PAGE_SIZE = 20;

export default function FournisseursListPage() {
  const { t } = useTranslation();
  const can = useCan();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const archived = searchParams.get("archived") ?? "false";
  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const q = useDebouncedValue(qInput, 300);
  const { data, isPending, isError, error, refetch, isFetching } = useFournisseursQuery({ q, archived, page, pageSize: PAGE_SIZE });

  function updateParams(patch) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "" || value === null) next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Store}
        title={t("fou.title")}
        subtitle={t("fou.subtitle")}
        actions={
          can("fournisseurs.ecrire") && (
            <Button as={Link} to="/fournisseurs/nouveau" variant="primary" icon={Plus} data-testid="nouveau-fournisseur">
              {t("fou.new")}
            </Button>
          )
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            placeholder={t("fou.search")}
            value={qInput}
            onChange={(e) => {
              setQInput(e.target.value);
              updateParams({ q: e.target.value || undefined, page: undefined });
            }}
            className={`${inputClass} pl-9`}
          />
        </div>
        <select value={archived} onChange={(e) => updateParams({ archived: e.target.value, page: undefined })} className={`${inputClass} w-auto`} aria-label={t("commandes.colStatut")}>
          <option value="false">{t("common.activeFilter")}</option>
          <option value="true">{t("common.archivedFilter")}</option>
          <option value="all">{t("common.all")}</option>
        </select>
      </div>

      {isPending && <LoadingState label={t("fou.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && data.data.length === 0 && <EmptyState icon={Store}>{q || archived !== "false" ? t("fou.emptyFiltered") : t("fou.emptyAll")}</EmptyState>}

      {data && data.data.length > 0 && (
        <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
          <Card variant="outlined" padded={false} className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-fournisseurs">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("fou.colName")}</th>
                  <th className="px-4 py-3 font-medium">{t("fou.colContact")}</th>
                  <th className="px-4 py-3 font-medium">{t("fou.colPhone")}</th>
                  <th className="px-4 py-3 font-medium">{t("commandes.colStatut")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((f) => (
                  <tr key={f.id} className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors" data-testid={`fournisseur-${f.nom}`}>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{f.nom}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{f.contact ?? "—"}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{f.telephone ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatutBadge archivedAt={f.archivedAt} activeLabel={t("common.active")} archivedLabel={t("common.archived")} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button as={Link} to={`/fournisseurs/${f.id}`} variant="ghost" size="sm" icon={Eye}>
                        {t("common.view")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <ul className="md:hidden space-y-2">
            {data.data.map((f) => (
              <li key={f.id}>
                <Link to={`/fournisseurs/${f.id}`}>
                  <Card variant="outlined" className="space-y-1 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">{f.nom}</span>
                      <StatutBadge archivedAt={f.archivedAt} activeLabel={t("common.active")} archivedLabel={t("common.archived")} />
                    </div>
                    <p className="text-neutral-600 dark:text-neutral-400 text-sm">{[f.contact, f.telephone].filter(Boolean).join(" — ") || "—"}</p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={(p) => updateParams({ page: p })} />
        </div>
      )}
    </div>
  );
}
