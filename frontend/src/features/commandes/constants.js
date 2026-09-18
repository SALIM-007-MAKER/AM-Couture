import { translate } from "../../i18n/index.js";
import { useLocaleStore } from "../../stores/localeStore.js";
import { Sparkles, Scissors, UserCheck, Wrench, CheckCircle2, PackageCheck, Ban, CircleOff, Clock } from "lucide-react";

// Libellés de PRÉSENTATION uniquement — les valeurs et transitions reflètent
// exactement l'enum Prisma StatutCommande et STATUT_TRANSITIONS réels (voir
// backend/src/schemas/commande.schema.js). Aucune règle métier recalculée
// ici : l'affichage des boutons de transition n'est qu'un confort d'usage,
// le backend reste l'unique source de vérité et revalide tout côté serveur.

// Locale des dates affichées dans la zone commandes/paiements/livraisons/
// reçus/dépenses : suit la langue de l'interface (fr-FR / en-GB).
export function dateLocale() {
  return useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR";
}

export const STATUTS_COMMANDE = [
  { value: "NOUVELLE", get label() { return translate("cmdConst.statut.NOUVELLE"); } },
  { value: "EN_CONFECTION", get label() { return translate("cmdConst.statut.EN_CONFECTION"); } },
  { value: "ESSAYAGE", get label() { return translate("cmdConst.statut.ESSAYAGE"); } },
  { value: "RETOUCHES", get label() { return translate("cmdConst.statut.RETOUCHES"); } },
  { value: "TERMINEE", get label() { return translate("cmdConst.statut.TERMINEE"); } },
  { value: "LIVREE", get label() { return translate("cmdConst.statut.LIVREE"); } },
  { value: "ANNULEE", get label() { return translate("cmdConst.statut.ANNULEE"); } },
];

export const PRIORITES = [
  { value: "NORMALE", get label() { return translate("cmdConst.priorite.NORMALE"); } },
  { value: "URGENTE", get label() { return translate("cmdConst.priorite.URGENTE"); } },
];

export const MODES_PAIEMENT = [
  { value: "ESPECES", get label() { return translate("cmdConst.mode.ESPECES"); } },
  { value: "MOBILE_MONEY", get label() { return translate("cmdConst.mode.MOBILE_MONEY"); } },
  { value: "VIREMENT", get label() { return translate("cmdConst.mode.VIREMENT"); } },
  { value: "AUTRE", get label() { return translate("cmdConst.mode.AUTRE"); } },
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
  { value: "NON_PAYE", get label() { return translate("cmdConst.statutPaiement.NON_PAYE"); } },
  { value: "PARTIELLEMENT_PAYE", get label() { return translate("cmdConst.statutPaiement.PARTIELLEMENT_PAYE"); } },
  { value: "PAYE", get label() { return translate("cmdConst.statutPaiement.PAYE"); } },
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
