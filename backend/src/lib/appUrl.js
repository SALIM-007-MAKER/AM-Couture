/**
 * Origine publique de l'application, utilisée pour construire les liens envoyés
 * par email (vérification, réinitialisation, invitation, rappels).
 *
 * Si `PUBLIC_APP_URL` est définie (ex. https://app.mondomaine.com), elle est
 * utilisée TELLE QUELLE : un lien de réinitialisation ne doit jamais dépendre
 * d'un en-tête `Host` fourni par l'appelant (empoisonnement de lien : un
 * attaquant déclenche « mot de passe oublié » pour une victime avec un Host
 * forgé, et le jeton part vers son domaine au clic). Sans cette variable, repli
 * sur la requête (comportement historique, derrière le routage par domaine de
 * Vercel).
 */
export function origineApplication(req) {
  const configuree = process.env.PUBLIC_APP_URL;
  if (configuree) {
    try {
      const u = new URL(configuree);
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      // Valeur invalide : on retombe sur la requête plutôt que de casser l'envoi.
    }
  }
  return `${req.protocol}://${req.get("host")}`;
}
