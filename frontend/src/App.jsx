import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useLocaleStore } from "./stores/localeStore.js";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import PublicOnlyRoute from "./routes/PublicOnlyRoute.jsx";
import { RequireAtelier, RequireSuperadmin, RequireClient, RequirePermission } from "./routes/RoleGuards.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import SuperadminLayout from "./layouts/SuperadminLayout.jsx";
import ClientLayout from "./layouts/ClientLayout.jsx";
import LoginPage from "./pages/auth/LoginPage.jsx";
const InscriptionAtelierPage = lazy(() => import("./pages/auth/InscriptionAtelierPage.jsx"));
const MotDePasseOublieePage = lazy(() => import("./pages/auth/MotDePasseOublieePage.jsx"));
const ReinitialiserMotDePasseTokenPage = lazy(() => import("./pages/auth/ReinitialiserMotDePasseTokenPage.jsx"));
const ActiverCompteClientPage = lazy(() => import("./pages/auth/ActiverCompteClientPage.jsx"));
const VerifierEmailPage = lazy(() => import("./pages/auth/VerifierEmailPage.jsx"));
const AteliersPage = lazy(() => import("./pages/superadmin/AteliersPage.jsx"));
const AtelierDetailPage = lazy(() => import("./pages/superadmin/AtelierDetailPage.jsx"));
const SuperadminDashboardPage = lazy(() => import("./pages/superadmin/SuperadminDashboardPage.jsx"));
const GestionAbonnementsPage = lazy(() => import("./pages/superadmin/GestionAbonnementsPage.jsx"));
const ProductionPage = lazy(() => import("./features/production/ProductionPage.jsx"));
const VitrinePubliquePage = lazy(() => import("./features/vitrine/VitrinePubliquePage.jsx"));
const VitrineReglagesPage = lazy(() => import("./features/vitrine/VitrineReglagesPage.jsx"));
const EmployesPage = lazy(() => import("./features/employes/EmployesPage.jsx"));
const EmployeFormPage = lazy(() => import("./features/employes/EmployeFormPage.jsx"));
const GestionPlansPage = lazy(() => import("./pages/superadmin/GestionPlansPage.jsx"));
const NotificationsPlateformePage = lazy(() => import("./pages/superadmin/NotificationsPlateformePage.jsx"));
const PaiementsAbonnementPage = lazy(() => import("./pages/superadmin/PaiementsAbonnementPage.jsx"));
const CommercePage = lazy(() => import("./pages/superadmin/CommercePage.jsx"));
const DashboardPage = lazy(() => import("./pages/DashboardPage.jsx"));
const AccueilPage = lazy(() => import("./features/accueil/AccueilPage.jsx"));
const FinancesPage = lazy(() => import("./pages/FinancesPage.jsx"));
import NotFoundPage from "./pages/NotFoundPage.jsx";
const ClientesListPage = lazy(() => import("./features/clientes/ClientesListPage.jsx"));
const ClienteFormPage = lazy(() => import("./features/clientes/ClienteFormPage.jsx"));
const ClienteDetailPage = lazy(() => import("./features/clientes/ClienteDetailPage.jsx"));
const MesureFormPage = lazy(() => import("./features/clientes/MesureFormPage.jsx"));
const FournisseursListPage = lazy(() => import("./features/fournisseurs/FournisseursListPage.jsx"));
const FournisseurFormPage = lazy(() => import("./features/fournisseurs/FournisseurFormPage.jsx"));
const FournisseurDetailPage = lazy(() => import("./features/fournisseurs/FournisseurDetailPage.jsx"));
const AchatsListPage = lazy(() => import("./features/achats/AchatsListPage.jsx"));
const AchatFormPage = lazy(() => import("./features/achats/AchatFormPage.jsx"));
const AchatDetailPage = lazy(() => import("./features/achats/AchatDetailPage.jsx"));
const ModelesListPage = lazy(() => import("./features/modeles/ModelesListPage.jsx"));
const ModeleFormPage = lazy(() => import("./features/modeles/ModeleFormPage.jsx"));
const ModeleDetailPage = lazy(() => import("./features/modeles/ModeleDetailPage.jsx"));
const CommandesListPage = lazy(() => import("./features/commandes/CommandesListPage.jsx"));
const CommandeFormPage = lazy(() => import("./features/commandes/CommandeFormPage.jsx"));
const CommandeDetailPage = lazy(() => import("./features/commandes/CommandeDetailPage.jsx"));
const DepensesListPage = lazy(() => import("./features/depenses/DepensesListPage.jsx"));
const DepenseFormPage = lazy(() => import("./features/depenses/DepenseFormPage.jsx"));
const DepenseDetailPage = lazy(() => import("./features/depenses/DepenseDetailPage.jsx"));
const StockListPage = lazy(() => import("./features/stock/StockListPage.jsx"));
const StockFormPage = lazy(() => import("./features/stock/StockFormPage.jsx"));
const ArticleStockDetailPage = lazy(() => import("./features/stock/ArticleStockDetailPage.jsx"));
const LivraisonsListPage = lazy(() => import("./features/livraisons/LivraisonsListPage.jsx"));
const PaiementsListPage = lazy(() => import("./features/paiements/PaiementsListPage.jsx"));
const RecusListPage = lazy(() => import("./features/recus/RecusListPage.jsx"));
const RapportsPage = lazy(() => import("./features/rapports/RapportsPage.jsx"));
const RapportsAvancesPage = lazy(() => import("./features/rapports/RapportsAvancesPage.jsx"));
const ParametresPage = lazy(() => import("./features/parametres/ParametresPage.jsx"));
const NotificationsPage = lazy(() => import("./features/notifications/NotificationsPage.jsx"));
const CalendrierPage = lazy(() => import("./features/calendrier/CalendrierPage.jsx"));
const ComptePage = lazy(() => import("./features/compte/ComptePage.jsx"));
const AbonnementPage = lazy(() => import("./features/abonnement/AbonnementPage.jsx"));
const DemandesListPage = lazy(() => import("./features/demandes/DemandesListPage.jsx"));
const DemandeDetailPage = lazy(() => import("./features/demandes/DemandeDetailPage.jsx"));
const ClientProfilPage = lazy(() => import("./features/moi/ClientProfilPage.jsx"));
const ClientMesuresPage = lazy(() => import("./features/moi/ClientMesuresPage.jsx"));
const ClientCommandesListPage = lazy(() => import("./features/moi/ClientCommandesListPage.jsx"));
const ClientCommandeDetailPage = lazy(() => import("./features/moi/ClientCommandeDetailPage.jsx"));
const ClientPaiementsPage = lazy(() => import("./features/moi/ClientPaiementsPage.jsx"));
const ClientRecusPage = lazy(() => import("./features/moi/ClientRecusPage.jsx"));
const ClientNotificationsPage = lazy(() => import("./features/moi/ClientNotificationsPage.jsx"));
const ClientDemandesPage = lazy(() => import("./features/moi/ClientDemandesPage.jsx"));
const ClientDemandeFormPage = lazy(() => import("./features/moi/ClientDemandeFormPage.jsx"));

