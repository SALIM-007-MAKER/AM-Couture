// Libellés de PRÉSENTATION uniquement — les valeurs reflètent l'enum Prisma
// CategorieVetement réel (voir backend/src/schemas/modele.schema.js).
// Aucune validation ici : elle reste exclusivement côté backend.
export const CATEGORIES_VETEMENT = [
  { value: "ROBE", label: "Robe" },
  { value: "BOUBOU", label: "Boubou" },
  { value: "ENSEMBLE", label: "Ensemble" },
  { value: "PANTALON", label: "Pantalon" },
  { value: "CHEMISE", label: "Chemise" },
  { value: "JUPE", label: "Jupe" },
  { value: "KAFTAN", label: "Kaftan" },
  { value: "COSTUME", label: "Costume" },
  { value: "TENUE_TRADITIONNELLE", label: "Tenue traditionnelle" },
  { value: "AUTRE", label: "Autre" },
];

export function categorieLabel(value) {
  return CATEGORIES_VETEMENT.find((c) => c.value === value)?.label ?? value;
}
