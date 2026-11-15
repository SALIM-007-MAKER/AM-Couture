// Ouvre la session d'un compte créé pendant un test, sans passer par le formulaire de connexion.
//
// Pourquoi : le limiteur de débit de la connexion (10 tentatives / 15 min / IP) est volontairement conservé tel quel
// en E2E. Tous les tests partent de la même IP : multiplier les connexions par l'interface le déclencherait. On
// appelle donc l'API directement (port 4000, sans passer par le proxy de Vite) avec une IP de test propre à chaque
// appel (en-tête X-Forwarded-For, pris en compte car l'API est derrière un proxy de confiance, voir app.js).
// Le parcours de connexion par l'interface reste couvert par auth.spec.js et employes.spec.js.
import { request } from "@playwright/test";
import { MOT_DE_PASSE } from "./seed.js";

let compteur = 0;
const ipDeTest = () => `10.77.${Math.floor(compteur / 250) % 250}.${(compteur++ % 250) + 1}`;

/** POST /api/auth/login direct ; renvoie { status, storageState } (storageState utilisable par browser.newContext). */
export async function ouvrirSession(identifiant, motDePasse = MOT_DE_PASSE) {
  const ctx = await request.newContext({ baseURL: "http://localhost:4000", extraHTTPHeaders: { "X-Forwarded-For": ipDeTest() } });
  try {
    const res = await ctx.post("/api/auth/login", { data: { identifiant, password: motDePasse } });
    return { status: res.status(), storageState: await ctx.storageState() };
  } finally {
    await ctx.dispose();
  }
}
