import { codeNotification, messageNotification } from "./messagesServeur.js";

// Fil d'activité du client final (§ notifications atelier <-> client) — voir
// le commentaire complet du modèle NotificationClient, schema.prisma :
// contrairement à Notification (ADMIN, recalculée), ce sont des ÉVÉNEMENTS
// figés au moment où ils se produisent, jamais recalculés après coup.
//
// `client` (pas `prisma` fixe) : chaque appelant passe systématiquement son
// client de transaction (`tx`) — un événement doit toujours être inséré
// DANS la même transaction que l'écriture qu'il rapporte, jamais après coup
// en best-effort (contrairement aux emails, voir routes/auth.routes.js) :
// une commande créée sans que son événement n'existe serait un vrai trou
// silencieux dans le fil d'activité du client, pas un simple email en
// moins.
//
// 7.7 : l'événement enregistre un CODE et des PARAMÈTRES (`params`), le message est composé à la lecture dans la langue de
// la cliente (lib/messagesServeur.js). Le texte français est aussi conservé dans `message` (secours, export, lignes
// antérieures). `message` seul reste accepté pour un texte libre sans traduction.
export function creerNotificationClient(client, { clienteId, commandeId, type, params, message }) {
  const code = params ? codeNotification(type, params) : null;
  return client.notificationClient.create({
    data: {
      clienteId,
      commandeId: commandeId ?? null,
      type,
      message: code ? messageNotification(code, params, "fr") : message,
      code,
      params: params ?? undefined,
    },
  });
}

// Libellés de statut de commande, présentation uniquement — copie
// volontairement minimale de STATUTS_COMMANDE (frontend/src/features/commandes/constants.js) :
// nécessaire ici pour figer le texte du message au moment de l'événement,
// jamais pour une décision métier (voir schemas/commande.schema.js pour la
// seule source de vérité sur les transitions autorisées).
export const STATUT_COMMANDE_LABELS = {
  NOUVELLE: "Nouvelle",
  EN_CONFECTION: "En confection",
  ESSAYAGE: "Essayage",
  RETOUCHES: "Retouches",
  TERMINEE: "Terminée",
  LIVREE: "Livrée",
  ANNULEE: "Annulée",
};
