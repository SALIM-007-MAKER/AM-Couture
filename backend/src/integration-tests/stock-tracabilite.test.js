// Stock : chaque mouvement est traçable (auteur, origine, motif), les sorties sont manuelles, justifiées et bornées par le
// stock disponible, rien n'est enregistré deux fois, et l'historique est complet et en lecture seule.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { quantiteArticle } from "../lib/stock.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";
import { enParallele, repartition } from "./invariants.js";

const marque = `${process.pid}-${Date.now()}`;
const H = (cle) => ({ "Idempotency-Key": cle });

describe("Stock — traçabilité, sorties manuelles et réceptions d'achats", () => {
  let server, baseUrl, atelier, admin, pdg, fournisseur;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const compte = await creerAtelierEtAdmin({ nom: "Atelier Stock Trace" });
    ({ atelier, admin } = compte);
    pdg = client(baseUrl);
    assert.equal((await pdg.post("/api/auth/login", { identifiant: compte.identifiant, password: compte.password })).status, 200);
    fournisseur = await prisma.fournisseur.create({ data: { atelierId: atelier.id, nom: `Fournisseur ${marque}` } });
  });

  after(async () => {
    await arreterServeur(server);
    await prisma.journalSecurite.deleteMany({ where: { atelierId: atelier.id } });
    await supprimerAtelier(atelier.id);
    await prisma.$disconnect();
  });

  let n = 0;
  async function creerArticle(quantiteInitiale) {
    const r = await pdg.post("/api/stock", { nom: `Tissu ${marque}-${++n}`, unite: "METRE", ...(quantiteInitiale ? { quantiteInitiale: String(quantiteInitiale) } : {}) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  }
  const sortie = (articleId, quantite, motif = "Robe de test", cle) =>
    pdg.post(`/api/stock/${articleId}/mouvements`, { type: "SORTIE", quantite: String(quantite), ...(motif === null ? {} : { motif }) }, cle ? H(cle) : undefined);
  const nbMouvements = (articleId) => prisma.mouvementStock.count({ where: { articleId } });

  describe("traçabilité", () => {
    it("le stock initial est tracé : origine STOCK_INITIAL et auteur", async () => {
      const a = await creerArticle(10);
      const m = await prisma.mouvementStock.findFirst({ where: { articleId: a.id } });
      assert.equal(m.source, "STOCK_INITIAL");
      assert.equal(m.creeParId, admin.id);
    });

    it("une sortie manuelle enregistre origine MANUEL, auteur et motif, et apparaît dans l'historique avec l'auteur", async () => {
      const a = await creerArticle(10);
      const r = await sortie(a.id, 3, "Robe de Mme Diop");
      assert.equal(r.status, 201);
      assert.equal(r.body.source, "MANUEL");
      assert.equal(r.body.creeParId, admin.id);
      assert.equal(r.body.quantiteApres, "7");
      const histo = await pdg.get(`/api/stock/${a.id}/mouvements`);
      const ligne = histo.body.data.find((m) => m.id === r.body.id);
      assert.equal(ligne.motif, "Robe de Mme Diop");
      assert.equal(ligne.creePar.identifiant, admin.identifiant);
      assert.ok(!JSON.stringify(histo.body).includes("passwordHash"), "aucun secret du compte dans l'historique");
    });
  });

  describe("sorties manuelles : motif obligatoire", () => {
    it("sortie sans motif, ou avec un motif vide : refusée en 400, aucun mouvement ni changement de stock", async () => {
      const a = await creerArticle(10);
      const avant = await nbMouvements(a.id);
      for (const motif of [null, "", "   "]) {
        const r = await sortie(a.id, 1, motif);
        assert.equal(r.status, 400, `motif ${JSON.stringify(motif)}`);
        assert.ok(r.body.details?.motif, "l'erreur désigne le champ motif");
      }
      assert.equal(await nbMouvements(a.id), avant);
      assert.equal((await quantiteArticle(prisma, a.id)).toString(), "10");
    });

    it("une entrée manuelle peut rester sans motif (seule la sortie l'exige)", async () => {
      const a = await creerArticle();
      const r = await pdg.post(`/api/stock/${a.id}/mouvements`, { type: "ENTREE", quantite: "5" });
      assert.equal(r.status, 201);
      assert.equal(r.body.source, "MANUEL");
    });
  });

  describe("sorties : jamais au-delà du stock", () => {
    it("une sortie supérieure au stock est refusée en 409 avec les quantités, sans rien enregistrer", async () => {
      const a = await creerArticle(5);
      const avant = await nbMouvements(a.id);
      const r = await sortie(a.id, 5.01);
      assert.equal(r.status, 409);
      assert.equal(r.body.details.quantiteDisponible, "5");
      assert.equal(await nbMouvements(a.id), avant);
    });

    it("sortir exactement tout le stock est permis, et le stock tombe à 0", async () => {
      const a = await creerArticle(5);
      assert.equal((await sortie(a.id, 5)).status, 201);
      assert.equal((await quantiteArticle(prisma, a.id)).toString(), "0");
      assert.equal((await sortie(a.id, 0.01)).status, 409);
    });
  });

  describe("pas de double mouvement", () => {
    it("même requête de sortie envoyée 10 fois en parallèle avec la même clé : un seul mouvement", async () => {
      const a = await creerArticle(10);
      const cle = `sortie-${marque}-${a.id}`;
      const reponses = await enParallele(10, () => sortie(a.id, 2, "Double clic", cle));
      const ok = reponses.filter((r) => r.status === 201 || r.status === 200);
      assert.ok(ok.length >= 1, JSON.stringify(repartition(reponses)));
      assert.equal(await prisma.mouvementStock.count({ where: { articleId: a.id, type: "SORTIE" } }), 1);
      assert.equal((await quantiteArticle(prisma, a.id)).toString(), "8");
    });

    it("même clé, quantité différente : refusée (422), le premier mouvement reste seul", async () => {
      const a = await creerArticle(10);
      const cle = `sortie-diff-${marque}-${a.id}`;
      assert.equal((await sortie(a.id, 1, "Premier", cle)).status, 201);
      assert.equal((await sortie(a.id, 4, "Premier", cle)).status, 422);
      assert.equal((await quantiteArticle(prisma, a.id)).toString(), "9");
    });
  });

  describe("réception d'un achat → entrée de stock", () => {
    async function achatDe(article, quantite = "10") {
      const r = await pdg.post("/api/achats", { fournisseurId: fournisseur.id, lignes: [{ articleId: article.id, quantite, prixUnitaire: "100" }] });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      return { achat: r.body, ligneId: r.body.lignes[0].id };
    }

    it("la réception crée une entrée RECEPTION_ACHAT liée à la ligne, avec l'auteur", async () => {
      const a = await creerArticle();
      const { achat, ligneId } = await achatDe(a);
      assert.equal((await pdg.post(`/api/achats/${achat.id}/receptions`, { lignes: [{ ligneId, quantite: "4" }] })).status, 201);
      const m = await prisma.mouvementStock.findFirst({ where: { articleId: a.id } });
      assert.equal(m.type, "ENTREE");
      assert.equal(m.source, "RECEPTION_ACHAT");
      assert.equal(m.ligneAchatId, ligneId);
      assert.equal(m.creeParId, admin.id);
      assert.equal((await quantiteArticle(prisma, a.id)).toString(), "4");
    });

    it("la même réception rejouée avec la même clé n'ajoute qu'une seule entrée", async () => {
      const a = await creerArticle();
      const { achat, ligneId } = await achatDe(a);
      const cle = `reception-${marque}-${achat.id}`;
      const corps = { lignes: [{ ligneId, quantite: "6" }] };
      const r1 = await pdg.post(`/api/achats/${achat.id}/receptions`, corps, H(cle));
      const r2 = await pdg.post(`/api/achats/${achat.id}/receptions`, corps, H(cle));
      assert.equal(r1.status, 201);
      assert.equal(r2.status, 201);
      assert.equal(await prisma.mouvementStock.count({ where: { articleId: a.id } }), 1);
      assert.equal((await quantiteArticle(prisma, a.id)).toString(), "6");
    });

    it("10 réceptions simultanées de la quantité entière : une seule entrée, jamais plus que la commande", async () => {
      const a = await creerArticle();
      const { achat, ligneId } = await achatDe(a, "10");
      const reponses = await enParallele(10, () => pdg.post(`/api/achats/${achat.id}/receptions`, { lignes: [{ ligneId, quantite: "10" }] }));
      assert.equal(reponses.filter((r) => r.status === 201).length, 1, JSON.stringify(repartition(reponses)));
      assert.equal((await quantiteArticle(prisma, a.id)).toString(), "10");
    });
  });

  describe("cohérence imposée par la base, même en écriture directe", () => {
    it("une sortie sans motif est refusée par la base", async () => {
      const a = await creerArticle(5);
      await assert.rejects(() => prisma.mouvementStock.create({ data: { articleId: a.id, type: "SORTIE", quantite: "1" } }), /MouvementStock_sortie_motif_chk|check constraint/i);
      await assert.rejects(() => prisma.mouvementStock.create({ data: { articleId: a.id, type: "SORTIE", quantite: "1", motif: "  " } }), /MouvementStock_sortie_motif_chk|check constraint/i);
    });

    it("une réception d'achat sans ligne d'achat, ou une ligne d'achat sans origine RECEPTION_ACHAT, est refusée par la base", async () => {
      const a = await creerArticle();
      const { ligneId } = await (async () => {
        const r = await pdg.post("/api/achats", { fournisseurId: fournisseur.id, lignes: [{ articleId: a.id, quantite: "1", prixUnitaire: "1" }] });
        return { ligneId: r.body.lignes[0].id };
      })();
      await assert.rejects(() => prisma.mouvementStock.create({ data: { articleId: a.id, type: "ENTREE", quantite: "1", source: "RECEPTION_ACHAT" } }), /source_coherente_chk|check constraint/i);
      await assert.rejects(() => prisma.mouvementStock.create({ data: { articleId: a.id, type: "ENTREE", quantite: "1", source: "MANUEL", ligneAchatId: ligneId } }), /source_coherente_chk|check constraint/i);
    });
  });

  describe("historique complet et en lecture seule", () => {
    it("l'historique liste toutes les entrées et sorties ; la quantité en est exactement la différence", async () => {
      const a = await creerArticle(20);
      await sortie(a.id, 5, "Robe A");
      await pdg.post(`/api/stock/${a.id}/mouvements`, { type: "ENTREE", quantite: "2", motif: "Retour de chute" });
      await sortie(a.id, 1.5, "Robe B");
      const histo = await pdg.get(`/api/stock/${a.id}/mouvements?pageSize=100`);
      assert.equal(histo.body.meta.total, 4);
      const somme = histo.body.data.reduce((s, m) => s + (m.type === "ENTREE" ? 1 : -1) * Number(m.quantite), 0);
      assert.equal(somme, 15.5);
      assert.equal((await quantiteArticle(prisma, a.id)).toString(), "15.5");
    });

    it("aucune route ne permet de modifier ni de supprimer un mouvement", async () => {
      const a = await creerArticle(5);
      const mvt = await prisma.mouvementStock.findFirst({ where: { articleId: a.id } });
      for (const methode of ["patch", "put", "delete"]) {
        const r = await pdg[methode](`/api/stock/${a.id}/mouvements/${mvt.id}`, methode === "delete" ? undefined : { quantite: "99" });
        assert.ok(r.status === 404 || r.status === 405, `${methode} : HTTP ${r.status}`);
      }
      assert.equal(Number((await prisma.mouvementStock.findUnique({ where: { id: mvt.id } })).quantite), 5);
    });

    it("l'historique d'un article n'est pas lisible depuis un autre atelier", async () => {
      const a = await creerArticle(5);
      const autre = await creerAtelierEtAdmin({ nom: "Atelier Stock Autre" });
      const api = client(baseUrl);
      assert.equal((await api.post("/api/auth/login", { identifiant: autre.identifiant, password: autre.password })).status, 200);
      assert.equal((await api.get(`/api/stock/${a.id}/mouvements`)).status, 404);
      assert.equal((await api.post(`/api/stock/${a.id}/mouvements`, { type: "SORTIE", quantite: "1", motif: "Intrus" })).status, 404);
      await supprimerAtelier(autre.atelier.id);
    });
  });
});
