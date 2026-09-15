import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  creerAtelierSchema,
  inscriptionAtelierSchema,
  patchAtelierSchema,
  statutAtelierSchema,
  ajouterCompteSchema,
  reinitialiserMotDePasseSchema,
  listAteliersQuerySchema,
} from "../atelierAdmin.schema.js";

describe("creerAtelierSchema (provisioning SUPERADMIN)", () => {
  const valide = { nom: "Atelier Test", adminIdentifiant: "admin_test", adminPassword: "MotDePasse1234" };

  test("accepte le minimum requis, applique le défaut devise=FCFA", () => {
    const result = creerAtelierSchema.safeParse(valide);
    assert.equal(result.success, true);
    assert.equal(result.data.devise, "FCFA");
  });

  test("rejette un identifiant admin trop court (< 3)", () => {
    assert.equal(creerAtelierSchema.safeParse({ ...valide, adminIdentifiant: "ab" }).success, false);
  });

  test("rejette un mot de passe trop court (< 8)", () => {
    assert.equal(creerAtelierSchema.safeParse({ ...valide, adminPassword: "court1" }).success, false);
  });

  test("rejette un nom d'atelier vide", () => {
    assert.equal(creerAtelierSchema.safeParse({ ...valide, nom: "" }).success, false);
  });

  test("rejette tout champ inattendu (.strict())", () => {
    assert.equal(creerAtelierSchema.safeParse({ ...valide, role: "SUPERADMIN" }).success, false);
  });

  test("téléphone reste optionnel mais validé s'il est fourni", () => {
    assert.equal(creerAtelierSchema.safeParse({ ...valide, telephone: "+22796592253" }).success, true);
    assert.equal(creerAtelierSchema.safeParse({ ...valide, telephone: "abc" }).success, false);
  });
});

describe("inscriptionAtelierSchema (libre-service)", () => {
  const valide = {
    prenom: "Fatou",
    nomProprietaire: "Diallo",
    email: "fatou@exemple.com",
    adminPassword: "MotDePasse1234",
    telephone: "+22796592253",
  };

  test("accepte sans nom d'atelier (repli géré côté route, pas ici)", () => {
    const result = inscriptionAtelierSchema.safeParse(valide);
    assert.equal(result.success, true);
    assert.equal(result.data.nom, undefined);
  });

  test("le téléphone est ICI obligatoire (contrairement à creerAtelierSchema)", () => {
    const { telephone, ...sansTelephone } = valide;
    assert.equal(inscriptionAtelierSchema.safeParse(sansTelephone).success, false);
  });

  test("rejette un email invalide", () => {
    assert.equal(inscriptionAtelierSchema.safeParse({ ...valide, email: "pas-un-email" }).success, false);
  });

  test("normalise l'email en minuscules", () => {
    const result = inscriptionAtelierSchema.safeParse({ ...valide, email: "Fatou@Exemple.COM" });
    assert.equal(result.success, true);
    assert.equal(result.data.email, "fatou@exemple.com");
  });

  test("n'accepte pas adminIdentifiant (l'email en tient lieu, voir la route)", () => {
    assert.equal(inscriptionAtelierSchema.safeParse({ ...valide, adminIdentifiant: "test" }).success, false);
  });

  test("langue par défaut fr, mais valeur explicite acceptée", () => {
    assert.equal(inscriptionAtelierSchema.safeParse(valide).data.langue, "fr");
    assert.equal(inscriptionAtelierSchema.safeParse({ ...valide, langue: "en" }).data.langue, "en");
    assert.equal(inscriptionAtelierSchema.safeParse({ ...valide, langue: "xx" }).success, false);
  });
});

describe("patchAtelierSchema", () => {
  test("rejette un objet vide (rien à modifier)", () => {
    assert.equal(patchAtelierSchema.safeParse({}).success, false);
  });

  test("accepte un seul champ fourni", () => {
    assert.equal(patchAtelierSchema.safeParse({ ville: "Niamey" }).success, true);
  });
});

describe("statutAtelierSchema", () => {
  test("exige un booléen", () => {
    assert.equal(statutAtelierSchema.safeParse({ actif: true }).success, true);
    assert.equal(statutAtelierSchema.safeParse({ actif: "true" }).success, false);
  });
});

describe("ajouterCompteSchema", () => {
  test("identité (prénom/nom/email) optionnelle ici, contrairement à l'inscription", () => {
    const result = ajouterCompteSchema.safeParse({ identifiant: "employe1", password: "MotDePasse1234" });
    assert.equal(result.success, true);
  });

  test("rejette un email invalide s'il est fourni", () => {
    assert.equal(
      ajouterCompteSchema.safeParse({ identifiant: "e1", password: "MotDePasse1234", email: "pas-bon" }).success,
      false,
    );
  });
});

describe("reinitialiserMotDePasseSchema", () => {
  test("exige 8 caractères minimum", () => {
    assert.equal(reinitialiserMotDePasseSchema.safeParse({ nouveauMotDePasse: "court" }).success, false);
    assert.equal(reinitialiserMotDePasseSchema.safeParse({ nouveauMotDePasse: "assezlong1" }).success, true);
  });
});

describe("listAteliersQuerySchema", () => {
  test("valeurs par défaut : page 1, pageSize 20", () => {
    const result = listAteliersQuerySchema.safeParse({});
    assert.equal(result.data.page, 1);
    assert.equal(result.data.pageSize, 20);
  });

  test("coerce les chaînes de query string en nombres", () => {
    const result = listAteliersQuerySchema.safeParse({ page: "3", pageSize: "50" });
    assert.equal(result.data.page, 3);
    assert.equal(result.data.pageSize, 50);
  });

  test("rejette pageSize au-delà de 100", () => {
    assert.equal(listAteliersQuerySchema.safeParse({ pageSize: "101" }).success, false);
  });

  test("q vide traité comme absent", () => {
    assert.equal(listAteliersQuerySchema.safeParse({ q: "" }).data.q, undefined);
  });
});
