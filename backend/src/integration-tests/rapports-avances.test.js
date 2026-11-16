// Rapports avancés (6.7) : chiffres exacts sur un jeu de données connu, permission distincte, montants réservés à
// « finances.voir », isolation entre ateliers, période. Base Postgres jetable dédiée.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { normaliserPermissions } from "../lib/permissions.js";
import { debutDuJour } from "../lib/production.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, creerCliente, creerCommande, supprimerAtelier } from "./helpers.js";

const MDP = "Atelier-Test-2026!";
const marque = `${process.pid}-${Date.now()}`;
const JOUR = 86_400_000;
const R = "/api/rapports/avances";

describe("Rapports avancés", () => {
  let server, baseUrl, A, B, pdg, pdgB, e1, e2, e3, E1, E2, F1, F2;
  const debut = debutDuJour();
  const jours = (n) => new Date(debut.getTime() + n * JOUR); // n < 0 : dans le passé

  const connecter = async (c) => {
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant: c.identifiant, password: c.password })).status, 200);
    return api;
  };
  async function employe(atelierId, nom, permissions) {
    const identifiant = `ra-${nom}-${marque}`;
    const user = await prisma.user.create({
      data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "EMPLOYE", atelierId, prenom: nom, nom: "Test", poste: "AUTRE", permissions: normaliserPermissions(permissions) },
    });
    return { user, identifiant, password: MDP };
  }

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Rapports A" });
    const rb = await creerAtelierEtAdmin({ nom: "Atelier Rapports B" });
    A = ra.atelier;
    B = rb.atelier;
    pdg = await connecter(ra);
    pdgB = await connecter(rb);
    E1 = await employe(A.id, "e1", ["rapports.avances"]);
    E2 = await employe(A.id, "e2", ["rapports.lire"]);
    const E3 = await employe(A.id, "e3", ["rapports.avances", "finances.voir"]);
    [e1, e2, e3] = await Promise.all([connecter(E1), connecter(E2), connecter(E3)]);

    const cl = await creerCliente(A.id, { nom: "Rapport", prenom: "Cliente", telephone: `93${Date.now().toString().slice(-6)}` });
    const cmd = (data) => creerCommande(A.id, cl.id, data);
    await cmd({ statut: "EN_CONFECTION", assigneAId: E1.user.id, dateLivraisonPrevue: jours(-3), priorite: "URGENTE" }); // c1 en retard
    await cmd({ statut: "NOUVELLE", assigneAId: E1.user.id, dateLivraisonPrevue: jours(5) }); // c2
    await cmd({ statut: "TERMINEE", assigneAId: E2.user.id, dateLivraisonPrevue: jours(-1) }); // c3 en retard
    await cmd({ statut: "NOUVELLE", dateLivraisonPrevue: jours(-10) }); // c4 non affectée, en retard
    const c5 = await cmd({ statut: "LIVREE", assigneAId: E1.user.id, dateLivraisonPrevue: jours(-5) });
    const c6 = await cmd({ statut: "LIVREE", assigneAId: E1.user.id, dateLivraisonPrevue: jours(-10) });
    await cmd({ statut: "ANNULEE", assigneAId: E1.user.id, dateLivraisonPrevue: jours(-20) }); // c7 ignorée partout
    await prisma.livraison.create({ data: { commandeId: c5.id, dateLivraison: jours(-5), montantRestant: "0" } }); // le jour prévu = à l'heure
    await prisma.livraison.create({ data: { commandeId: c6.id, dateLivraison: jours(-6), montantRestant: "0" } }); // 4 jours de retard
    await prisma.paiement.create({ data: { commandeId: c5.id, montant: "5000", mode: "ESPECES" } });

    // Un autre atelier, avec ses propres retards et dépenses : ne doit jamais apparaître chez A.
    const clB = await creerCliente(B.id, { nom: "AutreAtelier", prenom: "B", telephone: `92${Date.now().toString().slice(-6)}` });
    const EB = await employe(B.id, "eb", ["rapports.avances"]);
    await creerCommande(B.id, clB.id, { statut: "NOUVELLE", assigneAId: EB.user.id, dateLivraisonPrevue: jours(-7) });
    await prisma.depense.create({ data: { atelierId: B.id, categorie: "Tissu", montant: "7777" } });
    const livreeB = await creerCommande(B.id, clB.id, { statut: "LIVREE", assigneAId: EB.user.id, dateLivraisonPrevue: jours(-9) });
    await prisma.livraison.create({ data: { commandeId: livreeB.id, dateLivraison: jours(-2), montantRestant: "0" } }); // 7 jours de retard, chez B
    const fB = await prisma.fournisseur.create({ data: { atelierId: B.id, nom: "Fournisseur de B" } });
    const artB = await prisma.articleStock.create({ data: { atelierId: B.id, nom: "Soie" } });
    await prisma.achat.create({ data: { atelierId: B.id, fournisseurId: fB.id, numero: `ACH-B-${marque}`, lignes: { create: [{ articleId: artB.id, quantite: "1", prixUnitaire: "4242" }] } } });

    // Achats : F1 (2 achats + 1 annulé), F2 (1 achat).
    F1 = await prisma.fournisseur.create({ data: { atelierId: A.id, nom: "Tissus Alpha" } });
    F2 = await prisma.fournisseur.create({ data: { atelierId: A.id, nom: "Boutons Beta" } });
    const art = await prisma.articleStock.create({ data: { atelierId: A.id, nom: "Wax" } });
    const art2 = await prisma.articleStock.create({ data: { atelierId: A.id, nom: "Fil" } });
    const dPaye = await prisma.depense.create({ data: { atelierId: A.id, categorie: "Tissu", montant: "100" } });
    let compteurAchat = 0;
    const achat = (fournisseurId, lignes, extra = {}) => prisma.achat.create({ data: { atelierId: A.id, fournisseurId, numero: `ACH-${marque}-${++compteurAchat}`, ...extra, lignes: { create: lignes } } });
    await achat(F1.id, [{ articleId: art.id, quantite: "10", prixUnitaire: "100", quantiteRecue: "4" }]); // 1000 / reçu 400
    await achat(F1.id, [{ articleId: art.id, quantite: "2", prixUnitaire: "50", quantiteRecue: "2" }], { depenseId: dPaye.id }); // 100 / 100 / payé
    await achat(F1.id, [{ articleId: art.id, quantite: "5", prixUnitaire: "100" }], { statut: "ANNULE", annuleAt: new Date() }); // ignoré
    await achat(F2.id, [{ articleId: art2.id, quantite: "3", prixUnitaire: "200" }]); // 600
    // Dépenses : Tissu 100 (achat) + 50, Loyer 300, une annulée ignorée.
    await prisma.depense.create({ data: { atelierId: A.id, categorie: "Tissu", montant: "50" } });
    await prisma.depense.create({ data: { atelierId: A.id, categorie: "Loyer", montant: "300" } });
    await prisma.depense.create({ data: { atelierId: A.id, categorie: "Loyer", montant: "999", annuleAt: new Date(), annuleMotif: "erreur" } });
  });

  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(A.id);
    await supprimerAtelier(B.id);
    await prisma.$disconnect();
  });

  describe("permissions", () => {
    it("« rapports.avances » implique « rapports.lire »", () => {
      assert.ok(normaliserPermissions(["rapports.avances"]).includes("rapports.lire"));
    });

    it("un employé qui n'a que « rapports.lire » n'accède à aucun rapport avancé", async () => {
      for (const r of ["production", "retards", "achats-fournisseurs", "depenses-categories", "marges"]) {
        assert.equal((await e2.get(`${R}/${r}`)).status, 403, r);
      }
    });

    it("sans « finances.voir » : production et retards oui, achats, dépenses et marges non (403)", async () => {
      assert.equal((await e1.get(`${R}/production`)).status, 200);
      assert.equal((await e1.get(`${R}/retards`)).status, 200);
      for (const r of ["achats-fournisseurs", "depenses-categories", "marges"]) assert.equal((await e1.get(`${R}/${r}`)).status, 403, r);
    });

    it("production et retards ne contiennent aucun montant", async () => {
      const texte = JSON.stringify([(await e1.get(`${R}/production`)).body, (await e1.get(`${R}/retards`)).body]);
      assert.doesNotMatch(texte, /prix|montant|solde|depense/i);
    });

    it("avec « finances.voir » et le PDG : tout est accessible", async () => {
      for (const api of [e3, pdg]) {
        for (const r of ["production", "retards", "achats-fournisseurs", "depenses-categories", "marges"]) assert.equal((await api.get(`${R}/${r}`)).status, 200, r);
      }
    });

    it("sans session : 401 ; période invalide : 400", async () => {
      assert.equal((await client(baseUrl).get(`${R}/production`)).status, 401);
      assert.equal((await pdg.get(`${R}/production?period=nimporte`)).status, 400);
      assert.equal((await pdg.get(`${R}/marges?from=2026-02-01&to=2026-01-01`)).status, 400);
    });
  });

  describe("production par employé", () => {
    it("compte ouvertes, retards et livraisons à l'heure par employé (annulées et autres ateliers exclus)", async () => {
      const { body } = await pdg.get(`${R}/production`);
      const l1 = body.employes.find((e) => e.id === E1.user.id);
      const l2 = body.employes.find((e) => e.id === E2.user.id);
      assert.deepEqual({ o: l1.ouvertes, r: l1.enRetard, l: l1.livrees, h: l1.livreesALHeure, t: l1.tauxALHeure }, { o: 2, r: 1, l: 2, h: 1, t: 50 });
      assert.deepEqual({ o: l2.ouvertes, r: l2.enRetard, l: l2.livrees, t: l2.tauxALHeure }, { o: 1, r: 1, l: 0, t: null });
      assert.deepEqual(body.nonAffectees, { ouvertes: 1, enRetard: 1 });
      assert.ok(!body.employes.some((e) => e.identifiant?.includes("-eb-")), "aucun employé de l'autre atelier");
    });

    it("la période ne borne que les livraisons (les ouvertes sont un instantané)", async () => {
      const { body } = await pdg.get(`${R}/production?from=2000-01-01&to=2000-01-02`);
      const l1 = body.employes.find((e) => e.id === E1.user.id);
      assert.equal(l1.livrees, 0);
      assert.equal(l1.ouvertes, 2);
    });

    it("l'atelier B ne voit que ses propres données", async () => {
      const { body } = await pdgB.get(`${R}/production`);
      assert.equal(body.employes.length, 1);
      assert.equal(body.employes[0].ouvertes, 1);
      assert.equal(body.employes[0].enRetard, 1);
      assert.equal(body.employes[0].livrees, 1);
      assert.equal((await pdgB.get(`${R}/retards`)).body.ponctualite.retardMoyenJours, 7);
    });
  });

  describe("retards", () => {
    it("instantané des retards : total, statuts, priorités, les plus anciennes d'abord", async () => {
      const { body } = await pdg.get(`${R}/retards`);
      assert.equal(body.enCours.total, 3);
      const parStatut = Object.fromEntries(body.enCours.parStatut.map((g) => [g.statut, g.nombre]));
      assert.deepEqual(parStatut, { EN_CONFECTION: 1, TERMINEE: 1, NOUVELLE: 1 });
      assert.equal(body.enCours.parPriorite.find((g) => g.priorite === "URGENTE").nombre, 1);
      assert.deepEqual(body.enCours.plusAnciennes.map((c) => c.joursDeRetard), [10, 3, 1]);
      assert.equal(body.enCours.plusAnciennes[0].assigneA, null);
    });

    it("ponctualité des livraisons de la période : taux et retard moyen", async () => {
      const { body } = await pdg.get(`${R}/retards`);
      assert.deepEqual(body.ponctualite, { livrees: 2, aLHeure: 1, enRetard: 1, tauxALHeure: 50, retardMoyenJours: 4 });
      const vide = (await pdg.get(`${R}/retards?from=2000-01-01&to=2000-01-02`)).body.ponctualite;
      assert.deepEqual(vide, { livrees: 0, aLHeure: 0, enRetard: 0, tauxALHeure: null, retardMoyenJours: null });
    });

    it("le jour même n'est pas un retard", async () => {
      const cl = await creerCliente(B.id, { nom: "Jour", prenom: "Meme", telephone: `91${Date.now().toString().slice(-6)}` });
      await creerCommande(B.id, cl.id, { statut: "NOUVELLE", dateLivraisonPrevue: jours(0) });
      assert.equal((await pdgB.get(`${R}/retards`)).body.enCours.total, 1); // seulement celle d'hier de B
    });
  });

  describe("achats par fournisseur", () => {
    it("valeurs commandée, reçue, payée et reste à payer ; annulés comptés à part", async () => {
      const { body } = await e3.get(`${R}/achats-fournisseurs`);
      const [f1, f2] = body.fournisseurs;
      assert.equal(f1.nom, "Tissus Alpha");
      assert.deepEqual([f1.nombreAchats, f1.nombreAnnules, Number(f1.valeurCommandee), Number(f1.valeurRecue), Number(f1.valeurPayee), Number(f1.resteAPayer)], [2, 1, 1100, 500, 100, 1000]);
      assert.deepEqual([f2.nom, f2.nombreAchats, Number(f2.valeurCommandee), Number(f2.valeurRecue), Number(f2.resteAPayer)], ["Boutons Beta", 1, 600, 0, 600]);
      assert.deepEqual([body.total.nombreAchats, Number(body.total.valeurCommandee), Number(body.total.valeurPayee)], [3, 1700, 100]);
    });

    it("la période filtre sur la date de commande de l'achat ; un autre atelier est isolé", async () => {
      assert.equal((await e3.get(`${R}/achats-fournisseurs?from=2000-01-01&to=2000-01-02`)).body.fournisseurs.length, 0);
      const b = (await pdgB.get(`${R}/achats-fournisseurs`)).body;
      assert.deepEqual([b.fournisseurs.length, b.fournisseurs[0].nom, Number(b.total.valeurCommandee)], [1, "Fournisseur de B", 4242]);
      assert.ok(!(await e3.get(`${R}/achats-fournisseurs`)).body.fournisseurs.some((f) => f.nom === "Fournisseur de B"));
    });
  });

  describe("dépenses par catégorie", () => {
    it("totaux, parts et part venant des achats ; dépense annulée et autre atelier exclues", async () => {
      const { body } = await e3.get(`${R}/depenses-categories`);
      assert.equal(Number(body.total), 450);
      assert.equal(body.nombre, 3);
      const [loyer, tissu] = body.categories;
      assert.deepEqual([loyer.categorie, Number(loyer.total), Number(loyer.part), Number(loyer.dontAchats)], ["Loyer", 300, 66.7, 0]);
      assert.deepEqual([tissu.categorie, tissu.nombre, Number(tissu.total), Number(tissu.part), Number(tissu.dontAchats)], ["Tissu", 2, 150, 33.3, 100]);
    });

    it("période sans dépense : total nul, parts absentes", async () => {
      const { body } = await e3.get(`${R}/depenses-categories?from=2000-01-01&to=2000-01-02`);
      assert.deepEqual([Number(body.total), body.categories.length], [0, 0]);
    });
  });

  describe("marges simples", () => {
    it("valeur des commandes (hors annulées) moins dépenses, taux, solde de caisse, valeur par type", async () => {
      const { body } = await e3.get(`${R}/marges`);
      assert.equal(Number(body.valeurCommandes), 60000); // 6 commandes non annulées × 10 000
      assert.equal(body.nombreCommandes, 6);
      assert.equal(Number(body.totalDepenses), 450);
      assert.equal(Number(body.margeSimple), 59550);
      assert.equal(Number(body.tauxMarge), 99.3);
      assert.equal(Number(body.soldeCaisse), 4550); // 5 000 encaissés − 450
      assert.deepEqual(body.parType.map((t) => [t.typeVetement, t.nombre, Number(t.valeur)]), [["ROBE", 6, 60000]]);
      assert.match(body.avertissement, /Ordre de grandeur/);
    });

    it("aucune commande sur la période : taux absent (pas de division par zéro)", async () => {
      const { body } = await e3.get(`${R}/marges?from=2000-01-01&to=2000-01-02`);
      assert.equal(body.tauxMarge, null);
      assert.equal(Number(body.margeSimple), 0);
    });

    it("atelier B : ses chiffres seulement", async () => {
      const { body } = await pdgB.get(`${R}/marges`);
      assert.equal(Number(body.totalDepenses), 7777);
      assert.equal(body.nombreCommandes, 3); // la sienne, la livrée et celle du jour même
    });
  });
});
