// Politique de migration au déploiement (testée : scripts/__tests__/deployPolicy.test.mjs).
//
// Raison d'être : le build Vercel exécutait `prisma migrate deploy` SANS condition. Un build de
// prévisualisation (branche, PR) pointant vers la même base que la production pouvait donc
// migrer la production. La migration n'est maintenant appliquée que par un build de production.
//
// Retourne { migrer: boolean, raison: string }.
export function decideMigration(env) {
  const vercelEnv = env.VERCEL_ENV;

  if (env.SKIP_MIGRATIONS === "1") {
    return { migrer: false, raison: "SKIP_MIGRATIONS=1 (interrupteur de secours : redéploiement sans toucher à la base)" };
  }
  if (!vercelEnv) {
    return { migrer: false, raison: "hors Vercel (build local) : aucune migration automatique" };
  }
  if (vercelEnv !== "production") {
    return { migrer: false, raison: `environnement « ${vercelEnv} » : les migrations ne sont appliquées que par un build de production` };
  }
  if (!env.DIRECT_URL) {
    // Échec franc plutôt qu'un repli silencieux sur la connexion poolée (casse Prisma Migrate).
    return { migrer: false, erreur: "DIRECT_URL absente : migration de production impossible", raison: "DIRECT_URL manquante" };
  }
  return { migrer: true, raison: "build de production" };
}

// `prisma generate` n'ouvre aucune connexion, mais la configuration Prisma exige que DIRECT_URL soit DÉFINIE (sinon : « Cannot
// resolve environment variable »). Sur Vercel, cette variable n'existe qu'en production (voir docs/DEPLOIEMENT.md) : tous les builds de
// prévisualisation échouaient donc avant même de compiler. On fournit une valeur FACTICE, uniquement pour la génération et
// uniquement quand AUCUNE migration ne sera appliquée ; une vraie DIRECT_URL n'est jamais remplacée, et un build de production qui
// migre garde l'exigence stricte (pas de repli silencieux).
export const URL_FACTICE_GENERATION = "postgresql://generation-seulement:x@localhost:5432/aucune";
export function envPourGeneration(env, decision) {
  if (env.DIRECT_URL || decision.migrer) return env;
  return { ...env, DIRECT_URL: URL_FACTICE_GENERATION };
}
