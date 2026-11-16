import { Link, useSearchParams } from "react-router-dom";
import { BarChart3, Users, AlertTriangle, Truck, Receipt, Percent, ArrowLeft } from "lucide-react";
import { useCan } from "../../hooks/usePermissions.js";
import { useTranslation } from "../../i18n/index.js";
import PeriodSelector from "../../components/PeriodSelector.jsx";
import { LoadingState, ErrorState } from "../../components/QueryState.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import SectionTitle from "../../components/SectionTitle.jsx";
import { statutLabel, prioriteLabel } from "../commandes/constants.js";
import { categorieLabel } from "../modeles/constants.js";
import { useProductionRapportQuery, useRetardsRapportQuery, useAchatsFournisseursQuery, useDepensesCategoriesQuery, useMargesQuery } from "./hooks.js";

// Rapports avancés (6.7) : consultatifs. Les sections « montants » ne sont demandées que si la personne a « finances.voir »
// (le serveur le revérifie : sans ce droit il répond 403).
const th = "text-left font-medium text-neutral-500 py-1.5 pr-3";
const td = "py-1.5 pr-3 tabular-nums";
const nomPersonne = (p) => [p?.prenom, p?.nom].filter(Boolean).join(" ") || p?.identifiant || "";

function Tableau({ entetes, children }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            {entetes.map((e) => (
              <th key={e} className={th}>
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </Card>
  );
}

function Etat({ query, children }) {
  const { t } = useTranslation();
  if (query.isPending) return <LoadingState label={t("common.loading")} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  return children(query.data);
}

function Production({ period }) {
  const { t } = useTranslation();
  const query = useProductionRapportQuery(period);
  return (
    <Etat query={query}>
      {(d) => (
        <div className="space-y-2" data-testid="ra-production">
          <Tableau entetes={[t("ra.colEmploye"), t("ra.colOuvertes"), t("ra.colRetard"), t("ra.colLivrees"), t("ra.colALHeure")]}>
            {d.employes.map((e) => (
              <tr key={e.id} className="border-b border-neutral-100 dark:border-neutral-900 last:border-0">
                <td className="py-1.5 pr-3">
                  {nomPersonne(e)} {!e.actif && <span className="text-neutral-500">{t("ra.inactif")}</span>}
                </td>
                <td className={td}>{e.ouvertes}</td>
                <td className={`${td} ${e.enRetard > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{e.enRetard}</td>
                <td className={td}>{e.livrees}</td>
                <td className={td}>{e.tauxALHeure === null ? "—" : `${e.tauxALHeure} %`}</td>
              </tr>
            ))}
          </Tableau>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t("ra.nonAffectees", d.nonAffectees)}</p>
          <p className="text-xs text-neutral-500">{t("ra.note")}</p>
        </div>
      )}
    </Etat>
  );
}

function Retards({ period }) {
  const { t } = useTranslation();
  const query = useRetardsRapportQuery(period);
  return (
    <Etat query={query}>
      {(d) => (
        <div className="space-y-3" data-testid="ra-retards">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <Card>
              <p className="text-xs text-neutral-500">{t("ra.retardsEnCours")}</p>
              <p className="text-lg font-semibold tabular-nums">{d.enCours.total}</p>
              <p className="text-xs text-neutral-500">{d.enCours.parStatut.map((g) => `${statutLabel(g.statut)} : ${g.nombre}`).join(" · ")}</p>
              <p className="text-xs text-neutral-500">{d.enCours.parPriorite.map((g) => `${prioriteLabel(g.priorite)} : ${g.nombre}`).join(" · ")}</p>
            </Card>
            <Card>
              <p className="text-xs text-neutral-500">{t("ra.ponctualite")}</p>
              <p className="text-lg font-semibold tabular-nums">{d.ponctualite.tauxALHeure === null ? "—" : `${d.ponctualite.tauxALHeure} %`}</p>
              <p className="text-xs text-neutral-500">
                {t("ra.livrees")} : {d.ponctualite.livrees}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-neutral-500">{t("ra.retardMoyen")}</p>
              <p className="text-lg font-semibold tabular-nums">{d.ponctualite.retardMoyenJours === null ? "—" : t("ra.jours", { n: d.ponctualite.retardMoyenJours })}</p>
            </Card>
          </div>
          {d.enCours.plusAnciennes.length > 0 && (
            <>
              <p className="text-sm font-medium">{t("ra.plusAnciennes")}</p>
              <ul className="text-sm space-y-1">
                {d.enCours.plusAnciennes.map((c) => (
                  <li key={c.id}>
                    <Link className="underline" to={`/commandes/${c.id}`}>
                      {c.numero}
                    </Link>{" "}
                    — {nomPersonne(c.cliente)} — {statutLabel(c.statut)} — {t("ra.jours", { n: c.joursDeRetard })}
                    {c.assigneA && <> — {nomPersonne(c.assigneA)}</>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Etat>
  );
}

function Achats({ period }) {
  const { t } = useTranslation();
  const query = useAchatsFournisseursQuery(period);
  return (
    <Etat query={query}>
      {(d) =>
        d.fournisseurs.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("ra.aucun")}</p>
        ) : (
          <div data-testid="ra-achats">
            <Tableau entetes={[t("ra.colFournisseur"), t("ra.colAchats"), t("ra.colAnnules"), t("ra.colCommande"), t("ra.colRecu"), t("ra.colPaye"), t("ra.colReste")]}>
              {d.fournisseurs.map((f) => (
                <tr key={f.fournisseurId} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-1.5 pr-3">{f.nom}</td>
                  <td className={td}>{f.nombreAchats}</td>
                  <td className={td}>{f.nombreAnnules}</td>
                  <td className={td}>{f.valeurCommandee}</td>
                  <td className={td}>{f.valeurRecue}</td>
                  <td className={td}>{f.valeurPayee}</td>
                  <td className={td}>{f.resteAPayer}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-1.5 pr-3">{t("ra.total")}</td>
                <td className={td}>{d.total.nombreAchats}</td>
                <td className={td} />
                <td className={td}>{d.total.valeurCommandee}</td>
                <td className={td}>{d.total.valeurRecue}</td>
                <td className={td}>{d.total.valeurPayee}</td>
                <td className={td}>{d.total.resteAPayer}</td>
              </tr>
            </Tableau>
          </div>
        )
      }
    </Etat>
  );
}

function Depenses({ period }) {
  const { t } = useTranslation();
  const query = useDepensesCategoriesQuery(period);
  return (
    <Etat query={query}>
      {(d) =>
        d.categories.length === 0 ? (
          <p className="text-sm text-neutral-500">{t("ra.aucun")}</p>
        ) : (
          <div data-testid="ra-depenses">
            <Tableau entetes={[t("ra.colCategorie"), t("ra.colNombre"), t("ra.colTotal"), t("ra.colPart"), t("ra.colAchatsFourn")]}>
              {d.categories.map((c) => (
                <tr key={c.categorie} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-1.5 pr-3">{c.categorie}</td>
                  <td className={td}>{c.nombre}</td>
                  <td className={td}>{c.total}</td>
                  <td className={td}>{c.part === null ? "—" : `${c.part} %`}</td>
                  <td className={td}>{c.dontAchats}</td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-1.5 pr-3">{t("ra.total")}</td>
                <td className={td}>{d.nombre}</td>
                <td className={td}>{d.total}</td>
                <td className={td} />
                <td className={td} />
              </tr>
            </Tableau>
          </div>
        )
      }
    </Etat>
  );
}

function Marges({ period }) {
  const { t } = useTranslation();
  const query = useMargesQuery(period);
  return (
    <Etat query={query}>
      {(d) => (
        <div className="space-y-3" data-testid="ra-marges">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            {[
              [t("ra.valeurCommandes"), d.valeurCommandes],
              [t("ra.totalDepenses"), d.totalDepenses],
              [t("ra.margeSimple"), d.margeSimple],
              [t("ra.tauxMarge"), d.tauxMarge === null ? "—" : `${d.tauxMarge} %`],
            ].map(([libelle, valeur]) => (
              <Card key={libelle}>
                <p className="text-xs text-neutral-500">{libelle}</p>
                <p className="text-lg font-semibold tabular-nums">{valeur}</p>
              </Card>
            ))}
          </div>
          <p className="text-sm">
            {t("ra.soldeCaisse")} : <span className="tabular-nums">{d.soldeCaisse}</span>
          </p>
          {d.parType.length > 0 && (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t("ra.parType")} : {d.parType.map((x) => `${categorieLabel(x.typeVetement)} ${x.valeur} (${x.nombre})`).join(" · ")}
            </p>
          )}
          <p className="text-xs text-neutral-500">{t("ra.avertissement")}</p>
        </div>
      )}
    </Etat>
  );
}

export default function RapportsAvancesPage() {
  const voirFinances = useCan()("finances.voir");
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const period = {
    period: searchParams.get("from") || searchParams.get("to") ? undefined : (searchParams.get("period") ?? "month"),
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  };
  function handlePeriodChange(next) {
    const params = new URLSearchParams();
    if (next.period) params.set("period", next.period);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    setSearchParams(params);
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <PageHeader icon={BarChart3} title={t("ra.titre")} subtitle={t("ra.sousTitre")} actions={<PeriodSelector value={period} onChange={handlePeriodChange} />} />
      <Link to="/rapports" className="inline-flex items-center gap-1 text-sm underline">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t("ra.retour")}
      </Link>
      <div className="space-y-3">
        <SectionTitle icon={Users}>{t("ra.production")}</SectionTitle>
        <Production period={period} />
      </div>
      <div className="space-y-3">
        <SectionTitle icon={AlertTriangle}>{t("ra.retards")}</SectionTitle>
        <Retards period={period} />
      </div>
      {voirFinances && (
        <>
          <div className="space-y-3">
            <SectionTitle icon={Truck}>{t("ra.achats")}</SectionTitle>
            <Achats period={period} />
          </div>
          <div className="space-y-3">
            <SectionTitle icon={Receipt}>{t("ra.depenses")}</SectionTitle>
            <Depenses period={period} />
          </div>
          <div className="space-y-3">
            <SectionTitle icon={Percent}>{t("ra.marges")}</SectionTitle>
            <Marges period={period} />
          </div>
        </>
      )}
    </div>
  );
}
