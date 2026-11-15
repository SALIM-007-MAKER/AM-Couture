// Journalisation technique : UNE ligne JSON par événement sur la sortie standard (logs Vercel), avec
// niveau, type, date et champs de contexte. Remplace les console.* en texte libre, qui n'étaient ni
// filtrables ni corrélables à une requête.
//
// Règles :
// - Jamais de donnée personnelle ni de secret dans les champs : identifiants techniques uniquement
//   (userId, atelierId, requestId), jamais d'email, de téléphone, de jeton ni de corps de requête.
// - Niveau minimal : variable LOG_LEVEL (debug | info | warn | error), `info` par défaut.
// - `console.*` est résolu à CHAQUE appel (et non à l'import) : les tests peuvent l'intercepter.

const NIVEAUX = { debug: 10, info: 20, warn: 30, error: 40 };

function seuil(env = process.env) {
  return NIVEAUX[String(env.LOG_LEVEL ?? "").toLowerCase()] ?? NIVEAUX.info;
}

export function formaterLigne(niveau, type, champs = {}, maintenant = new Date()) {
  return JSON.stringify({ niveau, type, date: maintenant.toISOString(), ...champs });
}

export function journaliser(niveau, type, champs = {}) {
  if ((NIVEAUX[niveau] ?? NIVEAUX.info) < seuil()) return;
  const ligne = formaterLigne(niveau, type, champs);
  if (niveau === "error") console.error(ligne);
  else if (niveau === "warn") console.warn(ligne);
  else console.log(ligne);
}

/** Message d'erreur sur une ligne, borné : jamais la pile ni l'objet complet dans un champ libre. */
export function messageErreur(err, max = 200) {
  return String(err?.message ?? err).replace(/\s+/g, " ").slice(0, max);
}

export const log = {
  debug: (type, champs) => journaliser("debug", type, champs),
  info: (type, champs) => journaliser("info", type, champs),
  warn: (type, champs) => journaliser("warn", type, champs),
  error: (type, champs) => journaliser("error", type, champs),
};
