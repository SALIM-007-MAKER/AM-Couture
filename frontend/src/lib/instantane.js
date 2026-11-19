// Instantané local pour la consultation hors connexion (7.5).
//
// Principe : ce que l'utilisateur a DÉJÀ consulté en ligne (clientes, commandes, modèles, réglages) est recopié sur
// l'appareil ; sans réseau, l'application s'ouvre avec ces données en LECTURE. Aucune écriture hors ligne ici (7.6).
//
// Garde-fous (données personnelles sur l'appareil) :
//  - un seul instantané par appareil, au nom du dernier utilisateur ; un autre compte qui se connecte le remplace ;
//  - effacé à la déconnexion et dès que le serveur répond 401 (session terminée) ;
//  - expire 7 jours après la dernière confirmation de la session par le serveur (durée de vie de la session) ;
//  - réservé au PDG et aux employés : jamais pour une cliente ni pour la plateforme ;
//  - liste blanche de données : jamais paiements, dépenses, rapports, abonnement, achats, ni réponses d'authentification
//    autres que l'identité du compte ;
//  - tailles bornées (une photo en base64 peut peser plusieurs centaines de Ko).
//
// Ce module est pur (aucun accès navigateur) : le stockage est injecté (`adaptateur`), ce qui le rend testable.
export const VERSION = 1;
export const DUREE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const TAILLE_MAX_REQUETE = 500_000;
export const TAILLE_MAX_TOTAL = 4_000_000;
export const CLE_ME = ["auth", "me"];
// Racines de clés de requêtes conservées (les listes et fiches qu'elles contiennent). Tout le reste est ignoré.
export const RACINES_CONSERVEES = ["clientes", "commandes", "modeles", "parametres"];

const memeCle = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Seuls le PDG et les employés d'un atelier conservent un instantané. */
export function peutConserver(user) {
  return Boolean(user && typeof user.id === "string" && (user.role === "ADMIN" || user.role === "EMPLOYE"));
}

function conservable(cle) {
  if (!Array.isArray(cle) || cle.length === 0) return false;
  return memeCle(cle, CLE_ME) || RACINES_CONSERVEES.includes(cle[0]);
}

const taille = (valeur) => JSON.stringify(valeur)?.length ?? 0;

/**
 * Construit l'instantané à partir des requêtes en mémoire. `requetes` : [{ queryKey, state: { status, data, dataUpdatedAt } }].
 * Renvoie null s'il n'y a rien à conserver (pas de compte connecté, ou compte non éligible).
 */
export function construireInstantane(requetes, maintenant = Date.now()) {
  const me = requetes.find((r) => memeCle(r.queryKey, CLE_ME) && r.state.status === "success");
  if (!me || !peutConserver(me.state.data)) return null;

  const candidates = requetes
    .filter((r) => r !== me && conservable(r.queryKey) && r.state.status === "success" && r.state.data !== undefined)
    .map((r) => ({ key: r.queryKey, data: r.state.data, updatedAt: r.state.dataUpdatedAt, octets: taille(r.state.data) }))
    .filter((r) => r.octets <= TAILLE_MAX_REQUETE)
    .sort((a, b) => b.updatedAt - a.updatedAt); // les plus récemment consultées d'abord

  const gardees = [];
  let total = taille(me.state.data);
  for (const c of candidates) {
    if (total + c.octets > TAILLE_MAX_TOTAL) continue;
    total += c.octets;
    gardees.push({ key: c.key, data: c.data, updatedAt: c.updatedAt });
  }
  return {
    version: VERSION,
    userId: me.state.data.id,
    enregistreLe: maintenant,
    // Dernière fois où le serveur a confirmé la session : sert à l'expiration et à l'affichage.
    verifieLe: me.state.dataUpdatedAt,
    me: me.state.data,
    requetes: gardees,
  };
}

/** Un instantané est utilisable s'il a la bonne forme, correspond à son compte, et n'a pas expiré. */
export function instantaneUtilisable(snap, maintenant = Date.now()) {
  if (!snap || snap.version !== VERSION) return false;
  if (typeof snap.userId !== "string" || !peutConserver(snap.me) || snap.me.id !== snap.userId) return false;
  if (!Number.isFinite(snap.verifieLe) || !Array.isArray(snap.requetes)) return false;
  const age = maintenant - snap.verifieLe;
  return age >= 0 && age <= DUREE_MAX_MS;
}

/**
 * Recharge l'instantané dans le cache des requêtes, avec leur date d'origine (utile à l'expiration et au classement).
 *
 * Les données restaurées sont ensuite marquées PÉRIMÉES (invalidées, sans rechargement immédiat) : elles s'affichent tout de
 * suite, y compris sans réseau, mais la première page qui les utilise les redemande au serveur. Leur date d'origine ne suffit
 * pas : avec un `staleTime` de 30 s, une donnée de moins de 30 s serait jugée fraîche et ne serait jamais redemandée, alors
 * qu'elle peut précéder une écriture (affectation, paiement…) faite juste avant un rechargement de la page.
 */
export function restaurer(queryClient, snap) {
  const restaurees = [CLE_ME];
  queryClient.setQueryData(CLE_ME, snap.me, { updatedAt: snap.verifieLe });
  for (const r of snap.requetes) {
    if (!conservable(r.key)) continue;
    queryClient.setQueryData(r.key, r.data, { updatedAt: r.updatedAt });
    restaurees.push(r.key);
  }
  queryClient.invalidateQueries({ predicate: (q) => restaurees.some((k) => memeCle(k, q.queryKey)), refetchType: "none" });
}

/**
 * Lit l'instantané et le recharge. Un instantané périmé, illisible ou d'une autre version est SUPPRIMÉ (jamais laissé
 * traîner sur l'appareil). Renvoie vrai si quelque chose a été restauré.
 */
export async function restaurerDepuis(adaptateur, queryClient, maintenant = Date.now()) {
  let snap;
  try {
    snap = await adaptateur.lire();
  } catch {
    return false;
  }
  if (!snap) return false;
  if (!instantaneUtilisable(snap, maintenant)) {
    await adaptateur.effacer().catch(() => {});
    return false;
  }
  restaurer(queryClient, snap);
  return true;
}

/**
 * Enregistre l'instantané à chaque changement du cache (regroupé : une écriture au plus tous les `delaiMs`). Si plus personne
 * n'est connecté (déconnexion, session expirée), l'instantané est effacé. Renvoie une fonction d'arrêt.
 */
export function demarrerSauvegarde(queryClient, adaptateur, { delaiMs = 2000 } = {}) {
  let minuteur = null;
  const ecrire = async () => {
    minuteur = null;
    const requetes = queryClient.getQueryCache().getAll();
    const snap = construireInstantane(requetes);
    try {
      if (snap) await adaptateur.ecrire(snap);
      else await adaptateur.effacer();
    } catch {
      // Stockage plein ou indisponible : la consultation hors ligne est simplement moins complète, jamais une erreur visible.
    }
  };
  const planifier = () => {
    if (minuteur) return;
    minuteur = setTimeout(ecrire, delaiMs);
  };
  const desabonner = queryClient.getQueryCache().subscribe(planifier);
  planifier();
  return () => {
    desabonner();
    if (minuteur) clearTimeout(minuteur);
    minuteur = null;
  };
}
