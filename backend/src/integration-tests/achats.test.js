// Achats (6.5) : bon de commande → réception (entrées de stock) → paiement (dépense), annulation, concurrence, masquage
// des prix, droits, isolation entre ateliers. Base Postgres jetable dédiée (voir preload.js).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { normaliserPermissions } from "../lib/permissions.js";
import { quantiteArticle } from "../lib/stock.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";

const MDP = "Atelier-Test-2026!";
const marque = `${process.pid}-${Date.now()}`;
const contientCle = (o, cle) => JSON.stringify(o).includes(`"${cle}"`);

describe("Achats fournisseurs", () => {
  let server, baseUrl, A, B, pdg, pdgB, fournisseur, fournisseurB, tissu, bouton, articleB;
  let magasinier, lecteur, acheteur, comptable, sansDroit;
  let n = 0;

  async function employe(nom, permissions) {
    const identifiant = `ach-${nom}-${marque}-${++n}`;
    const u = await prisma.user.create({
      data: { identifiant, passwordHash: await bcrypt.hash(MDP, 4), role: "EMPLOYE", atelierId: A.id, prenom: nom, nom: "Test", poste: "AUTRE", permissions: normaliserPermissions(permissions) },
    });
    const api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant, password: MDP })).status, 200);
    return { api, id: u.id };
  }

  const nouvelAchat = (api = pdg, extra = {}) =>
    api.post("/api/achats", {
      fournisseurId: fournisseur.id,
      lignes: [
        { articleId: tissu.id, quantite: "10", prixUnitaire: "2500" },
        { articleId: bouton.id, quantite: "100", prixUnitaire: "50.50" },
      ],
      ...extra,
    });
  const ligneDe = (achat, articleId) => achat.lignes.find((l) => l.article.id === articleId);

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const ra = await creerAtelierEtAdmin({ nom: "Atelier Achats A" });
    const rb = await creerAtelierEtAdmin({ nom: "Atelier Achats B" });
    A = ra.atelier;
    B = rb.atelier;
    pdg = client(baseUrl);
    pdgB = client(baseUrl);
    assert.equal((await pdg.post("/api/auth/login", { identifiant: ra.identifiant, password: ra.password })).status, 200);
    assert.equal((await pdgB.post("/api/auth/login", { identifiant: rb.identifiant, password: rb.password })).status, 200);
    fournisseur = await prisma.fournisseur.create({ data: { atelierId: A.id, nom: `Tissus ${marque}` } });
    fournisseurB = await prisma.fournisseur.create({ data: { atelierId: B.id, nom: `Autre ${marque}` } });
    tissu = await prisma.articleStock.create({ data: { atelierId: A.id, nom: `Wax ${marque}`, unite: "METRE" } });
    bouton = await prisma.articleStock.create({ data: { atelierId: A.id, nom: `Boutons ${marque}`, unite: "PIECE" } });
    articleB = await prisma.articleStock.create({ data: { atelierId: B.id, nom: `Article B ${marque}`, unite: "PIECE" } });
    magasinier = await employe("magasinier", ["achats.recevoir"]);
    lecteur = await employe("lecteur", ["achats.lire"]);
    acheteur = await employe("acheteur", ["achats.ecrire"]); // sans depenses.ecrire
    comptable = await employe("comptable", ["achats.ecrire", "depenses.ecrire"]);
    sansDroit = await employe("sansdroit", ["stock.lire"]);
  });

  after(async () => {
    await arreterServeur(server);
    for (const a of [A, B]) {
      await prisma.journalSecurite.deleteMany({ where: { atelierId: a.id } });
      await supprimerAtelier(a.id);
    }
    await prisma.$disconnect();
  });

  describe("création", () => {
    it("crée un achat numéroté avec total calculé, réception et paiement initiaux", async () => {
      const r = await nouvelAchat();
      assert.equal(r.status, 201);
      assert.match(r.body.numero, /^ACH-\d{4}-\d{4}$/);
      assert.equal(r.body.statut, "COMMANDE");
      assert.equal(r.body.montantTotal, "30050"); // 10 × 2500 + 100 × 50,50
      assert.equal(r.body.statutReception, "AUCUNE");
      assert.equal(r.body.statutPaiement, "NON_PAYE");
      assert.equal(r.body.lignes.length, 2);
      assert.equal(ligneDe(r.body, tissu.id).quantiteRestante, "10");
      assert.equal(r.body.depense, null);
    });

    it("refuse : fournisseur ou article d'un autre atelier, archivés, doublon d'article, total trop grand, lignes vides, champ inconnu", async () => {
      assert.equal((await nouvelAchat(pdg, { fournisseurId: fournisseurB.id })).status, 404);
      assert.equal((await pdg.post("/api/achats", { fournisseurId: fournisseur.id, lignes: [{ articleId: articleB.id, quantite: "1", prixUnitaire: "1" }] })).status, 404);
      assert.equal((await pdg.post("/api/achats", { fournisseurId: fournisseur.id, lignes: [] })).status, 400);
      assert.equal((await pdg.post("/api/achats", { fournisseurId: fournisseur.id, lignes: [{ articleId: tissu.id, quantite: "1", prixUnitaire: "1" }, { articleId: tissu.id, quantite: "2", prixUnitaire: "1" }] })).status, 400);
      assert.equal((await pdg.post("/api/achats", { fournisseurId: fournisseur.id, lignes: [{ articleId: tissu.id, quantite: "1000", prixUnitaire: "9999999" }] })).status, 400);
      assert.equal((await pdg.post("/api/achats", { fournisseurId: fournisseur.id, lignes: [{ articleId: tissu.id, quantite: "-1", prixUnitaire: "1" }] })).status, 400);
      assert.equal((await nouvelAchat(pdg, { statut: "ANNULE" })).status, 400);
      assert.equal((await nouvelAchat(pdg, { atelierId: B.id })).status, 400);

      await prisma.fournisseur.update({ where: { id: fournisseur.id }, data: { archivedAt: new Date() } });
      assert.equal((await nouvelAchat()).status, 409);
      await prisma.fournisseur.update({ where: { id: fournisseur.id }, data: { archivedAt: null } });
      await prisma.articleStock.update({ where: { id: bouton.id }, data: { archivedAt: new Date() } });
      assert.equal((await nouvelAchat()).status, 409);
      await prisma.articleStock.update({ where: { id: bouton.id }, data: { archivedAt: null } });
    });

    it("l'idempotence évite un doublon sur double envoi", async () => {
      const avant = await prisma.achat.count({ where: { atelierId: A.id } });
      const cle = { "Idempotency-Key": `achat-${marque}` };
      const corps = { fournisseurId: fournisseur.id, lignes: [{ articleId: tissu.id, quantite: "1", prixUnitaire: "100" }] };
      const r1 = await pdg.post("/api/achats", corps, cle);
      const r2 = await pdg.post("/api/achats", corps, cle);
      assert.equal(r1.status, 201);
      assert.equal(r2.body.id, r1.body.id);
      assert.equal(await prisma.achat.count({ where: { atelierId: A.id } }), avant + 1);
    });
  });

  describe("réception → stock", () => {
    let achat;
    before(async () => {
      achat = (await nouvelAchat()).body;
    });

    it("une réception partielle crée l'entrée de stock exacte et laisse le reste attendu", async () => {
      const avant = await quantiteArticle(prisma, tissu.id);
      const r = await pdg.post(`/api/achats/${achat.id}/receptions`, { lignes: [{ ligneId: ligneDe(achat, tissu.id).id, quantite: "4" }] });
      assert.equal(r.status, 201);
      assert.equal(r.body.statutReception, "PARTIELLE");
      assert.equal(ligneDe(r.body, tissu.id).quantiteRestante, "6");
      assert.equal((await quantiteArticle(prisma, tissu.id)).minus(avant).toString(), "4");
      const mvt = await prisma.mouvementStock.findFirst({ where: { ligneAchatId: ligneDe(achat, tissu.id).id } });
      assert.equal(mvt.type, "ENTREE");
      assert.match(mvt.motif, /Réception achat ACH-/);
      // Visible dans l'historique du stock.
      const histo = await pdg.get(`/api/stock/${tissu.id}/mouvements`);
      assert.ok(histo.body.data.some((m) => m.id === mvt.id));
    });

    it("refuse de recevoir plus que le reste, sans aucun effet sur le stock", async () => {
      const avant = await quantiteArticle(prisma, tissu.id);
      const r = await pdg.post(`/api/achats/${achat.id}/receptions`, { lignes: [{ ligneId: ligneDe(achat, tissu.id).id, quantite: "6.01" }] });
      assert.equal(r.status, 409);
      assert.equal(r.body.details.quantiteRestante, "6");
      assert.equal((await quantiteArticle(prisma, tissu.id)).equals(avant), true);
    });

    it("une réception multi-lignes est atomique : une ligne invalide annule tout", async () => {
      const avantBouton = await quantiteArticle(prisma, bouton.id);
      const r = await pdg.post(`/api/achats/${achat.id}/receptions`, {
        lignes: [{ ligneId: ligneDe(achat, bouton.id).id, quantite: "50" }, { ligneId: ligneDe(achat, tissu.id).id, quantite: "99" }],
      });
      assert.equal(r.status, 409);
      assert.equal((await quantiteArticle(prisma, bouton.id)).equals(avantBouton), true);
      assert.equal((await prisma.ligneAchat.findUnique({ where: { id: ligneDe(achat, bouton.id).id } })).quantiteRecue.toString(), "0");
    });

    it("compléter la réception passe l'achat à COMPLETE ; plus rien à recevoir ensuite", async () => {
      const r = await pdg.post(`/api/achats/${achat.id}/receptions`, {
        lignes: [{ ligneId: ligneDe(achat, tissu.id).id, quantite: "6" }, { ligneId: ligneDe(achat, bouton.id).id, quantite: "100" }],
      });
      assert.equal(r.status, 201);
      assert.equal(r.body.statutReception, "COMPLETE");
      const encore = await pdg.post(`/api/achats/${achat.id}/receptions`, { lignes: [{ ligneId: ligneDe(achat, tissu.id).id, quantite: "0.01" }] });
      assert.equal(encore.status, 409);
    });

    it("réceptions simultanées : jamais plus que la quantité commandée ni de double entrée", async () => {
      const a = (await nouvelAchat()).body;
      const ligne = ligneDe(a, tissu.id);
      const avant = await quantiteArticle(prisma, tissu.id);
      const reponses = await Promise.all(Array.from({ length: 6 }, () => pdg.post(`/api/achats/${a.id}/receptions`, { lignes: [{ ligneId: ligne.id, quantite: "4" }] })));
      assert.equal(reponses.filter((r) => r.status === 201).length, 2); // 4 + 4 ≤ 10, le troisième dépasserait
      assert.equal(reponses.filter((r) => r.status === 409).length, 4);
      assert.equal((await quantiteArticle(prisma, tissu.id)).minus(avant).toString(), "8");
      assert.equal((await prisma.ligneAchat.findUnique({ where: { id: ligne.id } })).quantiteRecue.toString(), "8");
    });

    it("le CHECK en base interdit de dépasser la quantité commandée, même en écriture directe", async () => {
      const a = (await nouvelAchat()).body;
      await assert.rejects(prisma.ligneAchat.update({ where: { id: ligneDe(a, tissu.id).id }, data: { quantiteRecue: "10.01" } }));
    });

    it("la même requête rejouée avec la même clé d'idempotence ne double pas l'entrée", async () => {
      const a = (await nouvelAchat()).body;
      const avant = await quantiteArticle(prisma, tissu.id);
      const cle = { "Idempotency-Key": `recep-${marque}` };
      const corps = { lignes: [{ ligneId: ligneDe(a, tissu.id).id, quantite: "3" }] };
      assert.equal((await pdg.post(`/api/achats/${a.id}/receptions`, corps, cle)).status, 201);
      assert.equal((await pdg.post(`/api/achats/${a.id}/receptions`, corps, cle)).status, 201);
      assert.equal((await quantiteArticle(prisma, tissu.id)).minus(avant).toString(), "3");
    });
  });

  describe("paiement → dépense", () => {
    it("crée une dépense du montant total, liée, et rend l'achat PAYE ; pas de double paiement", async () => {
      const a = (await nouvelAchat()).body;
      const r = await pdg.post(`/api/achats/${a.id}/paiement`, {});
      assert.equal(r.status, 201);
      assert.equal(r.body.statutPaiement, "PAYE");
      const depense = await prisma.depense.findUnique({ where: { id: r.body.depense.id } });
      assert.equal(depense.montant.toString(), "30050");
      assert.equal(depense.categorie, "Achats fournisseurs");
      assert.equal(depense.atelierId, A.id);
      assert.match(depense.description, new RegExp(a.numero));
      assert.equal((await pdg.post(`/api/achats/${a.id}/paiement`, {})).status, 409);
      assert.equal(await prisma.depense.count({ where: { atelierId: A.id, description: { contains: a.numero } } }), 1);
      // La dépense apparaît dans le module Dépenses.
      const liste = await pdg.get(`/api/depenses?categorie=${encodeURIComponent("Achats fournisseurs")}`);
      assert.ok(liste.body.data.some((d) => d.id === depense.id));
    });

    it("paiements simultanés : une seule dépense", async () => {
      const a = (await nouvelAchat()).body;
      const reponses = await Promise.all(Array.from({ length: 5 }, () => pdg.post(`/api/achats/${a.id}/paiement`, {})));
      assert.equal(reponses.filter((r) => r.status === 201).length, 1);
      assert.equal(await prisma.depense.count({ where: { atelierId: A.id, description: { contains: a.numero } } }), 1);
    });

    it("annuler la dépense rend l'achat non payé ; un nouveau paiement est alors possible", async () => {
      const a = (await nouvelAchat()).body;
      const p1 = await pdg.post(`/api/achats/${a.id}/paiement`, {});
      assert.equal((await pdg.post(`/api/depenses/${p1.body.depense.id}/annuler`, { motif: "Erreur de saisie" })).status, 200);
      const apres = await pdg.get(`/api/achats/${a.id}`);
      assert.equal(apres.body.statutPaiement, "NON_PAYE");
      const p2 = await pdg.post(`/api/achats/${a.id}/paiement`, {});
      assert.equal(p2.status, 201);
      assert.notEqual(p2.body.depense.id, p1.body.depense.id);
      assert.equal((await pdg.get("/api/achats?paiement=paye")).body.data.some((x) => x.id === a.id), true);
      assert.equal((await pdg.get("/api/achats?paiement=nonpaye")).body.data.some((x) => x.id === a.id), false);
    });

    it("le paiement exige aussi depenses.ecrire", async () => {
      const a = (await nouvelAchat()).body;
      assert.equal((await acheteur.api.post(`/api/achats/${a.id}/paiement`, {})).status, 403);
      assert.equal((await comptable.api.post(`/api/achats/${a.id}/paiement`, {})).status, 201);
    });
  });

  describe("annulation", () => {
    it("annule un achat intact ; ensuite plus de réception, de paiement ni de modification", async () => {
      const a = (await nouvelAchat()).body;
      assert.equal((await pdg.post(`/api/achats/${a.id}/annuler`, { motif: "x" })).status, 400); // motif trop court
      const r = await pdg.post(`/api/achats/${a.id}/annuler`, { motif: "Fournisseur en rupture" });
      assert.equal(r.status, 200);
      assert.equal(r.body.statut, "ANNULE");
      assert.equal((await pdg.post(`/api/achats/${a.id}/annuler`, { motif: "encore" })).status, 409);
      assert.equal((await pdg.post(`/api/achats/${a.id}/receptions`, { lignes: [{ ligneId: ligneDe(a, tissu.id).id, quantite: "1" }] })).status, 409);
      assert.equal((await pdg.post(`/api/achats/${a.id}/paiement`, {})).status, 409);
      assert.equal((await pdg.patch(`/api/achats/${a.id}`, { notes: "x" })).status, 409);
      assert.equal(await prisma.achat.count({ where: { id: a.id } }), 1); // jamais supprimé
    });

    it("refuse d'annuler un achat reçu (même partiellement) ou payé", async () => {
      const recu = (await nouvelAchat()).body;
      await pdg.post(`/api/achats/${recu.id}/receptions`, { lignes: [{ ligneId: ligneDe(recu, tissu.id).id, quantite: "1" }] });
      assert.equal((await pdg.post(`/api/achats/${recu.id}/annuler`, { motif: "Trop tard" })).status, 409);
      const paye = (await nouvelAchat()).body;
      await pdg.post(`/api/achats/${paye.id}/paiement`, {});
      const r = await pdg.post(`/api/achats/${paye.id}/annuler`, { motif: "Déjà payé" });
      assert.equal(r.status, 409);
      assert.ok(r.body.details.depenseId);
    });
  });

  describe("liste, détail et modification", () => {
    it("filtre par réception, statut, fournisseur et recherche", async () => {
      const a = (await nouvelAchat(pdg, { notes: "pour la liste" })).body;
      assert.ok((await pdg.get("/api/achats?reception=attendu")).body.data.some((x) => x.id === a.id));
      assert.ok(!(await pdg.get("/api/achats?reception=complete")).body.data.some((x) => x.id === a.id));
      assert.ok((await pdg.get(`/api/achats?q=${a.numero}`)).body.data.some((x) => x.id === a.id));
      assert.ok((await pdg.get(`/api/achats?fournisseurId=${fournisseur.id}&statut=COMMANDE`)).body.data.some((x) => x.id === a.id));
      assert.equal((await pdg.get(`/api/achats?fournisseurId=${fournisseurB.id}`)).body.data.length, 0);
      assert.equal((await pdg.get("/api/achats?reception=nimporte")).status, 400);
    });

    it("modifie la date attendue et les notes seulement (les lignes sont refusées)", async () => {
      const a = (await nouvelAchat()).body;
      const r = await pdg.patch(`/api/achats/${a.id}`, { dateAttendue: "2027-01-15", notes: "Livraison au marché" });
      assert.equal(r.status, 200);
      assert.match(r.body.dateAttendue, /^2027-01-15/);
      assert.equal((await pdg.patch(`/api/achats/${a.id}`, { dateAttendue: null })).body.dateAttendue, null);
      assert.equal((await pdg.patch(`/api/achats/${a.id}`, { lignes: [] })).status, 400);
      assert.equal((await pdg.patch(`/api/achats/${a.id}`, {})).status, 400);
    });
  });

  describe("isolation entre ateliers", () => {
    it("l'autre atelier ne voit, ne reçoit, ne paie ni n'annule rien", async () => {
      const a = (await nouvelAchat()).body;
      assert.equal((await pdgB.get(`/api/achats/${a.id}`)).status, 404);
      assert.equal((await pdgB.patch(`/api/achats/${a.id}`, { notes: "x" })).status, 404);
      assert.equal((await pdgB.post(`/api/achats/${a.id}/receptions`, { lignes: [{ ligneId: ligneDe(a, tissu.id).id, quantite: "1" }] })).status, 404);
      assert.equal((await pdgB.post(`/api/achats/${a.id}/paiement`, {})).status, 404);
      assert.equal((await pdgB.post(`/api/achats/${a.id}/annuler`, { motif: "piratage" })).status, 404);
      assert.equal((await pdgB.get("/api/achats")).body.data.length, 0);
      assert.equal((await prisma.achat.findUnique({ where: { id: a.id } })).statut, "COMMANDE");
    });
  });

  describe("droits et masquage des prix", () => {
    it("un magasinier (achats.recevoir) consulte et réceptionne sans voir aucun prix ni montant", async () => {
      const a = (await nouvelAchat()).body;
      const detail = await magasinier.api.get(`/api/achats/${a.id}`);
      assert.equal(detail.status, 200);
      for (const cle of ["prixUnitaire", "montantTotal", "statutPaiement", "depense", "depenseId"]) assert.ok(!contientCle(detail.body, cle), cle);
      assert.equal(detail.body.lignes.length, 2); // quantités et articles visibles
      const liste = await magasinier.api.get("/api/achats");
      assert.ok(!contientCle(liste.body, "prixUnitaire") && !contientCle(liste.body, "montantTotal"));
      const rec = await magasinier.api.post(`/api/achats/${a.id}/receptions`, { lignes: [{ ligneId: ligneDe(a, tissu.id).id, quantite: "2" }] });
      assert.equal(rec.status, 201);
      assert.ok(!contientCle(rec.body, "prixUnitaire"));
      assert.equal(ligneDe(rec.body, tissu.id).quantiteRecue, "2");
      // …mais ne crée, ne modifie, n'annule ni ne paie.
      assert.equal((await magasinier.api.post("/api/achats", { fournisseurId: fournisseur.id, lignes: [{ articleId: tissu.id, quantite: "1", prixUnitaire: "1" }] })).status, 403);
      assert.equal((await magasinier.api.patch(`/api/achats/${a.id}`, { notes: "x" })).status, 403);
      assert.equal((await magasinier.api.post(`/api/achats/${a.id}/annuler`, { motif: "non autorisé" })).status, 403);
      assert.equal((await magasinier.api.post(`/api/achats/${a.id}/paiement`, {})).status, 403);
    });

    it("lecture seule : consulte (sans prix) mais ne réceptionne pas", async () => {
      const a = (await nouvelAchat()).body;
      assert.equal((await lecteur.api.get(`/api/achats/${a.id}`)).status, 200);
      assert.equal((await lecteur.api.post(`/api/achats/${a.id}/receptions`, { lignes: [{ ligneId: ligneDe(a, tissu.id).id, quantite: "1" }] })).status, 403);
    });

    it("achats.ecrire implique la vue des prix et la réception ; aucun droit : tout est refusé", async () => {
      const a = (await nouvelAchat()).body;
      const vue = await acheteur.api.get(`/api/achats/${a.id}`);
      assert.equal(vue.status, 200);
      assert.equal(vue.body.montantTotal, "30050");
      assert.equal((await acheteur.api.post(`/api/achats/${a.id}/receptions`, { lignes: [{ ligneId: ligneDe(a, tissu.id).id, quantite: "1" }] })).status, 201);
      assert.equal((await sansDroit.api.get("/api/achats")).status, 403);
      assert.equal((await sansDroit.api.post(`/api/achats/${a.id}/receptions`, { lignes: [{ ligneId: ligneDe(a, tissu.id).id, quantite: "1" }] })).status, 403);
      assert.equal((await client(baseUrl).get("/api/achats")).status, 401);
    });
  });
});
