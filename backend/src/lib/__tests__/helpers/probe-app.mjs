// Sonde lancée dans un processus ENFANT par resilience-db.test.js : démarre la vraie application
// avec une base volontairement injoignable (variables d'environnement posées par le parent) et
// mesure ses réponses. Imprime une ligne JSON sur la sortie standard.
import app from "../../../app.js";

const serveur = app.listen(0);
await new Promise((r) => serveur.once("listening", r));
const base = `http://127.0.0.1:${serveur.address().port}`;

async function mesurer(chemin, opts = {}) {
  const t0 = Date.now();
  const ac = new AbortController();
  const minuterie = setTimeout(() => ac.abort(), 20_000);
  try {
    const r = await fetch(base + chemin, { ...opts, signal: ac.signal });
    const texte = await r.text();
    let corps = null;
    try { corps = JSON.parse(texte); } catch { /* non JSON */ }
    return { status: r.status, ms: Date.now() - t0, corps, retryAfter: r.headers.get("retry-after"), requestId: r.headers.get("x-request-id") };
  } catch (e) {
    return { status: 0, ms: Date.now() - t0, erreur: e.name };
  } finally {
    clearTimeout(minuterie);
  }
}

const resultat = {
  health: await mesurer("/api/health"),
  ready: await mesurer("/api/health/ready"),
  login: await mesurer("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.9" },
    body: JSON.stringify({ identifiant: "sonde", password: "x" }),
  }),
};
console.log("RESULTAT:" + JSON.stringify(resultat));
serveur.close();
process.exit(0);
