import { translate } from "../../i18n/index.js";
// Libellés de PRÉSENTATION uniquement — les valeurs reflètent l'enum Prisma
// UniteStock réel (voir backend/src/schemas/articleStock.schema.js). Aucune
// validation ici : elle reste exclusivement côté backend.
export const UNITES_STOCK = ["METRE", "PIECE", "KG", "LITRE", "ROULEAU", "PAQUET", "AUTRE"].map((value) => ({
  value,
  get label() {
    return translate("stockMore.units." + value);
  },
}));

export function uniteLabel(value) {
  return UNITES_STOCK.find((u) => u.value === value)?.label ?? value;
}

export const TYPES_MOUVEMENT = ["ENTREE", "SORTIE"].map((value) => ({
  value,
  get label() {
    return translate("stockMore.movementTypes." + value);
  },
}));
