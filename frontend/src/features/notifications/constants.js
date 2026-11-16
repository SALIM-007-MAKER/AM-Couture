import { AlertTriangle, CheckCircle2, Truck, CircleOff, Hammer, PackageMinus, ShoppingCart } from "lucide-react";
import { uniteLabel } from "../stock/constants.js";
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
  get TACHE_AFFECTEE() { return translate("notif.label.TACHE_AFFECTEE"); },
  get STOCK_BAS() { return translate("notif.label.STOCK_BAS"); },
  get ACHAT_EN_RETARD() { return translate("notif.label.ACHAT_EN_RETARD"); },
};

export const NOTIFICATION_ICONS = {
  RETARD: AlertTriangle,
  PRET: CheckCircle2,
  LIVRAISON_PROCHE: Truck,
  IMPAYE: CircleOff,
  TACHE_AFFECTEE: Hammer,
  STOCK_BAS: PackageMinus,
  ACHAT_EN_RETARD: ShoppingCart,
};

export const NOTIFICATION_TONES = {
  RETARD: "danger",
  PRET: "success",
  LIVRAISON_PROCHE: "warning",
  IMPAYE: "warning",
  TACHE_AFFECTEE: "success",
  STOCK_BAS: "warning",
  ACHAT_EN_RETARD: "danger",
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(useLocaleStore.getState().locale === "en" ? "en-GB" : "fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

/** Où mène la notification : la commande, l'article de stock ou l'achat concerné, et le texte qui la précède (client). */
export function notificationCible(notif) {
  if (notif.type === "STOCK_BAS") return { to: `/stock/${notif.article.id}`, prefixe: "" };
  if (notif.type === "ACHAT_EN_RETARD") return { to: `/achats/${notif.achat.id}`, prefixe: "" };
  const c = notif.commande;
  return { to: `/commandes/${c.id}`, prefixe: `${c.cliente.nom} ${c.cliente.prenom} — ` };
}

// Message reconstruit à l'affichage à partir de la commande/cliente réelles
// (voir backend/src/lib/notifications.js — la table Notification ne stocke
// aucun texte) : jamais de contenu figé qui pourrait devenir faux.
export function notificationMessage(notif) {
  if (notif.type === "STOCK_BAS") {
    const a = notif.article;
    return translate("notif.msg.STOCK_BAS", { nom: a.nom, quantite: a.quantite, unite: uniteLabel(a.unite), seuil: a.seuilAlerte });
  }
  if (notif.type === "ACHAT_EN_RETARD") {
    const a = notif.achat;
    return translate("notif.msg.ACHAT_EN_RETARD", { numero: a.numero, fournisseur: a.fournisseur.nom, date: formatDate(a.dateAttendue) });
  }
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
    case "TACHE_AFFECTEE":
      return translate("notif.msg.TACHE_AFFECTEE", { ...vars, date: formatDate(c.dateLivraisonPrevue) });
    default:
      return c.numero;
  }
}
