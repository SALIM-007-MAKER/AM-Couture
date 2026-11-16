// Mesure de performance de l'API sur une base volumétrique LOCALE et jetable.
//
//   PERF_DATABASE_URL=postgresql://test:test@localhost:55432/gestion_atelier_perf node scripts/perf/mesure.mjs
//
// Pour chaque route : durée de bout en bout (médiane de N appels après un appel de chauffe), nombre de requêtes SQL
// émises, temps SQL cumulé, requête la plus lente. Les requêtes sont comptées en interceptant pg.Client.query :
// aucun code de production n'est modifié ni instrumenté.
//
// Garde-fous : refuse toute base non locale ou dont le nom ne contient pas « perf ».
// Prérequis : base migrée puis remplie par scripts/perf/seed-volume.sql (voir docs/PERFORMANCES.md).
import { createRequire } from "node:module";
import { once } from "node:events";
import { writeFileSync } from "node:fs";

const url = process.env.PERF_DATABASE_URL;
if (!url) {
  console.error("PERF_DATABASE_URL est obligatoire (base locale dont le nom contient « perf »).");
  process.exit(1);
}
const { hostname, pathname } = new URL(url);
if (!["localhost", "127.0.0.1", "::1"].includes(hostname) || !/perf/i.test(pathname)) {
  console.error(`Refus : ${hostname}${pathname} n'est pas une base locale « perf ».`);
  process.exit(1);
}
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.JWT_SECRET ??= "perf-secret-local-uniquement";
process.env.NODE_ENV = "test"; // pas de journal d'accès pendant la mesure
const REPETITIONS = Number(process.env.PERF_REPETITIONS ?? 5);

// Interception SQL (avant l'import de l'application).
const require = createRequire(new URL("../../backend/package.json", import.meta.url));
const pg = require("pg");
let journalSql = [];
const queryOriginale = pg.Client.prototype.query;
pg.Client.prototype.query = function (...args) {
  const premier = args[0];
  const texte = typeof premier === "string" ? premier : (premier?.text ?? "");
  const debut = performance.now();
  const noter = () => journalSql.push({ ms: performance.now() - debut, texte });
  const dernier = args.length - 1;
  if (typeof args[dernier] === "function") {
    // Forme à rappel (utilisée par le pool pour ses requêtes internes).
    const rappel = args[dernier];
    args[dernier] = (...r) => {
      noter();
      return rappel(...r);
    };
    return queryOriginale.apply(this, args);
  }
  const resultat = queryOriginale.apply(this, args);
  if (resultat && typeof resultat.then === "function") {
    return resultat.then(
      (valeur) => (noter(), valeur),
      (erreur) => {
        noter();
        throw erreur;
      },
    );
  }
  return resultat;
};

const { default: app } = await import("../../backend/src/app.js");
const { prisma } = await import("../../backend/src/lib/prisma.js");
const bcrypt = require("bcryptjs");

const MOT_DE_PASSE = "Passe-perf-123";
await prisma.user.deleteMany({ where: { identifiant: "perf-pdg" } });
await prisma.user.create({
  data: { identifiant: "perf-pdg", passwordHash: await bcrypt.hash(MOT_DE_PASSE, 4), role: "ADMIN", atelierId: "perf-gros" },
});

// Phase 7 : vitrine publique, lookbook et demandes en ligne sur le gros atelier (volume volontairement élevé : 3 000
// modèles dont 2 000 publiés, 4 000 photos, 2 000 demandes). Données de test créées en SQL, base jetable uniquement.
await prisma.$executeRawUnsafe(`UPDATE "Atelier" SET slug = 'perf-vitrine', "vitrineActive" = true, "demandesEnLigne" = true WHERE id = 'perf-gros'`);
await prisma.$executeRawUnsafe(`INSERT INTO "ImageAtelier"(id, "atelierId", mime, taille, contenu) SELECT 'perf-img-' || g, 'perf-gros', 'image/jpeg', 2048, decode(repeat('ff', 2048), 'hex') FROM generate_series(1, 200) g`);
await prisma.$executeRawUnsafe(`INSERT INTO "Modele"(id, "atelierId", nom, categorie, description, publie, tags, "updatedAt") SELECT 'perf-mod-' || g, 'perf-gros', 'Modele ' || g, 'ROBE', 'Description du modele numero ' || g, g % 3 <> 0, ARRAY[CASE WHEN g % 5 = 0 THEN 'mariage' ELSE 'quotidien' END], now() FROM generate_series(1, 3000) g`);
await prisma.$executeRawUnsafe(`INSERT INTO "PhotoModele"(id, "modeleId", "imageId", ordre) SELECT 'perf-ph-' || g, 'perf-mod-' || ((g - 1) % 3000 + 1), 'perf-img-' || ((g - 1) % 200 + 1), g / 3000 FROM generate_series(1, 4000) g`);
await prisma.$executeRawUnsafe(`INSERT INTO "DemandeCommande"(id, "atelierId", origine, "contactPrenom", "contactNom", "contactTelephone", "consentementLe", description, statut, "updatedAt") SELECT 'perf-dem-' || g, 'perf-gros', 'VITRINE', 'Pre' || g, 'Nom' || g, '9' || lpad(g::text, 7, '0'), now(), 'Demande ' || g, CASE WHEN g % 4 = 0 THEN 'EN_ATTENTE' ELSE 'REFUSEE' END::"StatutDemandeCommande", now() FROM generate_series(1, 2000) g`);

