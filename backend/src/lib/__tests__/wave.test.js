import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { verifierSignatureWebhook, signerWebhook, evaluerSession, paiementWaveActif } from "../wave.js";

const SECRET = "wave_sn_WHS_secret_de_test";
const CORPS = '{"id":"EV_1","type":"checkout.session.completed","data":{"id":"cos-1"}}';
const T = 1_700_000_000;
const maintenantMs = T * 1000;

describe("verifierSignatureWebhook", () => {
  const sig = signerWebhook(CORPS, SECRET, T);
  const verifier = (corps, entete, secret = SECRET, ms = maintenantMs) =>
    verifierSignatureWebhook(Buffer.from(corps), entete, secret, ms);

  it("accepte une signature valide", () => assert.equal(verifier(CORPS, sig), true));
  it("refuse un corps modifié d'un seul caractère", () => assert.equal(verifier(CORPS.replace("EV_1", "EV_2"), sig), false));
  it("refuse un autre secret", () => assert.equal(verifier(CORPS, sig, "autre-secret"), false));
  it("refuse un en-tête absent, vide ou mal formé", () => {
    assert.equal(verifier(CORPS, undefined), false);
    assert.equal(verifier(CORPS, ""), false);
    assert.equal(verifier(CORPS, "n'importe quoi"), false);
    assert.equal(verifier(CORPS, `t=${T}`), false, "sans v1");
    assert.equal(verifier(CORPS, `v1=${sig.split("v1=")[1]}`), false, "sans horodatage");
  });
  it("refuse un secret absent (jamais de confiance par défaut)", () => assert.equal(verifier(CORPS, sig, ""), false));
  it("refuse un horodatage trop ancien ou trop lointain (rejeu), tolère 5 minutes", () => {
    assert.equal(verifier(CORPS, sig, SECRET, maintenantMs + 301_000), false);
    assert.equal(verifier(CORPS, sig, SECRET, maintenantMs - 301_000), false);
    assert.equal(verifier(CORPS, sig, SECRET, maintenantMs + 299_000), true);
  });
  it("refuse un horodatage falsifié : la signature porte dessus", () => {
    const falsifiee = sig.replace(`t=${T}`, `t=${T + 1}`);
    assert.equal(verifier(CORPS, falsifiee), false);
  });
  it("accepte plusieurs signatures v1 (rotation du secret) dès qu'une est valide", () => {
    const bonne = sig.split("v1=")[1];
    assert.equal(verifier(CORPS, `t=${T},v1=${"0".repeat(64)},v1=${bonne}`), true);
    assert.equal(verifier(CORPS, `t=${T},v1=${"0".repeat(64)},v1=${"1".repeat(64)}`), false);
  });
  it("refuse une signature de longueur différente sans lever d'exception", () => {
    assert.equal(verifier(CORPS, `t=${T},v1=abc`), false);
  });
});

describe("evaluerSession", () => {
  const transaction = { referenceInterne: "WAV-abc", referenceExterne: "cos-1", montant: "27000" };
  const session = (extra = {}) => ({
    id: "cos-1",
    client_reference: "WAV-abc",
    amount: "27000",
    currency: "XOF",
    checkout_status: "complete",
    payment_status: "succeeded",
    ...extra,
  });

  it("paiement abouti et concordant : REUSSI", () => assert.equal(evaluerSession(session(), transaction).issue, "REUSSI"));
  it("le montant décimal de la base est comparé numériquement", () => {
    assert.equal(evaluerSession(session({ amount: "27000" }), { ...transaction, montant: "27000.00" }).issue, "REUSSI");
  });
  it("montant différent : INCOHERENT, jamais REUSSI", () => {
    const r = evaluerSession(session({ amount: "100" }), transaction);
    assert.equal(r.issue, "INCOHERENT");
    assert.match(r.raison, /montant/);
  });
  it("référence, session ou devise différentes : INCOHERENT", () => {
    assert.equal(evaluerSession(session({ client_reference: "WAV-autre" }), transaction).issue, "INCOHERENT");
    assert.equal(evaluerSession(session({ id: "cos-2" }), transaction).issue, "INCOHERENT");
    assert.equal(evaluerSession(session({ currency: "USD" }), transaction).issue, "INCOHERENT");
  });
  it("session non terminée ou paiement non abouti : EN_COURS, jamais REUSSI", () => {
    assert.equal(evaluerSession(session({ checkout_status: "open", payment_status: "processing" }), transaction).issue, "EN_COURS");
    assert.equal(evaluerSession(session({ checkout_status: "complete", payment_status: "cancelled" }), transaction).issue, "EN_COURS");
    assert.equal(evaluerSession(session({ checkout_status: "open", payment_status: "succeeded" }), transaction).issue, "EN_COURS");
  });
  it("session expirée : EXPIRE", () => {
    assert.equal(evaluerSession(session({ checkout_status: "expired", payment_status: "cancelled" }), transaction).issue, "EXPIRE");
  });
  it("réponse illisible : INCOHERENT", () => {
    assert.equal(evaluerSession(null, transaction).issue, "INCOHERENT");
    assert.equal(evaluerSession("ok", transaction).issue, "INCOHERENT");
  });
});

describe("paiementWaveActif — inactif par défaut", () => {
  const ENV = ["WAVE_ENABLED", "WAVE_API_KEY", "WAVE_WEBHOOK_SECRET"];
  const avant = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of ENV) {
      if (avant[k] === undefined) delete process.env[k];
      else process.env[k] = avant[k];
    }
  });
  const regler = (valeurs) => {
    for (const k of ENV) delete process.env[k];
    Object.assign(process.env, valeurs);
  };

  it("sans configuration : inactif", () => {
    regler({});
    assert.equal(paiementWaveActif(), false);
  });
  it("clés présentes mais non activées explicitement : inactif", () => {
    regler({ WAVE_API_KEY: "k", WAVE_WEBHOOK_SECRET: "s" });
    assert.equal(paiementWaveActif(), false);
  });
  it("activé mais clé ou secret manquant : inactif", () => {
    regler({ WAVE_ENABLED: "1", WAVE_API_KEY: "k" });
    assert.equal(paiementWaveActif(), false);
    regler({ WAVE_ENABLED: "1", WAVE_WEBHOOK_SECRET: "s" });
    assert.equal(paiementWaveActif(), false);
  });
  it("valeur autre que « 1 » : inactif", () => {
    regler({ WAVE_ENABLED: "true", WAVE_API_KEY: "k", WAVE_WEBHOOK_SECRET: "s" });
    assert.equal(paiementWaveActif(), false);
  });
  it("activé et configuré : actif", () => {
    regler({ WAVE_ENABLED: "1", WAVE_API_KEY: "k", WAVE_WEBHOOK_SECRET: "s" });
    assert.equal(paiementWaveActif(), true);
  });
});
