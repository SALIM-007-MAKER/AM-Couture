import { whereCommandesImpayees } from "./commandesImpayees.js";

// Notifications (Phase 4) — voir schema.prisma pour le principe général :
// contenu recalculé en direct, seul l'état "lu" est persisté. Ce module
// réconcilie la table Notification avec la réalité à chaque appel de
// GET /api/notifications (pas de tâche planifiée nécessaire à cette échelle).
//
// atelierId (Phase 8 — multi-tenant) : OBLIGATOIRE partout ici. Notification
// n'a pas sa propre colonne atelierId (scopée via Commande) — sans ce
// cloisonnement, réconcilier "pour l'atelier A" supprimerait à tort les
// notifications de TOUS LES AUTRES ateliers (leurs paires ne correspondant
// jamais à l'ensemble "attendu" calculé pour A seul).
const HORIZON_LIVRAISON_PROCHE_JOURS = 3;

/**
 * Calcule l'ensemble des notifications qui DEVRAIENT exister maintenant POUR
 * CET ATELIER, sous forme de paires {type, commandeId} — une commande peut
 * apparaître dans plusieurs types à la fois (ex: en retard ET impayée).
 */
async function calculerNotificationsAttendues(prisma, atelierId) {
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_LIVRAISON_PROCHE_JOURS * 86_400_000);

  const [enRetard, pretes, livraisonProche, impayees] = await Promise.all([
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
  ]);

  const paires = [];
  for (const c of enRetard) paires.push({ type: "RETARD", commandeId: c.id });
  for (const c of pretes) paires.push({ type: "PRET", commandeId: c.id });
  for (const c of livraisonProche) paires.push({ type: "LIVRAISON_PROCHE", commandeId: c.id });
  for (const c of impayees) paires.push({ type: "IMPAYE", commandeId: c.id });
  return paires;
}

/**
 * Réconcilie la table Notification avec l'état actuel, POUR UN ATELIER
 * DONNÉ : crée les paires manquantes (non lues), supprime celles dont la
 * cause a disparu. Ne touche jamais `lu` sur une notification déjà
 * existante (une alerte lue le reste tant que sa cause n'a pas disparu puis
 * réapparu). Ne lit/n'écrit jamais les notifications des autres ateliers.
 */
export async function reconcilierNotifications(prisma, atelierId) {
  const attendues = await calculerNotificationsAttendues(prisma, atelierId);
  const existantes = await prisma.notification.findMany({
    where: { commande: { atelierId } },
    select: { id: true, type: true, commandeId: true },
  });

  const cleAttendues = new Set(attendues.map((p) => `${p.type}:${p.commandeId}`));
  const cleExistantes = new Set(existantes.map((n) => `${n.type}:${n.commandeId}`));

  const aCreer = attendues.filter((p) => !cleExistantes.has(`${p.type}:${p.commandeId}`));
  const aSupprimer = existantes.filter((n) => !cleAttendues.has(`${n.type}:${n.commandeId}`));

  await Promise.all([
    ...(aCreer.length > 0
      ? [prisma.notification.createMany({ data: aCreer, skipDuplicates: true })]
      : []),
    ...(aSupprimer.length > 0
      ? [prisma.notification.deleteMany({ where: { id: { in: aSupprimer.map((n) => n.id) } } })]
      : []),
  ]);
}
