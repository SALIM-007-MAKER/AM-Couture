// Cron quotidien (/api/cron/rappels-quotidiens) : authentification par secret
// partagé (fail-closed) et purge du journal de sécurité au-delà de la rétention.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur } from "./helpers.js";

describe("Cron — rappels quotidiens et purge du journal de sécurité", () => {
  let server, baseUrl;
  const secretAvant = process.env.CRON_SECRET;
  const cleAvant = process.env.RESEND_API_KEY;
  const marque = `TEST_CRON_${process.pid}`;
  const ids = {};

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    // Pas de clé Resend : les éventuels ateliers de la base de test échouent
    // proprement à l'envoi (tableau `erreurs`), sans aucun appel réseau.
    delete process.env.RESEND_API_KEY;
    const jour = 86_400_000;
    ids.vieux = (await prisma.journalSecurite.create({ data: { evenement: marque, createdAt: new Date(Date.now() - 400 * jour) } })).id;
    ids.limiteDehors = (await prisma.journalSecurite.create({ data: { evenement: marque, createdAt: new Date(Date.now() - 366 * jour) } })).id;
    ids.limiteDedans = (await prisma.journalSecurite.create({ data: { evenement: marque, createdAt: new Date(Date.now() - 364 * jour) } })).id;
    ids.recent = (await prisma.journalSecurite.create({ data: { evenement: marque } })).id;
  });

  after(async () => {
    if (secretAvant === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = secretAvant;
    if (cleAvant !== undefined) process.env.RESEND_API_KEY = cleAvant;
    await arreterServeur(server);
    await prisma.journalSecurite.deleteMany({ where: { evenement: marque } });
    await prisma.$disconnect();
  });

  const appeler = (auth) =>
    fetch(`${baseUrl}/api/cron/rappels-quotidiens`, { headers: auth ? { Authorization: auth } : {} });

  it("sans CRON_SECRET configuré : 503 (fail-closed) et rien n'est purgé", async () => {
    delete process.env.CRON_SECRET;
    assert.equal((await appeler("Bearer n-importe-quoi")).status, 503);
    assert.ok(await prisma.journalSecurite.findUnique({ where: { id: ids.vieux } }));
  });

  it("mauvais secret ou absent : 401 et rien n'est purgé", async () => {
    process.env.CRON_SECRET = "secret-de-test-cron-0123456789";
    assert.equal((await appeler()).status, 401);
    assert.equal((await appeler("Bearer mauvais")).status, 401);
    assert.ok(await prisma.journalSecurite.findUnique({ where: { id: ids.vieux } }));
  });

  it("bon secret : 200, supprime au-delà de 365 jours, conserve le reste", async () => {
    process.env.CRON_SECRET = "secret-de-test-cron-0123456789";
    const res = await appeler("Bearer secret-de-test-cron-0123456789");
    assert.equal(res.status, 200);
    const corps = await res.json();
    assert.ok(corps.journalSecuritePurge >= 2, `purge attendue >= 2, reçu ${corps.journalSecuritePurge}`);
    assert.equal(await prisma.journalSecurite.findUnique({ where: { id: ids.vieux } }), null);
    assert.equal(await prisma.journalSecurite.findUnique({ where: { id: ids.limiteDehors } }), null);
    assert.ok(await prisma.journalSecurite.findUnique({ where: { id: ids.limiteDedans } }));
    assert.ok(await prisma.journalSecurite.findUnique({ where: { id: ids.recent } }));
  });

  it("purge aussi les clés d'idempotence expirées (et seulement elles)", async () => {
    process.env.CRON_SECRET = "secret-de-test-cron-0123456789";
    const portee = `atelier:cron-${process.pid}`;
    const base = { portee, methode: "POST", chemin: "/x", empreinte: "e", statut: "TERMINEE", reponseStatut: 201, reponseCorps: {} };
    await prisma.cleIdempotence.create({ data: { ...base, cle: "expiree-cron-0001", expireLe: new Date(Date.now() - 3_600_000) } });
    await prisma.cleIdempotence.create({ data: { ...base, cle: "valide-cron-00001", expireLe: new Date(Date.now() + 3_600_000) } });
    try {
      const res = await appeler("Bearer secret-de-test-cron-0123456789");
      assert.equal(res.status, 200);
      assert.ok((await res.json()).clesIdempotencePurgees >= 1);
      assert.equal(await prisma.cleIdempotence.count({ where: { portee, cle: "expiree-cron-0001" } }), 0);
      assert.equal(await prisma.cleIdempotence.count({ where: { portee, cle: "valide-cron-00001" } }), 1);
    } finally {
      await prisma.cleIdempotence.deleteMany({ where: { portee } });
    }
  });

  it("idempotent : un second passage ne supprime plus rien de ces lignes", async () => {
    process.env.CRON_SECRET = "secret-de-test-cron-0123456789";
    const res = await appeler("Bearer secret-de-test-cron-0123456789");
    assert.equal(res.status, 200);
    assert.ok(await prisma.journalSecurite.findUnique({ where: { id: ids.recent } }));
  });
});
