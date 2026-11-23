// Tarification Niger (XOF) : offres mensuelle / annuelle du catalogue, prix figé à la déclaration, aucun accès avant confirmation,
// contrats existants préservés, abonnés par formule. Base Postgres jetable dédiée (voir preload.js).
//
// Les montants ci-dessous sont des DONNÉES DE TEST ; aucun tarif n'est écrit dans le code de production.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";
import { prisma } from "../lib/prisma.js";

const JOUR = 86_400_000;
const MDP = "Atelier-Test-2026!";
const QUOTAS = { clientes: 100, employes: 1, commandesActives: 50, modeles: 50 };

describe("Tarification Niger : offres mensuelle et annuelle, prix figés", () => {
  let server, baseUrl;
  let A, B;
  let apiA, apiB, superApi;
  let superId;
  let plan, planSansTarif, planInactif;
  const marque = `${process.pid}-${Date.now()}`;
  let tel = 0;

  const declarer = (api, extra = {}) =>
    api.post("/api/abonnements/souscrire", {
      planId: plan.id,
      dureeMois: 1,
      moyenPaiement: "MOBILE_MONEY",
      operateur: "Airtel Money",
      reference: `AIR-${marque}-${++tel}`,
      ...extra,
    });
  const etat = async (api) => (await api.get("/api/abonnements/etat")).body;
  async function nettoyer(atelierId) {
    await prisma.factureAbonnement.deleteMany({ where: { atelierId } });
    await prisma.transaction.deleteMany({ where: { atelierId } });
    await prisma.historiqueAbonnement.deleteMany({ where: { atelierId } });
    await prisma.abonnement.deleteMany({ where: { atelierId } });
  }

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    let ia, pa, ib, pb;
    ({ atelier: A, identifiant: ia, password: pa } = await creerAtelierEtAdmin({ nom: "Atelier Tarif A" }));
    ({ atelier: B, identifiant: ib, password: pb } = await creerAtelierEtAdmin({ nom: "Atelier Tarif B" }));
    const identifiant = `superadmin-tarif-${marque}`;
    superId = (await prisma.user.create({ data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN" } })).id;
    apiA = client(baseUrl);
    apiB = client(baseUrl);
    superApi = client(baseUrl);
    assert.equal((await apiA.post("/api/auth/login", { identifiant: ia, password: pa })).status, 200);
    assert.equal((await apiB.post("/api/auth/login", { identifiant: ib, password: pb })).status, 200);
    assert.equal((await superApi.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    plan = await prisma.planAbonnement.create({
      data: { nom: `Tarif ${marque}`, prixMensuel: 3000, prixAnnuel: 30000, limites: QUOTAS, actif: true },
    });
    planSansTarif = await prisma.planAbonnement.create({ data: { nom: `Sans tarif ${marque}`, limites: QUOTAS, actif: true } });
    planInactif = await prisma.planAbonnement.create({
      data: { nom: `Inactive ${marque}`, prixMensuel: 3000, prixAnnuel: 30000, limites: QUOTAS, actif: false },
    });
  });

  after(async () => {
    await arreterServeur(server);
    for (const at of [A, B]) {
      await nettoyer(at.id);
      await supprimerAtelier(at.id);
    }
    await prisma.planAbonnement.deleteMany({ where: { id: { in: [plan.id, planSansTarif.id, planInactif.id] } } });
    await prisma.journalSecurite.deleteMany({ where: { evenement: { startsWith: "ABONNEMENT_" }, atelierId: { in: [A.id, B.id] } } });
    await prisma.user.delete({ where: { id: superId } });
    await prisma.$disconnect();
  });

  test("le catalogue propose la formule avec ses offres, sans durée par défaut ; une formule sans tarif ou inactive n'est pas listée", async () => {
    const liste = (await apiA.get("/api/plans-abonnement")).body;
    const vue = liste.find((p) => p.id === plan.id);
    assert.deepEqual(vue.offres.map((o) => [o.periodicite, o.dureeMois, o.prix, o.devise]), [
      ["MENSUEL", 1, 3000, "XOF"],
      ["ANNUEL", 12, 30000, "XOF"],
    ]);
    assert.equal(vue.economieAnnuelle, 6000, "2 mois offerts, calculés automatiquement");
    assert.equal(vue.moisOffertsAnnuel, 2);
    assert.ok(!liste.some((p) => p.id === planSansTarif.id), "sans tarif : pas proposée");
    assert.ok(!liste.some((p) => p.id === planInactif.id), "inactive : pas proposée");
  });

  test("souscription : prix mensuel et annuel pris dans le catalogue ; aucune période libre ; aucune formule sans tarif", async () => {
    const mensuel = await declarer(apiA);
    assert.equal(mensuel.status, 201);
    assert.equal(mensuel.body.montant, "3000");
    // Une seule déclaration en attente à la fois : on la clôt avant la suivante.
    await prisma.transaction.updateMany({ where: { atelierId: A.id }, data: { statut: "ANNULEE" } });
    const annuel = await declarer(apiA, { dureeMois: 12 });
    assert.equal(annuel.status, 201);
    assert.equal(annuel.body.montant, "30000", "prix annuel du catalogue, saisi tel quel");
    const transaction = await prisma.transaction.findUnique({ where: { numero: annuel.body.numero } });
    assert.equal(transaction.devise, "XOF");
    const abonnement = await prisma.abonnement.findUnique({ where: { id: transaction.abonnementId } });
    assert.equal(abonnement.dureeMois, 12);
    assert.equal(Number(abonnement.prix), 30000);
    assert.equal(abonnement.tarifExceptionnel, false);
    await nettoyer(A.id);

    for (const dureeMois of [2, 3, 6, 24]) assert.equal((await declarer(apiB, { dureeMois })).status, 400, `${dureeMois} mois`);
    assert.equal((await declarer(apiB, { planId: planSansTarif.id })).status, 400, "formule sans tarif : jamais souscriptible");
    assert.equal((await declarer(apiB, { planId: planSansTarif.id, dureeMois: 12 })).status, 400);
    assert.equal((await declarer(apiB, { planId: planInactif.id })).status, 404, "formule inactive");
    assert.equal((await declarer(apiB, { montant: 1 })).status, 400, "aucun montant ne vient du client");
    assert.equal(await prisma.transaction.count({ where: { atelierId: B.id } }), 0, "aucun refus ne laisse de transaction");
  });

  test("période sans prix : un plan mensuel seul refuse l'annuel, et inversement", async () => {
    const mensuelSeul = await prisma.planAbonnement.create({ data: { nom: `Mensuel seul ${marque}`, prixMensuel: 1000, actif: true } });
    const annuelSeul = await prisma.planAbonnement.create({ data: { nom: `Annuel seul ${marque}`, prixAnnuel: 10000, actif: true } });
    try {
      assert.equal((await declarer(apiB, { planId: mensuelSeul.id, dureeMois: 12 })).status, 400);
      assert.equal((await declarer(apiB, { planId: annuelSeul.id, dureeMois: 1 })).status, 400);
      const ok = await declarer(apiB, { planId: annuelSeul.id, dureeMois: 12 });
      assert.equal(ok.status, 201);
      assert.equal(ok.body.montant, "10000");
      const liste = (await apiB.get("/api/plans-abonnement")).body;
      assert.deepEqual(liste.find((p) => p.id === annuelSeul.id).offres.map((o) => o.periodicite), ["ANNUEL"]);
    } finally {
      await nettoyer(B.id);
      await prisma.planAbonnement.deleteMany({ where: { id: { in: [mensuelSeul.id, annuelSeul.id] } } });
    }
  });

  test("un paiement EN ATTENTE n'active rien : ni accès, ni quotas, ni abonnement actif", async () => {
    const avant = await etat(apiA);
    const res = await declarer(apiA, { dureeMois: 12 });
    assert.equal(res.status, 201);
    assert.equal(res.body.statut, "EN_ATTENTE");
    const apres = await etat(apiA);
    assert.equal(apres.statut, avant.statut, "l'état d'abonnement ne change pas");
    assert.equal(apres.abonnement, null, "aucun abonnement actif");
    assert.equal(apres.paiementEnAttente.montant, "30000");
    const abos = await prisma.abonnement.findMany({ where: { atelierId: A.id } });
    assert.equal(abos.length, 1);
    assert.equal(abos[0].statut, "EN_ATTENTE");
    assert.equal(abos[0].dateDebut, null);
    assert.equal(abos[0].dateExpiration, null);
    const utilisation = (await apiA.get("/api/abonnements/utilisation")).body;
    assert.notEqual(utilisation.raison, "ABONNEMENT", "les quotas d'un abonnement non confirmé ne s'appliquent pas");
  });

  test("le prix déclaré est FIGÉ : modifier ou retirer le catalogue ne change ni la transaction en attente ni l'abonnement confirmé", async () => {
    assert.equal((await superApi.patch(`/api/plans-abonnement/${plan.id}`, { prixMensuel: 9999, prixAnnuel: 99999 })).status, 200);
    const enAttente = await etat(apiA);
    assert.equal(enAttente.paiementEnAttente.montant, "30000", "montant déclaré inchangé");

    const t = await prisma.transaction.findFirst({ where: { atelierId: A.id, statut: "EN_ATTENTE" } });
    const confirmation = await superApi.post(`/api/plateforme/transactions/${t.id}/confirmer`, {});
    assert.equal(confirmation.status, 200, JSON.stringify(confirmation.body));
    const apres = await etat(apiA);
    assert.equal(apres.statut, "ACTIF");
    assert.equal(Number(apres.abonnement.prix), 30000, "prix annuel figé à la déclaration");
    assert.equal(apres.abonnement.dureeMois, 12);

    // Les quotas de la formule sont figés dans l'abonnement annuel, comme pour un mensuel.
    const abo = await prisma.abonnement.findFirst({ where: { atelierId: A.id, statut: "CONFIRME" } });
    assert.deepEqual(abo.limites, QUOTAS);
    // Modifier la formule ensuite : rien ne bouge dans le contrat.
    await superApi.patch(`/api/plans-abonnement/${plan.id}`, { prixAnnuel: null, limites: { clientes: 1, employes: 1, commandesActives: 1, modeles: 1 } });
    const fige = await prisma.abonnement.findUnique({ where: { id: abo.id } });
    assert.equal(Number(fige.prix), 30000);
    assert.deepEqual(fige.limites, QUOTAS);
    await superApi.patch(`/api/plans-abonnement/${plan.id}`, { prixMensuel: 3000, prixAnnuel: 30000, limites: QUOTAS });
  });

  test("un contrat existant (3 mois, remise passée) est préservé : prix, durée et quotas inchangés, jamais re-proposé", async () => {
    const ancien = await prisma.abonnement.create({
      data: {
        numero: `ABN-TARIF-${marque}`,
        atelierId: B.id,
        planId: plan.id,
        planNom: plan.nom,
        dureeMois: 3,
        prix: 8100,
        limites: {},
        statut: "CONFIRME",
        dateDebut: new Date(Date.now() - 10 * JOUR),
        dateExpiration: new Date(Date.now() + 80 * JOUR),
      },
    });
    const e = await etat(apiB);
    assert.equal(e.statut, "ACTIF");
    assert.equal(e.abonnement.dureeMois, 3);
    assert.equal(Number(e.abonnement.prix), 8100);
    const relu = await prisma.abonnement.findUnique({ where: { id: ancien.id } });
    assert.deepEqual(relu.limites, {}, "limites vides conservées : aucun quota rétroactif");
    assert.ok(!(await apiB.get("/api/plans-abonnement")).body.some((p) => p.offres?.some((o) => o.dureeMois === 3)));
    await nettoyer(B.id);
  });

  test("abonnés d'une formule : nombre, prix figé, revenu mensuel récurrent ; SUPERADMIN seulement", async () => {
    const res = await superApi.get(`/api/plans-abonnement/${plan.id}/abonnes`);
    assert.equal(res.status, 200);
    assert.equal(res.body.nombre, 1);
    assert.equal(res.body.ateliers[0].atelier.id, A.id);
    assert.equal(Number(res.body.ateliers[0].abonnement.prix), 30000);
    assert.equal(res.body.ateliers[0].revenuMensuel, 2500, "30 000 ÷ 12 mois");
    assert.equal(res.body.revenuMensuel, 2500);
    assert.equal((await apiA.get(`/api/plans-abonnement/${plan.id}/abonnes`)).status, 403);
    assert.equal((await superApi.get(`/api/plans-abonnement/${planSansTarif.id}/abonnes`)).body.nombre, 0);
    assert.equal((await superApi.get("/api/plans-abonnement/inexistant-1234/abonnes")).status, 404);
  });
});
