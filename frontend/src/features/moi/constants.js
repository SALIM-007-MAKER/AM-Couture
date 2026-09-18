import { ClipboardList, RefreshCw, Ban, Wallet, PackageCheck, FileText, CheckCircle2, XCircle } from "lucide-react";

// Fil d'activité du client (§ notifications atelier <-> client) —
// présentation uniquement, aligné sur TypeNotificationClient (schema.prisma).
// Contrairement à features/notifications/constants.js (côté ADMIN), pas de
// fonction de message : le texte est déjà figé côté backend au moment de
// l'événement (voir lib/notificationsClient.js), jamais recalculé ici.
// Clés i18n (voir i18n/fr.js "notificationsClient") plutôt que des libellés
// en dur, résolues via t() côté composant — même convention que labelKey
// (AppLayout.jsx).
export const NOTIFICATION_CLIENT_LABEL_KEYS = {
  COMMANDE_CREEE: "notificationsClient.COMMANDE_CREEE",
  COMMANDE_STATUT_CHANGE: "notificationsClient.COMMANDE_STATUT_CHANGE",
  COMMANDE_ANNULEE: "notificationsClient.COMMANDE_ANNULEE",
  PAIEMENT_ENREGISTRE: "notificationsClient.PAIEMENT_ENREGISTRE",
  LIVRAISON_ENREGISTREE: "notificationsClient.LIVRAISON_ENREGISTREE",
  RECU_EMIS: "notificationsClient.RECU_EMIS",
  DEMANDE_ACCEPTEE: "notificationsClient.DEMANDE_ACCEPTEE",
  DEMANDE_REFUSEE: "notificationsClient.DEMANDE_REFUSEE",
};

export const NOTIFICATION_CLIENT_ICONS = {
  COMMANDE_CREEE: ClipboardList,
  COMMANDE_STATUT_CHANGE: RefreshCw,
  COMMANDE_ANNULEE: Ban,
  PAIEMENT_ENREGISTRE: Wallet,
  LIVRAISON_ENREGISTREE: PackageCheck,
  RECU_EMIS: FileText,
  DEMANDE_ACCEPTEE: CheckCircle2,
  DEMANDE_REFUSEE: XCircle,
};

export const NOTIFICATION_CLIENT_TONES = {
  COMMANDE_CREEE: "success",
  COMMANDE_STATUT_CHANGE: "warning",
  COMMANDE_ANNULEE: "danger",
  PAIEMENT_ENREGISTRE: "success",
  LIVRAISON_ENREGISTREE: "success",
  RECU_EMIS: "success",
  DEMANDE_ACCEPTEE: "success",
  DEMANDE_REFUSEE: "danger",
};
