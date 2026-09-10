// Métadonnées de PRÉSENTATION uniquement (libellés, ordre d'affichage) — les
// valeurs elles-mêmes reflètent les enums/champs Prisma réels (voir
// backend/src/schemas/cliente.schema.js et mesure.schema.js). Toute
// validation (format, bornes, unicité) reste exclusivement côté backend.

export const SEXE_OPTIONS = [
  { value: "FEMME", label: "Femme" },
  { value: "HOMME", label: "Homme" },
  { value: "AUTRE", label: "Autre" },
];

export const MESURE_FIELDS = [
  { name: "epaule", label: "Épaule" },
  { name: "poitrine", label: "Poitrine" },
  { name: "taille", label: "Taille" },
  { name: "hanches", label: "Hanches" },
  { name: "longueur", label: "Longueur" },
  { name: "longueurRobe", label: "Longueur robe" },
  { name: "longueurJupe", label: "Longueur jupe" },
  { name: "longueurPantalon", label: "Longueur pantalon" },
  { name: "longueurManche", label: "Longueur manche" },
  { name: "tourBras", label: "Tour de bras" },
  { name: "tourCou", label: "Tour de cou" },
  { name: "tourPoignet", label: "Tour de poignet" },
  { name: "tourCuisse", label: "Tour de cuisse" },
  { name: "tourGenou", label: "Tour de genou" },
];
