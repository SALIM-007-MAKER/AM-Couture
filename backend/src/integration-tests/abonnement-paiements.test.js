// Souscription par l'atelier et paiements d'abonnement vérifiés côté serveur (paiement MANUEL déclaré puis confirmé
// par le SUPERADMIN). Aucun paiement en ligne, aucune simulation. Base Postgres jetable dédiée (voir preload.js).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";
import { prisma } from "../lib/prisma.js";

const JOUR = 86_400_000;
const MDP_SUPER = "Atelier-Test-2026!";

describe("Souscription et paiements d'abonnement", () => {
  let server, baseUrl;
  let A, B; // deux ateliers
  let apiA, apiB, superApi;
  let superadminId, superIdentifiant;
  let plan;

  const declarer = (api, extra = {}, entetes) =>
    api.post(
      "/api/abonnements/souscrire",
      { planId: plan.id, dureeMois: 12, moyenPaiement: "MOBILE_MONEY", operateur: "Airtel Money", reference: "AIR-12345", ...extra },
      entetes,
    );
  const etat = async (api) => (await api.get("/api/abonnements/etat")).body;
  async function nettoyerTransactions(atelierId) {
    await prisma.factureAbonnement.deleteMany({ where: { atelierId } });
    await prisma.transaction.deleteMany({ where: { atelierId } });
    await prisma.historiqueAbonnement.deleteMany({ where: { atelierId } });
    await prisma.abonnement.deleteMany({ where: { atelierId } });
  }

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    let ia, pa, ib, pb;
    ({ atelier: A, identifiant: ia, password: pa } = await creerAtelierEtAdmin({ nom: "Atelier Souscription A" }));
    ({ atelier: B, identifiant: ib, password: pb } = await creerAtelierEtAdmin({ nom: "Atelier Souscription B" }));
    superIdentifiant = `superadmin-sub-${process.pid}-${Date.now()}`;
    const sa = await prisma.user.create({
      data: { identifiant: superIdentifiant, passwordHash: await bcrypt.hash(MDP_SUPER, 4), role: "SUPERADMIN" },
    });
    superadminId = sa.id;
    apiA = client(baseUrl);
    apiB = client(baseUrl);
    superApi = client(baseUrl);
    assert.equal((await apiA.post("/api/auth/login", { identifiant: ia, password: pa })).status, 200);
    assert.equal((await apiB.post("/api/auth/login", { identifiant: ib, password: pb })).status, 200);
    assert.equal((await superApi.post("/api/auth/login", { identifiant: superIdentifiant, password: MDP_SUPER })).status, 200);
    plan = await prisma.planAbonnement.create({
      data: {
        nom: `Plan souscription ${process.pid}`,
        prixMensuel: 10000,
        prixAnnuel: 100000,
      },
    });
  });

  after(async () => {
    await arreterServeur(server);
    for (const at of [A, B]) {
      await nettoyerTransactions(at.id);
      await supprimerAtelier(at.id);
    }
    await prisma.planAbonnement.delete({ where: { id: plan.id } });
    await prisma.journalSecurite.deleteMany({ where: { evenement: { startsWith: "ABONNEMENT_" }, atelierId: { in: [A.id, B.id] } } });
    await prisma.user.delete({ where: { id: superadminId } });
    await prisma.$disconnect();
  });

  describe("déclaration par l'atelier", () => {
    test("le prix est calculé par le serveur et n'accorde aucun accès", async () => {
      const avant = await etat(apiA);
      const res = await declarer(apiA);
      assert.equal(res.status, 201);
      assert.equal(res.body.statut, "EN_ATTENTE");
      assert.equal(res.body.montant, "100000"); // prix ANNUEL du catalogue, saisi tel quel (pas 12 × 10 000)
      const apres = await etat(apiA);
      assert.equal(apres.statut, avant.statut, "déclarer un paiement ne change pas l'état d'abonnement");
      assert.equal(apres.paiementEnAttente.numero, res.body.numero);
      assert.equal(apres.paiementEnAttente.montant, "100000");
    });

    test("un montant envoyé par le client est refusé, jamais pris en compte", async () => {
      const res = await declarer(apiB, { montant: "1" });
      assert.equal(res.status, 400);
    });

    test("une seconde déclaration est refusée tant que la première n'est pas tranchée", async () => {
      const res = await declarer(apiA, { reference: "AIR-99999" });
      assert.equal(res.status, 409);
    });

    test("durée non proposée, moyen Wave, référence manquante : refusés", async () => {
      for (const d of [2, 3, 5, 6, 24]) assert.equal((await declarer(apiB, { dureeMois: d })).status, 400, `${d} mois : seules 1 et 12 sont proposées`);
      assert.equal((await declarer(apiB, { moyenPaiement: "WAVE" })).status, 400);
      assert.equal((await declarer(apiB, { reference: undefined })).status, 400);
    });

    test("formule inexistante ou désactivée : 404", async () => {
      assert.equal((await declarer(apiB, { planId: "inexistant" })).status, 404);
    });

    test("espèces sans référence : accepté ; puis rejeu avec la même clé d'idempotence : une seule transaction", async () => {
      const cle = `idem-souscription-${process.pid}-${Date.now()}`;
      const un = await declarer(apiB, { moyenPaiement: "ESPECES", reference: undefined }, { "Idempotency-Key": cle });
      const deux = await declarer(apiB, { moyenPaiement: "ESPECES", reference: undefined }, { "Idempotency-Key": cle });
      assert.equal(un.status, 201);
      assert.equal(deux.status, 201);
      assert.equal(deux.body.numero, un.body.numero);
      assert.equal(await prisma.transaction.count({ where: { atelierId: B.id } }), 1);
    });

    test("l'atelier ne peut ni confirmer ni lire les transactions de la plateforme (403)", async () => {
      const t = await prisma.transaction.findFirst({ where: { atelierId: A.id } });
      assert.equal((await apiA.post(`/api/plateforme/transactions/${t.id}/confirmer`, {})).status, 403);
      assert.equal((await apiA.get("/api/plateforme/transactions")).status, 403);
    });
  });

  describe("isolation entre ateliers", () => {
    test("B ne voit pas la transaction de A et ne peut pas l'annuler (404)", async () => {
      const t = await prisma.transaction.findFirst({ where: { atelierId: A.id } });
      const liste = await apiB.get("/api/abonnements/transactions");
      assert.ok(!JSON.stringify(liste.body).includes(t.numero));
      assert.equal((await apiB.post(`/api/abonnements/transactions/${t.id}/annuler`, {})).status, 404);
      assert.equal((await prisma.transaction.findUnique({ where: { id: t.id } })).statut, "EN_ATTENTE");
    });
  });

  describe("confirmation par le SUPERADMIN", () => {
    let tA;
    before(async () => {
      tA = await prisma.transaction.findFirst({ where: { atelierId: A.id } });
    });

    test("la confirmation active l'abonnement, émet la facture et trace la décision", async () => {
      const res = await superApi.post(`/api/plateforme/transactions/${tA.id}/confirmer`, {});
      assert.equal(res.status, 200);
      assert.equal(res.body.statut, "REUSSIE");
      assert.equal(res.body.dejaTraitee, false);
      assert.equal(res.body.confirmePar, superIdentifiant);
      assert.match(res.body.facture.numero, /^FAC-\d{4}-\d{4}$/);

      const e = await etat(apiA);
      assert.equal(e.statut, "ACTIF");
      assert.equal(e.acces.mode, "COMPLET");
      assert.equal(e.paiementEnAttente, null);
      assert.equal(e.abonnement.prix, "100000");

      const histo = await prisma.historiqueAbonnement.findMany({ where: { atelierId: A.id } });
      assert.ok(histo.some((h) => h.action === "SOUSCRIPTION"));
      assert.ok(histo.some((h) => h.action === "CONFIRMATION_PAIEMENT" && h.par === superIdentifiant));
      const journal = await prisma.journalSecurite.findMany({ where: { atelierId: A.id, evenement: "ABONNEMENT_PAIEMENT_CONFIRME" } });
      assert.equal(journal.length, 1);
    });

    test("confirmer une seconde fois ne refait rien : mêmes dates, une seule facture", async () => {
      const avant = await prisma.abonnement.findUnique({ where: { id: (await prisma.transaction.findUnique({ where: { id: tA.id } })).abonnementId } });
      const res = await superApi.post(`/api/plateforme/transactions/${tA.id}/confirmer`, {});
      assert.equal(res.status, 200);
      assert.equal(res.body.dejaTraitee, true);
      const apres = await prisma.abonnement.findUnique({ where: { id: avant.id } });
      assert.equal(apres.dateExpiration.getTime(), avant.dateExpiration.getTime());
      assert.equal(await prisma.factureAbonnement.count({ where: { atelierId: A.id } }), 1);
      assert.equal(await prisma.journalSecurite.count({ where: { atelierId: A.id, evenement: "ABONNEMENT_PAIEMENT_CONFIRME" } }), 1);
    });

    test("cinq confirmations simultanées : une seule activation, une seule facture", async () => {
      const dec = await declarer(apiB, { reference: "CONC-1" }); // B a déjà une espèces en attente : on la prend
      const tB = await prisma.transaction.findFirst({ where: { atelierId: B.id, statut: "EN_ATTENTE" } });
      assert.equal(dec.status, 409);
      const reponses = await Promise.all(Array.from({ length: 5 }, () => superApi.post(`/api/plateforme/transactions/${tB.id}/confirmer`, {})));
      assert.deepEqual(reponses.map((r) => r.status), [200, 200, 200, 200, 200]);
      assert.equal(reponses.filter((r) => r.body.dejaTraitee === false).length, 1);
      assert.equal(await prisma.factureAbonnement.count({ where: { transactionId: tB.id } }), 1);
      assert.equal(await prisma.historiqueAbonnement.count({ where: { atelierId: B.id, action: "CONFIRMATION_PAIEMENT" } }), 1);
    });

    test("un paiement de l'atelier inconnu de la plateforme : 404", async () => {
      assert.equal((await superApi.post("/api/plateforme/transactions/inexistantidentifiant1/confirmer", {})).status, 404);
    });
  });

  describe("renouvellement anticipé : aucun jour perdu", () => {
    test("un nouvel abonnement confirmé commence à l'échéance de celui en cours", async () => {
      const courant = await prisma.abonnement.findFirst({ where: { atelierId: A.id, statut: "CONFIRME" } });
      const dec = await declarer(apiA, { dureeMois: 1, reference: "AIR-RENOUV-1" });
      assert.equal(dec.status, 201);
      const res = await superApi.post(`/api/plateforme/transactions/${dec.body.id}/confirmer`, {});
      assert.equal(res.status, 200);
      const nouveau = await prisma.abonnement.findUnique({ where: { id: res.body.abonnement.id } });
      assert.equal(nouveau.dateDebut.getTime(), courant.dateExpiration.getTime());
      assert.ok(nouveau.dateExpiration > nouveau.dateDebut);
      // Les jours restants de l'abonnement en cours sont intacts.
      const e = await etat(apiA);
      assert.equal(e.statut, "ACTIF");
      assert.ok(e.abonnement.joursRestants > 80, `jours restants ${e.abonnement.joursRestants}`);
    });
  });

  describe("rejet, annulation, remboursement", () => {
    test("rejet : transaction ECHOUEE avec motif, abonnement annulé, aucun accès, rejeu sans effet", async () => {
      const dec = await declarer(apiB, { reference: "REJ-1" });
      assert.equal(dec.status, 201);
      assert.equal((await superApi.post(`/api/plateforme/transactions/${dec.body.id}/rejeter`, {})).status, 400, "motif obligatoire");
      const res = await superApi.post(`/api/plateforme/transactions/${dec.body.id}/rejeter`, { motif: "Référence introuvable" });
      assert.equal(res.status, 200);
      assert.equal(res.body.statut, "ECHOUEE");
      assert.equal(res.body.motifRejet, "Référence introuvable");
      assert.equal((await prisma.abonnement.findUnique({ where: { id: res.body.abonnement.id } })).statut, "ANNULE");
      const encore = await superApi.post(`/api/plateforme/transactions/${dec.body.id}/rejeter`, { motif: "Référence introuvable" });
      assert.equal(encore.body.dejaTraitee, true);
      assert.equal((await superApi.post(`/api/plateforme/transactions/${dec.body.id}/confirmer`, {})).status, 409, "un paiement rejeté ne peut plus être confirmé");
    });

    test("annulation par l'atelier de sa propre déclaration, puis nouvelle déclaration possible", async () => {
      const dec = await declarer(apiB, { reference: "ANN-1" });
      const res = await apiB.post(`/api/abonnements/transactions/${dec.body.id}/annuler`, {});
      assert.equal(res.status, 200);
      assert.equal(res.body.statut, "ANNULEE");
      assert.equal((await declarer(apiB, { reference: "ANN-2" })).status, 201);
    });

    test("l'atelier ne peut plus annuler un paiement déjà confirmé (409)", async () => {
      const t = await prisma.transaction.findFirst({ where: { atelierId: A.id, statut: "REUSSIE" } });
      assert.equal((await apiA.post(`/api/abonnements/transactions/${t.id}/annuler`, {})).status, 409);
    });

    test("remboursement : facture annulée, abonnement annulé, rejeu sans effet, jamais de suppression", async () => {
      const t = await prisma.transaction.findFirst({ where: { atelierId: B.id, statut: "REUSSIE" } });
      assert.equal((await superApi.post(`/api/plateforme/transactions/${t.id}/rembourser`, {})).status, 400, "motif obligatoire");
      const res = await superApi.post(`/api/plateforme/transactions/${t.id}/rembourser`, { motif: "Erreur de l'atelier" });
      assert.equal(res.status, 200);
      assert.equal(res.body.statut, "REMBOURSEE");
      assert.equal(res.body.rembourseePar, superIdentifiant);
      assert.ok(res.body.facture.annuleeLe);
      assert.equal(await prisma.factureAbonnement.count({ where: { transactionId: t.id } }), 1, "la facture est conservée");
      const rejeu = await superApi.post(`/api/plateforme/transactions/${t.id}/rembourser`, { motif: "Erreur de l'atelier" });
      assert.equal(rejeu.body.dejaTraitee, true);
      assert.equal(await prisma.historiqueAbonnement.count({ where: { atelierId: B.id, action: "REMBOURSEMENT" } }), 1);
    });

    test("rembourser un paiement non réussi : 409", async () => {
      const t = await prisma.transaction.findFirst({ where: { atelierId: B.id, statut: "EN_ATTENTE" } });
      assert.equal((await superApi.post(`/api/plateforme/transactions/${t.id}/rembourser`, { motif: "test motif" })).status, 409);
    });
  });

  describe("factures (PDF)", () => {
    test("l'atelier propriétaire télécharge sa facture ; un autre atelier reçoit 404 ; le SUPERADMIN y accède", async () => {
      const f = await prisma.factureAbonnement.findFirst({ where: { atelierId: A.id } });
      const brut = await fetch(`${baseUrl}/api/abonnements/factures/${f.id}/pdf`, {
        headers: { Cookie: (await cookieDe(apiA)) },
      });
      assert.equal(brut.status, 200);
      assert.equal(brut.headers.get("content-type"), "application/pdf");
      assert.equal(Buffer.from(await brut.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
      assert.equal((await apiB.get(`/api/abonnements/factures/${f.id}/pdf`)).status, 404);
      const sa = await fetch(`${baseUrl}/api/plateforme/factures/${f.id}/pdf`, { headers: { Cookie: await cookieDe(superApi) } });
      assert.equal(sa.status, 200);
    });
  });

  describe("suspension d'un abonnement", () => {
    test("suspendu : lecture seule immédiate ; réactivé : accès complet", async () => {
      // L'essai de l'atelier est terminé depuis longtemps : seul son abonnement lui donne encore accès.
      await prisma.atelier.update({ where: { id: A.id }, data: { trialEndsAt: new Date(Date.now() - 60 * JOUR) } });
      const courant = await prisma.abonnement.findFirst({ where: { atelierId: A.id, statut: "CONFIRME" }, orderBy: { dateDebut: "asc" } });
      assert.equal((await superApi.post(`/api/ateliers/${A.id}/abonnement/${courant.id}/suspendre`, {})).status, 400, "motif obligatoire");
      const s = await superApi.post(`/api/ateliers/${A.id}/abonnement/${courant.id}/suspendre`, { note: "Litige de paiement" });
      assert.equal(s.status, 200);
      assert.equal(s.body.statut, "SUSPENDU");
      const pendant = await etat(apiA);
      assert.equal(pendant.acces.mode, "LECTURE_SEULE");
      const r = await superApi.post(`/api/ateliers/${A.id}/abonnement/${courant.id}/reactiver`, { note: "Litige réglé" });
      assert.equal(r.body.statut, "CONFIRME");
      assert.equal((await etat(apiA)).acces.mode, "COMPLET");
      await prisma.atelier.update({ where: { id: A.id }, data: { trialEndsAt: null } });
    });
  });

  describe("liste de la plateforme et paramètres", () => {
    test("filtre par statut et par atelier ; la liste porte le nom de l'atelier", async () => {
      const res = await superApi.get(`/api/plateforme/transactions?statut=REUSSIE&atelierId=${A.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.data.length >= 2);
      assert.ok(res.body.data.every((t) => t.statut === "REUSSIE" && t.atelierId === A.id));
      assert.equal(res.body.data[0].atelierNom, "Atelier Souscription A");
    });

    test("instructions de paiement : saisies par la plateforme, visibles de l'atelier, effaçables", async () => {
      const texte = "Airtel Money 90 00 00 00 (AM Couture). Indiquez la référence reçue par SMS.";
      assert.equal((await superApi.put("/api/plateforme/parametres-abonnement", { instructionsPaiement: texte })).body.instructionsPaiement, texte);
      assert.equal((await etat(apiA)).instructionsPaiement, texte);
      assert.equal((await superApi.put("/api/plateforme/parametres-abonnement", { instructionsPaiement: "x".repeat(1001) })).status, 400);
      assert.equal((await superApi.put("/api/plateforme/parametres-abonnement", {})).status, 400, "au moins un champ");
      assert.equal((await apiA.put("/api/plateforme/parametres-abonnement", { instructionsPaiement: "piratage" })).status, 403);
      const efface = await superApi.put("/api/plateforme/parametres-abonnement", { instructionsPaiement: "" });
      assert.equal(efface.body.instructionsPaiement, null);
      assert.equal((await etat(apiA)).instructionsPaiement, null);
    });

    test("jours de grâce : bornés entre 0 et 90", async () => {
      assert.equal((await superApi.put("/api/plateforme/parametres-abonnement", { joursGrace: 91 })).status, 400);
      assert.equal((await superApi.put("/api/plateforme/parametres-abonnement", { joursGrace: -1 })).status, 400);
      // Valeur valide = valeur par défaut : la ligne est partagée avec lecture-seule.test.js (fichiers en parallèle).
      const ok = await superApi.put("/api/plateforme/parametres-abonnement", { joursGrace: 7 });
      assert.equal(ok.body.joursGrace, 7);
      assert.equal((await superApi.get("/api/plateforme/parametres-abonnement")).status, 200);
    });
  });
});

// Le client de test garde son cookie en interne : on le relit par une requête authentifiée de contrôle pour le PDF
// (fetch brut nécessaire, le client de test ne renvoie que du JSON).
async function cookieDe(api) {
  return api.cookie();
}
