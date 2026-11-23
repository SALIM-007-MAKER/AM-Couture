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

  const COMPLETS = { clientes: 100, employes: 1, commandesActives: 50, modeles: 50 };

  it("le SUPERADMIN crée une formule INACTIVE avec ses quotas ; sans quota ils sont NON DÉFINIS (jamais illimités par défaut)", async () => {
    const starter = await creer({ nom: `Starter ${marque}`, prixMensuel: 5000, limites: COMPLETS });
    assert.equal(starter.status, 201, JSON.stringify(starter.body));
    assert.deepEqual(starter.body.limites, COMPLETS);
    assert.equal(starter.body.actif, false, "une formule créée n'est jamais proposée tant qu'elle n'est pas activée");
    assert.equal(starter.body.proposee, false);
    assert.deepEqual(starter.body.activationPossible, { ok: true, raisons: [] });

    const sans = await creer({ nom: `Sans quota ${marque}`, prixMensuel: 25000 });
    assert.equal(sans.status, 201);
    assert.deepEqual(sans.body.limites, {});
    assert.deepEqual(sans.body.quotasNonDefinis, ["clientes", "employes", "commandesActives", "modeles"]);
    assert.deepEqual(sans.body.activationPossible, { ok: false, raisons: ["QUOTAS_NON_DEFINIS"] });
  });

  it("valeurs refusées : zéro, négatif, décimal, au-delà de 1 000 000, texte, clé inconnue ; null = illimité explicite accepté", async () => {
    for (const limites of [{ clientes: 0 }, { clientes: -5 }, { employes: 1.5 }, { modeles: 1_000_001 }, { clientes: "100" }, { photos: 8 }]) {
      const res = await creer({ nom: `Invalide ${marque} ${JSON.stringify(limites)}`.slice(0, 50), prixMensuel: 1000, limites });
      assert.equal(res.status, 400, `${JSON.stringify(limites)} → ${res.status}`);
      assert.ok(res.body.details?.limites || res.body.details?._global, JSON.stringify(res.body));
    }
    assert.equal((await creer({ nom: `Borne ${marque}`, prixMensuel: 1000, limites: { clientes: 1, modeles: 1_000_000 } })).status, 201, "les deux bornes sont acceptées");
    const illimite = await creer({ nom: `Illimité ${marque}`, prixMensuel: 1000, limites: { clientes: null, employes: null, commandesActives: null, modeles: null } });
    assert.equal(illimite.status, 201);
    assert.deepEqual(illimite.body.quotasNonDefinis, [], "null est une décision explicite : illimité");
  });

  it("modifier les quotas : remplace le bloc entier ; un patch sans `limites` ne les touche pas", async () => {
    const p = (await creer({ nom: `Modif ${marque}`, prixMensuel: 5000, limites: { clientes: 100, modeles: 50 } })).body;
    const maj = await superApi.patch(`/api/plans-abonnement/${p.id}`, { limites: { clientes: 250 } });
    assert.equal(maj.status, 200);
    assert.deepEqual(maj.body.limites, { clientes: 250 });
    const vide = await superApi.patch(`/api/plans-abonnement/${p.id}`, { limites: {} });
    assert.deepEqual(vide.body.limites, {});
    assert.deepEqual(vide.body.quotasNonDefinis.length, 4, "un bloc vide n'est PAS illimité : les quotas ne sont plus définis");
    assert.equal((await superApi.patch(`/api/plans-abonnement/${p.id}`, { limites: { clientes: 0 } })).status, 400);
    await superApi.patch(`/api/plans-abonnement/${p.id}`, { limites: { employes: 3 } });
    const prix = await superApi.patch(`/api/plans-abonnement/${p.id}`, { prixMensuel: 6000 });
    assert.deepEqual(prix.body.limites, { employes: 3 });
  });

  it("ACTIVATION commerciale : exige un tarif ET quatre quotas définis ; un atelier ne voit que les formules proposées", async () => {
    const complete = (await creer({ nom: `Active ${marque}`, prixMensuel: 5000, prixAnnuel: 50000, limites: COMPLETS })).body;
    const partielle = (await creer({ nom: `Partielle ${marque}`, prixMensuel: 5000, limites: { clientes: 100 } })).body;
    const sansTarif = (await creer({ nom: `Sans tarif ${marque}`, limites: COMPLETS })).body;

    const refusQuotas = await superApi.patch(`/api/plans-abonnement/${partielle.id}`, { actif: true });
    assert.equal(refusQuotas.status, 409);
    assert.deepEqual(refusQuotas.body.details.activation, ["QUOTAS_NON_DEFINIS"]);
    const refusTarif = await superApi.patch(`/api/plans-abonnement/${sansTarif.id}`, { actif: true });
    assert.equal(refusTarif.status, 409);
    assert.deepEqual(refusTarif.body.details.activation, ["AUCUN_TARIF"]);
    const createActifIncomplet = await creer({ nom: `Actif incomplet ${marque}`, prixMensuel: 5000, actif: true });
    assert.equal(createActifIncomplet.status, 409, "pas de création active sans quotas définis");

    const ok = await superApi.patch(`/api/plans-abonnement/${complete.id}`, { actif: true });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.proposee, true);

    const res = await pdgApi.get("/api/plans-abonnement");
    assert.equal(res.status, 200);
    const vue = res.body.find((p) => p.id === complete.id);
    assert.deepEqual(vue.limites, COMPLETS);
    assert.deepEqual(vue.offres.map((o) => [o.periodicite, o.prix]), [["MENSUEL", 5000], ["ANNUEL", 50000]]);
    assert.equal(vue.economieAnnuelle, 10000, "5 000 × 12 − 50 000");
    for (const p of [partielle, sansTarif]) assert.ok(!res.body.some((x) => x.id === p.id), "inactive : jamais proposée");

    // Une formule ACTIVE sans aucun prix (ancien état) n'est pas proposée non plus : aucun prix par défaut.
    const heritee = await prisma.planAbonnement.create({ data: { nom: `Héritée sans prix ${marque}`, actif: true } });
    plansCrees.push(heritee.id);
    assert.ok(!(await pdgApi.get("/api/plans-abonnement")).body.some((x) => x.id === heritee.id));

    assert.equal((await pdgApi.post("/api/plans-abonnement", { nom: `Pirate ${marque}`, prixMensuel: 1, limites: {} })).status, 403);
    assert.equal((await pdgApi.patch(`/api/plans-abonnement/${complete.id}`, { limites: { clientes: 999_999 } })).status, 403);
  });

  it("prix : entiers XOF strictement positifs ; null retire la période ; aucun prix gratuit ni décimal", async () => {
    for (const corps of [{ prixMensuel: 0 }, { prixMensuel: -1 }, { prixMensuel: 2500.5 }, { prixAnnuel: "30000" }, { prixAnnuel: 100_000_000 }, { devise: "EUR" }, { pays: "SN" }]) {
      const res = await creer({ nom: `Prix ${marque} ${JSON.stringify(corps)}`.slice(0, 50), ...corps });
      assert.equal(res.status, 400, JSON.stringify(corps));
    }
    const p = (await creer({ nom: `Retrait ${marque}`, prixMensuel: 3000, prixAnnuel: 30000, limites: COMPLETS })).body;
    assert.equal(p.devise, "XOF");
    assert.equal(p.pays, "NE");
    const sansAnnuel = await superApi.patch(`/api/plans-abonnement/${p.id}`, { prixAnnuel: null });
    assert.equal(sansAnnuel.status, 200);
    assert.deepEqual(sansAnnuel.body.offres.map((o) => o.periodicite), ["MENSUEL"]);
    assert.equal(sansAnnuel.body.economieAnnuelle, null);
  });
});
