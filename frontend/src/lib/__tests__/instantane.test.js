import { test } from "node:test";
import assert from "node:assert/strict";
import { QueryClient } from "@tanstack/query-core";
import {
  construireInstantane,
  instantaneUtilisable,
  restaurerDepuis,
  demarrerSauvegarde,
  peutConserver,
  DUREE_MAX_MS,
  TAILLE_MAX_REQUETE,
  TAILLE_MAX_TOTAL,
  VERSION,
} from "../instantane.js";

const PDG = { id: "u1", role: "ADMIN", identifiant: "pdg" };
const req = (queryKey, data, dataUpdatedAt = 1000, status = "success") => ({ queryKey, state: { status, data, dataUpdatedAt } });
const me = (user = PDG, t = 5000) => req(["auth", "me"], user, t);
const nouveauClient = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

function adaptateurMemoire(initial = null) {
  const a = { valeur: initial, ecritures: 0, effacements: 0 };
  a.lire = async () => a.valeur;
  a.ecrire = async (s) => {
    a.valeur = s;
    a.ecritures++;
  };
  a.effacer = async () => {
    a.valeur = null;
    a.effacements++;
  };
  return a;
}

test("peutConserver : PDG et employé seulement", () => {
  assert.equal(peutConserver({ id: "x", role: "ADMIN" }), true);
  assert.equal(peutConserver({ id: "x", role: "EMPLOYE" }), true);
  for (const role of ["USER", "SUPERADMIN"]) assert.equal(peutConserver({ id: "x", role }), false, role);
  assert.equal(peutConserver(null), false);
  assert.equal(peutConserver({ role: "ADMIN" }), false);
});

test("construire : ne conserve que la liste blanche (jamais paiements, dépenses, rapports, abonnement, achats)", () => {
  const snap = construireInstantane([
    me(),
    req(["clientes", "list", {}], { data: [1] }),
    req(["commandes", "detail", "c1"], { id: "c1" }),
    req(["modeles", "list"], []),
    req(["parametres"], { nom: "A" }),
    req(["paiements"], [{ montant: 1 }]),
    req(["depenses", "list"], []),
    req(["rapports", "x"], {}),
    req(["abonnements"], {}),
    req(["achats", "list"], []),
    req(["stock", "list"], []),
    req(["moi", "profil"], {}),
    req(["auth", "atelier-pour-identifiant", "abc"], {}),
  ]);
  assert.deepEqual(snap.requetes.map((r) => r.key[0]).sort(), ["clientes", "commandes", "modeles", "parametres"]);
  assert.equal(snap.userId, "u1");
  assert.equal(snap.verifieLe, 5000);
  assert.equal(snap.version, VERSION);
});

test("construire : rien sans compte éligible ; requêtes en erreur ou vides ignorées", () => {
  assert.equal(construireInstantane([req(["clientes"], [])]), null, "pas de compte");
  assert.equal(construireInstantane([me({ id: "c", role: "USER" }), req(["clientes"], [])]), null, "cliente");
  assert.equal(construireInstantane([me({ id: "s", role: "SUPERADMIN" })]), null, "plateforme");
  assert.equal(construireInstantane([req(["auth", "me"], null, 1, "success")]), null, "déconnecté");
  const snap = construireInstantane([me(), req(["clientes", "a"], [1], 1, "error"), req(["clientes", "b"], undefined)]);
  assert.equal(snap.requetes.length, 0);
});

test("construire : tailles bornées, les plus récentes d'abord", () => {
  const gros = "x".repeat(TAILLE_MAX_REQUETE + 10);
  const moyen = "y".repeat(Math.floor(TAILLE_MAX_REQUETE * 0.8));
  const snap = construireInstantane([
    me(),
    req(["modeles", "gros"], gros, 9000),
    req(["modeles", "a"], moyen, 100),
    req(["modeles", "b"], moyen, 300),
    req(["modeles", "c"], moyen, 200),
    req(["modeles", "d"], moyen, 400),
    ...Array.from({ length: 12 }, (_, i) => req(["modeles", `z${i}`], moyen, 50 + i)),
  ]);
  assert.ok(!snap.requetes.some((r) => r.key[1] === "gros"), "une requête trop grosse est écartée");
  assert.ok(JSON.stringify(snap).length <= TAILLE_MAX_TOTAL + 2000, "total borné");
  assert.ok(snap.requetes.length >= 1 && snap.requetes.length < 16, "toutes ne tiennent pas");
  assert.equal(snap.requetes[0].key[1], "d", "la plus récente est gardée en premier");
});

