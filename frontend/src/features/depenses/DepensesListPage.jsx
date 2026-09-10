import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Receipt, Plus, Search, Eye, PieChart } from "lucide-react";
import { useDepensesQuery, useDepensesStatsQuery } from "./hooks.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import Pagination from "../../components/Pagination.jsx";
import AnnuleBadge from "../../components/AnnuleBadge.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { inputClass } from "../../components/FormField.jsx";

const PAGE_SIZE = 20;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

function StatsPanel({ filters }) {
  const { data, isPending, isError } = useDepensesStatsQuery(filters);
  if (isPending || isError || !data) return null;

  return (
    <Card className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
      <div>
        <p className="text-neutral-500 text-xs">Total</p>
        <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100 mt-0.5">{data.total}</p>
      </div>
      <div>
        <p className="text-neutral-500 text-xs">Nombre de dépenses</p>
        <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100 mt-0.5">{data.nombre}</p>
      </div>
      {data.parCategorie.length > 0 && (
        <div className="col-span-2 sm:col-span-1">
          <p className="flex items-center gap-1.5 text-neutral-500 text-xs mb-1">
            <PieChart className="size-3.5" aria-hidden="true" />
            Par catégorie
          </p>
          <ul className="space-y-0.5">
            {data.parCategorie.map((c) => (
              <li key={c.categorie} className="flex justify-between gap-2 text-neutral-700 dark:text-neutral-300">
                <span>{c.categorie}</span>
                <span className="tabular-nums">{c.total}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export default function DepensesListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const categorie = searchParams.get("categorie") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const q = useDebouncedValue(qInput, 300);

  const filters = {
    q: q || undefined,
    categorie: categorie || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const params = { ...filters, page, pageSize: PAGE_SIZE };
  const { data, isPending, isError, error, refetch, isFetching } = useDepensesQuery(params);

  function updateParams(patch) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "" || value === null) next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next);
  }

  function handleSearchChange(value) {
    setQInput(value);
    updateParams({ q: value || undefined, page: undefined });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Receipt}
        title="Dépenses"
        subtitle="Suivi des dépenses de l'atelier (achats de tissu, fournitures, charges...)."
        actions={
          <Button as={Link} to="/depenses/nouvelle" variant="primary" icon={Plus}>
            Nouvelle dépense
          </Button>
        }
      />

      <StatsPanel filters={filters} />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="Rechercher (catégorie, description)…"
            value={qInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
        <input
          type="text"
          placeholder="Catégorie exacte"
          value={categorie}
          onChange={(e) => updateParams({ categorie: e.target.value, page: undefined })}
          className={`${inputClass} w-40`}
        />
        <label className="flex items-center gap-1.5 text-sm text-neutral-500">
          Du
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => updateParams({ dateFrom: e.target.value, page: undefined })}
            className={`${inputClass} w-auto py-1.5`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-neutral-500">
          Au
          <input
            type="date"
            value={dateTo}
            onChange={(e) => updateParams({ dateTo: e.target.value, page: undefined })}
            className={`${inputClass} w-auto py-1.5`}
          />
        </label>
      </div>

      {isPending && <LoadingState label="Chargement des dépenses…" />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState icon={Receipt}>
          {q || categorie || dateFrom || dateTo
            ? "Aucune dépense ne correspond à ces critères."
            : "Aucune dépense pour l'instant."}
        </EmptyState>
      )}

      {data && data.data.length > 0 && (
        <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
          {/* Tableau (desktop/tablette) */}
          <Card variant="outlined" padded={false} className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Catégorie</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium text-right">Montant</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((depense) => (
                  <tr
                    key={depense.id}
                    className={`border-t border-neutral-100 dark:border-neutral-800 transition-colors ${
                      depense.annuleAt ? "opacity-60" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                    }`}
                  >
                    <td className="px-4 py-3 text-neutral-500">{formatDate(depense.date)}</td>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                      <div className="flex items-center gap-2">
                        {depense.categorie}
                        {depense.annuleAt && <AnnuleBadge />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 max-w-xs truncate">
                      {depense.description || "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-neutral-100">
                      {depense.montant}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button as={Link} to={`/depenses/${depense.id}`} variant="ghost" size="sm" icon={Eye}>
                        Voir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Cartes (mobile) */}
          <ul className="md:hidden space-y-2">
            {data.data.map((depense) => (
              <li key={depense.id}>
                <Link to={`/depenses/${depense.id}`}>
                  <Card
                    variant="outlined"
                    className={`space-y-1 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors ${depense.annuleAt ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                        {depense.categorie}
                        {depense.annuleAt && <AnnuleBadge />}
                      </span>
                      <span className="tabular-nums text-neutral-900 dark:text-neutral-100">{depense.montant}</span>
                    </div>
                    <p className="text-neutral-600 dark:text-neutral-400 text-sm">{formatDate(depense.date)}</p>
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
