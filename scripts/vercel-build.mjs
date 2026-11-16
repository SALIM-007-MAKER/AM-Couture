// Commande de build Vercel (voir vercel.json). Remplace l'enchaînement inconditionnel
// `prisma generate && prisma migrate deploy && vite build`.
// Un échec, y compris de migration, fait échouer le build : Vercel conserve alors le déploiement
// précédent en ligne. Procédure complète : docs/DEPLOIEMENT.md.
import { spawnSync } from "node:child_process";
import { decideMigration, envPourGeneration } from "./lib/deployPolicy.mjs";

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
if (decision.migrer) {
  console.log(`[build] Migrations : appliquées (${decision.raison}).`);
  run("npx", ["prisma", "migrate", "status"]); // journalise l'état avant application
  run("npx", ["prisma", "migrate", "deploy"]);
} else {
  console.log(`[build] Migrations : ignorées — ${decision.raison}.`);
}

run("npm", ["run", "build", "-w", "frontend"]);
