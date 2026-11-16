// Sous-phase 3.1 — mouvements de stock simultanés. Contrat : docs/INVARIANTS.md (I7).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin } from "./helpers.js";
import { violationsStock, enParallele, repartition } from "./invariants.js";
import { MDP, nettoyerAtelier } from "./concurrence-helpers.js";

describe("Concurrence — mouvements de stock", () => {
  let server, baseUrl, atelier, admin, api;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    const cree = await creerAtelierEtAdmin({ nom: "Atelier Concurrence Stock", password: MDP });
    ({ atelier, admin } = cree);
    api = client(baseUrl);
    assert.equal((await api.post("/api/auth/login", { identifiant: cree.identifiant, password: MDP })).status, 200);
  });

  after(async () => {
    await arreterServeur(server);
    await nettoyerAtelier(atelier.id, [admin.id]);
    await prisma.$disconnect();
  });

  async function creerArticle(quantiteInitiale) {
    const r = await api.post("/api/stock", { nom: `Tissu ${Math.random().toString(36).slice(2, 8)}`, unite: "METRE", ...(quantiteInitiale ? { quantiteInitiale: String(quantiteInitiale) } : {}) });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  }
  const mouvement = (articleId, type, quantite) => api.post(`/api/stock/${articleId}/mouvements`, { type, quantite: String(quantite), motif: "Test concurrence" });
  const quantite = async (articleId) => Number((await api.get(`/api/stock/${articleId}`)).body.quantite);

  it("15 sorties de 1 simultanées sur un stock de 10 : exactement 10 réussissent, le stock tombe à 0, jamais négatif", async () => {
    const a = await creerArticle(10);
    const reponses = await enParallele(15, () => mouvement(a.id, "SORTIE", 1));
    assert.deepEqual(repartition(reponses), { 201: 10, 409: 5 });
    assert.equal(await quantite(a.id), 0);
    assert.deepEqual(await violationsStock(atelier.id), []);
  });

  it("6 sorties de 3 simultanées sur un stock de 10 : 3 réussissent, il reste 1", async () => {
    const a = await creerArticle(10);
    const reponses = await enParallele(6, () => mouvement(a.id, "SORTIE", 3));
    assert.deepEqual(repartition(reponses), { 201: 3, 409: 3 });
    assert.equal(await quantite(a.id), 1);
    assert.deepEqual(await violationsStock(atelier.id), []);
  });

  it("entrées et sorties mêlées sur un stock vide : le stock final est la différence exacte des succès et reste ≥ 0", async () => {
    const a = await creerArticle(0);
    const reponses = await enParallele(20, (i) => (i % 2 === 0 ? mouvement(a.id, "ENTREE", 2) : mouvement(a.id, "SORTIE", 2)));
    const entrees = reponses.filter((_, i) => i % 2 === 0);
    const sorties = reponses.filter((_, i) => i % 2 === 1);
    assert.deepEqual(repartition(entrees), { 201: 10 }, "une entrée ne doit jamais être refusée");
    for (const s of sorties) assert.ok([201, 409].includes(s.status), `statut inattendu ${s.status}`);
    const sortiesOk = sorties.filter((s) => s.status === 201).length;
    assert.equal(await quantite(a.id), 20 - 2 * sortiesOk);
    assert.ok((await quantite(a.id)) >= 0);
    assert.deepEqual(await violationsStock(atelier.id), []);
  });

  it("décimaux : 40 sorties de 0.25 simultanées sur un stock de 7.5 → exactement 30 réussissent, aucune dérive d'arrondi", async () => {
    const a = await creerArticle("7.5");
    const reponses = await enParallele(40, () => mouvement(a.id, "SORTIE", "0.25"));
    assert.deepEqual(repartition(reponses), { 201: 30, 409: 10 });
    assert.equal(await quantite(a.id), 0);
    assert.deepEqual(await violationsStock(atelier.id), []);
  });

  it("mouvements sur des articles différents en parallèle : aucune interférence", async () => {
    const articles = await Promise.all([1, 2, 3, 4].map(() => creerArticle(5)));
    const reponses = await enParallele(32, (i) => mouvement(articles[i % 4].id, "SORTIE", 1));
    assert.deepEqual(repartition(reponses), { 201: 20, 409: 12 });
    for (const a of articles) assert.equal(await quantite(a.id), 0);
    assert.deepEqual(await violationsStock(atelier.id), []);
  });

  it("archivage simultané avec des mouvements : aucun mouvement accepté sur un article archivé, stock jamais négatif", async () => {
    const a = await creerArticle(10);
    const [archivage, ...mvts] = await Promise.all([
      api.post(`/api/stock/${a.id}/archiver`, {}),
      ...Array.from({ length: 8 }, () => mouvement(a.id, "SORTIE", 1)),
    ]);
    assert.equal(archivage.status, 200);
    for (const m of mvts) assert.ok([201, 409].includes(m.status), `statut inattendu ${m.status}`);
    const apres = await mouvement(a.id, "SORTIE", 1);
    assert.equal(apres.status, 409);
    assert.deepEqual(await violationsStock(atelier.id), []);
  });

  it("une sortie supérieure au stock est refusée avec le détail des quantités", async () => {
    const a = await creerArticle(2);
    const r = await mouvement(a.id, "SORTIE", 3);
    assert.equal(r.status, 409);
    assert.equal(Number(r.body.details.quantiteDisponible), 2);
  });
});
