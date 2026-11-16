import { whereCommandesImpayees } from "./commandesImpayees.js";
import { quantitesArticles } from "./stock.js";
import { STATUTS_OUVERTS, debutDuJour } from "./production.js";
import { aPermission, peutVoirFinances } from "./permissions.js";

// Notifications (Phase 4, étendues en 6.6) — voir schema.prisma pour le principe général : le contenu est recalculé
// en direct, seul l'état « lu » est persisté. Ce module réconcilie la table Notification avec la réalité à chaque
// lecture (pas de tâche planifiée nécessaire à cette échelle).
//
// Six sortes d'alertes, toutes dérivées de l'état réel :
//  - sur une COMMANDE : RETARD, PRET, LIVRAISON_PROCHE, IMPAYE (Phase 4), TACHE_AFFECTEE (6.6, destinée à l'employé
//    à qui la commande est confiée) ;
//  - sur un ARTICLE de stock : STOCK_BAS (quantité au seuil d'alerte ou en dessous) ;
//  - sur un ACHAT : ACHAT_EN_RETARD (non annulé, pas entièrement reçu, date attendue passée).
//
// atelierId : OBLIGATOIRE partout. Sans ce cloisonnement, réconcilier « pour l'atelier A » supprimerait à tort les
// notifications de tous les autres ateliers.
const HORIZON_LIVRAISON_PROCHE_JOURS = 3;

const TYPES_COMMANDE = ["RETARD", "PRET", "LIVRAISON_PROCHE"];

/** Ensemble des notifications qui DEVRAIENT exister maintenant pour cet atelier. */
async function calculerNotificationsAttendues(prisma, atelierId) {
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_LIVRAISON_PROCHE_JOURS * 86_400_000);

  const [enRetard, pretes, livraisonProche, impayees, confiees, articles, achats] = await Promise.all([
    prisma.commande.findMany({
      where: { atelierId, statut: { notIn: ["TERMINEE", "LIVREE", "ANNULEE"] }, dateLivraisonPrevue: { lt: now } },
      select: { id: true },
    }),
    prisma.commande.findMany({ where: { atelierId, statut: "TERMINEE" }, select: { id: true } }),
    prisma.commande.findMany({
      where: { atelierId, statut: { notIn: ["LIVREE", "ANNULEE"] }, dateLivraisonPrevue: { gte: now, lt: horizon } },
      select: { id: true },
    }),
    whereCommandesImpayees(prisma, atelierId).then((where) => prisma.commande.findMany({ where, select: { id: true } })),
    // Travail confié à un compte encore actif : l'employé concerné en est prévenu tant que la commande est ouverte.
    prisma.commande.findMany({
      where: { atelierId, statut: { in: STATUTS_OUVERTS }, assigneAId: { not: null }, assigneA: { is: { actif: true } } },
      select: { id: true, assigneAId: true },
    }),
    prisma.articleStock.findMany({
      where: { atelierId, archivedAt: null, seuilAlerte: { not: null } },
      select: { id: true, seuilAlerte: true },
    }),
    prisma.achat.findMany({
      where: { atelierId, statut: "COMMANDE", dateAttendue: { lt: debutDuJour(now) } },
      select: { id: true, lignes: { select: { quantite: true, quantiteRecue: true } } },
    }),
  ]);

  const quantites = await quantitesArticles(prisma, articles.map((a) => a.id));
  const stockBas = articles.filter((a) => quantites.get(a.id).lessThanOrEqualTo(a.seuilAlerte));
  // Comparaison de deux colonnes d'une même ligne : faite ici (les lignes d'un achat sont peu nombreuses).
  const achatsAttendus = achats.filter((a) => a.lignes.some((l) => l.quantiteRecue.lessThan(l.quantite)));

  const paires = [];
  for (const c of enRetard) paires.push({ atelierId, type: "RETARD", commandeId: c.id });
  for (const c of pretes) paires.push({ atelierId, type: "PRET", commandeId: c.id });
  for (const c of livraisonProche) paires.push({ atelierId, type: "LIVRAISON_PROCHE", commandeId: c.id });
  for (const c of impayees) paires.push({ atelierId, type: "IMPAYE", commandeId: c.id });
  for (const c of confiees) paires.push({ atelierId, type: "TACHE_AFFECTEE", commandeId: c.id, destinataireId: c.assigneAId });
  for (const a of stockBas) paires.push({ atelierId, type: "STOCK_BAS", articleId: a.id });
  for (const a of achatsAttendus) paires.push({ atelierId, type: "ACHAT_EN_RETARD", achatId: a.id });
  return paires;
}

