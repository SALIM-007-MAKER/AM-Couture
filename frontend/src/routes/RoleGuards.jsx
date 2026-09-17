import { Navigate, Outlet } from "react-router-dom";
import { useMeQuery, homePathForUser } from "../hooks/useAuth.js";

// Montés à l'intérieur de <ProtectedRoute/> : `user` est donc déjà résolu
// (plus de useMeQuery().isPending à gérer ici) — voir App.jsx.
//
// Un SUPERADMIN n'a pas d'atelierId : toute route métier (Dashboard,
// Clientes, Commandes...) lui répond 403 côté backend (requireAtelier, voir
// auth.middleware.js) — RequireAtelier l'empêche d'y accéder côté frontend
// et le renvoie directement vers son propre espace (/ateliers).
//
// Un USER (§ plan rôle client, Phase 3) a LUI AUSSI un atelierId (celui de
// l'atelier dont il est client) mais reçoit un 403 identique côté backend
// (requireAtelier vérifie explicitement role === "ADMIN", pas seulement la
// présence d'atelierId — voir le commentaire complet dans
// auth.middleware.js) : même renvoi ici, vers son propre espace /client.
export function RequireAtelier() {
  const { data: user } = useMeQuery();
  if (user?.role === "SUPERADMIN") return <Navigate to="/ateliers" replace />;
  if (user?.role === "USER") return <Navigate to="/client" replace />;
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

// Espace client final (§ plan rôle USER, Phase 3, voir requireClient côté
// backend, auth.middleware.js) — réservé aux comptes USER. `homePathForUser`
// (pas un simple "/") : un ADMIN ou un SUPERADMIN qui tenterait d'y naviguer
// est renvoyé vers SON propre espace, pas systématiquement le Dashboard.
export function RequireClient() {
  const { data: user } = useMeQuery();
  if (user && user.role !== "USER") return <Navigate to={homePathForUser(user)} replace />;
  return <Outlet />;
}
