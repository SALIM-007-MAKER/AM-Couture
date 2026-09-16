// Essai gratuit / blocage post-expiration / bypass SUPERADMIN (§ plan
// trial). Base Postgres jetable dédiée (voir preload.js).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";
import { prisma } from "../lib/prisma.js";
import bcrypt from "bcryptjs";

describe("Essai gratuit et blocage post-expiration", () => {
  let server;
  let baseUrl;
  let atelier;
  let identifiant;
  let password;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    ({ atelier, identifiant, password } = await creerAtelierEtAdmin({ nom: "Atelier Trial" }));
  });

  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(atelier.id);
    await prisma.$disconnect();
  });

  test("trialEndsAt null (atelier créé sans passer par creerAtelierEtAdmin) -> jamais bloqué", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password });
    const res = await api.get("/api/clientes");
    assert.equal(res.status, 200);
  });

  test("essai expiré, aucun abonnement -> 402 sur les routes métier", async () => {
    await prisma.atelier.update({ where: { id: atelier.id }, data: { trialEndsAt: new Date("2020-01-01") } });
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password });
    const res = await api.get("/api/clientes");
    assert.equal(res.status, 402);
  });

  test("essai expiré -> /api/abonnements et /api/compte restent accessibles", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password });
    const abonnements = await api.get("/api/abonnements/actuel");
    assert.notEqual(abonnements.status, 402);
    const compte = await api.patch("/api/compte", { langue: "fr" });
    assert.notEqual(compte.status, 402);
  });

  test("essai expiré -> lecture de /api/parametres reste accessible (essaiExpire visible)", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password });
    const res = await api.get("/api/parametres");
    // 404 possible si l'atelier n'a pas encore de config complète (nom
    // toujours présent ici en fait, donc 200 attendu) — dans tous les cas
    // jamais 402 : c'est le point précis vérifié ici.
    assert.notEqual(res.status, 402);
  });

  test("abonnement CONFIRME actif -> accès restauré malgré l'essai expiré", async () => {
    const formule = await prisma.formuleAbonnement.upsert({
      where: { dureeMois: 1 },
      update: {},
      create: { dureeMois: 1, nom: "1 mois", prix: "5000" },
    });
    await prisma.abonnement.create({
      data: {
        atelierId: atelier.id,
        numero: `TEST-ABN-${Date.now()}`,
        formuleId: formule.id,
        prix: formule.prix,
        dateDebut: new Date(),
        dateExpiration: new Date(Date.now() + 30 * 86_400_000),
        statut: "CONFIRME",
      },
    });
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password });
    const res = await api.get("/api/clientes");
    assert.equal(res.status, 200);
  });
});

describe("Bypass SUPERADMIN pendant une impersonation", () => {
  let server;
  let baseUrl;
  let atelier;
  let admin;
  let superadminId;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    ({ atelier, admin } = await creerAtelierEtAdmin({ nom: "Atelier Bloque Impersonation" }));
    await prisma.atelier.update({ where: { id: atelier.id }, data: { trialEndsAt: new Date("2020-01-01") } });

    const passwordHash = await bcrypt.hash("password123", 4);
    const superadmin = await prisma.user.create({
      data: { identifiant: `superadmin-test-${Date.now()}`, passwordHash, role: "SUPERADMIN" },
    });
    superadminId = superadmin.id;
  });

  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(atelier.id);
    await prisma.user.delete({ where: { id: superadminId } });
    await prisma.$disconnect();
  });

  test("impersonation d'un ADMIN d'atelier bloqué -> accès autorisé malgré le 402", async () => {
    const superApi = client(baseUrl);
    const loginSuper = await superApi.post("/api/auth/login", {
      identifiant: (await prisma.user.findUnique({ where: { id: superadminId } })).identifiant,
      password: "password123",
    });
    assert.equal(loginSuper.status, 200);

    const impersonation = await superApi.post(`/api/ateliers/${atelier.id}/comptes/${admin.id}/impersonation`);
    assert.equal(impersonation.status, 200);

    const res = await superApi.get("/api/clientes");
    assert.equal(res.status, 200);
  });
});
