// Résumé quotidien : un atelier en erreur ne doit pas empêcher le résumé des autres (en CI, un atelier supprimé par un autre test
// pendant la tâche faisait échouer toute la tâche, donc plus aucun courriel). Panne provoquée par un déclencheur SQL temporaire.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { demarrerServeur, arreterServeur, creerAtelierEtAdmin, creerCliente, creerCommande, supprimerAtelier } from "./helpers.js";

const SECRET = "secret-cron-resilience";
const marque = `res${process.pid}${Date.now()}`;

describe("Tâche quotidienne — résistance à un atelier en erreur", () => {
  let server, baseUrl, bon, poison;
  const envoyes = [];
  const fetchOriginal = globalThis.fetch;
  const cleAvant = process.env.RESEND_API_KEY;
  const secretAvant = process.env.CRON_SECRET;
  const fonction = `panne_${marque}`;

  async function atelierAvecRetard(cle) {
    const { atelier, admin } = await creerAtelierEtAdmin({ nom: `Atelier ${cle}` });
    const email = `${marque}-${cle}@example.test`;
    await prisma.user.update({ where: { id: admin.id }, data: { email, prenom: "Awa" } });
    await prisma.atelier.update({ where: { id: atelier.id }, data: { trialEndsAt: new Date(Date.now() + 30 * 86_400_000) } });
    const cl = await creerCliente(atelier.id, { nom: "Retard", prenom: cle, telephone: `9${Date.now().toString().slice(-7)}` });
    await creerCommande(atelier.id, cl.id, { statut: "NOUVELLE", dateLivraisonPrevue: new Date(Date.now() - 3 * 86_400_000) });
    return { atelier, email };
  }

  before(async () => {
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith("https://api.resend.com")) {
        envoyes.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ id: "email_test" }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return fetchOriginal(url, init);
    };
    process.env.RESEND_API_KEY = "re_test_stub_key";
    process.env.CRON_SECRET = SECRET;
    ({ server, baseUrl } = await demarrerServeur());
    poison = await atelierAvecRetard("poison");
    bon = await atelierAvecRetard("bon");
    // Toute création d'alerte pour l'atelier « poison » échoue, comme le ferait une donnée incohérente.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION ${fonction}() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'panne simulee'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${fonction} BEFORE INSERT ON "Notification" FOR EACH ROW WHEN (NEW."atelierId" = '${poison.atelier.id}') EXECUTE FUNCTION ${fonction}()`);
  });

  after(async () => {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${fonction} ON "Notification"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${fonction}()`);
    globalThis.fetch = fetchOriginal;
    if (cleAvant === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = cleAvant;
    if (secretAvant === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = secretAvant;
    await arreterServeur(server);
    await supprimerAtelier(poison.atelier.id);
    await supprimerAtelier(bon.atelier.id);
    await prisma.$disconnect();
  });

  it("l'atelier en panne est consigné dans le compte rendu, les autres reçoivent leur résumé", async () => {
    const res = await fetchOriginal(`${baseUrl}/api/cron/rappels-quotidiens`, { headers: { Authorization: `Bearer ${SECRET}` } });
    assert.equal(res.status, 200, "la tâche ne s'arrête pas");
    const corps = await res.json();
    assert.ok(corps.erreurs.some((e) => e.atelierId === poison.atelier.id), "l'atelier en panne est signalé");
    assert.ok(envoyes.some((m) => m.to === bon.email || m.to?.includes?.(bon.email)), "l'atelier sain reçoit son résumé");
    assert.ok(!envoyes.some((m) => m.to === poison.email || m.to?.includes?.(poison.email)), "rien n'est envoyé pour l'atelier en panne");
  });
});
