import { ClipboardList, RefreshCw, Ban, Wallet, PackageCheck, FileText, CheckCircle2, XCircle } from "lucide-react";

// Fil d'activité du client (§ notifications atelier <-> client) —
// présentation uniquement, aligné sur TypeNotificationClient (schema.prisma).
// Contrairement à features/notifications/constants.js (côté ADMIN), pas de
// fonction de message : le texte est déjà figé côté backend au moment de
// l'événement (voir lib/notificationsClient.js), jamais recalculé ici.
export const NOTIFICATION_CLIENT_LABELS = {
  COMMANDE_CREEE: "Commande enregistrée",
  COMMANDE_STATUT_CHANGE: "Mise à jour",
  COMMANDE_ANNULEE: "Commande annulée",
  PAIEMENT_ENREGISTRE: "Paiement",
  LIVRAISON_ENREGISTREE: "Livraison",
  RECU_EMIS: "Reçu",
  DEMANDE_ACCEPTEE: "Demande acceptée",
  DEMANDE_REFUSEE: "Demande refusée",
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
