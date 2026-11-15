import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ShoppingCart, Plus, Search, Eye } from "lucide-react";
import { useAchatsQuery } from "./hooks.js";
import { BadgeReception, BadgePaiement, BadgeAnnule } from "./Badges.jsx";
import { useDebouncedValue } from "../../hooks/useDebouncedValue.js";
import { useCan } from "../../hooks/usePermissions.js";
import { dateLocale } from "../commandes/constants.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import Pagination from "../../components/Pagination.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { inputClass } from "../../components/FormField.jsx";
import { useTranslation } from "../../i18n/index.js";

const PAGE_SIZE = 20;
const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString(dateLocale(), { year: "numeric", month: "short", day: "numeric" }) : "—");

export default function AchatsListPage() {
  const { t } = useTranslation();
  const can = useCan();
  const voirFinances = can("finances.voir");
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page") ?? "1");
  const vue = searchParams.get("vue") ?? "";
  const paiement = searchParams.get("paiement") ?? "";
  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const q = useDebouncedValue(qInput, 300);

  // « vue » regroupe les filtres utiles au quotidien : à recevoir, reçus, annulés.
  const filtres = { attendu: { reception: "attendu" }, recus: { reception: "complete" }, annules: { statut: "ANNULE" } }[vue] ?? {};
  const { data, isPending, isError, error, refetch, isFetching } = useAchatsQuery({ q, ...filtres, paiement: paiement || undefined, page, pageSize: PAGE_SIZE });

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
        icon={ShoppingCart}
        title={t("ach.title")}
        subtitle={t("ach.subtitle")}
        actions={
          can("achats.ecrire") && (
            <Button as={Link} to="/achats/nouveau" variant="primary" icon={Plus} data-testid="nouvel-achat">
              {t("ach.new")}
            </Button>
          )
        }
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            placeholder={t("ach.search")}
            value={qInput}
            onChange={(e) => {
              setQInput(e.target.value);
              updateParams({ q: e.target.value || undefined, page: undefined });
            }}
            className={`${inputClass} pl-9`}
          />
        </div>
        <select value={vue} onChange={(e) => updateParams({ vue: e.target.value, page: undefined })} className={`${inputClass} w-auto`} aria-label={t("ach.colReception")} data-testid="filtre-vue">
          <option value="">{t("ach.vueTous")}</option>
          <option value="attendu">{t("ach.vueAttendu")}</option>
          <option value="recus">{t("ach.vueRecus")}</option>
          <option value="annules">{t("ach.vueAnnules")}</option>
        </select>
        {voirFinances && (
          <select value={paiement} onChange={(e) => updateParams({ paiement: e.target.value, page: undefined })} className={`${inputClass} w-auto`} aria-label={t("ach.colPaiement")}>
            <option value="">{t("ach.paiementTous")}</option>
            <option value="paye">{t("ach.paiement.PAYE")}</option>
            <option value="nonpaye">{t("ach.paiement.NON_PAYE")}</option>
          </select>
        )}
      </div>

      {isPending && <LoadingState label={t("ach.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && data.data.length === 0 && <EmptyState icon={ShoppingCart}>{q || vue || paiement ? t("ach.emptyFiltered") : t("ach.emptyAll")}</EmptyState>}

      {data && data.data.length > 0 && (
        <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
          <Card variant="outlined" padded={false} className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-achats">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("ach.colNumero")}</th>
                  <th className="px-4 py-3 font-medium">{t("ach.colFournisseur")}</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">{t("ach.colAttendue")}</th>
                  {voirFinances && <th className="px-4 py-3 font-medium text-right">{t("ach.colTotal")}</th>}
                  <th className="px-4 py-3 font-medium">{t("ach.colReception")}</th>
                  {voirFinances && <th className="px-4 py-3 font-medium">{t("ach.colPaiement")}</th>}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((a) => (
                  <tr key={a.id} className="border-t border-neutral-100 dark:border-neutral-800" data-testid={`achat-${a.numero}`}>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{a.numero}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{a.fournisseur.nom}</td>
                    <td className="px-4 py-3 text-neutral-500 hidden sm:table-cell">{formatDate(a.dateAttendue)}</td>
                    {voirFinances && <td className="px-4 py-3 text-right tabular-nums">{a.montantTotal}</td>}
                    <td className="px-4 py-3">{a.statut === "ANNULE" ? <BadgeAnnule /> : <BadgeReception statut={a.statutReception} />}</td>
                    {voirFinances && <td className="px-4 py-3">{a.statut === "ANNULE" ? null : <BadgePaiement statut={a.statutPaiement} />}</td>}
                    <td className="px-4 py-3 text-right">
                      <Button as={Link} to={`/achats/${a.id}`} variant="ghost" size="sm" icon={Eye}>
                        {t("common.view")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={(p) => updateParams({ page: p })} />
        </div>
      )}
    </div>
  );
}
