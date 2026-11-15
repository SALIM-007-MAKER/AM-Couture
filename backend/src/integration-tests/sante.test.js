// Sous-phase 3.2 — liveness et readiness de l'API réelle.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur } from "./helpers.js";

describe("API réelle — santé", () => {
  let server, baseUrl;
  before(async () => ({ server, baseUrl } = await demarrerServeur()));
  after(async () => {
    await arreterServeur(server);
    await prisma.$disconnect();
  });

  it("/api/health : liveness inchangée (200, format d'origine)", async () => {
    const r = await fetch(`${baseUrl}/api/health`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { status: "ok", service: "gestion-atelier-api" });
  });

  it("/api/health/ready : 200 avec la base disponible, latence mesurée, jamais mis en cache", async () => {
    const r = await fetch(`${baseUrl}/api/health/ready`);
    const corps = await r.json();
    assert.equal(r.status, 200);
    assert.equal(corps.status, "ok");
    assert.equal(corps.db, "ok");
    assert.ok(Number.isInteger(corps.latenceMs) && corps.latenceMs >= 0 && corps.latenceMs < 2500);
    assert.equal(r.headers.get("cache-control"), "no-store");
  });
});
