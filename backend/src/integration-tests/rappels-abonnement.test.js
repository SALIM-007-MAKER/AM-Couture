// Rappels d'abonnement (tâche quotidienne) et courriels de décision sur les paiements, avec Resend simulé : aucun appel
// réseau réel. `fetch` est intercepté UNIQUEMENT pour api.resend.com ; la tâche examine tous les ateliers de la base
// de test (partagée avec d'autres fichiers) : les assertions ne regardent que les adresses créées ici.
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";
import { prendreVerrou } from "./verrou-cron.js";

const JOUR = 86_400_000;
const MDP = "Atelier-Test-2026!";
const SECRET = "secret-cron-rappels-abonnement";

describe("Rappels d'abonnement et courriels de paiement", () => {
  // La tâche quotidienne examine tous les ateliers de la base : si une autre suite la lance pendant que les ateliers de celle-ci
  // existent, elle envoie leurs rappels à sa place et celle-ci échoue. Un seul fichier à la fois (voir verrou-cron.js).
  // Pris en premier, libéré en dernier.
  let libererVerrou;
  before(async () => {
    libererVerrou = await prendreVerrou();
  });

  let server, baseUrl;
  const marque = `rappels${process.pid}${Date.now()}`;
  const ateliers = {}; // nom court → { atelier, email, admin }
  let superApi, superId, superEmail, plan;
  const envoyes = [];
  let statutResend = 200;
  const fetchOriginal = globalThis.fetch;
  const cleAvant = process.env.RESEND_API_KEY;
  const secretAvant = process.env.CRON_SECRET;
  const urlAvant = process.env.PUBLIC_APP_URL;

  const mailsPour = (email) => envoyes.filter((e) => e.body.to === email || e.body.to?.includes?.(email));
  const lancerCron = () => fetchOriginal(`${baseUrl}/api/cron/rappels-quotidiens`, { headers: { Authorization: `Bearer ${SECRET}` } });

  async function creer(cle, { trialJ, abonnements = [], email = true, actif = true }) {
    const { atelier, admin, identifiant, password } = await creerAtelierEtAdmin({ nom: `Atelier ${cle}` });
    const adresse = `${marque}-${cle}@example.test`;
    await prisma.user.update({ where: { id: admin.id }, data: { email: email ? adresse : null, prenom: "Awa" } });
    await prisma.atelier.update({
      where: { id: atelier.id },
      data: { actif, trialEndsAt: new Date(Date.now() + trialJ * JOUR) },
    });
    for (const [i, a] of abonnements.entries()) {
      await prisma.abonnement.create({
        data: {
          numero: `TEST-RAP-${cle}-${i}-${process.pid}-${Date.now()}`,
          atelierId: atelier.id,
          planNom: "Plan test",
          dureeMois: 1,
          prix: "1000",
          statut: a.statut ?? "CONFIRME",
          dateDebut: new Date(Date.now() + a.debutJ * JOUR),
          dateExpiration: new Date(Date.now() + a.finJ * JOUR),
        },
      });
    }
    ateliers[cle] = { atelier, admin, identifiant, password, email: adresse };
  }

  before(async () => {
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("https://api.resend.com")) {
        const body = JSON.parse(init.body);
        envoyes.push({ body });
        return new Response(JSON.stringify(statutResend === 200 ? { id: "email_test" } : { message: "panne simulée" }), {
          status: statutResend,
          headers: { "Content-Type": "application/json" },
        });
      }
      return fetchOriginal(url, init);
    };
    process.env.RESEND_API_KEY = "re_test_stub_key";
    process.env.CRON_SECRET = SECRET;
    delete process.env.PUBLIC_APP_URL;
    ({ server, baseUrl } = await demarrerServeur());

    await creer("essai2j", { trialJ: 2 });
    await creer("abo5j", { trialJ: -60, abonnements: [{ debutJ: -25, finJ: 5 }] });
    await creer("renouvele", { trialJ: -60, abonnements: [{ debutJ: -25, finJ: 5 }, { debutJ: 5, finJ: 35 }] });
    await creer("essaiFini2j", { trialJ: -2 });
    await creer("abandonne", { trialJ: -100 });
    await creer("paiementAttente", { trialJ: 2 });
    await creer("suspendu", { trialJ: 2, actif: false });
    await creer("sansEmail", { trialJ: 2, email: false });
    await creer("lointain", { trialJ: 10 });
    await creer("panne", { trialJ: 1 });

    await prisma.transaction.create({
      data: {
        numero: `TRX-TEST-RAP-${process.pid}`,
        abonnementId: (
          await prisma.abonnement.create({
            data: { numero: `TEST-RAP-ATT-${process.pid}-${Date.now()}`, atelierId: ateliers.paiementAttente.atelier.id, prix: "1000", statut: "EN_ATTENTE" },
          })
        ).id,
        atelierId: ateliers.paiementAttente.atelier.id,
        moyenPaiement: "ESPECES",
        montant: "1000",
        statut: "EN_ATTENTE",
        referenceInterne: `MAN-TEST-RAP-${process.pid}-${Date.now()}`,
      },
    });

    superEmail = `${marque}-super@example.test`;
    const identifiantSuper = `superadmin-rap-${process.pid}-${Date.now()}`;
    const sa = await prisma.user.create({
      data: { identifiant: identifiantSuper, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN", email: superEmail, prenom: "Root" },
    });
    superId = sa.id;
    superApi = client(baseUrl);
    assert.equal((await superApi.post("/api/auth/login", { identifiant: identifiantSuper, password: MDP })).status, 200);
    plan = await prisma.planAbonnement.create({ data: { nom: `Plan rappels ${process.pid}`, prixMensuel: "5000" } });
  });

  beforeEach(() => {
    envoyes.length = 0;
    statutResend = 200;
  });

  after(async () => {
    globalThis.fetch = fetchOriginal;
    for (const [cle, valeur] of [["RESEND_API_KEY", cleAvant], ["CRON_SECRET", secretAvant], ["PUBLIC_APP_URL", urlAvant]]) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
    await arreterServeur(server);
    for (const { atelier } of Object.values(ateliers)) {
      await prisma.rappelAbonnement.deleteMany({ where: { atelierId: atelier.id } });
      await prisma.factureAbonnement.deleteMany({ where: { atelierId: atelier.id } });
      await prisma.transaction.deleteMany({ where: { atelierId: atelier.id } });
      await prisma.historiqueAbonnement.deleteMany({ where: { atelierId: atelier.id } });
      await prisma.abonnement.deleteMany({ where: { atelierId: atelier.id } });
      await supprimerAtelier(atelier.id);
    }
    await prisma.planAbonnement.delete({ where: { id: plan.id } });
    await prisma.journalSecurite.deleteMany({ where: { userId: superId } });
    await prisma.user.delete({ where: { id: superId } });
    await prisma.$disconnect();
  });

  // Déclaré APRÈS le nettoyage ci-dessus : les hooks `after` s'exécutent dans l'ordre de déclaration.
  after(async () => {
    await libererVerrou?.();
  });

  describe("tâche quotidienne", () => {
    it("envoie le bon rappel aux bons ateliers, et à personne d'autre", async () => {
      const res = await lancerCron();
      assert.equal(res.status, 200);
      const sujet = (cle) => mailsPour(ateliers[cle].email).map((m) => m.body.subject);

      assert.match(sujet("essai2j").join("|"), /essai gratuit se termine dans 3 jours/);
      assert.match(sujet("abo5j").join("|"), /abonnement expire dans 7 jours/);
      assert.match(sujet("essaiFini2j").join("|"), /essai gratuit est terminé/);
      assert.match(sujet("panne").join("|"), /se termine demain/);

      const fin = mailsPour(ateliers.essaiFini2j.email)[0].body.html;
      assert.match(fin, /lecture seule/);
      assert.match(fin, /href="http:\/\/127\.0\.0\.1:[0-9]+\/abonnement"/);

      for (const cle of ["renouvele", "abandonne", "paiementAttente", "suspendu", "sansEmail", "lointain"]) {
        assert.deepEqual(sujet(cle), [], `aucun rappel pour « ${cle} »`);
      }
    });

    it("rejouer la tâche n'envoie plus rien : un rappel par échéance", async () => {
      await lancerCron();
      await lancerCron();
      for (const cle of ["essai2j", "abo5j", "essaiFini2j", "panne"]) {
        assert.equal(mailsPour(ateliers[cle].email).length, 0, `« ${cle} » a déjà reçu son rappel`);
        assert.equal(await prisma.rappelAbonnement.count({ where: { atelierId: ateliers[cle].atelier.id } }), 1);
      }
    });

    it("deux exécutions simultanées : un seul courriel par atelier", async () => {
      await prisma.rappelAbonnement.deleteMany({ where: { atelierId: ateliers.essai2j.atelier.id } });
      await Promise.all([lancerCron(), lancerCron(), lancerCron()]);
      assert.equal(mailsPour(ateliers.essai2j.email).length, 1);
    });

    it("panne du service de courriel : la réservation est libérée et le rappel part le lendemain", async () => {
      await prisma.rappelAbonnement.deleteMany({ where: { atelierId: ateliers.panne.atelier.id } });
      statutResend = 500;
      const res = await lancerCron();
      assert.equal(res.status, 200, "la tâche ne s'arrête pas sur une panne d'envoi");
      assert.equal(await prisma.rappelAbonnement.count({ where: { atelierId: ateliers.panne.atelier.id } }), 0);
      statutResend = 200;
      envoyes.length = 0;
      await lancerCron();
      assert.equal(mailsPour(ateliers.panne.email).length, 1);
      assert.equal(await prisma.rappelAbonnement.count({ where: { atelierId: ateliers.panne.atelier.id } }), 1);
    });

    it("sans secret valide, rien n'est envoyé (401)", async () => {
      const res = await fetchOriginal(`${baseUrl}/api/cron/rappels-quotidiens`, { headers: { Authorization: "Bearer faux" } });
      assert.equal(res.status, 401);
      assert.equal(envoyes.length, 0);
    });
  });

  describe("courriels de paiement", () => {
    let atelierPaiement, apiAtelier;
    before(async () => {
      await creer("paiement", { trialJ: -60 });
      atelierPaiement = ateliers.paiement;
      apiAtelier = client(baseUrl);
      assert.equal(
        (await apiAtelier.post("/api/auth/login", { identifiant: atelierPaiement.identifiant, password: atelierPaiement.password })).status,
        200,
      );
    });

    const declarer = (reference) =>
      apiAtelier.post("/api/abonnements/souscrire", { planId: plan.id, dureeMois: 1, moyenPaiement: "MOBILE_MONEY", reference });

    it("la déclaration prévient la plateforme ; confirmation, rejet et remboursement préviennent l'atelier", async () => {
      const d1 = await declarer("REF-MAIL-1");
      assert.equal(d1.status, 201);
      const versPlateforme = mailsPour(superEmail).filter((m) => m.body.subject.includes(d1.body.numero));
      assert.equal(versPlateforme.length, 1);
      assert.match(versPlateforme[0].body.subject, /à vérifier/);

      envoyes.length = 0;
      const conf = await superApi.post(`/api/plateforme/transactions/${d1.body.id}/confirmer`, {});
      assert.equal(conf.status, 200);
      const confirme = mailsPour(atelierPaiement.email);
      assert.equal(confirme.length, 1);
      assert.match(confirme[0].body.subject, /Paiement confirmé/);
      assert.ok(confirme[0].body.html.includes(conf.body.facture.numero), "le numéro de facture figure dans le courriel");

      // Confirmer à nouveau ne renvoie rien.
      envoyes.length = 0;
      await superApi.post(`/api/plateforme/transactions/${d1.body.id}/confirmer`, {});
      assert.equal(mailsPour(atelierPaiement.email).length, 0);

      // Remboursement.
      await superApi.post(`/api/plateforme/transactions/${d1.body.id}/rembourser`, { motif: "Double paiement" });
      const rembourse = mailsPour(atelierPaiement.email);
      assert.equal(rembourse.length, 1);
      assert.match(rembourse[0].body.html, /Double paiement/);

      // Rejet d'une seconde déclaration.
      const d2 = await declarer("REF-MAIL-2");
      envoyes.length = 0;
      await superApi.post(`/api/plateforme/transactions/${d2.body.id}/rejeter`, { motif: "Référence introuvable" });
      const rejete = mailsPour(atelierPaiement.email);
      assert.equal(rejete.length, 1);
      assert.match(rejete[0].body.subject, /non retrouvé/);
      assert.match(rejete[0].body.html, /Référence introuvable/);
    });

    it("une panne du service de courriel n'annule jamais la décision", async () => {
      const d = await declarer("REF-MAIL-3");
      assert.equal(d.status, 201);
      statutResend = 500;
      const conf = await superApi.post(`/api/plateforme/transactions/${d.body.id}/confirmer`, {});
      assert.equal(conf.status, 200);
      assert.equal(conf.body.statut, "REUSSIE");
      assert.equal((await prisma.transaction.findUnique({ where: { id: d.body.id } })).statut, "REUSSIE");
    });

    it("sans clé Resend configurée, la déclaration et la confirmation fonctionnent quand même", async () => {
      delete process.env.RESEND_API_KEY;
      try {
        const d = await declarer("REF-MAIL-4");
        assert.equal(d.status, 201);
        assert.equal((await superApi.post(`/api/plateforme/transactions/${d.body.id}/confirmer`, {})).status, 200);
      } finally {
        process.env.RESEND_API_KEY = "re_test_stub_key";
      }
    });
  });
});
