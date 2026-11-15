// Aperçu du total d'un achat pendant la saisie. Simple confort : le serveur recalcule TOUJOURS le total (en décimal
// exact) et c'est lui qui fait foi. Calcul en centimes entiers pour éviter les erreurs d'arrondi des flottants.
const enCentimes = (valeur) => {
  const n = Number(String(valeur).replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export function totalLignes(lignes) {
  const centimesCarres = lignes.reduce((somme, l) => somme + enCentimes(l.quantite) * enCentimes(l.prixUnitaire), 0);
  // quantité (centièmes) × prix (centièmes) = dix-millièmes
  const total = Math.round(centimesCarres / 100) / 100;
  return Number.isInteger(total) ? String(total) : total.toFixed(2);
}
