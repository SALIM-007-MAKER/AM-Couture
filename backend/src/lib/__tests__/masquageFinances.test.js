import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { masquerFinances, masquerFinancesSiNonAutorise, CLES_FINANCIERES, CLASSEMENT_DECIMAL } from "../masquageFinances.js";

describe("masquerFinances", () => {
  it("retire les montants à tous les niveaux, objets et tableaux", () => {
    const commande = {
      id: "c1",
      numero: "CMD-1",
      prixTotal: "50000",
      totalPaye: "20000",
      solde: "30000",
      statutPaiement: "PARTIEL",
      paiements: [{ montant: "20000" }],
      cliente: { nom: "Awa" },
      modele: { nom: "Boubou", prixIndicatif: "15000" },
      livraisons: [{ id: "l1", montantRestant: "0", dateLivraison: "2026-11-15" }],
    };
    assert.deepEqual(masquerFinances({ data: [commande], meta: { total: 1 } }), {
      data: [
        {
          id: "c1",
          numero: "CMD-1",
          cliente: { nom: "Awa" },
          modele: { nom: "Boubou" },
          livraisons: [{ id: "l1", dateLivraison: "2026-11-15" }],
        },
      ],
      meta: { total: 1 },
    });
  });

  it("laisse intacts les dates, les valeurs simples et les clés sans montant", () => {
    const date = new Date("2026-11-15T00:00:00Z");
    const sortie = masquerFinances({ date, nombre: 3, texte: "ok", nul: null, quantite: "12.5" });
    assert.equal(sortie.date, date);
    assert.deepEqual({ ...sortie, date: undefined }, { date: undefined, nombre: 3, texte: "ok", nul: null, quantite: "12.5" });
  });

  it("ne modifie pas l'objet d'origine", () => {
    const original = { prixTotal: "1", id: "x" };
    masquerFinances(original);
    assert.equal(original.prixTotal, "1");
  });
});

describe("masquerFinancesSiNonAutorise", () => {
  const appeler = (user, corps) => {
    let envoye;
    const res = { json: (c) => (envoye = c) };
    masquerFinancesSiNonAutorise({ user }, res, () => {});
    res.json(corps);
    return envoye;
  };
  it("le PDG et un employé autorisé voient tout", () => {
    assert.equal(appeler({ role: "ADMIN" }, { prixTotal: "1" }).prixTotal, "1");
    assert.equal(appeler({ role: "EMPLOYE", permissions: ["finances.voir"] }, { prixTotal: "1" }).prixTotal, "1");
  });
  it("un employé sans « finances.voir » ne reçoit aucun montant", () => {
    assert.deepEqual(appeler({ role: "EMPLOYE", permissions: ["commandes.lire"] }, { id: "c", prixTotal: "1" }), { id: "c" });
  });
});

describe("garde-fou : toute colonne Decimal du schéma est classée", () => {
  const schema = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../prisma/schema.prisma"), "utf8");
  const decimales = [];
  let modele = null;
  for (const ligne of schema.split(/\r?\n/)) {
    const m = ligne.match(/^model (\w+) \{/);
    if (m) modele = m[1];
    else if (/^\}/.test(ligne)) modele = null;
    else if (modele) {
      const champ = ligne.match(/^\s+(\w+)\s+Decimal\??/);
      if (champ) decimales.push(modele === "Mesure" ? "Mesure.*" : `${modele}.${champ[1]}`);
    }
  }
  const uniques = [...new Set(decimales)];

  it("le schéma contient bien des colonnes Decimal (le test lit le bon fichier)", () => {
    assert.ok(uniques.length >= 10, `seulement ${uniques.length} colonnes trouvées`);
  });

  it("chaque colonne Decimal est présente dans le classement, financière ou non", () => {
    const nonClassees = uniques.filter((c) => !(c in CLASSEMENT_DECIMAL));
    assert.deepEqual(nonClassees, [], `Colonnes Decimal à classer dans CLASSEMENT_DECIMAL : ${nonClassees.join(", ")}`);
  });

  it("le classement ne contient pas de colonne disparue du schéma", () => {
    const obsoletes = Object.keys(CLASSEMENT_DECIMAL).filter((c) => !uniques.includes(c));
    assert.deepEqual(obsoletes, []);
  });

  it("toute colonne financière est masquée par sa clé de réponse (sauf Paiement.montant et Depense.montant, réservés par permission)", () => {
    const protegeesParRoute = new Set(["Paiement.montant", "Depense.montant"]);
    for (const [colonne, financiere] of Object.entries(CLASSEMENT_DECIMAL)) {
      if (!financiere || protegeesParRoute.has(colonne)) continue;
      const cle = colonne.split(".")[1];
      assert.ok(CLES_FINANCIERES.has(cle), `${colonne} : la clé « ${cle} » n'est pas masquée`);
    }
  });
});
