import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { requireValidIdParam } from "../lib/idParam.js";
import {
  creerAtelierSchema,
  patchAtelierSchema,
  statutAtelierSchema,
  reinitialiserMotDePasseSchema,
  listAteliersQuerySchema,
  ajouterCompteSchema,
} from "../schemas/atelierAdmin.schema.js";
import {
  creerAtelierEtAdmin,
  reinitialiserMotDePasse,
  ajouterCompteAtelier,
  supprimerCompteAtelier,
  demarrerImpersonation,
} from "../lib/atelierProvisioning.js";
import { signAuthToken } from "../lib/jwt.js";
import { setAuthCookie } from "../lib/authCookie.js";

// Réservé au SUPERADMIN de la plateforme (Phase 8 — multi-tenant) : gestion
// des ateliers (tenants). Un ADMIN n'accède jamais à ces routes — il gère
// SON atelier via /api/parametres (voir parametres.routes.js).
const router = Router();
router.use(requireAuth, requireSuperadmin);
router.param("id", requireValidIdParam);
router.param("userId", requireValidIdParam);

// GET /api/ateliers — liste paginée des ateliers de la plateforme (recherche
// par nom via `q`), avec un aperçu de leur activité (nombre de
// comptes/clientes/commandes) — même forme de réponse {data, meta} que les
// autres listes de l'app (voir listClientesQuerySchema, cliente.schema.js).
router.get("/", async (req, res) => {
  const parsed = listAteliersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, "Paramètres de recherche invalides.", formatZodError(parsed.error));
  }
  const { q, page, pageSize } = parsed.data;
  const where = q ? { nom: { contains: q, mode: "insensitive" } } : {};

  const [rows, total] = await Promise.all([
    prisma.atelier.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        // users filtré à ADMIN (§ plan rôle USER, Phase 3) : depuis
        // l'introduction des comptes clients (role USER, eux aussi rattachés
        // à l'atelier), un compte non filtré compterait les clients dans
        // "nombre de comptes ADMIN" — trompeur pour le SUPERADMIN.
        _count: { select: { users: { where: { role: "ADMIN" } }, clientes: true, commandes: true } },
      },
    }),
    prisma.atelier.count({ where }),
  ]);

  const data = rows.map(({ _count, ...atelier }) => ({
    ...atelier,
    nombreComptes: _count.users,
    nombreClientes: _count.clientes,
    nombreCommandes: _count.commandes,
  }));

  res.json({ data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } });
});

// GET /api/ateliers/resume — vue d'ensemble plateforme (totaux tous ateliers
// confondus). Défini AVANT /:id : sinon Express matcherait "resume" comme
// une valeur de :id (routes enregistrées dans l'ordre, la première qui
// correspond gagne).
router.get("/resume", async (req, res) => {
  const [nombreAteliers, nombreAteliersActifs, nombreComptes, nombreClientes, nombreCommandes] = await Promise.all([
    prisma.atelier.count(),
    prisma.atelier.count({ where: { actif: true } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.cliente.count(),
    prisma.commande.count(),
  ]);
  res.json({
    nombreAteliers,
    nombreAteliersActifs,
    nombreAteliersSuspendus: nombreAteliers - nombreAteliersActifs,
    nombreComptes,
    nombreClientes,
    nombreCommandes,
  });
});

// GET /api/ateliers/tendances — évolution mensuelle sur 6 mois : nouveaux
// ateliers ET revenus de la PLATEFORME (abonnements payés par les ateliers,
// Transaction.statut=REUSSIE — jamais les paiements que les clients versent
// aux ateliers, qui sont le chiffre d'affaires PRIVÉ de chaque atelier, pas
// celui de la plateforme). Agrégation en JS (comme /activite) plutôt qu'un
// group-by SQL par mois : volumes attendus faibles à ce stade, pas besoin de
// complexifier la requête pour ça. Défini avant /:id pour la même raison que
// /resume ci-dessus.
router.get("/tendances", async (req, res) => {
  const NOMBRE_MOIS = 6;
  const maintenant = new Date();
  const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - (NOMBRE_MOIS - 1), 1);

  const [ateliers, transactions] = await Promise.all([
    prisma.atelier.findMany({ where: { createdAt: { gte: debut } }, select: { createdAt: true } }),
    // updatedAt : une transaction REUSSIE a été mise à jour au moment même de
    // sa confirmation (webhook Wave ou confirmation manuelle) — bien plus
    // représentatif du moment où le revenu est réellement acquis que
    // createdAt (date de simple initiation, potentiellement restée EN_ATTENTE
    // un moment avant confirmation).
    prisma.transaction.findMany({
      where: { statut: "REUSSIE", updatedAt: { gte: debut } },
      select: { montant: true, updatedAt: true },
    }),
  ]);

  const cleDe = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const cles = Array.from({ length: NOMBRE_MOIS }, (_, i) => {
    const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - (NOMBRE_MOIS - 1 - i), 1);
    return cleDe(d);
  });
  const parMois = Object.fromEntries(cles.map((c) => [c, { mois: c, nouveauxAteliers: 0, revenus: 0 }]));

  for (const a of ateliers) {
    const cle = cleDe(a.createdAt);
    if (parMois[cle]) parMois[cle].nouveauxAteliers += 1;
  }
  for (const t of transactions) {
    const cle = cleDe(t.updatedAt);
    if (parMois[cle]) parMois[cle].revenus += Number(t.montant);
  }

  res.json(cles.map((c) => parMois[c]));
});

