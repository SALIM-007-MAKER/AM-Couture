import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, erreurDepuisReponse, kindFromStatus } from "../apiError.js";
import { messageUtilisateur } from "../errorMessage.js";

const t = (cle) => `[${cle}]`;
const entetes = (o) => ({ get: (n) => o[n] ?? null });

test("kindFromStatus", () => {
  assert.equal(kindFromStatus(400), "client");
  assert.equal(kindFromStatus(404), "client");
  assert.equal(kindFromStatus(413), "tooLarge");
  assert.equal(kindFromStatus(500), "server");
  assert.equal(kindFromStatus(502), "server");
  assert.equal(kindFromStatus(503), "unavailable");
});

test("erreurDepuisReponse : requestId du corps, sinon de l'en-tête ; retryAfter", () => {
  const a = erreurDepuisReponse(500, { error: "x", requestId: "corps-1" }, entetes({ "X-Request-Id": "entete-1" }));
  assert.equal(a.requestId, "corps-1");
  const b = erreurDepuisReponse(503, { error: "x" }, entetes({ "X-Request-Id": "entete-2", "Retry-After": "5" }));
  assert.equal(b.requestId, "entete-2");
  assert.equal(b.retryAfter, 5);
  assert.equal(b.kind, "unavailable");
});

test("erreurDepuisReponse : corps non JSON (page d'erreur de la plateforme) → message par défaut, statut conservé", () => {
  const e = erreurDepuisReponse(504, null, entetes({}));
  assert.equal(e.status, 504);
  assert.equal(e.kind, "server");
  assert.equal(e.message, "Une erreur est survenue.");
  assert.equal(e.requestId, null);
});

test("erreurDepuisReponse : Retry-After invalide ignoré ; en-têtes absents tolérés", () => {
  assert.equal(erreurDepuisReponse(503, null, entetes({ "Retry-After": "abc" })).retryAfter, null);
  assert.doesNotThrow(() => erreurDepuisReponse(500, null, undefined));
});

test("4xx : message du serveur tel quel, aucune référence", () => {
  const e = erreurDepuisReponse(409, { error: "Un enregistrement identique existe déjà." }, entetes({ "X-Request-Id": "r" }));
  assert.deepEqual(messageUtilisateur(e, t), { message: "Un enregistrement identique existe déjà.", reference: null });
});

test("429 : le message précis du serveur (délai d'attente) est conservé", () => {
  const e = erreurDepuisReponse(429, { error: "Trop de tentatives. Réessayez dans 15 minutes." }, entetes({}));
  assert.equal(messageUtilisateur(e, t).message, "Trop de tentatives. Réessayez dans 15 minutes.");
});

test("500 : message traduit + référence, jamais le texte du serveur", () => {
  const e = erreurDepuisReponse(500, { error: "Une erreur est survenue.", requestId: "abc-123" }, entetes({}));
  assert.deepEqual(messageUtilisateur(e, t), { message: "[ui.errorServer]", reference: "abc-123" });
});

test("503 : message d'indisponibilité + référence ; 413 : trop volumineux sans référence", () => {
  assert.deepEqual(messageUtilisateur(erreurDepuisReponse(503, { requestId: "z" }, entetes({})), t), { message: "[ui.errorUnavailable]", reference: "z" });
  assert.deepEqual(messageUtilisateur(erreurDepuisReponse(413, { error: "Requête trop volumineuse." }, entetes({})), t), { message: "[ui.errorTooLarge]", reference: null });
});

test("réseau et délai : messages dédiés, pas de référence", () => {
  assert.deepEqual(messageUtilisateur(new ApiError(0, "x", undefined, { kind: "network" }), t), { message: "[ui.errorNetwork]", reference: null });
  assert.deepEqual(messageUtilisateur(new ApiError(0, "x", undefined, { kind: "timeout" }), t), { message: "[ui.errorTimeout]", reference: null });
});

test("erreur qui n'est pas une ApiError (bug applicatif) : message générique, rien de technique exposé", () => {
  assert.deepEqual(messageUtilisateur(new TypeError("Cannot read properties of undefined"), t), { message: "[ui.errorGeneric]", reference: null });
  assert.deepEqual(messageUtilisateur(null, t), { message: "[ui.errorGeneric]", reference: null });
});

test("constructeur historique ApiError(status, message, details) inchangé", () => {
  const e = new ApiError(400, "Invalide", { nom: ["requis"] });
  assert.equal(e.kind, "client");
  assert.deepEqual(e.details, { nom: ["requis"] });
  assert.equal(e.requestId, null);
});
