import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Users, Plus, Search, Eye, Download } from "lucide-react";
import { useClientesQuery } from "./hooks.js";
import { clientesExportUrl } from "./api.js";
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

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

export default function ClientesListPage() {
  const { t } = useTranslation();
  const ARCHIVED_OPTIONS = [
    { value: "false", label: t("common.activeFilter") },
    { value: "true", label: t("common.archivedFilter") },
    { value: "all", label: t("common.all") },
  ];
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const archived = searchParams.get("archived") ?? "false";
  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const q = useDebouncedValue(qInput, 300);

  const params = { q, archived, page, pageSize: PAGE_SIZE };
  // isPending (pas isLoading, voir ClienteDetailPage.jsx) : ici aucun
  // risque de crash (tout est déjà gardé par `data &&`), mais isPending
  // reflète correctement "aucune donnée encore reçue" pour cet affichage.
  const { data, isPending, isError, error, refetch, isFetching } = useClientesQuery(params);

  function updateParams(patch) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "" || value === null) next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next);
  }

  // La recherche (debounce) déclenche une nouvelle requête dès que `q`
  // change ; on remet toujours la pagination à 1 dans ce cas pour éviter
  // d'atterrir sur une page qui n'existe plus pour les nouveaux résultats.
  function handleSearchChange(value) {
    setQInput(value);
    updateParams({ q: value || undefined, page: undefined });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Users}
        title={t("clientes.title")}
        subtitle={t("clientes.subtitle")}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              as="a"
              href={clientesExportUrl({ q: q || undefined, archived })}
              variant="secondary"
              icon={Download}
              title={t("clientes.exportTitle")}
            >
              {t("common.exportCsv")}
            </Button>
            <Button as={Link} to="/clientes/nouvelle" variant="primary" icon={Plus}>
              {t("clientes.newCliente")}
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            placeholder={t("clientes.searchPlaceholder")}
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
        <EmptyState icon={Users}>
          {q ? t("clientes.emptyFiltered") : t("clientes.emptyAll")}
        </EmptyState>
      )}

      {data && data.data.length > 0 && (
        <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
          {/* Tableau (desktop/tablette) */}
          <Card variant="outlined" padded={false} className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("clientes.colClient")}</th>
                  <th className="px-4 py-3 font-medium">{t("clientes.colTelephone")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("clientes.colCommandes")}</th>
                  <th className="px-4 py-3 font-medium">{t("clientes.colDerniereActivite")}</th>
                  <th className="px-4 py-3 font-medium">{t("clientes.colStatut")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((cliente) => (
                  <tr
                    key={cliente.id}
                    className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                      {cliente.nom} {cliente.prenom}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{cliente.telephone}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">
                      {cliente.nombreCommandes}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{formatDate(cliente.derniereActivite)}</td>
                    <td className="px-4 py-3">
                      <StatutBadge archivedAt={cliente.archivedAt} activeLabel={t("common.active")} archivedLabel={t("common.archived")} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button as={Link} to={`/clientes/${cliente.id}`} variant="ghost" size="sm" icon={Eye}>
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
            {data.data.map((cliente) => (
              <li key={cliente.id}>
                <Link to={`/clientes/${cliente.id}`}>
                  <Card variant="outlined" className="space-y-1 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">
                        {cliente.nom} {cliente.prenom}
                      </span>
                      <StatutBadge archivedAt={cliente.archivedAt} activeLabel={t("common.active")} archivedLabel={t("common.archived")} />
                    </div>
                    <p className="text-neutral-600 dark:text-neutral-400 text-sm">{cliente.telephone}</p>
                    <p className="text-neutral-500 text-xs">
                      {t("clientes.mobileMeta", { nombre: cliente.nombreCommandes, date: formatDate(cliente.derniereActivite) })}
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
