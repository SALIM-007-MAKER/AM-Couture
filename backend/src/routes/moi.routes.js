import { Router } from "express";
import { z } from "zod";
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
import { Prisma } from "../generated/prisma/client.ts";
import { nextNumero } from "../lib/numero.js";

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

// GET /api/moi — profil (la Cliente liée à ce compte), avec l'identité
// visuelle de l'atelier (nom/logo) pour l'en-tête de l'espace client — un
// USER n'a accès à AUCUNE route /api/parametres (réservée ADMIN, voir
// requireAtelier), c'est donc ici son seul moyen de la récupérer. Rien de
// sensible n'est exposé au-delà de ce que côté ADMIN affiche déjà
// publiquement dans sa propre sidebar (nom, logo).
router.get("/", async (req, res) => {
  const cliente = await prisma.cliente.findUnique({
    where: { id: req.user.clienteId },
    include: { atelier: { select: { nom: true, logoUrl: true } } },
  });
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

// GET /api/moi/notifications — fusionne DEUX sources distinctes (§
// notifications atelier <-> client) :
//  - "etat" : la table Notification existante (voir lib/notifications.js),
//    réconciliée pour TOUT l'atelier (la réconciliation ne fait que
//    recalculer l'état réel, jamais une fuite : le filtre clienteId
//    ci-dessous protège la LECTURE), filtrée aux types pertinents pour un
//    client final — RETARD/IMPAYE restent des alertes de gestion interne à
//    l'atelier, jamais affichées ici. `message` vaut null : le frontend le
//    calcule lui-même à partir de `commande` (voir notificationMessage(),
//    features/notifications/constants.js), pour ne jamais dupliquer ce texte.
//  - "evenement" : NotificationClient (voir schema.prisma et
//    lib/notificationsClient.js) — un fil d'activité (commande créée,
//    paiement encaissé, demande acceptée/refusée...) posé à chaque écriture
//    concernée. `message` est déjà figé en base, jamais recalculé.
// `canMarkLu` distingue les deux pour le frontend : jamais pour "etat"
// (Notification.lu est PARTAGÉ avec l'ADMIN — le client ne doit jamais
// pouvoir affecter SON tableau de bord en marquant lu de son côté).
const TYPES_VISIBLES_CLIENT = ["PRET", "LIVRAISON_PROCHE"];
router.get("/notifications", async (req, res) => {
  const cliente = await prisma.cliente.findUnique({ where: { id: req.user.clienteId }, select: { atelierId: true } });
  if (!cliente) throw new HttpError(404, "Profil introuvable.");
  await reconcilierNotifications(prisma, cliente.atelierId);

  const [etats, evenements] = await Promise.all([
    prisma.notification.findMany({
      where: { commande: { clienteId: req.user.clienteId }, type: { in: TYPES_VISIBLES_CLIENT } },
      orderBy: { createdAt: "desc" },
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
    }),
    prisma.notificationClient.findMany({
      where: { clienteId: req.user.clienteId },
      orderBy: { createdAt: "desc" },
      include: { commande: { select: { id: true, numero: true } } },
    }),
  ]);

  const data = [
    ...etats.map((n) => ({
      id: n.id,
      type: n.type,
      createdAt: n.createdAt,
      lu: n.lu,
      source: "etat",
      message: null,
      commande: n.commande,
      canMarkLu: false,
    })),
    ...evenements.map((n) => ({
      id: n.id,
      type: n.type,
      createdAt: n.createdAt,
      lu: n.lu,
      source: "evenement",
      message: n.message,
      commande: n.commande,
      canMarkLu: true,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ data });
});

// GET /api/moi/notifications/non-lues — pastille de l'en-tête (voir
// ClientLayout.jsx), somme des deux sources ci-dessus. Déclarée avant
// "/notifications/:id" pour ne pas être capturée comme un identifiant
// (même précaution que /derniere sur Mesures).
router.get("/notifications/non-lues", async (req, res) => {
  const cliente = await prisma.cliente.findUnique({ where: { id: req.user.clienteId }, select: { atelierId: true } });
  if (!cliente) throw new HttpError(404, "Profil introuvable.");
  await reconcilierNotifications(prisma, cliente.atelierId);

  const [etatsNonLus, evenementsNonLus] = await Promise.all([
    prisma.notification.count({
      where: { commande: { clienteId: req.user.clienteId }, type: { in: TYPES_VISIBLES_CLIENT }, lu: false },
    }),
    prisma.notificationClient.count({ where: { clienteId: req.user.clienteId, lu: false } }),
  ]);
  res.json({ count: etatsNonLus + evenementsNonLus });
});

const marquerLuSchema = z.object({ lu: z.boolean() }).strict();

// PATCH /api/moi/notifications/:id — UNIQUEMENT les événements
// (NotificationClient) : jamais les "etat" (Notification.lu partagé avec
// l'ADMIN, voir commentaire au-dessus de GET /notifications) — un id
// d'"etat" fourni ici ne matche simplement aucune ligne NotificationClient
// et renvoie 404, sans distinction supplémentaire nécessaire.
router.patch("/notifications/:id", async (req, res) => {
  const parsed = marquerLuSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));

  const result = await prisma.notificationClient.updateMany({
    where: { id: req.params.id, clienteId: req.user.clienteId },
    data: { lu: parsed.data.lu },
  });
  if (result.count === 0) throw new HttpError(404, "Notification introuvable.");
  res.json({ ok: true });
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

// POST /api/moi/commandes/:id/recus — le client génère LUI-MÊME un reçu
// récapitulatif de sa propre commande (§ notifications/self-service atelier
// <-> client), sans devoir le demander à l'ADMIN. Même logique EXACTE que
// POST /commandes/:commandeId/recus côté ADMIN (recus.routes.js) —
// montantPaye = total réellement encaissé à cet instant, calculé côté base,
// jamais un chiffre saisi — juste re-scopée par clienteId au lieu
// d'atelierId. Aucune notification pour l'ADMIN ici : le client consulte
// ses propres données déjà connues de l'atelier, ce n'est pas un événement
// qui le concerne (contrairement à un reçu émis PAR l'ADMIN, voir
// recus.routes.js, qui lui notifie le client).
router.post("/commandes/:id/recus", async (req, res) => {
  const commandeId = req.params.id;

  const recu = await prisma.$transaction(
    async (tx) => {
      const commande = await tx.commande.findFirst({
        where: { id: commandeId, clienteId: req.user.clienteId },
        select: { id: true },
      });
      if (!commande) throw new HttpError(404, "Commande introuvable.");

      const agrege = await tx.paiement.aggregate({
        where: { commandeId, annuleAt: null },
        _sum: { montant: true },
      });
      const montantPaye = agrege._sum.montant ?? new Prisma.Decimal(0);

      if (montantPaye.lessThanOrEqualTo(0)) {
        throw new HttpError(409, "Aucun paiement encaissé sur cette commande : impossible d'émettre un reçu.");
      }

      const numero = await nextNumero(tx, "REC");
      return tx.recu.create({
        data: { commandeId, montantPaye: montantPaye.toString(), numero },
        include: RECU_INCLUDE,
      });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );

  res.status(201).json(recu);
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
