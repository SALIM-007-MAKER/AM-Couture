import { defineConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { PORT_API, PORT_WEB } from "./ports.js";

// Le dossier du journal de l'API doit exister avant le démarrage du serveur.
mkdirSync(new URL("../e2e-journal/", import.meta.url), { recursive: true });

// Tests end-to-end : vrai navigateur → vrai frontend (Vite) → vraie API (Express) → vraie base Postgres.
//
// BASE DÉDIÉE OBLIGATOIRE : E2E_DATABASE_URL (jamais DATABASE_URL). Le jeu de données est VIDÉ puis recréé à
// chaque exécution (voir seed.js, qui refuse toute base dont le nom ne contient pas « e2e » ou qui n'est pas locale).
const baseDeDonnees = process.env.E2E_DATABASE_URL;
if (!baseDeDonnees) {
  console.error(
    "\nE2E_DATABASE_URL n'est pas définie : tests de bout en bout ignorés.\n" +
      "Il faut une base Postgres JETABLE dont le nom contient « e2e » (voir docs/TESTS.md).\n",
  );
  process.exit(1);
}

// Ports : voir ports.js (E2E_PORT_API / E2E_PORT_WEB pour ne pas heurter des serveurs de développement ouverts).
const env = {
  ...process.env,
  DATABASE_URL: baseDeDonnees,
  DIRECT_URL: baseDeDonnees,
  JWT_SECRET: process.env.JWT_SECRET ?? "secret-e2e-uniquement",
  PORT: String(PORT_API),
  VITE_API_PORT: String(PORT_API),
  NODE_ENV: "development",
  LOG_REQUETES: "0",
};

export default defineConfig({
  testDir: "./specs",
  globalSetup: "./global-setup.js",
  // Un seul worker : les tests partagent une base et une IP (limiteur de débit de la connexion).
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "../e2e-report" }]] : "list",
  outputDir: "../e2e-resultats",
  use: {
    baseURL: `http://localhost:${PORT_WEB}`,
    // Chrome du système (présent en local et sur les runners GitHub) : évite de télécharger un navigateur.
    channel: "chrome",
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      // Sortie de l'API dans un journal : en développement local sans Resend, les liens de réinitialisation et de
      // vérification y sont écrits (jamais dans la réponse HTTP) ; auth-locale.spec.js les y lit. Dossier ignoré par Git.
      command: "node backend/src/server.js > e2e-journal/api.log 2>&1",
      cwd: "..",
      url: `http://localhost:${PORT_API}/api/health`,
      env,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "ignore",
      timeout: 60_000,
    },
    {
      command: `npm run dev -w frontend -- --port ${PORT_WEB} --strictPort`,
      cwd: "..",
      url: `http://localhost:${PORT_WEB}`,
      env,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "ignore",
      timeout: 90_000,
    },
  ],
});
