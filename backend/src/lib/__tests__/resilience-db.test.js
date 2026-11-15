// Sous-phase 3.2 — comportement de l'API quand la base de données est INDISPONIBLE.
// Chaque scénario lance la vraie application dans un processus enfant, avec une base
// injoignable : on mesure ce que voit un client (statut, délai, message), jamais de détail interne.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const sonde = fileURLToPath(new URL("./helpers/probe-app.mjs", import.meta.url));

function lancer(databaseUrl) {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [sonde],
      {
        timeout: 90_000,
        env: { ...process.env, DATABASE_URL: databaseUrl, DB_CONNECT_TIMEOUT_MS: "1000", JWT_SECRET: "x".repeat(40), NODE_ENV: "development" },
      },
      (err, stdout) => {
        const ligne = String(stdout).split("\n").find((l) => l.startsWith("RESULTAT:"));
        if (!ligne) return reject(new Error(`sonde sans résultat : ${err?.message ?? ""}`));
        resolve(JSON.parse(ligne.slice("RESULTAT:".length)));
      },
    );
  });
}

const scenarios = [
  ["base qui refuse les connexions", "postgresql://u:p@127.0.0.1:1/x", /127\.0\.0\.1/],
  ["base injoignable (aucune réponse réseau)", "postgresql://u:p@10.255.255.1:5432/x", /10\.255\.255\.1/],
];

describe("Résilience — base de données indisponible", () => {
  for (const [nom, url, hote] of scenarios) {
    describe(nom, () => {
      let r;
      it("la sonde s'exécute", async () => { r = await lancer(url); assert.ok(r); });

      it("/api/health (liveness) répond 200 immédiatement, sans dépendre de la base", () => {
        assert.equal(r.health.status, 200);
        assert.ok(r.health.ms < 1500, `liveness lent : ${r.health.ms} ms`);
      });

      it("/api/health/ready (readiness) répond 503 en temps borné, sans fuite de l'adresse de la base", () => {
        assert.equal(r.ready.status, 503, `statut ${r.ready.status}`);
        assert.ok(r.ready.ms < 6000, `readiness trop long : ${r.ready.ms} ms`);
        assert.equal(r.ready.corps.status, "degraded");
        assert.doesNotMatch(JSON.stringify(r.ready.corps), hote);
      });

      it("une route métier répond 503 (jamais 500, jamais suspendue), avec Retry-After et une référence", () => {
        assert.notEqual(r.login.status, 0, `la requête est restée suspendue (${r.login.erreur})`);
        assert.equal(r.login.status, 503);
        assert.ok(r.login.ms < 10_000, `réponse trop lente : ${r.login.ms} ms`);
        assert.equal(r.login.retryAfter, "5");
        assert.match(r.login.corps.error, /temporairement indisponible/i);
        assert.equal(r.login.corps.requestId, r.login.requestId);
        assert.doesNotMatch(JSON.stringify(r.login.corps), hote);
      });
    });
  }
});
