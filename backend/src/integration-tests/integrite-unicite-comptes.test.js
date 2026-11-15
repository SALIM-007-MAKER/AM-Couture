// Sous-phase 3.3 — création de comptes : l'unicité est garantie par la CONTRAINTE de la base et
// traduite en erreur PAR CHAMP, jamais par une vérification préalable hors transaction suivie d'une
// création (anomalies 2 et 3, docs/INVARIANTS.md : « cause »). Critères : (a) pas de vérification
// préalable, (b) message précis par champ — jamais le message générique de repli du classement
// central, (c) stable sous concurrence.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerCliente } from "./helpers.js";
import { enParallele, repartition } from "./invariants.js";
import { MDP, preparerAtelier, nettoyerAtelier } from "./concurrence-helpers.js";

const MESSAGE_GENERIQUE = "Un enregistrement identique existe déjà.";

describe("Intégrité — unicité des comptes (messages précis, sans vérification préalable)", () => {
  let server, baseUrl, A, B, superadmin, S;
  const aNettoyer = { emails: [], identifiants: [], noms: [] };
  const unique = (p) => `${p}-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const telephoneUnique = () => `77${String(process.pid).slice(-4)}${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 900 + 100)}`;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    A = await preparerAtelier(baseUrl, "Atelier Unicité Comptes A");
    B = await preparerAtelier(baseUrl, "Atelier Unicité Comptes B");
    const idSuper = unique("super-unicite");
    superadmin = await prisma.user.create({ data: { identifiant: idSuper, passwordHash: await bcrypt.hash(MDP, 4), role: "SUPERADMIN" } });
    S = client(baseUrl);
    assert.equal((await S.post("/api/auth/login", { identifiant: idSuper, password: MDP })).status, 200);
  });

  after(async () => {
    await arreterServeur(server);
    // Ateliers à supprimer : A, B, ceux créés par les scénarios (par nom ou par compte porteur d'email).
    const ids = new Set([A.atelier.id, B.atelier.id]);
    for (const x of await prisma.atelier.findMany({ where: { nom: { in: aNettoyer.noms } }, select: { id: true } })) ids.add(x.id);
    for (const u of await prisma.user.findMany({ where: { email: { in: aNettoyer.emails }, atelierId: { not: null } }, select: { atelierId: true } })) ids.add(u.atelierId);
    for (const u of await prisma.user.findMany({ where: { identifiant: { in: aNettoyer.identifiants }, atelierId: { not: null } }, select: { atelierId: true } })) ids.add(u.atelierId);
    for (const atelierId of ids) {
      const users = await prisma.user.findMany({ where: { atelierId }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      await prisma.tokenAction.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.cliente.updateMany({ where: { atelierId }, data: { userId: null } });
      await prisma.user.deleteMany({ where: { atelierId, role: "USER" } });
      await nettoyerAtelier(atelierId, userIds);
    }
    // Comptes « porteurs » sans atelier, créés pour provoquer un conflit d'email.
    await prisma.user.deleteMany({ where: { atelierId: null, OR: [{ email: { in: aNettoyer.emails } }, { identifiant: { in: aNettoyer.identifiants } }] } });
    await prisma.journalSecurite.deleteMany({ where: { userId: superadmin.id } });
    await prisma.user.delete({ where: { id: superadmin.id } });
    await prisma.$disconnect();
  });

  const inviter = (ctx, clienteId) => ctx.api.post(`/api/clientes/${clienteId}/inviter`, {});

  it("5 invitations simultanées de la même cliente : 1 succès, 4 refus avec le message MÉTIER (jamais le message générique de repli)", async () => {
    const cliente = await creerCliente(A.atelier.id, { telephone: telephoneUnique() });
    const reponses = await enParallele(5, () => inviter(A, cliente.id));
    assert.deepEqual(repartition(reponses), { 201: 1, 409: 4 }, JSON.stringify(reponses.map((r) => r.status)));
    for (const r of reponses.filter((x) => x.status === 409)) {
      assert.notEqual(r.body.error, MESSAGE_GENERIQUE, "le refus doit venir du contrôle métier, pas du filet de la contrainte");
      assert.match(r.body.error, /déjà été invité|compte existe déjà/i);
    }
    assert.equal(await prisma.user.count({ where: { identifiant: cliente.telephone } }), 1);
  });

  it("invitation : un email déjà utilisé par un autre compte n'empêche pas l'invitation (compte créé sans email)", async () => {
    const email = `${unique("deja")}@example.test`;
    aNettoyer.emails.push(email);
    const idPorteur1 = unique("porteur-email");
    aNettoyer.identifiants.push(idPorteur1);
    await prisma.user.create({ data: { identifiant: idPorteur1, passwordHash: "x", role: "ADMIN", email } });
    const cliente = await creerCliente(A.atelier.id, { telephone: telephoneUnique(), email });
    const r = await inviter(A, cliente.id);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const user = await prisma.user.findUnique({ where: { identifiant: cliente.telephone } });
    assert.equal(user.email, null);
  });

  it("deux invitations simultanées avec le MÊME email (deux ateliers) : les deux réussissent, une seule garde l'email", async () => {
    const email = `${unique("partage")}@example.test`;
    aNettoyer.emails.push(email);
    const cA = await creerCliente(A.atelier.id, { telephone: telephoneUnique(), email });
    const cB = await creerCliente(B.atelier.id, { telephone: telephoneUnique(), email });
    const [rA, rB] = await Promise.all([inviter(A, cA.id), inviter(B, cB.id)]);
    assert.equal(rA.status, 201, JSON.stringify(rA.body));
    assert.equal(rB.status, 201, JSON.stringify(rB.body));
    const avecEmail = await prisma.user.count({ where: { email } });
    assert.equal(avecEmail, 1, "l'email est unique : un seul des deux comptes le porte");
  });

  it("5 inscriptions simultanées avec le même email : 1 succès, 4 refus « Cet email est déjà utilisé » rattachés au champ email", async () => {
    const email = `${unique("inscr")}@example.test`;
    const prenom = `Unicite${process.pid}${Date.now() % 100000}`;
    aNettoyer.emails.push(email);
    const corps = { prenom, nomProprietaire: "Diop", email, adminPassword: "Atelier-Test-2026!", telephone: "+22790123456", ville: "Niamey", pays: "Niger" };
    const reponses = await enParallele(5, () => client(baseUrl).post("/api/auth/inscription-atelier", corps));
    assert.deepEqual(repartition(reponses), { 201: 1, 409: 4 }, JSON.stringify(reponses.map((r) => r.status)));
    for (const r of reponses.filter((x) => x.status === 409)) {
      assert.notEqual(r.body.error, MESSAGE_GENERIQUE);
      assert.deepEqual(r.body.details?.email, ["Cet email est déjà utilisé."]);
    }
    assert.equal(await prisma.user.count({ where: { email } }), 1);
    assert.equal(await prisma.atelier.count({ where: { nom: `Atelier de ${prenom}` } }), 1, "atelier orphelin ou dupliqué");
  });

  it("SuperAdmin : 5 créations simultanées d'atelier avec le même identifiant admin : 1 succès, 4 refus rattachés à adminIdentifiant", async () => {
    const adminIdentifiant = unique("admin-course");
    const nom = `Atelier Course ${adminIdentifiant}`;
    aNettoyer.identifiants.push(adminIdentifiant);
    aNettoyer.noms.push(nom);
    const reponses = await enParallele(5, () => S.post("/api/ateliers", { nom, adminIdentifiant, adminPassword: "Atelier-Test-2026!" }));
    assert.deepEqual(repartition(reponses), { 201: 1, 409: 4 }, JSON.stringify(reponses.map((r) => [r.status, r.body?.error])));
    for (const r of reponses.filter((x) => x.status === 409)) {
      assert.notEqual(r.body.error, MESSAGE_GENERIQUE);
      assert.deepEqual(r.body.details?.adminIdentifiant, ["Cet identifiant est déjà utilisé."]);
    }
    assert.equal(await prisma.atelier.count({ where: { nom } }), 1, "atelier orphelin ou dupliqué");
  });

  it("SuperAdmin : 5 ajouts simultanés du même identifiant de compte : 1 succès, 4 refus rattachés à identifiant", async () => {
    const identifiant = unique("employe-course");
    aNettoyer.identifiants.push(identifiant);
    const reponses = await enParallele(5, () => S.post(`/api/ateliers/${A.atelier.id}/comptes`, { identifiant, password: "Atelier-Test-2026!" }));
    assert.deepEqual(repartition(reponses), { 201: 1, 409: 4 }, JSON.stringify(reponses.map((r) => [r.status, r.body?.error])));
    for (const r of reponses.filter((x) => x.status === 409)) {
      assert.notEqual(r.body.error, MESSAGE_GENERIQUE);
      assert.deepEqual(r.body.details?.identifiant, ["Cet identifiant est déjà utilisé."]);
    }
  });

  it("SuperAdmin : ajout d'un compte avec un email déjà pris : 409 rattaché au champ email", async () => {
    const email = `${unique("pris")}@example.test`;
    aNettoyer.emails.push(email);
    const idPorteur2 = unique("porteur");
    aNettoyer.identifiants.push(idPorteur2);
    await prisma.user.create({ data: { identifiant: idPorteur2, passwordHash: "x", role: "ADMIN", email } });
    const r = await S.post(`/api/ateliers/${A.atelier.id}/comptes`, { identifiant: unique("nouveau"), password: "Atelier-Test-2026!", email });
    assert.equal(r.status, 409);
    assert.deepEqual(r.body.details?.email, ["Cet email est déjà utilisé."]);
  });
});
