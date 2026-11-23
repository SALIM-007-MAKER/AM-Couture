// Ateliers existants (abonnement antérieur aux quotas, limites {}) : illimités tant qu'aucune formule limitée n'est ACTIVE ;
// à la première souscription limitée, la règle d'éligibilité au plancher s'applique à la lettre (jamais eu d'abonnement activé) ;
// un dépassement n'empêche que la CRÉATION de la ressource concernée. Base Postgres jetable dédiée (voir preload.js).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, supprimerAtelier } from "./helpers.js";

const marque = `${process.pid}-${Date.now()}`;
const MDP = "Atelier-Test-2026!";
const JOUR = 86_400_000;
let n = 0;
const telephone = () => `6${marque.replace(/\D/g, "").slice(-3)}${String(++n).padStart(4, "0")}`;

describe("Quotas : ateliers existants et première souscription limitée", () => {
  let server, baseUrl, superApi, superId, mini, planLegacy;
  const ateliers = [];

  async function atelierExistant(nom, { abonnementLegacy, clientes = 0 } = {}) {
    const r = await creerAtelierEtAdmin({ nom: `${nom} ${marque}` }); // trialEndsAt nul : atelier ancien
    ateliers.push(r.atelier.id);
    for (let i = 0; i < clientes; i++) await creerCliente(r.atelier.id, { telephone: telephone() });
    if (abonnementLegacy) {
      await prisma.abonnement.create({
        data: {
          numero: `ABN-X-${marque}-${++n}`, atelierId: r.atelier.id, planId: planLegacy.id, planNom: planLegacy.nom, prix: "10000", statut: "CONFIRME",
          dateDebut: new Date(Date.now() + abonnementLegacy.debut * JOUR), dateExpiration: new Date(Date.now() + abonnementLegacy.fin * JOUR),
        }, // limites et plancher : valeurs par défaut de la migration ({}), comme tout abonnement existant
      });
    }
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant: r.identifiant, password: r.password })).status, 200);
    return { ...r, api, id: r.atelier.id };
  }

  const souscrire = async (a, plan) => {
    const decl = await a.api.post("/api/abonnements/souscrire", { planId: plan.id, dureeMois: 1, moyenPaiement: "MOBILE_MONEY", reference: `REF-X-${marque}-${++n}` });
    assert.equal(decl.status, 201, JSON.stringify(decl.body));
    const conf = await superApi.post(`/api/plateforme/transactions/${decl.body.id}/confirmer`, {});
    assert.equal(conf.status, 200, JSON.stringify(conf.body));
    return prisma.abonnement.findFirst({ where: { atelierId: a.id, statut: "CONFIRME" }, orderBy: { dateDebut: "desc" } });
  };
  const creerCli = (a) => a.api.post("/api/clientes", { prenom: "T", nom: `X${++n}`, telephone: telephone() });
  const creerEmp = (a) => a.api.post("/api/employes", { identifiant: `emp-x-${marque}-${++n}`, password: MDP, prenom: "E", nom: "X", poste: "AUTRE" });

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const identifiant = `super-quotas-exist-${marque}`;
    superId = (await prisma.user.create({ data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN" } })).id;
    superApi = client(baseUrl);
    assert.equal((await superApi.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    planLegacy = await prisma.planAbonnement.create({ data: { nom: `Legacy ${marque}`, prixMensuel: "10000" } });
    mini = await prisma.planAbonnement.create({ data: { nom: `Mini ${marque}`, prixMensuel: "5000", limites: { clientes: 2, employes: 1, commandesActives: 2, modeles: 2 } } });
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
    await prisma.planAbonnement.deleteMany({ where: { id: { in: [planLegacy.id, mini.id] } } });
    await prisma.user.delete({ where: { id: superId } });
    await prisma.$disconnect();
  });

  it("abonnement existant (limites {}) actif : illimité ; une souscription limitée en attente de démarrage n'y change rien", async () => {
    const a = await atelierExistant("Existant", { abonnementLegacy: { debut: -5, fin: 25 }, clientes: 4 });
    for (let i = 0; i < 3; i++) assert.equal((await creerCli(a)).status, 201, "illimité : 7 clientes sans refus");
    const nouveau = await souscrire(a, mini);
    assert.ok(new Date(nouveau.dateDebut) > new Date(Date.now() + 20 * JOUR), "la formule limitée démarre à l'échéance de l'abonnement en cours");
    assert.deepEqual(nouveau.plancher, {}, "atelier déjà abonné : non éligible au plancher (règle D à la lettre)");
    assert.deepEqual(nouveau.limites, { clientes: 2, employes: 1, commandesActives: 2, modeles: 2 }, "limites strictes de la formule, figées");
    assert.equal((await creerCli(a)).status, 201, "tant que la formule limitée n'est pas active, aucun quota");
    const util = (await a.api.get("/api/abonnements/utilisation")).body;
    assert.equal(util.quotasAppliques, false);
    assert.equal(util.raison, "ILLIMITE", "abonnement sans limite : annoncé comme tel");
  });

  it("quand la formule limitée devient active : seules les NOUVELLES créations de la ressource dépassée sont refusées ; rien n'est supprimé ni désactivé", async () => {
    const a = await atelierExistant("BasculeStricte", { abonnementLegacy: { debut: -5, fin: 25 }, clientes: 5 });
    const nouveau = await souscrire(a, mini);
    // le temps passe : l'ancien abonnement est échu, la formule limitée démarre
    await prisma.abonnement.updateMany({ where: { atelierId: a.id, id: { not: nouveau.id } }, data: { dateExpiration: new Date(Date.now() - 1000) } });
    await prisma.abonnement.update({ where: { id: nouveau.id }, data: { dateDebut: new Date(Date.now() - 1000), dateExpiration: new Date(Date.now() + 29 * JOUR) } });

    const util = await a.api.get("/api/abonnements/utilisation");
    assert.equal(util.body.quotasAppliques, true);
    assert.deepEqual(util.body.jauges[0], { cle: "clientes", usage: 5, limite: 2, etat: "depasse", plancherApplique: false });

    const refus = await creerCli(a);
    assert.equal(refus.status, 409);
    assert.deepEqual(refus.body.details.quota, { ressource: "clientes", limite: 2, usage: 5 });
    // tout le reste continue : lecture, modification, export, archivage
    const liste = await a.api.get("/api/clientes");
    assert.equal(liste.status, 200);
    assert.equal(liste.body.data.length, 5);
    assert.equal((await a.api.patch(`/api/clientes/${liste.body.data[0].id}`, { nom: "Modifiée" })).status, 200);
    assert.equal((await a.api.get("/api/clientes/export")).status, 200);
    assert.equal((await a.api.post(`/api/clientes/${liste.body.data[1].id}/archiver`)).status, 200);
    assert.equal(await prisma.cliente.count({ where: { atelierId: a.id } }), 5, "aucune fiche supprimée");
    // les AUTRES ressources ne sont pas bloquées par le dépassement des clientes : employé (1 sur 1) puis refus propre à cette ressource
    assert.equal((await creerEmp(a)).status, 201);
    const refusEmp = await creerEmp(a);
    assert.equal(refusEmp.status, 409);
    assert.equal(refusEmp.body.details.quota.ressource, "employes");
    assert.equal(await prisma.user.count({ where: { atelierId: a.id, actif: false } }), 0, "aucun compte désactivé");
  });

  it("abonnement existant échu (hors grâce) : première souscription limitée = formule active tout de suite, mêmes règles strictes, sans plancher", async () => {
    const a = await atelierExistant("Echu", { abonnementLegacy: { debut: -90, fin: -60 }, clientes: 3 });
    const nouveau = await souscrire(a, mini);
    assert.ok(new Date(nouveau.dateDebut) <= new Date(), "démarre immédiatement");
    assert.deepEqual(nouveau.plancher, {}, "a déjà eu un abonnement activé : non éligible");
    const refus = await creerCli(a);
    assert.equal(refus.status, 409);
    assert.deepEqual(refus.body.details.quota, { ressource: "clientes", limite: 2, usage: 3 });
  });

  it("atelier ancien qui n'a JAMAIS eu d'abonnement activé : éligible au plancher à sa première souscription limitée", async () => {
    const a = await atelierExistant("Jamais", { clientes: 4 });
    const ab = await souscrire(a, mini);
    assert.deepEqual(ab.plancher, { clientes: 4 });
    assert.equal(ab.limites.clientes, 4);
    assert.equal((await creerCli(a)).status, 409, "4 sur 4 : pas de 5e, mais les 4 fiches restent intactes");
  });
});
