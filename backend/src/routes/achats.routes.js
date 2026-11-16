import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { idempotence } from "../lib/idempotence.js";
import { Prisma } from "../generated/prisma/client.ts";
import { HttpError } from "../middlewares/error.middleware.js";
import {
  requireAuth,
  requireMembreAtelier,
  requireAbonnementActif,
  requirePermission,
  requireUnePermission,
} from "../middlewares/auth.middleware.js";
import { masquerFinancesSiNonAutorise } from "../lib/masquageFinances.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { nextNumero } from "../lib/numero.js";
import { annulerSchema } from "../schemas/annulation.schema.js";
import {
  createAchatSchema,
  updateAchatSchema,
  receptionSchema,
  paiementAchatSchema,
  listAchatsQuerySchema,
  TOTAL_ACHAT_MAX,
} from "../schemas/achat.schema.js";

const router = Router();

// Achats aux fournisseurs. Droits (employé) : « achats.lire » pour consulter ; « achats.recevoir » (ou « achats.ecrire »)
// pour réceptionner ; « achats.ecrire » (sensible : il donne accès aux prix) pour créer, modifier, annuler ; payer exige
// en plus « depenses.ecrire », car le paiement crée une dépense. Sans « finances.voir », les prix et montants sont
// retirés de toutes les réponses (un magasinier réceptionne sans voir les prix).
router.use(requireAuth, requireMembreAtelier, requireAbonnementActif, masquerFinancesSiNonAutorise);
router.param("id", requireValidIdParam);

const CATEGORIE_DEPENSE = "Achats fournisseurs";
const D0 = new Prisma.Decimal(0);

const INCLUDE_DETAIL = {
  fournisseur: { select: { id: true, nom: true, archivedAt: true } },
  depense: { select: { id: true, date: true, annuleAt: true } },
  lignes: {
    orderBy: { id: "asc" },
    select: {
      id: true,
      quantite: true,
      prixUnitaire: true,
      quantiteRecue: true,
      article: { select: { id: true, nom: true, unite: true } },
    },
  },
};

/** Total, états de réception et de paiement — TOUS dérivés des lignes et de la dépense liée, jamais stockés. */
function presenter(achat) {
  const lignes = achat.lignes.map((l) => ({
    ...l,
    quantiteRestante: new Prisma.Decimal(l.quantite).minus(l.quantiteRecue),
  }));
  const montantTotal = lignes.reduce((somme, l) => somme.plus(new Prisma.Decimal(l.quantite).times(l.prixUnitaire)), D0);
  const toutRecu = lignes.every((l) => l.quantiteRestante.lte(0));
  const rienRecu = lignes.every((l) => new Prisma.Decimal(l.quantiteRecue).lte(0));
  const paye = Boolean(achat.depense) && !achat.depense.annuleAt;
  const { depenseId, creeParId, ...reste } = achat;
  return {
    ...reste,
    lignes,
    montantTotal,
    statutReception: rienRecu ? "AUCUNE" : toutRecu ? "COMPLETE" : "PARTIELLE",
    statutPaiement: paye ? "PAYE" : "NON_PAYE",
    // Clés financières : retirées pour un employé sans « finances.voir ».
    depense: achat.depense ?? null,
    depenseId: depenseId ?? null,
  };
}

async function verrouillerAchat(tx, id, atelierId) {
  const lignes = await tx.$queryRaw`SELECT id FROM "Achat" WHERE id = ${id} AND "atelierId" = ${atelierId} FOR UPDATE`;
  if (lignes.length === 0) throw new HttpError(404, "Achat introuvable.");
}

const chargerAchat = (client, id, atelierId) => client.achat.findFirst({ where: { id, atelierId }, include: INCLUDE_DETAIL });

