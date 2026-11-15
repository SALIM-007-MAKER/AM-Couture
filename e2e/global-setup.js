import { request } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reinitialiserEtSemer, COMPTES, MOT_DE_PASSE } from "./seed.js";

const ici = dirname(fileURLToPath(import.meta.url));
export const ETATS = {
  superadmin: resolve(ici, ".auth/superadmin.json"),
  pdg: resolve(ici, ".auth/pdg.json"),
  client: resolve(ici, ".auth/client.json"),
};

// Les serveurs (webServer) sont déjà démarrés quand ce fichier s'exécute. Une connexion par rôle suffit :
// la session (cookie HttpOnly) est réutilisée par les specs, ce qui reste très en dessous du seuil du limiteur
// de débit de la connexion (10 tentatives / 15 min / IP).
export default async function globalSetup(config) {
  const base = config.projects[0].use.baseURL;
  mkdirSync(resolve(ici, ".auth"), { recursive: true });
  const ids = await reinitialiserEtSemer();
  process.env.E2E_ATELIER_ALPHA_ID = ids.alphaId;
  process.env.E2E_ATELIER_BETA_ID = ids.betaId;
  process.env.E2E_CLIENTE_BETA_ID = ids.clienteBetaId;
  process.env.E2E_COMMANDE_BETA_ID = ids.commandeBetaId;
  process.env.E2E_COMMANDE_ALPHA_ID = ids.commandeAlphaId;

  for (const [role, identifiant] of [
    ["superadmin", COMPTES.superadmin],
    ["pdg", COMPTES.pdgAlpha],
    ["client", COMPTES.clientAlpha],
  ]) {
    const ctx = await request.newContext({ baseURL: base });
    const res = await ctx.post("/api/auth/login", { data: { identifiant, password: MOT_DE_PASSE } });
    if (!res.ok()) throw new Error(`Connexion ${role} impossible : ${res.status()} ${await res.text()}`);
    await ctx.storageState({ path: ETATS[role] });
    await ctx.dispose();
  }
}
