import { translate } from "../../i18n/index.js";

// Libellés de PRÉSENTATION uniquement — les valeurs reflètent l'enum Prisma
// CategorieVetement réel (voir backend/src/schemas/modele.schema.js).
// Aucune validation ici : elle reste exclusivement côté backend.
const categorie = (value) => ({ value, get label() { return translate(`modele.categorie.${value}`); } });

export const CATEGORIES_VETEMENT = [
  "ROBE",
  "BOUBOU",
  "ENSEMBLE",
  "PANTALON",
  "CHEMISE",
  "JUPE",
  "KAFTAN",
  "COSTUME",
  "TENUE_TRADITIONNELLE",
  "AUTRE",
].map(categorie);

export function categorieLabel(value) {
  return CATEGORIES_VETEMENT.find((c) => c.value === value)?.label ?? value;
}
