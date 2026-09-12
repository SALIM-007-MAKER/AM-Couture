// Détermine les commandes "impayées" (0 FCFA réellement encaissé) — logique
// partagée entre le Dashboard (compteur) et les Notifications (Phase 4),
// pour n'avoir qu'une seule définition de "impayée" dans tout le projet.
//
// Volontairement en deux temps plutôt qu'une requête SQL brute (COUNT +
// NOT EXISTS) : reste idiomatique Prisma (groupBy + notIn), déjà le style du
// reste du projet pour ce genre de calcul, et le résultat sert aussi bien à
// un `.count()` qu'à un `.findMany()` selon l'appelant.
//
// ANNULEE exclue : une commande annulée sans paiement n'est pas un impayé à
// relancer (voir même exclusion dans dashboard.routes.js pour enCours/enRetard).
export async function whereCommandesImpayees(prisma) {
  // Un paiement a toujours un montant > 0 (voir paiement.schema.js) : la
  // seule présence d'une ligne non annulée suffit à exclure la commande.
  const rows = await prisma.paiement.groupBy({ by: ["commandeId"], where: { annuleAt: null } });
  const idsAvecPaiement = rows.map((r) => r.commandeId);
  return { statut: { not: "ANNULEE" }, id: { notIn: idsAvecPaiement } };
}
