import { Smartphone, Landmark, Wallet } from "lucide-react";

// Doit rester synchronisé avec l'enum Prisma MoyenPaiement (schema.prisma).
// WAVE = vérification automatique (webhook signé + relecture serveur, voir
// backend/src/routes/webhooks.routes.js). NITA/AMANA = confirmation
// MANUELLE uniquement (aucune API exploitable aujourd'hui, voir audit
// Phase 6) — jamais présentée comme une vérification automatique.
export const MOYENS_PAIEMENT = [
  { value: "WAVE", label: "Wave", icon: Smartphone, verificationAutomatique: true },
  { value: "NITA", label: "NITA", icon: Landmark, verificationAutomatique: false },
  { value: "AMANA", label: "Amana", icon: Wallet, verificationAutomatique: false },
];

export function moyenPaiementInfo(value) {
  return MOYENS_PAIEMENT.find((m) => m.value === value);
}

// Doit rester synchronisé avec statutEffectif() (backend/src/lib/abonnement.js).
export const STATUT_ABONNEMENT_LABELS = {
  EN_ATTENTE: "En attente de paiement",
  ACTIF: "Actif",
  EXPIRE: "Expiré",
  ANNULE: "Annulé",
};

export const STATUT_TRANSACTION_LABELS = {
  EN_ATTENTE: "En attente",
  REUSSIE: "Réussie",
  ECHOUEE: "Échouée",
};

function formatDateFr(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export { formatDateFr };
