// Scénarios de migration d'un build de production sur une VRAIE base Postgres jetable : les mêmes étapes que vercel-build.mjs
// (etapesMigration / executerEtapes), exécutées avec la vraie CLI Prisma contre de petits dossiers de migrations fabriqués ici.
//
// Lancement (ignoré sans SIM_DATABASE_URL, donc inoffensif dans `npm test` et en CI) :
//   SIM_DATABASE_URL=postgresql://sim:sim@localhost:55433/gestion_atelier_sim_migrations node --test scripts/__tests__/migrations-simulation.test.mjs
//
// Garde-fous : la base doit être LOCALE et son nom doit contenir « sim » ; le schéma public y est réinitialisé avant chaque scénario.
// Jamais une base de développement, de test, e2e ou distante.
import { describe, test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { decideMigration, etapesMigration, executerEtapes } from "../lib/deployPolicy.mjs";

const URL_SIM = process.env.SIM_DATABASE_URL;
const RACINE = fileURLToPath(new URL("../..", import.meta.url)).replace(/\\/g, "/");
const PRODUCTION = { VERCEL_ENV: "production" };

function verifierBaseJetable(url) {
  const u = new URL(url);
  const nom = u.pathname.replace(/^\//, "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) throw new Error(`SIM_DATABASE_URL refusée : hôte non local (${u.hostname})`);
  if (!/sim/i.test(nom) || /(^|_)(dev|test|e2e|p5|perf)$/i.test(nom)) throw new Error(`SIM_DATABASE_URL refusée : « ${nom} » n'est pas une base jetable de simulation`);
}

describe("Migrations d'un build de production — base Postgres jetable", { skip: URL_SIM ? false : "SIM_DATABASE_URL absente : scénarios sur base jetable ignorés" }, () => {
  let client;
  let racineTmp;
  let compteur = 0;

  before(async () => {
    verifierBaseJetable(URL_SIM);
    const { Client } = createRequire(new URL("../../backend/package.json", import.meta.url))("pg");
    client = new Client({ connectionString: URL_SIM });
    await client.connect();
    racineTmp = fs.mkdtempSync(path.join(os.tmpdir(), "sim-migrations-"));
  });

  after(async () => {
    await client?.end();
    if (racineTmp) fs.rmSync(racineTmp, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  });

  // Dossier de migrations + config Prisma qui le vise (même forme que prisma.config.ts : schéma du dépôt, DIRECT_URL).
  function preparer(migrations) {
    const dir = path.join(racineTmp, `cas-${++compteur}`);
    const migs = path.join(dir, "migrations");
    fs.mkdirSync(migs, { recursive: true });
    fs.writeFileSync(path.join(migs, "migration_lock.toml"), 'provider = "postgresql"\n');
    for (const [nom, sql] of Object.entries(migrations)) {
      fs.mkdirSync(path.join(migs, nom));
      fs.writeFileSync(path.join(migs, nom, "migration.sql"), sql);
    }
    const config = path.join(dir, "prisma.config.mjs").replace(/\\/g, "/");
    fs.writeFileSync(config, `export default { schema: "${RACINE}prisma/schema.prisma", migrations: { path: "${migs.replace(/\\/g, "/")}" }, datasource: { url: process.env.DIRECT_URL } };\n`);
    return { migs, config };
  }

  function prisma(args, { config, url = URL_SIM }) {
    return spawnSync("npx", ["prisma", ...args, "--config", config], {
      cwd: RACINE, encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, DIRECT_URL: url },
    });
  }

  // Exécute le build de migration de production tel que vercel-build.mjs l'exécute ; `configs` surcharge la config d'une étape.
  function lancerProduction({ config, url = URL_SIM, configs = {} }) {
    const decision = decideMigration({ ...PRODUCTION, DIRECT_URL: url });
    const sorties = {};
    const resultat = executerEtapes(etapesMigration(decision), (etape) => {
      const r = prisma(etape.args.slice(1), { config: configs[etape.id] ?? config, url });
      sorties[etape.id] = `${r.stdout}\n${r.stderr}`;
      return r.status;
    });
    return { resultat, sorties };
  }

  const existe = async (table) => (await client.query("SELECT to_regclass($1) AS t", [`public."${table}"`])).rows[0].t !== null;
  const historique = async () => (await client.query("SELECT migration_name, finished_at IS NOT NULL AS finie, rolled_back_at IS NOT NULL AS annulee FROM _prisma_migrations ORDER BY migration_name")).rows;

  const M1 = { "20260101000000_a": 'CREATE TABLE "a" ("id" INTEGER PRIMARY KEY);' };
  const M2 = { "20260102000000_a_colonne": 'ALTER TABLE "a" ADD COLUMN "nom" TEXT;' };

  test("migrations en attente : `status` renvoie 1 (ignoré), les migrations sont appliquées, la vérification finale est à jour", async () => {
    const { config } = preparer({ ...M1, ...M2 });
    const { resultat, sorties } = lancerProduction({ config });
    assert.equal(resultat.ok, true, JSON.stringify(resultat));
    assert.deepEqual(resultat.resultats.map((r) => r.code), [1, 0, 0], "état avant = 1 (en attente), application = 0, vérification = 0");
    assert.match(sorties["etat-avant"], /not yet been applied/i);
    assert.equal(await existe("a"), true);
    assert.deepEqual((await historique()).map((h) => h.finie), [true, true]);
  });

  test("migration réussie, rien en attente (rejeu du même build) : les trois étapes renvoient 0", async () => {
    const { config } = preparer({ ...M1, ...M2 });
    assert.equal(lancerProduction({ config }).resultat.ok, true);
    const rejeu = lancerProduction({ config });
    assert.equal(rejeu.resultat.ok, true);
    assert.deepEqual(rejeu.resultat.resultats.map((r) => r.code), [0, 0, 0]);
  });

  test("migration échouée : le build s'arrête à l'application, la vérification finale n'a pas lieu, rien n'est créé par la migration en échec", async () => {
    const { config } = preparer({ ...M1, "20260102000000_echec": 'SELECT * FROM "table_qui_nexiste_pas";' });
    const { resultat } = lancerProduction({ config });
    assert.equal(resultat.ok, false);
    assert.equal(resultat.echec.id, "application");
    assert.deepEqual(resultat.resultats.map((r) => r.id), ["etat-avant", "application"]);
    const h = await historique();
    assert.deepEqual(h.map((x) => [x.migration_name, x.finie]), [["20260101000000_a", true], ["20260102000000_echec", false]], "la 1re est appliquée, la 2e est enregistrée comme échouée");
  });

  // CONSTAT (vérifié ici, contraire à ce que la documentation du projet affirmait jusqu'ici) : sur PostgreSQL, Prisma n'enveloppe PAS une
  // migration dans une transaction. Les instructions exécutées avant celle qui échoue restent appliquées.
  const PARTIELLE = `CREATE TABLE "b" ("id" INTEGER PRIMARY KEY);
INSERT INTO "b" VALUES (1);
INSERT INTO "table_qui_nexiste_pas" VALUES (1);
`;

  test("migration partiellement exécutée : les instructions avant l'échec RESTENT appliquées (Prisma n'est pas transactionnel), la migration est marquée échouée", async () => {
    const { config } = preparer({ ...M1, "20260102000000_partielle": PARTIELLE });
    const { resultat } = lancerProduction({ config });
    assert.equal(resultat.ok, false);
    assert.equal(resultat.echec.id, "application");
    assert.equal(await existe("a"), true, "la migration précédente, réussie, reste appliquée");
    assert.equal(await existe("b"), true, "la table créée avant l'instruction en échec n'est PAS annulée");
    assert.equal((await client.query('SELECT count(*)::int AS n FROM "b"')).rows[0].n, 1, "ni la ligne insérée");
    const h = await historique();
    assert.deepEqual(h.map((x) => [x.migration_name, x.finie]), [["20260101000000_a", true], ["20260102000000_partielle", false]]);
  });

  test("contournement : une migration enveloppée dans BEGIN … COMMIT est atomique, un échec n'en laisse rien", async () => {
    const enveloppee = `BEGIN;
${PARTIELLE}COMMIT;
`;
    const { config } = preparer({ ...M1, "20260102000000_atomique": enveloppee });
    const { resultat } = lancerProduction({ config });
    assert.equal(resultat.ok, false);
    assert.equal(await existe("b"), false, "rien de la migration en échec ne subsiste");
    assert.equal(await existe("a"), true);
  });

  test("une migration enveloppée dans BEGIN … COMMIT réussit normalement (état avant 1, application 0, vérification 0)", async () => {
    const { config } = preparer({ ...M1, "20260102000000_atomique": `BEGIN;
CREATE TABLE "d" ("id" INTEGER PRIMARY KEY);
INSERT INTO "d" VALUES (1);
COMMIT;
` });
    const { resultat } = lancerProduction({ config });
    assert.equal(resultat.ok, true, JSON.stringify(resultat));
    assert.equal((await client.query('SELECT count(*)::int AS n FROM "d"')).rows[0].n, 1);
  });

  test("récupération après un échec PARTIEL : `resolve --rolled-back` seul ne suffit pas (la table existe déjà) ; il faut d'abord défaire à la main ce qui a été appliqué", async () => {
    const { migs, config } = preparer({ ...M1, "20260102000000_partielle": PARTIELLE });
    assert.equal(lancerProduction({ config }).resultat.ok, false);
    assert.equal(prisma(["migrate", "resolve", "--rolled-back", "20260102000000_partielle"], { config }).status, 0);

    // SQL corrigé (la dernière instruction devient valide), mais la table « b » du premier essai existe encore : rejeu en échec.
    const corrige = `CREATE TABLE "b" ("id" INTEGER PRIMARY KEY);
INSERT INTO "b" VALUES (1);
`;
    fs.writeFileSync(path.join(migs, "20260102000000_partielle", "migration.sql"), corrige);
    const sansNettoyage = lancerProduction({ config });
    assert.equal(sansNettoyage.resultat.ok, false);
    assert.match(sansNettoyage.sorties.application, /already exists|existe d[ée]j[àa]/i);

    // Après avoir défait les restes du premier essai puis marqué la migration annulée, le rejeu réussit.
    await client.query('DROP TABLE IF EXISTS "b"');
    assert.equal(prisma(["migrate", "resolve", "--rolled-back", "20260102000000_partielle"], { config }).status, 0);
    const apres = lancerProduction({ config });
    assert.equal(apres.resultat.ok, true, JSON.stringify(apres.resultat));
    assert.equal(await existe("b"), true);
  });

  test("lot partiellement appliqué : la 2e migration échoue, la 1re reste appliquée, la 3e n'est jamais tentée", async () => {
    const { config } = preparer({ ...M1, "20260102000000_echec": "SELECT 1/0;", "20260103000000_c": 'CREATE TABLE "c" ("id" INTEGER PRIMARY KEY);' });
    const { resultat } = lancerProduction({ config });
    assert.equal(resultat.ok, false);
    assert.equal(await existe("a"), true);
    assert.equal(await existe("c"), false);
    assert.deepEqual((await historique()).map((x) => x.migration_name), ["20260101000000_a", "20260102000000_echec"], "aucune ligne pour la 3e");
  });

  test("après un échec, un nouveau déploiement est bloqué tant que la migration échouée n'est pas résolue ; `migrate resolve --rolled-back` puis correction débloquent", async () => {
    const echec = { "20260102000000_echec": "SELECT 1/0;" };
    const { migs, config } = preparer({ ...M1, ...echec });
    assert.equal(lancerProduction({ config }).resultat.ok, false);

    // Rejeu sans rien changer : refusé (état « échoué » enregistré).
    const rejeu = lancerProduction({ config });
    assert.equal(rejeu.resultat.ok, false);
    assert.equal(rejeu.resultat.echec.id, "application");
    assert.match(rejeu.sorties.application, /P3009|failed/i);

    // Récupération documentée : marquer annulée, corriger le SQL, redéployer.
    assert.equal(prisma(["migrate", "resolve", "--rolled-back", "20260102000000_echec"], { config }).status, 0);
    fs.writeFileSync(path.join(migs, "20260102000000_echec", "migration.sql"), 'ALTER TABLE "a" ADD COLUMN "corrige" TEXT;');
    const apres = lancerProduction({ config });
    assert.equal(apres.resultat.ok, true, JSON.stringify(apres.resultat));
    assert.equal((await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='a' AND column_name='corrige'")).rowCount, 1);
  });

  test("base inaccessible : `status` et `migrate deploy` échouent, le build s'arrête à l'application", async () => {
    const { config } = preparer({ ...M1 });
    const { resultat } = lancerProduction({ config, url: "postgresql://sim:sim@localhost:1/gestion_atelier_sim_migrations?connect_timeout=3" });
    assert.equal(resultat.ok, false);
    assert.equal(resultat.echec.id, "application");
    assert.notEqual(resultat.resultats[0].code, 0, "l'état avant échoue aussi, sans arrêter le build à ce stade");
    assert.deepEqual(resultat.resultats.map((r) => r.id), ["etat-avant", "application"]);
  });

  test("vérification finale : une migration restée en attente après un déploiement réussi arrête le build avant la publication", async () => {
    const { config } = preparer({ ...M1 });
    // Le déploiement voit 1 migration ; la vérification finale, un dossier qui en contient une de plus (jamais appliquée).
    const { config: configPlusGrand } = preparer({ ...M1, ...M2 });
    const { resultat } = lancerProduction({ config, configs: { "verification-finale": configPlusGrand } });
    assert.equal(resultat.ok, false);
    assert.deepEqual(resultat.echec.id, "verification-finale");
    assert.deepEqual(resultat.resultats.map((r) => r.code).slice(0, 2), [1, 0]);
  });

  test("une migration déjà appliquée mais absente du dossier local n'arrête pas le build (observé : `status` renvoie 0)", async () => {
    const complet = preparer({ ...M1, ...M2 });
    assert.equal(lancerProduction({ config: complet.config }).resultat.ok, true);
    const reduit = preparer({ ...M1 });
    const { resultat } = lancerProduction({ config: reduit.config });
    assert.equal(resultat.ok, true);
    assert.deepEqual(resultat.resultats.map((r) => r.code), [0, 0, 0]);
  });

  test("prévisualisation, local, SKIP_MIGRATIONS=1 : aucune commande Prisma n'est lancée et la base reste vide", async () => {
    for (const env of [{ VERCEL_ENV: "preview" }, {}, { VERCEL_ENV: "production", SKIP_MIGRATIONS: "1" }]) {
      let appels = 0;
      const r = executerEtapes(etapesMigration(decideMigration({ ...env, DIRECT_URL: URL_SIM })), () => {
        appels += 1;
        return 0;
      });
      assert.equal(r.ok, true);
      assert.equal(appels, 0, JSON.stringify(env));
    }
    assert.equal((await client.query("SELECT to_regclass('public._prisma_migrations') AS t")).rows[0].t, null, "aucune table Prisma créée");
  });
});