// GET /api/ateliers/alertes — signaux à surveiller pour le SUPERADMIN :
// nouveaux ateliers (7 derniers jours), abonnements expirés ou expirant
// bientôt (7 prochains jours), ateliers suspendus. Construit à partir des
// données déjà existantes — pas un nouveau système de notifications
// persistées (même décision que /activite, voir plus bas) : rien n'est
// stocké, rien à marquer "lu", recalculé à chaque appel. Défini avant /:id
// pour la même raison que /resume ci-dessus.
router.get("/alertes", async (req, res) => {
  const maintenant = new Date();
  const dansSeptJours = new Date(maintenant.getTime() + 7 * 24 * 60 * 60 * 1000);
  const ilYaSeptJours = new Date(maintenant.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [nouveauxAteliers, ateliersSuspendus, ateliersAvecAbonnement] = await Promise.all([
    prisma.atelier.findMany({
      where: { createdAt: { gte: ilYaSeptJours } },
      orderBy: { createdAt: "desc" },
      select: { id: true, nom: true, createdAt: true },
    }),
    prisma.atelier.findMany({
      where: { actif: false },
      orderBy: { suspenduLe: "desc" },
      select: { id: true, nom: true, suspenduLe: true },
    }),
    prisma.atelier.findMany({
      where: { actif: true },
      select: {
        id: true,
        nom: true,
        abonnements: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { dateExpiration: true, statut: true },
        },
      },
    }),
  ]);

  // Un abonnement EN_ATTENTE ou ANNULE n'a pas de dateExpiration pertinente
  // à surveiller ici (voir StatutAbonnement, schema.prisma) — seul un
  // abonnement CONFIRME peut "expirer bientôt" ou être "expiré".
  const abonnementsAlerte = ateliersAvecAbonnement
    .map(({ abonnements, ...atelier }) => ({ ...atelier, abonnement: abonnements[0] ?? null }))
    .filter((a) => a.abonnement?.statut === "CONFIRME" && a.abonnement.dateExpiration)
    .map((a) => ({
      id: a.id,
      nom: a.nom,
      dateExpiration: a.abonnement.dateExpiration,
      expire: new Date(a.abonnement.dateExpiration) < maintenant,
    }))
    .filter((a) => a.expire || new Date(a.dateExpiration) <= dansSeptJours)
    .sort((a, b) => new Date(a.dateExpiration) - new Date(b.dateExpiration));

  res.json({ nouveauxAteliers, ateliersSuspendus, abonnementsAlerte });
});

// GET /api/ateliers/abonnements — statut d'abonnement de CHAQUE atelier
// (dernier abonnement souscrit, s'il existe) — vue plateforme en lecture
// seule ; la souscription/le paiement restent une action de l'ADMIN de
// l'atelier lui-même (voir abonnements.routes.js), jamais du SUPERADMIN.
// Défini avant /:id pour la même raison que /resume ci-dessus.
router.get("/abonnements", async (req, res) => {
  const ateliers = await prisma.atelier.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      nom: true,
      actif: true,
      abonnements: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          numero: true,
          statut: true,
          dateDebut: true,
          dateExpiration: true,
          prix: true,
          formule: { select: { nom: true } },
        },
      },
    },
  });
  const maintenant = new Date();
  res.json(
    ateliers.map(({ abonnements, ...atelier }) => {
      const dernier = abonnements[0] ?? null;
      const expire = Boolean(dernier?.dateExpiration && new Date(dernier.dateExpiration) < maintenant);
      return { ...atelier, abonnement: dernier ? { ...dernier, expire } : null };
    }),
  );
});

