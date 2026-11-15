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

// Délai maximal d'un appel (ms). Sans lui, un service lent ou muet suspend la requête de
// l'utilisateur (inscription, mot de passe oublié, invitation) et, dans le cron, tous les envois
// suivants, jusqu'à l'arrêt de la fonction par la plateforme.
const DELAI_PAR_DEFAUT_MS = 8000;
function delaiMs() {
  const v = Number(process.env.RESEND_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? v : DELAI_PAR_DEFAUT_MS;
}

/**
 * Envoie un email via l'API Resend. Lance une erreur explicite en cas
 * d'échec (clé absente/invalide, adresse rejetée, panne réseau...) — à
 * l'appelant de décider si cet échec doit bloquer l'action en cours ou
 * simplement être journalisé (voir usages : auth.routes.js).
 */
export async function envoyerEmail({ to, subject, html }) {
  const apiKey = requireApiKey();
  const delai = delaiMs();
  let res;
  try {
    res = await fetchResend(apiKey, { to, subject, html }, delai);
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new Error(`Resend n'a pas répondu dans le délai imparti (${delai} ms) : délai dépassé.`);
    }
    throw err;
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.message || `Erreur Resend (HTTP ${res.status}).`;
    throw new Error(message);
  }
  return data;
}

function fetchResend(apiKey, { to, subject, html }, delai) {
  return fetch(`${RESEND_API_BASE}/emails`, {
    signal: AbortSignal.timeout(delai),
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
}
