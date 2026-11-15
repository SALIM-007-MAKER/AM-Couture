import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { inscriptionAtelierSchema } from "../atelierAdmin.schema.js";
import { listClientesQuerySchema } from "../cliente.schema.js";
import { formatZodError } from "../../lib/validation.js";

// Garde-fous de la migration Zod 3 -> 4 (correctif d'une vulnérabilité DoS) :
// vérifient les comportements dont les routes dépendent réellement.

const base = {
  nom: "Atelier", prenom: "A", nomProprietaire: "B", email: "a@b.co", adminPassword: "Cousette-Dakar-2026!",
  ville: "Dakar", pays: "Sénégal",
};

test("téléphone manquant -> message métier conservé (required_error v3 => error v4)", () => {
  const r = inscriptionAtelierSchema.safeParse(base);
  assert.equal(r.success, false);
  assert.deepEqual(formatZodError(r.error).telephone, ["Téléphone requis."]);
});

test("formatZodError : erreurs de champ + _global pour une clé inconnue (.strict)", () => {
  const r = inscriptionAtelierSchema.safeParse({ ...base, telephone: "abc", inconnu: 1 });
  assert.equal(r.success, false);
  const d = formatZodError(r.error);
  assert.ok(d.telephone?.length, "erreur de champ attendue");
  assert.ok(d._global?.length, "clé inconnue regroupée sous _global");
});

test("pagination : coerce + valeurs par défaut préservées", () => {
  const r = listClientesQuerySchema.parse({ page: "3" });
  assert.equal(r.page, 3);
  assert.equal(r.pageSize, 20);
  assert.equal(r.archived, "false");
  assert.equal(listClientesQuerySchema.safeParse({ pageSize: "1000" }).success, false);
});

test("zod >= 4.6.6 installé (correctif GHSA-mrhx-c7xc-m3w5)", () => {
  const pkg = createRequire(import.meta.url)("zod/package.json");
  const [maj, min, pat] = pkg.version.split(".").map(Number);
  assert.ok(maj > 4 || (maj === 4 && (min > 6 || (min === 6 && pat >= 6))), `zod ${pkg.version}`);
});
