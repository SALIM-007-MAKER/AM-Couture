import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireClient } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { computeSolde, statutPaiement } from "../lib/money.js";
import { reconcilierNotifications } from "../lib/notifications.js";
import { creerDemandeSchema } from "../schemas/demandeCommande.schema.js";
import { RECU_INCLUDE } from "../lib/recuInclude.js";
import { streamRecuPdf } from "../lib/recuPdf.js";

// Espace client final (§ plan rôle USER, Phase 3) — un USER voit UNIQUEMENT
// ses propres données. RÈGLE ABSOLUE, répétée sur chaque route ci-dessous :
// filtrer par req.user.clienteId, JAMAIS par req.user.atelierId seul (voir
// le commentaire complet sur requireClient, auth.middleware.js).
//
// Délibérément AUCUNE écriture sur les données métier ici (pas de
// modification de commande/paiement/mesure) : un USER consulte, il ne
// modifie jamais directement — seule exception, POST /demandes, qui ne crée
// qu'une PROPOSITION, jamais une donnée engageante.
const router = Router();
router.use(requireAuth, requireClient);
router.param("id", requireValidIdParam);

// GET /api/moi — profil (la Cliente liée à ce compte).
router.get("/", async (req, res) => {
  const cliente = await prisma.cliente.findUnique({ where: { id: req.user.clienteId } });
  if (!cliente) throw new HttpError(404, "Profil introuvable.");
  res.json(cliente);
});

// GET /api/moi/mesures — historique complet, plus récente en premier (même
// tri que côté ADMIN, voir mesures.routes.js).
router.get("/mesures", async (req, res) => {
  const data = await prisma.mesure.findMany({
    where: { clienteId: req.user.clienteId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ data });
});

const COMMANDE_SELECT = {
  id: true,
  numero: true,
  typeVetement: true,
  description: true,
  couleur: true,
  tissu: true,
  prixTotal: true,
  statut: true,
  priorite: true,
  dateCommande: true,
  dateLivraisonPrevue: true,
  photoTissuUrl: true,
  photoModeleUrl: true,
  modele: { select: { id: true, nom: true, categorie: true, photoUrl: true } },
};

function avecSolde(commande, paiements) {
  const actifs = paiements.filter((p) => !p.annuleAt);
  const { totalPaye, solde } = computeSolde(commande.prixTotal, actifs);
  return { ...commande, totalPaye, solde, statutPaiement: statutPaiement(commande.prixTotal, totalPaye) };
}

// GET /api/moi/commandes — toutes les commandes de CE client, jamais
// celles d'un autre client du même atelier.
router.get("/commandes", async (req, res) => {
  const commandes = await prisma.commande.findMany({
    where: { clienteId: req.user.clienteId },
    orderBy: { dateCommande: "desc" },
    select: { ...COMMANDE_SELECT, paiements: { select: { montant: true, annuleAt: true } } },
  });
  const data = commandes.map(({ paiements, ...c }) => avecSolde(c, paiements));
  res.json({ data });
});

// GET /api/moi/commandes/:id — détail, avec l'historique de paiements ET de
// livraisons de CETTE commande (jamais accessible si elle appartient à un
// autre client — filtre clienteId, pas seulement l'id).
router.get("/commandes/:id", async (req, res) => {
  const commande = await prisma.commande.findFirst({
    where: { id: req.params.id, clienteId: req.user.clienteId },
    select: {
      ...COMMANDE_SELECT,
      paiements: { where: { annuleAt: null }, orderBy: { date: "desc" } },
      livraisons: { where: { annuleAt: null }, orderBy: { dateLivraison: "desc" } },
    },
  });
  if (!commande) throw new HttpError(404, "Commande introuvable.");
  const { paiements, ...reste } = commande;
  res.json(avecSolde({ ...reste, paiements }, paiements));
});

// GET /api/moi/paiements — historique de paiements toutes commandes
// confondues (mais toujours filtré via clienteId de la commande parente).
router.get("/paiements", async (req, res) => {
  const data = await prisma.paiement.findMany({
    where: { commande: { clienteId: req.user.clienteId }, annuleAt: null },
    orderBy: { date: "desc" },
    include: { commande: { select: { id: true, numero: true } } },
  });
  res.json({ data });
});

// GET /api/moi/notifications — réutilise la table Notification existante
// (voir lib/notifications.js), réconciliée pour TOUT l'atelier (comme côté
// ADMIN — la réconciliation ne fait que recalculer l'état réel, jamais une
// fuite : le filtre clienteId ci-dessous protège la LECTURE), puis filtrée
// aux commandes de CE client et aux types pertinents pour un client final.
// RETARD/IMPAYE restent des alertes de gestion interne à l'atelier, jamais
// affichées ici (une commande "en retard" ou "impayée" est un problème à
// gérer par l'ADMIN, pas quelque chose à notifier tel quel au client).
const TYPES_VISIBLES_CLIENT = ["PRET", "LIVRAISON_PROCHE"];
router.get("/notifications", async (req, res) => {
  const cliente = await prisma.cliente.findUnique({ where: { id: req.user.clienteId }, select: { atelierId: true } });
  if (!cliente) throw new HttpError(404, "Profil introuvable.");
  await reconcilierNotifications(prisma, cliente.atelierId);

  const data = await prisma.notification.findMany({
    where: { commande: { clienteId: req.user.clienteId }, type: { in: TYPES_VISIBLES_CLIENT } },
    orderBy: { createdAt: "desc" },
    // Mêmes champs que côté ADMIN (notifications.routes.js) — nécessaires à
    // notificationMessage() côté frontend (features/notifications/constants.js),
    // réutilisé tel quel ici pour ne pas dupliquer le texte des notifications.
    include: {
      commande: {
        select: {
          id: true,
          numero: true,
          statut: true,
          typeVetement: true,
          dateLivraisonPrevue: true,
          modele: { select: { id: true, nom: true } },
        },
      },
    },
  });
  res.json({ data });
});

// POST /api/moi/demandes — envoie une PROPOSITION de nouvelle commande à
// l'atelier. Ne crée jamais de Commande directement (voir
// routes/demandes.routes.js côté ADMIN, qui seul peut faire ce lien).
router.post("/demandes", async (req, res) => {
  const parsed = creerDemandeSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));

  const cliente = await prisma.cliente.findUnique({ where: { id: req.user.clienteId }, select: { atelierId: true } });
  if (!cliente) throw new HttpError(404, "Profil introuvable.");

  if (parsed.data.modeleId) {
    const modele = await prisma.modele.findFirst({
      where: { id: parsed.data.modeleId, atelierId: cliente.atelierId, archivedAt: null },
      select: { id: true },
    });
    if (!modele) throw new HttpError(404, "Modèle introuvable.", { modeleId: ["Modèle introuvable."] });
  }

  const demande = await prisma.demandeCommande.create({
    data: { atelierId: cliente.atelierId, clienteId: req.user.clienteId, ...parsed.data },
  });
  res.status(201).json(demande);
});

