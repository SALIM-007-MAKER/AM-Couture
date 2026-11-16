// Inventaire statique des routes de l'API, lu dans le code source (app.js + fichiers *.routes.js).
// Sert au test de cohérence avec docs/API.md : une route ajoutée, supprimée ou renommée sans mise à jour
// de la documentation fait échouer le test.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ici = dirname(fileURLToPath(import.meta.url));
const src = resolve(ici, "../..");
const lire = (f) => readFileSync(resolve(src, f), "utf8");

// Routeurs montés par un autre routeur (pas dans app.js) : variable → préfixe complet.
const IMBRIQUES = {
  "routes/mesures.routes.js": { router: "/api/clientes/:id/mesures" },
  "routes/rapportsAvances.routes.js": { router: "/api/rapports/avances" },
  "routes/paiements.routes.js": { router: "/api/commandes/:commandeId/paiements", paiementsGlobalRouter: "/api/paiements" },
  "routes/livraisons.routes.js": { router: "/api/commandes/:commandeId/livraisons", livraisonsGlobalRouter: "/api/livraisons" },
  "routes/recus.routes.js": { recusCommandeRouter: "/api/commandes/:commandeId/recus", router: "/api/recus" },
};

export function inventaireRoutes() {
  const app = lire("app.js");
  // import nomLocal from "./routes/xxx.routes.js"  /  import { a as b } ...
  const fichierParNom = {};
  for (const m of app.matchAll(/import\s+(\w+)\s+from\s+"\.\/(routes\/[\w.]+\.js)"/g)) fichierParNom[m[1]] = m[2];
  const prefixes = {}; // fichier → { router: préfixe }
  for (const m of app.matchAll(/app\.use\("(\/api\/[^"]*)",\s*(\w+)\)/g)) {
    const fichier = fichierParNom[m[2]];
    if (fichier) (prefixes[fichier] ??= {}).router = m[1];
  }
  for (const [fichier, vars] of Object.entries(IMBRIQUES)) prefixes[fichier] = { ...(prefixes[fichier] ?? {}), ...vars };
  // Les routes de app.js lui-même (santé).
  const routes = [];
  for (const m of app.matchAll(/app\.(get|post|put|patch|delete)\("(\/api\/[^"]*)"/g)) routes.push(`${m[1].toUpperCase()} ${m[2]}`);

  for (const [fichier, vars] of Object.entries(prefixes)) {
    const code = lire(fichier);
    for (const m of code.matchAll(/^(\w+)\.(get|post|put|patch|delete)\(\s*"([^"]*)"/gm)) {
      const base = vars[m[1]];
      if (base === undefined) throw new Error(`${fichier} : routeur « ${m[1]} » sans préfixe connu (compléter IMBRIQUES).`);
      routes.push(`${m[2].toUpperCase()} ${base}${m[3] === "/" ? "" : m[3]}`);
    }
    // Un routeur monté dans un fichier non prévu ferait disparaître ses routes de l'inventaire.
    for (const m of code.matchAll(/^\w+\.use\("(\/[^"]+)",\s*(\w+)\)/gm)) {
      const connu = ["/avances", "/:commandeId/paiements", "/:commandeId/livraisons", "/:commandeId/recus", "/:id/mesures"];
      if (!connu.includes(m[1])) throw new Error(`${fichier} : montage imbriqué ${m[1]} inconnu (compléter IMBRIQUES).`);
    }
  }
  return routes.sort();
}
