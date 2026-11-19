// Le verrou entre suites qui lancent la tâche quotidienne (voir verrou-cron.js) : exclusion mutuelle et libération.
// Utilise une clé PROPRE à ce test : il ne gêne jamais les vraies suites.
import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { prendreVerrou, CLE_VERROU_CRON } from "./verrou-cron.js";

const CLE_TEST = CLE_VERROU_CRON + 1;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const aboutitAvant = (promesse, ms) => Promise.race([promesse.then(() => true), attendre(ms).then(() => false)]);

describe("Verrou des suites qui lancent la tâche quotidienne", () => {
  const aLiberer = [];
  after(async () => {
    for (const liberer of aLiberer) await liberer().catch(() => {});
  });

  it("un second preneur attend la libération du premier, puis obtient le verrou", async () => {
    const libererA = await prendreVerrou(CLE_TEST);
    aLiberer.push(libererA);

    const secondPris = prendreVerrou(CLE_TEST);
    assert.equal(await aboutitAvant(secondPris, 600), false, "tant que A tient le verrou, B ne l'obtient pas");

    await libererA();
    const libererB = await secondPris;
    aLiberer.push(libererB);
    assert.equal(typeof libererB, "function", "B obtient le verrou dès que A le libère");
    await libererB();
  });

  it("des clés différentes ne se bloquent pas", async () => {
    const a = await prendreVerrou(CLE_TEST);
    aLiberer.push(a);
    const b = await prendreVerrou(CLE_TEST + 1);
    aLiberer.push(b);
    await a();
    await b();
  });

  it("libérer deux fois est sans effet, et le verrou est de nouveau disponible", async () => {
    const liberer = await prendreVerrou(CLE_TEST);
    await liberer();
    await liberer();
    const suivant = await aboutitAvant(prendreVerrou(CLE_TEST).then((l) => l().then(() => l)), 2000);
    assert.equal(suivant, true);
  });
});
