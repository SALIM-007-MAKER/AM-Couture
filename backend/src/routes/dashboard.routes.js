import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { resolvePeriod, dateRangeWhere } from "../lib/period.js";
import { periodQuerySchema, recentQuerySchema } from "../schemas/dashboard.schema.js";

// Module PUREMENT consultatif : aucune route de ce fichier n'écrit en base
// (que des `count`/`aggregate`/`findMany` en lecture seule).
const router = Router();
router.use(requireAuth);

// "en cours" / "terminées" / "livrées" sont des compartiments MUTUELLEMENT
// EXCLUSIFS (chaque commande n'appartient qu'à un seul), contrairement à
// "en retard" qui, lui, doit inclure TERMINEE (une commande terminée mais
// pas encore livrée, avec une date de livraison prévue dépassée, est
// réellement en retard de livraison) — d'où deux ensembles distincts.
const COMMANDES_EN_COURS_WHERE = { statut: { notIn: ["TERMINEE", "LIVREE", "ANNULEE"] } };
const COMMANDES_NON_LIVREES_OU_ANNULEES = { notIn: ["LIVREE", "ANNULEE"] };

const D0 = new Prisma.Decimal(0);
const dec = (v) => (v == null ? D0 : new Prisma.Decimal(v));

// GET /api/dashboard/summary?period=|from=&to=
//
// Distingue explicitement DEUX familles d'indicateurs (voir rapport du
// module) :
// - "état actuel" (clientesActives, commandes.enCours/terminees/livrees/
//   enRetard) : un instantané de MAINTENANT, indépendant de la période
//   demandée — une commande en retard l'est aujourd'hui, pas "pendant telle
//   période passée" ;
// - "activité de la période" (commandes créées, valeur, encaissements,
//   dépenses) : filtrés par la période sur le champ métier pertinent de
//   chaque table (Commande.dateCommande, Paiement.date, Depense.date).
router.get("/summary", async (req, res) => {
  const parsed = periodQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { from, to } = resolvePeriod(parsed.data);
  const periodeCommandeWhere = dateRangeWhere(from, to);
  const now = new Date();

  const [
    clientesActives,
    commandesPeriode,
    commandesEnCours,
    commandesTerminees,
    commandesLivrees,
    commandesEnRetard,
    paiementsPeriode,
    depensesPeriode,
  ] = await Promise.all([
    prisma.cliente.count({ where: { archivedAt: null } }),
    prisma.commande.aggregate({
      where: periodeCommandeWhere ? { dateCommande: periodeCommandeWhere } : {},
      _count: true,
      _sum: { prixTotal: true },
    }),
    prisma.commande.count({ where: COMMANDES_EN_COURS_WHERE }),
    prisma.commande.count({ where: { statut: "TERMINEE" } }),
    prisma.commande.count({ where: { statut: "LIVREE" } }),
    prisma.commande.count({
      where: { statut: COMMANDES_NON_LIVREES_OU_ANNULEES, dateLivraisonPrevue: { lt: now } },
    }),
    // annuleAt: null — un paiement/une dépense annulé ne compte dans aucune
    // statistique (voir routes paiements/dépenses).
    prisma.paiement.aggregate({
      where: { annuleAt: null, ...(periodeCommandeWhere ? { date: periodeCommandeWhere } : {}) },
      _count: true,
      _sum: { montant: true },
    }),
    prisma.depense.aggregate({
      where: { annuleAt: null, ...(periodeCommandeWhere ? { date: periodeCommandeWhere } : {}) },
      _count: true,
      _sum: { montant: true },
    }),
  ]);

  const valeurCommandes = dec(commandesPeriode._sum.prixTotal);
  const totalEncaisse = dec(paiementsPeriode._sum.montant);
  const totalDepenses = dec(depensesPeriode._sum.montant);

  res.json({
    periode: from || to ? { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null } : null,
    clientes: {
      actives: clientesActives,
    },
    commandes: {
      // "activité de la période"
      nombre: commandesPeriode._count,
      valeurTotale: valeurCommandes.toString(),
      // "état actuel" — toujours globaux, non filtrés par la période demandée
      enCours: commandesEnCours,
      terminees: commandesTerminees,
      livrees: commandesLivrees,
      enRetard: commandesEnRetard,
    },
    finances: {
      // Chiffre d'affaires (valeur des commandes) ≠ argent réellement
      // encaissé — jamais confondus (voir commandes.valeurTotale ci-dessus).
      totalEncaisse: totalEncaisse.toString(),
      nombrePaiements: paiementsPeriode._count,
      totalDepenses: totalDepenses.toString(),
      nombreDepenses: depensesPeriode._count,
      // "Résultat de trésorerie" (encaissements réels − dépenses réelles) —
      // PAS un bénéfice comptable : le schéma ne contient aucun coût de
      // revient/marge par commande, donc aucun calcul de profit réel n'est
      // possible avec les données actuelles (voir rapport, point signalé).
      resultatTresorerie: totalEncaisse.minus(totalDepenses).toString(),
    },
  });
});

// GET /api/dashboard/recent?limit=10 — dernières commandes/paiements/
// livraisons/dépenses, triées par createdAt desc (date d'entrée en
// système), limite plafonnée à 50 côté serveur quel que soit ce qui est
// demandé (schema Zod, voir dashboard.schema.js).
router.get("/recent", async (req, res) => {
  const parsed = recentQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { limit } = parsed.data;

  const [commandes, paiements, livraisons, depenses] = await Promise.all([
    prisma.commande.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        numero: true,
        statut: true,
        prixTotal: true,
        createdAt: true,
        cliente: { select: { id: true, nom: true, prenom: true } },
      },
    }),
    // annuleAt: null sur les trois — un événement annulé n'est plus une
    // "activité récente" pertinente à mettre en avant (il reste consultable
    // dans son historique dédié, avec son motif).
    prisma.paiement.findMany({
      where: { annuleAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        montant: true,
        mode: true,
        createdAt: true,
        commande: { select: { id: true, numero: true } },
      },
    }),
    prisma.livraison.findMany({
      where: { annuleAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        dateLivraison: true,
        createdAt: true,
        commande: { select: { id: true, numero: true } },
      },
    }),
    prisma.depense.findMany({
      where: { annuleAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: { id: true, categorie: true, montant: true, date: true, createdAt: true },
    }),
  ]);

  res.json({ limit, commandes, paiements, livraisons, depenses });
});

export default router;
