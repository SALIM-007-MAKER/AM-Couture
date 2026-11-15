import { useState } from "react";
import { Link } from "react-router-dom";
import { UserCog, Plus, Eye } from "lucide-react";
import { useEmployesQuery } from "./hooks.js";
import { formatDateFr } from "../abonnement/constants.js";
import { LoadingState, ErrorState, EmptyState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Pagination from "../../components/Pagination.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { inputClass } from "../../components/FormField.jsx";
import { useTranslation } from "../../i18n/index.js";

export function BadgeActif({ actif }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        actif ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400" : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
      }`}
    >
      {actif ? t("emp.active") : t("emp.inactive")}
    </span>
  );
}

// Liste des employés de l'atelier — réservée au PDG (le serveur refuse toute autre session).
export default function EmployesPage() {
  const { t } = useTranslation();
  const [actif, setActif] = useState("true");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, isPending, isError, error, refetch } = useEmployesQuery({ actif, q: q.trim() || undefined, page, pageSize: 20 });
  const lignes = data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        icon={UserCog}
        title={t("emp.title")}
        subtitle={t("emp.subtitle")}
        actions={
          <Button as={Link} to="/employes/nouveau" variant="primary" icon={Plus} data-testid="nouvel-employe">
            {t("emp.new")}
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder={t("emp.search")}
          aria-label={t("emp.search")}
          className={`${inputClass} w-full sm:w-72`}
        />
        <select
          value={actif}
          onChange={(e) => {
            setActif(e.target.value);
            setPage(1);
          }}
          className={`${inputClass} w-auto`}
          aria-label={t("emp.colStatus")}
          data-testid="filtre-actif"
        >
          <option value="true">{t("emp.filterActive")}</option>
          <option value="false">{t("emp.filterInactive")}</option>
          <option value="all">{t("emp.filterAll")}</option>
        </select>
      </div>

      {isPending && <LoadingState label={t("emp.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && lignes.length === 0 && <EmptyState icon={UserCog}>{q || actif !== "true" ? t("emp.emptyFiltered") : t("emp.empty")}</EmptyState>}

      {lignes.length > 0 && (
        <Card variant="outlined" padded={false} className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-employes">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">{t("emp.colName")}</th>
                <th className="px-4 py-3 font-medium">{t("emp.colIdentifiant")}</th>
                <th className="px-4 py-3 font-medium">{t("emp.colPoste")}</th>
                <th className="px-4 py-3 font-medium">{t("emp.colStatus")}</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">{t("emp.colLastLogin")}</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">{t("emp.colPermissions")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {lignes.map((e) => (
                <tr key={e.id} className="border-t border-neutral-100 dark:border-neutral-800" data-testid={`employe-${e.identifiant}`}>
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                    {e.prenom} {e.nom}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{e.identifiant}</td>
                  <td className="px-4 py-3">{e.poste ? t(`emp.postes.${e.poste}`) : "—"}</td>
                  <td className="px-4 py-3">
                    <BadgeActif actif={e.actif} />
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-neutral-500">
                    {e.derniereConnexionAt ? formatDateFr(e.derniereConnexionAt) : t("emp.never")}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-neutral-500">{t("emp.permissionsCount", { nombre: e.permissions.length })}</td>
                  <td className="px-4 py-3 text-right">
                    <Button as={Link} to={`/employes/${e.id}`} variant="ghost" size="sm" icon={Eye}>
                      {t("emp.manage")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {data && <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onChange={setPage} />}
    </div>
  );
}
