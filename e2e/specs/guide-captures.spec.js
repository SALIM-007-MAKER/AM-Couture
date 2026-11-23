import { test, expect, request as pwRequest } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ETATS } from "../global-setup.js";
import { MOT_DE_PASSE } from "../seed.js";
import { ouvrirSession } from "../session.js";
import { PORT_API } from "../ports.js";
import { GUIDES, toutesLesCaptures } from "../../frontend/src/features/guide/structure.js";
import fr from "../../frontend/src/i18n/fr.js";
import en from "../../frontend/src/i18n/en.js";

// Captures d'écran des guides d'utilisation. Lancées SEULEMENT à la demande (`npm run guides:captures`) :
//  - exclusivement sur la base E2E locale (jeu de données fictif de seed.js, jamais la production) ;
//  - une image par capture, langue (fr/en) et format (ordinateur 1100 px, téléphone 390 px) ;
//  - les étapes annotées (`cible` dans structure.js) reçoivent un repère numéroté, le même numéro que dans le guide.
// Sortie : frontend/public/guide/<langue>/<id>-<desktop|mobile>.jpg
test.skip(process.env.GUIDE_CAPTURES !== "1", "Captures du guide : lancer `npm run guides:captures`.");
test.describe.configure({ mode: "serial" });

const SORTIE = resolve(dirname(fileURLToPath(import.meta.url)), "../../frontend/public/guide");
const DICO = { fr, en };
const FORMATS = { desktop: { width: 1100, height: 720 }, mobile: { width: 390, height: 780 } };
const resoudre = (dico, cle) => cle.split(".").reduce((acc, p) => (acc && typeof acc === "object" ? acc[p] : undefined), dico);

const EMPLOYES = { "employe-couturier": ["e2e-guide-couturier", "COUTURIER"], "employe-reception": ["e2e-guide-reception", "RECEPTIONNISTE"], "employe-magasinier": ["e2e-guide-magasinier", "MAGASINIER"], "employe-comptable": ["e2e-guide-comptable", "COMPTABLE"] };
const api = (storageState) => pwRequest.newContext({ baseURL: `http://localhost:${PORT_API}`, storageState, extraHTTPHeaders: { "X-Forwarded-For": "10.89.0.1" } });

const donnees = { commande: null, sessions: {} };

test.beforeAll(async () => {
  const pdg = await api(ETATS.pdg);
  // Employés d'exemple, un par poste (le magasinier et le comptable ont aussi besoin d'un peu de matière à afficher).
  for (const [identifiant, poste] of Object.values(EMPLOYES)) {
    const res = await pdg.post("/api/employes", {
      data: { identifiant, password: MOT_DE_PASSE, prenom: "Exemple", nom: poste.toLowerCase(), poste, confirmationMotDePasse: MOT_DE_PASSE },
      headers: { "Idempotency-Key": `capture-${identifiant}` },
    });
    if (![201, 409].includes(res.status())) throw new Error(`employé ${identifiant} : ${res.status()}`);
  }
  const liste = await (await pdg.get("/api/commandes")).json();
  donnees.commande = (liste.data ?? liste).find((c) => c.numero === "E2E-ALPHA-001");
  // La commande d'exemple est confiée au couturier : sa section « Mes commandes à confectionner » n'est pas vide.
  const employes = await (await pdg.get("/api/employes")).json();
  const couturier = (employes.data ?? employes).find((e) => e.identifiant === "e2e-guide-couturier");
  const aff = await pdg.put(`/api/commandes/${donnees.commande.id}/affectation`, { data: { employeId: couturier.id } });
  if (!aff.ok()) throw new Error(`affectation : ${aff.status()} ${await aff.text()}`);
  // Un stock sous le seuil pour l'accueil du magasinier.
  await pdg.post("/api/stock", { data: { nom: "Tissu wax exemple", categorie: "Tissu", unite: "METRE", quantite: 2, seuilAlerte: 5 }, headers: { "Idempotency-Key": "capture-stock" } });
  await pdg.dispose();

  // Un paiement d'abonnement déclaré par un atelier (atelier DELTA, données fictives) : la page « Paiements » du SUPERADMIN n'est pas vide.
  const delta = await api(ETATS.delta);
  const plans = await (await delta.get("/api/plans-abonnement")).json();
  const plan = (plans.data ?? plans).find((p) => p.nom === "Plan E2E") ?? (plans.data ?? plans)[0];
  const decl = await delta.post("/api/abonnements/souscrire", {
    data: { planId: plan.id, dureeMois: 1, moyenPaiement: "MOBILE_MONEY", operateur: "Airtel Money", reference: "AIR-EXEMPLE-0001" },
    headers: { "Idempotency-Key": "capture-souscrire" },
  });
  if (![201, 409].includes(decl.status())) throw new Error(`souscrire : ${decl.status()} ${await decl.text()}`);
  await delta.dispose();

  for (const [id, [identifiant]] of Object.entries(EMPLOYES)) donnees.sessions[id] = (await ouvrirSession(identifiant)).storageState;
});

