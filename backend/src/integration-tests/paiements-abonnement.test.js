// Architecture de paiement d'abonnement (Wave/NITA/Amanata) en mode mock
// (PAYMENTS_MODE=mock, voir preload.js) — flux complet souscription ->
// paiement -> confirmation -> activation, sans clé API réelle. Base Postgres
// jetable dédiée (voir preload.js/helpers.js).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";
import { prisma } from "../lib/prisma.js";

describe("Paiement d'abonnement — mode mock", () => {
  let server;
  let baseUrl;
  let atelier;
  let identifiant;
  let password;
  let formule;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    ({ atelier, identifiant, password } = await creerAtelierEtAdmin({ nom: "Atelier Paiement Mock" }));
    formule = await prisma.formuleAbonnement.upsert({
      where: { dureeMois: 2 },
      update: {},
      create: { dureeMois: 2, nom: "2 mois", prix: "7000" },
    });
  });

  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(atelier.id);
    await prisma.$disconnect();
  });

  async function souscrireWave() {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password });
    const res = await api.post("/api/abonnements", { formuleId: formule.id, moyenPaiement: "WAVE" });
    assert.equal(res.status, 201);
    return { api, res };
  }

  test("GET /api/abonnements/config -> mockActif true (PAYMENTS_MODE=mock, NODE_ENV=test)", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password });
    const res = await api.get("/api/abonnements/config");
    assert.equal(res.status, 200);
    assert.equal(res.body.mockActif, true);
  });

  test("souscription WAVE en mode mock -> checkoutUrl interne, référence externe préfixée mock_wave_", async () => {
    const { res } = await souscrireWave();
    assert.ok(res.body.checkoutUrl.startsWith("/abonnement/paiement-test/"));
    assert.ok(res.body.transaction.referenceExterne.startsWith("mock_wave_"));
    assert.equal(res.body.transaction.statut, "EN_ATTENTE");
    assert.equal(res.body.abonnement.statutEffectif, "EN_ATTENTE");
  });

  test("simuler-mock REUSSIE -> transaction REUSSIE + abonnement CONFIRME/ACTIF avec dateExpiration", async () => {
    const { api, res } = await souscrireWave();
    const transactionId = res.body.transaction.id;

    const simulation = await api.post(`/api/transactions/${transactionId}/simuler-mock`, { resultat: "REUSSIE" });
    assert.equal(simulation.status, 200);
    assert.equal(simulation.body.statut, "REUSSIE");

    const actuel = await api.get("/api/abonnements/actuel");
    assert.equal(actuel.status, 200);
    assert.equal(actuel.body.id, res.body.abonnement.id);
    assert.equal(actuel.body.statutEffectif, "ACTIF");
    assert.ok(actuel.body.dateExpiration);
  });

  for (const resultat of ["ECHOUEE", "ANNULEE", "EXPIREE"]) {
    test(`simuler-mock ${resultat} -> transaction ${resultat}, abonnement reste EN_ATTENTE (jamais activé)`, async () => {
      const { api, res } = await souscrireWave();
      const transactionId = res.body.transaction.id;

      const simulation = await api.post(`/api/transactions/${transactionId}/simuler-mock`, { resultat });
      assert.equal(simulation.status, 200);
      assert.equal(simulation.body.statut, resultat);

      const abonnement = await prisma.abonnement.findUnique({ where: { id: res.body.abonnement.id } });
      assert.equal(abonnement.statut, "EN_ATTENTE");
      assert.equal(abonnement.dateDebut, null);
    });
  }

  test("simuler-mock une deuxième fois sur une transaction déjà tranchée -> 409 (idempotence)", async () => {
    const { api, res } = await souscrireWave();
    const transactionId = res.body.transaction.id;
    await api.post(`/api/transactions/${transactionId}/simuler-mock`, { resultat: "REUSSIE" });
    const rejeu = await api.post(`/api/transactions/${transactionId}/simuler-mock`, { resultat: "ECHOUEE" });
    assert.equal(rejeu.status, 409);

    // Le rejeu ne doit jamais avoir désactivé l'abonnement déjà confirmé.
    const actuel = await api.get("/api/abonnements/actuel");
    assert.equal(actuel.body.statutEffectif, "ACTIF");
  });

  test("simuler-mock sur une transaction NITA -> 409 (moyen manuel, jamais simulable)", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password });
    const res = await api.post("/api/abonnements", {
      formuleId: formule.id,
      moyenPaiement: "NITA",
      referenceExterne: "REF-NITA-TEST-1",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.checkoutUrl, undefined);

    const simulation = await api.post(`/api/transactions/${res.body.transaction.id}/simuler-mock`, {
      resultat: "REUSSIE",
    });
    assert.equal(simulation.status, 409);
  });

  test("confirmer-manuel NITA fonctionne toujours après le passage par activerAbonnement()", async () => {
    const api = client(baseUrl);
    await api.post("/api/auth/login", { identifiant, password });
    const creation = await api.post("/api/abonnements", {
      formuleId: formule.id,
      moyenPaiement: "NITA",
      referenceExterne: "REF-NITA-TEST-2",
    });
    assert.equal(creation.status, 201);

    const confirmation = await api.post(`/api/transactions/${creation.body.transaction.id}/confirmer-manuel`);
    assert.equal(confirmation.status, 200);
    assert.equal(confirmation.body.statut, "REUSSIE");
    assert.equal(confirmation.body.confirmeManuellement, true);

    const actuel = await api.get("/api/abonnements/actuel");
    assert.equal(actuel.body.statutEffectif, "ACTIF");
  });

  test("RÉGRESSION : un autre atelier ne peut pas simuler la transaction d'un atelier tiers (404)", async () => {
    const { atelier: autreAtelier, identifiant: autreId, password: autrePassword } = await creerAtelierEtAdmin({
      nom: "Atelier Tiers Paiement",
    });
    try {
      const { res } = await souscrireWave();
      const autreApi = client(baseUrl);
      await autreApi.post("/api/auth/login", { identifiant: autreId, password: autrePassword });
      const tentative = await autreApi.post(`/api/transactions/${res.body.transaction.id}/simuler-mock`, {
        resultat: "REUSSIE",
      });
      assert.equal(tentative.status, 404);
    } finally {
      await supprimerAtelier(autreAtelier.id);
    }
  });
});
