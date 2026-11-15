import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUTS_COMMANDE,
  STATUT_TRANSITIONS,
  STATUT_ICONS,
  STATUTS_PAIEMENT,
  STATUT_PAIEMENT_ICONS,
  statutLabel,
  statutPaiementLabel,
  modeLabel,
  MODES_PAIEMENT,
} from "../constants.js";
import { STATUT_TRANSITIONS as TRANSITIONS_BACKEND } from "../../../../../backend/src/schemas/commande.schema.js";

// La copie frontend de la machine à états ne sert qu'à choisir les boutons à afficher. Si elle dérive
// du backend, l'interface propose une transition que le serveur refuse (409) ou en masque une valide.
test("transitions de statut : copie frontend identique à la règle du backend", () => {
  assert.deepEqual(STATUT_TRANSITIONS, TRANSITIONS_BACKEND);
});

test("chaque statut a une transition définie, une icône et un libellé traduit", () => {
  for (const { value, label } of STATUTS_COMMANDE) {
    assert.ok(value in STATUT_TRANSITIONS, `${value} sans transitions`);
    assert.ok(STATUT_ICONS[value], `${value} sans icône`);
    assert.ok(label && label !== `cmdConst.statut.${value}`, `${value} sans libellé traduit`);
  }
});

test("toute transition cible un statut existant ; LIVREE et ANNULEE sont terminaux", () => {
  const valeurs = new Set(STATUTS_COMMANDE.map((s) => s.value));
  for (const cibles of Object.values(STATUT_TRANSITIONS)) for (const c of cibles) assert.ok(valeurs.has(c), c);
  assert.deepEqual(STATUT_TRANSITIONS.LIVREE, []);
  assert.deepEqual(STATUT_TRANSITIONS.ANNULEE, []);
});

test("statuts de paiement : icône et libellé pour chacun", () => {
  for (const { value, label } of STATUTS_PAIEMENT) {
    assert.ok(STATUT_PAIEMENT_ICONS[value], value);
    assert.ok(label && !label.startsWith("cmdConst."), value);
  }
});

test("libellés : une valeur inconnue est renvoyée telle quelle (jamais undefined)", () => {
  assert.equal(statutLabel("INCONNU"), "INCONNU");
  assert.equal(statutPaiementLabel("INCONNU"), "INCONNU");
  assert.equal(modeLabel("INCONNU"), "INCONNU");
});

test("modes de paiement : tous traduits", () => {
  for (const { value, label } of MODES_PAIEMENT) assert.ok(label && !label.startsWith("cmdConst."), value);
});
