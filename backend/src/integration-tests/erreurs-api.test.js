// Sous-phase 3.2 — erreurs de requête de l'API réelle (corps invalide ou trop gros, route inconnue, identifiant de requête).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur } from "./helpers.js";

describe("API réelle — erreurs de requête", () => {
  let server, baseUrl;
  before(async () => ({ server, baseUrl } = await demarrerServeur()));
  after(async () => {
    await arreterServeur(server);
    await prisma.$disconnect();
  });

  it("JSON invalide : 400 en français, sans texte du parseur, avec X-Request-Id", async () => {
    const r = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{pas du json" });
    const corps = await r.json();
    assert.equal(r.status, 400);
    assert.match(corps.error, /JSON/);
    assert.doesNotMatch(JSON.stringify(corps), /Expected|position|property name/i);
    assert.match(r.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  });

  it("corps de plus de 5 Mo : 413 en français", async () => {
    const r = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: "x".repeat(6 * 1024 * 1024) }) });
    assert.equal(r.status, 413);
    assert.match((await r.json()).error, /volumineuse/);
  });

  it("route inconnue : 404 JSON inchangé", async () => {
    const r = await fetch(`${baseUrl}/api/zzz`);
    assert.equal(r.status, 404);
    assert.deepEqual(await r.json(), { error: "Route API inconnue." });
  });

  it("deux requêtes successives reçoivent deux identifiants différents", async () => {
    const a = (await fetch(`${baseUrl}/api/health`)).headers.get("x-request-id");
    const b = (await fetch(`${baseUrl}/api/health`)).headers.get("x-request-id");
    assert.notEqual(a, b);
  });
});
