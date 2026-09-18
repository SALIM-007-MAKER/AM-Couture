import { AlertTriangle, CheckCircle2, Truck, CircleOff } from "lucide-react";
import { categorieLabel } from "../modeles/constants.js";
import { statutLabel } from "../commandes/constants.js";
import { translate } from "../../i18n/index.js";
import { useLocaleStore } from "../../stores/localeStore.js";

// Aligné sur l'enum Prisma NotificationType (schema.prisma) — présentation
// uniquement, comme les autres tables de libellés du projet (statutLabel,
// categorieLabel...).
export const NOTIFICATION_LABELS = {
  get RETARD() { return translate("notif.label.RETARD"); },
  get PRET() { return translate("notif.label.PRET"); },
  get LIVRAISON_PROCHE() { return translate("notif.label.LIVRAISON_PROCHE"); },
  get IMPAYE() { return translate("notif.label.IMPAYE"); },
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
  return new Date(iso).toLocaleDateString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

// Message reconstruit à l'affichage à partir de la commande/cliente réelles
// (voir backend/src/lib/notifications.js — la table Notification ne stocke
// aucun texte) : jamais de contenu figé qui pourrait devenir faux.
export function notificationMessage(notif) {
  const c = notif.commande;
  const modele = c.modele?.nom || categorieLabel(c.typeVetement);
  const vars = { numero: c.numero, modele };
  switch (notif.type) {
    case "RETARD":
      return translate("notif.msg.RETARD", { ...vars, date: formatDate(c.dateLivraisonPrevue) });
    case "PRET":
      return translate("notif.msg.PRET", { ...vars, statut: statutLabel(c.statut) });
    case "LIVRAISON_PROCHE":
      return translate("notif.msg.LIVRAISON_PROCHE", { ...vars, date: formatDate(c.dateLivraisonPrevue) });
    case "IMPAYE":
      return translate("notif.msg.IMPAYE", vars);
    default:
      return c.numero;
  }
}
