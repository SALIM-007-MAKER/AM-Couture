import { create } from "zustand";
import { onlineManager } from "@tanstack/react-query";
import { api } from "./apiClient.js";
import { ApiError } from "./apiError.js";
import { queryClient } from "./queryClient.js";
import { useConnexionStore } from "./connexion.js";
import { peutConserver, CLE_ME } from "./instantane.js";
import { creerElement, ecritureAutorisee, filtrerFileValide, nouvelleCle, rejouer, MAX_ELEMENTS } from "./fileEcritures.js";
import { stockageFile, effacerFile } from "./fileStockage.js";

// Branchement de la file d'écritures hors ligne (7.6) : état partagé, persistance sur l'appareil, synchronisation au retour
// du serveur. La logique de décision (liste blanche, conflits) est dans fileEcritures.js.
export const useFileStore = create(() => ({ elements: [], synchronisation: false }));

const lire = () => useFileStore.getState().elements;
let enCours = null;

async function persister(elements) {
  useFileStore.setState({ elements });
  if (elements.length === 0) await stockageFile.effacer();
  else await stockageFile.ecrire(elements);
}

const utilisateur = () => queryClient.getQueryData(CLE_ME);

/** Recharge la file de cet appareil pour l'utilisateur connecté (les éléments d'un autre compte sont supprimés). */
export async function chargerFile(userId) {
  let brute = null;
  try {
    brute = await stockageFile.lire();
  } catch {
    return;
  }
  const valides = filtrerFileValide(brute, userId);
  useFileStore.setState({ elements: valides });
  if (Array.isArray(brute) && valides.length !== brute.length) await (valides.length ? stockageFile.ecrire(valides) : stockageFile.effacer()).catch(() => {});
}

/** Vide la file en mémoire ET sur l'appareil (déconnexion, session terminée). */
export function viderFile() {
  useFileStore.setState({ elements: [], synchronisation: false });
  return effacerFile();
}

export async function abandonner(id) {
  await persister(lire().filter((e) => e.id !== id)).catch(() => {});
}

/** Rejoue la file. Un seul rejeu à la fois ; sans effet s'il n'y a rien à rejouer. */
export function synchroniser() {
  if (enCours) return enCours;
  const user = utilisateur();
  if (!user || !lire().some((e) => e.etat === "attente")) return Promise.resolve(0);
  enCours = (async () => {
    useFileStore.setState({ synchronisation: true });
    try {
      const envoyer = (e) => api.post(e.chemin, e.corps, { headers: { "Idempotency-Key": e.cle } });
      const { elements, appliques } = await rejouer(lire(), envoyer, { userId: user.id });
      if (!utilisateur()) return appliques; // session terminée pendant le rejeu : la file a été effacée, on n'y touche plus
      await persister(elements).catch(() => {});
      if (appliques > 0) {
        queryClient.invalidateQueries({ queryKey: ["clientes"] });
        queryClient.invalidateQueries({ queryKey: ["commandes"] });
      }
      return appliques;
    } finally {
      useFileStore.setState({ synchronisation: false });
      enCours = null;
    }
  })();
  return enCours;
}

// Retour du serveur (annoncé par la sonde de connexion.js ou par le navigateur) : rejeu automatique.
onlineManager.subscribe((enLigne) => {
  if (enLigne) synchroniser().catch(() => {});
});

/**
 * Écrit en direct ; si le serveur est injoignable ET que l'écriture est dans la liste blanche, la garde sur l'appareil.
 * Renvoie la réponse du serveur, ou `{ enAttente: true }` quand l'écriture a été mise en file. Une écriture hors liste
 * blanche (paiement, livraison…) échoue comme avant : elle doit toujours être confirmée par le serveur.
 * La MÊME clé d'idempotence sert à l'envoi direct et au rejeu : une requête arrivée sans que la réponse nous parvienne
 * n'est pas dupliquée.
 */
export async function ecrireOuMettreEnFile({ type, methode = "POST", chemin, corps, libelle }) {
  const user = utilisateur();
  const eligible = Boolean(user && peutConserver(user) && ecritureAutorisee(type, methode, chemin, corps));
  const cle = nouvelleCle();
  const direct = () => api.post(chemin, corps, { headers: { "Idempotency-Key": cle } });

  if (!eligible) return direct();
  if (!useConnexionStore.getState().horsLigne) {
    try {
      return await direct();
    } catch (err) {
      if (!(err instanceof ApiError) || err.status !== 0) throw err;
    }
  }
  if (lire().length >= MAX_ELEMENTS) throw new ApiError(0, "Trop de modifications en attente : reconnectez-vous pour les envoyer.", undefined, { kind: "network" });
  const element = creerElement({ type, methode, chemin, corps, libelle, userId: user.id, cle });
  try {
    await persister([...lire(), element]);
  } catch {
    // Jamais prétendre avoir gardé ce qui ne l'est pas (stockage plein, désactivé, navigation privée).
    useFileStore.setState({ elements: lire().filter((e) => e.id !== element.id) });
    throw new ApiError(0, "Hors connexion : impossible d'enregistrer cette modification sur l'appareil.", undefined, { kind: "network" });
  }
  return { enAttente: true, element };
}
