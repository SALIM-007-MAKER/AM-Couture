import { translate } from "../../i18n/index.js";
import { useLocaleStore } from "../../stores/localeStore.js";

// Date au format long dans la langue courante (fr-FR / en-GB).
export function formatDate(iso, options = { year: "numeric", month: "long", day: "numeric" }) {
  return new Date(iso).toLocaleDateString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", options);
}

// Métadonnées de PRÉSENTATION uniquement (libellés, ordre d'affichage) — les
// valeurs elles-mêmes reflètent les enums/champs Prisma réels (voir
// backend/src/schemas/cliente.schema.js et mesure.schema.js). Toute
// validation (format, bornes, unicité) reste exclusivement côté backend.
// Les libellés sont des getters (translate(), i18n/index.js) : la forme
// { value, label } reste identique pour tous les consommateurs.

export const SEXE_OPTIONS = [
  { value: "FEMME", get label() { return translate("cli.sexe.FEMME"); } },
  { value: "HOMME", get label() { return translate("cli.sexe.HOMME"); } },
  { value: "AUTRE", get label() { return translate("cli.sexe.AUTRE"); } },
];

const mesureField = (name) => ({ name, get label() { return translate(`cli.mesure.${name}`); } });

export const MESURE_FIELDS = [
  "epaule",
  "poitrine",
  "taille",
  "hanches",
  "longueur",
  "longueurRobe",
  "longueurJupe",
  "longueurPantalon",
  "longueurManche",
  "tourBras",
  "tourCou",
  "tourPoignet",
  "tourCuisse",
  "tourGenou",
].map(mesureField);

// Regroupement PUREMENT visuel des 14 champs ci-dessus (aucun champ ajouté,
// aucun renommage côté backend) — un même `name` ne peut apparaître que dans
// un seul groupe. Toute mesure non prévue par ces 14 champs (carrure dos,
// longueur bras, longueur d'ourlet, etc.) reste saisie via "Mesures
// supplémentaires" (champ libre `autres`, voir MesureFormPage.jsx) plutôt que
// d'ajouter des colonnes dédiées sans besoin confirmé.
export const MESURE_GROUPS = [
  { key: "haut", get label() { return translate("cli.group.haut"); }, fields: ["poitrine", "taille", "epaule", "tourCou"] },
  { key: "bras", get label() { return translate("cli.group.bras"); }, fields: ["tourBras", "tourPoignet"] },
  { key: "bas", get label() { return translate("cli.group.bas"); }, fields: ["hanches", "tourCuisse", "tourGenou"] },
  {
    key: "longueurs",
    get label() { return translate("cli.group.longueurs"); },
    fields: ["longueur", "longueurRobe", "longueurJupe", "longueurPantalon", "longueurManche"],
  },
];
