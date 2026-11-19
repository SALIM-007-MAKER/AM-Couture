import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireMembreAtelier, requireAbonnementActif, droitsParModule, requirePermission } from "../middlewares/auth.middleware.js";
import { verrouillerCle } from "../lib/verrous.js";
import { masquerFinancesSiNonAutorise } from "../lib/masquageFinances.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { refuserDemandeSchema, accepterDemandeSchema, listDemandesQuerySchema } from "../schemas/demandeCommande.schema.js";
import { creerNotificationClient } from "../lib/notificationsClient.js";
import { verrouillerQuota, verifierQuota } from "../lib/quotasServeur.js";

// Demandes de commande envoyées par des clients USER (§ plan rôle client,
// voir routes/moi.routes.js POST /api/moi/demandes) — gestion côté ADMIN.
// Un USER PROPOSE, l'ADMIN DÉCIDE : jamais de création de Commande depuis
// ce module, seulement un lien vers une Commande créée par le flux normal
// (voir accepterDemandeSchema, demandeCommande.schema.js).
const router = Router();
// Membres de l'atelier (PDG ou employé) ; l'employé doit en plus avoir la permission « demandes.lire » (GET) ou
// « demandes.ecrire » (autres méthodes), contrôlée avant toute route.
router.use(requireAuth, requireMembreAtelier, requireAbonnementActif, droitsParModule("demandes"), masquerFinancesSiNonAutorise);
router.param("id", requireValidIdParam);

const DEMANDE_SELECT = {
  id: true,
  statut: true,
  description: true,
  motifRefus: true,
  commandeId: true,
  createdAt: true,
  origine: true,
  // Visiteur de la vitrine pas encore rattaché à une fiche cliente (effacés au rattachement).
  contactPrenom: true,
  contactNom: true,
  contactTelephone: true,
  cliente: { select: { id: true, nom: true, prenom: true, telephone: true } },
  modele: { select: { id: true, nom: true, categorie: true } },
  commande: { select: { id: true, numero: true } },
};

// GET /api/demandes — liste, filtre par statut, paginée.
router.get("/", async (req, res) => {
  const parsed = listDemandesQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { statut, page, pageSize } = parsed.data;

  const where = { atelierId: req.user.atelierId, ...(statut ? { statut } : {}) };
  const [data, total] = await Promise.all([
    prisma.demandeCommande.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: DEMANDE_SELECT,
    }),
    prisma.demandeCommande.count({ where }),
  ]);

  res.json({ data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

// GET /api/demandes/:id — détail.
router.get("/:id", async (req, res) => {
  const demande = await prisma.demandeCommande.findFirst({
    where: { id: req.params.id, atelierId: req.user.atelierId },
    select: DEMANDE_SELECT,
  });
  if (!demande) throw new HttpError(404, "Demande introuvable.");
  res.json(demande);
});

// POST /api/demandes/:id/accepter { commandeId } — lie une Commande DÉJÀ
// CRÉÉE (via le flux normal POST /api/commandes) à cette demande. Vérifie
// que la commande appartient au MÊME atelier ET à la MÊME cliente que la
// demande — sans ce garde-fou, l'ADMIN pourrait par erreur (ou abus)
// rattacher n'importe quelle commande à une demande d'un autre client.
router.post("/:id/accepter", async (req, res) => {
  const parsed = accepterDemandeSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));

  const demande = await prisma.demandeCommande.findFirst({
    where: { id: req.params.id, atelierId: req.user.atelierId },
  });
  if (!demande) throw new HttpError(404, "Demande introuvable.");
  if (demande.statut !== "EN_ATTENTE") {
    throw new HttpError(409, "Cette demande a déjà été traitée.");
  }
  if (!demande.clienteId) {
    throw new HttpError(409, "Créez d'abord la fiche cliente de cette personne (demande venue de la vitrine).", { clienteRequise: true });
  }

  const commande = await prisma.commande.findFirst({
    where: { id: parsed.data.commandeId, atelierId: req.user.atelierId, clienteId: demande.clienteId },
    select: { id: true, numero: true },
  });
  if (!commande) {
    throw new HttpError(404, "Commande introuvable pour ce client.", { commandeId: ["Commande introuvable pour ce client."] });
  }

  const dejaLiee = await prisma.demandeCommande.findUnique({ where: { commandeId: commande.id } });
  if (dejaLiee) {
    throw new HttpError(409, "Cette commande est déjà liée à une autre demande.");
  }

  const misAJour = await prisma.$transaction(async (tx) => {
    const demandeMiseAJour = await tx.demandeCommande.update({
      where: { id: demande.id },
      data: { statut: "ACCEPTEE", commandeId: commande.id },
      select: DEMANDE_SELECT,
    });
    await creerNotificationClient(tx, {
      clienteId: demande.clienteId,
      commandeId: commande.id,
      type: "DEMANDE_ACCEPTEE",
      params: { numero: commande.numero },
    });
    return demandeMiseAJour;
  });
  res.json(misAJour);
});

