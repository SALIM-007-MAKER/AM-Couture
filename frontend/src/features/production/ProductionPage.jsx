import { Link } from "react-router-dom";
import { Hammer, Eye } from "lucide-react";
import { useProductionQuery } from "../commandes/hooks.js";
import { LoadingState, ErrorState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { useTranslation } from "../../i18n/index.js";

function Chiffre({ valeur, libelle, to, alerte, testid }) {
  return (
    <Link to={to} data-testid={testid}>
      <Card variant="outlined" className="text-center hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors">
        <p className={`text-2xl font-semibold tabular-nums ${alerte && valeur > 0 ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-neutral-100"}`}>{valeur}</p>
        <p className="text-sm text-neutral-500">{libelle}</p>
      </Card>
    </Link>
  );
}

// Tableau de bord de la production : charge par personne, commandes non affectées, retards. Aucun montant.
export default function ProductionPage() {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useProductionQuery();

  return (
    <div className="space-y-5">
      <PageHeader icon={Hammer} title={t("prod.title")} subtitle={t("prod.subtitle")} />
      {isPending && <LoadingState label={t("prod.loading")} />}
      {isError && <ErrorState error={error} onRetry={refetch} />}
      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Chiffre valeur={data.ouvertes} libelle={t("prod.ouvertes")} to="/commandes" testid="chiffre-ouvertes" />
            <Chiffre valeur={data.enRetard} libelle={t("prod.enRetard")} to="/commandes?enRetard=true" alerte testid="chiffre-retard" />
            <Chiffre valeur={data.nonAffectees} libelle={t("prod.nonAffectees")} to="/commandes?assigneA=aucun" testid="chiffre-non-affectees" />
          </div>
          <Card variant="outlined" padded={false} className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-charge">
              <thead className="text-left text-neutral-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("prod.colEmploye")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("prod.colOuvertes")}</th>
                  <th className="px-4 py-3 font-medium text-right">{t("prod.colRetard")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.employes.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-100 dark:border-neutral-800" data-testid={`charge-${p.identifiant}`}>
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">{`${p.prenom ?? ""} ${p.nom ?? ""}`.trim() || p.identifiant}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.ouvertes}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${p.enRetard > 0 ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>{p.enRetard}</td>
                    <td className="px-4 py-3 text-right">
                      <Button as={Link} to={`/commandes?assigneA=${p.id}`} variant="ghost" size="sm" icon={Eye}>
                        {t("prod.voirTravaux")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
