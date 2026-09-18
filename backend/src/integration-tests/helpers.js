// Utilitaires partagés par les tests d'intégration (base Postgres JETABLE
// et DÉDIÉE — voir preload.js, jamais la base de dev/prod). Démarre la vraie
// app Express sur un port éphémère et l'interroge par HTTP réel (fetch),
// exactement comme les vérifications curl manuelles menées tout au long de
// ce projet — juste automatisées ici.
import { once } from "node:events";
import bcrypt from "bcryptjs";
import app from "../app.js";
import { prisma } from "../lib/prisma.js";

export async function demarrerServeur() {
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

export function arreterServeur(server) {
  return new Promise((resolve) => server.close(resolve));
}

// Chaque client() simule un utilisateur distinct avec sa propre IP publique
// (voir plus bas) — un compteur de process suffit, jamais réinitialisé entre
// tests d'un même run.
let compteurIp = 1;

/**
 * Client HTTP avec un cookie de session géré manuellement — `fetch` n'a pas
 * de cookie jar intégré côté Node, contrairement à un navigateur.
 *
 * Envoie un en-tête X-Forwarded-For unique par instance (app.js configure
 * `trust proxy`, donc Express en tient compte pour req.ip) : sans ça, TOUS
 * les logins de TOUS les fichiers de test partageraient la même IP loopback
 * aux yeux du rate limiter persistant (lib/rateLimiter.js), qui cumule ses
 * compteurs en base entre tests — un seul fichier avec beaucoup de logins
 * suffit à déclencher un 429 sur les tests suivants, un faux positif déjà
 * rencontré deux fois pendant le développement. Chaque client() ici
 * représente un utilisateur réel différent, donc une IP différente est plus
 * fidèle au comportement réel, pas un contournement du rate limiter lui-même.
 */
export function client(baseUrl) {
  let cookie = null;
  const ip = `203.0.113.${compteurIp++}`;
  async function requete(path, { method = "GET", body } = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": ip,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    let json = null;
    try {
      json = await res.json();
    } catch {
      // Pas de corps JSON (204) — laissé à null.
    }
    return { status: res.status, body: json };
  }
  return {
    get: (path) => requete(path),
    post: (path, body) => requete(path, { method: "POST", body }),
    patch: (path, body) => requete(path, { method: "PATCH", body }),
    put: (path, body) => requete(path, { method: "PUT", body }),
    delete: (path) => requete(path, { method: "DELETE" }),
  };
}

// `process.pid` obligatoire en plus de Date.now()+compteur : `node --test`
// exécute chaque FICHIER de test dans son propre process, chacun avec son
// compteur remis à zéro — deux fichiers peuvent donc produire le même
// identifiant à la même milliseconde (trouvé en CI après l'ajout d'un
// nouveau fichier de test, qui a fait basculer une collision jusque-là
// juste assez rare pour ne jamais se produire). Le pid, unique par
// process, élimine cette collision inter-fichiers.
let compteur = 0;
function identifiantUnique(prefixe) {
  compteur += 1;
  return `${prefixe}-${process.pid}-${Date.now()}-${compteur}`;
}

/** Coût bcrypt volontairement réduit (4) : rapidité des tests, aucune
 * sécurité réelle en jeu sur une base jetable détruite après le run. */
export async function creerAtelierEtAdmin({ nom = "Atelier Test", password = "password123" } = {}) {
  const identifiant = identifiantUnique("admin-test");
  const passwordHash = await bcrypt.hash(password, 4);
  const atelier = await prisma.atelier.create({ data: { nom, devise: "FCFA" } });
  const admin = await prisma.user.create({
    data: { identifiant, passwordHash, role: "ADMIN", atelierId: atelier.id },
  });
  return { atelier, admin, identifiant, password };
}

export async function creerCliente(atelierId, data = {}) {
  return prisma.cliente.create({
    data: { atelierId, nom: "Test", prenom: "Cliente", telephone: "90000000", ...data },
  });
}

/**
 * Crée directement un compte USER lié à une Cliente (état final du flux
 * d'invitation réel — voir clientes.routes.js POST /:id/inviter et
 * auth.routes.js POST /activer-compte-client, qui ont chacun leur propre
 * test dédié) : évite de rejouer la mécanique de jeton dans CHAQUE test
 * d'autorisation qui a juste besoin d'un compte client déjà actif.
 */
export async function creerEtActiverClient(atelierId, clienteId, { password = "password123" } = {}) {
  const identifiant = identifiantUnique("user-test");
  const passwordHash = await bcrypt.hash(password, 4);
  const user = await prisma.user.create({ data: { identifiant, passwordHash, role: "USER", atelierId } });
  await prisma.cliente.update({ where: { id: clienteId }, data: { userId: user.id } });
  return { user, identifiant, password };
}

export async function creerCommande(atelierId, clienteId, data = {}) {
  return prisma.commande.create({
    data: {
      atelierId,
      clienteId,
      numero: `TEST-${identifiantUnique("cmd")}`,
      typeVetement: "ROBE",
      prixTotal: "10000",
      dateLivraisonPrevue: new Date(Date.now() + 7 * 86_400_000),
      ...data,
    },
  });
}

/**
 * Suppression FK-safe (enfants avant parents) — même discipline que le
 * reste de l'app (onDelete: Restrict partout), pas de suppression en
 * cascade "magique" même dans les tests.
 */
export async function supprimerAtelier(atelierId) {
  const commandes = await prisma.commande.findMany({ where: { atelierId }, select: { id: true } });
  const commandeIds = commandes.map((c) => c.id);
  // DemandeCommande AVANT commande/cliente : ses 3 FK (atelierId, clienteId,
  // commandeId) sont toutes en onDelete: Restrict.
  await prisma.demandeCommande.deleteMany({ where: { atelierId } });
  await prisma.notification.deleteMany({ where: { commandeId: { in: commandeIds } } });
  await prisma.recu.deleteMany({ where: { commandeId: { in: commandeIds } } });
  await prisma.livraison.deleteMany({ where: { commandeId: { in: commandeIds } } });
  await prisma.paiement.deleteMany({ where: { commandeId: { in: commandeIds } } });
  await prisma.commande.deleteMany({ where: { atelierId } });
  await prisma.mesure.deleteMany({ where: { cliente: { atelierId } } });
  // userId (Cliente -> User) est onDelete: SetNull, mais on détache quand
  // même explicitement avant de supprimer les User (role USER) ci-dessous,
  // par clarté plutôt que de compter sur le SetNull implicite.
  await prisma.cliente.updateMany({ where: { atelierId }, data: { userId: null } });
  await prisma.cliente.deleteMany({ where: { atelierId } });
  await prisma.modele.deleteMany({ where: { atelierId } });
  await prisma.depense.deleteMany({ where: { atelierId } });
  const articles = await prisma.articleStock.findMany({ where: { atelierId }, select: { id: true } });
  await prisma.mouvementStock.deleteMany({ where: { articleId: { in: articles.map((a) => a.id) } } });
  await prisma.articleStock.deleteMany({ where: { atelierId } });
  const abonnements = await prisma.abonnement.findMany({ where: { atelierId }, select: { id: true } });
  await prisma.transaction.deleteMany({ where: { abonnementId: { in: abonnements.map((a) => a.id) } } });
  await prisma.abonnement.deleteMany({ where: { atelierId } });
  await prisma.user.deleteMany({ where: { atelierId } });
  await prisma.atelier.delete({ where: { id: atelierId } });
}
