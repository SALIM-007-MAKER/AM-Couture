import { Sparkles, Scissors, UserCheck, Wrench, CheckCircle2, PackageCheck, Ban, CircleOff, Clock } from "lucide-react";

// Libellés de PRÉSENTATION uniquement — les valeurs et transitions reflètent
// exactement l'enum Prisma StatutCommande et STATUT_TRANSITIONS réels (voir
// backend/src/schemas/commande.schema.js). Aucune règle métier recalculée
// ici : l'affichage des boutons de transition n'est qu'un confort d'usage,
// le backend reste l'unique source de vérité et revalide tout côté serveur.

export const STATUTS_COMMANDE = [
  { value: "NOUVELLE", label: "Nouvelle" },
  { value: "EN_CONFECTION", label: "En confection" },
  { value: "ESSAYAGE", label: "Essayage" },
  { value: "RETOUCHES", label: "Retouches" },
  { value: "TERMINEE", label: "Terminée" },
  { value: "LIVREE", label: "Livrée" },
  { value: "ANNULEE", label: "Annulée" },
];

export const PRIORITES = [
  { value: "NORMALE", label: "Normale" },
  { value: "URGENTE", label: "Urgente" },
];

export const MODES_PAIEMENT = [
  { value: "ESPECES", label: "Espèces" },
  { value: "MOBILE_MONEY", label: "Mobile Money" },
  { value: "VIREMENT", label: "Virement" },
  { value: "AUTRE", label: "Autre" },
];

// Contrairement aux listes ci-dessus, `tissu` (Commande.tissu, voir
// schema.prisma) n'est PAS un enum côté backend — un simple texte libre
// (optionalTrimmed(100)) qui accepte déjà n'importe quelle valeur. Cette
// liste n'est qu'une aide de saisie (suggestions les plus courantes dans un
// atelier de couture ouest-africain) ; l'option "Autre" du formulaire
// retombe sur un champ texte libre pour tout le reste.
export const TISSUS_SUGGERES = [
  "Bazin riche",
  "Bazin getzner",
  "Super bazin",
  "Bazin brodé",
  "Wax",
  "Pagne tissé",
  "Coton",
  "Soie",
  "Lin",
  "Dentelle",
  "Mousseline",
  "Satin",
  "Velours",
  "Jersey",
];

// Copie de présentation de backend/src/schemas/commande.schema.js —
// STATUT_TRANSITIONS. Sert uniquement à savoir quels boutons de transition
// proposer ; le backend revalide indépendamment (409 sinon).
export const STATUT_TRANSITIONS = {
  NOUVELLE: ["EN_CONFECTION", "ANNULEE"],
  EN_CONFECTION: ["ESSAYAGE", "ANNULEE"],
  ESSAYAGE: ["RETOUCHES", "TERMINEE", "ANNULEE"],
  RETOUCHES: ["ESSAYAGE", "TERMINEE", "ANNULEE"],
  TERMINEE: ["LIVREE", "ANNULEE"],
  LIVREE: [],
  ANNULEE: [],
};

// Une icône par statut — présentation uniquement, même logique que ci-dessus.
export const STATUT_ICONS = {
  NOUVELLE: Sparkles,
  EN_CONFECTION: Scissors,
  ESSAYAGE: UserCheck,
  RETOUCHES: Wrench,
  TERMINEE: CheckCircle2,
  LIVREE: PackageCheck,
  ANNULEE: Ban,
};

// Statut de PAIEMENT — distinct du statut de commande ci-dessus (jamais
// mélangés). Purement dérivé côté backend (voir statutPaiement(),
// backend/src/lib/money.js) à partir de prixTotal/totalPaye, jamais stocké :
// cette liste ne reflète qu'un affichage, pas une valeur saisissable.
export const STATUTS_PAIEMENT = [
  { value: "NON_PAYE", label: "Non payé" },
  { value: "PARTIELLEMENT_PAYE", label: "Partiellement payé" },
  { value: "PAYE", label: "Payé" },
];

export const STATUT_PAIEMENT_ICONS = {
  NON_PAYE: CircleOff,
  PARTIELLEMENT_PAYE: Clock,
  PAYE: CheckCircle2,
};

export function statutPaiementLabel(value) {
  return STATUTS_PAIEMENT.find((s) => s.value === value)?.label ?? value;
}

export function statutLabel(value) {
  return STATUTS_COMMANDE.find((s) => s.value === value)?.label ?? value;
}
export function prioriteLabel(value) {
  return PRIORITES.find((p) => p.value === value)?.label ?? value;
}
export function modeLabel(value) {
  return MODES_PAIEMENT.find((m) => m.value === value)?.label ?? value;
}
