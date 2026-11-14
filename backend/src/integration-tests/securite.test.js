// Phase 2 — sécurisation : journal persistant, CSRF, jetons hachés, politique de
// mot de passe, impersonation courte, accès au journal réservé SUPERADMIN.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { creerToken, consommerToken, hacherToken } from "../lib/tokenAction.js";
import { purgerJournalSecurite, journaliserSecurite } from "../lib/securityLog.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";

const MDP = "Atelier-Test-2026!";
// IP distinctes à chaque exécution : le rate limiter persiste ses compteurs en base.
const IP_BASE = 100 + (process.pid % 100);

describe("Sécurité — journal, CSRF, jetons, mots de passe, impersonation", () => {
  let server, baseUrl, atelier, admin, identifiant, superadmin, superIdentifiant, superApi, adminApi;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    ({ atelier, admin, identifiant } = await creerAtelierEtAdmin({ nom: "Atelier Sécurité", password: MDP }));
    superIdentifiant = `super-secu-${process.pid}-${Date.now()}`;
    superadmin = await prisma.user.create({
      data: { identifiant: superIdentifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN" },
    });
    adminApi = client(baseUrl);
    assert.equal((await adminApi.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    superApi = client(baseUrl);
    assert.equal((await superApi.post("/api/auth/login", { identifiant: superIdentifiant, password: MDP })).status, 200);
  });

  after(async () => {
    await arreterServeur(server);
    await prisma.journalSecurite.deleteMany({
      where: { OR: [{ userId: { in: [admin.id, superadmin.id] } }, { atelierId: atelier.id }, { evenement: { startsWith: "TEST_" } }] },
    });
    await prisma.tokenAction.deleteMany({ where: { userId: admin.id } });
    await prisma.journalImpersonation.deleteMany({ where: { atelierId: atelier.id } });
    await supprimerAtelier(atelier.id);
    await prisma.user.delete({ where: { id: superadmin.id } });
    await prisma.$disconnect();
  });

  it("une connexion réussie et un échec sont persistés SANS aucun secret", async () => {
    const mauvais = client(baseUrl);
    const secretTape = "Mauvais-Mdp-Secret-XYZ-987";
    assert.equal((await mauvais.post("/api/auth/login", { identifiant, password: secretTape })).status, 401);
    const lignes = await prisma.journalSecurite.findMany({ where: { userId: admin.id } });
    const evenements = lignes.map((l) => l.evenement);
    assert.ok(evenements.includes("LOGIN_OK"));
    assert.ok(evenements.includes("LOGIN_ECHEC"));
    const brut = JSON.stringify(lignes);
    for (const interdit of [secretTape, MDP, "passwordHash", "$2"]) {
      assert.equal(brut.includes(interdit), false, `le journal ne doit pas contenir « ${interdit} »`);
    }
  });

  it("le journal n'est consultable que par le SUPERADMIN", async () => {
    assert.equal((await adminApi.get("/api/plateforme/journal-securite")).status, 403);
    assert.equal((await client(baseUrl).get("/api/plateforme/journal-securite")).status, 401);
    const r = await superApi.get(`/api/plateforme/journal-securite?atelierId=${atelier.id}`);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.body.items));
    assert.equal((await superApi.get("/api/plateforme/journal-securite?pageSize=9999")).status, 400);
  });

  it("details : seules les clés autorisées sont conservées", async () => {
    await journaliserSecurite("TEST_ASSAINISSEMENT", {
      userId: admin.id,
      details: { compteId: "c1", password: "secret", token: "t", prefixe: "x".repeat(500) },
    });
    const l = await prisma.journalSecurite.findFirst({ where: { evenement: "TEST_ASSAINISSEMENT" } });
    assert.deepEqual(Object.keys(l.details).sort(), ["compteId", "prefixe"]);
    assert.equal(l.details.prefixe.length, 100);
  });

  it("purge : supprime au-delà de la rétention, conserve le récent", async () => {
    const vieux = await prisma.journalSecurite.create({
      data: { evenement: "TEST_VIEUX", atelierId: atelier.id, createdAt: new Date(Date.now() - 400 * 86_400_000) },
    });
    const recent = await prisma.journalSecurite.create({ data: { evenement: "TEST_RECENT", atelierId: atelier.id } });
    await purgerJournalSecurite();
    assert.equal(await prisma.journalSecurite.findUnique({ where: { id: vieux.id } }), null);
    assert.ok(await prisma.journalSecurite.findUnique({ where: { id: recent.id } }));
  });

  it("CSRF : une écriture authentifiée venant d'un autre site est refusée, même avec le bon cookie", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `198.51.100.${IP_BASE + 7}` },
      body: JSON.stringify({ identifiant, password: MDP }),
    });
    const cookie = res.headers.get("set-cookie").split(";")[0];
    const attaque = await fetch(`${baseUrl}/api/compte/mot-de-passe`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "https://evil.example" },
      body: JSON.stringify({ motDePasseActuel: MDP, nouveauMotDePasse: "Pirate-Mdp-2026!" }),
    });
    assert.equal(attaque.status, 403);
    // Le mot de passe n'a PAS changé : l'ancien fonctionne encore.
    assert.equal((await client(baseUrl).post("/api/auth/login", { identifiant, password: MDP })).status, 200);
  });

  it("cookie de session : HttpOnly + SameSite=Lax, en-têtes de sécurité présents", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `198.51.100.${IP_BASE + 8}` },
      body: JSON.stringify({ identifiant, password: MDP }),
    });
    const sc = res.headers.get("set-cookie");
    assert.match(sc, /HttpOnly/i);
    assert.match(sc, /SameSite=Lax/i);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });

  it("jetons d'action : seul le haché est en base, et le jeton en clair fonctionne", async () => {
    const clair = await creerToken({ userId: admin.id, type: "REINITIALISATION_MOT_DE_PASSE", dureeMs: 60_000 });
    assert.equal(await prisma.tokenAction.findUnique({ where: { token: clair } }), null, "le clair ne doit pas être stocké");
    assert.ok(await prisma.tokenAction.findUnique({ where: { token: hacherToken(clair) } }));
    const user = await consommerToken({ token: clair, type: "REINITIALISATION_MOT_DE_PASSE" });
    assert.equal(user.id, admin.id);
    await assert.rejects(() => consommerToken({ token: clair, type: "REINITIALISATION_MOT_DE_PASSE" }), { status: 400 });
    // Fournir directement le haché (ce que voit un attaquant qui lit la base) ne marche pas.
    const clair2 = await creerToken({ userId: admin.id, type: "REINITIALISATION_MOT_DE_PASSE", dureeMs: 60_000 });
    await assert.rejects(
      () => consommerToken({ token: hacherToken(clair2), type: "REINITIALISATION_MOT_DE_PASSE" }),
      { status: 400 },
    );
  });

  it("changement de mot de passe : un mot de passe courant ou trop long est refusé (400)", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password: MDP });
    const r = await api.patch("/api/compte/mot-de-passe", { motDePasseActuel: MDP, nouveauMotDePasse: "Password123" });
    assert.equal(r.status, 400);
    const long = await api.patch("/api/compte/mot-de-passe", { motDePasseActuel: MDP, nouveauMotDePasse: "a".repeat(80) });
    assert.equal(long.status, 400);
  });

  it("impersonation : jeton et cookie limités à 2 h, début journalisé", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `198.51.100.${IP_BASE + 9}` },
      body: JSON.stringify({ identifiant: superIdentifiant, password: MDP }),
    });
    const cookie = res.headers.get("set-cookie").split(";")[0];
    const imp = await fetch(`${baseUrl}/api/ateliers/${atelier.id}/comptes/${admin.id}/impersonation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: "{}",
    });
    assert.equal(imp.status, 200);
    const sc = imp.headers.get("set-cookie");
    assert.match(sc, /Max-Age=7200/);
    const payload = jwt.decode(sc.split(";")[0].split("=")[1]);
    assert.equal(payload.exp - payload.iat, 7200);
    assert.equal(payload.impersonatedBy, superadmin.id);
    assert.ok(await prisma.journalSecurite.findFirst({ where: { evenement: "IMPERSONATION_DEBUT", atelierId: atelier.id } }));
  });
});
