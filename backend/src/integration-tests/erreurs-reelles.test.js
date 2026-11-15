// Sous-phase 3.2 — le classificateur d'erreurs doit reconnaître les erreurs RÉELLES produites par
// Prisma 7 + @prisma/adapter-pg (et non des erreurs imitées dont la forme pourrait diverger).
// Chaque cas provoque une vraie erreur sur la base de test jetable.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { prisma } from "../lib/prisma.js";
import { classifierErreur } from "../lib/classifierErreur.js";

const attraper = async (fn) => {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  assert.fail("une erreur était attendue");
};

describe("Erreurs réelles du pilote → réponses HTTP sûres", () => {
  const identifiant = `erreur-reelle-${process.pid}-${Date.now()}`;

  after(async () => {
    await prisma.user.deleteMany({ where: { identifiant } });
    await prisma.$disconnect();
  });

  it("violation d'unicité réelle (P2002) → 409", async () => {
    await prisma.user.create({ data: { identifiant, passwordHash: "x", role: "ADMIN" } });
    const e = await attraper(() => prisma.user.create({ data: { identifiant, passwordHash: "x", role: "ADMIN" } }));
    assert.equal(e.code, "P2002");
    const c = classifierErreur(e);
    assert.equal(c.status, 409);
    assert.doesNotMatch(c.message, /User_identifiant_key|prisma/i);
  });

  it("clé étrangère réelle (P2003) → 409", async () => {
    const e = await attraper(() => prisma.cliente.create({ data: { atelierId: "inexistant", nom: "a", prenom: "b", telephone: "1" } }));
    assert.equal(e.code, "P2003");
    assert.equal(classifierErreur(e).status, 409);
  });

  it("enregistrement absent réel (P2025) → 404", async () => {
    const e = await attraper(() => prisma.cliente.update({ where: { id: "inexistant" }, data: { nom: "z" } }));
    assert.equal(e.code, "P2025");
    assert.equal(classifierErreur(e).status, 404);
  });

  it("deadlock réel (40P01) → 409 « réessayez »", async () => {
    const table = `zz_dl_${process.pid}`;
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ${table}(id int primary key, v int)`);
    await prisma.$executeRawUnsafe(`INSERT INTO ${table} VALUES (1,0),(2,0) ON CONFLICT DO NOTHING`);
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      const t1 = prisma.$transaction(async (tx) => { await tx.$executeRawUnsafe(`UPDATE ${table} SET v=1 WHERE id=1`); await pause(300); await tx.$executeRawUnsafe(`UPDATE ${table} SET v=1 WHERE id=2`); });
      const t2 = prisma.$transaction(async (tx) => { await tx.$executeRawUnsafe(`UPDATE ${table} SET v=2 WHERE id=2`); await pause(300); await tx.$executeRawUnsafe(`UPDATE ${table} SET v=2 WHERE id=1`); });
      const resultats = await Promise.allSettled([t1, t2]);
      const rejet = resultats.find((r) => r.status === "rejected");
      assert.ok(rejet, "PostgreSQL doit détecter l'interblocage et en interrompre une des deux");
      assert.equal(classifierErreur(rejet.reason).status, 409);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${table}`);
    }
  });

  it("transaction interactive expirée réelle (P2028) → 503", async () => {
    const e = await attraper(() =>
      prisma.$transaction(async (tx) => { await tx.$queryRaw`SELECT pg_sleep(1)::text`; }, { timeout: 200, maxWait: 200 }),
    );
    assert.equal(e.code, "P2028");
    assert.equal(classifierErreur(e).status, 503);
  });

  it("base qui refuse la connexion (réelle) → 503", async () => {
    const mort = new PrismaClient({ adapter: new PrismaPg({ connectionString: "postgresql://u:p@127.0.0.1:1/x" }) });
    const e = await attraper(() => mort.$queryRaw`SELECT 1`);
    const c = classifierErreur(e);
    assert.equal(c.status, 503);
    assert.equal(c.retryAfter, 5);
    await mort.$disconnect();
  });

  it("requête plus longue que query_timeout (réelle) → 503", async () => {
    const lent = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 2, query_timeout: 300 }) });
    const e = await attraper(() => lent.$queryRaw`SELECT pg_sleep(2)::text`);
    assert.equal(classifierErreur(e).status, 503);
    await lent.$disconnect();
  });

  it("connexion qui n'aboutit pas dans le délai (réelle, adresse sans réponse) → 503, sans suspendre", async () => {
    const trou = new PrismaClient({ adapter: new PrismaPg({ connectionString: "postgresql://u:p@10.255.255.1:5432/x", connectionTimeoutMillis: 800 }) });
    const t0 = Date.now();
    const e = await attraper(() => trou.$queryRaw`SELECT 1`);
    assert.ok(Date.now() - t0 < 5000, `attente de ${Date.now() - t0} ms`);
    assert.equal(classifierErreur(e).status, 503);
    await trou.$disconnect();
  });

  it("une erreur applicative quelconque reste un 500 générique", () => {
    const c = classifierErreur(new TypeError("Cannot read properties of undefined"));
    assert.equal(c.status, 500);
    assert.equal(c.message, "Une erreur est survenue.");
  });
});
