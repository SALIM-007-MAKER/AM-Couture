import { Clock, CheckCircle2, XCircle } from "lucide-react";

// Aligné sur l'enum Prisma StatutDemandeCommande (schema.prisma) —
// présentation uniquement, même convention que statutLabel (commandes).
export const STATUTS_DEMANDE = [
  { value: "EN_ATTENTE", label: "En attente" },
  { value: "ACCEPTEE", label: "Acceptée" },
  { value: "REFUSEE", label: "Refusée" },
];

export const STATUT_DEMANDE_ICONS = {
  EN_ATTENTE: Clock,
  ACCEPTEE: CheckCircle2,
  REFUSEE: XCircle,
};

export const STATUT_DEMANDE_COLORS = {
  EN_ATTENTE: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  ACCEPTEE: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  REFUSEE: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export function statutDemandeLabel(value) {
  return STATUTS_DEMANDE.find((s) => s.value === value)?.label ?? value;
}
