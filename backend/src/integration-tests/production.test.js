// Production (6.3) : affectation des commandes aux employés, historique, filtres « mes travaux » / retards, charge par
// employé, isolation entre ateliers, désactivation d'un employé. Base Postgres jetable dédiée (voir preload.js).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, creerCommande, supprimerAtelier } from "./helpers.js";

const JOUR = 86_400_000;
const MDP = "Atelier-Test-2026!";
const marque = `${process.pid}-${Date.now()}`;

describe("Production : affectation des commandes", () => {
  let server, baseUrl, A, B, pdg, pdgB, cliente, clienteB;
  let chef, couturier, couturier2, sansDroit; // employés de A
  let cmdRetard, cmdAvenir, cmdLivree, cmdB;
  const ids = {};
  let n = 0;

  async function employe(nom, permissions, atelierId = A.id) {
    const identifiant = `prod-${nom}-${marque}-${++n}`;
    const u = await prisma.user.create({
      data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "EMPLOYE", atelierId, prenom: nom, nom: "Test", poste: "AUTRE", permissions },
    });
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    return { id: u.id, api };
  }

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Production A" });
    const rb = await creerAtelierEtAdmin({ nom: "Atelier Production B" });
    A = ra.atelier;
    B = rb.atelier;
    pdg = client(baseUrl);
    pdgB = client(baseUrl);
    assert.equal((await pdg.post("/api/auth/login", { identifiant: ra.identifiant, password: ra.password })).status, 200);
    assert.equal((await pdgB.post("/api/auth/login", { identifiant: rb.identifiant, password: rb.password })).status, 200);
    ids.pdg = (await prisma.user.findUnique({ where: { identifiant: ra.identifiant } })).id;

    cliente = await creerCliente(A.id, { nom: "Awa", prenom: "Prod", telephone: "90333331" });
    clienteB = await creerCliente(B.id, { nom: "Beta", prenom: "Prod", telephone: "90333332" });
    cmdRetard = await creerCommande(A.id, cliente.id, { dateLivraisonPrevue: new Date(Date.now() - 3 * JOUR), statut: "EN_CONFECTION" });
    cmdAvenir = await creerCommande(A.id, cliente.id, { dateLivraisonPrevue: new Date(Date.now() + 5 * JOUR) });
    cmdLivree = await creerCommande(A.id, cliente.id, { dateLivraisonPrevue: new Date(Date.now() - 9 * JOUR), statut: "LIVREE" });
    cmdB = await creerCommande(B.id, clienteB.id, {});

    chef = await employe("chef", ["commandes.affecter"]); // affecte (et lit, par implication)
    couturier = await employe("couturier", ["commandes.lire", "commandes.statut"]);
    couturier2 = await employe("couturier2", ["commandes.lire"]);
    sansDroit = await employe("sansdroit", ["commandes.lire"]);
  });

  after(async () => {
    await arreterServeur(server);
    for (const a of [A, B]) {
      await prisma.journalSecurite.deleteMany({ where: { atelierId: a.id } });
      await supprimerAtelier(a.id);
    }
    await prisma.$disconnect();
  });

  describe("droits", () => {
    it("sans « commandes.affecter », affecter et consulter la production sont refusés (403)", async () => {
      const r1 = await sansDroit.api.put(`/api/commandes/${cmdAvenir.id}/affectation`, { employeId: couturier.id });
      assert.equal(r1.status, 403);
      assert.equal((await sansDroit.api.get("/api/commandes/production")).status, 403);
      assert.equal((await pdg.get("/api/commandes/production")).status, 200);
      assert.equal((await chef.api.get("/api/commandes/production")).status, 200);
    });

    it("l'affectation ne donne aucun droit : l'employé affecté ne peut pas modifier la commande", async () => {
      const r = await pdg.put(`/api/commandes/${cmdAvenir.id}/affectation`, { employeId: couturier2.id });
      assert.equal(r.status, 200);
      const patch = await couturier2.api.patch(`/api/commandes/${cmdAvenir.id}`, { observations: "x" });
      assert.equal(patch.status, 403);
      await pdg.put(`/api/commandes/${cmdAvenir.id}/affectation`, { employeId: null });
    });
  });

  describe("affectation", () => {
    it("affecte, trace l'historique et rend la commande visible dans « mes travaux »", async () => {
      const r = await chef.api.put(`/api/commandes/${cmdRetard.id}/affectation`, { employeId: couturier.id });
      assert.equal(r.status, 200);
      assert.equal(r.body.assigneAId, couturier.id);
      assert.equal(r.body.dejaTraite, false);

      const mes = await couturier.api.get("/api/commandes?assigneA=moi");
      assert.equal(mes.status, 200);
      assert.deepEqual(mes.body.data.map((c) => c.id), [cmdRetard.id]);
      assert.equal(mes.body.data[0].assigneA.id, couturier.id);

      const detail = await pdg.get(`/api/commandes/${cmdRetard.id}`);
      assert.equal(detail.body.affectations.length, 1);
      assert.equal(detail.body.affectations[0].employe.id, couturier.id);
      assert.equal(detail.body.affectations[0].par.id, chef.id);
    });

    it("répéter la même affectation ne change rien et n'ajoute pas d'historique", async () => {
      const r = await chef.api.put(`/api/commandes/${cmdRetard.id}/affectation`, { employeId: couturier.id });
      assert.equal(r.status, 200);
      assert.equal(r.body.dejaTraite, true);
      assert.equal(await prisma.affectationCommande.count({ where: { commandeId: cmdRetard.id } }), 1);
    });

    it("réaffecter et retirer ajoutent chacun une ligne d'historique", async () => {
      assert.equal((await pdg.put(`/api/commandes/${cmdRetard.id}/affectation`, { employeId: couturier2.id })).status, 200);
      assert.equal((await pdg.put(`/api/commandes/${cmdRetard.id}/affectation`, { employeId: null })).status, 200);
      const histo = await prisma.affectationCommande.findMany({ where: { commandeId: cmdRetard.id }, orderBy: { createdAt: "asc" } });
      assert.deepEqual(histo.map((h) => h.employeId), [couturier.id, couturier2.id, null]);
      const apres = await prisma.commande.findUnique({ where: { id: cmdRetard.id } });
      assert.equal(apres.assigneAId, null);
      assert.equal(apres.assigneLe, null);
    });

    it("le PDG peut s'affecter une commande", async () => {
      const r = await pdg.put(`/api/commandes/${cmdAvenir.id}/affectation`, { employeId: ids.pdg });
      assert.equal(r.status, 200);
      await pdg.put(`/api/commandes/${cmdAvenir.id}/affectation`, { employeId: null });
    });

    it("refuse une commande livrée, un employé d'un autre atelier, un employé inconnu, un corps invalide", async () => {
      assert.equal((await pdg.put(`/api/commandes/${cmdLivree.id}/affectation`, { employeId: couturier.id })).status, 409);
      const autre = await employe("autre-atelier", ["commandes.lire"], B.id);
      assert.equal((await pdg.put(`/api/commandes/${cmdAvenir.id}/affectation`, { employeId: autre.id })).status, 404);
      assert.equal((await pdg.put(`/api/commandes/${cmdAvenir.id}/affectation`, { employeId: "inconnu" })).status, 404);
      assert.equal((await pdg.put(`/api/commandes/${cmdAvenir.id}/affectation`, {})).status, 400);
      assert.equal((await pdg.put(`/api/commandes/${cmdAvenir.id}/affectation`, { employeId: couturier.id, statut: "LIVREE" })).status, 400);
    });

    it("isolation : le PDG de B ne peut pas affecter une commande de A, ni la production de A", async () => {
      assert.equal((await pdgB.put(`/api/commandes/${cmdAvenir.id}/affectation`, { employeId: null })).status, 404);
      const r = await pdg.put(`/api/commandes/${cmdB.id}/affectation`, { employeId: couturier.id });
      assert.equal(r.status, 404);
      const prod = await pdgB.get("/api/commandes/production");
      assert.equal(prod.body.ouvertes, 1);
    });

    it("refuse d'affecter à un compte désactivé", async () => {
      const mort = await employe("desactive", ["commandes.lire"]);
      await prisma.user.update({ where: { id: mort.id }, data: { actif: false } });
      assert.equal((await pdg.put(`/api/commandes/${cmdAvenir.id}/affectation`, { employeId: mort.id })).status, 404);
    });
  });

  describe("retards et charge", () => {
    it("le filtre enRetard ne renvoie que les commandes ouvertes dont la date prévue est passée", async () => {
      const r = await pdg.get("/api/commandes?enRetard=true");
      assert.deepEqual(r.body.data.map((c) => c.id), [cmdRetard.id]);
      assert.equal(r.body.data[0].enRetard, true);
      const tout = await pdg.get("/api/commandes");
      const livree = tout.body.data.find((c) => c.id === cmdLivree.id);
      assert.equal(livree.enRetard, false); // livrée : plus jamais « en retard »
      assert.equal(tout.body.data.find((c) => c.id === cmdAvenir.id).enRetard, false);
    });

    it("le filtre assigneA=aucun liste les commandes non affectées", async () => {
      const r = await pdg.get("/api/commandes?assigneA=aucun");
      assert.ok(r.body.data.some((c) => c.id === cmdAvenir.id));
    });

    it("la charge compte les commandes ouvertes et en retard par employé et les non affectées", async () => {
      await pdg.put(`/api/commandes/${cmdRetard.id}/affectation`, { employeId: couturier.id });
      const r = await pdg.get("/api/commandes/production");
      assert.equal(r.status, 200);
      const ligne = r.body.employes.find((e) => e.id === couturier.id);
      assert.equal(ligne.ouvertes, 1);
      assert.equal(ligne.enRetard, 1);
      assert.equal(r.body.nonAffectees, 1); // cmdAvenir
      assert.equal(r.body.ouvertes, 2);
      assert.equal(r.body.enRetard, 1);
      assert.ok(!r.body.employes.some((e) => e.id === cmdB.id)); // aucune personne d'un autre atelier
      assert.ok(!JSON.stringify(r.body).includes("passwordHash"));
    });

    it("aucun montant dans la production ni dans l'affectation, même pour le PDG (champs de charge uniquement)", async () => {
      const r = await chef.api.get("/api/commandes/production");
      for (const cle of ["prixTotal", "solde", "totalPaye"]) assert.ok(!JSON.stringify(r.body).includes(`"${cle}"`));
      const l = await chef.api.get("/api/commandes?assigneA=moi");
      assert.ok(!JSON.stringify(l.body).includes('"prixTotal"')); // employé sans finances.voir
    });
  });

  describe("cycle de vie", () => {
    it("désactiver un employé libère ses commandes ouvertes et le trace", async () => {
      const mis = await employe("sortant", ["commandes.lire"]);
      await pdg.put(`/api/commandes/${cmdAvenir.id}/affectation`, { employeId: mis.id });
      const r = await pdg.post(`/api/employes/${mis.id}/desactiver`, {});
      assert.equal(r.status, 200);
      const apres = await prisma.commande.findUnique({ where: { id: cmdAvenir.id } });
      assert.equal(apres.assigneAId, null);
      const histo = await prisma.affectationCommande.findMany({ where: { commandeId: cmdAvenir.id }, orderBy: { createdAt: "desc" }, take: 1 });
      assert.equal(histo[0].employeId, null);
    });

    it("l'affectation reste lisible après la livraison (historique conservé)", async () => {
      await prisma.commande.update({ where: { id: cmdRetard.id }, data: { statut: "TERMINEE" } });
      const detail = await pdg.get(`/api/commandes/${cmdRetard.id}`);
      assert.ok(detail.body.affectations.length >= 1);
      await prisma.commande.update({ where: { id: cmdRetard.id }, data: { statut: "LIVREE" } });
      assert.equal((await pdg.put(`/api/commandes/${cmdRetard.id}/affectation`, { employeId: null })).status, 409);
    });
  });
});
