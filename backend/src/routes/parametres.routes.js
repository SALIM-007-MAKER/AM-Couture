import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middlewares/error.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { formatZodError } from "../lib/validation.js";
import { putParametresSchema, patchParametresSchema } from "../schemas/atelier.schema.js";

// Atelier est un singleton (voir le commentaire du modèle dans
// schema.prisma : "sert de source pour la route /api/parametres") — mais
// `id` reste `@id @default(cuid())`, rien dans le schéma n'empêche à lui
// seul l'existence de PLUSIEURS lignes. Pour garantir l'invariant "une seule
// ligne" SANS migration (pas de contrainte supplémentaire), on force
// toujours le même id applicatif fixe : `prisma.atelier.upsert({where:{id:
// ATELIER_ID}})` devient alors un INSERT...ON CONFLICT DO UPDATE atomique
// côté PostgreSQL — intrinsèquement sûr sous PUT concurrents, sans verrou
// explicite nécessaire (testé : voir rapport du module).
const ATELIER_ID = "atelier-config";

const router = Router();

// GET /api/parametres/public — nom et logo UNIQUEMENT, sans authentification
// (placée avant router.use(requireAuth) ci-dessous) : utilisée par la page
// de connexion, avant toute session, pour afficher le vrai nom/logo de
// l'atelier plutôt qu'un texte et une icône génériques. Champs
// volontairement limités — jamais téléphone, adresse ou recuConfig, qui
// restent réservés aux utilisateurs authentifiés. Toujours 200, même si
// l'atelier n'est pas encore configuré (nom/logoUrl à null) : la page de
// connexion n'a pas à distinguer "pas configuré" d'une vraie erreur.
router.get("/public", async (req, res) => {
  const atelier = await prisma.atelier.findUnique({
    where: { id: ATELIER_ID },
    select: { nom: true, logoUrl: true },
  });
  res.json({ nom: atelier?.nom ?? null, logoUrl: atelier?.logoUrl ?? null });
});

router.use(requireAuth);

// GET /api/parametres — configuration actuelle, ou 404 si jamais configurée.
router.get("/", async (req, res) => {
  const atelier = await prisma.atelier.findUnique({ where: { id: ATELIER_ID } });
  if (!atelier) throw new HttpError(404, "Paramètres de l'atelier non configurés.");
  res.json(atelier);
});

// PUT /api/parametres — crée la ligne si elle n'existe pas (nom + devise
// obligatoires), ou met à jour les champs fournis si elle existe déjà (voir
// atelier.schema.js : un champ optionnel omis n'efface jamais une valeur
// déjà en base, ni au create ni à l'update — Prisma ignore les clés
// `undefined` dans `data`).
router.put("/", async (req, res) => {
  const parsed = putParametresSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  const atelier = await prisma.atelier.upsert({
    where: { id: ATELIER_ID },
    create: { id: ATELIER_ID, ...parsed.data },
    update: { ...parsed.data },
  });
  res.json(atelier);
});

// PATCH /api/parametres — modification partielle. Nécessite que la
// configuration existe déjà (contrairement à PUT, ne crée jamais la ligne) :
// 404 explicite sinon, avec message orientant vers PUT.
router.patch("/", async (req, res) => {
  const parsed = patchParametresSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Champs invalides.", formatZodError(parsed.error));
  }
  try {
    const atelier = await prisma.atelier.update({ where: { id: ATELIER_ID }, data: parsed.data });
    res.json(atelier);
  } catch (err) {
    if (err?.code === "P2025") {
      throw new HttpError(404, "Paramètres de l'atelier non configurés : utilisez PUT pour les créer d'abord.");
    }
    throw err;
  }
});

// Volontairement aucune route DELETE : l'atelier n'a pas de "mode non
// configuré" utile à retrouver après une première configuration — un champ
// se corrige via PUT/PATCH, pas en supprimant toute la configuration.

export default router;