/** Compte à utiliser pour une capture. */
function sessionDe(capture) {
  if (capture.guide === "pdg") return ETATS.pdg;
  if (capture.guide === "client") return ETATS.client;
  if (capture.guide === "superadmin") return ETATS.superadmin;
  return donnees.sessions[capture.id];
}

/** Langue du compte (la langue affichée suit celle du compte, voir LocaleSync). */
async function fixerLangue(ctx, langue) {
  const res = await ctx.request.patch("/api/compte", { data: { langue } });
  return res.ok();
}

/** Entoure l'élément et pose le numéro de l'étape : un repère rouge, lisible sur fond clair comme sombre. */
async function annoter(page, cibles, langue) {
  const posees = [];
  for (const { numero, cle } of cibles) {
    const libelle = resoudre(DICO[langue], cle);
    const cible = page.getByText(libelle, { exact: true }).filter({ visible: true }).first();
    const trouve = (await cible.count()) > 0 ? cible : page.getByText(libelle).filter({ visible: true }).first();
    if ((await trouve.count()) === 0) continue;
    // Pas de défilement : les repères sont posés sur ce qui est visible tel quel (une page qui défile fausserait leur position).
    const boite = await trouve.boundingBox();
    const hauteur = page.viewportSize().height;
    if (!boite || boite.y < 0 || boite.y + boite.height > hauteur) continue;
    await page.evaluate(({ boite, numero }) => {
      const cadre = document.createElement("div");
      Object.assign(cadre.style, { position: "fixed", left: `${boite.x - 4}px`, top: `${boite.y - 3}px`, width: `${boite.width + 8}px`, height: `${boite.height + 6}px`, border: "2px solid #dc2626", borderRadius: "6px", zIndex: 99998, pointerEvents: "none" });
      const pastille = document.createElement("div");
      pastille.textContent = String(numero);
      Object.assign(pastille.style, { position: "fixed", left: `${Math.max(2, boite.x - 14)}px`, top: `${Math.max(2, boite.y - 14)}px`, width: "24px", height: "24px", borderRadius: "50%", background: "#dc2626", color: "#fff", font: "700 13px/24px system-ui, sans-serif", textAlign: "center", boxShadow: "0 0 0 2px #fff", zIndex: 99999, pointerEvents: "none" });
      document.body.append(cadre, pastille);
    }, { boite, numero });
    posees.push(numero);
  }
  return posees;
}

const captures = toutesLesCaptures();

for (const capture of captures) {
  test(`capture ${capture.id}`, async ({ browser }) => {
    test.setTimeout(120_000);
    const section = GUIDES[capture.guide].find((s) => s.id === capture.section);
    const cibles = section.steps.map((e, i) => (e.cible ? { numero: i + 1, cle: e.cible } : null)).filter(Boolean);
    const chemin = capture.to.replace("{commande}", donnees.commande?.id ?? "");
    for (const langue of ["fr", "en"]) {
      for (const [format, viewport] of Object.entries(FORMATS)) {
        const ctx = await browser.newContext({ storageState: sessionDe(capture), viewport, deviceScaleFactor: 1, locale: langue === "fr" ? "fr-FR" : "en-US" });
        try {
          await fixerLangue(ctx, langue);
          const page = await ctx.newPage();
          // Écrans qui demandent un geste avant d'être parlants.
          await page.goto(chemin);
          await page.waitForLoadState("networkidle");
          if (capture.id === "pdg-employe-nouveau") await page.getByTestId("select-poste").selectOption("RECEPTIONNISTE");
          if (capture.id === "client-demande") await page.waitForTimeout(300);
          await expect(page.getByText("Une erreur inattendue")).toHaveCount(0);
          if (capture.pleinePage) {
            const hauteurPage = await page.evaluate(() => document.documentElement.scrollHeight);
            await page.setViewportSize({ width: viewport.width, height: Math.min(hauteurPage + 8, 3200) });
          }
          await page.waitForTimeout(400);
          // Sur téléphone, les repères ne sont posés que sur ce qui est réellement visible (le menu latéral n'existe pas).
          const posees = await annoter(page, cibles, langue);
          const dossier = resolve(SORTIE, langue);
          mkdirSync(dossier, { recursive: true });
          await page.screenshot({ path: resolve(dossier, `${capture.id}-${format}.jpg`), type: "jpeg", quality: 72 });
          console.log(`[capture] ${langue}/${capture.id}-${format} repères : ${posees.join(",") || "aucun"}`);
        } finally {
          await fixerLangue(ctx, "fr").catch(() => {});
          await ctx.close();
        }
      }
    }
  });
}
