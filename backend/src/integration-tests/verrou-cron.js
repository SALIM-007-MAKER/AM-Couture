// Verrou entre suites d'intégration qui lancent la tâche quotidienne (/api/cron/rappels-quotidiens).
//
// Pourquoi : cette tâche examine TOUS les ateliers de la base. Les fichiers de test tournent en parallèle (processus distincts,
// `--test-concurrency`) sur la MÊME base : si une suite lance la tâche pendant qu'une autre a créé ses ateliers de rappels, la
// première envoie les courriels de la seconde (par son propre faux Resend) et réserve les rappels ; la seconde ne reçoit alors
// plus rien et échoue (« envoie le bon rappel aux bons ateliers »). Reproduit à chaque fois avec cron-resilience en parallèle.
//
// Fonctionnement : verrou consultatif PostgreSQL (pg_advisory_lock) tenu par une connexion dédiée pendant toute la durée du
// fichier de test. Les suites concernées s'exécutent donc l'une après l'autre, quel que soit l'ordre ou le degré de parallélisme ;
// les autres suites ne sont pas ralenties. Un processus qui meurt libère son verrou (il est lié à la session).
// Aucun code métier n'est modifié.
import pg from "pg";

/** Clé du verrou partagé par les suites qui lancent la tâche quotidienne (entier arbitraire, propre à ce projet). */
export const CLE_VERROU_CRON = 7_261_901;

/**
 * Attend puis prend le verrou ; renvoie la fonction qui le libère. À appeler en tête du `before` du fichier de test, et à libérer
 * à la toute fin de son `after` (une fois ses ateliers supprimés), de préférence dans un `finally`.
 */
export async function prendreVerrou(cle = CLE_VERROU_CRON) {
  const connexion = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await connexion.connect();
  try {
    await connexion.query("SELECT pg_advisory_lock($1)", [cle]);
  } catch (err) {
    await connexion.end().catch(() => {});
    throw err;
  }
  let libere = false;
  return async () => {
    if (libere) return;
    libere = true;
    try {
      await connexion.query("SELECT pg_advisory_unlock($1)", [cle]);
    } finally {
      await connexion.end().catch(() => {});
    }
  };
}