const cle = (n) => `${n.type}:${n.commandeId ?? ""}:${n.articleId ?? ""}:${n.achatId ?? ""}:${n.destinataireId ?? ""}`;

/**
 * Réconcilie la table Notification avec l'état actuel, POUR UN ATELIER DONNÉ : crée les paires manquantes (non lues),
 * supprime celles dont la cause a disparu (ou dont le destinataire a changé : travail réaffecté). Ne touche jamais
 * `lu` sur une notification déjà existante. Ne lit ni n'écrit jamais les notifications des autres ateliers.
 */
export async function reconcilierNotifications(prisma, atelierId) {
  const attendues = await calculerNotificationsAttendues(prisma, atelierId);
  const existantes = await prisma.notification.findMany({
    where: { atelierId },
    select: { id: true, type: true, commandeId: true, articleId: true, achatId: true, destinataireId: true },
  });

  const cleAttendues = new Set(attendues.map(cle));
  const cleExistantes = new Set(existantes.map(cle));
  const aCreer = attendues.filter((p) => !cleExistantes.has(cle(p)));
  const aSupprimer = existantes.filter((n) => !cleAttendues.has(cle(n)));

  // Suppressions D'ABORD : une commande réaffectée garde le même couple (type, commande) — l'ancienne notification doit
  // avoir disparu avant que la nouvelle (autre destinataire) ne soit créée.
  if (aSupprimer.length > 0) await prisma.notification.deleteMany({ where: { id: { in: aSupprimer.map((n) => n.id) } } });
  if (aCreer.length > 0) await prisma.notification.createMany({ data: aCreer, skipDuplicates: true });
}

/**
 * Filtre Prisma des notifications qu'un compte a le droit de voir. Le PDG voit tout (sauf le travail confié à
 * quelqu'un d'autre). Un employé voit, parmi ses droits :
 *  - alertes de commande (retard, prête, livraison proche) : celles des commandes qui lui sont confiées ; toutes s'il
 *    gère les commandes (« commandes.ecrire » ou « commandes.affecter ») ;
 *  - impayés : seulement avec « finances.voir » (information financière) ;
 *  - travail qui lui est confié : le sien ;
 *  - stock bas : avec « stock.ecrire » ; achats en retard : avec « achats.recevoir ».
 */
export function whereVisiblePour(user) {
  const base = { atelierId: user.atelierId };
  if (user.role === "ADMIN") {
    return { ...base, OR: [{ destinataireId: null }, { destinataireId: user.id }] };
  }
  const ou = [{ type: "TACHE_AFFECTEE", destinataireId: user.id }];
  if (aPermission(user, "commandes.ecrire") || aPermission(user, "commandes.affecter")) {
    ou.push({ type: { in: TYPES_COMMANDE } });
  } else {
    ou.push({ type: { in: TYPES_COMMANDE }, commande: { is: { assigneAId: user.id } } });
  }
  if (peutVoirFinances(user)) ou.push({ type: "IMPAYE" });
  if (aPermission(user, "stock.ecrire")) ou.push({ type: "STOCK_BAS" });
  if (aPermission(user, "achats.recevoir")) ou.push({ type: "ACHAT_EN_RETARD" });
  return { ...base, OR: ou };
}

/** Filtre « non lues » propre à la personne : drapeau partagé pour le PDG, lecture individuelle pour un employé. */
export function whereNonLuePour(user, lu) {
  if (user.role === "ADMIN") return { lu };
  return lu ? { lectures: { some: { userId: user.id } } } : { lectures: { none: { userId: user.id } } };
}
