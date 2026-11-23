import { test } from "node:test";
import assert from "node:assert/strict";
import { cleSynchro, langueAAppliquer } from "../synchroLangue.js";

const TRADUITES = ["fr", "en"];
const pdg = (langue) => ({ id: "u1", langue });

test("premier chargement : la langue du compte est appliquée", () => {
  assert.deepEqual(langueAAppliquer(null, pdg("en"), TRADUITES), { langue: "en", cle: "u1:en" });
});

test("remontée des routes (changement de langue par le bouton de l'en-tête) : la langue du compte N'est PAS réappliquée", () => {
  // Régression : clic sur EN -> routes remontées -> LocaleSync remonté -> la langue (inchangée) du compte, FR, était remise.
  const apresPremiereSynchro = cleSynchro(pdg("fr"));
  assert.equal(langueAAppliquer(apresPremiereSynchro, pdg("fr"), TRADUITES), null);
});

test("la langue du compte change réellement (page Mon compte, ou enregistrement du bouton de l'en-tête) : elle est appliquée", () => {
  const avant = cleSynchro(pdg("fr"));
  assert.deepEqual(langueAAppliquer(avant, pdg("en"), TRADUITES), { langue: "en", cle: "u1:en" });
});

test("un autre utilisateur se connecte avec la même langue : sa langue est appliquée", () => {
  const avant = cleSynchro({ id: "u1", langue: "fr" });
  assert.deepEqual(langueAAppliquer(avant, { id: "u2", langue: "fr" }, TRADUITES), { langue: "fr", cle: "u2:fr" });
});

test("langue du compte non traduite, absente ou utilisateur inconnu : rien n'est appliqué", () => {
  assert.equal(langueAAppliquer(null, pdg("ha"), TRADUITES), null);
  assert.equal(langueAAppliquer(null, { id: "u1" }, TRADUITES), null);
  assert.equal(langueAAppliquer(null, undefined, TRADUITES), null);
  assert.equal(langueAAppliquer(null, null, TRADUITES), null);
});

test("clé de synchronisation : identifiant et langue", () => {
  assert.equal(cleSynchro(pdg("en")), "u1:en");
  assert.equal(cleSynchro({ langue: "fr" }), ":fr");
  assert.equal(cleSynchro({ id: "u1" }), null);
});
