import { Sparkles, Scissors, UserCheck, Wrench, CheckCircle2, PackageCheck, Ban } from "lucide-react";

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

export function statutLabel(value) {
  return STATUTS_COMMANDE.find((s) => s.value === value)?.label ?? value;
}
export function prioriteLabel(value) {
  return PRIORITES.find((p) => p.value === value)?.label ?? value;
}
export function modeLabel(value) {
  return MODES_PAIEMENT.find((m) => m.value === value)?.label ?? value;
}
