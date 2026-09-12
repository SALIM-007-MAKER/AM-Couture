import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { nextNumero } from "../lib/numero.js";
import { computeSolde, statutPaiement } from "../lib/money.js";
import { streamFicheCommandePdf } from "../lib/recuPdf.js";
import { requireValidIdParam } from "../lib/idParam.js";
import {
  createCommandeSchema,
  updateCommandeSchema,
  changeStatutSchema,
  listCommandesQuerySchema,
  STATUT_TRANSITIONS,
} from "../schemas/commande.schema.js";
import paiementsRouter from "./paiements.routes.js";
import livraisonsRouter from "./livraisons.routes.js";
import { recusCommandeRouter } from "./recus.routes.js";

const router = Router();

// Toutes les routes Commandes (et Paiements, montées ci-dessous) exigent une session valide.
router.use(requireAuth);

// Valide le format de :id / :commandeId sur toutes les routes avant toute requête Prisma.
router.param("id", requireValidIdParam);
router.param("commandeId", requireValidIdParam);

// Modules Paiements/Livraisons/Reçus — routes imbriquées sous /api/commandes/:commandeId/...
router.use("/:commandeId/paiements", paiementsRouter);
router.use("/:commandeId/livraisons", livraisonsRouter);
router.use("/:commandeId/recus", recusCommandeRouter);

const CLIENTE_SUMMARY_SELECT = { id: true, nom: true, prenom: true, telephone: true, archivedAt: true };
const MODELE_SUMMARY_SELECT = { id: true, nom: true, categorie: true, archivedAt: true };

