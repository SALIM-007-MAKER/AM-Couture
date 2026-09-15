import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildCsv } from "../csv.js";

describe("buildCsv", () => {
  test("commence par un BOM UTF-8 (compatibilité Excel)", () => {
    const csv = buildCsv([], [{ header: "Nom", accessor: "nom" }]);
    assert.equal(csv.startsWith("﻿"), true);
  });

  test("utilise le point-virgule comme délimiteur", () => {
    const csv = buildCsv([{ nom: "Diallo", prenom: "Fatou" }], [
      { header: "Nom", accessor: "nom" },
      { header: "Prénom", accessor: "prenom" },
    ]);
    assert.ok(csv.includes("Nom;Prénom"));
    assert.ok(csv.includes("Diallo;Fatou"));
  });

  test("accepte un accessor fonction pour une valeur dérivée", () => {
    const csv = buildCsv([{ montant: 1000 }], [
      { header: "Montant formaté", accessor: (r) => `${r.montant} FCFA` },
    ]);
    assert.ok(csv.includes("1000 FCFA"));
  });

  test("échappe un champ contenant le délimiteur", () => {
    const csv = buildCsv([{ notes: "Robe; taille M" }], [{ header: "Notes", accessor: "notes" }]);
    assert.ok(csv.includes('"Robe; taille M"'));
  });

  test("échappe un champ contenant des guillemets (doublés)", () => {
    const csv = buildCsv([{ notes: 'Il a dit "bonjour"' }], [{ header: "Notes", accessor: "notes" }]);
    assert.ok(csv.includes('"Il a dit ""bonjour"""'));
  });

  test("échappe un champ contenant un retour à la ligne", () => {
    const csv = buildCsv([{ notes: "Ligne 1\nLigne 2" }], [{ header: "Notes", accessor: "notes" }]);
    assert.ok(csv.includes('"Ligne 1\nLigne 2"'));
  });

  test("null/undefined deviennent une chaîne vide, jamais la littérale 'null'", () => {
    const csv = buildCsv([{ a: null, b: undefined }], [
      { header: "A", accessor: "a" },
      { header: "B", accessor: "b" },
    ]);
    const ligneDonnees = csv.split("\r\n")[1];
    assert.equal(ligneDonnees, ";");
  });

  test("aucune ligne -> juste l'en-tête", () => {
    const csv = buildCsv([], [{ header: "Nom", accessor: "nom" }]);
    assert.equal(csv, "﻿Nom\r\n");
  });
});
