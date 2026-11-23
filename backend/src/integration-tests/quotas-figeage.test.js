// Quotas figés dans les abonnements : copie à la déclaration, calcul à l'activation (plancher d'usage d'un atelier ancien),
// report aux renouvellements, correction d'un abonnement activé. Base Postgres jetable dédiée (voir preload.js).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, supprimerAtelier } from "./helpers.js";

const marque = `${process.pid}-${Date.now()}`;
const MDP = "Atelier-Test-2026!";
const JOUR = 86_400_000;
let tel = 0;
const telephone = () => `9${String(marque).replace(/\D/g, "").slice(-5)}${String(++tel).padStart(2, "0")}`.slice(0, 8);

describe("Quotas : figeage dans les abonnements", () => {
  let server, baseUrl, superApi, superId;
  let mini, pro, premium;
  const ateliers = [];
  const plansExtra = [];

  const nouvelAtelier = async (nom, { avecEssai = false, clientes = 0 } = {}) => {
    const r = await creerAtelierEtAdmin({ nom: `${nom} ${marque}` });
    ateliers.push(r.atelier.id);
    if (avecEssai) await prisma.atelier.update({ where: { id: r.atelier.id }, data: { trialEndsAt: new Date(Date.now() - 20 * JOUR) } });
    for (let i = 0; i < clientes; i++) await creerCliente(r.atelier.id, { telephone: telephone() });
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant: r.identifiant, password: r.password })).status, 200);
    return { ...r, api };
  };

  const abonnements = (atelierId) => prisma.abonnement.findMany({ where: { atelierId }, orderBy: { createdAt: "asc" } });

  /** Déclare un paiement puis le fait confirmer par le SUPERADMIN ; renvoie l'abonnement en base. */
  const souscrireEtConfirmer = async (atelier, plan) => {
    const decl = await atelier.api.post("/api/abonnements/souscrire", { planId: plan.id, dureeMois: 1, moyenPaiement: "MOBILE_MONEY", reference: `REF-${marque}-${++tel}` });
    assert.equal(decl.status, 201, JSON.stringify(decl.body));
    const avant = await prisma.abonnement.findFirst({ where: { atelierId: atelier.atelier.id, statut: "EN_ATTENTE" } });
    const conf = await superApi.post(`/api/plateforme/transactions/${decl.body.id}/confirmer`, {});
    assert.equal(conf.status, 200, JSON.stringify(conf.body));
    return { avant, apres: await prisma.abonnement.findUnique({ where: { id: avant.id } }) };
  };

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const identifiant = `super-quotas-figeage-${marque}`;
    superId = (await prisma.user.create({ data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN" } })).id;
    superApi = client(baseUrl);
    assert.equal((await superApi.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    // Formules créées directement en base, ACTIVES, avec des quotas éventuellement partiels : ce sont des cas de moteur (clé absente = illimité pour
    // un abonnement), indépendants de la règle d'activation commerciale du catalogue (quotas définis) testée dans quotas-plans.
    const creerPlan = (nom, limites) => prisma.planAbonnement.create({ data: { nom: `${nom} ${marque}`, prixMensuel: 5000, limites, actif: true } });
    mini = await creerPlan("Mini", { clientes: 2, employes: 1, commandesActives: 1, modeles: 1 });
    pro = await creerPlan("Pro", { clientes: 500, employes: 5, commandesActives: 250, modeles: 250 });
    premium = await creerPlan("Premium", {});
  });

  after(async () => {
    await arreterServeur(server);
    for (const id of ateliers) {
      await prisma.factureAbonnement.deleteMany({ where: { atelierId: id } });
      await prisma.transaction.deleteMany({ where: { atelierId: id } });
      await prisma.historiqueAbonnement.deleteMany({ where: { atelierId: id } });
      await prisma.abonnement.deleteMany({ where: { atelierId: id } });
      await prisma.journalSecurite.deleteMany({ where: { atelierId: id } });
      await supprimerAtelier(id);
    }
    await prisma.planAbonnement.deleteMany({ where: { id: { in: [mini.id, pro.id, premium.id, ...plansExtra] } } });
    await prisma.user.delete({ where: { id: superId } });
    await prisma.$disconnect();
  });

  it("un abonnement créé sans quota (valeur par défaut, comme tous les abonnements existants) est illimité : limites {} et plancher {}", async () => {
    const a = await nouvelAtelier("Existant");
    const plan = await prisma.planAbonnement.create({ data: { nom: `Legacy ${marque}`, prixMensuel: "1000" } });
    const abo = await prisma.abonnement.create({ data: { atelierId: a.atelier.id, planId: plan.id, planNom: plan.nom, prix: "1000", statut: "CONFIRME", dateDebut: new Date(), dateExpiration: new Date(Date.now() + 30 * JOUR), numero: `ABN-LEG-${marque}` } });
    assert.deepEqual(abo.limites, {});
    assert.deepEqual(abo.plancher, {});
    const utilisation = await prisma.abonnement.findUnique({ where: { id: abo.id } });
    assert.deepEqual(utilisation.limites, {}, "aucun quota attribué automatiquement");
    await prisma.abonnement.delete({ where: { id: abo.id } });
    await prisma.planAbonnement.delete({ where: { id: plan.id } });
  });

  it("déclaration : les limites de la formule sont copiées (figées) ; activation d'un atelier ancien à 3 clientes : plancher d'usage", async () => {
    const a = await nouvelAtelier("Ancien", { clientes: 3 });
    const { avant, apres } = await souscrireEtConfirmer(a, mini);
    assert.deepEqual(avant.limites, { clientes: 2, employes: 1, commandesActives: 1, modeles: 1 }, "copie brute de la formule à la déclaration");
    assert.deepEqual(avant.plancher, {});
    assert.equal(apres.statut, "CONFIRME");
    assert.deepEqual(apres.plancher, { clientes: 3 }, "usage réel à l'activation (les ressources à zéro ne sont pas un plancher)");
    assert.deepEqual(apres.limites, { clientes: 3, employes: 1, commandesActives: 1, modeles: 1 }, "limite effective = max(formule, plancher)");
  });

  it("renouvellement : plancher reporté tel quel, jamais remesuré (même après archivage de fiches) ; changement de formule ensuite sans perdre le plancher", async () => {
    const a = await nouvelAtelier("Renouvelle", { clientes: 3 });
    const premier = await souscrireEtConfirmer(a, mini);
    assert.equal(premier.apres.limites.clientes, 3);
    // l'atelier archive des fiches : son usage baisse, le plancher ne bouge pas
    await prisma.cliente.updateMany({ where: { atelierId: a.atelier.id }, data: { archivedAt: new Date() } });
    const renouv = await souscrireEtConfirmer(a, mini);
    assert.deepEqual(renouv.apres.plancher, { clientes: 3 });
    assert.equal(renouv.apres.limites.clientes, 3);
    // renouvellement vers Professionnel : limite de la formule ; plancher conservé, inactif
    const montee = await souscrireEtConfirmer(a, pro);
    assert.equal(montee.apres.limites.clientes, 500);
    assert.deepEqual(montee.apres.plancher, { clientes: 3 });
    // retour à une formule plus petite : le plancher redevient la limite effective
    const retour = await souscrireEtConfirmer(a, mini);
    assert.equal(retour.apres.limites.clientes, 3);
  });

  it("première formule illimitée (Premium) : plancher enregistré pour la suite, limites {}", async () => {
    const a = await nouvelAtelier("PremiumFirst", { clientes: 5 });
    const p = await souscrireEtConfirmer(a, premium);
    assert.deepEqual(p.apres.limites, {});
    assert.deepEqual(p.apres.plancher, { clientes: 5 });
    const retour = await souscrireEtConfirmer(a, mini);
    assert.equal(retour.apres.limites.clientes, 5);
  });

  it("atelier passé par l'essai : aucun plancher, limites strictes de la formule (même au-dessus de l'usage)", async () => {
    const a = await nouvelAtelier("Essai", { avecEssai: true, clientes: 10 });
    const r = await souscrireEtConfirmer(a, mini);
    assert.deepEqual(r.apres.plancher, {});
    assert.deepEqual(r.apres.limites, { clientes: 2, employes: 1, commandesActives: 1, modeles: 1 });
    // rien n'a été supprimé ni archivé pour autant
    assert.equal(await prisma.cliente.count({ where: { atelierId: a.atelier.id, archivedAt: null } }), 10);
  });

  it("atelier ancien qui a déjà eu un abonnement activé (même échu) : plus de nouveau plancher, celui reporté seulement", async () => {
    const a = await nouvelAtelier("DejaAbonne", { clientes: 4 });
    const plan = await prisma.planAbonnement.create({ data: { nom: `Ancien2 ${marque}`, prixMensuel: "1000" } });
    await prisma.abonnement.create({ data: { atelierId: a.atelier.id, planId: plan.id, planNom: plan.nom, prix: "1000", statut: "CONFIRME", dateDebut: new Date(Date.now() - 90 * JOUR), dateExpiration: new Date(Date.now() - 60 * JOUR), numero: `ABN-OLD-${marque}` } });
    const r = await souscrireEtConfirmer(a, mini);
    assert.deepEqual(r.apres.plancher, {}, "pas de première souscription : ni mesure ni plancher");
    assert.equal(r.apres.limites.clientes, 2, "quotas stricts de la formule");
    plansExtra.push(plan.id); // supprimée dans after() : des transactions référencent maintenant l'abonnement de cet atelier
  });

  it("modifier la formule dans le catalogue ne touche ni les abonnements activés, ni une déclaration déjà faite", async () => {
    const a = await nouvelAtelier("Catalogue", { clientes: 1 });
    const decl = await a.api.post("/api/abonnements/souscrire", { planId: mini.id, dureeMois: 1, moyenPaiement: "MOBILE_MONEY", reference: `REF-CAT-${marque}` });
    const enAttente = await prisma.abonnement.findFirst({ where: { atelierId: a.atelier.id } });
    assert.equal((await superApi.patch(`/api/plans-abonnement/${mini.id}`, { limites: { clientes: 9, employes: 9, commandesActives: 9, modeles: 9 } })).status, 200);
    try {
      const apresCatalogue = await prisma.abonnement.findUnique({ where: { id: enAttente.id } });
      assert.equal(apresCatalogue.limites.clientes, 2, "la déclaration garde les limites figées à la souscription");
      assert.equal((await superApi.post(`/api/plateforme/transactions/${decl.body.id}/confirmer`, {})).status, 200);
      const activee = await prisma.abonnement.findUnique({ where: { id: enAttente.id } });
      assert.equal(activee.limites.clientes, 2, "l'activation part des limites figées, pas du catalogue du moment");
    } finally {
      await superApi.patch(`/api/plans-abonnement/${mini.id}`, { limites: { clientes: 2, employes: 1, commandesActives: 1, modeles: 1 } });
    }
  });

  it("activation MANUELLE (SUPERADMIN) : mêmes règles (plancher d'usage d'un atelier ancien)", async () => {
    const a = await nouvelAtelier("Manuel", { clientes: 6 });
    const res = await superApi.post(`/api/ateliers/${a.atelier.id}/abonnement/activer`, { mode: "CATALOGUE", planId: mini.id, periodicite: "MENSUEL" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual(res.body.plancher, { clientes: 6 });
    assert.equal(res.body.limites.clientes, 6);
    assert.equal(res.body.limites.employes, 1);
  });

  it("CORRECTION d'un abonnement activé : limites recalculées, plancher conservé intégralement, prix inchangé", async () => {
    const a = await nouvelAtelier("Correction", { clientes: 140 });
    const plan140 = await prisma.planAbonnement.create({ data: { nom: `Starter140 ${marque}`, prixMensuel: 5000, limites: { clientes: 100 }, actif: true } });
    const base = await superApi.post(`/api/ateliers/${a.atelier.id}/abonnement/activer`, { mode: "CATALOGUE", planId: plan140.id, periodicite: "MENSUEL" });
    assert.equal(base.body.limites.clientes, 140, "Starter 100 avec 140 clientes : limite effective 140");
    const prix = base.body.prix;
    const abonnementId = base.body.id;

    const versPro = await superApi.patch(`/api/ateliers/${a.atelier.id}/abonnement/${abonnementId}`, { planId: pro.id });
    assert.equal(versPro.status, 200, JSON.stringify(versPro.body));
    assert.equal(versPro.body.limites.clientes, 500);
    assert.deepEqual(versPro.body.plancher, { clientes: 140 }, "plancher conservé même inférieur à la formule");
    assert.equal(versPro.body.prix, prix, "le prix ne change pas à la correction");

    const retour = await superApi.patch(`/api/ateliers/${a.atelier.id}/abonnement/${abonnementId}`, { planId: plan140.id });
    assert.equal(retour.body.limites.clientes, 140);
    // une correction de dates seule ne touche pas aux quotas
    const dates = await superApi.patch(`/api/ateliers/${a.atelier.id}/abonnement/${abonnementId}`, { dateExpiration: new Date(Date.now() + 60 * JOUR).toISOString().slice(0, 10) });
    assert.equal(dates.status, 200);
    assert.equal(dates.body.limites.clientes, 140);
    plansExtra.push(plan140.id);
  });

  it("confirmation rejouée : rien n'est recalculé", async () => {
    const a = await nouvelAtelier("Rejeu", { clientes: 3 });
    const decl = await a.api.post("/api/abonnements/souscrire", { planId: mini.id, dureeMois: 1, moyenPaiement: "MOBILE_MONEY", reference: `REF-REJ-${marque}` });
    await superApi.post(`/api/plateforme/transactions/${decl.body.id}/confirmer`, {});
    const avant = (await abonnements(a.atelier.id))[0];
    await creerCliente(a.atelier.id, { telephone: telephone() }); // l'usage change entre-temps
    const rejeu = await superApi.post(`/api/plateforme/transactions/${decl.body.id}/confirmer`, {});
    assert.equal(rejeu.status, 200);
    const apres = (await abonnements(a.atelier.id))[0];
    assert.deepEqual(apres.limites, avant.limites);
    assert.deepEqual(apres.plancher, avant.plancher);
  });
});
