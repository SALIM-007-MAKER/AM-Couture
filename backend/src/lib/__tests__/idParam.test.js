import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { requireValidIdParam } from "../idParam.js";

// requireValidIdParam est un middleware `router.param()` : (req, res, next, value).
// req/res ne sont jamais lus par cette fonction — objets vides suffisants.
function appelle(value) {
  let erreur;
  requireValidIdParam({}, {}, (err) => (erreur = err), value);
  return erreur;
}

describe("requireValidIdParam", () => {
  test("laisse passer un identifiant cuid plausible", () => {
    assert.equal(appelle("cmtme90xf0000l8vn0gq35e2r"), undefined);
  });

  test("rejette une chaîne vide", () => {
    const err = appelle("");
    assert.ok(err);
    assert.equal(err.status, 400);
  });

  test("rejette un octet nul (tentative d'injection classique)", () => {
    const err = appelle("abc\x00def");
    assert.ok(err);
    assert.equal(err.status, 400);
  });

  test("rejette d'autres caractères de contrôle", () => {
    assert.ok(appelle("abc\x1fdef"));
    assert.ok(appelle("abc\ndef")); // \n (0x0A) est aussi un caractère de contrôle
  });

  test("rejette une longueur absurde (> 100 caractères)", () => {
    assert.ok(appelle("a".repeat(101)));
  });

  test("accepte exactement 100 caractères (borne incluse)", () => {
    assert.equal(appelle("a".repeat(100)), undefined);
  });

  test("rejette une valeur qui n'est pas une chaîne", () => {
    assert.ok(appelle(undefined));
    assert.ok(appelle(null));
    assert.ok(appelle(123));
  });
});
