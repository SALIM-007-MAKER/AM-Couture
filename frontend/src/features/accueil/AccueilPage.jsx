import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Scissors, FileInput, PackageCheck, AlertTriangle, Truck, Wallet, Receipt, Boxes, ShoppingCart } from "lucide-react";
import { useMeQuery } from "../../hooks/useAuth.js";
import { useCan } from "../../hooks/usePermissions.js";
import { useTranslation } from "../../i18n/index.js";
import { useLocaleStore } from "../../stores/localeStore.js";
import PageHeader from "../../components/PageHeader.jsx";
import Card from "../../components/Card.jsx";
import { LoadingState, ErrorState } from "../../components/QueryState.jsx";
import CommandeStatutBadge from "../commandes/components/CommandeStatutBadge.jsx";
import { useCommandesQuery } from "../commandes/hooks.js";
import { useDemandesQuery } from "../demandes/hooks.js";
import { useAlertesStockQuery } from "../stock/hooks.js";
import { useAchatsQuery } from "../achats/hooks.js";
import { useDashboardSummaryQuery } from "../dashboard/hooks.js";
import { usePaiementsGlobalQuery } from "../paiements/hooks.js";
import { useDepensesQuery } from "../depenses/hooks.js";
import { espaceDe, sectionsVisibles, actionsVisibles, travauxAConfectionner } from "./espaces.js";

// Même chargement différé que dans App.jsx : le tableau de bord n'est téléchargé que pour le PDG.
const DashboardPage = lazy(() => import("../../pages/DashboardPage.jsx"));

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "short" });
}