test("utilisable : expire après 7 jours, forme vérifiée, compte cohérent", () => {
  const snap = construireInstantane([me(PDG, 10_000)]);
  assert.equal(instantaneUtilisable(snap, 10_000 + DUREE_MAX_MS), true);
  assert.equal(instantaneUtilisable(snap, 10_000 + DUREE_MAX_MS + 1), false, "expiré");
  assert.equal(instantaneUtilisable(snap, 9_000), false, "date dans le futur");
  assert.equal(instantaneUtilisable({ ...snap, version: 99 }, 10_000), false);
  assert.equal(instantaneUtilisable({ ...snap, userId: "autre" }, 10_000), false, "incohérent");
  assert.equal(instantaneUtilisable({ ...snap, me: { id: "u1", role: "USER" } }, 10_000), false);
  assert.equal(instantaneUtilisable({ ...snap, requetes: null }, 10_000), false);
  assert.equal(instantaneUtilisable(null), false);
});

test("restaurer : recharge le cache avec les dates d'origine ; périmé ou illisible : supprimé", async () => {
  const snap = construireInstantane([me(PDG, 10_000), req(["clientes", "list"], { data: ["Awa"] }, 8000)]);
  const a = adaptateurMemoire(snap);
  const qc = nouveauClient();
  assert.equal(await restaurerDepuis(a, qc, 20_000), true);
  assert.deepEqual(qc.getQueryData(["clientes", "list"]), { data: ["Awa"] });
  assert.equal(qc.getQueryData(["auth", "me"]).id, "u1");
  assert.equal(qc.getQueryState(["clientes", "list"]).dataUpdatedAt, 8000, "date d'origine conservée");
  assert.equal(a.effacements, 0);

  const vieux = adaptateurMemoire(snap);
  const qc2 = nouveauClient();
  assert.equal(await restaurerDepuis(vieux, qc2, 10_000 + DUREE_MAX_MS + 1), false);
  assert.equal(vieux.valeur, null, "instantané expiré supprimé de l'appareil");
  assert.equal(qc2.getQueryData(["clientes", "list"]), undefined);

  const casse = {
    lire: async () => {
      throw new Error("boom");
    },
    effacer: async () => {},
  };
  assert.equal(await restaurerDepuis(casse, nouveauClient()), false);
  assert.equal(await restaurerDepuis(adaptateurMemoire(null), nouveauClient()), false);
});

test("restaurer : n'injecte jamais une clé hors liste blanche, même si l'instantané en contient", async () => {
  const snap = {
    ...construireInstantane([me()]),
    requetes: [
      { key: ["paiements"], data: [1], updatedAt: 1 },
      { key: ["clientes", "x"], data: [2], updatedAt: 1 },
    ],
  };
  const qc = nouveauClient();
  await restaurerDepuis(adaptateurMemoire(snap), qc, 6000);
  assert.equal(qc.getQueryData(["paiements"]), undefined);
  assert.deepEqual(qc.getQueryData(["clientes", "x"]), [2]);
});

test("sauvegarde : écrit (regroupé), puis efface dès que plus personne n'est connecté", async () => {
  const qc = nouveauClient();
  const a = adaptateurMemoire();
  qc.setQueryData(["auth", "me"], PDG);
  const arreter = demarrerSauvegarde(qc, a, { delaiMs: 10 });
  qc.setQueryData(["clientes", "list"], [1]);
  qc.setQueryData(["clientes", "list"], [1, 2]);
  qc.setQueryData(["commandes", "list"], [3]);
  await attendre(80);
  assert.equal(a.ecritures, 1, "écritures regroupées");
  assert.deepEqual(a.valeur.requetes.map((r) => r.key[0]).sort(), ["clientes", "commandes"]);

  qc.setQueryData(["auth", "me"], null); // déconnexion / session expirée
  await attendre(80);
  assert.equal(a.valeur, null, "instantané effacé");
  arreter();
});

test("sauvegarde : un compte non éligible ne laisse rien ; l'arrêt annule l'écriture en attente", async () => {
  const qc = nouveauClient();
  const a = adaptateurMemoire({ ancien: true });
  qc.setQueryData(["auth", "me"], { id: "c1", role: "USER" });
  qc.setQueryData(["moi", "profil"], { nom: "X" });
  const arreter = demarrerSauvegarde(qc, a, { delaiMs: 10 });
  await attendre(80);
  assert.equal(a.valeur, null, "l'ancien instantané d'un autre compte est effacé");
  const avant = a.effacements;
  qc.setQueryData(["clientes", "z"], [1]);
  arreter();
  await attendre(60);
  assert.equal(a.ecritures, 0);
  assert.equal(a.effacements, avant, "rien de plus après l'arrêt");
});

test("sauvegarde : un stockage qui échoue n'a aucune conséquence visible", async () => {
  const qc = nouveauClient();
  qc.setQueryData(["auth", "me"], PDG);
  const casse = {
    ecrire: async () => {
      throw new Error("quota");
    },
    effacer: async () => {
      throw new Error("x");
    },
  };
  const arreter = demarrerSauvegarde(qc, casse, { delaiMs: 5 });
  await attendre(50);
  arreter();
});
