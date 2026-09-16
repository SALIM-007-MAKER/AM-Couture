// Chargé via `node --import` AVANT tout autre module (voir package.json,
// script "test:integration") — garantit que backend/src/lib/prisma.js (qui
// lit process.env.DATABASE_URL au moment de l'import, une seule fois) voit
// la base de TEST, jamais la base de dev/prod partagée.
//
// FAIL FAST si TEST_DATABASE_URL est absente : ces tests créent/suppriment
// des ateliers, comptes, clientes, commandes... à la chaîne. Un repli
// silencieux sur DATABASE_URL polluerait la base Neon partagée dev/prod —
// jamais acceptable (voir la même philosophie déjà appliquée partout
// ailleurs dans ce projet : aucune dégradation silencieuse sur une action
// destructive).
if (!process.env.TEST_DATABASE_URL) {
  console.error(
    "\nTEST_DATABASE_URL n'est pas définie — tests d'intégration ignorés.\n" +
      "Ces tests ont besoin d'une base Postgres JETABLE et DÉDIÉE (jamais la base de dev/prod).\n" +
      "En CI : fournie automatiquement par le service Postgres (voir .github/workflows/ci.yml).\n" +
      "En local : définissez TEST_DATABASE_URL (ex: une base Postgres locale, ou une branche Neon\n" +
      "dédiée aux tests) avant de lancer `npm run test:integration`.\n",
  );
  // Code de sortie 0, volontairement : l'absence de configuration locale ne
  // doit jamais faire échouer une CI/un dev qui lance `npm test` par
  // habitude — seule la CI, qui configure toujours TEST_DATABASE_URL, exécute
  // réellement cette suite.
  process.exit(0);
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DIRECT_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET ??= "test-secret-integration-tests-only";
process.env.NODE_ENV = "test";
