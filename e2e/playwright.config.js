import { defineConfig } from "@playwright/test";

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

const PORT_API = 4000; // le proxy de Vite (frontend/vite.config.js) vise ce port
const PORT_WEB = 5173;
const env = {
  ...process.env,
  DATABASE_URL: baseDeDonnees,
  DIRECT_URL: baseDeDonnees,
  JWT_SECRET: process.env.JWT_SECRET ?? "secret-e2e-uniquement",
  PORT: String(PORT_API),
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
      command: "node backend/src/server.js",
      cwd: "..",
      url: `http://localhost:${PORT_API}/api/health`,
      env,
      reuseExistingServer: false,
      stdout: "ignore",
      stderr: "ignore",
      timeout: 60_000,
    },
    {
      command: "npm run dev -w frontend -- --port 5173 --strictPort",
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
