// Libellés de PRÉSENTATION uniquement — les valeurs reflètent l'enum Prisma
// UniteStock réel (voir backend/src/schemas/articleStock.schema.js). Aucune
// validation ici : elle reste exclusivement côté backend.
export const UNITES_STOCK = [
  { value: "METRE", label: "Mètre" },
  { value: "PIECE", label: "Pièce" },
  { value: "KG", label: "Kilogramme" },
  { value: "LITRE", label: "Litre" },
  { value: "ROULEAU", label: "Rouleau" },
  { value: "PAQUET", label: "Paquet" },
  { value: "AUTRE", label: "Autre" },
];

export function uniteLabel(value) {
  return UNITES_STOCK.find((u) => u.value === value)?.label ?? value;
}

export const TYPES_MOUVEMENT = [
  { value: "ENTREE", label: "Entrée" },
  { value: "SORTIE", label: "Sortie" },
];
