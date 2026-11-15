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
