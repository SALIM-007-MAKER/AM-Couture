import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGUE,
  PERMISSIONS,
  PERMISSIONS_SENSIBLES,
  POSTES,
  NOMS_POSTES,
  normaliserPermissions,
  sensiblesAjoutees,
  aPermission,
  peutVoirFinances,
  permissionPourMethode,
  catalogueSerialise,
} from "../permissions.js";

describe("catalogue et postes", () => {
  it("chaque poste ne contient que des permissions du catalogue", () => {
    for (const [poste, liste] of Object.entries(POSTES)) {
      for (const p of liste) assert.ok(CATALOGUE[p], `${poste} : ${p} inconnue`);
    }
  });

  it("les droits qui donnent accès à l'argent sont les seuls sensibles", () => {
    assert.deepEqual(
      [...PERMISSIONS_SENSIBLES].sort(),
      ["depenses.ecrire", "depenses.lire", "finances.voir", "paiements.ecrire", "paiements.lire"],
    );
  });

  it("l'administration de l'atelier n'est pas déléguable", () => {
    for (const interdit of ["employes.gerer", "parametres.ecrire", "abonnement.gerer", "ateliers.gerer", "employes.lire"]) {
      assert.ok(!PERMISSIONS.includes(interdit), interdit);
    }
  });

  it("aucun poste, sauf comptable, ne donne accès à l'argent", () => {
    for (const poste of NOMS_POSTES.filter((n) => n !== "COMPTABLE")) {
      const sensibles = POSTES[poste].filter((p) => PERMISSIONS_SENSIBLES.has(p));
      assert.deepEqual(sensibles, [], poste);
    }
    assert.ok(POSTES.COMPTABLE.includes("finances.voir"));
  });

  it("le couturier peut lire et faire avancer les commandes, mais pas en créer", () => {
    assert.ok(POSTES.COUTURIER.includes("commandes.statut"));
    assert.ok(!POSTES.COUTURIER.includes("commandes.ecrire"));
  });
});

describe("normaliserPermissions", () => {
  it("dédoublonne et trie", () => {
    assert.deepEqual(normaliserPermissions(["stock.lire", "clientes.lire", "stock.lire"]), ["clientes.lire", "stock.lire"]);
  });
  it("une permission d'écriture ajoute la lecture du module", () => {
    assert.deepEqual(normaliserPermissions(["stock.ecrire"]), ["stock.ecrire", "stock.lire"]);
    // Enregistrer des paiements suppose de les lire, donc de voir les montants des commandes.
    assert.deepEqual(normaliserPermissions(["paiements.ecrire"]), ["finances.voir", "paiements.ecrire", "paiements.lire"]);
    assert.deepEqual(normaliserPermissions(["depenses.ecrire"]), ["depenses.ecrire", "depenses.lire"], "les dépenses n'ouvrent pas les montants des commandes");
  });
  it("changer le statut d'une commande suppose de la lire, sans donner le droit d'écrire", () => {
    const n = normaliserPermissions(["commandes.statut"]);
    assert.deepEqual(n, ["commandes.lire", "commandes.statut"]);
    assert.ok(!n.includes("commandes.ecrire"));
  });
  it("refuse une permission inconnue, en les nommant", () => {
    assert.throws(() => normaliserPermissions(["clientes.lire", "employes.gerer", "x.y"]), (e) => {
      assert.deepEqual(e.inconnues, ["employes.gerer", "x.y"]);
      return true;
    });
  });
  it("liste vide ou absente : aucune permission", () => {
    assert.deepEqual(normaliserPermissions([]), []);
    assert.deepEqual(normaliserPermissions(undefined), []);
  });
});

describe("sensiblesAjoutees", () => {
  it("ne retient que les droits sensibles réellement nouveaux", () => {
    assert.deepEqual(sensiblesAjoutees(["clientes.lire"], ["clientes.lire", "finances.voir"]), ["finances.voir"]);
    assert.deepEqual(sensiblesAjoutees(["finances.voir"], ["finances.voir", "stock.lire"]), []);
    assert.deepEqual(sensiblesAjoutees([], ["clientes.ecrire"]), []);
  });
  it("retirer un droit sensible ne demande aucune confirmation", () => {
    assert.deepEqual(sensiblesAjoutees(["finances.voir", "depenses.lire"], ["stock.lire"]), []);
  });
});

describe("aPermission", () => {
  it("le PDG (ADMIN) a tout", () => {
    assert.equal(aPermission({ role: "ADMIN" }, "finances.voir"), true);
    assert.equal(aPermission({ role: "ADMIN", permissions: [] }, "depenses.ecrire"), true);
  });
  it("un employé n'a que ce qui lui est accordé", () => {
    const e = { role: "EMPLOYE", permissions: ["clientes.lire"] };
    assert.equal(aPermission(e, "clientes.lire"), true);
    assert.equal(aPermission(e, "clientes.ecrire"), false);
    assert.equal(aPermission(e, "finances.voir"), false);
    assert.equal(aPermission({ role: "EMPLOYE" }, "clientes.lire"), false, "permissions absentes = aucun droit");
  });
  it("une cliente finale ou le SUPERADMIN n'ont aucun droit d'atelier", () => {
    assert.equal(aPermission({ role: "USER", permissions: ["clientes.lire"] }, "clientes.lire"), false);
    assert.equal(aPermission({ role: "SUPERADMIN" }, "clientes.lire"), false);
    assert.equal(aPermission(null, "clientes.lire"), false);
  });
  it("peutVoirFinances", () => {
    assert.equal(peutVoirFinances({ role: "ADMIN" }), true);
    assert.equal(peutVoirFinances({ role: "EMPLOYE", permissions: ["finances.voir"] }), true);
    assert.equal(peutVoirFinances({ role: "EMPLOYE", permissions: ["paiements.lire"] }), false);
  });
});

describe("permissionPourMethode", () => {
  it("lecture pour GET/HEAD/OPTIONS, écriture pour le reste", () => {
    assert.equal(permissionPourMethode("clientes", "GET"), "clientes.lire");
    assert.equal(permissionPourMethode("clientes", "HEAD"), "clientes.lire");
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(permissionPourMethode("stock", m), "stock.ecrire");
  });
});

describe("catalogueSerialise", () => {
  it("regroupe par module et expose postes et droits sensibles", () => {
    const c = catalogueSerialise();
    assert.deepEqual(c.modules.clientes.map((x) => x.permission), ["clientes.lire", "clientes.ecrire"]);
    assert.ok(c.modules.finances[0].sensible);
    assert.deepEqual(Object.keys(c.postes), NOMS_POSTES);
    assert.ok(c.sensibles.includes("depenses.ecrire"));
  });
});
