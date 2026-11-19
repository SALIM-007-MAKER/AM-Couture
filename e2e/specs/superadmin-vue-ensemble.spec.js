import { test, expect } from "@playwright/test";
import { ETATS } from "../global-setup.js";

// Vue d'ensemble de la plateforme (SUPERADMIN) : graphiques des tendances. La réponse de /api/ateliers/tendances est simulée
// pour tester les deux états (aucune donnée / des données) sans dépendre de ce que les autres tests ont écrit en base.
test.use({ storageState: ETATS.superadmin });

const mois = (decalage) => {
  const d = new Date();
  d.setMonth(d.getMonth() - decalage, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const SIX_MOIS = [5, 4, 3, 2, 1, 0].map(mois);

const simuler = (page, valeurs) =>
  page.route("**/api/ateliers/tendances", (route) =>
    route.fulfill({ json: SIX_MOIS.map((m, i) => ({ mois: m, nouveauxAteliers: valeurs.ateliers[i], revenus: valeurs.revenus[i] })) }),
  );

test("sans aucun revenu : un état vide lisible à la place de barres à zéro, sans erreur", async ({ page }) => {
  await simuler(page, { ateliers: [0, 0, 0, 0, 0, 0], revenus: [0, 0, 0, 0, 0, 0] });
  await page.goto("/vue-ensemble");
  const carte = page.getByTestId("carte-tendance-revenus");
  await expect(carte.getByText(/Revenus de la plateforme par mois \(FCFA\)/)).toBeVisible();
  await expect(carte.getByTestId("graphique-vide")).toBeVisible();
  await expect(carte.getByText("Aucun revenu enregistré sur ces 6 mois.")).toBeVisible();
  await expect(page.getByTestId("carte-tendance-ateliers").getByTestId("graphique-vide")).toBeVisible();
  await expect(page.getByText(/erreur est survenue/i)).toHaveCount(0);
});

test("avec des revenus : devise FCFA dans le titre, infobulle complète par mois, année sur la première colonne", async ({ page }) => {
  await simuler(page, { ateliers: [0, 1, 0, 2, 0, 1], revenus: [0, 0, 15000, 0, 42000, 0] });
  await page.goto("/vue-ensemble");
  const carte = page.getByTestId("carte-tendance-revenus");
  await expect(carte.getByTestId("graphique-vide")).toHaveCount(0);
  await expect(carte.getByText(/\(FCFA\)/)).toBeVisible();

  // Infobulle (survol) : mois complet + année + montant + unité, pour chaque colonne.
  const colonnes = carte.locator("[title]");
  await expect(colonnes).toHaveCount(6);
  await expect(colonnes.nth(4)).toHaveAttribute("title", /^[a-zéûà]+ \d{4} : 42\D?000 FCFA$/i);
  await expect(colonnes.nth(0)).toHaveAttribute("title", /^[a-zéûà]+ \d{4} : 0 FCFA$/i);
  // Valeur écrite au-dessus de la barre, année lisible sous le premier mois.
  await expect(carte.getByText(/^15\D?000$/)).toBeVisible();
  await expect(carte.getByText(String(SIX_MOIS[0].slice(0, 4))).first()).toBeVisible();
  // Les nouveaux ateliers ne portent pas d'unité monétaire.
  const ateliers = page.getByTestId("carte-tendance-ateliers").locator("[title]");
  await expect(ateliers.nth(3)).toHaveAttribute("title", /^[a-zéûà]+ \d{4} : 2$/i);
});

test("la vue d'ensemble garde ses six indicateurs", async ({ page }) => {
  await page.goto("/vue-ensemble");
  for (const libelle of ["Ateliers", "Ateliers actifs", "Ateliers suspendus", "Comptes admin", "Clientes (toutes plateformes)", "Commandes (toutes plateformes)"]) {
    await expect(page.getByText(libelle, { exact: true }).first()).toBeVisible();
  }
});
