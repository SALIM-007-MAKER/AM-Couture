// Aides d'affichage du tableau de bord commercial (sans React). Les montants arrivent du serveur sous forme de chaînes.

/** Largeur d'une barre en % (0 à 100) : la plus grande valeur du jeu occupe toute la largeur ; valeurs négatives ramenées à 0. */
export function pourcentage(valeur, maximum) {
  const v = Number(valeur);
  const m = Number(maximum);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0 || v <= 0) return 0;
  return Math.min(100, Math.round((v / m) * 100));
}

/** « 50 % » ou « — » quand la période ne contient aucune donnée (taux null côté serveur : jamais 0 % trompeur). */
export function libelleTaux(taux) {
  return taux === null || taux === undefined ? "—" : `${String(taux).replace(".", ",")} %`;
}

/** Plus grand montant encaissé d'une série mensuelle, pour dimensionner les barres. */
export function maxEncaisse(serie) {
  return Math.max(0, ...(serie ?? []).map((m) => Number(m.encaisse)));
}

/** Le montant net d'un mois est-il négatif (remboursements supérieurs aux encaissements) ? */
export const estNegatif = (montant) => Number(montant) < 0;
