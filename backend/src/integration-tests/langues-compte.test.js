// Langues proposées : français et anglais seulement (le haoussa a été retiré).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, client, creerAtelierEtAdmin, supprimerAtelier } from "./helpers.js";

describe("Langue du compte", () => {
  let server, baseUrl, A, pdg, compte;

  before(async () => {
    ({ server, baseUrl } = await demarrerServeur());
    compte = await creerAtelierEtAdmin({ nom: "Atelier Langue" });
    A = compte.atelier;
    pdg = client(baseUrl);
    assert.equal((await pdg.post("/api/auth/login", { identifiant: compte.identifiant, password: compte.password })).status, 200);
  });

  after(async () => {
    await arreterServeur(server);
    await supprimerAtelier(A.id);
    await prisma.$disconnect();
  });

  it("français et anglais sont acceptés", async () => {
    for (const langue of ["en", "fr"]) {
      const r = await pdg.patch("/api/compte", { langue });
      assert.equal(r.status, 200);
      assert.equal(r.body.langue, langue);
    }
  });

  it("le haoussa est refusé et la langue du compte ne change pas", async () => {
    const r = await pdg.patch("/api/compte", { langue: "ha" });
    assert.equal(r.status, 400);
    assert.equal((await prisma.user.findUnique({ where: { id: compte.admin.id } })).langue, "fr");
  });

  it("la migration de retrait convertit un compte resté en haoussa vers le français", async () => {
    await prisma.user.update({ where: { id: compte.admin.id }, data: { langue: "ha" } });
    await prisma.$executeRawUnsafe(`UPDATE "User" SET "langue" = 'fr' WHERE "langue" = 'ha'`);
    assert.equal((await prisma.user.findUnique({ where: { id: compte.admin.id } })).langue, "fr");
  });
});
