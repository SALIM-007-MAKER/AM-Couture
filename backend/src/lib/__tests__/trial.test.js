import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { essaiExpire } from "../trial.js";

describe("essaiExpire", () => {
  test("trialEndsAt null (atelier légataire) -> jamais expiré", () => {
    assert.equal(essaiExpire({ trialEndsAt: null }, new Date("2099-01-01")), false);
  });

  test("avant l'échéance -> pas expiré", () => {
    const atelier = { trialEndsAt: new Date("2026-09-20T00:00:00Z") };
    assert.equal(essaiExpire(atelier, new Date("2026-09-19T23:59:59Z")), false);
  });

  test("après l'échéance -> expiré", () => {
    const atelier = { trialEndsAt: new Date("2026-09-20T00:00:00Z") };
    assert.equal(essaiExpire(atelier, new Date("2026-09-20T00:00:01Z")), true);
  });

  test("exactement à l'échéance -> expiré (borne inclusive)", () => {
    const atelier = { trialEndsAt: new Date("2026-09-20T00:00:00Z") };
    assert.equal(essaiExpire(atelier, new Date("2026-09-20T00:00:00Z")), true);
  });
});
