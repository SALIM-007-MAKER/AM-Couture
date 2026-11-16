import { test } from "node:test";
import assert from "node:assert/strict";
import { ETAPES_COMMANDE, etatsEtapes } from "../etapes.js";

const etats = (statut) => etatsEtapes(statut).map((e) => e.etat);

test("une nouvelle commande : première étape en cours, les autres à venir", () => {
  assert.deepEqual(etats("NOUVELLE"), ["en-cours", "a-venir", "a-venir", "a-venir", "a-venir", "a-venir"]);
});

test("en confection : la précédente est faite, la suivante à venir", () => {
  assert.deepEqual(etats("EN_CONFECTION"), ["fait", "en-cours", "a-venir", "a-venir", "a-venir", "a-venir"]);
});

test("terminée (prête à récupérer) : tout est fait sauf la remise", () => {
  assert.deepEqual(etats("TERMINEE"), ["fait", "fait", "fait", "fait", "en-cours", "a-venir"]);
});

test("livrée : toutes les étapes faites, aucune en cours", () => {
  assert.deepEqual(etats("LIVREE"), ["fait", "fait", "fait", "fait", "fait", "fait"]);
});

test("annulée ou statut inconnu : aucune progression montrée", () => {
  assert.deepEqual(etatsEtapes("ANNULEE"), []);
  assert.deepEqual(etatsEtapes("N_IMPORTE_QUOI"), []);
  assert.deepEqual(etatsEtapes(undefined), []);
});

test("chaque statut non annulé a exactement une étape en cours, sauf livrée ; l'ordre est celui du circuit", () => {
  for (const statut of ETAPES_COMMANDE) {
    const enCours = etatsEtapes(statut).filter((e) => e.etat === "en-cours").length;
    assert.equal(enCours, statut === "LIVREE" ? 0 : 1, statut);
  }
  assert.deepEqual(etatsEtapes("NOUVELLE").map((e) => e.etape), ETAPES_COMMANDE);
});
