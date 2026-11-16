// Paiement d'abonnement par Wave — contre un FAUX serveur Wave local (aucun appel à l'API réelle, impossible sans compte
// Wave Business). Vérifie surtout ce qui ne doit JAMAIS arriver : confirmer un paiement sur la foi du navigateur, d'un
// webhook falsifié, d'un montant différent, ou deux fois.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { signerWebhook } from "../lib/wave.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";
import { demarrerFauxWave, CLE_API } from "./faux-wave.js";

const MDP = "Atelier-Test-2026!";
const SECRET_WEBHOOK = "wave_sn_WHS_secret_de_test";
const SECRET_CRON = "secret-cron-wave";
const ENV = ["WAVE_ENABLED", "WAVE_API_KEY", "WAVE_WEBHOOK_SECRET", "WAVE_API_BASE", "PUBLIC_APP_URL", "CRON_SECRET", "RESEND_API_KEY"];

describe("Paiement d'abonnement par Wave (faux serveur Wave)", () => {
  let server, baseUrl, wave, atelier, autreAtelier, api, apiAutre, superApi, superId, plan;
  const avant = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  let compteurEvt = 0;

  const activerWave = () => {
    process.env.WAVE_ENABLED = "1";
    process.env.WAVE_API_KEY = CLE_API;
    process.env.WAVE_WEBHOOK_SECRET = SECRET_WEBHOOK;
  };
  const desactiverWave = () => {
    delete process.env.WAVE_ENABLED;
  };

  const payer = (extra = {}) => api.post("/api/abonnements/payer-wave", { planId: plan.id, dureeMois: 1, ...extra });
  const evenement = (session, extra = {}) => ({
    id: `EV_${process.pid}_${++compteurEvt}`,
    type: "checkout.session.completed",
    data: { id: session.id, client_reference: session.client_reference, amount: session.amount, currency: session.currency, payment_status: "succeeded", checkout_status: "complete" },
    ...extra,
  });
  async function envoyerWebhook(event, { signature, secret = SECRET_WEBHOOK, timestamp } = {}) {
    const corps = JSON.stringify(event);
    const entetes = { "Content-Type": "application/json" };
    if (signature !== null) entetes["Wave-Signature"] = signature ?? signerWebhook(corps, secret, timestamp);
    return fetch(`${baseUrl}/api/webhooks/wave`, { method: "POST", headers: entetes, body: corps });
  }
  const transactionDe = (sessionId) => prisma.transaction.findFirst({ where: { referenceExterne: sessionId } });
  const factures = () => prisma.factureAbonnement.count({ where: { atelierId: atelier.id } });
  const etat = async (a = api) => (await a.get("/api/abonnements/etat")).body;

  /** Nettoie les transactions de l'atelier pour que chaque scénario parte d'une situation vide. */
  async function reinitialiser() {
    for (const id of [atelier.id]) {
      await prisma.factureAbonnement.deleteMany({ where: { atelierId: id } });
      await prisma.transaction.deleteMany({ where: { atelierId: id } });
      await prisma.historiqueAbonnement.deleteMany({ where: { atelierId: id } });
      await prisma.abonnement.deleteMany({ where: { atelierId: id } });
    }
    await prisma.journalSecurite.deleteMany({ where: { atelierId: atelier.id } });
    await prisma.evenementPaiement.deleteMany({ where: { fournisseur: "WAVE", evenementId: { startsWith: `EV_${process.pid}_` } } });
    wave.pannes.creation = wave.pannes.lecture = wave.pannes.remboursement = false;
  }

  before(async () => {
    wave = await demarrerFauxWave();
    process.env.WAVE_API_BASE = wave.url;
    process.env.PUBLIC_APP_URL = "https://app.example.test";
    process.env.CRON_SECRET = SECRET_CRON;
    delete process.env.RESEND_API_KEY;
    activerWave();
    ({ server, baseUrl } = await demarrerServeur());

    let i1, p1, i2, p2;
    ({ atelier, identifiant: i1, password: p1 } = await creerAtelierEtAdmin({ nom: "Atelier Wave A" }));
    ({ atelier: autreAtelier, identifiant: i2, password: p2 } = await creerAtelierEtAdmin({ nom: "Atelier Wave B" }));
    const identifiantSuper = `superadmin-wave-${process.pid}-${Date.now()}`;
    const sa = await prisma.user.create({
      data: { identifiant: identifiantSuper, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN" },
    });
    superId = sa.id;
    api = client(baseUrl);
    apiAutre = client(baseUrl);
    superApi = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant: i1, password: p1 })).status, 200);
    assert.equal((await apiAutre.post("/api/auth/login", { identifiant: i2, password: p2 })).status, 200);
    assert.equal((await superApi.post("/api/auth/login", { identifiant: identifiantSuper, password: MDP })).status, 200);
    plan = await prisma.planAbonnement.create({ data: { nom: `Plan Wave ${process.pid}`, prixMensuel: "10000" } });
    // L'essai est terminé : seul un paiement donne accès.
    await prisma.atelier.update({ where: { id: atelier.id }, data: { trialEndsAt: new Date(Date.now() - 60 * 86_400_000) } });
  });

  beforeEach(async () => {
    activerWave();
    await reinitialiser();
  });

  after(async () => {
    for (const k of ENV) {
      if (avant[k] === undefined) delete process.env[k];
      else process.env[k] = avant[k];
    }
    await arreterServeur(server);
    await wave.arreter();
    await reinitialiser();
    for (const at of [atelier, autreAtelier]) {
      await prisma.rappelAbonnement.deleteMany({ where: { atelierId: at.id } });
      await supprimerAtelier(at.id);
    }
    await prisma.planAbonnement.delete({ where: { id: plan.id } });
    await prisma.journalSecurite.deleteMany({ where: { atelierId: { in: [atelier.id, autreAtelier.id] } } });
    await prisma.user.delete({ where: { id: superId } });
    await prisma.$disconnect();
  });

  describe("inactif par défaut", () => {
    it("sans activation explicite, Wave n'est ni proposé, ni utilisable, ni écouté", async () => {
      desactiverWave();
      assert.equal((await etat()).paiementsEnLigne.wave, false);
      assert.equal((await payer()).status, 503);
      const appelsAvant = wave.appels.length;
      const res = await envoyerWebhook({ id: "EV_x", type: "checkout.session.completed", data: {} });
      assert.equal(res.status, 503);
      assert.equal(wave.appels.length, appelsAvant, "aucun appel à Wave");
      assert.equal(await prisma.transaction.count({ where: { atelierId: atelier.id } }), 0);
    });

    it("activé et configuré, Wave est proposé", async () => {
      assert.equal((await etat()).paiementsEnLigne.wave, true);
    });
  });

  describe("paiement réussi", () => {
    it("ouvre une session au bon montant, n'accorde aucun accès avant la relecture chez Wave", async () => {
      const res = await payer({ dureeMois: 1 });
      assert.equal(res.status, 201);
      assert.equal(res.body.checkoutUrl, "https://pay.wave.com/c/cos-1".replace("cos-1", wave.derniereSession().id));
      const s = wave.derniereSession();
      assert.equal(s.amount, "10000");
      assert.equal(s.currency, "XOF");
      assert.match(s.client_reference, /^WAV-/);
      const appelCreation = wave.appels.find((a) => a.methode === "POST" && a.chemin === "/v1/checkout/sessions");
      assert.ok(appelCreation.corps.success_url.startsWith("https://app.example.test/abonnement"));

      const t = await transactionDe(s.id);
      assert.equal(t.statut, "EN_ATTENTE");
      assert.equal(t.moyenPaiement, "WAVE");
      assert.equal((await etat()).acces.mode, "LECTURE_SEULE");
    });

    it("le retour du navigateur ne confirme rien : « vérifier » ne fait que lire ce que Wave répond", async () => {
      const { body } = await payer();
      assert.equal((await api.post(`/api/abonnements/transactions/${body.id}/verifier`, { statut: "REUSSIE", paye: true })).body.statut, "EN_ATTENTE");
      assert.equal((await etat()).acces.mode, "LECTURE_SEULE");
      assert.equal(await factures(), 0);
    });

    it("webhook signé : la session est relue chez Wave, l'abonnement est activé et la facture émise", async () => {
      const { body } = await payer();
      const s = wave.derniereSession();
      wave.payer(s.id);
      const res = await envoyerWebhook(evenement(s));
      assert.equal(res.status, 200);

      const t = await prisma.transaction.findUnique({ where: { id: body.id } });
      assert.equal(t.statut, "REUSSIE");
      assert.equal(t.confirmeManuellement, false);
      assert.equal(t.confirmePar, `wave:${s.id}`);
      assert.ok(t.donneesBrutesWebhook?.session, "la session relue est conservée pour audit");
      const lecture = wave.appels.filter((a) => a.methode === "GET" && a.chemin === `/v1/checkout/sessions/${s.id}`);
      assert.ok(lecture.length >= 1, "relecture authentifiée chez Wave");
      assert.equal(lecture[0].autorisation, `Bearer ${CLE_API}`);
      assert.equal((await etat()).statut, "ACTIF");
      assert.equal((await etat()).acces.mode, "COMPLET");
      assert.equal(await factures(), 1);
      assert.equal(await prisma.journalSecurite.count({ where: { atelierId: atelier.id, evenement: "ABONNEMENT_PAIEMENT_CONFIRME" } }), 1);
    });

    it("le retour du navigateur puis « vérifier » confirme aussi, mais seulement si Wave le dit", async () => {
      const { body } = await payer();
      wave.payer(wave.derniereSession().id);
      const res = await api.post(`/api/abonnements/transactions/${body.id}/verifier`, {});
      assert.equal(res.body.statut, "REUSSIE");
      assert.equal(await factures(), 1);
    });
  });

  describe("doublons et rejeu", () => {
    it("le même événement rejoué, puis un autre événement pour la même session : un seul effet", async () => {
      await payer();
      const s = wave.derniereSession();
      wave.payer(s.id);
      const evt = evenement(s);
      assert.equal((await envoyerWebhook(evt)).status, 200);
      assert.equal((await envoyerWebhook(evt)).status, 200);
      assert.equal((await envoyerWebhook(evenement(s))).status, 200);
      assert.equal(await factures(), 1);
      assert.equal(await prisma.historiqueAbonnement.count({ where: { atelierId: atelier.id, action: "CONFIRMATION_PAIEMENT" } }), 1);
      assert.equal(await prisma.journalSecurite.count({ where: { atelierId: atelier.id, evenement: "ABONNEMENT_PAIEMENT_CONFIRME" } }), 1);
    });

    it("cinq livraisons simultanées du même événement : une seule activation", async () => {
      await payer();
      const s = wave.derniereSession();
      wave.payer(s.id);
      const evt = evenement(s);
      const reponses = await Promise.all(Array.from({ length: 5 }, () => envoyerWebhook(evt)));
      assert.deepEqual(reponses.map((r) => r.status), [200, 200, 200, 200, 200]);
      assert.equal(await factures(), 1);
      assert.equal(await prisma.evenementPaiement.count({ where: { fournisseur: "WAVE", evenementId: evt.id } }), 1);
    });
  });

  describe("falsification", () => {
    it("signature absente, fausse, d'un autre secret, ou horodatage périmé : 401, aucune lecture chez Wave", async () => {
      await payer();
      const s = wave.derniereSession();
      wave.payer(s.id);
      const evt = evenement(s);
      const appelsAvant = wave.appels.length;
      assert.equal((await envoyerWebhook(evt, { signature: null })).status, 401);
      assert.equal((await envoyerWebhook(evt, { signature: "t=1,v1=abcd" })).status, 401);
      assert.equal((await envoyerWebhook(evt, { secret: "autre-secret" })).status, 401);
      assert.equal((await envoyerWebhook(evt, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status, 401);
      assert.equal(wave.appels.length, appelsAvant);
      assert.equal(await factures(), 0);
    });

    it("webhook correctement signé annonçant un paiement que Wave ne confirme pas : rien n'est activé", async () => {
      await payer();
      const s = wave.derniereSession(); // toujours « open » chez Wave
      const res = await envoyerWebhook(evenement(s));
      assert.equal(res.status, 200);
      assert.equal((await transactionDe(s.id)).statut, "EN_ATTENTE");
      assert.equal(await factures(), 0);
      assert.equal((await etat()).acces.mode, "LECTURE_SEULE");
    });

    it("montant payé différent du montant attendu : rien n'est activé, anomalie journalisée", async () => {
      await payer();
      const s = wave.derniereSession();
      wave.payer(s.id, { montant: 100 });
      const res = await envoyerWebhook(evenement(s));
      assert.equal(res.status, 200);
      const t = await transactionDe(s.id);
      assert.equal(t.statut, "EN_ATTENTE");
      assert.match(t.donneesBrutesWebhook.incoherence, /montant/);
      assert.equal(await factures(), 0);
      assert.equal((await etat()).acces.mode, "LECTURE_SEULE");
      assert.equal(await prisma.journalSecurite.count({ where: { atelierId: atelier.id, evenement: "ABONNEMENT_WAVE_INCOHERENT" } }), 1);
    });

    it("webhook pour une référence inconnue ou un autre type d'événement : accusé de réception, aucun effet", async () => {
      assert.equal((await envoyerWebhook({ id: "EV_inconnu", type: "checkout.session.completed", data: { id: "cos-x", client_reference: "WAV-inexistant" } })).status, 200);
      assert.equal((await envoyerWebhook({ id: "EV_autre", type: "merchant.payment_received", data: {} })).status, 200);
      assert.equal(await factures(), 0);
    });

    it("un paiement Wave ne peut pas être confirmé à la main par le SUPERADMIN", async () => {
      const { body } = await payer();
      assert.equal((await superApi.post(`/api/plateforme/transactions/${body.id}/confirmer`, {})).status, 409);
      assert.equal(await factures(), 0);
    });

    it("un autre atelier ne peut ni voir ni vérifier la transaction (404)", async () => {
      const { body } = await payer();
      assert.equal((await apiAutre.post(`/api/abonnements/transactions/${body.id}/verifier`, {})).status, 404);
    });
  });

  describe("pannes", () => {
    it("Wave injoignable à la relecture : 503 pour que Wave réessaie, rien de conclu, l'événement n'est pas consommé", async () => {
      await payer();
      const s = wave.derniereSession();
      wave.payer(s.id);
      const evt = evenement(s);
      wave.pannes.lecture = true;
      const echec = await envoyerWebhook(evt);
      assert.equal(echec.status, 503);
      assert.equal((await transactionDe(s.id)).statut, "EN_ATTENTE");
      assert.equal(await prisma.evenementPaiement.count({ where: { fournisseur: "WAVE", evenementId: evt.id } }), 0);

      wave.pannes.lecture = false;
      assert.equal((await envoyerWebhook(evt)).status, 200, "la nouvelle livraison est traitée normalement");
      assert.equal((await transactionDe(s.id)).statut, "REUSSIE");
    });

    it("« vérifier » pendant une panne de Wave : 503, la transaction reste en attente", async () => {
      const { body } = await payer();
      wave.payer(wave.derniereSession().id);
      wave.pannes.lecture = true;
      assert.equal((await api.post(`/api/abonnements/transactions/${body.id}/verifier`, {})).status, 503);
      assert.equal((await prisma.transaction.findUnique({ where: { id: body.id } })).statut, "EN_ATTENTE");
    });

    it("Wave refuse d'ouvrir la session : 503, transaction clôturée, rien d'activé, nouvel essai possible", async () => {
      wave.pannes.creation = true;
      const res = await payer();
      assert.equal(res.status, 503);
      const t = await prisma.transaction.findFirst({ where: { atelierId: atelier.id } });
      assert.equal(t.statut, "EXPIREE");
      assert.equal((await prisma.abonnement.findUnique({ where: { id: t.abonnementId } })).statut, "ANNULE");
      wave.pannes.creation = false;
      assert.equal((await payer()).status, 201);
    });
  });

  describe("expiration et rattrapage", () => {
    it("session expirée chez Wave : « vérifier » clôt la transaction (EXPIREE) et libère l'atelier", async () => {
      const { body } = await payer();
      wave.expirer(wave.derniereSession().id);
      assert.equal((await api.post(`/api/abonnements/transactions/${body.id}/verifier`, {})).body.statut, "EXPIREE");
      assert.equal((await etat()).paiementEnAttente, null);
      assert.equal((await payer()).status, 201, "une nouvelle tentative est possible");
    });

    it("une nouvelle tentative relit d'abord une session périmée au lieu d'être refusée", async () => {
      await payer();
      wave.expirer(wave.derniereSession().id);
      assert.equal((await payer()).status, 201);
    });

    it("tâche quotidienne : un paiement abouti dont le webhook n'est jamais arrivé est rattrapé", async () => {
      const { body } = await payer();
      wave.payer(wave.derniereSession().id);
      await prisma.transaction.update({ where: { id: body.id }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
      const res = await fetch(`${baseUrl}/api/cron/rappels-quotidiens`, { headers: { Authorization: `Bearer ${SECRET_CRON}` } });
      assert.equal(res.status, 200);
      const compte = await res.json();
      assert.ok(compte.rattrapageWave.confirmees >= 1);
      assert.equal((await prisma.transaction.findUnique({ where: { id: body.id } })).statut, "REUSSIE");
      assert.equal(await factures(), 1);
    });

    it("tâche quotidienne : une transaction toute récente est laissée au webhook", async () => {
      const { body } = await payer();
      wave.payer(wave.derniereSession().id);
      await fetch(`${baseUrl}/api/cron/rappels-quotidiens`, { headers: { Authorization: `Bearer ${SECRET_CRON}` } });
      assert.equal((await prisma.transaction.findUnique({ where: { id: body.id } })).statut, "EN_ATTENTE");
    });

    it("transaction Wave dont la session n'a jamais été créée : abandonnée après 5 minutes", async () => {
      const { body } = await payer();
      await prisma.transaction.update({ where: { id: body.id }, data: { referenceExterne: null, createdAt: new Date(Date.now() - 10 * 60_000) } });
      await fetch(`${baseUrl}/api/cron/rappels-quotidiens`, { headers: { Authorization: `Bearer ${SECRET_CRON}` } });
      const t = await prisma.transaction.findUnique({ where: { id: body.id } });
      assert.equal(t.statut, "EXPIREE");
      assert.match(t.motifRejet, /jamais créée/);
    });
  });

  describe("remboursement", () => {
    async function payerEtConfirmer() {
      const { body } = await payer();
      const s = wave.derniereSession();
      wave.payer(s.id);
      await envoyerWebhook(evenement(s));
      return { id: body.id, session: s };
    }

    it("rembourse d'abord chez Wave, puis enregistre ; rejouer ne rembourse pas deux fois côté plateforme", async () => {
      const { id, session } = await payerEtConfirmer();
      const res = await superApi.post(`/api/plateforme/transactions/${id}/rembourser`, { motif: "Erreur de l'atelier" });
      assert.equal(res.status, 200);
      assert.equal(res.body.statut, "REMBOURSEE");
      assert.equal(wave.sessions.get(session.id).refunded, true);
      assert.equal(wave.appels.filter((a) => a.chemin.endsWith("/refund")).length, 1);
      const rejeu = await superApi.post(`/api/plateforme/transactions/${id}/rembourser`, { motif: "Erreur de l'atelier" });
      assert.equal(rejeu.body.dejaTraitee, true);
      assert.equal(wave.appels.filter((a) => a.chemin.endsWith("/refund")).length, 1, "pas de second appel à Wave");
    });

    it("Wave refuse ou ne répond pas : 502, rien n'est enregistré", async () => {
      const { id } = await payerEtConfirmer();
      wave.pannes.remboursement = true;
      const res = await superApi.post(`/api/plateforme/transactions/${id}/rembourser`, { motif: "Erreur de l'atelier" });
      assert.equal(res.status, 502);
      assert.equal((await prisma.transaction.findUnique({ where: { id } })).statut, "REUSSIE");
      assert.equal(await prisma.factureAbonnement.count({ where: { annuleeLe: { not: null }, atelierId: atelier.id } }), 0);
    });
  });
});