// Chargement à la demande : chaque page est un fragment de code séparé, téléchargé à la première visite de
// l'écran. L'écran de connexion reste dans le paquet initial (premier écran de tout visiteur).
function ChargementPage() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-gray-500" role="status" aria-live="polite">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
    </div>
  );
}

export default function App() {
  // key={locale} : remonte les routes au changement de langue, pour que même
  // les libellés calculés hors composant (translate(), voir i18n/index.js)
  // se rafraîchissent partout.
  const locale = useLocaleStore((s) => s.locale);
  return (
    <Suspense fallback={<ChargementPage />}>
    <Routes key={locale}>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/inscription" element={<InscriptionAtelierPage />} />
        <Route path="/mot-de-passe-oublie" element={<MotDePasseOublieePage />} />
      </Route>

      {/* Atteintes depuis un lien envoyé par email — jamais sous
          PublicOnlyRoute/ProtectedRoute : le jeton dans l'URL authentifie
          l'action à lui seul, indépendamment de toute session active dans
          ce navigateur (voir commentaires de chaque page). */}
      <Route path="/reinitialiser-mot-de-passe" element={<ReinitialiserMotDePasseTokenPage />} />
      <Route path="/verifier-email" element={<VerifierEmailPage />} />
      {/* Lien d'invitation envoyé par l'ADMIN (voir POST /clientes/:id/inviter)
          — même raisonnement que les deux routes ci-dessus : le jeton dans
          l'URL authentifie l'action à lui seul. */}
      <Route path="/client/activer" element={<ActiverCompteClientPage />} />

      {/* Vitrine publique d'un atelier : sans compte, jamais sous ProtectedRoute (voir vitrinePublique.routes.js). */}
      <Route path="/a/:slug" element={<VitrinePubliquePage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<RequireAtelier />}>
          <Route element={<AppLayout />}>
            {/* Accueil ouvert à tout membre : le PDG y trouve le tableau de bord, un employé l'espace de son métier. */}
            <Route path="/" element={<AccueilPage />} />
            <Route element={<RequirePermission permission="dashboard.lire" />}>
              <Route path="/tableau-de-bord" element={<DashboardPage />} />
            </Route>
            <Route element={<RequirePermission permission="clientes.lire" />}>
              <Route path="/clientes" element={<ClientesListPage />} />
            </Route>
            <Route element={<RequirePermission permission="clientes.ecrire" />}>
              <Route path="/clientes/nouvelle" element={<ClienteFormPage mode="create" />} />
            </Route>
            <Route element={<RequirePermission permission="clientes.lire" />}>
              <Route path="/clientes/:id" element={<ClienteDetailPage />} />
            </Route>
            <Route element={<RequirePermission permission="clientes.ecrire" />}>
              <Route path="/clientes/:id/modifier" element={<ClienteFormPage mode="edit" />} />
            </Route>
            <Route element={<RequirePermission permission="clientes.ecrire" />}>
              <Route path="/clientes/:id/mesures/nouvelle" element={<MesureFormPage />} />
            </Route>
            <Route element={<RequirePermission permission="achats.lire" />}>
              <Route path="/achats" element={<AchatsListPage />} />
              <Route path="/achats/:id" element={<AchatDetailPage />} />
            </Route>
            <Route element={<RequirePermission permission="achats.ecrire" />}>
              <Route path="/achats/nouveau" element={<AchatFormPage />} />
            </Route>
            <Route element={<RequirePermission permission="fournisseurs.lire" />}>
              <Route path="/fournisseurs" element={<FournisseursListPage />} />
              <Route path="/fournisseurs/:id" element={<FournisseurDetailPage />} />
            </Route>
            <Route element={<RequirePermission permission="fournisseurs.ecrire" />}>
              <Route path="/fournisseurs/nouveau" element={<FournisseurFormPage mode="create" />} />
              <Route path="/fournisseurs/:id/modifier" element={<FournisseurFormPage mode="edit" />} />
            </Route>
            <Route element={<RequirePermission permission="modeles.lire" />}>
              <Route path="/modeles" element={<ModelesListPage />} />
            </Route>
            <Route element={<RequirePermission permission="modeles.ecrire" />}>
              <Route path="/modeles/nouveau" element={<ModeleFormPage mode="create" />} />
            </Route>
            <Route element={<RequirePermission permission="modeles.lire" />}>
              <Route path="/modeles/:id" element={<ModeleDetailPage />} />
            </Route>
            <Route element={<RequirePermission permission="modeles.ecrire" />}>
              <Route path="/modeles/:id/modifier" element={<ModeleFormPage mode="edit" />} />
            </Route>
            <Route element={<RequirePermission permission="commandes.lire" />}>
              <Route path="/commandes" element={<CommandesListPage />} />
            </Route>
            <Route element={<RequirePermission permission="commandes.ecrire" />}>
              <Route path="/commandes/nouvelle" element={<CommandeFormPage mode="create" />} />
            </Route>
            <Route element={<RequirePermission permission="commandes.lire" />}>
              <Route path="/commandes/:id" element={<CommandeDetailPage />} />
            </Route>
            <Route element={<RequirePermission permission="commandes.ecrire" />}>
              <Route path="/commandes/:id/modifier" element={<CommandeFormPage mode="edit" />} />
            </Route>
            <Route element={<RequirePermission permission="finances.voir" />}>
              <Route path="/finances" element={<FinancesPage />} />
            </Route>
            <Route element={<RequirePermission permission="livraisons.lire" />}>
              <Route path="/livraisons" element={<LivraisonsListPage />} />
            </Route>
            <Route element={<RequirePermission permission="paiements.lire" />}>
              <Route path="/paiements" element={<PaiementsListPage />} />
            </Route>
            <Route element={<RequirePermission permission="depenses.lire" />}>
              <Route path="/depenses" element={<DepensesListPage />} />
            </Route>
            <Route element={<RequirePermission permission="depenses.ecrire" />}>
              <Route path="/depenses/nouvelle" element={<DepenseFormPage />} />
            </Route>
            <Route element={<RequirePermission permission="stock.lire" />}>
              <Route path="/stock" element={<StockListPage />} />
            </Route>
            <Route element={<RequirePermission permission="stock.ecrire" />}>
              <Route path="/stock/nouveau" element={<StockFormPage mode="create" />} />
            </Route>
            <Route element={<RequirePermission permission="stock.lire" />}>
              <Route path="/stock/:id" element={<ArticleStockDetailPage />} />
            </Route>
            <Route element={<RequirePermission permission="stock.ecrire" />}>
              <Route path="/stock/:id/modifier" element={<StockFormPage mode="edit" />} />
            </Route>
            <Route element={<RequirePermission permission="depenses.lire" />}>
              <Route path="/depenses/:id" element={<DepenseDetailPage />} />
            </Route>
            <Route element={<RequirePermission permission="paiements.lire" />}>
              <Route path="/recus" element={<RecusListPage />} />
            </Route>
            <Route element={<RequirePermission permission="rapports.lire" />}>
              <Route path="/rapports" element={<RapportsPage />} />
            </Route>
            <Route element={<RequirePermission permission="rapports.avances" />}>
              <Route path="/rapports/avances" element={<RapportsAvancesPage />} />
            </Route>
            <Route element={<RequirePermission permission="commandes.lire" />}>
              <Route path="/calendrier" element={<CalendrierPage />} />
            </Route>
            <Route element={<RequirePermission permission="commandes.affecter" />}>
              <Route path="/production" element={<ProductionPage />} />
            </Route>
            <Route element={<RequirePermission permission="notifications.lire" />}>
              <Route path="/notifications" element={<NotificationsPage />} />
            </Route>
            <Route element={<RequirePermission permission="@admin" />}>
              <Route path="/parametres" element={<ParametresPage />} />
            </Route>
            <Route path="/compte" element={<ComptePage />} />
            <Route element={<RequirePermission permission="@admin" />}>
              <Route path="/vitrine" element={<VitrineReglagesPage />} />
              <Route path="/employes" element={<EmployesPage />} />
              <Route path="/employes/nouveau" element={<EmployeFormPage />} />
              <Route path="/employes/:id" element={<EmployeFormPage />} />
            </Route>
            <Route element={<RequirePermission permission="@admin" />}>
              <Route path="/abonnement" element={<AbonnementPage />} />
            </Route>
            <Route element={<RequirePermission permission="demandes.lire" />}>
              <Route path="/demandes" element={<DemandesListPage />} />
            </Route>
            <Route element={<RequirePermission permission="demandes.lire" />}>
              <Route path="/demandes/:id" element={<DemandeDetailPage />} />
            </Route>
          </Route>
        </Route>

        <Route element={<RequireClient />}>
          <Route element={<ClientLayout />}>
            <Route path="/client" element={<ClientProfilPage />} />
            <Route path="/client/mesures" element={<ClientMesuresPage />} />
            <Route path="/client/commandes" element={<ClientCommandesListPage />} />
            <Route path="/client/commandes/:id" element={<ClientCommandeDetailPage />} />
            <Route path="/client/paiements" element={<ClientPaiementsPage />} />
            <Route path="/client/recus" element={<ClientRecusPage />} />
            <Route path="/client/notifications" element={<ClientNotificationsPage />} />
            <Route path="/client/demandes" element={<ClientDemandesPage />} />
            <Route path="/client/demandes/nouvelle" element={<ClientDemandeFormPage />} />
          </Route>
        </Route>

        <Route element={<RequireSuperadmin />}>
          <Route element={<SuperadminLayout />}>
            <Route path="/vue-ensemble" element={<SuperadminDashboardPage />} />
            <Route path="/ateliers" element={<AteliersPage />} />
            <Route path="/ateliers/:id" element={<AtelierDetailPage />} />
            <Route path="/gestion-abonnements" element={<GestionAbonnementsPage />} />
            <Route path="/paiements-abonnement" element={<PaiementsAbonnementPage />} />
            <Route path="/notifications-plateforme" element={<NotificationsPlateformePage />} />
            <Route path="/commerce" element={<CommercePage />} />
            <Route path="/tarifs-abonnement" element={<GestionPlansPage />} />
            <Route path="/mon-compte" element={<ComptePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  );
}
