// Quotas dans le catalogue des formules : saisie par le SUPERADMIN, validation, lecture par les ateliers.
// Base Postgres jetable dédiée (voir preload.js).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";

const marque = `${process.pid}-${Date.now()}`;

describe("Quotas : catalogue des formules", () => {
  let server, baseUrl, superApi, pdgApi, atelier, superId;
  const plansCrees = [];

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Quotas Plans" });
    atelier = ra.atelier;
    pdgApi = client(baseUrl);
    assert.equal((await pdgApi.post("/api/auth/login", { identifiant: ra.identifiant, password: ra.password })).status, 200);
    const identifiant = `super-quotas-plans-${marque}`;
    superId = (await prisma.user.create({ data: { identifiant, passwordHash: await bcrypt.hash("Atelier-Test-2026!", 4), role: "SUPERADMIN" } })).id;
    superApi = client(baseUrl);
    assert.equal((await superApi.post("/api/auth/login", { identifiant, password: "Atelier-Test-2026!" })).status, 200);
  });

  after(async () => {
    await arreterServeur(server);
    await prisma.planAbonnement.deleteMany({ where: { id: { in: plansCrees } } });
    await supprimerAtelier(atelier.id);
    await prisma.user.delete({ where: { id: superId } });
    await prisma.$disconnect();
  });

  const creer = async (corps) => {
    const res = await superApi.post("/api/plans-abonnement", corps);
    if (res.status === 201) plansCrees.push(res.body.id);
    return res;
  };

  it("le SUPERADMIN crée une formule avec des quotas ; sans quota, elle est illimitée ({})", async () => {
    const starter = await creer({ nom: `Starter ${marque}`, prixMensuel: "5000", limites: { clientes: 100, employes: 1, commandesActives: 50, modeles: 50 } });
    assert.equal(starter.status, 201, JSON.stringify(starter.body));
    assert.deepEqual(starter.body.limites, { clientes: 100, employes: 1, commandesActives: 50, modeles: 50 });

    const premium = await creer({ nom: `Premium ${marque}`, prixMensuel: "25000" });
    assert.equal(premium.status, 201);
    assert.deepEqual(premium.body.limites, {}, "aucune limite : toutes les ressources illimitées");
  });

  it("valeurs refusées : zéro, négatif, décimal, au-delà de 1 000 000, texte, null, clé inconnue", async () => {
    for (const limites of [{ clientes: 0 }, { clientes: -5 }, { employes: 1.5 }, { modeles: 1_000_001 }, { clientes: "100" }, { clientes: null }, { photos: 8 }]) {
      const res = await creer({ nom: `Invalide ${marque} ${JSON.stringify(limites)}`.slice(0, 50), prixMensuel: "1000", limites });
      assert.equal(res.status, 400, `${JSON.stringify(limites)} → ${res.status}`);
      assert.ok(res.body.details?.limites || res.body.details?._global, JSON.stringify(res.body));
    }
    assert.equal((await creer({ nom: `Borne ${marque}`, prixMensuel: "1000", limites: { clientes: 1, modeles: 1_000_000 } })).status, 201, "les deux bornes sont acceptées");
  });

  it("modifier les quotas d'une formule : remplace le bloc entier ; {} rend la formule illimitée", async () => {
    const p = (await creer({ nom: `Modif ${marque}`, prixMensuel: "5000", limites: { clientes: 100, modeles: 50 } })).body;
    const maj = await superApi.patch(`/api/plans-abonnement/${p.id}`, { limites: { clientes: 250 } });
    assert.equal(maj.status, 200);
    assert.deepEqual(maj.body.limites, { clientes: 250 });
    const vide = await superApi.patch(`/api/plans-abonnement/${p.id}`, { limites: {} });
    assert.deepEqual(vide.body.limites, {});
    assert.equal((await superApi.patch(`/api/plans-abonnement/${p.id}`, { limites: { clientes: 0 } })).status, 400);
    // Un patch sans `limites` ne les touche pas.
    await superApi.patch(`/api/plans-abonnement/${p.id}`, { limites: { employes: 3 } });
    const prix = await superApi.patch(`/api/plans-abonnement/${p.id}`, { prixMensuel: "6000" });
    assert.deepEqual(prix.body.limites, { employes: 3 });
  });

  it("un atelier voit les quotas des formules actives ; le catalogue reste réservé au SUPERADMIN pour l'écriture", async () => {
    const res = await pdgApi.get("/api/plans-abonnement");
    assert.equal(res.status, 200);
    const starter = res.body.find((p) => p.nom === `Starter ${marque}`);
    assert.deepEqual(starter.limites, { clientes: 100, employes: 1, commandesActives: 50, modeles: 50 });
    assert.equal((await pdgApi.post("/api/plans-abonnement", { nom: `Pirate ${marque}`, prixMensuel: "1", limites: {} })).status, 403);
    assert.equal((await pdgApi.patch(`/api/plans-abonnement/${starter.id}`, { limites: { clientes: 999_999 } })).status, 403);
  });
});
