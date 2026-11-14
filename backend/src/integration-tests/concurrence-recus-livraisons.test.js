// Sous-phase 3.1 — reçus et livraisons simultanés. Contrat : docs/INVARIANTS.md (I3–I6, I8).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur } from "./helpers.js";
import { toutesViolations, violationsFinancieres, enParallele, repartition } from "./invariants.js";
import { preparerAtelier, creerCommandeApi, payer, totalPaye, nettoyerAtelier } from "./concurrence-helpers.js";

describe("Concurrence — reçus et livraisons", () => {
  let server, baseUrl, ctx;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    ctx = await preparerAtelier(baseUrl, "Atelier Concurrence Reçus Livraisons");
  });

  after(async () => {
    await arreterServeur(server);
    await nettoyerAtelier(ctx.atelier.id, [ctx.admin.id]);
    await prisma.$disconnect();
  });

  const livrer = (cid, corps = {}) => ctx.api.post(`/api/commandes/${cid}/livraisons`, corps);

  // ───────────── Reçus
  it("10 reçus simultanés pour le même paiement : un seul est émis, les autres reçoivent 409", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id);
    const p = (await payer(ctx.api, c.id, 4000)).body;
    const reponses = await enParallele(10, () => ctx.api.post(`/api/commandes/${c.id}/paiements/${p.id}/recu`, {}));
    assert.deepEqual(repartition(reponses), { 201: 1, 409: 9 });
    assert.equal(await prisma.recu.count({ where: { paiementId: p.id } }), 1);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("10 reçus de commande simultanés : tous émis avec des numéros distincts et un montant cohérent", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id);
    await payer(ctx.api, c.id, 4000);
    const reponses = await enParallele(10, () => ctx.api.post(`/api/commandes/${c.id}/recus`, {}));
    assert.deepEqual(repartition(reponses), { 201: 10 });
    assert.equal(new Set(reponses.map((r) => r.body.numero)).size, 10, "numéros de reçu dupliqués");
    for (const r of reponses) assert.equal(Number(r.body.montantPaye), 4000);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("reçus de commande pendant un nouveau paiement : chaque reçu porte un total réellement atteint (4000 ou 6000)", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id);
    await payer(ctx.api, c.id, 4000);
    const [paiement, ...recus] = await Promise.all([
      payer(ctx.api, c.id, 2000),
      ...Array.from({ length: 8 }, () => ctx.api.post(`/api/commandes/${c.id}/recus`, {})),
    ]);
    assert.equal(paiement.status, 201);
    for (const r of recus) {
      assert.equal(r.status, 201);
      assert.ok([4000, 6000].includes(Number(r.body.montantPaye)), `montant de reçu jamais atteint : ${r.body.montantPaye}`);
    }
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("un paiement qui a déjà un reçu ne peut plus être annulé (règle séquentielle)", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id);
    const p = (await payer(ctx.api, c.id, 3000)).body;
    assert.equal((await ctx.api.post(`/api/commandes/${c.id}/paiements/${p.id}/recu`, {})).status, 201);
    const r = await ctx.api.post(`/api/commandes/${c.id}/paiements/${p.id}/annuler`, { motif: "Test annulation" });
    assert.equal(r.status, 409);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  // Défaut CONFIRMÉ (mesuré : un reçu sur paiement annulé à chaque tour) : l'annulation vérifie
  // « pas de reçu » puis annule, sans verrou commun avec l'émission du reçu. Marqué `todo` :
  // décrit le comportement ATTENDU, échoue tant que l'écart n'est pas corrigé (sous-phase 3.3),
  // sans faire échouer la CI. Atelier DÉDIÉ : les données incohérentes qu'il produit ne doivent
  // pas contaminer les vérifications des autres scénarios.
  it("[écart connu → 3.3] annulation de paiement et émission de reçu simultanées : jamais de reçu sur un paiement annulé", { todo: "défaut confirmé, voir docs/INVARIANTS.md §4" }, async () => {
    const iso = await preparerAtelier(baseUrl, "Atelier Course Reçu Annulation");
    try {
      const c = await creerCommandeApi(iso.api, iso.cliente.id, { prixTotal: "100000" });
      const TOURS = 25;
      for (let i = 0; i < TOURS; i++) {
        const p = (await payer(iso.api, c.id, 1000)).body;
        await Promise.all([
          iso.api.post(`/api/commandes/${c.id}/paiements/${p.id}/annuler`, { motif: "Course annulation/reçu" }),
          iso.api.post(`/api/commandes/${c.id}/paiements/${p.id}/recu`, {}),
        ]);
      }
      const violations = (await violationsFinancieres(iso.atelier.id)).filter((v) => v.startsWith("I5"));
      assert.deepEqual(violations, [], `${violations.length} reçu(s) sur paiement annulé sur ${TOURS} tours`);
    } finally {
      await nettoyerAtelier(iso.atelier.id, [iso.admin.id]);
    }
  });

  // ───────────── Livraisons
  it("10 livraisons simultanées de la même commande : une seule réussit, statut LIVREE, un seul événement", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { statut: "TERMINEE" });
    await payer(ctx.api, c.id, 10000);
    const reponses = await enParallele(10, () => livrer(c.id));
    assert.deepEqual(repartition(reponses), { 201: 1, 409: 9 });
    assert.equal(await prisma.livraison.count({ where: { commandeId: c.id, annuleAt: null } }), 1);
    assert.equal((await prisma.commande.findUnique({ where: { id: c.id } })).statut, "LIVREE");
    assert.equal(await prisma.notificationClient.count({ where: { commandeId: c.id, type: "LIVRAISON_ENREGISTREE" } }), 1);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("livraison avec paiement final, 6 fois en parallèle : une seule livraison et un seul paiement final", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { statut: "TERMINEE" });
    await payer(ctx.api, c.id, 4000);
    const reponses = await enParallele(6, () => livrer(c.id, { paiementFinal: { montant: "6000", mode: "ESPECES" } }));
    assert.deepEqual(repartition(reponses), { 201: 1, 409: 5 });
    assert.equal(await totalPaye(c.id), 10000);
    assert.equal(await prisma.paiement.count({ where: { commandeId: c.id } }), 2, "paiement final dupliqué");
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("paiements et livraisons-avec-paiement-final se disputant le dernier solde : un seul gagne, jamais de surpaiement", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { statut: "TERMINEE" });
    await payer(ctx.api, c.id, 4000);
    const reponses = await Promise.all([
      ...Array.from({ length: 5 }, () => payer(ctx.api, c.id, 6000)),
      ...Array.from({ length: 5 }, () => livrer(c.id, { paiementFinal: { montant: "6000", mode: "ESPECES" } })),
    ]);
    const gagnants = reponses.filter((r) => r.status === 201).length;
    assert.equal(gagnants, 1, `répartition : ${JSON.stringify(repartition(reponses))}`);
    for (const r of reponses) assert.ok([201, 409].includes(r.status), `statut inattendu ${r.status}`);
    assert.equal(await totalPaye(c.id), 10000);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("annulation de la même livraison 8 fois en parallèle : une seule réussit, la commande redevient TERMINEE", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { statut: "TERMINEE" });
    const l = (await livrer(c.id)).body;
    const reponses = await enParallele(8, () =>
      ctx.api.post(`/api/commandes/${c.id}/livraisons/${l.id}/annuler`, { motif: "Erreur de saisie" }),
    );
    assert.deepEqual(repartition(reponses), { 200: 1, 409: 7 });
    assert.equal((await prisma.commande.findUnique({ where: { id: c.id } })).statut, "TERMINEE");
    assert.equal(await prisma.livraison.count({ where: { commandeId: c.id } }), 1, "l'historique est conservé");
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("annulation puis re-livraison simultanées : jamais deux livraisons actives", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id, { statut: "TERMINEE" });
    const l = (await livrer(c.id)).body;
    await Promise.all([
      ctx.api.post(`/api/commandes/${c.id}/livraisons/${l.id}/annuler`, { motif: "Erreur de saisie" }),
      livrer(c.id),
      livrer(c.id),
    ]);
    assert.ok((await prisma.livraison.count({ where: { commandeId: c.id, annuleAt: null } })) <= 1);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });

  it("livraison depuis un statut non terminé refusée, y compris en parallèle", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id);
    const reponses = await enParallele(5, () => livrer(c.id));
    assert.deepEqual(repartition(reponses), { 409: 5 });
    assert.equal(await prisma.livraison.count({ where: { commandeId: c.id } }), 0);
  });
});
