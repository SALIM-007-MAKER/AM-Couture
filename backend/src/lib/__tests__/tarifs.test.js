import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEVISE,
  PAYS,
  estPrixValide,
  offres,
  offrePourDuree,
  periodiciteDeDuree,
  economieAnnuelle,
  moisOffertsAnnuel,
  quotasDefinis,
  quotasNonDefinis,
  estProposee,
  verifierActivation,
  tarifsAncienFormat,
} from "../tarifs.js";

// Les montants ci-dessous sont des DONNÉES DE TEST : aucun tarif n'est écrit dans le code de production.
const decimal = (v) => ({ toString: () => String(v) }); // imite un Decimal Prisma
const QUOTAS_OK = { clientes: 100, employes: 1, commandesActives: 50, modeles: null };

test("Niger uniquement : pays NE, devise XOF", () => {
  assert.equal(PAYS, "NE");
  assert.equal(DEVISE, "XOF");
});

test("un prix valide est un entier de 1 à 99 999 999 (le XOF n'a pas de centimes)", () => {
  for (const v of [1, 3000, "30000", decimal(150000), 99_999_999]) assert.equal(estPrixValide(v), true, String(v));
  for (const v of [0, -5, 2500.5, "abc", null, undefined, 100_000_000, NaN, "12,5"]) assert.equal(estPrixValide(v), false, String(v));
});

test("offres : une par période dont le prix est configuré ; aucun prix par défaut", () => {
  assert.deepEqual(offres({ prixMensuel: 1000, prixAnnuel: 10000 }).map((o) => [o.periodicite, o.dureeMois, o.prix, o.devise]), [
    ["MENSUEL", 1, 1000, "XOF"],
    ["ANNUEL", 12, 10000, "XOF"],
  ]);
  assert.deepEqual(offres({ prixMensuel: 1000 }).map((o) => o.periodicite), ["MENSUEL"]);
  assert.deepEqual(offres({ prixMensuel: null, prixAnnuel: decimal(75000) }).map((o) => o.periodicite), ["ANNUEL"]);
  assert.deepEqual(offres({}), [], "aucun tarif : aucune offre (pas de durées 1/3/6/12 inventées)");
  assert.deepEqual(offres({ prixMensuel: 0, prixAnnuel: 2500.5 }), [], "prix nul ou non entier : pas d'offre");
  assert.deepEqual(offres(null), []);
});

test("offre d'une durée : seulement 1 et 12 mois, seulement si le prix existe", () => {
  const plan = { prixMensuel: 1000, prixAnnuel: 10000 };
  assert.equal(offrePourDuree(plan, 1).prix, 1000);
  assert.equal(offrePourDuree(plan, 12).prix, 10000);
  for (const d of [2, 3, 6, 24, 0]) assert.equal(offrePourDuree(plan, d), null, `${d} mois`);
  assert.equal(offrePourDuree({ prixMensuel: 1000 }, 12), null);
  assert.equal(periodiciteDeDuree(1), "MENSUEL");
  assert.equal(periodiciteDeDuree(12), "ANNUEL");
  assert.equal(periodiciteDeDuree(3), null);
});

test("économie annuelle : informative, mensuel × 12 − annuel, absente sans les deux prix ou sans gain", () => {
  assert.equal(economieAnnuelle({ prixMensuel: 3000, prixAnnuel: 30000 }), 6000);
  assert.equal(economieAnnuelle({ prixMensuel: 7500, prixAnnuel: 75000 }), 15000);
  assert.equal(economieAnnuelle({ prixMensuel: 15000, prixAnnuel: 150000 }), 30000);
  assert.equal(moisOffertsAnnuel({ prixMensuel: 3000, prixAnnuel: 30000 }), 2);
  assert.equal(economieAnnuelle({ prixMensuel: 3000 }), null);
  assert.equal(economieAnnuelle({ prixAnnuel: 30000 }), null);
  assert.equal(economieAnnuelle({ prixMensuel: 1000, prixAnnuel: 12000 }), null, "pas d'économie : rien à afficher");
  assert.equal(economieAnnuelle({ prixMensuel: 1000, prixAnnuel: 15000 }), null, "annuel plus cher : jamais d'économie négative");
  assert.equal(moisOffertsAnnuel({ prixMensuel: 1000 }), null);
});

test("quotas définis : chaque ressource est une limite ou « illimité explicite » (null) ; une clé absente n'est PAS illimitée", () => {
  assert.equal(quotasDefinis(QUOTAS_OK), true);
  assert.equal(quotasDefinis({ clientes: null, employes: null, commandesActives: null, modeles: null }), true, "illimité explicite");
  assert.equal(quotasDefinis({}), false);
  assert.equal(quotasDefinis(undefined), false);
  assert.equal(quotasDefinis({ clientes: 100 }), false);
  assert.equal(quotasDefinis({ ...QUOTAS_OK, employes: 0 }), false, "zéro n'est pas une limite valide");
  assert.equal(quotasDefinis({ ...QUOTAS_OK, modeles: "beaucoup" }), false);
  assert.equal(quotasDefinis([1, 2, 3, 4]), false);
  assert.deepEqual(quotasNonDefinis({ clientes: 100, modeles: null }), ["employes", "commandesActives"]);
  assert.deepEqual(quotasNonDefinis({}), ["clientes", "employes", "commandesActives", "modeles"]);
  assert.deepEqual(quotasNonDefinis(QUOTAS_OK), []);
});

test("formule proposée : active ET au moins une offre", () => {
  assert.equal(estProposee({ actif: true, prixMensuel: 1000 }), true);
  assert.equal(estProposee({ actif: true, prixAnnuel: 10000 }), true);
  assert.equal(estProposee({ actif: false, prixMensuel: 1000 }), false, "inactive : jamais proposée");
  assert.equal(estProposee({ actif: true }), false, "aucun tarif : jamais proposée");
  assert.equal(estProposee({ actif: true, prixMensuel: 0 }), false, "aucune formule gratuite");
});

test("activation commerciale : exige un tarif ET des quotas définis ; les raisons sont explicites", () => {
  assert.deepEqual(verifierActivation({ prixMensuel: 1000, limites: QUOTAS_OK }), { ok: true, raisons: [] });
  assert.deepEqual(verifierActivation({ limites: QUOTAS_OK }), { ok: false, raisons: ["AUCUN_TARIF"] });
  assert.deepEqual(verifierActivation({ prixMensuel: 1000, limites: {} }), { ok: false, raisons: ["QUOTAS_NON_DEFINIS"] });
  assert.deepEqual(verifierActivation({}), { ok: false, raisons: ["AUCUN_TARIF", "QUOTAS_NON_DEFINIS"] });
});

test("ancien format `tarifs` dérivé des offres : durées 1 et 12 seulement, aucune remise stockée", () => {
  assert.deepEqual(tarifsAncienFormat({ prixMensuel: 1000, prixAnnuel: 10000 }), [
    { dureeMois: 1, remisePourcent: 0, total: 1000 },
    { dureeMois: 12, remisePourcent: 0, total: 10000 },
  ]);
  assert.deepEqual(tarifsAncienFormat({}), []);
});
