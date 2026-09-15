import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ClipboardList, Plus, Search, Eye, Download } from "lucide-react";
import { useCommandesQuery } from "./hooks.js";
import { commandesExportUrl } from "./api.js";
import { STATUTS_COMMANDE, PRIORITES, prioriteLabel } from "./constants.js";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { useTranslation } from "../../i18n/index.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import Pagination from "../../components/Pagination.jsx";
import CommandeStatutBadge from "./components/CommandeStatutBadge.jsx";
import PaiementStatutBadge from "./components/PaiementStatutBadge.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { inputClass } from "../../components/FormField.jsx";

const PAGE_SIZE = 20;

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "numeric" });
}

export default function CommandesListPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const statut = searchParams.get("statut") ?? "";
  const priorite = searchParams.get("priorite") ?? "";
  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const q = useDebouncedValue(qInput, 300);

  const params = { q, statut: statut || undefined, priorite: priorite || undefined, page, pageSize: PAGE_SIZE };
  const { data, isPending, isError, error, refetch, isFetching } = useCommandesQuery(params);

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
        icon={ClipboardList}
        title={t("commandes.title")}
        subtitle={t("commandes.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <Button
              as="a"
              href={commandesExportUrl({ q, statut: statut || undefined, priorite: priorite || undefined })}
              variant="secondary"
              icon={Download}
              title={t("commandes.exportTitle")}
            >
              {t("common.exportCsv")}
            </Button>
            <Button as={Link} to="/commandes/nouvelle" variant="primary" icon={Plus}>
              {t("commandes.newCommande")}
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            placeholder={t("commandes.searchPlaceholder")}
            value={qInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className={`${inputClass} pl-9`}
          />
        </div>
        <select
          value={statut}
          onChange={(e) => updateParams({ statut: e.target.value, page: undefined })}
          className={`${inputClass} w-auto`}
        >
          <option value="">{t("commandes.allStatuts")}</option>
          {STATUTS_COMMANDE.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={priorite}
          onChange={(e) => updateParams({ priorite: e.target.value, page: undefined })}
          className={`${inputClass} w-auto`}
        >
          <option value="">{t("commandes.allPriorites")}</option>
          {PRIORITES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {isPending && <LoadingState label={t("common.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}

      {data && data.data.length === 0 && (
        <EmptyState icon={ClipboardList}>
          {q || statut || priorite ? t("commandes.emptyFiltered") : t("commandes.emptyAll")}
        </EmptyState>
      )}

      {data && data.data.length > 0 && (
        <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
          {/* Tableau (desktop/tablette) */}
          <Card variant="outlined" padded={false} className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("commandes.colNumero")}</th>
                  <th className="px-4 py-3 font-medium">{t("commandes.colClient")}</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">{t("commandes.colModele")}</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">{t("commandes.colLivraisonPrevue")}</th>
                  <th className="px-4 py-3 font-medium hidden md:table-cell">{t("commandes.colPriorite")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("commandes.colSolde")}</th>
                  <th className="px-4 py-3 font-medium">{t("commandes.colPaiement")}</th>
                  <th className="px-4 py-3 font-medium">{t("commandes.colStatut")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((commande) => (
                  <tr
                    key={commande.id}
                    className="border-t border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{commande.numero}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {commande.cliente.nom} {commande.cliente.prenom}
                    </td>
                    <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell">{commande.modele?.nom ?? "—"}</td>
                    <td className="px-4 py-3 text-neutral-500 hidden sm:table-cell">
                      {formatDate(commande.dateLivraisonPrevue)}
                    </td>
                    <td className="px-4 py-3 text-neutral-500 hidden md:table-cell">
                      {prioriteLabel(commande.priorite)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-900 dark:text-neutral-100">{commande.solde}</td>
                    <td className="px-4 py-3">
                      <PaiementStatutBadge statut={commande.statutPaiement} />
                    </td>
                    <td className="px-4 py-3">
                      <CommandeStatutBadge statut={commande.statut} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button as={Link} to={`/commandes/${commande.id}`} variant="ghost" size="sm" icon={Eye}>
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
            {data.data.map((commande) => (
              <li key={commande.id}>
                <Link to={`/commandes/${commande.id}`}>
                  <Card variant="outlined" className="space-y-1 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">{commande.numero}</span>
                      <CommandeStatutBadge statut={commande.statut} />
                    </div>
                    <p className="text-neutral-600 dark:text-neutral-400 text-sm">
                      {commande.cliente.nom} {commande.cliente.prenom} — {formatDate(commande.dateLivraisonPrevue)}
                    </p>
                    <div className="flex items-center justify-between">
                      <p className="text-neutral-600 dark:text-neutral-400 text-sm">
                        {t("commandes.mobileSolde", { solde: commande.solde })}
                      </p>
                      <PaiementStatutBadge statut={commande.statutPaiement} />
                    </div>
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
