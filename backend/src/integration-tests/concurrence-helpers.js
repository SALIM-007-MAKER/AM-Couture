// Outils communs aux tests de concurrence (sous-phase 3.1). Tout passe par l'API réelle :
// les écritures directes en base contourneraient justement les verrous et les événements
// que ces tests doivent vérifier.
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma.js";
import { client, creerAtelierEtAdmin, creerCliente, supprimerAtelier } from "./helpers.js";

export const MDP = "Atelier-Test-2026!";

/** Atelier + ADMIN connecté + une cliente avec une mesure (requise pour commander). */
export async function preparerAtelier(baseUrl, nom = "Atelier Concurrence") {
  const { atelier, admin, identifiant } = await creerAtelierEtAdmin({ nom, password: MDP });
  const api = client(baseUrl);
  const login = await api.post("/api/auth/login", { identifiant, password: MDP });
  assert.equal(login.status, 200, "connexion de l'ADMIN de test");
  const cliente = await creerCliente(atelier.id);
  await prisma.mesure.create({ data: { clienteId: cliente.id, taille: "70" } });
  return { atelier, admin, identifiant, api, cliente };
}

const CHEMIN_STATUTS = ["EN_CONFECTION", "ESSAYAGE", "TERMINEE"];

/** Crée une commande via l'API, puis la fait avancer jusqu'à `statut` (NOUVELLE par défaut). */
export async function creerCommandeApi(api, clienteId, { prixTotal = "10000", statut = "NOUVELLE" } = {}) {
  const res = await api.post("/api/commandes", {
    clienteId,
    typeVetement: "ROBE",
    prixTotal,
    dateLivraisonPrevue: new Date(Date.now() + 7 * 86_400_000).toISOString(),
  });
  assert.equal(res.status, 201, `création de commande : ${JSON.stringify(res.body)}`);
  const commande = res.body;
  if (statut !== "NOUVELLE") {
    for (const etape of CHEMIN_STATUTS) {
      const r = await api.post(`/api/commandes/${commande.id}/statut`, { statut: etape });
      assert.equal(r.status, 200, `passage à ${etape} : ${JSON.stringify(r.body)}`);
      if (etape === statut) break;
    }
  }
  return commande;
}

export async function payer(api, commandeId, montant, mode = "ESPECES") {
  return api.post(`/api/commandes/${commandeId}/paiements`, { montant: String(montant), mode });
}

/** Somme des paiements non annulés d'une commande (lecture directe, pour les assertions). */
export async function totalPaye(commandeId) {
  const r = await prisma.paiement.aggregate({ where: { commandeId, annuleAt: null }, _sum: { montant: true } });
  return Number(r._sum.montant ?? 0);
}

/** Nettoyage complet d'un atelier de test, journal de sécurité compris. */
export async function nettoyerAtelier(atelierId, userIds = []) {
  await prisma.journalSecurite.deleteMany({ where: { OR: [{ atelierId }, { userId: { in: userIds } }] } });
  await supprimerAtelier(atelierId);
}
