import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computePeriodBounds,
  resolvePeriod,
  dateRangeWhere,
  monthKey,
  defaultEvolutionRange,
  monthsInRange,
  previousPeriodBounds,
  variationPct,
} from "../period.js";

// Ancre fixe pour des tests déterministes — un mercredi (voir "week" ci-dessous).
const MERCREDI = new Date("2026-09-16T12:00:00Z");

describe("computePeriodBounds", () => {
  test("today : bornes du jour courant en UTC", () => {
    const { from, to } = computePeriodBounds("today", MERCREDI);
    assert.equal(from.toISOString(), "2026-09-16T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-09-17T00:00:00.000Z");
  });

  test("week : commence le lundi (convention ISO/FR), pas le dimanche", () => {
    const { from, to } = computePeriodBounds("week", MERCREDI);
    // 16 sept. 2026 est un mercredi -> lundi précédent = 14 sept.
    assert.equal(from.toISOString(), "2026-09-14T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-09-21T00:00:00.000Z");
  });

  test("week : un dimanche appartient à la semaine qui se termine ce jour-là", () => {
    const dimanche = new Date("2026-09-20T12:00:00Z");
    const { from, to } = computePeriodBounds("week", dimanche);
    assert.equal(from.toISOString(), "2026-09-14T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-09-21T00:00:00.000Z");
  });

  test("month : bornes du mois courant", () => {
    const { from, to } = computePeriodBounds("month", MERCREDI);
    assert.equal(from.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-10-01T00:00:00.000Z");
  });

  test("quarter : le 16 septembre appartient au 3e trimestre (juillet-septembre)", () => {
    const { from, to } = computePeriodBounds("quarter", MERCREDI);
    assert.equal(from.toISOString(), "2026-07-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-10-01T00:00:00.000Z");
  });

  test("year : bornes de l'année courante", () => {
    const { from, to } = computePeriodBounds("year", MERCREDI);
    assert.equal(from.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2027-01-01T00:00:00.000Z");
  });

  test("préréglage inconnu : aucune borne", () => {
    const { from, to } = computePeriodBounds("bogus", MERCREDI);
    assert.equal(from, undefined);
    assert.equal(to, undefined);
  });
});

describe("resolvePeriod", () => {
  test("from/to explicites priment toujours sur period", () => {
    const from = new Date("2026-01-01");
    const result = resolvePeriod({ period: "today", from, to: undefined });
    assert.equal(result.from, from);
    assert.equal(result.to, undefined);
  });

  test("period seul, sans from/to", () => {
    const result = resolvePeriod({ period: "month", from: undefined, to: undefined });
    assert.ok(result.from instanceof Date);
    assert.ok(result.to instanceof Date);
  });

  test("ni period ni from/to : aucun filtre", () => {
    const result = resolvePeriod({ period: undefined, from: undefined, to: undefined });
    assert.equal(result.from, undefined);
    assert.equal(result.to, undefined);
  });
});

describe("dateRangeWhere", () => {
  test("aucune borne -> undefined (pas de filtre Prisma)", () => {
    assert.equal(dateRangeWhere(undefined, undefined), undefined);
  });

  test("from seul -> { gte }", () => {
    const from = new Date("2026-01-01");
    assert.deepEqual(dateRangeWhere(from, undefined), { gte: from });
  });

  test("to seul -> { lt } (toujours exclusif)", () => {
    const to = new Date("2026-02-01");
    assert.deepEqual(dateRangeWhere(undefined, to), { lt: to });
  });

  test("from et to -> les deux combinés", () => {
    const from = new Date("2026-01-01");
    const to = new Date("2026-02-01");
    assert.deepEqual(dateRangeWhere(from, to), { gte: from, lt: to });
  });
});

describe("monthKey", () => {
  test("formate année-mois avec zéro de tête", () => {
    assert.equal(monthKey(new Date("2026-01-05T00:00:00Z")), "2026-01");
    assert.equal(monthKey(new Date("2026-12-31T23:59:59Z")), "2026-12");
  });
});

describe("defaultEvolutionRange", () => {
  test("couvre exactement les 12 derniers mois, mois courant inclus", () => {
    const { from, to } = defaultEvolutionRange(MERCREDI);
    assert.equal(from.toISOString(), "2025-10-01T00:00:00.000Z");
    assert.equal(to.toISOString(), "2026-10-01T00:00:00.000Z");
    assert.equal(monthsInRange(from, to).length, 12);
  });
});

describe("previousPeriodBounds", () => {
  test("mois précédent : le mois civil précédent, pas -30 jours fixes (août a 31 jours)", () => {
    const { from, to } = computePeriodBounds("month", MERCREDI); // sept. 2026 (30 j)
    const prec = previousPeriodBounds(from, to);
    assert.equal(prec.from.toISOString(), "2026-08-01T00:00:00.000Z");
    assert.equal(prec.to.toISOString(), "2026-09-01T00:00:00.000Z"); // = from de la période demandée
  });

  test("trimestre précédent : décalé de 3 mois civils", () => {
    const { from, to } = computePeriodBounds("quarter", MERCREDI); // juil-sept 2026
    const prec = previousPeriodBounds(from, to);
    assert.equal(prec.from.toISOString(), "2026-04-01T00:00:00.000Z");
    assert.equal(prec.to.toISOString(), "2026-07-01T00:00:00.000Z");
  });

  test("année précédente : décalée de 12 mois civils", () => {
    const { from, to } = computePeriodBounds("year", MERCREDI);
    const prec = previousPeriodBounds(from, to);
    assert.equal(prec.from.toISOString(), "2025-01-01T00:00:00.000Z");
    assert.equal(prec.to.toISOString(), "2026-01-01T00:00:00.000Z");
  });

  test("semaine précédente : décalée par durée exacte (7 jours), pas alignée sur le mois", () => {
    const { from, to } = computePeriodBounds("week", MERCREDI); // 14-21 sept. 2026
    const prec = previousPeriodBounds(from, to);
    assert.equal(prec.from.toISOString(), "2026-09-07T00:00:00.000Z");
    assert.equal(prec.to.toISOString(), "2026-09-14T00:00:00.000Z");
  });

  test("plage personnalisée non alignée sur des mois : décalée de sa propre durée", () => {
    const from = new Date("2026-03-10T00:00:00Z");
    const to = new Date("2026-03-20T00:00:00Z"); // 10 jours
    const prec = previousPeriodBounds(from, to);
    assert.equal(prec.from.toISOString(), "2026-02-28T00:00:00.000Z");
    assert.equal(prec.to.toISOString(), "2026-03-10T00:00:00.000Z");
  });

  test("borne manquante (from ou to) -> null, pas de comparaison possible", () => {
    assert.equal(previousPeriodBounds(new Date(), undefined), null);
    assert.equal(previousPeriodBounds(undefined, new Date()), null);
    assert.equal(previousPeriodBounds(undefined, undefined), null);
  });
});

describe("variationPct", () => {
  test("hausse : pourcentage positif arrondi à une décimale", () => {
    assert.equal(variationPct(150, 100), 50);
    assert.equal(variationPct(133, 100), 33);
  });

  test("baisse : pourcentage négatif", () => {
    assert.equal(variationPct(80, 100), -20);
  });

  test("précédent = actuel = 0 -> 0, pas null (aucun changement)", () => {
    assert.equal(variationPct(0, 0), 0);
  });

  test("précédent = 0 et actuel > 0 -> null (non calculable depuis zéro)", () => {
    assert.equal(variationPct(500, 0), null);
  });

  test("accepte des Decimal-like (toString/valueOf) via Number()", () => {
    assert.equal(variationPct("150", "100"), 50);
  });
});

describe("monthsInRange", () => {
  test("liste les 1ers du mois entre from (inclus) et to (exclusif)", () => {
    const months = monthsInRange(new Date("2026-01-15"), new Date("2026-04-01"));
    assert.deepEqual(
      months.map((m) => m.toISOString()),
      ["2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z"],
    );
  });

  test("plage vide si from >= to", () => {
    assert.deepEqual(monthsInRange(new Date("2026-05-01"), new Date("2026-05-01")), []);
  });
});
