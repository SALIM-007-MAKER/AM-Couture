import { whereCommandesImpayees } from "./commandesImpayees.js";

// Notifications (Phase 4) — voir schema.prisma pour le principe général :
// contenu recalculé en direct, seul l'état "lu" est persisté. Ce module
// réconcilie la table Notification avec la réalité à chaque appel de
// GET /api/notifications (pas de tâche planifiée nécessaire à cette échelle).
//
// COMMANDES_NON_TERMINALES : copie du même filtre que dashboard.routes.js /
// rapports.routes.js (statut hors TERMINEE/LIVREE/ANNULEE pour RETARD, hors
// LIVREE/ANNULEE pour LIVRAISON_PROCHE) — voir constantes ci-dessous.
const HORIZON_LIVRAISON_PROCHE_JOURS = 3;

/**
 * Calcule l'ensemble des notifications qui DEVRAIENT exister maintenant,
 * sous forme de paires {type, commandeId} — une commande peut apparaître
 * dans plusieurs types à la fois (ex: en retard ET impayée).
 */
async function calculerNotificationsAttendues(prisma) {
  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_LIVRAISON_PROCHE_JOURS * 86_400_000);

  const [enRetard, pretes, livraisonProche, impayees] = await Promise.all([
    prisma.commande.findMany({
      where: { statut: { notIn: ["TERMINEE", "LIVREE", "ANNULEE"] }, dateLivraisonPrevue: { lt: now } },
      select: { id: true },
    }),
    prisma.commande.findMany({ where: { statut: "TERMINEE" }, select: { id: true } }),
    prisma.commande.findMany({
      where: { statut: { notIn: ["LIVREE", "ANNULEE"] }, dateLivraisonPrevue: { gte: now, lt: horizon } },
      select: { id: true },
    }),
    whereCommandesImpayees(prisma).then((where) => prisma.commande.findMany({ where, select: { id: true } })),
  ]);

  const paires = [];
  for (const c of enRetard) paires.push({ type: "RETARD", commandeId: c.id });
  for (const c of pretes) paires.push({ type: "PRET", commandeId: c.id });
  for (const c of livraisonProche) paires.push({ type: "LIVRAISON_PROCHE", commandeId: c.id });
  for (const c of impayees) paires.push({ type: "IMPAYE", commandeId: c.id });
  return paires;
}

/**
 * Réconcilie la table Notification avec l'état actuel : crée les paires
 * manquantes (non lues), supprime celles dont la cause a disparu. Ne touche
 * jamais `lu` sur une notification déjà existante (une alerte lue le reste
 * tant que sa cause n'a pas disparu puis réapparu).
 */
export async function reconcilierNotifications(prisma) {
  const attendues = await calculerNotificationsAttendues(prisma);
  const existantes = await prisma.notification.findMany({ select: { id: true, type: true, commandeId: true } });

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
