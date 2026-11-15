// Garde-fou : docs/API.md doit lister exactement les routes du code. Une route ajoutée, supprimée ou renommée
// sans mise à jour de la documentation fait échouer ce test.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inventaireRoutes } from "./inventaireRoutes.js";

const doc = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs/API.md"), "utf8");
const documentees = [...doc.matchAll(/^\| `((?:GET|POST|PUT|PATCH|DELETE) \/api\/[^`]*)`/gm)].map((m) => m[1]).sort();

describe("docs/API.md reste synchronisé avec le code", () => {
  const code = inventaireRoutes();

  it("documente toutes les routes du code", () => {
    const manquantes = code.filter((r) => !documentees.includes(r));
    assert.deepEqual(manquantes, [], `Routes absentes de docs/API.md : ${manquantes.join(", ")}`);
  });

  it("ne documente aucune route qui n'existe plus", () => {
    const obsoletes = documentees.filter((r) => !code.includes(r));
    assert.deepEqual(obsoletes, [], `Routes de docs/API.md absentes du code : ${obsoletes.join(", ")}`);
  });

  it("ne documente aucune route deux fois", () => {
    const doublons = documentees.filter((r, i) => documentees.indexOf(r) !== i);
    assert.deepEqual(doublons, []);
  });

  it("annonce le bon nombre de routes", () => {
    assert.match(doc, new RegExp(`Référence des ${code.length} routes`));
  });
});
