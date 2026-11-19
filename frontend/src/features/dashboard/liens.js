// Destination des liens « Tout voir » des deux listes du tableau de bord (commandes en retard, livraisons à venir).
//
// - Un profil qui a « rapports.lire » (PDG, comptable…) garde le comportement historique : la page Rapports.
// - Sans « rapports.lire » (réceptionniste), la page Rapports lui est fermée : le lien mène à la liste des commandes, filtrée,
//   si elle a « commandes.lire ». Sans aucun des deux, il n'y a pas de lien (null) plutôt qu'un lien qui redirige.
// Ce module ne donne aucun droit : il ne fait que choisir une destination ; le serveur revérifie chaque requête.

/** Date locale au format AAAA-MM-JJ (celui des filtres de la liste des commandes). */
export function dateIso(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/**
 * @param {(permission: string) => boolean} peut
 * @param {"enRetard" | "aLivrer"} liste
 * @param {{ aujourdhui?: Date, jours?: number }} [options] jours : horizon de la liste « à livrer »
 * @returns {string | null}
 */
export function lienToutVoir(peut, liste, { aujourdhui = new Date(), jours = 3 } = {}) {
  if (peut("rapports.lire")) return "/rapports";
  if (!peut("commandes.lire")) return null;
  if (liste === "enRetard") return "/commandes?enRetard=true";
  const fin = new Date(aujourdhui);
  fin.setDate(fin.getDate() + jours);
  return `/commandes?livraisonDu=${dateIso(aujourdhui)}&livraisonAu=${dateIso(fin)}`;
}
