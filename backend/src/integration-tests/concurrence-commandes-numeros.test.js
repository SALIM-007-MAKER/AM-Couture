// Sous-phase 3.1 — créations de commandes, changements de statut, règles de séquencement des
// numéros. Contrat : docs/INVARIANTS.md (§2 R1–R8, I8).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { nextNumero } from "../lib/numero.js";
import { demarrerServeur, arreterServeur } from "./helpers.js";
import { toutesViolations, enParallele, repartition } from "./invariants.js";
import { preparerAtelier, creerCommandeApi, nettoyerAtelier } from "./concurrence-helpers.js";

const FORMAT_NUMERO = /^CMD-\d{4}-\d{4,}$/;

describe("Concurrence — créations de commandes et statuts", () => {
  let server, baseUrl, A, B;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    A = await preparerAtelier(baseUrl, "Atelier Concurrence Commandes A");
    B = await preparerAtelier(baseUrl, "Atelier Concurrence Commandes B");
  });

  after(async () => {
    await arreterServeur(server);
    await nettoyerAtelier(A.atelier.id, [A.admin.id]);
    await nettoyerAtelier(B.atelier.id, [B.admin.id]);
    await prisma.$disconnect();
  });

  const creer = (ctx, prix = "8000") =>
    ctx.api.post("/api/commandes", {
      clienteId: ctx.cliente.id,
      typeVetement: "ROBE",
      prixTotal: prix,
      dateLivraisonPrevue: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    });

  it("20 créations simultanées : 20 succès, numéros distincts et bien formés, un événement par commande", async () => {
    const reponses = await enParallele(20, () => creer(A));
    assert.deepEqual(repartition(reponses), { 201: 20 });
    const numeros = reponses.map((r) => r.body.numero);
    assert.equal(new Set(numeros).size, 20, "numéros dupliqués");
    for (const n of numeros) assert.match(n, FORMAT_NUMERO);
    assert.deepEqual(await toutesViolations(A.atelier.id), []);
  });

  it("deux ateliers qui créent simultanément : numéros distincts sur toute la plateforme (R1), données séparées", async () => {
    const reponses = await enParallele(20, (i) => creer(i % 2 === 0 ? A : B));
    assert.deepEqual(repartition(reponses), { 201: 20 });
    assert.equal(new Set(reponses.map((r) => r.body.numero)).size, 20);
    const chezA = await prisma.commande.count({ where: { atelierId: A.atelier.id, id: { in: reponses.filter((_, i) => i % 2 === 0).map((r) => r.body.id) } } });
    assert.equal(chezA, 10);
    // un ADMIN ne voit jamais les commandes de l'autre atelier
    const idsB = new Set(reponses.filter((_, i) => i % 2 === 1).map((r) => r.body.id));
    const listeA = await A.api.get("/api/commandes?pageSize=100");
    assert.equal(listeA.body.data.some((c) => idsB.has(c.id)), false);
    assert.deepEqual(await toutesViolations([A.atelier.id, B.atelier.id]), []);
  });

  it("[caractérisation 3.4, R5] numérotation globale : les numéros d'un atelier ne sont pas consécutifs", async () => {
    // COMPORTEMENT ACTUEL, connu : le compteur est partagé entre ateliers. Cette assertion sera
    // inversée par la sous-phase 3.4 (numérotation indépendante par atelier).
    const a1 = (await creer(A)).body.numero;
    await creer(B);
    const a2 = (await creer(A)).body.numero;
    const seq = (n) => Number(n.split("-")[2]);
    assert.ok(seq(a2) - seq(a1) >= 2, `${a1} puis ${a2} : numéros consécutifs alors que le compteur est partagé`);
  });

  it("10 demandes simultanées du même passage de statut : une seule réussit, un seul événement client", async () => {
    const c = await creerCommandeApi(A.api, A.cliente.id);
    const reponses = await enParallele(10, () => A.api.post(`/api/commandes/${c.id}/statut`, { statut: "EN_CONFECTION" }));
    assert.deepEqual(repartition(reponses), { 200: 1, 409: 9 });
    const evenements = await prisma.notificationClient.count({ where: { commandeId: c.id, type: "COMMANDE_STATUT_CHANGE" } });
    assert.equal(evenements, 1);
    assert.equal((await prisma.commande.findUnique({ where: { id: c.id } })).statut, "EN_CONFECTION");
  });

  it("annulation et passage en confection simultanés : l'état final est ANNULEE, chaque succès a son événement", async () => {
    const c = await creerCommandeApi(A.api, A.cliente.id);
    const reponses = await Promise.all([
      ...Array.from({ length: 5 }, () => A.api.post(`/api/commandes/${c.id}/statut`, { statut: "ANNULEE" })),
      ...Array.from({ length: 5 }, () => A.api.post(`/api/commandes/${c.id}/statut`, { statut: "EN_CONFECTION" })),
    ]);
    const annulees = reponses.slice(0, 5).filter((r) => r.status === 200).length;
    const confections = reponses.slice(5).filter((r) => r.status === 200).length;
    assert.equal(annulees, 1, "ANNULEE ne peut réussir qu'une fois");
    assert.ok(confections <= 1, "EN_CONFECTION ne peut réussir qu'une fois, et seulement avant l'annulation");
    for (const r of reponses) assert.ok([200, 409].includes(r.status), `statut inattendu ${r.status}`);
    assert.equal((await prisma.commande.findUnique({ where: { id: c.id } })).statut, "ANNULEE");
    const evenements = await prisma.notificationClient.count({
      where: { commandeId: c.id, type: { in: ["COMMANDE_STATUT_CHANGE", "COMMANDE_ANNULEE"] } },
    });
    assert.equal(evenements, annulees + confections);
  });

  it("passage direct à LIVREE refusé même sous concurrence (doit passer par une livraison)", async () => {
    const c = await creerCommandeApi(A.api, A.cliente.id, { statut: "TERMINEE" });
    const reponses = await enParallele(6, () => A.api.post(`/api/commandes/${c.id}/statut`, { statut: "LIVREE" }));
    assert.deepEqual(repartition(reponses), { 409: 6 });
    assert.deepEqual(await toutesViolations(A.atelier.id), []);
  });
});

