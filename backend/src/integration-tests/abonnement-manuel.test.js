// Abonnement activé MANUELLEMENT par le SUPERADMIN — aucun paiement en ligne,
// aucune simulation. Base Postgres jetable dédiée (voir preload.js).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";
import { prisma } from "../lib/prisma.js";

const JOUR = 86_400_000;

describe("Abonnement manuel (SUPERADMIN) et état côté PDG", () => {
  let server;
  let baseUrl;
  let atelier;
  let autreAtelier;
  let adminApi;
  let superApi;
  let superadminId;
  let plan;
  let planInactif;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    let identifiant;
    let password;
    ({ atelier, identifiant, password } = await creerAtelierEtAdmin({ nom: "Atelier Abonnement Manuel" }));
    ({ atelier: autreAtelier } = await creerAtelierEtAdmin({ nom: "Atelier Tiers Abonnement" }));

    const superIdentifiant = `superadmin-abo-${process.pid}-${Date.now()}`;
    const superadmin = await prisma.user.create({
      data: { identifiant: superIdentifiant, passwordHash: await bcrypt.hash("password123", 4), role: "SUPERADMIN" },
    });
    superadminId = superadmin.id;

    adminApi = client(baseUrl);
    assert.equal((await adminApi.post("/api/auth/login", { identifiant, password })).status, 200);
    superApi = client(baseUrl);
    assert.equal((await superApi.post("/api/auth/login", { identifiant: superIdentifiant, password: "password123" })).status, 200);

    const creation = await superApi.post("/api/plans-abonnement", {
      nom: `Professionnel ${process.pid}`,
      prixMensuel: "15000",
      fonctionnalites: ["Clients illimités", "Rapports"],
    });
    assert.equal(creation.status, 201);
    plan = creation.body;
    planInactif = await prisma.planAbonnement.create({
      data: { nom: `Inactif ${process.pid}`, prixMensuel: "1000", actif: false },
    });
  });

  after(async () => {
    await arreterServeur(server);
    await prisma.historiqueAbonnement.deleteMany({ where: { atelierId: { in: [atelier.id, autreAtelier.id] } } });
    await prisma.abonnement.deleteMany({ where: { atelierId: { in: [atelier.id, autreAtelier.id] } } });
    await supprimerAtelier(atelier.id);
    await supprimerAtelier(autreAtelier.id);
    await prisma.planAbonnement.deleteMany({ where: { id: { in: [plan.id, planInactif.id] } } });
    await prisma.user.delete({ where: { id: superadminId } });
    await prisma.$disconnect();
  });

  async function etat() {
    const res = await adminApi.get("/api/abonnements/etat");
    assert.equal(res.status, 200);
    return res.body;
  }

  test("aucune route de paiement/souscription n'existe côté ADMIN", async () => {
    assert.equal((await adminApi.post("/api/abonnements", { planId: plan.id })).status, 404);
    assert.equal((await adminApi.post("/api/transactions/abc/simuler-mock", { resultat: "REUSSIE" })).status, 404);
    assert.equal((await adminApi.post("/api/transactions/abc/confirmer-manuel", {})).status, 404);
    assert.equal((await adminApi.post("/api/webhooks/wave", {})).status, 404);
  });

  test("ADMIN voit les plans actifs uniquement", async () => {
    const res = await adminApi.get("/api/plans-abonnement");
    assert.equal(res.status, 200);
    assert.ok(res.body.some((p) => p.id === plan.id));
    assert.ok(!res.body.some((p) => p.id === planInactif.id));
  });

  test("ADMIN ne peut ni activer un abonnement ni gérer les plans (403)", async () => {
    const activer = await adminApi.post(`/api/ateliers/${atelier.id}/abonnement/activer`, {
      planId: plan.id,
      dureeMois: 1,
    });
    assert.equal(activer.status, 403);
    assert.equal((await adminApi.post("/api/plans-abonnement", { nom: "X", prixMensuel: "1" })).status, 403);
    assert.equal((await adminApi.get(`/api/ateliers/${atelier.id}/abonnement`)).status, 403);
  });

  test("PERMISSIONS : un PDG ne peut ni modifier, ni faire expirer, ni désactiver un abonnement, ni éditer un plan (403)", async () => {
    const base = `/api/ateliers/${atelier.id}/abonnement/abn-quelconque`;
    assert.equal((await adminApi.patch(base, { dateExpiration: "2031-01-01" })).status, 403);
    assert.equal((await adminApi.post(`${base}/expirer`, {})).status, 403);
    assert.equal((await adminApi.post(`${base}/desactiver`, {})).status, 403);
    assert.equal((await adminApi.patch(`/api/plans-abonnement/${plan.id}`, { prixMensuel: "1" })).status, 403);
    assert.equal((await adminApi.get("/api/plans-abonnement/tous")).status, 403);
    // Et sans être connecté : refus net.
    const anonyme = client(baseUrl);
    assert.equal((await anonyme.get("/api/abonnements/etat")).status, 401);
    assert.equal((await anonyme.post(`/api/ateliers/${atelier.id}/abonnement/activer`, { planId: plan.id, dureeMois: 1 })).status, 401);
  });

  test("SOURCE UNIQUE : un plan modifié/désactivé dans Tarification est reflété côté PDG", async () => {
    const nouveauNom = `Pro Renommé ${process.pid}`;
    await superApi.patch(`/api/plans-abonnement/${plan.id}`, { nom: nouveauNom, description: "Le plus complet" });
    let visibles = (await adminApi.get("/api/plans-abonnement")).body;
    const vu = visibles.find((p) => p.id === plan.id);
    assert.equal(vu.nom, nouveauNom);
    assert.equal(vu.description, "Le plus complet");
    assert.deepEqual(vu.fonctionnalites, ["Clients illimités", "Rapports"]);

    await superApi.patch(`/api/plans-abonnement/${plan.id}`, { actif: false });
    visibles = (await adminApi.get("/api/plans-abonnement")).body;
    assert.ok(!visibles.some((p) => p.id === plan.id));

    await superApi.patch(`/api/plans-abonnement/${plan.id}`, { actif: true, nom: `Professionnel ${process.pid}` });
  });

  test("état : essai en cours -> ESSAI avec jours restants", async () => {
    await prisma.atelier.update({ where: { id: atelier.id }, data: { trialEndsAt: new Date(Date.now() + 12 * JOUR - 1000) } });
    const e = await etat();
    assert.equal(e.statut, "ESSAI");
    assert.equal(e.essai.joursRestants, 12);
    assert.equal(e.abonnement, null);
  });

  test("validation : ni durée ni date d'expiration -> 400 ; plan inactif -> 404 ; dates incohérentes -> 400", async () => {
    const url = `/api/ateliers/${atelier.id}/abonnement/activer`;
    assert.equal((await superApi.post(url, { planId: plan.id })).status, 400);
    assert.equal((await superApi.post(url, { planId: planInactif.id, dureeMois: 1 })).status, 404);
    const incoherent = await superApi.post(url, {
      planId: plan.id,
      dateDebut: "2030-05-01",
      dateExpiration: "2030-04-01",
    });
    assert.equal(incoherent.status, 400);
  });

  test("activation planifiée (début futur) -> EN_ATTENTE côté PDG", async () => {
    const debut = new Date(Date.now() + 10 * JOUR).toISOString();
    const res = await superApi.post(`/api/ateliers/${atelier.id}/abonnement/activer`, {
      planId: plan.id,
      dateDebut: debut,
      dureeMois: 1,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.statutEffectif, "EN_ATTENTE");
    const e = await etat();
    assert.equal(e.statut, "EN_ATTENTE");
    assert.equal(e.abonnement.planNom, plan.nom);
    await superApi.post(`/api/ateliers/${atelier.id}/abonnement/${res.body.id}/desactiver`, {});
  });

  test("activation immédiate -> ACTIF côté PDG avec plan, dates et prix figé ; historique écrit", async () => {
    const res = await superApi.post(`/api/ateliers/${atelier.id}/abonnement/activer`, {
      planId: plan.id,
      dureeMois: 2,
      note: "Paiement reçu en espèces",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.statutEffectif, "ACTIF");
    assert.equal(Number(res.body.prix), 30000);
    assert.equal(res.body.creePar.startsWith("superadmin-abo-"), true);

    const e = await etat();
    assert.equal(e.statut, "ACTIF");
    assert.equal(e.abonnement.planNom, plan.nom);
    assert.equal(e.abonnement.dureeMois, 2);
    assert.equal(Number(e.abonnement.prix), 30000);
    assert.ok(e.abonnement.dateDebut && e.abonnement.dateExpiration);
    assert.ok(e.abonnement.joursRestants >= 58 && e.abonnement.joursRestants <= 62);

    const detail = await superApi.get(`/api/ateliers/${atelier.id}/abonnement`);
    assert.equal(detail.body.statut, "ACTIF");
    assert.ok(detail.body.historique.some((h) => h.action === "ACTIVATION" && h.note === "Paiement reçu en espèces"));
  });

  test("le prix du plan modifié ensuite ne change pas l'abonnement déjà activé", async () => {
    await superApi.patch(`/api/plans-abonnement/${plan.id}`, { prixMensuel: "99999" });
    const detail = await superApi.get(`/api/ateliers/${atelier.id}/abonnement`);
    const actif = detail.body.abonnements.find((a) => a.statutEffectif === "ACTIF");
    assert.equal(Number(actif.prix), 30000);
  });

  test("abonnement ACTIF rouvre l'accès malgré l'essai expiré ; expirer/désactiver le referment", async () => {
    await prisma.atelier.update({ where: { id: atelier.id }, data: { trialEndsAt: new Date("2020-01-01") } });
    assert.equal((await adminApi.get("/api/clientes")).status, 200);

    const detail = await superApi.get(`/api/ateliers/${atelier.id}/abonnement`);
    const actif = detail.body.abonnements.find((a) => a.statutEffectif === "ACTIF");

    const modification = await superApi.patch(`/api/ateliers/${atelier.id}/abonnement/${actif.id}`, {
      dateExpiration: new Date(Date.now() + 90 * JOUR).toISOString(),
    });
    assert.equal(modification.status, 200);

    const expiration = await superApi.post(`/api/ateliers/${atelier.id}/abonnement/${actif.id}/expirer`, {});
    assert.equal(expiration.status, 200);
    assert.equal(expiration.body.statutEffectif, "EXPIRE");
    assert.equal((await etat()).statut, "EXPIRE");
    assert.equal((await adminApi.get("/api/clientes")).status, 402);
    assert.equal((await superApi.post(`/api/ateliers/${atelier.id}/abonnement/${actif.id}/expirer`, {})).status, 409);

    const reactive = await superApi.post(`/api/ateliers/${atelier.id}/abonnement/activer`, { planId: plan.id, dureeMois: 1 });
    assert.equal((await adminApi.get("/api/clientes")).status, 200);
    const desactivation = await superApi.post(`/api/ateliers/${atelier.id}/abonnement/${reactive.body.id}/desactiver`, {});
    assert.equal(desactivation.status, 200);
    assert.equal((await adminApi.get("/api/clientes")).status, 402);
    assert.notEqual((await etat()).statut, "ACTIF");

    const histo = (await superApi.get(`/api/ateliers/${atelier.id}/abonnement`)).body.historique.map((h) => h.action);
    for (const action of ["ACTIVATION", "MODIFICATION", "EXPIRATION", "DESACTIVATION"]) {
      assert.ok(histo.includes(action), `historique sans ${action}`);
    }
  });

  test("RÉGRESSION : un abonnement d'un autre atelier n'est ni modifiable ni désactivable via ce chemin (404)", async () => {
    const chezAutre = await superApi.post(`/api/ateliers/${autreAtelier.id}/abonnement/activer`, {
      planId: plan.id,
      dureeMois: 1,
    });
    assert.equal(chezAutre.status, 201);
    const tentative = await superApi.post(`/api/ateliers/${atelier.id}/abonnement/${chezAutre.body.id}/desactiver`, {});
    assert.equal(tentative.status, 404);
  });

  test("vue d'ensemble plateforme : statut calculé pour chaque atelier", async () => {
    const res = await superApi.get("/api/ateliers/abonnements");
    assert.equal(res.status, 200);
    const ligne = res.body.find((a) => a.id === autreAtelier.id);
    assert.equal(ligne.statut, "ACTIF");
    assert.equal(ligne.abonnement.planNom, plan.nom);
  });
});
