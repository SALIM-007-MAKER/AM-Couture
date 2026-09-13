import { Navigate, Outlet } from "react-router-dom";
import { useMeQuery } from "../hooks/useAuth.js";

// Montés à l'intérieur de <ProtectedRoute/> : `user` est donc déjà résolu
// (plus de useMeQuery().isPending à gérer ici) — voir App.jsx.
//
// Un SUPERADMIN n'a pas d'atelierId : toute route métier (Dashboard,
// Clientes, Commandes...) lui répond 403 côté backend (requireAtelier, voir
// auth.middleware.js) — RequireAtelier l'empêche d'y accéder côté frontend
// et le renvoie directement vers son propre espace (/ateliers).
export function RequireAtelier() {
  const { data: user } = useMeQuery();
  if (user?.role === "SUPERADMIN") return <Navigate to="/ateliers" replace />;
  return <Outlet />;
}

// Symétrique : /ateliers (gestion des tenants) est réservé au SUPERADMIN
// côté backend (requireSuperadmin) — un ADMIN qui tenterait d'y naviguer est
// renvoyé vers son tableau de bord.
export function RequireSuperadmin() {
  const { data: user } = useMeQuery();
  if (user && user.role !== "SUPERADMIN") return <Navigate to="/" replace />;
  return <Outlet />;
}
