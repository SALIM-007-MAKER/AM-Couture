// Sous-phase 3.3 — un événement client est écrit DANS la même transaction que l'écriture qu'il
// décrit (docs/INVARIANTS.md I8, anomalie 8). Technique : un déclencheur SQL, limité à UNE cliente de
// test, fait échouer l'insertion de son événement ; on vérifie ensuite que l'écriture principale n'a
// PAS été conservée. Le déclencheur n'agit que sur la base de test jetable et est supprimé en fin de test.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur } from "./helpers.js";
import { toutesViolations } from "./invariants.js";
import { preparerAtelier, creerCommandeApi, payer, nettoyerAtelier } from "./concurrence-helpers.js";

describe("Intégrité — l'événement client est atomique avec l'écriture qu'il décrit", () => {
  let server, baseUrl, ctx;
  const suffixe = `${process.pid}`;
  const fonction = `am_test_bloque_evt_${suffixe}`;
  const declencheur = `am_test_trg_evt_${suffixe}`;

  const installer = async (clienteId) => {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION ${fonction}() RETURNS trigger AS $$
      BEGIN
        IF NEW."clienteId" = TG_ARGV[0] THEN RAISE EXCEPTION 'échec simulé de l''événement client'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${declencheur} ON "NotificationClient"`);
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${declencheur} BEFORE INSERT ON "NotificationClient" FOR EACH ROW EXECUTE FUNCTION ${fonction}('${clienteId}')`,
    );
  };
  const retirer = async () => {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${declencheur} ON "NotificationClient"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fonction}()`);
  };

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    ctx = await preparerAtelier(baseUrl, "Atelier Intégrité Événements");
  });

  after(async () => {
    await retirer().catch(() => {});
    await arreterServeur(server);
    await prisma.demandeCommande.deleteMany({ where: { atelierId: ctx.atelier.id } });
    await nettoyerAtelier(ctx.atelier.id, [ctx.admin.id]);
    await prisma.$disconnect();
  });

  const evenements = (commandeId) => prisma.notificationClient.count({ where: { commandeId } });

  it("changement de statut : si l'événement ne peut pas être écrit, le statut ne change PAS (anomalie 8)", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id);
    const avant = await evenements(c.id);
    await installer(ctx.cliente.id);
    try {
      const r = await ctx.api.post(`/api/commandes/${c.id}/statut`, { statut: "EN_CONFECTION" });
      assert.ok(r.status >= 500, `l'échec de l'événement doit remonter (reçu ${r.status})`);
      const apres = await prisma.commande.findUnique({ where: { id: c.id } });
      assert.equal(apres.statut, "NOUVELLE", "le statut a été modifié alors que son événement n'a pas été écrit");
      assert.equal(await evenements(c.id), avant);
    } finally {
      await retirer();
    }
  });

  it("[contrôle] création de commande : déjà atomique, aucune commande conservée si l'événement échoue", async () => {
    const avant = await prisma.commande.count({ where: { atelierId: ctx.atelier.id } });
    await installer(ctx.cliente.id);
    try {
      const r = await ctx.api.post("/api/commandes", {
        clienteId: ctx.cliente.id, typeVetement: "ROBE", prixTotal: "5000",
        dateLivraisonPrevue: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      });
      assert.ok(r.status >= 500);
      assert.equal(await prisma.commande.count({ where: { atelierId: ctx.atelier.id } }), avant);
    } finally {
      await retirer();
    }
  });

  it("[contrôle] paiement : déjà atomique, aucun paiement conservé si l'événement échoue", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id);
    await installer(ctx.cliente.id);
    try {
      const r = await payer(ctx.api, c.id, 1000);
      assert.ok(r.status >= 500);
      assert.equal(await prisma.paiement.count({ where: { commandeId: c.id } }), 0);
    } finally {
      await retirer();
    }
  });

  it("refus d'une demande : si l'événement ne peut pas être écrit, la demande reste EN_ATTENTE (anomalie 8)", async () => {
    const demande = await prisma.demandeCommande.create({
      data: { atelierId: ctx.atelier.id, clienteId: ctx.cliente.id, description: "Robe de fête" },
    });
    await installer(ctx.cliente.id);
    try {
      const r = await ctx.api.post(`/api/demandes/${demande.id}/refuser`, { motifRefus: "Atelier complet" });
      assert.ok(r.status >= 500, `l'échec de l'événement doit remonter (reçu ${r.status})`);
      const apres = await prisma.demandeCommande.findUnique({ where: { id: demande.id } });
      assert.equal(apres.statut, "EN_ATTENTE", "la demande a été refusée alors que la cliente n'a reçu aucun événement");
      assert.equal(apres.motifRefus, null);
    } finally {
      await retirer();
    }
  });

  it("[contrôle] acceptation d'une demande : déjà atomique, la demande reste EN_ATTENTE si l'événement échoue", async () => {
    const demande = await prisma.demandeCommande.create({
      data: { atelierId: ctx.atelier.id, clienteId: ctx.cliente.id, description: "Boubou" },
    });
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id);
    await installer(ctx.cliente.id);
    try {
      const r = await ctx.api.post(`/api/demandes/${demande.id}/accepter`, { commandeId: c.id });
      assert.ok(r.status >= 500);
      assert.equal((await prisma.demandeCommande.findUnique({ where: { id: demande.id } })).statut, "EN_ATTENTE");
    } finally {
      await retirer();
    }
  });

  it("sans panne : changement de statut et refus de demande écrivent exactement un événement chacun", async () => {
    const c = await creerCommandeApi(ctx.api, ctx.cliente.id);
    const avant = await evenements(c.id);
    assert.equal((await ctx.api.post(`/api/commandes/${c.id}/statut`, { statut: "EN_CONFECTION" })).status, 200);
    assert.equal(await evenements(c.id), avant + 1);

    const demande = await prisma.demandeCommande.create({ data: { atelierId: ctx.atelier.id, clienteId: ctx.cliente.id } });
    const avantCliente = await prisma.notificationClient.count({ where: { clienteId: ctx.cliente.id, type: "DEMANDE_REFUSEE" } });
    assert.equal((await ctx.api.post(`/api/demandes/${demande.id}/refuser`, {})).status, 200);
    assert.equal(await prisma.notificationClient.count({ where: { clienteId: ctx.cliente.id, type: "DEMANDE_REFUSEE" } }), avantCliente + 1);
    assert.deepEqual(await toutesViolations(ctx.atelier.id), []);
  });
});
