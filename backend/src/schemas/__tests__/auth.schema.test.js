import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loginSchema, motDePasseOublieSchema, reinitialiserMotDePasseTokenSchema } from "../auth.schema.js";

describe("loginSchema", () => {
  test("accepte identifiant + mot de passe non vides", () => {
    assert.equal(loginSchema.safeParse({ identifiant: "admin", password: "x" }).success, true);
  });

  test("rejette un identifiant vide", () => {
    assert.equal(loginSchema.safeParse({ identifiant: "", password: "x" }).success, false);
  });

  test("rejette un mot de passe vide", () => {
    assert.equal(loginSchema.safeParse({ identifiant: "admin", password: "" }).success, false);
  });
});

describe("motDePasseOublieSchema", () => {
  test("accepte un identifiant non vide", () => {
    assert.equal(motDePasseOublieSchema.safeParse({ identifiant: "admin" }).success, true);
  });

  test("rejette un identifiant vide", () => {
    assert.equal(motDePasseOublieSchema.safeParse({ identifiant: "" }).success, false);
  });
});

describe("reinitialiserMotDePasseTokenSchema", () => {
  test("accepte un jeton + mot de passe valide", () => {
    assert.equal(
      reinitialiserMotDePasseTokenSchema.safeParse({ token: "abc123", nouveauMotDePasse: "assezlong1" }).success,
      true,
    );
  });

  test("rejette un jeton vide", () => {
    assert.equal(
      reinitialiserMotDePasseTokenSchema.safeParse({ token: "", nouveauMotDePasse: "assezlong1" }).success,
      false,
    );
  });

  test("rejette un mot de passe trop court", () => {
    assert.equal(
      reinitialiserMotDePasseTokenSchema.safeParse({ token: "abc123", nouveauMotDePasse: "court" }).success,
      false,
    );
  });
});