// GET /api/moi/demandes — historique de SES PROPRES demandes.
router.get("/demandes", async (req, res) => {
  const data = await prisma.demandeCommande.findMany({
    where: { clienteId: req.user.clienteId },
    orderBy: { createdAt: "desc" },
    include: { modele: { select: { id: true, nom: true } }, commande: { select: { id: true, numero: true } } },
  });
  res.json({ data });
});

// GET /api/moi/recus — historique des reçus, toutes commandes confondues
// (mais toujours filtré via clienteId de la commande parente, même pattern
// que GET /paiements ci-dessus).
router.get("/recus", async (req, res) => {
  const data = await prisma.recu.findMany({
    where: { commande: { clienteId: req.user.clienteId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: RECU_INCLUDE,
  });
  res.json({ data });
});

// GET /api/moi/recus/:id/pdf — flux PDF, jamais stocké (voir recus.routes.js
// côté ADMIN, même génération réutilisée telle quelle).
router.get("/recus/:id/pdf", async (req, res) => {
  const recu = await prisma.recu.findFirst({
    where: { id: req.params.id, commande: { clienteId: req.user.clienteId } },
    include: RECU_INCLUDE,
  });
  if (!recu) throw new HttpError(404, "Reçu introuvable.");

  const cliente = await prisma.cliente.findUnique({ where: { id: req.user.clienteId }, select: { atelierId: true } });
  const atelier = await prisma.atelier.findUnique({ where: { id: cliente.atelierId } });

  streamRecuPdf(res, { recu, atelier });
});

export default router;
