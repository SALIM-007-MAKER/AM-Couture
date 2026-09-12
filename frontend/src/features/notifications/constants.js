import { AlertTriangle, CheckCircle2, Truck, CircleOff } from "lucide-react";
import { categorieLabel } from "../modeles/constants.js";
import { statutLabel } from "../commandes/constants.js";

// Aligné sur l'enum Prisma NotificationType (schema.prisma) — présentation
// uniquement, comme les autres tables de libellés du projet (statutLabel,
// categorieLabel...).
export const NOTIFICATION_LABELS = {
  RETARD: "En retard",
  PRET: "Prête",
  LIVRAISON_PROCHE: "Livraison proche",
  IMPAYE: "Impayée",
};

export const NOTIFICATION_ICONS = {
  RETARD: AlertTriangle,
  PRET: CheckCircle2,
  LIVRAISON_PROCHE: Truck,
  IMPAYE: CircleOff,
};

export const NOTIFICATION_TONES = {
  RETARD: "danger",
  PRET: "success",
  LIVRAISON_PROCHE: "warning",
  IMPAYE: "warning",
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

// Message reconstruit à l'affichage à partir de la commande/cliente réelles
// (voir backend/src/lib/notifications.js — la table Notification ne stocke
// aucun texte) : jamais de contenu figé qui pourrait devenir faux.
export function notificationMessage(notif) {
  const c = notif.commande;
  const modele = c.modele?.nom || categorieLabel(c.typeVetement);
  switch (notif.type) {
    case "RETARD":
      return `${c.numero} (${modele}) — en retard, livraison prévue le ${formatDate(c.dateLivraisonPrevue)}.`;
    case "PRET":
      return `${c.numero} (${modele}) — prête à récupérer (statut : ${statutLabel(c.statut)}).`;
    case "LIVRAISON_PROCHE":
      return `${c.numero} (${modele}) — à livrer le ${formatDate(c.dateLivraisonPrevue)}.`;
    case "IMPAYE":
      return `${c.numero} (${modele}) — aucun paiement enregistré.`;
    default:
      return c.numero;
  }
}