const server = app.listen(0);
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.9.9.9" },
  body: JSON.stringify({ identifiant: "perf-pdg", password: MOT_DE_PASSE }),
});
if (!login.ok) throw new Error(`Connexion impossible : ${login.status}`);
const cookie = login.headers.get("set-cookie").split(";")[0];

const mediane = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function mesurer(nom, chemin) {
  const appel = () => fetch(`${base}${chemin}`, { headers: { Cookie: cookie, "X-Forwarded-For": "10.9.9.9" } });
  await (await appel()).arrayBuffer(); // chauffe (plans, connexions)
  const durees = [];
  let sql = [];
  let statut = 0;
  let octets = 0;
  for (let i = 0; i < REPETITIONS; i++) {
    journalSql = [];
    const t0 = performance.now();
    const res = await appel();
    const corps = await res.arrayBuffer();
    durees.push(performance.now() - t0);
    statut = res.status;
    octets = corps.byteLength;
    sql = journalSql;
  }
  const lente = sql.reduce((m, q) => (q.ms > (m?.ms ?? -1) ? q : m), null);
  return {
    nom,
    chemin,
    statut,
    msMediane: Math.round(mediane(durees)),
    msMax: Math.round(Math.max(...durees)),
    requetesSql: sql.length,
    msSql: Math.round(sql.reduce((s, q) => s + q.ms, 0)),
    plusLenteMs: Math.round(lente?.ms ?? 0),
    toutesLesRequetes: sql.map((q) => `${Math.round(q.ms)}ms ${q.texte.replace(/\s+/g, " ").slice(0, 110)}`),
    plusLente: (lente?.texte ?? "").replace(/\s+/g, " ").slice(0, 160),
    octets,
  };
}

const ex = (
  await prisma.commande.findFirst({ where: { atelierId: "perf-gros" }, orderBy: { id: "asc" }, select: { id: true, clienteId: true } })
);
const du = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
const au = new Date().toISOString().slice(0, 10);

const ROUTES = [
  ["Tableau de bord — synthèse", "/api/dashboard/summary"],
  ["Tableau de bord — synthèse (30 j)", `/api/dashboard/summary?from=${du}&to=${au}`],
  ["Tableau de bord — récents", "/api/dashboard/recent?limit=10"],
  ["Commandes — liste p1", "/api/commandes?page=1&pageSize=20"],
  ["Commandes — liste p500", "/api/commandes?page=500&pageSize=20"],
  ["Commandes — filtre statut", "/api/commandes?statut=NOUVELLE"],
  ["Commandes — recherche texte", "/api/commandes?q=Nom12"],
  ["Commandes — export CSV", "/api/commandes/export"],
  ["Commande — détail", `/api/commandes/${ex.id}`],
  ["Clientes — liste p1", "/api/clientes?page=1&pageSize=20"],
  ["Clientes — recherche texte", "/api/clientes?q=Nom12"],
  ["Clientes — export CSV", "/api/clientes/export"],
  ["Cliente — totaux", `/api/clientes/${ex.clienteId}/totaux`],
  ["Paiements — liste globale", "/api/paiements?page=1&pageSize=20"],
  ["Dépenses — liste", "/api/depenses?page=1&pageSize=20"],
  ["Rapports — finances", "/api/rapports/finances"],
  ["Rapports — évolution", `/api/rapports/evolution?from=${du}&to=${au}`],
  ["Rapports — commandes", "/api/rapports/commandes"],
  ["Rapports — en retard", "/api/rapports/commandes/en-retard"],
  ["Rapports — à livrer", "/api/rapports/commandes/a-livrer"],
  ["Rapports — clientes", "/api/rapports/clientes"],
  ["Rapports — modèles", "/api/rapports/modeles"],
  ["Notifications — compteur", "/api/notifications/nombre-non-lues"],
  ["Notifications — liste", "/api/notifications"],
  ["Stock — liste", "/api/stock"],
  ["Vitrine — page 1", "/api/public/vitrines/perf-vitrine"],
  ["Vitrine — page 80", "/api/public/vitrines/perf-vitrine?page=80"],
  ["Vitrine — recherche texte", "/api/public/vitrines/perf-vitrine?q=numero%2012"],
  ["Vitrine — filtre tag", "/api/public/vitrines/perf-vitrine?tag=mariage"],
  ["Vitrine — image", "/api/public/vitrines/perf-vitrine/images/perf-img-1"],
  ["Lookbook — liste modèles", "/api/modeles?page=1&pageSize=20"],
  ["Demandes — liste", "/api/demandes?page=1&pageSize=20"],
];

const resultats = [];
for (const [nom, chemin] of ROUTES) {
  resultats.push(await mesurer(nom, chemin));
}

server.close();
await prisma.$disconnect();

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad("Route", 36)} ${pad("HTTP", 5)} ${pad("ms", 6)} ${pad("SQL", 4)} ${pad("msSQL", 6)} ${pad("max", 5)} ko`);
for (const r of resultats) {
  console.log(`${pad(r.nom, 36)} ${pad(r.statut, 5)} ${pad(r.msMediane, 6)} ${pad(r.requetesSql, 4)} ${pad(r.msSql, 6)} ${pad(r.plusLenteMs, 5)} ${Math.round(r.octets / 1024)}`);
}
if (process.env.PERF_SORTIE) writeFileSync(process.env.PERF_SORTIE, JSON.stringify(resultats, null, 2));
process.exit(0);
