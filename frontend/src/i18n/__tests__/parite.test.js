import { test } from "node:test";
import assert from "node:assert/strict";
import fr from "../fr.js";
import en from "../en.js";

// Aplatit un dictionnaire en { "a.b.c": "texte" }.
function aplatir(obj, prefixe = "", sortie = {}) {
  for (const [cle, valeur] of Object.entries(obj)) {
    const chemin = prefixe ? `${prefixe}.${cle}` : cle;
    if (valeur && typeof valeur === "object") aplatir(valeur, chemin, sortie);
    else sortie[chemin] = valeur;
  }
  return sortie;
}

const plat = { fr: aplatir(fr), en: aplatir(en) };
const variables = (texte) => [...String(texte).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

test("le dictionnaire français n'est pas vide", () => {
  assert.ok(Object.keys(plat.fr).length > 500);
});

test("toute clé française existe en anglais (sinon l'anglais retombe sur le français)", () => {
  const manquantes = Object.keys(plat.fr).filter((k) => !(k in plat.en));
  assert.deepEqual(manquantes, [], `clés absentes de l'anglais : ${manquantes.slice(0, 20).join(", ")}`);
});

test("toute clé anglaise existe en français (le français est la langue de repli)", () => {
  const orphelines = Object.keys(plat.en).filter((k) => !(k in plat.fr));
  assert.deepEqual(orphelines, [], `clés absentes du français : ${orphelines.slice(0, 20).join(", ")}`);
});

test("aucune traduction vide", () => {
  for (const langue of ["fr", "en"]) {
    const vides = Object.entries(plat[langue]).filter(([, v]) => typeof v === "string" && v.trim() === "").map(([k]) => k);
    assert.deepEqual(vides, [], `${langue} : traductions vides`);
  }
});

test("mêmes variables {{x}} dans les deux langues (sinon un montant ou un nom disparaît)", () => {
  const divergentes = Object.keys(plat.fr)
    .filter((k) => k in plat.en && typeof plat.fr[k] === "string" && typeof plat.en[k] === "string")
    .filter((k) => variables(plat.fr[k]).join() !== variables(plat.en[k]).join());
  assert.deepEqual(divergentes, [], `variables divergentes : ${divergentes.slice(0, 20).join(", ")}`);
});
