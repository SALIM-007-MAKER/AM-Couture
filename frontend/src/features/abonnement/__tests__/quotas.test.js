import { test } from "node:test";
import assert from "node:assert/strict";
import { RESSOURCES, formaterLimite } from "../quotas.js";
import { RESSOURCES as RESSOURCES_SERVEUR } from "../../../../../backend/src/lib/quotas.js";

test("la liste des ressources est la même côté interface et côté serveur (même ordre)", () => {
  assert.deepEqual(RESSOURCES, RESSOURCES_SERVEUR);
});

test("formaterLimite : nombre lisible, null pour illimité", () => {
  assert.equal(formaterLimite(null), null);
  assert.equal(formaterLimite(undefined), null);
  assert.match(formaterLimite(1000), /^1\D?000$/);
  assert.equal(formaterLimite(50), "50");
});

// ── Jauges et messages ───────────────────────────────────────────────────────────────────────────────────────────────
import { pourcentage, teintesJauge, messageQuota } from "../quotas.js";
import { ApiError } from "../../../lib/apiError.js";
import { messageUtilisateur } from "../../../lib/errorMessage.js";
import { translate } from "../../../i18n/index.js";
import { useLocaleStore } from "../../../stores/localeStore.js";

test("pourcentage : de 0 à 100, barre pleine au-dessus de la limite, 0 sans limite", () => {
  assert.equal(pourcentage(0, 100), 0);
  assert.equal(pourcentage(37, 100), 37);
  assert.equal(pourcentage(140, 100), 100);
  assert.equal(pourcentage(5, 0), 0);
  assert.equal(pourcentage(5, null), 0);
});

test("teintesJauge : neutre, orange puis rouge selon l'état", () => {
  assert.match(teintesJauge("ok").barre, /brand/);
  assert.match(teintesJauge("proche").barre, /amber/);
  assert.match(teintesJauge("atteint").barre, /red/);
  assert.match(teintesJauge("depasse").barre, /red/);
  assert.match(teintesJauge("illimite").texte, /neutral/);
});

const refusQuota = (ressource, limite, usage) => new ApiError(409, "Quota atteint", { quota: { ressource, limite, usage } });
const enLangue = (langue, f) => {
  const avant = useLocaleStore.getState().locale;
  useLocaleStore.setState({ locale: langue });
  try {
    return f();
  } finally {
    useLocaleStore.setState({ locale: avant });
  }
};

test("messageQuota : message traduit (FR et EN) avec la limite et l'usage ; null pour toute autre erreur", () => {
  for (const ressource of RESSOURCES) {
    const fr = enLangue("fr", () => messageQuota(refusQuota(ressource, 100, 140), translate));
    assert.match(fr, /100/);
    assert.match(fr, /140/);
    assert.ok(!fr.startsWith("quotas."), `clé non traduite : ${fr}`);
    const en = enLangue("en", () => messageQuota(refusQuota(ressource, 100, 140), translate));
    assert.match(en, /limit/i);
    assert.notEqual(en, fr);
  }
  assert.equal(messageQuota(new ApiError(409, "Doublon", { clienteId: "x" }), translate), null);
  assert.equal(messageQuota(new ApiError(402, "Lecture seule", { lectureSeule: true }), translate), null);
  assert.equal(messageQuota(new ApiError(409, "x", { quota: { ressource: "inconnue", limite: 1, usage: 1 } }), translate), null);
  assert.equal(messageQuota(null, translate), null);
});

test("messageUtilisateur : un refus de quota donne le message traduit, jamais la bannière de lecture seule (402 inchangé)", () => {
  const { message } = enLangue("fr", () => messageUtilisateur(refusQuota("clientes", 100, 100), translate));
  assert.match(message, /limite de 100/);
  assert.equal(messageUtilisateur(new ApiError(409, "Un client existe déjà", { clienteId: "c1" }), translate).message, "Un client existe déjà");
  assert.equal(messageUtilisateur(new ApiError(402, "Lecture seule", { lectureSeule: true }), translate).message, "Lecture seule");
});
