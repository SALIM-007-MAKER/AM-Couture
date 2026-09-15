// Client Resend (resend.com) — AUCUNE simulation, même principe que
// lib/wave.js : si RESEND_API_KEY n'est pas configurée, tout envoi échoue
// explicitement (voir requireApiKey) plutôt que de prétendre avoir envoyé
// un email qui n'existe pas. Appel direct à l'API REST (fetch), pas de SDK
// — même choix que Wave, une dépendance de moins pour un client HTTP simple.
const RESEND_API_BASE = "https://api.resend.com";

function requireApiKey() {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY manquant : configurez la clé API Resend (variable d'environnement) avant d'envoyer des emails.",
    );
  }
  return key;
}

// Expéditeur configurable (domaine vérifié une fois disponible) — replié sur
// le domaine de test partagé de Resend (onboarding@resend.dev), utilisable
// sans vérification de domaine mais uniquement adapté à la mise en route :
// Resend recommande un domaine propre vérifié dès que possible en production
// (meilleure délivrabilité, pas de risque de blocage du domaine partagé).
const FROM_DEFAULT = "Gestion d'Atelier <onboarding@resend.dev>";

/**
 * Envoie un email via l'API Resend. Lance une erreur explicite en cas
 * d'échec (clé absente/invalide, adresse rejetée, panne réseau...) — à
 * l'appelant de décider si cet échec doit bloquer l'action en cours ou
 * simplement être journalisé (voir usages : auth.routes.js).
 */
export async function envoyerEmail({ to, subject, html }) {
  const apiKey = requireApiKey();
  const res = await fetch(`${RESEND_API_BASE}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || FROM_DEFAULT,
      to,
      subject,
      html,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.message || `Erreur Resend (HTTP ${res.status}).`;
    throw new Error(message);
  }
  return data;
}
