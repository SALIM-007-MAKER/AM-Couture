import crypto from "node:crypto";

// Client Wave Business API (docs.wave.com/business) — AUCUNE simulation :
// si WAVE_API_KEY n'est pas configurée, toute tentative de création de
// session échoue explicitement (503, voir abonnements.routes.js) plutôt que
// de prétendre avoir créé un paiement qui n'existe pas.
const WAVE_API_BASE = "https://api.wave.com/v1";

// Devise ISO 4217 imposée par l'API Wave — indépendante de Atelier.devise
// (simple libellé libre affiché sur les documents, ex: "FCFA") : le Franc
// CFA BCEAO a pour code ISO "XOF", c'est ce que Wave attend, quel que soit
// le texte configuré dans Paramètres.
const WAVE_CURRENCY = "XOF";

function requireApiKey() {
  const key = process.env.WAVE_API_KEY;
  if (!key) {
    throw new Error(
      "WAVE_API_KEY manquant : configurez la clé API Wave Business (variable d'environnement) avant d'accepter des paiements Wave.",
    );
  }
  return key;
}

async function waveFetch(path, options = {}) {
  const apiKey = requireApiKey();
  const res = await fetch(`${WAVE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.message || `Erreur Wave (HTTP ${res.status}).`;
    const err = new Error(message);
    err.waveStatus = res.status;
    err.waveBody = data;
    throw err;
  }
  return data;
}

/**
 * Crée une session de paiement Wave. `referenceInterne` est envoyé comme
 * client_reference — c'est notre clé d'idempotence, elle permet de
 * retrouver la Transaction correspondante depuis le webhook ou une
 * vérification manuelle, sans jamais dépendre de l'ID de session Wave seul.
 */
export async function creerSessionCheckout({ montant, referenceInterne, successUrl, errorUrl }) {
  return waveFetch("/checkout/sessions", {
    method: "POST",
    body: JSON.stringify({
      amount: String(montant),
      currency: WAVE_CURRENCY,
      client_reference: referenceInterne,
      success_url: successUrl,
      error_url: errorUrl,
    }),
  });
}

/**
 * Relit une session DIRECTEMENT chez Wave (pas depuis notre base) — utilisée
 * en défense en profondeur après un webhook, pour ne jamais confirmer un
 * paiement sur la seule foi d'une requête reçue (voir consigne : "aucun
 * paiement confirmé sans vérification fiable").
 */
export async function recupererSession(sessionId) {
  return waveFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

const SIGNATURE_MAX_AGE_SECONDS = 5 * 60; // fenêtre anti-rejeu recommandée par Wave

/**
 * Vérifie l'en-tête `Wave-Signature: t=<timestamp>,v1=<sig>[,v1=<sig2>...]`.
 * Chaîne signée = `${timestamp}${corpsBrut}` (concaténation directe, sans
 * séparateur — spec Wave). Comparaison en temps constant (timingSafeEqual)
 * pour éviter une fuite d'information par mesure de latence. `rawBody` DOIT
 * être le Buffer brut de la requête (voir app.js, option `verify` de
 * express.json) : reparser/reformater le JSON avant de signer casserait
 * silencieusement la vérification (espaces, ordre des clés...).
 */
export function verifierSignatureWebhook(rawBody, signatureHeader, secret) {
  if (!signatureHeader || typeof signatureHeader !== "string") return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    }),
  );
  const timestamp = parts.t;
  const signatures = signatureHeader
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));

  if (!timestamp || signatures.length === 0) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > SIGNATURE_MAX_AGE_SECONDS) return false;

  const payload = `${timestamp}${rawBody.toString("utf8")}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
  });
}
