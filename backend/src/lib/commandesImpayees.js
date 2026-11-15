// Détermine les commandes "impayées" (0 FCFA réellement encaissé) — logique
// partagée entre le Dashboard (compteur) et les Notifications (Phase 4),
// pour n'avoir qu'une seule définition de "impayée" dans tout le projet.
//
// Exprimée en filtre relationnel (« aucun paiement actif »), que Prisma traduit en NOT EXISTS côté SQL :
// la base fait le travail et rien n'est chargé en mémoire. La version précédente listait d'abord les
// identifiants de TOUTES les commandes payées (groupBy) puis les passait en `notIn` : lecture de tout
// l'historique de paiements à chaque appel, et échec (erreur P2029, HTTP 500 sur le tableau de bord et les
// notifications) dès que l'atelier dépasse 32 767 commandes payées — limite de paramètres d'une requête
// PostgreSQL. Mesures avant/après dans docs/PERFORMANCES.md.
//
// ANNULEE exclue : une commande annulée sans paiement n'est pas un impayé à
// relancer (voir même exclusion dans dashboard.routes.js pour enCours/enRetard).
//
// atelierId (Phase 8 — multi-tenant) : la commande est filtrée par atelier et le test « aucun paiement » porte
// sur SES propres paiements (relation), donc le paiement d'un autre atelier ne peut jamais l'exclure à tort.
//
// Reste `async` avec le paramètre `prisma` : signature historique, utilisée par deux appelants.
export async function whereCommandesImpayees(_prisma, atelierId) {
  // Un paiement a toujours un montant > 0 (voir paiement.schema.js) : la seule présence d'une ligne non
  // annulée suffit à exclure la commande.
  return { atelierId, statut: { not: "ANNULEE" }, paiements: { none: { annuleAt: null } } };
}
