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

// Étapes Prisma d'un build qui migre (production seulement). Séparées de vercel-build.mjs pour être testées sans base ni build.
//
// - « etat-avant » : INFORMATIF. `prisma migrate status` renvoie le code 1 dès qu'il existe des migrations EN ATTENTE, ce qui est
//   justement le cas normal avant `migrate deploy` ; ce code ne doit pas arrêter le build (il a fait échouer le premier build de
//   production qui avait des migrations à appliquer, avant même `migrate deploy`).
// - « application » : BLOQUANT. `migrate deploy` applique les migrations ; son échec arrête le build, Vercel garde alors le
//   déploiement précédent en ligne.
// - « verification-finale » : BLOQUANT. Une fois le déploiement réussi, `migrate status` doit répondre « à jour » (code 0). Sinon la
//   base n'est pas dans l'état attendu par le code qu'on s'apprête à publier : le build s'arrête avant la publication.
export function etapesMigration(decision) {
  if (!decision.migrer) return [];
  return [
    { id: "etat-avant", args: ["prisma", "migrate", "status"], bloquant: false, libelle: "état avant application, informatif : le code 1 est normal s'il y a des migrations en attente" },
    { id: "application", args: ["prisma", "migrate", "deploy"], bloquant: true, libelle: "application des migrations" },
    { id: "verification-finale", args: ["prisma", "migrate", "status"], bloquant: true, libelle: "vérification finale : la base doit être à jour" },
  ];
}

/**
 * Exécute les étapes dans l'ordre. `executer(etape)` renvoie le code de sortie (0 = succès ; tout autre résultat, y compris
 * null ou undefined quand le processus a été interrompu, est un échec). Une étape non bloquante en échec est notée puis ignorée ;
 * une étape bloquante en échec arrête tout : les suivantes ne sont pas exécutées.
 * Retourne { ok, echec?: { id, code }, resultats: [{ id, code, bloquant }] }.
 */
export function executerEtapes(etapes, executer) {
  const resultats = [];
  for (const etape of etapes) {
    const code = executer(etape);
    resultats.push({ id: etape.id, code, bloquant: etape.bloquant });
    if (code !== 0 && etape.bloquant) return { ok: false, echec: { id: etape.id, code }, resultats };
  }
  return { ok: true, resultats };
}
