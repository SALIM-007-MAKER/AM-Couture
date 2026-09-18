import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireAtelier } from "../middlewares/auth.middleware.js";
import { requireValidIdParam } from "../lib/idParam.js";
import { formatZodError } from "../lib/validation.js";
import { nextNumero } from "../lib/numero.js";
import { creerAbonnementSchema, listAbonnementsQuerySchema } from "../schemas/abonnement.schema.js";
import { statutEffectif } from "../lib/abonnement.js";
import { getPaymentProvider, PAYMENTS_MOCK_ACTIF } from "../lib/payments/index.js";

const router = Router();
// L'abonnement est celui DE L'ATELIER (Phase 8) — un SUPERADMIN n'a pas
// d'atelier et ne souscrit/consulte pas d'abonnement via cette route.
router.use(requireAuth, requireAtelier);
router.param("id", requireValidIdParam);

const FORMULE_SELECT = { id: true, dureeMois: true, nom: true, prix: true, actif: true };

function serialiser(abonnement) {
  return { ...abonnement, statutEffectif: statutEffectif(abonnement) };
}

// POST /api/abonnements — souscrit à une formule via le moyen de paiement
// choisi. Un Abonnement + une Transaction (EN_ATTENTE) sont TOUJOURS créés
// ensemble, quel que soit le moyen de paiement — même un paiement raté
// laisse une trace historique complète (comme Paiement/Depense ailleurs
// dans ce projet), jamais une ligne mutée après coup pour "faire comme si".
router.post("/", async (req, res) => {
  const parsed = creerAbonnementSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { formuleId, moyenPaiement, referenceExterne } = parsed.data;
  const provider = getPaymentProvider(moyenPaiement);

  const formule = await prisma.formuleAbonnement.findUnique({ where: { id: formuleId } });
  if (!formule || !formule.actif) {
    throw new HttpError(404, "Formule introuvable ou désactivée.");
  }

  // Notre clé d'idempotence (voir schema.prisma, Transaction.referenceInterne)
  // — envoyée à Wave comme client_reference pour WAVE ; sert aussi à
  // retrouver la transaction sans ambiguïté pour NITA/AMANA.
  const referenceInterne = crypto.randomUUID();

  const { abonnement, transaction } = await prisma.$transaction(
    async (tx) => {
      const numeroAbn = await nextNumero(tx, "ABN");
      const abonnementCree = await tx.abonnement.create({
        data: {
          numero: numeroAbn,
          atelierId: req.user.atelierId,
          formuleId: formule.id,
          prix: formule.prix,
          statut: "EN_ATTENTE",
        },
      });
      // Pour un moyen à vérification automatique (WAVE), c'est le
      // prestataire (ou sa simulation mock) qui génère la référence externe
      // ci-dessous — rien à stocker ici pour l'instant. Pour un moyen manuel
      // (NITA/Amanata), c'est la référence de virement déjà transmise par
      // l'atelier (creerAbonnementSchema l'exige dans ce cas).
      const numeroTrx = await nextNumero(tx, "TRX");
      const transactionCreee = await tx.transaction.create({
        data: {
          numero: numeroTrx,
          abonnementId: abonnementCree.id,
          moyenPaiement,
          montant: formule.prix,
          referenceInterne,
          referenceExterne: provider.verificationAutomatique ? null : referenceExterne,
        },
      });
      return { abonnement: abonnementCree, transaction: transactionCreee };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );

  if (!provider.verificationAutomatique) {
    return res.status(201).json({ abonnement: serialiser(abonnement), transaction });
  }

  // Même origine que le frontend en prod (voir app.js) — pas de variable
  // d'environnement supplémentaire nécessaire pour les URL de redirection.
  const origin = `${req.protocol}://${req.get("host")}`;
  try {
    const { referenceExterne: referenceExterneProvider, checkoutUrl } = await provider.initierPaiement({
      montant: formule.prix,
      referenceInterne,
      transactionId: transaction.id,
      successUrl: `${origin}/abonnement?paiement=succes`,
      errorUrl: `${origin}/abonnement?paiement=echec`,
    });
    const transactionMaj = await prisma.transaction.update({
      where: { id: transaction.id },
      data: { referenceExterne: referenceExterneProvider },
    });
    res.status(201).json({ abonnement: serialiser(abonnement), transaction: transactionMaj, checkoutUrl });
  } catch (err) {
    // Échec au démarrage du paiement (clé manquante/invalide, panne
    // réseau...) : la transaction reste une trace ÉCHOUÉE, jamais un
    // "EN_ATTENTE" fantôme qu'on oublierait de traiter.
    await prisma.transaction.update({ where: { id: transaction.id }, data: { statut: "ECHOUEE" } });
    throw new HttpError(502, `Impossible de démarrer le paiement ${moyenPaiement} : ${err.message}`);
  }
});

// GET /api/abonnements/config — indique si le mode test (PAYMENTS_MODE=mock)
// est actif, pour que le frontend affiche un bandeau explicite (jamais un
// silence qui laisserait croire à un vrai paiement) et propose la page de
// simulation. Définie avant "/:id" pour ne pas être capturée comme un
// identifiant.
router.get("/config", (req, res) => {
  res.json({ mockActif: PAYMENTS_MOCK_ACTIF });
});

// GET /api/abonnements — historique complet, plus récent en premier.
router.get("/", async (req, res) => {
  const parsed = listAbonnementsQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Paramètres invalides.", formatZodError(parsed.error));
  const { page, pageSize } = parsed.data;

  const [data, total] = await Promise.all([
    prisma.abonnement.findMany({
      where: { atelierId: req.user.atelierId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { formule: { select: FORMULE_SELECT }, transactions: { orderBy: { createdAt: "desc" } } },
    }),
    prisma.abonnement.count({ where: { atelierId: req.user.atelierId } }),
  ]);

  res.json({
    data: data.map(serialiser),
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

// GET /api/abonnements/actuel — l'abonnement "courant" : celui dont la date
// d'expiration est la plus lointaine parmi les CONFIRME (actif ou tout juste
// expiré), sinon le plus récent EN_ATTENTE, sinon aucun. Déclarée avant
// "/:id" pour ne pas être capturée comme un identifiant.
router.get("/actuel", async (req, res) => {
  const confirme = await prisma.abonnement.findFirst({
    where: { atelierId: req.user.atelierId, statut: "CONFIRME" },
    orderBy: { dateExpiration: "desc" },
    include: { formule: { select: FORMULE_SELECT }, transactions: { orderBy: { createdAt: "desc" } } },
  });
  if (confirme) return res.json(serialiser(confirme));

  const enAttente = await prisma.abonnement.findFirst({
    where: { atelierId: req.user.atelierId, statut: "EN_ATTENTE" },
    orderBy: { createdAt: "desc" },
    include: { formule: { select: FORMULE_SELECT }, transactions: { orderBy: { createdAt: "desc" } } },
  });
  if (enAttente) return res.json(serialiser(enAttente));

  res.status(404).json({ error: "Aucun abonnement." });
});

// GET /api/abonnements/:id — détail.
router.get("/:id", async (req, res) => {
  const abonnement = await prisma.abonnement.findFirst({
    where: { id: req.params.id, atelierId: req.user.atelierId },
    include: { formule: { select: FORMULE_SELECT }, transactions: { orderBy: { createdAt: "desc" } } },
  });
  if (!abonnement) throw new HttpError(404, "Abonnement introuvable.");
  res.json(serialiser(abonnement));
});

export default router;
