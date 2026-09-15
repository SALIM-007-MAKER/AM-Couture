import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dateField, dateRangeEndField } from "../dateField.js";

function parse(schema, value) {
  return schema.safeParse(value);
}

describe("dateField", () => {
  test("accepte une date simple AAAA-MM-JJ", () => {
    const result = parse(dateField, "2026-09-15");
    assert.equal(result.success, true);
    assert.equal(result.data.toISOString(), "2026-09-15T00:00:00.000Z");
  });

  test("accepte une date-heure ISO complète avec Z", () => {
    const result = parse(dateField, "2026-09-15T14:30:00Z");
    assert.equal(result.success, true);
    assert.equal(result.data.toISOString(), "2026-09-15T14:30:00.000Z");
  });

  test("rejette un format non zéro-paddé (piège d'interprétation locale)", () => {
    assert.equal(parse(dateField, "2026-9-5").success, false);
  });

  test("rejette une date avec des slashes", () => {
    assert.equal(parse(dateField, "15/09/2026").success, false);
  });

  test("rejette le 31 avril (jour inexistant)", () => {
    assert.equal(parse(dateField, "2026-04-31").success, false);
  });

  test("rejette le 30 février", () => {
    assert.equal(parse(dateField, "2026-02-30").success, false);
  });

  test("accepte le 29 février d'une année bissextile", () => {
    assert.equal(parse(dateField, "2028-02-29").success, true);
  });

  test("rejette le 29 février d'une année NON bissextile", () => {
    assert.equal(parse(dateField, "2026-02-29").success, false);
  });

  test("rejette une année hors bornes raisonnables", () => {
    assert.equal(parse(dateField, "1999-01-01").success, false);
    assert.equal(parse(dateField, "2999-01-01").success, false);
  });

  test("rejette un mois invalide (13)", () => {
    assert.equal(parse(dateField, "2026-13-01").success, false);
  });
});

describe("dateRangeEndField", () => {
  test("une date seule (sans heure) avance au début du jour SUIVANT", () => {
    const result = parse(dateRangeEndField, "2026-09-04");
    assert.equal(result.success, true);
    assert.equal(result.data.toISOString(), "2026-09-05T00:00:00.000Z");
  });

  test("un horodatage précis (avec heure) reste tel quel, sans décalage", () => {
    const result = parse(dateRangeEndField, "2026-09-04T18:00:00Z");
    assert.equal(result.success, true);
    assert.equal(result.data.toISOString(), "2026-09-04T18:00:00.000Z");
  });

  test("le passage au jour suivant gère correctement un changement de mois", () => {
    const result = parse(dateRangeEndField, "2026-01-31");
    assert.equal(result.success, true);
    assert.equal(result.data.toISOString(), "2026-02-01T00:00:00.000Z");
  });
});
