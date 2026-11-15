import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUTS_OUVERTS } from "../production.js";
import { STATUTS_OUVERTS as STATUTS_OUVERTS_SERVEUR } from "../../../../../backend/src/lib/production.js";

// Dérive : la liste des statuts « en production » de l'interface doit rester celle du serveur.
test("les statuts ouverts de l'interface sont ceux du serveur", () => {
  assert.deepEqual(STATUTS_OUVERTS, STATUTS_OUVERTS_SERVEUR);
});
