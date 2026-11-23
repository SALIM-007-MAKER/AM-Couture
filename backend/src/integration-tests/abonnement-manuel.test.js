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
      data: { identifiant: superIdentifiant, passwordHash: await bcrypt.hash("Atelier-Test-2026!", 4), role: "SUPERADMIN" },
    });
    superadminId = superadmin.id;

    adminApi = client(baseUrl);
    assert.equal((await adminApi.post("/api/auth/login", { identifiant, password })).status, 200);
    superApi = client(baseUrl);
    assert.equal((await superApi.post("/api/auth/login", { identifiant: superIdentifiant, password: "Atelier-Test-2026!" })).status, 200);

    const creation = await superApi.post("/api/plans-abonnement", {
      nom: `Professionnel ${process.pid}`,
      prixMensuel: 15000,
      prixAnnuel: 150000,
      limites: { clientes: null, employes: null, commandesActives: null, modeles: null },
      actif: true,
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

  test("aucune route de simulation ni de confirmation par l'ADMIN ; le webhook Wave est inerte tant que Wave n'est pas activé", async () => {
    assert.equal((await adminApi.post("/api/abonnements", { planId: plan.id })).status, 404);
    assert.equal((await adminApi.post("/api/transactions/abc/simuler-mock", { resultat: "REUSSIE" })).status, 404);
    assert.equal((await adminApi.post("/api/transactions/abc/confirmer-manuel", {})).status, 404);
    // Le webhook existe mais ne traite rien sans activation explicite (et il exige de toute façon une signature Wave).
    assert.equal((await adminApi.post("/api/webhooks/wave", {})).status, 503);
  });

  test("ADMIN voit les plans actifs uniquement", async () => {
    const res = await adminApi.get("/api/plans-abonnement");
    assert.equal(res.status, 200);
    assert.ok(res.body.some((p) => p.id === plan.id));
    assert.ok(!res.body.some((p) => p.id === planInactif.id));
  });

  test("ADMIN ne peut ni activer un abonnement ni gérer les plans (403)", async () => {
    const activer = await adminApi.post(`/api/ateliers/${atelier.id}/abonnement/activer`, {
      mode: "CATALOGUE",
      planId: plan.id,
      periodicite: "MENSUEL",
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
    assert.equal((await anonyme.post(`/api/ateliers/${atelier.id}/abonnement/activer`, { mode: "CATALOGUE", planId: plan.id, periodicite: "MENSUEL" })).status, 401);
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

  test("OFFRES : seulement mensuelle (1 mois) et annuelle (12 mois), prix du catalogue ; l'économie annuelle est informative", async () => {
    const vu = (await adminApi.get("/api/plans-abonnement")).body.find((p) => p.id === plan.id);
    assert.deepEqual(vu.offres.map((o) => [o.periodicite, o.dureeMois, o.prix, o.devise]), [
      ["MENSUEL", 1, 15000, "XOF"],
      ["ANNUEL", 12, 150000, "XOF"],
    ]);
    assert.equal(vu.economieAnnuelle, 30000, "15 000 × 12 − 150 000");
    assert.equal(vu.tarifs, undefined, "plus de durées 1/3/6/12 ni de remises");

    // Activation CATALOGUE annuelle : prix et durée du catalogue, figés ; pas un tarif exceptionnel.
    const annuelle = await superApi.post(`/api/ateliers/${autreAtelier.id}/abonnement/activer`, {
      mode: "CATALOGUE",
      planId: plan.id,
      periodicite: "ANNUEL",
    });
    assert.equal(annuelle.status, 201);
    assert.equal(Number(annuelle.body.prix), 150000);
    assert.equal(annuelle.body.dureeMois, 12);
    assert.equal(annuelle.body.tarifExceptionnel, false);

    // Un PDG ne peut pas modifier les tarifs ; une durée libre hors catalogue n'existe plus en mode CATALOGUE.
    assert.equal((await adminApi.patch(`/api/plans-abonnement/${plan.id}`, { prixAnnuel: 1 })).status, 403);
    const horsCatalogue = await superApi.post(`/api/ateliers/${autreAtelier.id}/abonnement/activer`, { mode: "CATALOGUE", planId: plan.id, dureeMois: 2 });
    assert.equal(horsCatalogue.status, 400);
    await prisma.historiqueAbonnement.deleteMany({ where: { atelierId: autreAtelier.id } });
    await prisma.abonnement.deleteMany({ where: { atelierId: autreAtelier.id } });
  });

  test("ACTIVATION EXCEPTIONNELLE : durée et montant saisis, motif obligatoire, figés et marqués ; aucun prix déduit", async () => {
    const url = `/api/ateliers/${autreAtelier.id}/abonnement/activer`;
    const base = { mode: "EXCEPTIONNEL", planId: plan.id, dureeMois: 2, prix: 20000, note: "Geste commercial convenu" };
    // Refus : pas de motif, pas de prix, prix nul / négatif / décimal, ni durée ni date.
    assert.equal((await superApi.post(url, { ...base, note: undefined })).status, 400);
    assert.equal((await superApi.post(url, { ...base, note: "ab" })).status, 400);
    assert.equal((await superApi.post(url, { ...base, prix: undefined })).status, 400);
    for (const prix of [0, -5, 2500.5, "abc"]) assert.equal((await superApi.post(url, { ...base, prix })).status, 400, String(prix));
    assert.equal((await superApi.post(url, { ...base, dureeMois: undefined })).status, 400);
    assert.equal((await adminApi.post(url, base)).status, 403);

    const res = await superApi.post(url, base);
    assert.equal(res.status, 201);
    assert.equal(Number(res.body.prix), 20000, "le montant saisi, pas mensuel × durée");
    assert.equal(res.body.dureeMois, 2);
    assert.equal(res.body.tarifExceptionnel, true);
    const detail = await superApi.get(url.replace("/activer", ""));
    assert.ok(detail.body.historique.some((h) => h.action === "ACTIVATION" && h.note === "Geste commercial convenu"));

    // Modifier le catalogue ensuite ne change rien au contrat figé.
    await superApi.patch(`/api/plans-abonnement/${plan.id}`, { prixMensuel: 99999 });
    const apres = (await superApi.get(url.replace("/activer", ""))).body.abonnements.find((a) => a.id === res.body.id);
    assert.equal(Number(apres.prix), 20000);
    await superApi.patch(`/api/plans-abonnement/${plan.id}`, { prixMensuel: 15000 });
    await prisma.historiqueAbonnement.deleteMany({ where: { atelierId: autreAtelier.id } });
    await prisma.abonnement.deleteMany({ where: { atelierId: autreAtelier.id } });
  });

  test("CONTACT WHATSAPP : réglé par le SUPERADMIN seulement, normalisé, visible du PDG dans /etat", async () => {
    assert.equal((await etat()).contact.whatsapp, null);
    assert.equal((await adminApi.put("/api/plateforme/contact", { whatsapp: "221771234567" })).status, 403);
    assert.equal((await adminApi.get("/api/plateforme/contact")).status, 403);

    assert.equal((await superApi.put("/api/plateforme/contact", { whatsapp: "abc" })).status, 400);
    const ok = await superApi.put("/api/plateforme/contact", { whatsapp: "+221 77 123 45 67" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.whatsapp, "221771234567");
    assert.equal((await etat()).contact.whatsapp, "221771234567");

    assert.equal((await superApi.put("/api/plateforme/contact", { whatsapp: "" })).body.whatsapp, null);
    assert.equal((await etat()).contact.whatsapp, null);
  });

  test("état : essai en cours -> ESSAI avec jours restants", async () => {
    await prisma.atelier.update({ where: { id: atelier.id }, data: { trialEndsAt: new Date(Date.now() + 12 * JOUR - 1000) } });
    const e = await etat();
    assert.equal(e.statut, "ESSAI");
    assert.equal(e.essai.joursRestants, 12);
    assert.equal(e.abonnement, null);
  });

  test("validation : mode requis ; plan inactif -> 404 ; période sans tarif -> 400 ; dates incohérentes -> 400", async () => {
    const url = `/api/ateliers/${atelier.id}/abonnement/activer`;
    assert.equal((await superApi.post(url, { planId: plan.id })).status, 400);
    assert.equal((await superApi.post(url, { planId: plan.id, dureeMois: 1 })).status, 400, "sans mode : refusé");
    assert.equal((await superApi.post(url, { mode: "CATALOGUE", planId: planInactif.id, periodicite: "MENSUEL" })).status, 404);
    const sansAnnuel = await prisma.planAbonnement.create({ data: { nom: `Mensuel seul ${process.pid}`, prixMensuel: 1000, actif: true } });
    const refus = await superApi.post(url, { mode: "CATALOGUE", planId: sansAnnuel.id, periodicite: "ANNUEL" });
    assert.equal(refus.status, 400, "pas de prix annuel : pas d'offre annuelle");
    await prisma.planAbonnement.delete({ where: { id: sansAnnuel.id } });
    const incoherent = await superApi.post(url, {
      mode: "EXCEPTIONNEL",
      planId: plan.id,
      prix: 5000,
      note: "Test dates",
      dateDebut: "2030-05-01",
      dateExpiration: "2030-04-01",
    });
    assert.equal(incoherent.status, 400);
  });

  test("activation planifiée (début futur) -> EN_ATTENTE côté PDG", async () => {
    const debut = new Date(Date.now() + 10 * JOUR).toISOString();
    const res = await superApi.post(`/api/ateliers/${atelier.id}/abonnement/activer`, {
      mode: "CATALOGUE",
      planId: plan.id,
      periodicite: "MENSUEL",
      dateDebut: debut,
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
      mode: "EXCEPTIONNEL",
      planId: plan.id,
      dureeMois: 2,
      prix: 30000,
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
    await superApi.patch(`/api/plans-abonnement/${plan.id}`, { prixMensuel: 99999 });
    const detail = await superApi.get(`/api/ateliers/${atelier.id}/abonnement`);
    const actif = detail.body.abonnements.find((a) => a.statutEffectif === "ACTIF");
    assert.equal(Number(actif.prix), 30000);
  });

  // Essai expiré en 2020, bien au-delà de la période de grâce : la lecture reste possible, l'écriture est refusée (402).
  async function verifierLectureSeule() {
    assert.equal((await adminApi.get("/api/clientes")).status, 200);
    const ecriture = await adminApi.post("/api/clientes", { nom: "Lecture", prenom: "Seule", telephone: "90001111" });
    assert.equal(ecriture.status, 402);
    assert.equal(ecriture.body.details.lectureSeule, true);
  }

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
    // Juste après l'échéance : période de grâce, tout fonctionne encore (avec avertissement côté interface).
    assert.equal((await etat()).acces.mode, "GRACE");
    assert.equal((await adminApi.post("/api/clientes", { nom: "Grace", prenom: "Encore", telephone: "90003333" })).status, 201);
    // Échéance reculée de 30 jours (au-delà de la grâce) : lecture seule.
    await prisma.abonnement.update({
      where: { id: actif.id },
      data: { dateDebut: new Date(Date.now() - 60 * JOUR), dateExpiration: new Date(Date.now() - 30 * JOUR) },
    });
    await verifierLectureSeule();
    assert.equal((await superApi.post(`/api/ateliers/${atelier.id}/abonnement/${actif.id}/expirer`, {})).status, 409);

    const reactive = await superApi.post(`/api/ateliers/${atelier.id}/abonnement/activer`, { mode: "CATALOGUE", planId: plan.id, periodicite: "MENSUEL" });
    assert.equal((await adminApi.get("/api/clientes")).status, 200);
    const desactivation = await superApi.post(`/api/ateliers/${atelier.id}/abonnement/${reactive.body.id}/desactiver`, {});
    assert.equal(desactivation.status, 200);
    await verifierLectureSeule();
    assert.notEqual((await etat()).statut, "ACTIF");

    const histo = (await superApi.get(`/api/ateliers/${atelier.id}/abonnement`)).body.historique.map((h) => h.action);
    for (const action of ["ACTIVATION", "MODIFICATION", "EXPIRATION", "DESACTIVATION"]) {
      assert.ok(histo.includes(action), `historique sans ${action}`);
    }
  });

  test("RÉGRESSION : un abonnement d'un autre atelier n'est ni modifiable ni désactivable via ce chemin (404)", async () => {
    const chezAutre = await superApi.post(`/api/ateliers/${autreAtelier.id}/abonnement/activer`, {
      mode: "CATALOGUE",
      planId: plan.id,
      periodicite: "MENSUEL",
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