/** Cadre commun d'une section : titre, état de chargement/erreur/vide, lien « Tout voir ». */
function Section({ icon: Icon, titre, tone = "neutral", query, items, vide, voirTout, children }) {
  const { t } = useTranslation();
  const couleur = tone === "danger" ? "text-red-600 dark:text-red-400" : "text-neutral-900 dark:text-neutral-100";
  return (
    <Card variant="outlined" padded={false}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
        <h2 className={`flex items-center gap-2 text-sm font-semibold ${couleur}`}>
          <Icon className="size-4" aria-hidden="true" />
          {titre}
        </h2>
        {voirTout && query.data && items.length > 0 && (
          <Link to={voirTout} className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100">
            {t("accueil.voirTout")} <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        )}
      </div>
      {query.isPending ? (
        <div className="px-4 py-2"><LoadingState /></div>
      ) : query.isError ? (
        <div className="p-4"><ErrorState error={query.error} onRetry={query.refetch} /></div>
      ) : items.length === 0 ? (
        <p className="px-4 py-4 text-sm text-neutral-500">{vide}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </Card>
  );
}

function Ligne({ to, gauche, droite, tone }) {
  return (
    <li className="border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <Link to={to} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
        <span className="min-w-0 truncate text-neutral-900 dark:text-neutral-100">{gauche}</span>
        <span className={`shrink-0 text-xs font-medium ${tone === "danger" ? "text-red-600 dark:text-red-400" : "text-neutral-500"}`}>{droite}</span>
      </Link>
    </li>
  );
}

const nomCliente = (c) => `${c.cliente.nom} ${c.cliente.prenom}`;

function MesTravaux() {
  const { t } = useTranslation();
  const query = useCommandesQuery({ assigneA: "moi", pageSize: 100 });
  const items = travauxAConfectionner(query.data?.data ?? []);
  return (
    <Section icon={Scissors} titre={t("accueil.sections.mesTravaux.titre")} query={query} items={items} vide={t("accueil.sections.mesTravaux.vide")} voirTout="/commandes?assigneA=moi">
      {items.map((c) => (
        <Ligne
          key={c.id}
          to={`/commandes/${c.id}`}
          tone={c.enRetard ? "danger" : "neutral"}
          gauche={<>{c.numero} — {nomCliente(c)} <CommandeStatutBadge statut={c.statut} /></>}
          droite={c.enRetard ? t("accueil.sections.mesTravaux.enRetard") : c.dateLivraisonPrevue ? t("accueil.sections.mesTravaux.echeance", { date: formatDate(c.dateLivraisonPrevue) }) : t("accueil.sections.mesTravaux.sansDate")}
        />
      ))}
    </Section>
  );
}

function ListeCommandes({ id, icon, tone, params, voirTout }) {
  const { t } = useTranslation();
  const query = useCommandesQuery({ pageSize: 6, ...params });
  const items = query.data?.data ?? [];
  return (
    <Section icon={icon} tone={tone} titre={t(`accueil.sections.${id}.titre`)} query={query} items={items} vide={t(`accueil.sections.${id}.vide`)} voirTout={voirTout}>
      {items.map((c) => (
        <Ligne key={c.id} to={`/commandes/${c.id}`} tone={tone} gauche={`${c.numero} — ${nomCliente(c)}`} droite={c.dateLivraisonPrevue ? formatDate(c.dateLivraisonPrevue) : ""} />
      ))}
    </Section>
  );
}

function DemandesAttente() {
  const { t } = useTranslation();
  const query = useDemandesQuery({ statut: "EN_ATTENTE", pageSize: 6 });
  const items = query.data?.data ?? [];
  return (
    <Section icon={FileInput} titre={t("accueil.sections.demandesAttente.titre")} query={query} items={items} vide={t("accueil.sections.demandesAttente.vide")} voirTout="/demandes">
      {items.map((d) => (
        <Ligne
          key={d.id}
          to={`/demandes/${d.id}`}
          gauche={d.cliente ? `${d.cliente.nom} ${d.cliente.prenom}` : `${d.contactNom ?? ""} ${d.contactPrenom ?? ""}`.trim()}
          droite={formatDate(d.createdAt)}
        />
      ))}
    </Section>
  );
}

function AlertesStock() {
  const { t } = useTranslation();
  const query = useAlertesStockQuery();
  const items = query.data?.data ?? [];
  return (
    <Section icon={AlertTriangle} tone="danger" titre={t("accueil.sections.alertesStock.titre")} query={query} items={items} vide={t("accueil.sections.alertesStock.vide")} voirTout="/stock">
      {items.map((a) => (
        <Ligne key={a.id} to={`/stock/${a.id}`} tone="danger" gauche={a.nom} droite={t("accueil.sections.alertesStock.reste", { quantite: a.quantite, seuil: a.seuilAlerte })} />
      ))}
    </Section>
  );
}

function AchatsAttendus() {
  const { t } = useTranslation();
  const query = useAchatsQuery({ reception: "attendu", statut: "COMMANDE", pageSize: 6 });
  const items = query.data?.data ?? [];
  return (
    <Section icon={PackageCheck} titre={t("accueil.sections.achatsAttendus.titre")} query={query} items={items} vide={t("accueil.sections.achatsAttendus.vide")} voirTout="/achats?vue=attendu">
      {items.map((a) => (
        <Ligne key={a.id} to={`/achats/${a.id}`} gauche={`${a.numero} — ${a.fournisseur.nom}`} droite={a.dateAttendue ? t("accueil.sections.achatsAttendus.attendu", { date: formatDate(a.dateAttendue) }) : ""} />
      ))}
    </Section>
  );
}

function IndicateursFinanciers() {
  const { t } = useTranslation();
  const query = useDashboardSummaryQuery({ period: "month" });
  const f = query.data?.finances;
  const kpi = (label, valeur) => (
    <div key={label} className="min-w-0">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-xl font-bold tabular-nums break-words text-neutral-900 dark:text-neutral-50">{valeur}</p>
    </div>
  );
  return (
    <Card variant="outlined">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
        <Wallet className="size-4" aria-hidden="true" />
        {t("accueil.sections.indicateursFinanciers.titre")}
      </h2>
      {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={query.refetch} /> : f ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {kpi(t("accueil.sections.indicateursFinanciers.encaisse"), f.totalEncaisse)}
          {kpi(t("accueil.sections.indicateursFinanciers.depenses"), f.totalDepenses)}
          {kpi(t("accueil.sections.indicateursFinanciers.resultat"), f.resultatTresorerie)}
          {kpi(t("accueil.sections.indicateursFinanciers.impayees"), query.data.commandes.nonPayees)}
        </div>
      ) : null}
    </Card>
  );
}

function PaiementsRecents() {
  const { t } = useTranslation();
  const query = usePaiementsGlobalQuery({ pageSize: 5 });
  const items = (query.data?.data ?? []).filter((p) => !p.annuleAt);
  return (
    <Section icon={Receipt} titre={t("accueil.sections.paiementsRecents.titre")} query={query} items={items} vide={t("accueil.sections.paiementsRecents.vide")} voirTout="/paiements">
      {items.map((p) => (
        <Ligne key={p.id} to={`/commandes/${p.commande.id}`} gauche={`${p.commande.numero} — ${p.commande.cliente.nom} ${p.commande.cliente.prenom}`} droite={`${p.montant} · ${formatDate(p.date)}`} />
      ))}
    </Section>
  );
}

function DepensesRecentes() {
  const { t } = useTranslation();
  const query = useDepensesQuery({ pageSize: 5 });
  const items = (query.data?.data ?? []).filter((d) => !d.annuleAt);
  return (
    <Section icon={ShoppingCart} titre={t("accueil.sections.depensesRecentes.titre")} query={query} items={items} vide={t("accueil.sections.depensesRecentes.vide")} voirTout="/depenses">
      {items.map((d) => (
        <Ligne key={d.id} to={`/depenses/${d.id}`} gauche={d.categorie} droite={`${d.montant} · ${formatDate(d.date)}`} />
      ))}
    </Section>
  );
}

const COMPOSANTS = {
  mesTravaux: MesTravaux,
  demandesAttente: DemandesAttente,
  commandesALivrer: () => <ListeCommandes id="commandesALivrer" icon={Truck} params={{ statut: "TERMINEE" }} voirTout="/commandes?statut=TERMINEE" />,
  commandesEnRetard: () => <ListeCommandes id="commandesEnRetard" icon={AlertTriangle} tone="danger" params={{ enRetard: "true" }} voirTout="/commandes?enRetard=true" />,
  alertesStock: AlertesStock,
  achatsAttendus: AchatsAttendus,
  indicateursFinanciers: IndicateursFinanciers,
  paiementsRecents: PaiementsRecents,
  depensesRecentes: DepensesRecentes,
};

function EspaceEmploye({ user, espace }) {
  const { t } = useTranslation();
  const can = useCan();
  const sections = sectionsVisibles(user);
  const actions = actionsVisibles(user);
  return (
    <div className="space-y-6">
      <PageHeader icon={Boxes} title={t("accueil.titre", { nom: user.identifiant })} subtitle={t(`accueil.sousTitre.${espace}`)} />
      {(actions.length > 0 || can("dashboard.lire")) && (
        <nav aria-label={t("accueil.raccourcis")} className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link key={a.id} to={a.to} className="inline-flex items-center rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
              {t(`accueil.actions.${a.id}`)}
            </Link>
          ))}
          {can("dashboard.lire") && (
            <Link to="/tableau-de-bord" className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
              {t("accueil.tableauDeBord")} <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          )}
        </nav>
      )}
      {sections.length === 0 ? (
        <p className="text-sm text-neutral-500">{t("accueil.aucunEspace")}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {sections.map((s) => {
            const Composant = COMPOSANTS[s.id];
            return <Composant key={s.id} />;
          })}
        </div>
      )}
    </div>
  );
}

/** Accueil unique de l'atelier : le PDG garde son tableau de bord, chaque employé arrive dans l'espace de son métier. */
export default function AccueilPage() {
  const { data: user } = useMeQuery();
  const espace = espaceDe(user);
  if (!user) return null;
  if (espace === "pdg") {
    return (
      <Suspense fallback={<LoadingState />}>
        <DashboardPage />
      </Suspense>
    );
  }
  return <EspaceEmploye user={user} espace={espace ?? "general"} />;
}
