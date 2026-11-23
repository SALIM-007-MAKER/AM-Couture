import { test } from "node:test";
import assert from "node:assert/strict";
import { PERIODICITES, offreDe, periodesProposees, prixEntier, economieAnnuelle, moisOfferts, moisOffertsMax, raisonsNonProposee, avertissementQuotas } from "../tarifs.js";

// Montants de test uniquement : le module de production ne contient aucun tarif.
const plan = (offres, extra = {}) => ({ actif: true, offres, quotasNonDefinis: [], ...extra });
const MENSUEL = { periodicite: "MENSUEL", dureeMois: 1, prix: 3000 };
const ANNUEL = { periodicite: "ANNUEL", dureeMois: 12, prix: 30000 };

test("seules les périodes mensuelle et annuelle existent", () => {
  assert.deepEqual(PERIODICITES, ["MENSUEL", "ANNUEL"]);
});

test("offre d'une période et périodes proposées : seulement celles qui ont un prix", () => {
  assert.equal(offreDe(plan([MENSUEL, ANNUEL]), "ANNUEL").prix, 30000);
  assert.equal(offreDe(plan([MENSUEL]), "ANNUEL"), undefined);
  assert.equal(offreDe(undefined, "MENSUEL"), undefined);
  assert.deepEqual(periodesProposees([plan([MENSUEL]), plan([ANNUEL])]), ["MENSUEL", "ANNUEL"]);
  assert.deepEqual(periodesProposees([plan([MENSUEL])]), ["MENSUEL"]);
  assert.deepEqual(periodesProposees([plan([])]), [], "aucun prix : rien n'est proposé");
  assert.deepEqual(periodesProposees(undefined), []);
});

test("prix entier : entier de 1 à 99 999 999, espaces tolérés, jamais de décimale ni de zéro", () => {
  assert.equal(prixEntier("30000"), 30000);
  assert.equal(prixEntier("30 000"), 30000);
  assert.equal(prixEntier("30 000"), 30000);
  assert.equal(prixEntier(7500), 7500);
  for (const v of ["", "0", "-5", "2500.5", "2500,5", "abc", "100000000", null, undefined]) assert.equal(prixEntier(v), null, String(v));
});

test("économie annuelle informative : mensuel × 12 − annuel ; null sans les deux prix ou sans gain", () => {
  assert.equal(economieAnnuelle("3000", "30000"), 6000);
  assert.equal(economieAnnuelle(7500, 75000), 15000);
  assert.equal(economieAnnuelle(15000, 150000), 30000);
  assert.equal(moisOfferts(3000, 30000), 2);
  assert.equal(economieAnnuelle(3000, ""), null);
  assert.equal(economieAnnuelle("", 30000), null);
  assert.equal(economieAnnuelle(1000, 12000), null);
  assert.equal(economieAnnuelle(1000, 15000), null, "annuel plus cher : jamais d'économie négative");
  assert.equal(moisOfferts(3000, ""), null);
  assert.equal(moisOffertsMax([{ moisOffertsAnnuel: 2 }, { moisOffertsAnnuel: null }, {}]), 2);
  assert.equal(moisOffertsMax([]), 0);
});

test("raisons d'une formule non proposée : inactive, sans tarif, quotas non définis", () => {
  assert.deepEqual(raisonsNonProposee(plan([MENSUEL])), []);
  assert.deepEqual(raisonsNonProposee(plan([MENSUEL], { actif: false })), ["INACTIVE"]);
  assert.deepEqual(raisonsNonProposee(plan([], { actif: false, quotasNonDefinis: ["clientes"] })), ["INACTIVE", "AUCUN_TARIF", "QUOTAS_NON_DEFINIS"]);
});

test("avertissement quotas : seulement pour une formule ACTIVE dont des limites ne sont pas décidées", () => {
  const actives = { actif: true, quotasNonDefinis: ["employes", "modeles"] };
  assert.deepEqual(avertissementQuotas(actives), ["employes", "modeles"]);
  assert.deepEqual(avertissementQuotas({ ...actives, actif: false }), [], "formule inactive : rien à signaler");
  assert.deepEqual(avertissementQuotas({ actif: true, quotasNonDefinis: [] }), [], "quotas décidés (même illimités explicites)");
  assert.deepEqual(avertissementQuotas({ actif: true }), [], "donnée absente : pas d'avertissement inventé");
  assert.deepEqual(avertissementQuotas({ actif: true, quotasNonDefinis: "x" }), []);
  assert.deepEqual(avertissementQuotas(undefined), []);
  assert.deepEqual(avertissementQuotas(null), []);
});

test("avertissement quotas : lecture seule, l'objet formule n'est jamais modifié", () => {
  const formule = Object.freeze({ actif: true, quotasNonDefinis: Object.freeze(["clientes"]), limites: Object.freeze({}) });
  assert.deepEqual(avertissementQuotas(formule), ["clientes"]);
  assert.deepEqual(formule.limites, {});
});
