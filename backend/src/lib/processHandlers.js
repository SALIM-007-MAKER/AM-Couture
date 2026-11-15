// Rejets de promesse et exceptions que personne n'a interceptés : jusqu'ici ils n'étaient visibles
// que dans la sortie brute de Node, sans format ni contexte. Même format JSON que les erreurs de
// requête (voir error.middleware.js) pour qu'on les retrouve avec la même recherche.

const INSTALLE = Symbol.for("am.processHandlers.installes");
const LIGNES_PILE = 8;

function decrire(raison) {
  if (raison instanceof Error) {
    return { message: raison.message, pile: String(raison.stack ?? "").split("\n").slice(0, LIGNES_PILE).join("\n") };
  }
  let texte;
  try {
    texte = typeof raison === "string" ? raison : JSON.stringify(raison);
  } catch {
    texte = String(raison);
  }
  return { message: String(texte ?? raison).slice(0, 300), pile: "" };
}

function journaliser(categorie, raison) {
  const { message, pile } = decrire(raison);
  console.error(JSON.stringify({ type: "erreur", date: new Date().toISOString(), categorie, message, pile }));
}

/**
 * - `unhandledRejection` : journalisé, le processus continue (une promesse oubliée ne doit pas tuer
 *   une instance qui sert d'autres requêtes).
 * - `uncaughtException` : journalisé puis arrêt du processus — l'état est indéterminé, redémarrer
 *   est plus sûr que de continuer (comportement par défaut de Node, mais avec un journal exploitable).
 *
 * Idempotent : sans effet si déjà installé sur ce processus.
 */
export function installerGestionnairesProcessus(proc = process) {
  if (proc[INSTALLE]) return;
  proc[INSTALLE] = true;
  proc.on("unhandledRejection", (raison) => journaliser("rejet_non_gere", raison));
  proc.on("uncaughtException", (erreur) => {
    journaliser("exception_non_geree", erreur);
    setImmediate(() => proc.exit(1));
  });
}
