import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import PublicOnlyRoute from "./routes/PublicOnlyRoute.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import LoginPage from "./pages/auth/LoginPage.jsx";
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
import LivraisonsListPage from "./features/livraisons/LivraisonsListPage.jsx";
import PaiementsListPage from "./features/paiements/PaiementsListPage.jsx";
import RecusListPage from "./features/recus/RecusListPage.jsx";
import RapportsPage from "./features/rapports/RapportsPage.jsx";
import ParametresPage from "./features/parametres/ParametresPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
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
          <Route path="/depenses/:id" element={<DepenseDetailPage />} />
          <Route path="/recus" element={<RecusListPage />} />
          <Route path="/rapports" element={<RapportsPage />} />
          <Route path="/parametres" element={<ParametresPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
