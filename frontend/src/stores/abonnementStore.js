import { create } from "zustand";

// État purement en mémoire (pas persisté — reflète l'état RÉEL du backend à
// chaque requête, jamais une préférence utilisateur) : passe à `true` dès
// qu'une requête reçoit un 402 (§ trial/abonnement, voir
// middlewares/auth.middleware.js:requireAbonnementActif), repasse à `false`
// dès qu'une requête réussit — donc se corrige automatiquement juste après
// une souscription réussie, sans rechargement de page.
export const useAbonnementStore = create((set) => ({
  bloque: false,
  setBloque: (bloque) => set({ bloque }),
}));
