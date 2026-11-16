// Tableau de bord commercial du SUPERADMIN : revenus, renouvellements, synthèse. La base de test est partagée avec
// d'autres fichiers qui créent aussi des paiements : les revenus sont donc vérifiés atelier par atelier
// (paramètre atelierId) et les listes en retrouvant les ateliers créés ici.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";

const JOUR = 86_400_000;
const MDP = "Atelier-Test-2026!";
const marque = `${process.pid}-${Date.now()}`;

const utc = (decalageMois, jour, heure = 12) => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + decalageMois, jour, heure));
};
const cleMois = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

describe("Tableau de bord commercial (SUPERADMIN)", () => {
  let server, baseUrl, superApi, adminApi, superId;
  const ateliers = {};
  let compteur = 0;

  async function abonnement(atelierId, { debutJ, finJ, statut = "CONFIRME", planNom = "Plan test", dureeMois = 1, prix = "10000" }) {
    return prisma.abonnement.create({
      data: {
        numero: `TEST-COM-${marque}-${++compteur}`,
        atelierId,
        planNom,
        dureeMois,
        prix,
        statut,
        dateDebut: debutJ === undefined ? null : new Date(Date.now() + debutJ * JOUR),
        dateExpiration: finJ === undefined ? null : new Date(Date.now() + finJ * JOUR),
      },
    });
  }
  async function transaction(atelierId, abo, data) {
    return prisma.transaction.create({
      data: {
        numero: `TRX-TEST-COM-${marque}-${++compteur}`,
        abonnementId: abo.id,
        atelierId,
        moyenPaiement: "MOBILE_MONEY",
        montant: "10000",
        referenceInterne: `MAN-TEST-COM-${marque}-${compteur}`,
        ...data,
      },
    });
  }
  async function creer(cle, { trialJ, email = true, telephone }) {
    const { atelier, admin } = await creerAtelierEtAdmin({ nom: `Atelier Commerce ${cle}` });
    await prisma.atelier.update({
      where: { id: atelier.id },
      data: { trialEndsAt: new Date(Date.now() + trialJ * JOUR), telephone: telephone ?? null },
    });
    if (email) await prisma.user.update({ where: { id: admin.id }, data: { email: `${cle}-${marque}@example.test` } });
    ateliers[cle] = atelier;
    return atelier;
  }

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const identifiant = `superadmin-com-${marque}`;
    const sa = await prisma.user.create({
      data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN" },
    });
    superId = sa.id;
    superApi = client(baseUrl);
    assert.equal((await superApi.post("/api/auth/login", { identifiant, password: MDP })).status, 200);

    // Revenus : trois mois de mouvements sur un atelier dédié.
    await creer("revenus", { trialJ: -100 });
    const r = ateliers.revenus.id;
    const a1 = await abonnement(r, { debutJ: -70, finJ: -40, planNom: "Plan Or", dureeMois: 3, prix: "27000" });
    const a2 = await abonnement(r, { debutJ: -35, finJ: -5, planNom: "Plan Argent" });
    const a3 = await abonnement(r, { debutJ: -34, finJ: -4, planNom: "Plan Argent", statut: "ANNULE" });
    const a4 = await abonnement(r, { debutJ: -1, finJ: 29, planNom: "Plan Argent" });
    await transaction(r, a1, { statut: "REUSSIE", montant: "27000", confirmeLe: utc(-2, 10) });
    await transaction(r, a2, { statut: "REUSSIE", montant: "10000", confirmeLe: utc(-1, 10) });
    await transaction(r, a3, { statut: "REMBOURSEE", montant: "10000", confirmeLe: utc(-1, 11), rembourseLe: new Date() });
    await transaction(r, a4, { statut: "REUSSIE", montant: "5000", confirmeLe: new Date(), moyenPaiement: "WAVE" });
    // Hors périmètre : en attente et rejeté ne comptent pas.
    const a5 = await abonnement(r, { statut: "EN_ATTENTE" });
    await transaction(r, a5, { statut: "EN_ATTENTE", montant: "99999" });

    // Activation manuelle sans transaction, sur un autre atelier.
    await creer("manuel", { trialJ: -100 });
    await abonnement(ateliers.manuel.id, { debutJ: -1, finJ: 29, prix: "15000" });

    // Renouvellements.
    await creer("bientot", { trialJ: -100, telephone: "90001234" });
    await abonnement(ateliers.bientot.id, { debutJ: -25, finJ: 5, planNom: "Plan Or" });
    await creer("renouvele", { trialJ: -100 });
    await abonnement(ateliers.renouvele.id, { debutJ: -25, finJ: 5 });
    await abonnement(ateliers.renouvele.id, { debutJ: 5, finJ: 35 });
    await creer("essaiFin", { trialJ: 3 });
    await creer("expire", { trialJ: -100 });
    await abonnement(ateliers.expire.id, { debutJ: -40, finJ: -10 });
    await creer("attente", { trialJ: -100 });
    await abonnement(ateliers.attente.id, { debutJ: -25, finJ: 3 });
    const aAtt = await abonnement(ateliers.attente.id, { statut: "EN_ATTENTE" });
    await transaction(ateliers.attente.id, aAtt, { statut: "EN_ATTENTE" });
    // Anomalie Wave : abouti chez Wave mais refusé par la vérification.
    const aWave = await abonnement(ateliers.attente.id, { statut: "EN_ATTENTE" });
    await transaction(ateliers.attente.id, aWave, {
      statut: "EN_ATTENTE",
      moyenPaiement: "WAVE",
      donneesBrutesWebhook: { incoherence: "montant payé 100 différent du montant attendu 10000" },
    });

    // Un compte ADMIN pour vérifier les droits.
    const { atelier, identifiant: idAdmin, password } = await creerAtelierEtAdmin({ nom: "Atelier Commerce Admin" });
    ateliers.admin = atelier;
    adminApi = client(baseUrl);
    assert.equal((await adminApi.post("/api/auth/login", { identifiant: idAdmin, password })).status, 200);
  });

  after(async () => {
    await arreterServeur(server);
    for (const atelier of Object.values(ateliers)) {
      await prisma.factureAbonnement.deleteMany({ where: { atelierId: atelier.id } });
      await prisma.transaction.deleteMany({ where: { atelierId: atelier.id } });
      await prisma.historiqueAbonnement.deleteMany({ where: { atelierId: atelier.id } });
      await prisma.abonnement.deleteMany({ where: { atelierId: atelier.id } });
      await supprimerAtelier(atelier.id);
    }
    await prisma.user.delete({ where: { id: superId } });
    await prisma.$disconnect();
  });

  describe("accès", () => {
    it("réservé au SUPERADMIN : 401 sans session, 403 pour un PDG", async () => {
      for (const chemin of ["synthese", "revenus", "renouvellements"]) {
        assert.equal((await client(baseUrl).get(`/api/plateforme/commerce/${chemin}`)).status, 401, chemin);
        assert.equal((await adminApi.get(`/api/plateforme/commerce/${chemin}`)).status, 403, chemin);
      }
    });
    it("paramètres invalides : 400", async () => {
      assert.equal((await superApi.get("/api/plateforme/commerce/revenus?mois=0")).status, 400);
      assert.equal((await superApi.get("/api/plateforme/commerce/revenus?mois=99")).status, 400);
      assert.equal((await superApi.get("/api/plateforme/commerce/renouvellements?jours=0")).status, 400);
      assert.equal((await superApi.get("/api/plateforme/commerce/renouvellements?jours=abc")).status, 400);
    });
  });

  describe("revenus", () => {
    let res;
    before(async () => {
      res = await superApi.get(`/api/plateforme/commerce/revenus?mois=4&atelierId=${ateliers.revenus.id}`);
    });

    it("série mensuelle : encaissé à la date de confirmation, remboursé à la date de remboursement", async () => {
      assert.equal(res.status, 200);
      const serie = Object.fromEntries(res.body.serie.map((s) => [s.mois, s]));
      const m0 = cleMois(utc(0, 1));
      const m1 = cleMois(utc(-1, 1));
      const m2 = cleMois(utc(-2, 1));
      const m3 = cleMois(utc(-3, 1));
      assert.equal(res.body.serie.length, 4);
      assert.equal(serie[m3].encaisse, "0", "mois sans mouvement présent à zéro");
      assert.equal(serie[m2].encaisse, "27000");
      assert.equal(serie[m1].encaisse, "20000", "le paiement remboursé a bien été encaissé ce mois-là");
      assert.equal(serie[m1].rembourse, "0", "le remboursement est daté du mois où il a eu lieu");
      assert.equal(serie[m0].encaisse, "5000");
      assert.equal(serie[m0].rembourse, "10000");
      assert.equal(serie[m0].net, "-5000");
      assert.equal(serie[m1].nombrePaiements, 2);
    });

    it("totaux, hors transactions en attente", async () => {
      assert.deepEqual(res.body.totaux, { encaisse: "52000", rembourse: "10000", net: "42000" });
    });

    it("ventilation par formule et par moyen de paiement", async () => {
      const plan = Object.fromEntries(res.body.parPlan.map((p) => [p.cle, p]));
      assert.equal(plan["Plan Or"].encaisse, "27000");
      assert.equal(plan["Plan Argent"].encaisse, "25000");
      assert.equal(plan["Plan Argent"].rembourse, "10000");
      const moyen = Object.fromEntries(res.body.parMoyen.map((p) => [p.cle, p]));
      assert.equal(moyen.MOBILE_MONEY.encaisse, "47000");
      assert.equal(moyen.WAVE.encaisse, "5000");
    });

    it("les activations manuelles sans paiement enregistré sont signalées à part, jamais comptées en revenus", async () => {
      const manuel = await superApi.get(`/api/plateforme/commerce/revenus?mois=2&atelierId=${ateliers.manuel.id}`);
      assert.deepEqual(manuel.body.activationsSansPaiementEnregistre, { nombre: 1, valeur: "15000" });
      assert.equal(manuel.body.totaux.encaisse, "0");
      assert.equal(res.body.activationsSansPaiementEnregistre.nombre, 0, "l'atelier aux paiements enregistrés n'en a pas");
    });

    it("atelier inconnu : série à zéro, pas d'erreur", async () => {
      const vide = await superApi.get("/api/plateforme/commerce/revenus?mois=3&atelierId=inexistant");
      assert.equal(vide.status, 200);
      assert.deepEqual(vide.body.totaux, { encaisse: "0", rembourse: "0", net: "0" });
    });
  });

  describe("renouvellements", () => {
    let res;
    const trouver = (liste, cle) => liste.find((x) => x.atelierId === ateliers[cle].id);
    before(async () => {
      res = await superApi.get("/api/plateforme/commerce/renouvellements?jours=30");
    });

    it("à renouveler : échéance dans l'horizon, avec contact ; un renouvellement planifié repousse l'échéance", async () => {
      assert.equal(res.status, 200);
      const b = trouver(res.body.aRenouveler, "bientot");
      assert.equal(b.joursRestants, 5);
      assert.equal(b.telephone, "90001234");
      assert.equal(b.email, `bientot-${marque}@example.test`);
      assert.equal(b.planNom, "Plan Or");
      assert.equal(trouver(res.body.aRenouveler, "renouvele"), undefined);
    });

    it("signale les ateliers qui ont déjà déclaré un paiement", async () => {
      assert.equal(trouver(res.body.aRenouveler, "attente").paiementEnAttente, true);
      assert.equal(trouver(res.body.aRenouveler, "bientot").paiementEnAttente, false);
    });

    it("essais qui finissent, abonnements récemment expirés", async () => {
      assert.equal(trouver(res.body.essaisQuiFinissent, "essaiFin").joursRestants, 3);
      const e = trouver(res.body.recemmentExpires, "expire");
      assert.equal(e.joursDepuis, 10);
      assert.equal(e.acces, "LECTURE_SEULE");
    });

    it("un horizon plus large fait apparaître le renouvellement planifié", async () => {
      const large = await superApi.get("/api/plateforme/commerce/renouvellements?jours=45");
      assert.ok(trouver(large.body.aRenouveler, "renouvele"));
    });

    it("contient le taux de renouvellement", async () => {
      assert.equal(res.body.tauxRenouvellement.periodeJours, 90);
      assert.ok(res.body.tauxRenouvellement.echus >= 1);
    });
  });

  describe("tendances existantes (vue d'ensemble des ateliers)", () => {
    it("datent le revenu du jour de confirmation : un paiement confirmé maintenant compte dans le mois courant", async () => {
      const res = await superApi.get("/api/ateliers/tendances");
      assert.equal(res.status, 200);
      assert.equal(res.body.length, 6);
      assert.ok(res.body.at(-1).revenus >= 5000);
    });
  });

  describe("synthèse", () => {
    it("structure complète et cohérente", async () => {
      const res = await superApi.get("/api/plateforme/commerce/synthese");
      assert.equal(res.status, 200);
      const { ateliers: a, revenus, paiementsAVerifier, anomaliesWave, conversion, renouvellement } = res.body;
      assert.equal(Object.values(a.parEtat).reduce((x, y) => x + y, 0), a.actifs);
      assert.equal(Object.values(a.parAcces).reduce((x, y) => x + y, 0), a.actifs);
      assert.equal(a.total, a.actifs + a.suspendus);
      assert.equal(res.body.joursGrace >= 0, true);
      assert.match(revenus.moisCourant.mois, /^\d{4}-\d{2}$/);
      assert.ok(Number(revenus.revenuMensuelRecurrent) >= 0);
      assert.equal(Number(revenus.cumul.net), Number(revenus.cumul.encaisse) - Number(revenus.cumul.rembourse));
      assert.ok(paiementsAVerifier.nombre >= 2, "au moins les deux paiements en attente créés ici");
      assert.ok(paiementsAVerifier.plusAncienLe);
      assert.ok(conversion.periodeJours === 90 && renouvellement.periodeJours === 90);
    });

    it("signale l'anomalie Wave avec sa raison", async () => {
      const res = await superApi.get("/api/plateforme/commerce/synthese");
      const anomalie = res.body.anomaliesWave.find((x) => x.atelierId === ateliers.attente.id);
      assert.ok(anomalie);
      assert.match(anomalie.raison, /montant payé 100/);
    });

    it("le revenu mensuel récurrent inclut les abonnements actifs créés ici (10 000 par mois chacun, au moins)", async () => {
      const res = await superApi.get("/api/plateforme/commerce/synthese");
      // Actifs créés ici : revenus/a4, manuel, bientot, renouvele(1er), attente(1er) = 5 × 10 000 minimum (15 000 pour « manuel »).
      assert.ok(Number(res.body.revenus.revenuMensuelRecurrent) >= 55000);
    });
  });
});
