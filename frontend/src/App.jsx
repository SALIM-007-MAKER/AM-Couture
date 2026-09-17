import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import PublicOnlyRoute from "./routes/PublicOnlyRoute.jsx";
import { RequireAtelier, RequireSuperadmin, RequireClient } from "./routes/RoleGuards.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import SuperadminLayout from "./layouts/SuperadminLayout.jsx";
import ClientLayout from "./layouts/ClientLayout.jsx";
import LoginPage from "./pages/auth/LoginPage.jsx";
import InscriptionAtelierPage from "./pages/auth/InscriptionAtelierPage.jsx";
import MotDePasseOublieePage from "./pages/auth/MotDePasseOublieePage.jsx";
import ReinitialiserMotDePasseTokenPage from "./pages/auth/ReinitialiserMotDePasseTokenPage.jsx";
import ActiverCompteClientPage from "./pages/auth/ActiverCompteClientPage.jsx";
import VerifierEmailPage from "./pages/auth/VerifierEmailPage.jsx";
import AteliersPage from "./pages/superadmin/AteliersPage.jsx";
import AtelierDetailPage from "./pages/superadmin/AtelierDetailPage.jsx";
import SuperadminDashboardPage from "./pages/superadmin/SuperadminDashboardPage.jsx";
import GestionAbonnementsPage from "./pages/superadmin/GestionAbonnementsPage.jsx";
import GestionFormulesPage from "./pages/superadmin/GestionFormulesPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import FinancesPage from "./pages/FinancesPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ClientesListPage from "./features/clientes/ClientesListPage.jsx";
import ClienteFormPage from "./features/clientes/ClienteFormPage.jsx";
import ClienteDetailPage from "./features/clientes/ClienteDetailPage.jsx";
import MesureFormPage from "./features/clientes/MesureFormPage.jsx";
import ModelesListPage from "./features/modeles/ModelesListPage.jsx";
import ModeleFormPage from "./features/modeles/ModeleFormPage.jsx";
import ModeleDetailPage from "./features/modeles/ModeleDetailPage.jsx";
import CommandesListPage from "./features/commandes/CommandesListPage.jsx";
import CommandeFormPage from "./features/commandes/CommandeFormPage.jsx";
import CommandeDetailPage from "./features/commandes/CommandeDetailPage.jsx";
import DepensesListPage from "./features/depenses/DepensesListPage.jsx";
import DepenseFormPage from "./features/depenses/DepenseFormPage.jsx";
import DepenseDetailPage from "./features/depenses/DepenseDetailPage.jsx";
import StockListPage from "./features/stock/StockListPage.jsx";
import StockFormPage from "./features/stock/StockFormPage.jsx";
import ArticleStockDetailPage from "./features/stock/ArticleStockDetailPage.jsx";
import LivraisonsListPage from "./features/livraisons/LivraisonsListPage.jsx";
import PaiementsListPage from "./features/paiements/PaiementsListPage.jsx";
import RecusListPage from "./features/recus/RecusListPage.jsx";
import RapportsPage from "./features/rapports/RapportsPage.jsx";
import ParametresPage from "./features/parametres/ParametresPage.jsx";
import NotificationsPage from "./features/notifications/NotificationsPage.jsx";
import CalendrierPage from "./features/calendrier/CalendrierPage.jsx";
import ComptePage from "./features/compte/ComptePage.jsx";
import AbonnementPage from "./features/abonnement/AbonnementPage.jsx";
import DemandesListPage from "./features/demandes/DemandesListPage.jsx";
import DemandeDetailPage from "./features/demandes/DemandeDetailPage.jsx";
import ClientProfilPage from "./features/moi/ClientProfilPage.jsx";
import ClientMesuresPage from "./features/moi/ClientMesuresPage.jsx";
import ClientCommandesListPage from "./features/moi/ClientCommandesListPage.jsx";
import ClientCommandeDetailPage from "./features/moi/ClientCommandeDetailPage.jsx";
import ClientPaiementsPage from "./features/moi/ClientPaiementsPage.jsx";
import ClientNotificationsPage from "./features/moi/ClientNotificationsPage.jsx";
import ClientDemandesPage from "./features/moi/ClientDemandesPage.jsx";
import ClientDemandeFormPage from "./features/moi/ClientDemandeFormPage.jsx";

export default function App() {
  return (
    <Routes>
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

      <Route element={<ProtectedRoute />}>
        <Route element={<RequireAtelier />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/clientes" element={<ClientesListPage />} />
            <Route path="/clientes/nouvelle" element={<ClienteFormPage mode="create" />} />
            <Route path="/clientes/:id" element={<ClienteDetailPage />} />
            <Route path="/clientes/:id/modifier" element={<ClienteFormPage mode="edit" />} />
            <Route path="/clientes/:id/mesures/nouvelle" element={<MesureFormPage />} />
            <Route path="/modeles" element={<ModelesListPage />} />
            <Route path="/modeles/nouveau" element={<ModeleFormPage mode="create" />} />
            <Route path="/modeles/:id" element={<ModeleDetailPage />} />
            <Route path="/modeles/:id/modifier" element={<ModeleFormPage mode="edit" />} />
            <Route path="/commandes" element={<CommandesListPage />} />
            <Route path="/commandes/nouvelle" element={<CommandeFormPage mode="create" />} />
            <Route path="/commandes/:id" element={<CommandeDetailPage />} />
            <Route path="/commandes/:id/modifier" element={<CommandeFormPage mode="edit" />} />
            <Route path="/finances" element={<FinancesPage />} />
            <Route path="/livraisons" element={<LivraisonsListPage />} />
            <Route path="/paiements" element={<PaiementsListPage />} />
            <Route path="/depenses" element={<DepensesListPage />} />
            <Route path="/depenses/nouvelle" element={<DepenseFormPage />} />
            <Route path="/stock" element={<StockListPage />} />
            <Route path="/stock/nouveau" element={<StockFormPage mode="create" />} />
            <Route path="/stock/:id" element={<ArticleStockDetailPage />} />
            <Route path="/stock/:id/modifier" element={<StockFormPage mode="edit" />} />
            <Route path="/depenses/:id" element={<DepenseDetailPage />} />
            <Route path="/recus" element={<RecusListPage />} />
            <Route path="/rapports" element={<RapportsPage />} />
            <Route path="/calendrier" element={<CalendrierPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/parametres" element={<ParametresPage />} />
            <Route path="/compte" element={<ComptePage />} />
            <Route path="/abonnement" element={<AbonnementPage />} />
            <Route path="/demandes" element={<DemandesListPage />} />
            <Route path="/demandes/:id" element={<DemandeDetailPage />} />
          </Route>
        </Route>

        <Route element={<RequireClient />}>
          <Route element={<ClientLayout />}>
            <Route path="/client" element={<ClientProfilPage />} />
            <Route path="/client/mesures" element={<ClientMesuresPage />} />
            <Route path="/client/commandes" element={<ClientCommandesListPage />} />
            <Route path="/client/commandes/:id" element={<ClientCommandeDetailPage />} />
            <Route path="/client/paiements" element={<ClientPaiementsPage />} />
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
            <Route path="/tarifs-abonnement" element={<GestionFormulesPage />} />
            <Route path="/mon-compte" element={<ComptePage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
