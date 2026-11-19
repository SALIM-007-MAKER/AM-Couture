// Quotas commerciaux : contrôle côté serveur à chaque point d'entrée, cohérence sous requêtes simultanées, et cas limites
// (essai, grâce, lecture seule, plancher, usurpation d'identité, isolation). Base Postgres jetable dédiée (voir preload.js).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, supprimerAtelier } from "./helpers.js";
import { creerCommandeApi } from "./concurrence-helpers.js";

const marque = `${process.pid}-${Date.now()}`;
const MDP = "Atelier-Test-2026!";
const JOUR = 86_400_000;
let compteur = 0;
const suffixe = () => String(++compteur).padStart(4, "0");
const telephone = () => `9${marque.replace(/\D/g, "").slice(-3)}${suffixe()}`;

describe("Quotas : contrôle serveur", () => {
  let server, baseUrl, superApi, superId, planMini, planConc;
  const ateliers = [];
  const plansExtra = [];

  /**
   * Atelier de test. `mode` : "abonne" (essai passé, abonnement actif avec les limites du plan, strict),
   * "essai" (essai en cours), "ancien" (sans échéance d'essai, sans abonnement), "grace" (abonnement échu depuis 3 jours),
   * "lectureSeule" (abonnement échu depuis 30 jours), "essaiTermine" (essai fini depuis 3 jours, sans abonnement).
   */
  async function atelier(nom, mode, plan = planMini, { limites, plancher } = {}) {
    const r = await creerAtelierEtAdmin({ nom: `${nom} ${marque}` });
    ateliers.push(r.atelier.id);
    const data = {};
    if (mode === "essai") data.trialEndsAt = new Date(Date.now() + 10 * JOUR);
    if (["abonne", "grace", "lectureSeule"].includes(mode)) data.trialEndsAt = new Date(Date.now() - 60 * JOUR);
    if (mode === "essaiTermine") data.trialEndsAt = new Date(Date.now() - 3 * JOUR);
    if (Object.keys(data).length) await prisma.atelier.update({ where: { id: r.atelier.id }, data });
    if (["abonne", "grace", "lectureSeule"].includes(mode)) {
      const fin = mode === "abonne" ? Date.now() + 25 * JOUR : mode === "grace" ? Date.now() - 3 * JOUR : Date.now() - 30 * JOUR;
      await prisma.abonnement.create({
        data: {
          numero: `ABN-Q-${marque}-${suffixe()}`,
          atelierId: r.atelier.id,
          planId: plan.id,
          planNom: plan.nom,
          prix: "5000",
          statut: "CONFIRME",
          dateDebut: new Date(fin - 30 * JOUR),
          dateExpiration: new Date(fin),
          limites: limites ?? plan.limites,
          plancher: plancher ?? {},
        },
      });
    }
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant: r.identifiant, password: r.password })).status, 200);
    return { ...r, api, id: r.atelier.id };
  }

  const creerClienteApi = (a, tel = telephone()) => a.api.post("/api/clientes", { prenom: "Test", nom: `Q${suffixe()}`, telephone: tel });
  const creerModeleApi = (a) => a.api.post("/api/modeles", { nom: `Modèle ${suffixe()}`, categorie: "ROBE" });
  const creerEmployeApi = (a) => a.api.post("/api/employes", { identifiant: `emp-${marque}-${suffixe()}`, password: MDP, prenom: "Emp", nom: "Q", poste: "AUTRE" });
  const quota = (res) => res.body?.details?.quota;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const identifiant = `super-quotas-controle-${marque}`;
    superId = (await prisma.user.create({ data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN" } })).id;
    superApi = client(baseUrl);
    assert.equal((await superApi.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    planMini = await prisma.planAbonnement.create({ data: { nom: `Mini ${marque}`, prixMensuel: "5000", limites: { clientes: 2, employes: 1, commandesActives: 2, modeles: 2 } } });
    planConc = await prisma.planAbonnement.create({ data: { nom: `Conc ${marque}`, prixMensuel: "5000", limites: { clientes: 5, employes: 3, commandesActives: 4, modeles: 6 } } });
  });

  after(async () => {
    await arreterServeur(server);
    for (const id of ateliers) {
      await prisma.demandeCommande.deleteMany({ where: { atelierId: id } });
      await prisma.historiqueAbonnement.deleteMany({ where: { atelierId: id } });
      await prisma.abonnement.deleteMany({ where: { atelierId: id } });
      await prisma.journalSecurite.deleteMany({ where: { atelierId: id } });
      await prisma.notification.deleteMany({ where: { atelierId: id } });
      await prisma.affectationCommande.deleteMany({ where: { atelierId: id } });
      await supprimerAtelier(id);
    }
    await prisma.planAbonnement.deleteMany({ where: { id: { in: [planMini.id, planConc.id, ...plansExtra] } } });
    await prisma.user.delete({ where: { id: superId } });
    await prisma.$disconnect();
  });

  // ── Quand les quotas s'appliquent ────────────────────────────────────────────────────────────────────────────────

  describe("essai, atelier ancien, abonnement migré : aucun quota", () => {
    it("essai gratuit en cours : aucune limite, même avec un abonnement déjà activé", async () => {
      const a = await atelier("Essai", "essai");
      await prisma.abonnement.create({ data: { numero: `ABN-E-${marque}`, atelierId: a.id, planId: planMini.id, planNom: planMini.nom, prix: "5000", statut: "CONFIRME", dateDebut: new Date(), dateExpiration: new Date(Date.now() + 30 * JOUR), limites: planMini.limites } });
      for (let i = 0; i < 4; i++) assert.equal((await creerClienteApi(a)).status, 201);
      for (let i = 0; i < 3; i++) assert.equal((await creerModeleApi(a)).status, 201);
      for (let i = 0; i < 3; i++) assert.equal((await creerEmployeApi(a)).status, 201);
    });

    it("atelier ancien sans abonnement : aucune limite", async () => {
      const a = await atelier("Ancien", "ancien");
      for (let i = 0; i < 4; i++) assert.equal((await creerClienteApi(a)).status, 201);
    });

    it("abonnement existant migré (limites {}) : illimité", async () => {
      const a = await atelier("Migre", "abonne", planMini, { limites: {} });
      for (let i = 0; i < 4; i++) assert.equal((await creerClienteApi(a)).status, 201);
    });

    it("essai terminé depuis 3 jours, sans abonnement (période de grâce) : aucune limite", async () => {
      const a = await atelier("EssaiTermine", "essaiTermine");
      for (let i = 0; i < 3; i++) assert.equal((await creerClienteApi(a)).status, 201);
    });
  });

  // ── Cliente ──────────────────────────────────────────────────────────────────────────────────────────────────────

  describe("clientes", () => {
    it("création : refus 409 au quota (details.quota), rien d'enregistré ; un téléphone déjà pris est signalé avant le quota", async () => {
      const a = await atelier("Clientes", "abonne");
      const t1 = telephone();
      assert.equal((await creerClienteApi(a, t1)).status, 201);
      assert.equal((await creerClienteApi(a)).status, 201);
      const refus = await creerClienteApi(a);
      assert.equal(refus.status, 409);
      assert.deepEqual(quota(refus), { ressource: "clientes", limite: 2, usage: 2 });
      assert.equal(await prisma.cliente.count({ where: { atelierId: a.id } }), 2);
      const doublon = await creerClienteApi(a, t1);
      assert.equal(doublon.status, 409);
      assert.equal(quota(doublon), undefined, "doublon de téléphone : erreur de doublon, pas de quota");
      assert.ok(doublon.body.details.clienteId);
    });

    it("archiver libère le quota ; restaurer le consomme et est refusé quand le quota est atteint", async () => {
      const a = await atelier("Archive", "abonne");
      const c1 = (await creerClienteApi(a)).body;
      await creerClienteApi(a);
      assert.equal((await a.api.post(`/api/clientes/${c1.id}/archiver`)).status, 200);
      const c3 = await creerClienteApi(a);
      assert.equal(c3.status, 201, "la place libérée par l'archivage est utilisable");
      const restaure = await a.api.post(`/api/clientes/${c1.id}/restaurer`);
      assert.equal(restaure.status, 409, "restaurer ajouterait une 3e cliente active");
      assert.deepEqual(quota(restaure), { ressource: "clientes", limite: 2, usage: 2 });
      assert.notEqual((await prisma.cliente.findUnique({ where: { id: c1.id } })).archivedAt, null, "la fiche reste archivée, intacte");
      // sous la limite : la restauration passe
      await a.api.post(`/api/clientes/${c3.body.id}/archiver`);
      assert.equal((await a.api.post(`/api/clientes/${c1.id}/restaurer`)).status, 200);
    });

    it("atelier au-dessus de son quota (plancher, formule changée) : consulter, modifier, archiver restent possibles ; seule la création est refusée", async () => {
      const a = await atelier("AuDessus", "abonne");
      const fiches = [];
      for (let i = 0; i < 4; i++) fiches.push(await creerCliente(a.id, { telephone: telephone() }));
      const refus = await creerClienteApi(a);
      assert.equal(refus.status, 409);
      assert.deepEqual(quota(refus), { ressource: "clientes", limite: 2, usage: 4 });
      assert.equal((await a.api.get("/api/clientes")).status, 200);
      assert.equal((await a.api.patch(`/api/clientes/${fiches[0].id}`, { nom: "Modifiée" })).status, 200);
      assert.equal((await a.api.get("/api/clientes/export")).status, 200);
      assert.equal((await a.api.post(`/api/clientes/${fiches[1].id}/archiver`)).status, 200);
      assert.equal(await prisma.cliente.count({ where: { atelierId: a.id } }), 4, "aucune donnée supprimée");
    });

    it("plancher d'usage : limite effective de 3 avec 3 fiches : la 4e est refusée, la limite de la formule (2) n'est pas appliquée", async () => {
      const a = await atelier("Plancher", "abonne", planMini, { limites: { ...planMini.limites, clientes: 3 }, plancher: { clientes: 3 } });
      for (let i = 0; i < 3; i++) await creerCliente(a.id, { telephone: telephone() });
      const refus = await creerClienteApi(a);
      assert.deepEqual(quota(refus), { ressource: "clientes", limite: 3, usage: 3 });
    });

    it("cliente anonymisée ou archivée : ne compte pas ; rattacher une demande à une fiche existante n'ajoute rien, en créer une est contrôlé", async () => {
      const a = await atelier("Demandes", "abonne");
      const existante = await creerCliente(a.id, { telephone: "90000011" });
      await creerClienteApi(a);
      // quota atteint (2) : une demande dont le téléphone correspond à une fiche existante est rattachée sans nouveau quota
      const d1 = await prisma.demandeCommande.create({ data: { atelierId: a.id, origine: "VITRINE", contactPrenom: "A", contactNom: "B", contactTelephone: existante.telephone, consentementLe: new Date() } });
      const ok = await a.api.post(`/api/demandes/${d1.id}/cliente`);
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      // téléphone inconnu : une nouvelle fiche serait créée → refus 409, la demande reste en attente et intacte
      const d2 = await prisma.demandeCommande.create({ data: { atelierId: a.id, origine: "VITRINE", contactPrenom: "C", contactNom: "D", contactTelephone: "90000012", consentementLe: new Date() } });
      const refus = await a.api.post(`/api/demandes/${d2.id}/cliente`);
      assert.equal(refus.status, 409);
      assert.deepEqual(quota(refus), { ressource: "clientes", limite: 2, usage: 2 });
      const apres = await prisma.demandeCommande.findUnique({ where: { id: d2.id } });
      assert.equal(apres.clienteId, null);
      assert.equal(apres.contactTelephone, "90000012", "les coordonnées de la demande ne sont pas effacées");
      assert.equal(apres.statut, "EN_ATTENTE");
    });
  });

  // ── Employés ─────────────────────────────────────────────────────────────────────────────────────────────────────

  describe("employés", () => {
    it("seuls les comptes EMPLOYE actifs comptent : le PDG ne compte pas ; désactiver libère ; réactiver est contrôlé", async () => {
      const a = await atelier("Employes", "abonne");
      const e1 = await creerEmployeApi(a);
      assert.equal(e1.status, 201, "le PDG ne compte pas : le 1er employé est accepté");
      const refus = await creerEmployeApi(a);
      assert.equal(refus.status, 409);
      assert.deepEqual(quota(refus), { ressource: "employes", limite: 1, usage: 1 });
      assert.equal((await a.api.post(`/api/employes/${e1.body.id}/desactiver`, {})).status, 200);
      const e2 = await creerEmployeApi(a);
      assert.equal(e2.status, 201, "un employé désactivé ne compte pas");
      const reactive = await a.api.post(`/api/employes/${e1.body.id}/reactiver`, {});
      assert.equal(reactive.status, 409);
      assert.deepEqual(quota(reactive), { ressource: "employes", limite: 1, usage: 1 });
      assert.equal((await prisma.user.findUnique({ where: { id: e1.body.id } })).actif, false, "le compte reste désactivé, intact");
      // un compte cliente (USER) ne compte pas non plus
      await prisma.user.create({ data: { identifiant: `user-${marque}-${suffixe()}`, passwordHash: "x", role: "USER", atelierId: a.id } });
      assert.equal((await creerEmployeApi(a)).status, 409);
      // réactivation d'un compte déjà actif : réponse « déjà traité », pas de quota
      const deja = await a.api.post(`/api/employes/${e2.body.id}/reactiver`, {});
      assert.equal(deja.status, 200);
      assert.equal(deja.body.dejaTraite, true);
    });
  });

  // ── Commandes actives ────────────────────────────────────────────────────────────────────────────────────────────

  describe("commandes actives", () => {
    it("NOUVELLE à TERMINEE comptent ; LIVREE et ANNULEE libèrent ; refus 409 au quota", async () => {
      const a = await atelier("Commandes", "abonne");
      const cliente = await creerCliente(a.id, { telephone: telephone() });
      await prisma.mesure.create({ data: { clienteId: cliente.id, taille: "70" } });
      const c1 = await creerCommandeApi(a.api, cliente.id);
      const c2 = await creerCommandeApi(a.api, cliente.id, { statut: "TERMINEE" });
      const refus = await a.api.post("/api/commandes", { clienteId: cliente.id, typeVetement: "ROBE", prixTotal: "1000", dateLivraisonPrevue: new Date(Date.now() + 5 * JOUR).toISOString() });
      assert.equal(refus.status, 409);
      assert.deepEqual(quota(refus), { ressource: "commandesActives", limite: 2, usage: 2 });
      assert.equal(await prisma.commande.count({ where: { atelierId: a.id } }), 2);
      // une commande terminée mais non livrée occupe toujours une place ; l'annuler la libère
      assert.equal((await a.api.post(`/api/commandes/${c1.id}/statut`, { statut: "ANNULEE" })).status, 200);
      const c3 = await creerCommandeApi(a.api, cliente.id);
      assert.ok(c3.id);
      // une commande livrée libère aussi sa place (la livraison passe par sa propre route, ici simulée en base)
      await prisma.commande.update({ where: { id: c2.id }, data: { statut: "LIVREE" } });
      assert.ok((await creerCommandeApi(a.api, cliente.id)).id);
    });
  });

  // ── Modèles ──────────────────────────────────────────────────────────────────────────────────────────────────────

  describe("modèles", () => {
    it("création, archivage, restauration : mêmes règles que les clientes ; les 8 photos par modèle restent un plafond technique distinct", async () => {
      const a = await atelier("Modeles", "abonne");
      const m1 = (await creerModeleApi(a)).body;
      await creerModeleApi(a);
      const refus = await creerModeleApi(a);
      assert.equal(refus.status, 409);
      assert.deepEqual(quota(refus), { ressource: "modeles", limite: 2, usage: 2 });
      assert.equal((await a.api.post(`/api/modeles/${m1.id}/archiver`)).status, 200);
      const m3 = await creerModeleApi(a);
      assert.equal(m3.status, 201);
      const restaure = await a.api.post(`/api/modeles/${m1.id}/restaurer`);
      assert.equal(restaure.status, 409);
      assert.equal(quota(restaure).ressource, "modeles");
      assert.equal((await a.api.post(`/api/modeles/${m3.body.id}/archiver`)).status, 200);
      assert.equal((await a.api.post(`/api/modeles/${m1.id}/restaurer`)).status, 200);
    });
  });

  // ── Période de grâce, lecture seule, usurpation d'identité ───────────────────────────────────────────────────────

  describe("grâce, lecture seule, usurpation d'identité", () => {
    it("période de grâce après un abonnement : les quotas de la dernière formule restent applicables", async () => {
      const a = await atelier("Grace", "grace");
      assert.equal((await creerClienteApi(a)).status, 201);
      assert.equal((await creerClienteApi(a)).status, 201);
      const refus = await creerClienteApi(a);
      assert.equal(refus.status, 409);
      assert.equal(quota(refus).limite, 2);
    });

    it("lecture seule : le 402 existant garde la priorité (jamais le 409), avec ses indicateurs", async () => {
      const a = await atelier("LectureSeule", "lectureSeule");
      for (let i = 0; i < 2; i++) await creerCliente(a.id, { telephone: telephone() });
      const res = await creerClienteApi(a);
      assert.equal(res.status, 402);
      assert.equal(res.body.details.lectureSeule, true);
      assert.equal(quota(res), undefined);
    });

    it("usurpation d'identité du SUPERADMIN : les quotas de l'atelier s'appliquent", async () => {
      const a = await atelier("Usurpation", "abonne");
      for (let i = 0; i < 2; i++) await creerCliente(a.id, { telephone: telephone() });
      const imp = client(baseUrl);
      const sa = await prisma.user.findUnique({ where: { id: superId } });
      assert.equal((await imp.post("/api/auth/login", { identifiant: sa.identifiant, password: MDP })).status, 200);
      const demarrage = await imp.post(`/api/ateliers/${a.id}/comptes/${a.admin.id}/impersonation`, {});
      assert.equal(demarrage.status, 200, JSON.stringify(demarrage.body));
      const refus = await imp.post("/api/clientes", { prenom: "X", nom: "Y", telephone: telephone() });
      assert.equal(refus.status, 409);
      assert.equal(quota(refus).ressource, "clientes");
    });
  });

  // ── Isolation entre ateliers, idempotence ────────────────────────────────────────────────────────────────────────

  describe("isolation et idempotence", () => {
    it("les ressources d'un autre atelier ne comptent jamais", async () => {
      const a = await atelier("IsoA", "abonne");
      const b = await atelier("IsoB", "ancien");
      for (let i = 0; i < 10; i++) await creerCliente(b.id, { telephone: telephone() });
      assert.equal((await creerClienteApi(a)).status, 201);
      assert.equal((await creerClienteApi(a)).status, 201);
      assert.equal((await creerClienteApi(a)).status, 409);
      assert.equal((await creerClienteApi(b)).status, 201, "l'atelier B n'est pas concerné par le quota de A");
    });

    it("rejeu d'une même requête (clé d'idempotence) : même réponse, aucun double comptage", async () => {
      const a = await atelier("Idem", "abonne");
      await creerClienteApi(a);
      const tel = telephone();
      const cle = `idem-${marque}-${suffixe()}`;
      const p1 = await a.api.post("/api/clientes", { prenom: "I", nom: "D", telephone: tel }, { "Idempotency-Key": cle });
      assert.equal(p1.status, 201);
      const p2 = await a.api.post("/api/clientes", { prenom: "I", nom: "D", telephone: tel }, { "Idempotency-Key": cle });
      assert.equal(p2.status, 201, "le rejeu renvoie la réponse mémorisée, pas un 409 de quota");
      assert.equal(p2.body.id, p1.body.id);
      assert.equal(await prisma.cliente.count({ where: { atelierId: a.id } }), 2);
    });
  });

  // ── Requêtes simultanées ─────────────────────────────────────────────────────────────────────────────────────────

  describe("cohérence sous requêtes simultanées", () => {
    const repartition = (reponses) => ({ crees: reponses.filter((r) => r.status === 201).length, refus: reponses.filter((r) => r.status === 409 && quota(r)).length });

    it("20 créations de clientes simultanées avec une limite de 5 : exactement 5 créées", async () => {
      const a = await atelier("ConcClientes", "abonne", planConc);
      const reponses = await Promise.all(Array.from({ length: 20 }, () => creerClienteApi(a)));
      assert.deepEqual(repartition(reponses), { crees: 5, refus: 15 });
      assert.equal(await prisma.cliente.count({ where: { atelierId: a.id } }), 5);
    });

    it("10 créations d'employés simultanées avec une limite de 3 : exactement 3", async () => {
      const a = await atelier("ConcEmployes", "abonne", planConc);
      const reponses = await Promise.all(Array.from({ length: 10 }, () => creerEmployeApi(a)));
      assert.deepEqual(repartition(reponses), { crees: 3, refus: 7 });
      assert.equal(await prisma.user.count({ where: { atelierId: a.id, role: "EMPLOYE" } }), 3);
    });

    it("15 créations de modèles simultanées avec une limite de 6 : exactement 6", async () => {
      const a = await atelier("ConcModeles", "abonne", planConc);
      const reponses = await Promise.all(Array.from({ length: 15 }, () => creerModeleApi(a)));
      assert.deepEqual(repartition(reponses), { crees: 6, refus: 9 });
      assert.equal(await prisma.modele.count({ where: { atelierId: a.id } }), 6);
    });

    it("12 créations de commandes simultanées avec une limite de 4 : exactement 4, numéros distincts", async () => {
      const a = await atelier("ConcCommandes", "abonne", planConc);
      const cliente = await creerCliente(a.id, { telephone: telephone() });
      await prisma.mesure.create({ data: { clienteId: cliente.id, taille: "70" } });
      const corps = () => ({ clienteId: cliente.id, typeVetement: "ROBE", prixTotal: "1000", dateLivraisonPrevue: new Date(Date.now() + 5 * JOUR).toISOString() });
      const reponses = await Promise.all(Array.from({ length: 12 }, () => a.api.post("/api/commandes", corps())));
      assert.deepEqual(repartition(reponses), { crees: 4, refus: 8 });
      const numeros = (await prisma.commande.findMany({ where: { atelierId: a.id }, select: { numero: true } })).map((c) => c.numero);
      assert.equal(new Set(numeros).size, 4);
    });

    it("créations et restaurations simultanées de clientes : le quota n'est jamais dépassé", async () => {
      const a = await atelier("ConcMixte", "abonne", planConc);
      const archivees = [];
      for (let i = 0; i < 4; i++) archivees.push(await creerCliente(a.id, { telephone: telephone(), archivedAt: new Date() }));
      for (let i = 0; i < 3; i++) await creerCliente(a.id, { telephone: telephone() }); // 3 actives sur 5
      const reponses = await Promise.all([
        ...archivees.map((c) => a.api.post(`/api/clientes/${c.id}/restaurer`)),
        ...Array.from({ length: 4 }, () => creerClienteApi(a)),
      ]);
      const actives = await prisma.cliente.count({ where: { atelierId: a.id, archivedAt: null } });
      assert.equal(actives, 5, `5 places au total, 3 déjà prises : ${reponses.map((r) => r.status).join(",")}`);
      assert.equal(reponses.filter((r) => r.status === 200 || r.status === 201).length, 2);
    });

    it("réactivations simultanées du même employé : une seule, comptée une fois", async () => {
      const a = await atelier("ConcReactiv", "abonne");
      const e = (await creerEmployeApi(a)).body;
      await a.api.post(`/api/employes/${e.id}/desactiver`, {});
      const reponses = await Promise.all(Array.from({ length: 6 }, () => a.api.post(`/api/employes/${e.id}/reactiver`, {})));
      assert.ok(reponses.every((r) => r.status === 200), reponses.map((r) => r.status).join(","));
      assert.equal(await prisma.user.count({ where: { atelierId: a.id, role: "EMPLOYE", actif: true } }), 1);
    });
  });
});