// GET /api/ateliers/:id — fiche complète d'un atelier (infos + comptes ADMIN
// rattachés, avec leur dernière connexion).
router.get("/:id", async (req, res) => {
  const atelier = await prisma.atelier.findUnique({
    where: { id: req.params.id },
    include: {
      // Filtré à role: "ADMIN" — depuis l'introduction du rôle USER (§ plan
      // rôle client, Phase 3), un compte client est LUI AUSSI rattaché à cet
      // atelier ; cette section de la console SUPERADMIN gère les comptes
      // ADMIN de l'atelier (réinitialisation, retrait, impersonation), pas
      // ses clients — jamais les mélanger ici.
      _count: { select: { users: { where: { role: "ADMIN" } }, clientes: true, commandes: true } },
      users: {
        where: { role: "ADMIN" },
        select: { id: true, identifiant: true, prenom: true, nom: true, email: true, derniereConnexionAt: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!atelier) throw new HttpError(404, "Atelier introuvable.");
  const { _count, users, ...reste } = atelier;
  res.json({
    ...reste,
    nombreComptes: _count.users,
    nombreClientes: _count.clientes,
    nombreCommandes: _count.commandes,
    comptes: users,
  });
});

// PATCH /api/ateliers/:id — modifie les informations d'un atelier existant
// (voir patchAtelierSchema : nom/devise/telephone/adresse/ville/pays).
router.patch("/:id", async (req, res) => {
  const parsed = patchAtelierSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const existant = await prisma.atelier.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existant) throw new HttpError(404, "Atelier introuvable.");
  const atelier = await prisma.atelier.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(atelier);
});

// PATCH /api/ateliers/:id/statut — active/suspend un atelier. Effet immédiat
// sur toutes les sessions déjà ouvertes de cet atelier (voir requireAtelier,
// auth.middleware.js, qui revérifie `actif` en base à chaque requête).
router.patch("/:id/statut", async (req, res) => {
  const parsed = statutAtelierSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const existant = await prisma.atelier.findUnique({ where: { id: req.params.id }, select: { id: true, actif: true } });
  if (!existant) throw new HttpError(404, "Atelier introuvable.");
  const { actif } = parsed.data;
  const atelier = await prisma.atelier.update({
    where: { id: req.params.id },
    data: { actif, suspenduLe: actif ? null : new Date() },
  });
  res.json(atelier);
});

// GET /api/ateliers/:id/activite — fil d'activité récente : dernières
// commandes créées et derniers paiements enregistrés pour cet atelier,
// fusionnés et triés par date décroissante. Construit à partir de données
// déjà existantes (pas de nouveau système de journalisation, voir décision) —
// purement informatif, jamais utilisé pour une décision d'autorisation.
router.get("/:id/activite", async (req, res) => {
  const existant = await prisma.atelier.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existant) throw new HttpError(404, "Atelier introuvable.");

  const LIMITE = 15;
  const [commandes, paiements] = await Promise.all([
    prisma.commande.findMany({
      where: { atelierId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
      select: {
        id: true,
        numero: true,
        statut: true,
        createdAt: true,
        cliente: { select: { nom: true, prenom: true } },
      },
    }),
    prisma.paiement.findMany({
      where: { commande: { atelierId: req.params.id }, annuleAt: null },
      orderBy: { date: "desc" },
      take: LIMITE,
      select: {
        id: true,
        montant: true,
        mode: true,
        date: true,
        commande: { select: { numero: true } },
      },
    }),
  ]);

  const evenements = [
    ...commandes.map((c) => ({
      type: "commande",
      date: c.createdAt,
      description: `Commande ${c.numero} créée pour ${c.cliente.prenom} ${c.cliente.nom} (${c.statut})`,
    })),
    ...paiements.map((p) => ({
      type: "paiement",
      date: p.date,
      description: `Paiement de ${p.montant} (${p.mode}) sur la commande ${p.commande.numero}`,
    })),
  ]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, LIMITE);

  res.json(evenements);
});

// GET /api/ateliers/:id/impersonations — historique des impersonations
// déclenchées sur cet atelier (voir JournalImpersonation, schema.prisma) —
// distinct de /activite (activité MÉTIER du client) : ceci est un journal de
// sécurité, qui répond à "qui, côté plateforme, a accédé aux données de cet
// atelier, et quand".
router.get("/:id/impersonations", async (req, res) => {
  const existant = await prisma.atelier.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existant) throw new HttpError(404, "Atelier introuvable.");

  const data = await prisma.journalImpersonation.findMany({
    where: { atelierId: req.params.id },
    orderBy: { demarreLe: "desc" },
    take: 20,
  });
  res.json({ data });
});

// PATCH /api/ateliers/:id/comptes/:userId/mot-de-passe — réinitialise le mot
// de passe d'un compte de cet atelier. Dernier recours en l'absence de tout
// mécanisme de récupération en libre-service (voir reinitialiserMotDePasse,
// atelierProvisioning.js) — jamais destiné à un usage courant.
router.patch("/:id/comptes/:userId/mot-de-passe", async (req, res) => {
  const parsed = reinitialiserMotDePasseSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  await reinitialiserMotDePasse({
    atelierId: req.params.id,
    userId: req.params.userId,
    nouveauMotDePasse: parsed.data.nouveauMotDePasse,
  });
  res.status(204).end();
});

// POST /api/ateliers/:id/comptes — ajoute un compte ("employé") à un atelier
// existant. Voir ajouterCompteSchema (atelierAdmin.schema.js) pour la
// décision "mêmes permissions que l'ADMIN" (pas de rôle restreint construit
// à ce stade).
router.post("/:id/comptes", async (req, res) => {
  const parsed = ajouterCompteSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const compte = await ajouterCompteAtelier({ atelierId: req.params.id, ...parsed.data });
  res.status(201).json({
    id: compte.id,
    identifiant: compte.identifiant,
    prenom: compte.prenom,
    nom: compte.nom,
    email: compte.email,
    derniereConnexionAt: compte.derniereConnexionAt,
    createdAt: compte.createdAt,
  });
});

// DELETE /api/ateliers/:id/comptes/:userId — retire un compte de l'atelier.
// Refuse de laisser l'atelier sans aucun compte (voir supprimerCompteAtelier,
// atelierProvisioning.js).
router.delete("/:id/comptes/:userId", async (req, res) => {
  await supprimerCompteAtelier({ atelierId: req.params.id, userId: req.params.userId });
  res.status(204).end();
});

// POST /api/ateliers/:id/comptes/:userId/impersonation — le SUPERADMIN
// authentifié REMPLACE son propre cookie de session par un jeton pour ce
// compte ADMIN (voir demarrerImpersonation, atelierProvisioning.js) : à
// partir de la réponse, cette session EST le compte ADMIN dans le reste de
// l'app (le rôle SUPERADMIN n'est plus actif tant que
// POST /auth/quitter-impersonation n'a pas été appelé — voir auth.routes.js).
// Journalisée avant tout changement de cookie (voir JournalImpersonation).
router.post("/:id/comptes/:userId/impersonation", async (req, res) => {
  const compte = await demarrerImpersonation({
    atelierId: req.params.id,
    userId: req.params.userId,
    superadminId: req.user.id,
  });
  const token = signAuthToken(compte, { impersonatedBy: req.user.id });
  setAuthCookie(res, token);
  res.json({ id: compte.id, identifiant: compte.identifiant, role: compte.role, atelierId: compte.atelierId });
});

// DELETE /api/ateliers/:id — supprime DÉFINITIVEMENT un atelier, réservé aux
// ateliers VIDES (aucune cliente/modèle/commande/dépense/abonnement) : un
// atelier créé par erreur ou un test, jamais un atelier avec de vraies
// données métier — pour ceux-là, la suspension (PATCH .../statut) reste le
// seul outil, précisément pour ne jamais perdre de données par erreur.
// Supprime aussi son/ses compte(s) (onDelete: Restrict sur User.atelierId
// empêcherait sinon la suppression de l'atelier tant qu'un compte y est
// rattaché).
router.delete("/:id", async (req, res) => {
  const atelier = await prisma.atelier.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { clientes: true, modeles: true, commandes: true, depenses: true, abonnements: true } },
    },
  });
  if (!atelier) throw new HttpError(404, "Atelier introuvable.");

  const { clientes, modeles, commandes, depenses, abonnements } = atelier._count;
  if (clientes + modeles + commandes + depenses + abonnements > 0) {
    throw new HttpError(
      409,
      "Cet atelier contient des données (clientes, commandes...) — impossible de le supprimer. Suspendez-le plutôt.",
    );
  }

  await prisma.$transaction([
    prisma.user.deleteMany({ where: { atelierId: req.params.id } }),
    prisma.atelier.delete({ where: { id: req.params.id } }),
  ]);
  res.status(204).end();
});

// POST /api/ateliers — crée un nouvel atelier (tenant) + son premier compte
// ADMIN, atomiquement. Voie RÉSERVÉE AU SUPERADMIN (provisioning depuis la
// plateforme) — un propriétaire d'atelier a sa propre voie en libre-service,
// non-authentifiée : POST /api/auth/inscription-atelier (auth.routes.js).
// Les deux partagent la même logique de création (creerAtelierEtAdmin).
router.post("/", async (req, res) => {
  const parsed = creerAtelierSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const { atelier, admin } = await creerAtelierEtAdmin(parsed.data);
  res.status(201).json({ atelier, admin: { id: admin.id, identifiant: admin.identifiant } });
});

export default router;
