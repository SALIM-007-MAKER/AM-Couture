// Sous-phase 3.1 — paiements simultanés. Contrat : docs/INVARIANTS.md (I1, I2, I8).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur } from "./helpers.js";
import { toutesViolations, enParallele, repartition } from "./invariants.js";
import { preparerAtelier, creerCommandeApi, payer, totalPaye, nettoyerAtelier } from "./concurrence-helpers.js";

describe("Concurrence — paiements", () => {
  let server, baseUrl, ctx;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    ctx = await preparerAtelier(baseUrl, "Atelier Concurrence Paiements");
  });

  after(async () => {
    await arreterServeur(server);
    await nettoyerAtelier(ctx.atelier.id, [ctx.admin.id]);
    await prisma.$disconnect();
  });

  it("10 paiements de 3000 simultanés sur 10000 : exactement 3 réussissent, 7 reçoivent 409, jamais de 5xx", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { prixTotal: "10000" });
    const reponses = await enParallele(10, () => payer(ctx.api, c.id, 3000));
    assert.deepEqual(repartition(reponses), { 201: 3, 409: 7 });
    assert.equal(await totalPaye(c.id), 9000);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("8 paiements de 2500 simultanés sur 10000 : 4 réussissent, la commande est exactement soldée", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { prixTotal: "10000" });
    const reponses = await enParallele(8, () => payer(ctx.api, c.id, 2500));
    assert.deepEqual(repartition(reponses), { 201: 4, 409: 4 });
    assert.equal(await totalPaye(c.id), 10000);
    const detail = await ctx.api.get(`/api/commandes/${c.id}`);
    assert.equal(detail.body.statutPaiement, "PAYE");
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("montants hétérogènes simultanés : le total ne dépasse jamais le prix, aucune erreur serveur", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { prixTotal: "10000" });
    const montants = [6000, 5000, 4000, 3000, 2000, 1000, 7000, 500];
    const reponses = await enParallele(montants.length, (i) => payer(ctx.api, c.id, montants[i]));
    const rep = repartition(reponses);
    assert.equal(Object.keys(rep).every((s) => s === "201" || s === "409"), true, `statuts inattendus : ${JSON.stringify(rep)}`);
    assert.ok((rep[201] ?? 0) >= 1);
    assert.ok((await totalPaye(c.id)) <= 10000);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("charge élevée : 30 paiements de 100 simultanés sur 1000 → 10 réussissent, aucun 5xx ni blocage", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { prixTotal: "1000" });
    const t0 = Date.now();
    const reponses = await enParallele(30, () => payer(ctx.api, c.id, 100));
    const rep = repartition(reponses);
    assert.deepEqual(rep, { 201: 10, 409: 20 }, `répartition : ${JSON.stringify(rep)} en ${Date.now() - t0} ms`);
    assert.equal(await totalPaye(c.id), 1000);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("annulation du même paiement 8 fois en parallèle : une seule réussit, les autres reçoivent 409", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { prixTotal: "10000" });
    const p = (await payer(ctx.api, c.id, 4000)).body;
    const reponses = await enParallele(8, () =>
      ctx.api.post(`/api/commandes/${c.id}/paiements/${p.id}/annuler`, { motif: "Erreur de saisie" }),
    );
    assert.deepEqual(repartition(reponses), { 200: 1, 409: 7 });
    assert.equal(await totalPaye(c.id), 0);
    // l'historique est conservé : le paiement annulé existe toujours, marqué annulé
    const garde = await prisma.paiement.findUnique({ where: { id: p.id } });
    assert.ok(garde.annuleAt);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("paiement et annulation d'un autre paiement simultanés : le total reste cohérent", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { prixTotal: "10000" });
    const p1 = (await payer(ctx.api, c.id, 6000)).body;
    const [annulation, nouveau] = await Promise.all([
      ctx.api.post(`/api/commandes/${c.id}/paiements/${p1.id}/annuler`, { motif: "Erreur de saisie" }),
      payer(ctx.api, c.id, 4000),
    ]);
    assert.equal(annulation.status, 200);
    assert.equal(nouveau.status, 201);
    assert.equal(await totalPaye(c.id), 4000);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("paiements sur des commandes différentes en parallèle : aucune interférence (verrou par commande)", async () => {
    const commandes = await Promise.all([1, 2, 3, 4, 5].map(() => creerCommandeApi(ctx.api, ctx.cliente.id, { prixTotal: "5000" })));
    const reponses = await enParallele(commandes.length * 2, (i) => payer(ctx.api, commandes[i % commandes.length].id, 2500));
    assert.deepEqual(repartition(reponses), { 201: 10 });
    for (const c of commandes) assert.equal(await totalPaye(c.id), 5000);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("sans en-tête Idempotency-Key, une même requête répétée crée deux paiements (comportement conservé ; protégé avec une clé)", async () => {
    // Depuis la 3.3, l'idempotence est OPTIONNELLE : envoyée avec l'en-tête Idempotency-Key, la requête
    // répétée est rejouée (voir idempotence.test.js). Sans en-tête, le comportement historique est inchangé.
    // L'interface ne transmet pas encore de clé : câblage prévu en sous-phase 3.6.
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { prixTotal: "10000" });
    const r1 = await payer(ctx.api, c.id, 3000);
    const r2 = await payer(ctx.api, c.id, 3000);
    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.notEqual(r1.body.id, r2.body.id);
    assert.equal(await totalPaye(c.id), 6000);
  });
  it("paiement refusé sur commande annulée, y compris quand l'annulation est simultanée", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { prixTotal: "10000" });
    const [statut, ...paiements] = await Promise.all([
      ctx.api.post(`/api/commandes/${c.id}/statut`, { statut: "ANNULEE" }),
      ...Array.from({ length: 5 }, () => payer(ctx.api, c.id, 1000)),
    ]);
    assert.equal(statut.status, 200);
    for (const p of paiements) assert.ok([201, 409].includes(p.status), `statut inattendu ${p.status}`);
    // Les paiements acceptés avant l'annulation sont conservés ; aucun n'est accepté après.
    const apres = await payer(ctx.api, c.id, 1000);
    assert.equal(apres.status, 409);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });
});
