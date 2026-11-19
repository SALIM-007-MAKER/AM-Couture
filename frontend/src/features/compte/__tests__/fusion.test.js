import { test } from "node:test";
import assert from "node:assert/strict";
import { fusionnerUtilisateur } from "../fusion.js";

const COMPLET = { id: "u1", identifiant: "superadmin", role: "SUPERADMIN", atelierId: null, langue: "fr", permissions: ["a.b"], poste: null };
const EXTRAIT = { id: "u1", identifiant: "superadmin", langue: "en", createdAt: "2026-11-18T00:00:00.000Z" };

test("la langue reçue est appliquée", () => {
  assert.equal(fusionnerUtilisateur(COMPLET, EXTRAIT).langue, "en");
});

test("le rôle, l'atelier et les permissions ne sont jamais perdus (régression : SuperAdmin renvoyé vers un atelier vide)", () => {
  const r = fusionnerUtilisateur(COMPLET, EXTRAIT);
  assert.equal(r.role, "SUPERADMIN");
  assert.equal(r.atelierId, null);
  assert.deepEqual(r.permissions, ["a.b"]);
  assert.equal(r.poste, null);
});

test("sans utilisateur en cache, le reçu est conservé tel quel", () => {
  assert.deepEqual(fusionnerUtilisateur(undefined, EXTRAIT), EXTRAIT);
});

test("ne modifie pas l'objet du cache", () => {
  const copie = structuredClone(COMPLET);
  fusionnerUtilisateur(COMPLET, EXTRAIT);
  assert.deepEqual(COMPLET, copie);
});
