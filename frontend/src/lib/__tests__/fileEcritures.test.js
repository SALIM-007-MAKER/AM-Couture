import test from "node:test";
import assert from "node:assert/strict";
import {
  ecritureAutorisee,
  creerElement,
  filtrerFileValide,
  classerErreur,
  rejouer,
  nouvelleCle,
  DUREE_MAX_REJEU_MS,
  MAX_ELEMENTS,
} from "../fileEcritures.js";

const base = (surcharge = {}) => ({
  type: "cliente.creer",
  methode: "POST",
  chemin: "/clientes",
  corps: { nom: "A", prenom: "B", telephone: "99887766" },
  userId: "u1",
  ...surcharge,
});
const err = (status, extra = {}) => Object.assign(new Error(extra.message ?? "x"), { status, ...extra });

test("liste blanche : cliente, mesures, avance de statut avec garde", () => {
  assert.equal(ecritureAutorisee("cliente.creer", "POST", "/clientes", {}), true);
  assert.equal(ecritureAutorisee("mesure.creer", "POST", "/clientes/abc123/mesures", {}), true);
  assert.equal(ecritureAutorisee("commande.statut", "POST", "/commandes/c1/statut", { statut: "EN_COURS", statutAttendu: "NOUVELLE" }), true);
});

test("jamais d'argent ni de livraison, jamais de chemin détourné", () => {
  assert.equal(ecritureAutorisee("paiement.creer", "POST", "/commandes/c1/paiements", {}), false);
  // Même avec un type autorisé, le chemin doit correspondre : on ne peut pas faire passer un paiement pour une mesure.
  assert.equal(ecritureAutorisee("mesure.creer", "POST", "/commandes/c1/paiements", {}), false);
  assert.equal(ecritureAutorisee("mesure.creer", "POST", "/clientes/a/mesures/../../x", {}), false);
  assert.equal(ecritureAutorisee("cliente.creer", "DELETE", "/clientes", {}), false);
  assert.equal(ecritureAutorisee("commande.statut", "POST", "/commandes/c1/livraisons", { statut: "X", statutAttendu: "Y" }), false);
});

test("avance de statut : garde obligatoire et jamais LIVREE", () => {
  assert.equal(ecritureAutorisee("commande.statut", "POST", "/commandes/c1/statut", { statut: "EN_COURS" }), false);
  assert.equal(ecritureAutorisee("commande.statut", "POST", "/commandes/c1/statut", { statut: "LIVREE", statutAttendu: "TERMINEE" }), false);
});

test("creerElement refuse l'interdit et exige un propriétaire", () => {
  assert.throws(() => creerElement(base({ type: "paiement.creer", chemin: "/commandes/c/paiements" })));
  assert.throws(() => creerElement(base({ userId: undefined })));
  const e = creerElement(base(), 1000);
  assert.equal(e.etat, "attente");
  assert.equal(e.creeLe, 1000);
  assert.match(e.cle, /^[A-Za-z0-9_.:-]{8,128}$/); // format accepté par le serveur
  assert.notEqual(nouvelleCle(), nouvelleCle());
});

test("rechargement : file d'un autre compte, élément falsifié ou hors liste blanche écartés", () => {
  const bon = creerElement(base());
  const autre = creerElement(base({ userId: "u2" }));
  const falsifie = { ...creerElement(base()), type: "paiement.creer", chemin: "/commandes/c/paiements" };
  const etatInconnu = { ...creerElement(base()), etat: "envoye" };
  assert.deepEqual(filtrerFileValide([bon, autre, falsifie, etatInconnu, null, "x"], "u1"), [bon]);
  assert.deepEqual(filtrerFileValide("pas un tableau", "u1"), []);
  const trop = Array.from({ length: MAX_ELEMENTS + 20 }, () => creerElement(base()));
  assert.equal(filtrerFileValide(trop, "u1").length, MAX_ELEMENTS);
});

test("classement des erreurs de rejeu", () => {
  assert.equal(classerErreur(err(0)), "reessayer");
  assert.equal(classerErreur(err(503)), "reessayer");
  assert.equal(classerErreur(err(429)), "reessayer");
  assert.equal(classerErreur(err(409, { retryAfter: 2 })), "reessayer"); // « en cours »
  assert.equal(classerErreur(err(409)), "conflit"); // doublon, statut changé…
  assert.equal(classerErreur(err(403)), "conflit");
  assert.equal(classerErreur(err(404)), "conflit");
  assert.equal(classerErreur(err(401)), "session");
  assert.equal(classerErreur(new Error("boom")), "reessayer");
});

test("rejeu : dans l'ordre, chaque élément avec SA clé, les envoyés sont retirés", async () => {
  const a = creerElement(base({ libelle: "a" }));
  const b = creerElement(base({ type: "mesure.creer", chemin: "/clientes/c1/mesures", libelle: "b" }));
  const vus = [];
  const r = await rejouer([a, b], async (e) => void vus.push([e.libelle, e.cle]), { userId: "u1" });
  assert.deepEqual(vus, [["a", a.cle], ["b", b.cle]]);
  assert.deepEqual(r.elements, []);
  assert.equal(r.appliques, 2);
  assert.equal(r.interrompu, false);
});

test("rejeu : un conflit est gardé avec le message du serveur, les suivants continuent", async () => {
  const a = creerElement(base({ libelle: "a" }));
  const b = creerElement(base({ libelle: "b" }));
  const r = await rejouer([a, b], async (e) => {
    if (e.libelle === "a") throw err(409, { message: "Un client avec ce téléphone existe déjà." });
  }, { userId: "u1" });
  assert.equal(r.elements.length, 1);
  assert.equal(r.elements[0].etat, "conflit");
  assert.equal(r.elements[0].message, "Un client avec ce téléphone existe déjà.");
  assert.equal(r.appliques, 1);
  // Un conflit n'est plus rejoué.
  let appels = 0;
  await rejouer(r.elements, async () => void appels++, { userId: "u1" });
  assert.equal(appels, 0);
});

test("rejeu : panne réseau → arrêt net, rien n'est sauté, ordre conservé", async () => {
  const a = creerElement(base({ libelle: "a" }));
  const b = creerElement(base({ libelle: "b" }));
  const vus = [];
  const r = await rejouer([a, b], async (e) => {
    vus.push(e.libelle);
    throw err(0);
  }, { userId: "u1" });
  assert.deepEqual(vus, ["a"]); // b n'est pas tenté avant a
  assert.equal(r.interrompu, true);
  assert.equal(r.elements.length, 2);
  assert.equal(r.elements[0].tentatives, 1);
  assert.equal(r.elements[0].etat, "attente");
});

test("rejeu : trop ancien → « à vérifier », jamais rejoué à l'aveugle", async () => {
  const a = creerElement(base(), 0);
  let appels = 0;
  const r = await rejouer([a], async () => void appels++, { userId: "u1", maintenant: DUREE_MAX_REJEU_MS + 1 });
  assert.equal(appels, 0);
  assert.equal(r.elements[0].etat, "a_verifier");
});

test("rejeu : jamais sous un autre compte", async () => {
  const a = creerElement(base({ userId: "u2" }));
  let appels = 0;
  const r = await rejouer([a], async () => void appels++, { userId: "u1" });
  assert.equal(appels, 0);
  assert.equal(r.elements.length, 1);
});
