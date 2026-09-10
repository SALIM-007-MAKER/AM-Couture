import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FileText, Search, Download } from "lucide-react";
import { useRecusGlobalQuery } from "./hooks.js";
import { recuPdfUrl } from "./api.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import Pagination from "../../components/Pagination.jsx";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";

const PAGE_SIZE = 20;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

// Page de consultation uniquement : un reçu se crée depuis la fiche Commande
// (récapitulatif ou lié à un paiement précis) — ici, on le retrouve
// rapidement dans son contexte (cliente, commande) et on le télécharge.
export default function RecusListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const q = useDebouncedValue(qInput, 300);

  const params = { q: q || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, pageSize: PAGE_SIZE };
  const { data, isPending, isError, error, refetch, isFetching } = useRecusGlobalQuery(params);

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
      <PageHeader icon={FileText} title="Reçus" subtitle="Documents émis pour les paiements et récapitulatifs de commande." />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="Rechercher (numéro, commande, client)…"
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

      {isPending && <LoadingState label="Chargement des reçus…" />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState icon={FileText}>
          {q || dateFrom || dateTo ? "Aucun reçu ne correspond à ces critères." : "Aucun reçu émis pour l'instant."}
        </EmptyState>
      )}

      {data && data.data.length > 0 && (
        <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
          <Card variant="outlined" padded={false} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Numéro</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Commande</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium text-right">Montant</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((recu) => (
                  <tr key={recu.id} className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{recu.numero}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      <Link to={`/clientes/${recu.commande.cliente.id}`} className="hover:underline">
                        {recu.commande.cliente.nom} {recu.commande.cliente.prenom}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      <Link to={`/commandes/${recu.commande.id}`} className="hover:underline">
                        {recu.commande.numero}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{recu.paiementId ? "Paiement" : "Récapitulatif"}</td>
                    <td className="px-4 py-3 text-neutral-500">{formatDate(recu.createdAt)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-neutral-100">
                      {recu.montantPaye}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button as="a" href={recuPdfUrl(recu.id)} target="_blank" rel="noreferrer" variant="ghost" size="sm" icon={Download}>
                        PDF
                      </Button>
                    </td>
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