describe("Règles de séquencement des numéros (docs/INVARIANTS.md §2)", () => {
  // Préfixe dédié : un compteur isolé, aucune interférence avec les autres tests ni avec
  // les vrais compteurs CMD/REC. Nettoyé en fin de describe.
  const prefixe = (suffixe) => `TST${process.pid}${suffixe}`;
  const annee = new Date().getUTCFullYear();
  const idCompteur = (p) => `${p}-${annee}`;

  after(async () => {
    await prisma.counter.deleteMany({ where: { id: { startsWith: `TST${process.pid}` } } });
    await prisma.$disconnect();
  });

  const sequence = (numero) => Number(numero.split("-")[2]);

  it("R1 + R2 : 50 attributions simultanées → 50 numéros distincts formant exactement la suite 1…50", async () => {
    const p = prefixe("A");
    const numeros = await enParallele(50, () => prisma.$transaction((tx) => nextNumero(tx, p)));
    assert.equal(new Set(numeros).size, 50, "R1 : doublons");
    const seqs = numeros.map(sequence).sort((a, b) => a - b);
    assert.deepEqual(seqs, Array.from({ length: 50 }, (_, i) => i + 1), "R2 : trou ou dépassement dans la suite");
  });

  it("R3 : une transaction annulée ne consomme aucun numéro (10 succès mêlés à 10 échecs → suite 1…10)", async () => {
    const p = prefixe("B");
    const resultats = await enParallele(20, (i) =>
      prisma
        .$transaction(async (tx) => {
          const n = await nextNumero(tx, p);
          if (i % 2 === 1) throw new Error("échec simulé après attribution du numéro");
          return n;
        })
        .catch(() => null),
    );
    const reussis = resultats.filter(Boolean);
    assert.equal(reussis.length, 10);
    const seqs = reussis.map(sequence).sort((a, b) => a - b);
    assert.deepEqual(seqs, Array.from({ length: 10 }, (_, i) => i + 1), "un numéro a été brûlé par un rollback");
    const compteur = await prisma.counter.findUnique({ where: { id: idCompteur(p) } });
    assert.equal(compteur.valeur, 10, "le compteur ne doit refléter que les numéros engagés");
  });

  it("R4 : deux préfixes ont des compteurs indépendants", async () => {
    const p1 = prefixe("C");
    const p2 = prefixe("D");
    const [a, b] = await Promise.all([
      enParallele(5, () => prisma.$transaction((tx) => nextNumero(tx, p1))),
      enParallele(7, () => prisma.$transaction((tx) => nextNumero(tx, p2))),
    ]);
    assert.deepEqual(a.map(sequence).sort((x, y) => x - y), [1, 2, 3, 4, 5]);
    assert.deepEqual(b.map(sequence).sort((x, y) => x - y), [1, 2, 3, 4, 5, 6, 7]);
  });

  it("une transaction séquentielle après des échecs reprend à la valeur suivante sans trou", async () => {
    const p = prefixe("E");
    assert.equal(sequence(await prisma.$transaction((tx) => nextNumero(tx, p))), 1);
    await prisma.$transaction(async (tx) => { await nextNumero(tx, p); throw new Error("x"); }).catch(() => {});
    await prisma.$transaction(async (tx) => { await nextNumero(tx, p); throw new Error("x"); }).catch(() => {});
    assert.equal(sequence(await prisma.$transaction((tx) => nextNumero(tx, p))), 2);
  });

  it("R6 (NON garantie) : on ne suppose pas que l'ordre numérique égale l'ordre d'arrivée — seule l'unicité est affirmée", async () => {
    // Test volontairement limité à ce qui EST garanti : même avec des délais inégaux entre
    // l'attribution et la validation, les numéros restent uniques et sans trou.
    const p = prefixe("F");
    const numeros = await enParallele(15, (i) =>
      prisma.$transaction(async (tx) => {
        const n = await nextNumero(tx, p);
        await new Promise((r) => setTimeout(r, (i * 7) % 23));
        return n;
      }),
    );
    assert.equal(new Set(numeros).size, 15);
    assert.deepEqual(numeros.map(sequence).sort((a, b) => a - b), Array.from({ length: 15 }, (_, i) => i + 1));
  });
});
