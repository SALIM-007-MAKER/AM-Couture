import crypto from "node:crypto";

// Client Wave Business API (docs.wave.com/business) — AUCUNE simulation : si Wave n'est pas configuré, toute
// tentative échoue explicitement plutôt que de prétendre avoir créé ou vérifié un paiement qui n'existe pas.
//
// INACTIF PAR DÉFAUT. Le paiement Wave n'est proposé que si TROIS conditions sont réunies (voir paiementWaveActif) :
//   WAVE_ENABLED=1, WAVE_API_KEY et WAVE_WEBHOOK_SECRET. Wave ne confirme pas sa disponibilité au Niger (voir
//   docs/PHASE5-ANALYSE.md) : tant que l'exploitant n'a pas un compte Wave Business valide, rien de ce qui suit ne
//   s'exécute en production.
//
// Contrat vérifié le 15/11/2026 sur docs.wave.com (Checkout, Webhooks). Les noms de champs sont à reconfirmer
// au premier essai réel : aucun appel à l'API réelle n'a pu être fait pendant le développement.

const WAVE_API_BASE_PAR_DEFAUT = "https://api.wave.com/v1";
// Devise ISO 4217 imposée par l'API Wave — indépendante de Atelier.devise (simple libellé libre affiché sur les
// documents, ex. « FCFA ») : le franc CFA BCEAO a pour code « XOF ».
export const WAVE_CURRENCY = "XOF";
// Wave attend une réponse de notre webhook en moins de 5 s : nos appels sortants restent sous ce délai.
const DELAI_APPEL_MS = 4000;

/** L'adresse de l'API est configurable pour les tests (faux serveur local) ; en production, la valeur par défaut. */
function baseApi() {
  return (process.env.WAVE_API_BASE || WAVE_API_BASE_PAR_DEFAUT).replace(/\/+$/, "");
}

/** Le paiement Wave est-il proposé ? Vrai seulement si l'exploitant l'a explicitement activé ET configuré. */
export function paiementWaveActif() {
  return process.env.WAVE_ENABLED === "1" && Boolean(process.env.WAVE_API_KEY) && Boolean(process.env.WAVE_WEBHOOK_SECRET);
}

function requireApiKey() {
  const key = process.env.WAVE_API_KEY;
  if (!key) {
    throw new Error(
      "WAVE_API_KEY manquant : configurez la clé API Wave Business (variable d'environnement) avant d'accepter des paiements Wave.",
    );
  }
  return key;
}

export class ErreurWave extends Error {
  constructor(message, { status, corps, reseau = false } = {}) {
    super(message);
    this.name = "ErreurWave";
    this.waveStatus = status ?? null;
    this.waveBody = corps ?? null;
    this.reseau = reseau;
  }
}

async function waveFetch(path, options = {}) {
  const apiKey = requireApiKey();
  let res;
  try {
    res = await fetch(`${baseApi()}${path}`, {
      ...options,
      signal: AbortSignal.timeout(DELAI_APPEL_MS),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...options.headers },
    });
  } catch (err) {
    // Aucune réponse (coupure, délai) : l'état du paiement chez Wave est INCONNU, jamais présumé.
    throw new ErreurWave("Wave n'a pas répondu.", { reseau: true, corps: { cause: err?.name } });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ErreurWave(data?.message || `Erreur Wave (HTTP ${res.status}).`, { status: res.status, corps: data });
  }
  return data;
}

/**
 * Crée une session de paiement Wave. `referenceInterne` est envoyé comme client_reference — notre clé de
 * rapprochement : elle permet de retrouver la Transaction depuis le webhook ou une vérification, sans jamais
 * dépendre de l'identifiant de session Wave seul.
 */
export async function creerSessionCheckout({ montant, referenceInterne, successUrl, errorUrl }) {
  // Le franc CFA n'a pas de centimes : Wave attend un montant ENTIER en XOF. Jamais de session pour un autre montant.
  const entier = Number(montant);
  if (!Number.isInteger(entier) || entier < 1) {
    throw new ErreurWave("Montant invalide pour un paiement en XOF (entier strictement positif requis).", { corps: { montant: String(montant) } });
  }
  return waveFetch("/checkout/sessions", {
    method: "POST",
    body: JSON.stringify({
      amount: String(entier),
      currency: WAVE_CURRENCY,
      client_reference: referenceInterne,
      success_url: successUrl,
      error_url: errorUrl,
    }),
  });
}

