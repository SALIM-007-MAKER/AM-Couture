// Jetons à usage unique (lib/tokenAction.js) : la consommation est atomique, même sous requêtes simultanées.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { creerToken, consommerToken, hacherToken } from "../lib/tokenAction.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";

const TYPE = "REINITIALISATION_MOT_DE_PASSE";

describe("Jetons d'action — usage unique atomique", () => {
  let atelier, admin;

  before(async () => {
    ({ atelier, admin } = await creerAtelierEtAdmin({ nom: "Atelier Jetons" }));
  });

  after(async () => {
    await prisma.tokenAction.deleteMany({ where: { userId: admin.id } });
    await supprimerAtelier(atelier.id);
    await prisma.$disconnect();
  });

  const estRefus = (r) => r.status === "rejected" && r.reason instanceof HttpError && r.reason.status === 400;

  it("20 consommations simultanées du même jeton : une seule réussit, toutes les autres sont refusées en 400", async () => {
    for (let manche = 0; manche < 5; manche++) {
      const token = await creerToken({ userId: admin.id, type: TYPE, dureeMs: 60_000 });
      const res = await Promise.allSettled(Array.from({ length: 20 }, () => consommerToken({ token, type: TYPE })));
      const reussies = res.filter((r) => r.status === "fulfilled");
      assert.equal(reussies.length, 1, `manche ${manche} : ${reussies.length} consommations ont réussi (attendu : 1)`);
      assert.equal(reussies[0].value.id, admin.id, "la réussite renvoie bien l'utilisateur du jeton");
      assert.equal(res.filter(estRefus).length, 19, "les 19 autres échouent en HttpError 400");
      const ligne = await prisma.tokenAction.findUnique({ where: { token: hacherToken(token) } });
      assert.ok(ligne.utiliseLe, "le jeton est marqué utilisé");
    }
  });

  it("jeton déjà consommé : refusé en 400", async () => {
    const token = await creerToken({ userId: admin.id, type: TYPE, dureeMs: 60_000 });
    await consommerToken({ token, type: TYPE });
    await assert.rejects(() => consommerToken({ token, type: TYPE }), (e) => e instanceof HttpError && e.status === 400);
  });

  it("jeton expiré : refusé en 400 et non marqué utilisé", async () => {
    const token = await creerToken({ userId: admin.id, type: TYPE, dureeMs: 60_000 });
    await prisma.tokenAction.update({ where: { token: hacherToken(token) }, data: { expireLe: new Date(Date.now() - 1000) } });
    await assert.rejects(() => consommerToken({ token, type: TYPE }), (e) => e instanceof HttpError && e.status === 400);
    assert.equal((await prisma.tokenAction.findUnique({ where: { token: hacherToken(token) } })).utiliseLe, null);
  });

  it("jeton inexistant : refusé en 400", async () => {
    await assert.rejects(() => consommerToken({ token: "0".repeat(64), type: TYPE }), (e) => e instanceof HttpError && e.status === 400);
  });

  it("mauvais type de jeton : refusé en 400 et le jeton reste utilisable pour son vrai type", async () => {
    const token = await creerToken({ userId: admin.id, type: TYPE, dureeMs: 60_000 });
    await assert.rejects(() => consommerToken({ token, type: "VERIFICATION_EMAIL" }), (e) => e instanceof HttpError && e.status === 400);
    assert.equal((await consommerToken({ token, type: TYPE })).id, admin.id);
  });

  it("deux jetons distincts de la même personne se consomment indépendamment, en parallèle", async () => {
    const [a, b] = await Promise.all([creerToken({ userId: admin.id, type: TYPE, dureeMs: 60_000 }), creerToken({ userId: admin.id, type: TYPE, dureeMs: 60_000 })]);
    const res = await Promise.allSettled([consommerToken({ token: a, type: TYPE }), consommerToken({ token: b, type: TYPE })]);
    assert.equal(res.filter((r) => r.status === "fulfilled").length, 2);
  });
});
