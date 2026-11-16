// Adaptateur de stockage de la file d'écritures hors ligne : IndexedDB, une seule entrée. Toute erreur (navigation privée, stockage
// désactivé ou plein) est absorbée : l'application fonctionne alors exactement comme avant, sans consultation hors ligne.
const NOM_BASE = "am-couture-file";
const NOM_STORE = "kv";
const CLE = "file";

function ouvrir() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponible"));
    const req = indexedDB.open(NOM_BASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(NOM_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function transaction(mode, action) {
  const db = await ouvrir();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(NOM_STORE, mode);
      const requete = action(tx.objectStore(NOM_STORE));
      tx.oncomplete = () => resolve(requete?.result ?? null);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const stockageFile = {
  lire: () => transaction("readonly", (s) => s.get(CLE)),
  ecrire: (elements) => transaction("readwrite", (s) => s.put(elements, CLE)),
  effacer: () => transaction("readwrite", (s) => s.delete(CLE)),
};

/** Efface la file sans jamais lever d'erreur (déconnexion, session expirée). */
export function effacerFile() {
  return stockageFile.effacer().catch(() => {});
}
