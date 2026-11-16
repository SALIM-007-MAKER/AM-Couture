// File des écritures hors ligne (7.6) — logique pure, sans navigateur : l'envoi est injecté, donc testable.
//
// Principe : quand le serveur est injoignable, un petit nombre d'écritures SÛRES sont gardées sur l'appareil puis rejouées,
// dans l'ordre, au retour du serveur. Chaque écriture porte sa propre clé d'idempotence : si la requête d'origine avait en
// réalité atteint le serveur (réponse perdue), le rejeu renvoie la réponse d'origine au lieu de créer un doublon.
//
// Liste blanche (tout le reste est refusé, jamais mis en file) :
//   - créer une cliente ;
//   - ajouter une prise de mesures à une cliente EXISTANTE (ajout seul : l'historique n'est jamais modifié) ;
//   - faire avancer le statut d'une commande, AVEC le statut que l'utilisateur voyait (le serveur refuse si ça a changé).
// JAMAIS : paiements, livraisons, annulations, dépenses, achats, stock, abonnement, comptes, suppressions. Une opération
// d'argent doit toujours être confirmée par le serveur en direct.
//
// Règles de conflit (le serveur reste l'arbitre, rien n'est jamais forcé) :
//   - 4xx au rejeu (doublon de téléphone, cliente archivée, statut changé entre-temps, droit retiré…) → l'élément passe
//     en « conflit » avec le message du serveur ; il n'est ni rejoué ni supprimé : l'utilisateur décide (abandonner) ;
//   - pas de réponse, 5xx, 429, 409 « en cours » → on s'arrête et on réessaiera (l'ordre est conservé) ;
//   - 401 → la session est terminée : on s'arrête (la file est alors effacée par la déconnexion) ;
//   - plus vieux que la durée de vie des clés d'idempotence (24 h) → « à vérifier » : on ne rejoue pas à l'aveugle une
//     écriture dont on ne pourrait plus détecter qu'elle est déjà passée.
export const DUREE_MAX_REJEU_MS = 23 * 60 * 60 * 1000; // marge sous les 24 h de conservation des clés côté serveur
export const MAX_ELEMENTS = 100;

const ID = "[A-Za-z0-9_-]{1,64}";
const ACTIONS = {
  "cliente.creer": { methode: "POST", chemin: /^\/clientes$/ },
  "mesure.creer": { methode: "POST", chemin: new RegExp(`^/clientes/${ID}/mesures$`) },
  "commande.statut": {
    methode: "POST",
    chemin: new RegExp(`^/commandes/${ID}/statut$`),
    // Garde obligatoire, et jamais LIVREE (la livraison a sa propre route, avec paiement éventuel).
    corpsValide: (c) => typeof c?.statutAttendu === "string" && typeof c?.statut === "string" && c.statut !== "LIVREE",
  },
};

export const TYPES_AUTORISES = Object.keys(ACTIONS);

/** Vrai si l'écriture fait partie de la liste blanche (type, méthode, chemin et corps cohérents). */
export function ecritureAutorisee(type, methode, chemin, corps) {
  const a = ACTIONS[type];
  if (!a) return false;
  if (methode !== a.methode || typeof chemin !== "string" || !a.chemin.test(chemin)) return false;
  return a.corpsValide ? a.corpsValide(corps) : true;
}

/** Génère une clé d'idempotence valide pour le serveur (8–128 caractères de [A-Za-z0-9_.:-]). */
export function nouvelleCle(aleatoire = () => globalThis.crypto.randomUUID()) {
  return `ofl-${aleatoire()}`;
}

/** Construit un élément de file. Refuse tout ce qui n'est pas dans la liste blanche. */
export function creerElement({ type, methode, chemin, corps, libelle, userId, cle, id }, maintenant = Date.now()) {
  if (!ecritureAutorisee(type, methode, chemin, corps)) throw new Error(`Écriture non autorisée hors ligne : ${type}`);
  if (typeof userId !== "string" || !userId) throw new Error("Utilisateur requis");
  return {
    id: id ?? nouvelleCle(),
    cle: cle ?? nouvelleCle(),
    type,
    methode,
    chemin,
    corps,
    libelle: libelle ?? type,
    userId,
    creeLe: maintenant,
    etat: "attente", // attente | conflit | a_verifier
    message: null,
    tentatives: 0,
  };
}

/** Une file rechargée depuis l'appareil n'est jamais crue sur parole : forme, propriétaire et liste blanche revérifiés. */
export function filtrerFileValide(brute, userId) {
  if (!Array.isArray(brute)) return [];
  return brute
    .filter(
      (e) =>
        e &&
        typeof e === "object" &&
        e.userId === userId &&
        typeof e.cle === "string" &&
        typeof e.id === "string" &&
        ["attente", "conflit", "a_verifier"].includes(e.etat) &&
        Number.isFinite(e.creeLe) &&
        ecritureAutorisee(e.type, e.methode, e.chemin, e.corps),
    )
    .slice(0, MAX_ELEMENTS);
}

/** Classe la réponse d'un rejeu : "ok" | "conflit" | "reessayer" | "session". */
export function classerErreur(err) {
  const s = err?.status;
  if (s === 401) return "session";
  if (!Number.isInteger(s) || s === 0) return "reessayer"; // pas de réponse
  if (s === 429 || s >= 500) return "reessayer";
  // 409 « opération en cours » (même clé en traitement) : transitoire, pas un conflit métier.
  if (s === 409 && err.retryAfter) return "reessayer";
  return "conflit";
}

/**
 * Rejoue la file dans l'ordre. `envoyer(element)` renvoie la réponse ou lève une ApiError.
 * Renvoie { elements, interrompu, appliques } : les éléments restants (mis à jour), si l'on s'est arrêté, et le nombre d'écritures passées.
 */
export async function rejouer(elements, envoyer, { maintenant = Date.now(), userId } = {}) {
  const restants = elements.map((e) => ({ ...e }));
  let interrompu = false;
  let appliques = 0;
  for (let i = 0; i < restants.length; i++) {
    const e = restants[i];
    if (e.etat !== "attente") continue;
    if (e.userId !== userId) continue; // jamais rejoué sous un autre compte
    if (maintenant - e.creeLe > DUREE_MAX_REJEU_MS) {
      e.etat = "a_verifier";
      e.message = "Trop ancienne pour être rejouée sans risque de doublon : vérifiez si elle a été enregistrée.";
      continue;
    }
    try {
      await envoyer(e);
      restants.splice(i, 1);
      i--;
      appliques++;
    } catch (err) {
      const sort = classerErreur(err);
      e.tentatives += 1;
      if (sort === "conflit") {
        e.etat = "conflit";
        e.message = typeof err?.message === "string" && err.message ? err.message : "Refusée par le serveur.";
        continue;
      }
      interrompu = true; // réessayer / session : on ne saute jamais une écriture pour passer à la suivante
      break;
    }
  }
  return { elements: restants, interrompu, appliques };
}
