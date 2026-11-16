import { create } from "zustand";
import { onlineManager } from "@tanstack/react-query";

// État de la connexion, source unique pour l'application (7.5).
//
// TanStack Query sait déjà « mettre en pause » les requêtes quand il se croit hors ligne : elles gardent alors leurs
// données et ne passent pas en erreur. Mais le navigateur ne signale « hors ligne » que si l'appareil n'a aucun réseau ;
// un réseau qui ne laisse rien passer (wifi sans internet, serveur injoignable) reste « en ligne ». On bascule donc aussi
// en mode hors ligne quand une requête échoue faute de réponse, puis on sonde le serveur jusqu'à son retour.
export const useConnexionStore = create((set) => ({
  horsLigne: false,
  setHorsLigne: (horsLigne) => set({ horsLigne }),
}));

onlineManager.subscribe((enLigne) => useConnexionStore.getState().setHorsLigne(!enLigne));

const DELAI_SONDE_MS = 8_000;
let minuteurSonde = null;

function planifierSonde() {
  minuteurSonde = setTimeout(sonder, DELAI_SONDE_MS);
  minuteurSonde.unref?.(); // hors navigateur (tests), la sonde ne doit pas retenir le processus
}

async function sonder() {
  minuteurSonde = null;
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (res.ok) {
      onlineManager.setOnline(true); // relance les requêtes en pause
      return;
    }
  } catch {
    // toujours injoignable
  }
  planifierSonde();
}

/** À appeler quand une requête échoue faute de réponse : passe en mode hors ligne et sonde le retour du serveur. */
export function signalerReseauIndisponible() {
  if (onlineManager.isOnline()) onlineManager.setOnline(false);
  if (!minuteurSonde) planifierSonde();
}

/** Retour du réseau annoncé par le navigateur : on vérifie tout de suite plutôt que d'attendre la prochaine sonde. */
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (minuteurSonde) clearTimeout(minuteurSonde);
    minuteurSonde = null;
    sonder();
  });
}
