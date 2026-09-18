// Calcule dateExpiration = dateDebut + dureeMois — arithmétique CALENDAIRE
// (setUTCMonth), pas "+ dureeMois*30 jours" : un abonnement "3 mois" doit
// couvrir 3 mois civils, quelle que soit leur longueur réelle (28 à 31
// jours), sinon un abonnement de 12 mois perdrait plusieurs jours par an.
export function calculerDateExpiration(dateDebut, dureeMois) {
  const d = new Date(dateDebut);
  d.setUTCMonth(d.getUTCMonth() + dureeMois);
  return d;
}

// "ACTIF"/"EXPIRE" ne sont JAMAIS stockés — dérivés à la lecture à partir de
// statut + dateExpiration, même principe que statutPaiement() (money.js) :
// une valeur recalculable ne doit jamais pouvoir diverger de la réalité en
// base. EN_ATTENTE/ANNULE restent des états réels, stockés tels quels.
export function statutEffectif(abonnement, now = new Date()) {
  if (abonnement.statut === "ANNULE") return "ANNULE";
  if (abonnement.statut === "EN_ATTENTE") return "EN_ATTENTE";
  // CONFIRME
  if (abonnement.dateExpiration && new Date(abonnement.dateExpiration) > now) return "ACTIF";
  return "EXPIRE";
}

// Seul point d'activation d'un abonnement dans toute la base de code — voir
// webhooks.routes.js (Wave), transactions.routes.js (confirmation manuelle
// NITA/Amanata + simulation mock) : les trois chemins finissent ICI plutôt
// que de dupliquer le calcul de dateExpiration, pour qu'un futur changement
// de règle (durée, grâce...) ne puisse pas diverger entre eux. `tx` est
// TOUJOURS un client Prisma en transaction ($transaction), jamais `prisma`
// directement — l'activation et la mise à jour du statut de la Transaction
// doivent réussir ou échouer ensemble.
export async function activerAbonnement(tx, { abonnementId, dureeMois }, maintenant = new Date()) {
  const dateExpiration = calculerDateExpiration(maintenant, dureeMois);
  await tx.abonnement.update({
    where: { id: abonnementId },
    data: { statut: "CONFIRME", dateDebut: maintenant, dateExpiration },
  });
  return dateExpiration;
}
