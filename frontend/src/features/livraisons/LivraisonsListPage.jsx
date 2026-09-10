import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Truck, Search } from "lucide-react";
import { useLivraisonsGlobalQuery } from "./hooks.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Pagination from "../../components/Pagination.jsx";
import AnnuleBadge from "../../components/AnnuleBadge.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";

const PAGE_SIZE = 20;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

// Page de consultation uniquement : une livraison se crée/s'annule depuis la
// fiche Commande (features/commandes/components/LivraisonSection.jsx), qui
// seule connaît le statut de la commande et le solde restant.
export default function LivraisonsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const q = useDebouncedValue(qInput, 300);

  const params = { q: q || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, pageSize: PAGE_SIZE };
  const { data, isPending, isError, error, refetch, isFetching } = useLivraisonsGlobalQuery(params);

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
    <div className="space-y-5 max-w-5xl">
      <PageHeader icon={Truck} title="Livraisons" subtitle="Historique des remises de commande, tous clients confondus." />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="Rechercher (commande, client)…"
            value={qInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-neutral-500">
          Du
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => updateParams({ dateFrom: e.target.value, page: undefined })}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-neutral-500">
          Au
          <input
            type="date"
            value={dateTo}
            onChange={(e) => updateParams({ dateTo: e.target.value, page: undefined })}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {isPending && <LoadingState label="Chargement des livraisons…" />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState icon={Truck}>
          {q || dateFrom || dateTo ? "Aucune livraison ne correspond à ces critères." : "Aucune livraison enregistrée."}
        </EmptyState>
      )}

      {data && data.data.length > 0 && (
        <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
          <Card variant="outlined" padded={false} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Commande</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium text-right">Solde au retrait</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((l) => (
                  <tr
                    key={l.id}
                    className={`border-t border-neutral-100 dark:border-neutral-800 transition-colors ${
                      l.annuleAt ? "opacity-60" : "hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                    }`}
                  >
                    <td className="px-4 py-3 text-neutral-500">{formatDate(l.dateLivraison)}</td>
                    <td className="px-4 py-3">
                      <Link to={`/commandes/${l.commande.id}`} className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline">
                        {l.commande.numero}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {l.commande.cliente.nom} {l.commande.cliente.prenom}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-neutral-100">{l.montantRestant}</td>
                    <td className="px-4 py-3 text-right">{l.annuleAt && <AnnuleBadge />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

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
