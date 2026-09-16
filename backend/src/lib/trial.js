// Essai gratuit de 7 jours (§ plan trial/abonnement) — voir Atelier.trialEndsAt,
// posé une seule fois à la création, jamais recalculé.

/**
 * `trialEndsAt` null = atelier créé AVANT l'introduction de cette
 * fonctionnalité ("légataire") — jamais considéré comme expiré, quelle que
 * soit la date du jour. Seul un atelier avec une échéance réelle peut
 * effectivement expirer.
 */
export function essaiExpire(atelier, now = new Date()) {
  if (!atelier.trialEndsAt) return false;
  return now >= new Date(atelier.trialEndsAt);
}