/** Relit une session DIRECTEMENT chez Wave (jamais depuis notre base) : seule source de vérité d'un paiement. */
export async function recupererSession(sessionId) {
  return waveFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

/** Rembourse intégralement un paiement. Idempotent côté Wave : rembourser deux fois ne crée pas de nouveau remboursement. */
export async function rembourserSession(sessionId) {
  return waveFetch(`/checkout/sessions/${encodeURIComponent(sessionId)}/refund`, { method: "POST" });
}

const SIGNATURE_MAX_AGE_SECONDS = 5 * 60; // fenêtre anti-rejeu recommandée par Wave

/**
 * Vérifie l'en-tête `Wave-Signature: t=<timestamp>,v1=<sig>[,v1=<sig2>...]` (secret de signature, recommandé par
 * Wave). Chaîne signée = `${timestamp}${corpsBrut}` (concaténation directe, sans séparateur). Comparaison en temps
 * constant. `rawBody` DOIT être le Buffer brut de la requête (voir app.js, option `verify` de express.json) :
 * reparser le JSON avant de signer casserait silencieusement la vérification. Plusieurs `v1` sont acceptés (rotation).
 */
export function verifierSignatureWebhook(rawBody, signatureHeader, secret, maintenantMs = Date.now()) {
  if (!rawBody || !secret) return false;
  if (!signatureHeader || typeof signatureHeader !== "string") return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return i < 0 ? [p, ""] : [p.slice(0, i), p.slice(i + 1)];
    }),
  );
  const timestamp = parts.t;
  const signatures = signatureHeader
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (!timestamp || signatures.length === 0) return false;
  const ageSeconds = Math.abs(maintenantMs / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > SIGNATURE_MAX_AGE_SECONDS) return false;
  const attendu = crypto.createHmac("sha256", secret).update(`${timestamp}${rawBody.toString("utf8")}`).digest("hex");
  const attenduBuf = Buffer.from(attendu, "utf8");
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    return sigBuf.length === attenduBuf.length && crypto.timingSafeEqual(sigBuf, attenduBuf);
  });
}

/** Signature telle que Wave l'émet — utilisée par les tests pour fabriquer des webhooks valides. */
export function signerWebhook(corps, secret, timestampSecondes = Math.floor(Date.now() / 1000)) {
  const v1 = crypto.createHmac("sha256", secret).update(`${timestampSecondes}${corps}`).digest("hex");
  return `t=${timestampSecondes},v1=${v1}`;
}

/**
 * Compare la session relue chez Wave à notre transaction. Fonction pure.
 * @returns {{ issue: "REUSSI"|"EXPIRE"|"INCOHERENT"|"EN_COURS", raison?: string }}
 */
export function evaluerSession(session, transaction) {
  if (!session || typeof session !== "object") return { issue: "INCOHERENT", raison: "réponse Wave illisible" };
  const paye = session.checkout_status === "complete" && session.payment_status === "succeeded";
  if (paye) {
    // Un paiement abouti qui ne correspond pas à notre transaction n'active RIEN : il est signalé pour traitement humain.
    if (transaction.referenceExterne && session.id !== transaction.referenceExterne) {
      return { issue: "INCOHERENT", raison: "session différente de celle créée pour cette transaction" };
    }
    if (session.client_reference !== transaction.referenceInterne) return { issue: "INCOHERENT", raison: "référence différente" };
    if (Number(session.amount) !== Number(transaction.montant)) {
      return { issue: "INCOHERENT", raison: `montant payé ${session.amount} différent du montant attendu ${transaction.montant}` };
    }
    if (session.currency && session.currency !== WAVE_CURRENCY) return { issue: "INCOHERENT", raison: `devise ${session.currency}` };
    return { issue: "REUSSI" };
  }
  if (session.checkout_status === "expired") return { issue: "EXPIRE" };
  return { issue: "EN_COURS" };
}
