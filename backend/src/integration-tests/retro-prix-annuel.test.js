// Rétro-remplissage du prix annuel (migration 20261205090000_retro_remplissage_prix_annuel).
//
// La migration est exécutée sur une COPIE de la table PlanAbonnement créée pour le test : la vraie table est partagée avec les
// autres suites (jouées en parallèle) et un UPDATE global y modifierait les formules des autres tests. Le SQL de la migration
// est lu tel quel ; seul le nom de la table est substitué.
//
// Règle de référence (ancien code, lib/abonnement.js avant la tarification Niger) : prix = mensuel × 12 × (100 − remise) / 100,
// remise = celle de l'entrée « 12 » de `tarifsDuree` ; liste vide = durées standard sans remise ; liste sans « 12 » = annuel
// jamais proposé. Les montants ci-dessous sont des DONNÉES DE TEST.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "../lib/prisma.js";

const SQL = readFileSync(
  new URL("../../../prisma/migrations/20261205090000_retro_remplissage_prix_annuel/migration.sql", import.meta.url),
  "utf8",
);
const TABLE = `RetroPlan_${process.pid}`;
const sqlSurCopie = SQL.replaceAll('"PlanAbonnement"', `"${TABLE}"`);
assert.ok(sqlSurCopie.includes(`"${TABLE}"`) && !sqlSurCopie.includes('"PlanAbonnement"'), "la substitution de table a échoué");

// id, prixMensuel, tarifsDuree, prixAnnuel de départ, prixAnnuel attendu (null = laissé vide pour saisie manuelle)
const CAS = [
  ["vide", "5000", [], null, "60000.00"],
  ["remise20", "5000", [{ dureeMois: 3, remisePourcent: 5 }, { dureeMois: 12, remisePourcent: 20 }], null, "48000.00"],
  ["remise90", "1000", [{ dureeMois: 12, remisePourcent: 90 }], null, "1200.00"],
  ["remiseZero", "2500", [{ dureeMois: 1, remisePourcent: 0 }, { dureeMois: 12, remisePourcent: 0 }], null, "30000.00"],
  ["sans12", "5000", [{ dureeMois: 3, remisePourcent: 0 }], null, null],
  ["resultatDecimal", "1001", [{ dureeMois: 12, remisePourcent: 33.33 }], null, null],
  ["mensuelDecimal", "4999.50", [], null, null],
  ["mensuelZero", "0", [], null, null],
  ["mensuelNull", null, [], null, null],
  ["remiseIllisible", "5000", [{ dureeMois: 12, remisePourcent: "abc" }], null, null],
  ["remiseHorsLimite", "5000", [{ dureeMois: 12, remisePourcent: 95 }], null, null],
  ["tropGrand", "9000000", [], null, null],
  ["dejaRenseigne", "5000", [], "45000", "45000.00"],
  ["dejaRenseigneAvecRemise", "5000", [{ dureeMois: 12, remisePourcent: 20 }], "70000", "70000.00"],
];

describe("Rétro-remplissage de prixAnnuel", () => {
  const lire = async () => {
    const lignes = await prisma.$queryRawUnsafe(
      `SELECT id, "prixMensuel"::text AS mensuel, "prixAnnuel"::text AS annuel, "tarifsDuree" AS durees, actif, limites, nom FROM "${TABLE}" ORDER BY id`,
    );
    return Object.fromEntries(lignes.map((l) => [l.id, l]));
  };

  before(async () => {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${TABLE}"`);
    await prisma.$executeRawUnsafe(`CREATE TABLE "${TABLE}" (LIKE "PlanAbonnement" INCLUDING DEFAULTS INCLUDING CONSTRAINTS)`);
    for (const [id, mensuel, durees, annuelDepart] of CAS) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${TABLE}" (id, nom, "prixMensuel", "prixAnnuel", "tarifsDuree", limites, "updatedAt") VALUES ($1, $2, $3::numeric, $4::numeric, $5::jsonb, $6::jsonb, now())`,
        id,
        `Retro ${id} ${process.pid}`,
        mensuel,
        annuelDepart,
        JSON.stringify(durees),
        JSON.stringify({ clientes: 7 }),
      );
    }
  });

  after(async () => {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${TABLE}"`);
  });

  test("chaque formule reçoit exactement le prix de l'ancienne règle, ou reste vide quand le calcul est impossible", async () => {
    await prisma.$executeRawUnsafe(sqlSurCopie);
    const apres = await lire();
    for (const [id, , , , attendu] of CAS) assert.equal(apres[id].annuel, attendu, id);
  });

  test("un prix annuel déjà renseigné n'est jamais écrasé, même quand l'ancienne règle donnerait autre chose", async () => {
    const apres = await lire();
    assert.equal(apres.dejaRenseigne.annuel, "45000.00", "l'ancienne règle aurait donné 60000");
    assert.equal(apres.dejaRenseigneAvecRemise.annuel, "70000.00", "l'ancienne règle aurait donné 48000");
  });

  test("la migration est idempotente : un second passage ne change rien", async () => {
    const avant = await lire();
    await prisma.$executeRawUnsafe(sqlSurCopie);
    await prisma.$executeRawUnsafe(sqlSurCopie);
    assert.deepEqual(await lire(), avant);
  });

  test("seul prixAnnuel est touché : tarifsDuree, quotas, prix mensuel et statut sont conservés", async () => {
    const apres = await lire();
    for (const [id, mensuel, durees] of CAS) {
      assert.deepEqual(apres[id].durees, durees, `tarifsDuree de ${id}`);
      assert.deepEqual(apres[id].limites, { clientes: 7 }, `quotas de ${id}`);
      assert.equal(apres[id].mensuel, mensuel === null ? null : Number(mensuel).toFixed(2), `prix mensuel de ${id}`);
      assert.equal(apres[id].actif, true, `statut de ${id}`);
    }
  });

  test("aucune formule laissée vide n'a reçu de prix inventé", async () => {
    const apres = await lire();
    const vides = CAS.filter(([, , , depart, attendu]) => depart === null && attendu === null).map(([id]) => id);
    assert.ok(vides.length >= 8);
    for (const id of vides) assert.equal(apres[id].annuel, null, id);
  });
});
