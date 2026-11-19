// Commande de build Vercel (voir vercel.json). Remplace l'enchaînement inconditionnel
// `prisma generate && prisma migrate deploy && vite build`.
// Un échec, y compris de migration, fait échouer le build : Vercel conserve alors le déploiement
// précédent en ligne. Procédure complète : docs/DEPLOIEMENT.md.
import { spawnSync } from "node:child_process";
import { decideMigration, envPourGeneration, etapesMigration, executerEtapes } from "./lib/deployPolicy.mjs";

function run(cmd, args, env = process.env) {
  console.log(`\n[build] > ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env });
  if (r.status !== 0) {
    console.error(`[build] ÉCHEC : ${cmd} ${args.join(" ")} (code ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

const decision = decideMigration(process.env);
if (decision.erreur) {
  console.error(`[build] ÉCHEC : ${decision.erreur}`);
  process.exit(1);
}

// La génération du client n'a pas besoin de la base ; voir envPourGeneration (prévisualisations sans DIRECT_URL).
run("npx", ["prisma", "generate"], envPourGeneration(process.env, decision));
const etapes = etapesMigration(decision);
if (etapes.length === 0) {
  console.log(`[build] Migrations : ignorées — ${decision.raison}.`);
} else {
  console.log(`[build] Migrations : appliquées (${decision.raison}).`);
  // Ordre et caractère bloquant de chaque étape : voir etapesMigration (scripts/lib/deployPolicy.mjs, testé).
  const resultat = executerEtapes(etapes, (etape) => {
    console.log(`
[build] > npx ${etape.args.join(" ")}  (${etape.libelle})`);
    const r = spawnSync("npx", etape.args, { stdio: "inherit", shell: process.platform === "win32", env: process.env });
    if (r.status !== 0) {
      console.log(`[build] ${etape.bloquant ? "ÉCHEC" : "Note"} : étape « ${etape.id} » terminée avec le code ${r.status}${etape.bloquant ? "" : " (informatif, le build continue)"}.`);
    }
    return r.status;
  });
  if (!resultat.ok) {
    console.error(`[build] ÉCHEC : étape « ${resultat.echec.id} » (code ${resultat.echec.code}). Le déploiement précédent reste en ligne.`);
    process.exit(resultat.echec.code || 1);
  }
}

run("npm", ["run", "build", "-w", "frontend"]);