// POST /api/demandes/:id/cliente — rattache une demande de la vitrine à une fiche cliente : crée la fiche à partir des
// coordonnées du visiteur, ou réutilise la fiche existante portant le même téléphone. Les coordonnées de la demande
// sont alors EFFACÉES (elles vivent sur la fiche). Répétable : une demande déjà rattachée est renvoyée telle quelle.
router.post("/:id/cliente", requirePermission("clientes.ecrire"), async (req, res) => {
  const { id } = req.params;
  const { atelierId } = req.user;
  const resultat = await prisma.$transaction(
    async (tx) => {
      const demande = await tx.demandeCommande.findFirst({ where: { id, atelierId } });
      if (!demande) throw new HttpError(404, "Demande introuvable.");
      if (demande.clienteId) return { demandeId: id, deja: true };
      if (demande.statut !== "EN_ATTENTE") throw new HttpError(409, "Cette demande a déjà été traitée.");

      // Quota d'abord (ordre unique des verrous), puis même verrou que la création d'une cliente (clientes.routes.js) : pas de
      // doublon de téléphone en concurrence.
      await verrouillerQuota(tx, atelierId, "clientes");
      await verrouillerCle(tx, `cliente:${atelierId}:${demande.contactTelephone}`);
      let cliente = await tx.cliente.findFirst({ where: { atelierId, telephone: demande.contactTelephone }, select: { id: true, archivedAt: true } });
      let existante = Boolean(cliente);
      if (cliente?.archivedAt) {
        throw new HttpError(409, "Une cliente archivée porte déjà ce numéro : restaurez-la, puis rattachez la demande.", { clienteId: cliente.id });
      }
      // Le quota ne s'applique que si une fiche est réellement créée (réutiliser une fiche existante n'ajoute rien).
      if (!cliente) await verifierQuota(tx, { atelierId, ressource: "clientes" });
      cliente ??= await tx.cliente.create({
        data: { atelierId, prenom: demande.contactPrenom, nom: demande.contactNom, telephone: demande.contactTelephone },
        select: { id: true },
      });
      await tx.demandeCommande.update({
        where: { id },
        data: { clienteId: cliente.id, contactPrenom: null, contactNom: null, contactTelephone: null, consentementLe: null },
      });
      return { demandeId: id, deja: false, existante };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  const demande = await prisma.demandeCommande.findUnique({ where: { id }, select: DEMANDE_SELECT });
  res.json({ ...demande, clienteExistante: resultat.existante ?? false, dejaTraite: resultat.deja });
});

// POST /api/demandes/:id/refuser { motifRefus? } — refuse définitivement,
// jamais de suppression (même discipline que le reste de l'app).
router.post("/:id/refuser", async (req, res) => {
  const parsed = refuserDemandeSchema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));

  // Refus et événement client dans la MÊME transaction (anomalie 8) : si la cliente ne peut pas être
  // prévenue, la demande reste EN_ATTENTE plutôt que d'être refusée en silence.
  const demande = await prisma.$transaction(
    async (tx) => {
      const result = await tx.demandeCommande.updateMany({
        where: { id: req.params.id, atelierId: req.user.atelierId, statut: "EN_ATTENTE" },
        data: { statut: "REFUSEE", motifRefus: parsed.data.motifRefus },
      });
      if (result.count === 0) {
        const existante = await tx.demandeCommande.findFirst({
          where: { id: req.params.id, atelierId: req.user.atelierId },
          select: { id: true },
        });
        if (!existante) throw new HttpError(404, "Demande introuvable.");
        throw new HttpError(409, "Cette demande a déjà été traitée.");
      }

      const refusee = await tx.demandeCommande.findUnique({ where: { id: req.params.id }, select: DEMANDE_SELECT });
      // Visiteur sans compte ni fiche : personne à prévenir dans l'application (l'atelier le recontacte lui-même).
      if (!refusee.cliente) return refusee;
      await creerNotificationClient(tx, {
        clienteId: refusee.cliente.id,
        commandeId: null,
        type: "DEMANDE_REFUSEE",
        params: refusee.motifRefus ? { motif: refusee.motifRefus } : {},
      });
      return refusee;
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
  res.json(demande);
});

export default router;
