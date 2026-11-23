import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fichiersGuides } from "../guides-markdown.mjs";

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fichiers = fichiersGuides();

test("quatre guides + un sommaire, en français et en anglais", () => {
  assert.equal(Object.keys(fichiers).length, 10);
  for (const f of ["docs/guides/01-PDG.md", "docs/guides/02-EMPLOYE.md", "docs/guides/03-CLIENT.md", "docs/guides/04-SUPERADMIN.md", "docs/guides/en/01-PDG.md", "docs/guides/en/04-SUPERADMIN.md"]) {
    assert.ok(f in fichiers, f);
  }
});

test("les fichiers Markdown de docs/guides sont à jour (lancer `npm run guides:md` sinon)", () => {
  const perimes = [];
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    const complet = resolve(RACINE, chemin);
    if (!existsSync(complet) || readFileSync(complet, "utf8") !== contenu) perimes.push(chemin);
  }
  assert.deepEqual(perimes, [], `fichiers périmés ou absents : ${perimes.join(", ")}`);
});

test("aucun jeton [[cle]] ni libellé non résolu dans le Markdown généré", () => {
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    assert.ok(!contenu.includes("[["), `${chemin} : jeton non résolu`);
    assert.ok(!/« (?:[a-zA-Z]+\.)+[a-zA-Z]+ »/.test(contenu), `${chemin} : clé i18n affichée telle quelle`);
    assert.ok(!contenu.includes("{{"), `${chemin} : variable non résolue`);
  }
});

test("le guide de l'employé indique les droits nécessaires à chaque section conditionnelle", () => {
  assert.match(fichiers["docs/guides/02-EMPLOYE.md"], /\*Droits nécessaires :\*/);
  assert.match(fichiers["docs/guides/en/02-EMPLOYE.md"], /\*Required rights :\*/);
});
