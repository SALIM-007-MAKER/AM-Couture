// Libellés et états du graphique « tendances » de la vue d'ensemble du SUPERADMIN (fonctions pures, sans accès navigateur).

const locale = (langue) => (langue === "en" ? "en-GB" : "fr-FR");

/** « 2026-11 » → { annee: 2026, mois: 11 } */
function decouper(cle) {
  const [annee, mois] = cle.split("-").map(Number);
  return { annee, mois };
}

/** Mois abrégé pour l'axe (« nov. »). */
export function moisCourt(cle, langue = "fr") {
  const { annee, mois } = decouper(cle);
  return new Date(annee, mois - 1, 1).toLocaleDateString(locale(langue), { month: "short" });
}

/** Mois complet avec l'année pour l'infobulle (« novembre 2026 »). */
export function moisComplet(cle, langue = "fr") {
  const { annee, mois } = decouper(cle);
  return new Date(annee, mois - 1, 1).toLocaleDateString(locale(langue), { month: "long", year: "numeric" });
}

/**
 * L'année n'est écrite sous le mois que là où elle change l'interprétation : première colonne et janvier
 * (sur 6 mois, cela évite de répéter « 2026 » six fois).
 */
export function anneeAAfficher(donnees, index) {
  const { annee, mois } = decouper(donnees[index].mois);
  return index === 0 || mois === 1 ? String(annee) : null;
}

/** Aucune valeur strictement positive : le graphique n'aurait que des barres vides. */
export function estVide(donnees, cleValeur) {
  return !Array.isArray(donnees) || donnees.every((d) => !(Number(d[cleValeur]) > 0));
}

/** Texte de l'infobulle d'une colonne : « novembre 2026 : 12 000 FCFA ». */
export function texteInfobulle(cleMois, valeur, { langue = "fr", unite = "" } = {}) {
  const nombre = Number(valeur).toLocaleString(locale(langue));
  return `${moisComplet(cleMois, langue)} : ${nombre}${unite ? ` ${unite}` : ""}`;
}