// POST /api/achats — création du bon de commande
router.post("/", requirePermission("achats.ecrire"), idempotence, async (req, res) => {
  const parsed = createAchatSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { fournisseurId, dateAttendue, notes, lignes } = parsed.data;
  const { atelierId } = req.user;

  const total = lignes.reduce((s, l) => s.plus(new Prisma.Decimal(l.quantite).times(l.prixUnitaire)), D0);
  if (total.gt(TOTAL_ACHAT_MAX)) {
    throw new HttpError(400, "Champs invalides.", { lignes: [`Le total de l'achat ne peut pas dépasser ${TOTAL_ACHAT_MAX}.`] });
  }

  const fournisseur = await prisma.fournisseur.findFirst({ where: { id: fournisseurId, atelierId }, select: { archivedAt: true } });
  if (!fournisseur) throw new HttpError(404, "Fournisseur introuvable.");
  if (fournisseur.archivedAt) throw new HttpError(409, "Fournisseur archivé : restaurez-le avant de lui passer commande.");

  const articles = await prisma.articleStock.findMany({
    where: { atelierId, id: { in: lignes.map((l) => l.articleId) } },
    select: { id: true, archivedAt: true, nom: true },
  });
  if (articles.length !== lignes.length) throw new HttpError(404, "Article introuvable.");
  const archive = articles.find((a) => a.archivedAt);
  if (archive) throw new HttpError(409, `Article archivé : restaurez « ${archive.nom} » avant de le commander.`);

  const achat = await prisma.$transaction(
    async (tx) => {
      const numero = await nextNumero(tx, "ACH");
      return tx.achat.create({
        data: {
          atelierId,
          numero,
          fournisseurId,
          dateAttendue,
          notes,
          creeParId: req.user.id,
          lignes: { create: lignes },
        },
        include: INCLUDE_DETAIL,
      });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  res.status(201).json(presenter(achat));
});

// GET /api/achats — liste filtrable
router.get("/", requirePermission("achats.lire"), async (req, res) => {
  const parsed = listAchatsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  const { q, statut, reception, paiement, fournisseurId, page, pageSize } = parsed.data;
  const { atelierId } = req.user;

  const where = { atelierId };
  if (statut) where.statut = statut;
  if (fournisseurId) where.fournisseurId = fournisseurId;
  if (q) where.OR = [{ numero: { contains: q, mode: "insensitive" } }, { fournisseur: { nom: { contains: q, mode: "insensitive" } } }];
  if (paiement === "paye") where.depense = { is: { annuleAt: null } };
  if (paiement === "nonpaye") where.AND = [{ OR: [{ depenseId: null }, { depense: { is: { annuleAt: { not: null } } } }] }];
  if (reception) {
    // Comparaison de deux colonnes d'une même ligne : hors de portée du filtre Prisma, donc SQL (borné à l'atelier).
    const attendus = await prisma.$queryRaw`
      SELECT DISTINCT a.id FROM "Achat" a JOIN "LigneAchat" l ON l."achatId" = a.id
      WHERE a."atelierId" = ${atelierId} AND l."quantiteRecue" < l."quantite"`;
    const ids = attendus.map((r) => r.id);
    // « attendu » = encore des quantités à recevoir ET commande non annulée ; « complete » = tout reçu.
    if (reception === "attendu") {
      where.id = { in: ids };
      where.statut = "COMMANDE";
    } else {
      where.id = { notIn: ids };
      where.statut = "COMMANDE";
    }
  }

  const [rows, total] = await Promise.all([
    prisma.achat.findMany({
      where,
      orderBy: [{ dateCommande: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: INCLUDE_DETAIL,
    }),
    prisma.achat.count({ where }),
  ]);
  res.json({ data: rows.map(presenter), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

// GET /api/achats/options — fournisseurs et articles actifs proposés dans le formulaire de création. Évite d'exiger
// « stock.lire » et « fournisseurs.lire » à qui peut créer un achat (et ne révèle aucun prix). Défini AVANT /:id.
router.get("/options", requirePermission("achats.ecrire"), async (req, res) => {
  const { atelierId } = req.user;
  const [fournisseurs, articles] = await Promise.all([
    prisma.fournisseur.findMany({ where: { atelierId, archivedAt: null }, orderBy: { nom: "asc" }, select: { id: true, nom: true } }),
    prisma.articleStock.findMany({ where: { atelierId, archivedAt: null }, orderBy: { nom: "asc" }, select: { id: true, nom: true, unite: true } }),
  ]);
  res.json({ fournisseurs, articles });
});

// GET /api/achats/:id
router.get("/:id", requirePermission("achats.lire"), async (req, res) => {
  const achat = await chargerAchat(prisma, req.params.id, req.user.atelierId);
  if (!achat) throw new HttpError(404, "Achat introuvable.");
  res.json(presenter(achat));
});

// PATCH /api/achats/:id — date attendue et notes seulement, sur un achat non annulé
router.patch("/:id", requirePermission("achats.ecrire"), async (req, res) => {
  const parsed = updateAchatSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { id } = req.params;
  const { atelierId } = req.user;
  const r = await prisma.achat.updateMany({ where: { id, atelierId, statut: "COMMANDE" }, data: parsed.data });
  if (r.count === 0) {
    const existant = await prisma.achat.findFirst({ where: { id, atelierId }, select: { id: true } });
    if (!existant) throw new HttpError(404, "Achat introuvable.");
    throw new HttpError(409, "Cet achat est annulé : il ne peut plus être modifié.");
  }
  res.json(presenter(await chargerAchat(prisma, id, atelierId)));
});

// POST /api/achats/:id/receptions — réception (totale ou partielle) : une ENTREE de stock par ligne, dans la même
// transaction que la mise à jour des quantités reçues. Verrou sur l'achat : deux réceptions simultanées ne peuvent pas
// dépasser la quantité commandée (le CHECK en base le garantit aussi).
router.post("/:id/receptions", requireUnePermission("achats.recevoir", "achats.ecrire"), idempotence, async (req, res) => {
  const parsed = receptionSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { id } = req.params;
  const { atelierId } = req.user;

  await prisma.$transaction(
    async (tx) => {
      await verrouillerAchat(tx, id, atelierId);
      const achat = await tx.achat.findFirst({ where: { id, atelierId }, include: { lignes: true } });
      if (achat.statut === "ANNULE") throw new HttpError(409, "Cet achat est annulé : aucune réception possible.");
      const parId = new Map(achat.lignes.map((l) => [l.id, l]));

      for (const demande of parsed.data.lignes) {
        const ligne = parId.get(demande.ligneId);
        if (!ligne) throw new HttpError(404, "Ligne d'achat introuvable.");
        const restante = new Prisma.Decimal(ligne.quantite).minus(ligne.quantiteRecue);
        if (new Prisma.Decimal(demande.quantite).gt(restante)) {
          throw new HttpError(409, "La quantité reçue dépasse la quantité restante à recevoir.", {
            ligneId: ligne.id,
            quantiteRestante: restante.toString(),
            quantiteDemandee: demande.quantite,
          });
        }
        const article = await tx.articleStock.findFirst({ where: { id: ligne.articleId, atelierId }, select: { archivedAt: true, nom: true } });
        if (!article) throw new HttpError(404, "Article introuvable.");
        if (article.archivedAt) throw new HttpError(409, `Article archivé : restaurez « ${article.nom} » avant de réceptionner.`);

        await tx.ligneAchat.update({ where: { id: ligne.id }, data: { quantiteRecue: { increment: demande.quantite } } });
        await tx.mouvementStock.create({
          data: { articleId: ligne.articleId, type: "ENTREE", quantite: demande.quantite, motif: `Réception achat ${achat.numero}`, ligneAchatId: ligne.id },
        });
      }
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  res.status(201).json(presenter(await chargerAchat(prisma, id, atelierId)));
});

// POST /api/achats/:id/paiement — enregistre le paiement du total : crée la dépense « Achats fournisseurs » liée.
router.post("/:id/paiement", requirePermission("achats.ecrire"), requirePermission("depenses.ecrire"), idempotence, async (req, res) => {
  const parsed = paiementAchatSchema.safeParse(req.body ?? {});
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { id } = req.params;
  const { atelierId } = req.user;

  await prisma.$transaction(
    async (tx) => {
      await verrouillerAchat(tx, id, atelierId);
      const achat = await tx.achat.findFirst({ where: { id, atelierId }, include: { ...INCLUDE_DETAIL, fournisseur: { select: { id: true, nom: true } } } });
      if (achat.statut === "ANNULE") throw new HttpError(409, "Cet achat est annulé : il ne peut pas être payé.");
      if (achat.depense && !achat.depense.annuleAt) throw new HttpError(409, "Cet achat est déjà payé.");
      const { montantTotal } = presenter(achat);
      const depense = await tx.depense.create({
        data: {
          atelierId,
          categorie: CATEGORIE_DEPENSE,
          montant: montantTotal,
          date: parsed.data.date,
          description: `Achat ${achat.numero} — ${achat.fournisseur.nom}`,
        },
      });
      await tx.achat.update({ where: { id }, data: { depenseId: depense.id } });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  res.status(201).json(presenter(await chargerAchat(prisma, id, atelierId)));
});

// POST /api/achats/:id/annuler — seulement si rien n'est reçu ni payé (sinon : annuler d'abord le paiement dans les
// Dépenses ; une marchandise reçue ne s'annule pas, elle se corrige par un mouvement de stock).
router.post("/:id/annuler", requirePermission("achats.ecrire"), async (req, res) => {
  const parsed = annulerSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  const { id } = req.params;
  const { atelierId } = req.user;

  await prisma.$transaction(
    async (tx) => {
      await verrouillerAchat(tx, id, atelierId);
      const achat = await chargerAchat(tx, id, atelierId);
      if (achat.statut === "ANNULE") throw new HttpError(409, "Cet achat est déjà annulé.");
      if (achat.lignes.some((l) => new Prisma.Decimal(l.quantiteRecue).gt(0))) {
        throw new HttpError(409, "Une partie de la marchandise a déjà été reçue : l'achat ne peut plus être annulé.");
      }
      if (achat.depense && !achat.depense.annuleAt) {
        throw new HttpError(409, "Cet achat est payé : annulez d'abord la dépense correspondante.", { depenseId: achat.depense.id });
      }
      await tx.achat.update({ where: { id }, data: { statut: "ANNULE", annuleAt: new Date(), annuleMotif: parsed.data.motif } });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  res.json(presenter(await chargerAchat(prisma, id, atelierId)));
});

export default router;