// POST /api/commandes — création (+ paiement initial optionnel, atomique)
router.post("/", async (req, res) => {
  const parsed = createCommandeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const data = parsed.data;

  const cliente = await prisma.cliente.findUnique({
    where: { id: data.clienteId },
    select: { id: true, archivedAt: true },
  });
  if (!cliente) throw new HttpError(404, "Client introuvable.");
  if (cliente.archivedAt) {
    throw new HttpError(409, "Client archivé : restaurez-le avant de créer une nouvelle commande.");
  }

  if (data.modeleId) {
    const modele = await prisma.modele.findUnique({
      where: { id: data.modeleId },
      select: { id: true, archivedAt: true },
    });
    if (!modele) throw new HttpError(404, "Modèle introuvable.");
    if (modele.archivedAt) {
      throw new HttpError(409, "Modèle archivé : restaurez-le avant de l'associer à une nouvelle commande.");
    }
  }

  const { paiementInitial, ...commandeInput } = data;

  // Atomique : commande + numéro + paiement initial, tout ou rien.
  // maxWait/timeout relevés au-delà des 5s par défaut : sous forte
  // concurrence (créations simultanées), le temps d'attente d'une connexion
  // de pool + l'aller-retour réseau vers Neon peuvent légitimement dépasser
  // le défaut — voir le test de concurrence de numérotation.
  const result = await prisma.$transaction(
    async (tx) => {
      const numero = await nextNumero(tx, "CMD");
      const commande = await tx.commande.create({
        data: { ...commandeInput, numero },
      });

      let paiement = null;
      if (paiementInitial) {
        paiement = await tx.paiement.create({
          data: { ...paiementInitial, commandeId: commande.id },
        });
      }
      return { commande, paiement };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );

  const { totalPaye, solde } = computeSolde(result.commande.prixTotal, result.paiement ? [result.paiement] : []);

  res.status(201).json({
    ...result.commande,
    paiementInitial: result.paiement,
    totalPaye,
    solde,
    statutPaiement: statutPaiement(result.commande.prixTotal, totalPaye),
  });
});

// GET /api/commandes — liste, recherche, filtres, pagination (sans N+1 : un seul findMany avec select imbriqué)
router.get("/", async (req, res) => {
  const parsed = listCommandesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  }
  const { q, statut, priorite, clienteId, livraisonDu, livraisonAu, page, pageSize } = parsed.data;

  const where = {};
  if (statut) where.statut = statut;
  if (priorite) where.priorite = priorite;
  if (clienteId) where.clienteId = clienteId;
  if (livraisonDu || livraisonAu) {
    where.dateLivraisonPrevue = {
      ...(livraisonDu ? { gte: livraisonDu } : {}),
      ...(livraisonAu ? { lte: livraisonAu } : {}),
    };
  }
  if (q) {
    const digitsOnly = q.replace(/\D/g, "");
    where.OR = [
      { numero: { contains: q, mode: "insensitive" } },
      { cliente: { nom: { contains: q, mode: "insensitive" } } },
      { cliente: { prenom: { contains: q, mode: "insensitive" } } },
      ...(digitsOnly.length > 0 ? [{ cliente: { telephone: { contains: digitsOnly } } }] : []),
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.commande.findMany({
      where,
      orderBy: [{ dateCommande: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        numero: true,
        typeVetement: true,
        description: true,
        couleur: true,
        tissu: true,
        quantite: true,
        prixTotal: true,
        statut: true,
        priorite: true,
        dateCommande: true,
        dateLivraisonPrevue: true,
        observations: true,
        createdAt: true,
        updatedAt: true,
        cliente: { select: CLIENTE_SUMMARY_SELECT },
        modele: { select: MODELE_SUMMARY_SELECT },
        // annuleAt: null — seuls les paiements actifs entrent dans le calcul
        // de totalPaye/solde ci-dessous (cette liste ne les affiche pas
        // individuellement, contrairement au détail d'une commande).
        paiements: { where: { annuleAt: null }, select: { montant: true } },
      },
    }),
    prisma.commande.count({ where }),
  ]);

  const data = rows.map(({ paiements, ...commande }) => {
    const { totalPaye, solde } = computeSolde(commande.prixTotal, paiements);
    return { ...commande, totalPaye, solde, statutPaiement: statutPaiement(commande.prixTotal, totalPaye) };
  });

  res.json({
    data,
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

// GET /api/commandes/:id — détail : commande + cliente + modèle + paiements + livraisons + totaux calculés
router.get("/:id", async (req, res) => {
  const commande = await prisma.commande.findUnique({
    where: { id: req.params.id },
    include: {
      cliente: true,
      modele: true,
      // Historique COMPLET (paiements et livraisons annulés compris) — le
      // frontend affiche un badge "Annulé" plutôt que de les faire
      // disparaître. Seuls les totaux ci-dessous les excluent.
      paiements: { orderBy: { date: "desc" } },
      livraisons: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!commande) throw new HttpError(404, "Commande introuvable.");

  const { totalPaye, solde } = computeSolde(
    commande.prixTotal,
    commande.paiements.filter((p) => !p.annuleAt),
  );
  res.json({ ...commande, totalPaye, solde, statutPaiement: statutPaiement(commande.prixTotal, totalPaye) });
});

// GET /api/commandes/:id/fiche-pdf — fiche commande à jour (PDF), à partager
// avec la cliente (voir Phase 3, WhatsApp) — DISTINCT du Reçu de paiement
// (recus.routes.js) : ce document n'est jamais persisté et recalcule le
// solde/statut en direct à chaque appel, contrairement au Reçu qui est un
// instantané figé (voir commentaire dans recus.routes.js).
router.get("/:id/fiche-pdf", async (req, res) => {
  const commande = await prisma.commande.findUnique({
    where: { id: req.params.id },
    include: {
      cliente: { select: CLIENTE_SUMMARY_SELECT },
      modele: { select: MODELE_SUMMARY_SELECT },
      paiements: { where: { annuleAt: null }, select: { montant: true } },
    },
  });
  if (!commande) throw new HttpError(404, "Commande introuvable.");

  const { totalPaye, solde } = computeSolde(commande.prixTotal, commande.paiements);

  // Singleton facultatif, comme pour le Reçu (voir recus.routes.js) : dégrade
  // proprement (pas de logo/coordonnées) si Paramètres n'a jamais été rempli.
  const atelier = await prisma.atelier.findFirst();

  streamFicheCommandePdf(res, { commande, atelier, totalPaye, solde });
});

// PATCH /api/commandes/:id — modification partielle des champs non financiers/non système
router.patch("/:id", async (req, res) => {
  const parsed = updateCommandeSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const data = parsed.data;
  const { id } = req.params;

  const current = await prisma.commande.findUnique({
    where: { id },
    select: { dateCommande: true },
  });
  if (!current) throw new HttpError(404, "Commande introuvable.");

  if (data.dateLivraisonPrevue && data.dateLivraisonPrevue < current.dateCommande) {
    throw new HttpError(400, "Champs invalides.", {
      dateLivraisonPrevue: ["La date de livraison prévue ne peut pas être antérieure à la date de commande."],
    });
  }

  if (data.modeleId) {
    const modele = await prisma.modele.findUnique({
      where: { id: data.modeleId },
      select: { id: true, archivedAt: true },
    });
    if (!modele) throw new HttpError(404, "Modèle introuvable.");
    if (modele.archivedAt) {
      throw new HttpError(409, "Modèle archivé : restaurez-le avant de l'associer à cette commande.");
    }
  }

  const commande = await prisma.commande.update({ where: { id }, data });
  res.json(commande);
});

// POST /api/commandes/:id/statut — changement de statut via la machine à états dédiée
router.post("/:id/statut", async (req, res) => {
  const parsed = changeStatutSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { statut: nextStatut } = parsed.data;
  const { id } = req.params;

  // LIVREE est un cas à part : cette route ne fait QUE changer le champ
  // statut, alors que passer à LIVREE doit TOUJOURS créer l'enregistrement
  // Livraison associé (montantRestant snapshot, paiement final éventuel —
  // voir livraisons.routes.js). Accepter LIVREE ici permettrait une commande
  // marquée livrée sans aucune trace de livraison (incohérence réelle
  // trouvée et documentée précédemment). TERMINEE -> LIVREE reste une
  // transition légitime dans STATUT_TRANSITIONS (livraisons.routes.js s'y
  // réfère pour vérifier qu'une livraison est autorisée) : seule CETTE
  // route générique la refuse, redirigeant vers la bonne route dédiée.
  if (nextStatut === "LIVREE") {
    throw new HttpError(
      409,
      "Le passage au statut LIVREE doit se faire via POST /commandes/:id/livraisons (qui crée l'enregistrement de livraison associé).",
    );
  }

  const current = await prisma.commande.findUnique({ where: { id }, select: { statut: true } });
  if (!current) throw new HttpError(404, "Commande introuvable.");

  const allowed = STATUT_TRANSITIONS[current.statut] ?? [];
  if (!allowed.includes(nextStatut)) {
    throw new HttpError(409, `Transition de statut invalide : ${current.statut} → ${nextStatut}.`, {
      statutActuel: current.statut,
      transitionsAutorisees: allowed,
    });
  }

  // Compare-and-swap atomique : si le statut a changé entre la lecture et
  // l'écriture (course concurrente), count=0 -> conflit propre plutôt qu'une
  // transition appliquée sur un état qui n'est plus le bon.
  const result = await prisma.commande.updateMany({
    where: { id, statut: current.statut },
    data: { statut: nextStatut },
  });
  if (result.count === 0) {
    throw new HttpError(409, "Le statut de la commande a changé entre-temps, réessayez.");
  }

  const commande = await prisma.commande.findUnique({ where: { id } });
  res.json(commande);
});

export default router;
