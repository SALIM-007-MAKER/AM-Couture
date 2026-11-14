// Sous-phase 3.1 — créations de comptes simultanées (invitations, inscriptions) et identité de
// connexion. Les tests `todo` décrivent le comportement ATTENDU ; ils échouent tant que l'écart
// n'est pas corrigé et ne font pas échouer la CI (voir docs/INVARIANTS.md §4).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerCliente } from "./helpers.js";
import { enParallele, repartition } from "./invariants.js";
import { preparerAtelier, nettoyerAtelier } from "./concurrence-helpers.js";

describe("Concurrence — comptes (invitations et inscriptions)", () => {
  let server, baseUrl, A, B;
  const telephoneUnique = (n) => `77${String(process.pid).slice(-4)}${String(Date.now()).slice(-6)}${n}`;
  const emailsCrees = [];

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    A = await preparerAtelier(baseUrl, "Atelier Concurrence Comptes A");
    B = await preparerAtelier(baseUrl, "Atelier Concurrence Comptes B");
  });

  after(async () => {
    await arreterServeur(server);
    for (const email of emailsCrees) {
      const u = await prisma.user.findUnique({ where: { email } });
      if (u?.atelierId) {
        await prisma.tokenAction.deleteMany({ where: { userId: u.id } });
        await nettoyerAtelier(u.atelierId, [u.id]);
      }
    }
    for (const ctx of [A, B]) {
      const users = await prisma.user.findMany({ where: { atelierId: ctx.atelier.id }, select: { id: true } });
      await prisma.tokenAction.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
      await nettoyerAtelier(ctx.atelier.id, users.map((u) => u.id));
    }
    await prisma.$disconnect();
  });

  const inviter = (ctx, clienteId) => ctx.api.post(`/api/clientes/${clienteId}/inviter`, {});

  it("invitation d'une cliente : un compte USER est créé et rattaché, avec un lien d'activation", async () => {
    const cliente = await creerCliente(A.atelier.id, { telephone: telephoneUnique(1) });
    const r = await inviter(A, cliente.id);
    assert.equal(r.status, 201);
    assert.match(r.body.lienActivation, /\/client\/activer\?token=[0-9a-f]{64}$/);
    const apres = await prisma.cliente.findUnique({ where: { id: cliente.id }, include: { user: true } });
    assert.equal(apres.user.role, "USER");
    assert.equal(apres.user.atelierId, A.atelier.id);
  });

  it("invitation répétée de la même cliente (séquentielle) : refusée en 409", async () => {
    const cliente = await creerCliente(A.atelier.id, { telephone: telephoneUnique(2) });
    assert.equal((await inviter(A, cliente.id)).status, 201);
    assert.equal((await inviter(A, cliente.id)).status, 409);
  });

  it("[écart connu → 3.2/3.3] 5 invitations simultanées de la même cliente : 1 succès, 4 refus 409, jamais de 5xx", { todo: "course « vérifier puis créer » sur l'identifiant unique" }, async () => {
    const cliente = await creerCliente(A.atelier.id, { telephone: telephoneUnique(3) });
    const reponses = await enParallele(5, () => inviter(A, cliente.id));
    const rep = repartition(reponses);
    assert.deepEqual(rep, { 201: 1, 409: 4 }, `répartition observée : ${JSON.stringify(rep)}`);
    assert.equal(await prisma.user.count({ where: { identifiant: cliente.telephone } }), 1);
  });

  it("invitation : jamais plus d'un compte par téléphone, même si plusieurs requêtes passent en parallèle", async () => {
    const cliente = await creerCliente(A.atelier.id, { telephone: telephoneUnique(4) });
    await enParallele(5, () => inviter(A, cliente.id));
    // Invariant de données (vrai aujourd'hui grâce à la contrainte UNIQUE, même si le code
    // d'erreur renvoyé n'est pas encore propre — voir le test précédent).
    assert.equal(await prisma.user.count({ where: { identifiant: cliente.telephone } }), 1);
    assert.equal(await prisma.cliente.count({ where: { id: cliente.id, userId: { not: null } } }), 1);
  });

  it("[orientation validée → 3.7] la même cliente (même téléphone) peut avoir un compte dans deux ateliers", { todo: "identifiant de connexion actuellement global par téléphone" }, async () => {
    const tel = telephoneUnique(5);
    const cA = await creerCliente(A.atelier.id, { telephone: tel });
    const cB = await creerCliente(B.atelier.id, { telephone: tel });
    const rA = await inviter(A, cA.id);
    const rB = await inviter(B, cB.id);
    assert.equal(rA.status, 201);
    assert.equal(rB.status, 201, `le second atelier a reçu ${rB.status} : ${JSON.stringify(rB.body)}`);
  });

  it("isolation : un ADMIN ne peut pas inviter une cliente d'un autre atelier", async () => {
    const cB = await creerCliente(B.atelier.id, { telephone: telephoneUnique(6) });
    const r = await inviter(A, cB.id);
    assert.equal(r.status, 404);
    assert.equal(await prisma.user.count({ where: { identifiant: cB.telephone } }), 0);
  });

  const corpsInscription = (email, prenom) => ({
    prenom, nomProprietaire: "Diop", email, adminPassword: "Atelier-Test-2026!",
    telephone: "+22790123456", ville: "Niamey", pays: "Niger",
  });

  it("5 inscriptions simultanées avec le même email : un seul compte et un seul atelier sont créés (aucun atelier orphelin)", async () => {
    const email = `course-${process.pid}-${Date.now()}@example.test`;
    const prenom = `Course${process.pid}${Date.now() % 100000}`;
    emailsCrees.push(email);
    // chaque client() a sa propre IP : le limiteur d'inscription est par IP
    const reponses = await enParallele(5, () => client(baseUrl).post("/api/auth/inscription-atelier", corpsInscription(email, prenom)));
    assert.equal(reponses.filter((r) => r.status === 201).length, 1, `répartition : ${JSON.stringify(repartition(reponses))}`);
    assert.equal(await prisma.user.count({ where: { email } }), 1);
    assert.equal(await prisma.atelier.count({ where: { nom: `Atelier de ${prenom}` } }), 1, "atelier orphelin ou dupliqué");
  });

  it("[écart connu → 3.2/3.3] 5 inscriptions simultanées avec le même email : les perdantes reçoivent une erreur 4xx claire, jamais de 5xx", { todo: "course sur l'identifiant unique → erreur 500 (mesuré)" }, async () => {
    const email = `course2-${process.pid}-${Date.now()}@example.test`;
    const prenom = `Course${process.pid}${Date.now() % 100000}b`;
    emailsCrees.push(email);
    const reponses = await enParallele(5, () => client(baseUrl).post("/api/auth/inscription-atelier", corpsInscription(email, prenom)));
    const rep = repartition(reponses);
    for (const r of reponses) assert.ok(r.status < 500, `erreur serveur observée, répartition : ${JSON.stringify(rep)}`);
  });
});
