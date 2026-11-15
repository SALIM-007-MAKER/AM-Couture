import express from "express";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { securityHeaders, csrfOriginGuard } from "./middlewares/security.middleware.js";
import { requestId } from "./middlewares/requestId.middleware.js";
import { requestLog } from "./middlewares/requestLog.middleware.js";
import { log, messageErreur } from "./lib/logger.js";
import { installerGestionnairesProcessus } from "./lib/processHandlers.js";
import { prisma } from "./lib/prisma.js";
import authRouter from "./routes/auth.routes.js";
import clientesRouter from "./routes/clientes.routes.js";
import modelesRouter from "./routes/modeles.routes.js";
import commandesRouter from "./routes/commandes.routes.js";
import { paiementsGlobalRouter } from "./routes/paiements.routes.js";
import { livraisonsGlobalRouter } from "./routes/livraisons.routes.js";
import depensesRouter from "./routes/depenses.routes.js";
import recusRouter from "./routes/recus.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";
import rapportsRouter from "./routes/rapports.routes.js";
import parametresRouter from "./routes/parametres.routes.js";
import notificationsRouter from "./routes/notifications.routes.js";
import compteRouter from "./routes/compte.routes.js";
import abonnementsRouter from "./routes/abonnements.routes.js";
import plansRouter from "./routes/plans.routes.js";
import plateformeRouter from "./routes/plateforme.routes.js";
import ateliersRouter from "./routes/ateliers.routes.js";
import ateliersAbonnementRouter from "./routes/ateliersAbonnement.routes.js";
import cronRouter from "./routes/cron.routes.js";
import stockRouter from "./routes/stock.routes.js";
import moiRouter from "./routes/moi.routes.js";
import demandesRouter from "./routes/demandes.routes.js";
import webhooksRouter from "./routes/webhooks.routes.js";
import commerceRouter from "./routes/commerce.routes.js";

// Pas de app.listen() ici : ce fichier est importé à la fois par
// backend/src/server.js (dev local) et par api/index.js (Vercel Function).
// Frontend et API partagent le même domaine en prod → pas de CORS nécessaire.
// En dev, le proxy Vite (frontend/vite.config.js) joue ce rôle.

// Journalise les rejets et exceptions non gérés (désactivé en test : le lanceur de tests a ses propres gestionnaires).
if (process.env.NODE_ENV !== "test") installerGestionnairesProcessus();

const app = express();

// Vercel place l'app derrière un proxy : indispensable pour que req.ip
// (rate limiting) et les cookies "secure" reflètent la vraie requête client.
app.set("trust proxy", 1);
app.disable("x-powered-by");

// En-têtes de sécurité + garde Origin (CSRF) AVANT tout parsing de corps et tout
// routeur — voir middlewares/security.middleware.js.
// L'identifiant de requête vient en PREMIER : même une erreur d'analyse du corps en porte un.
app.use(requestId);
app.use(requestLog);
app.use("/api", securityHeaders, csrfOriginGuard);

// 5mb : les photos (modèles) et le logo de l'atelier sont uploadés en base64
// dans le corps JSON (voir optionalImageField, zodHelpers.js) — une image de
// 2 Mo encodée en base64 pèse ~2.7 Mo, plus le reste des champs du formulaire.
//
// `verify` capture le Buffer BRUT de chaque requête dans req.rawBody, sans
// changer le comportement du parsing JSON normal (req.body reste identique
// partout ailleurs) — nécessaire pour le webhook Wave (webhooks.routes.js) :
// la signature HMAC porte sur les octets exacts reçus, jamais sur une
// reconstruction JSON.stringify(req.body) qui pourrait légèrement différer.
app.use(
  express.json({
    limit: "5mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/clientes", clientesRouter);
app.use("/api/modeles", modelesRouter);
app.use("/api/commandes", commandesRouter);
// Lecture seule, toutes commandes confondues — voir commentaire dans
// paiements.routes.js / livraisons.routes.js. La création/annulation reste
// exclusivement via les routes imbriquées sous /api/commandes/:id/....
app.use("/api/paiements", paiementsGlobalRouter);
app.use("/api/livraisons", livraisonsGlobalRouter);
app.use("/api/depenses", depensesRouter);
app.use("/api/recus", recusRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/rapports", rapportsRouter);
app.use("/api/parametres", parametresRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/compte", compteRouter);
app.use("/api/abonnements", abonnementsRouter);
app.use("/api/plans-abonnement", plansRouter);
// Tableau de bord commercial : monté AVANT /api/plateforme, dont le routeur s'applique à tout son préfixe.
app.use("/api/plateforme/commerce", commerceRouter);
app.use("/api/plateforme", plateformeRouter);
app.use("/api/stock", stockRouter);
// Espace client final (§ plan rôle USER, Phase 3) — réservé aux comptes
// USER (requireClient), jamais aux comptes ADMIN/SUPERADMIN.
app.use("/api/moi", moiRouter);
// Gestion ADMIN des demandes de commande envoyées par des clients USER.
app.use("/api/demandes", demandesRouter);
// Webhooks de paiement (routes/webhooks.routes.js) : pas de requireAuth, Wave appelle cette route directement ;
// la confiance vient de la signature HMAC. Montés mais INERTES tant que le paiement Wave n'est pas activé
// (WAVE_ENABLED=1 + clés) : la route répond alors 503 sans rien traiter.
app.use("/api/webhooks", webhooksRouter);
// Réservé SUPERADMIN (Phase 8 — multi-tenant) : gestion des ateliers/tenants.
// Abonnement d'un atelier (activation manuelle) : monté AVANT ateliersRouter,
// qui porte des routes /:id plus génériques.
app.use("/api/ateliers", ateliersAbonnementRouter);
app.use("/api/ateliers", ateliersRouter);
// Déclenchée uniquement par Vercel Cron (voir vercel.json) — pas de
// requireAuth/requireAtelier, authentification par secret partagé (voir
// cron.routes.js).
app.use("/api/cron", cronRouter);

// Liveness : le processus répond. Volontairement indépendante de la base (un moniteur ne doit pas
// redémarrer l'application parce que la base est momentanément indisponible).
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "gestion-atelier-api" });
});

// Readiness : l'application PEUT servir des requêtes, donc la base répond (SELECT 1, durée bornée).
// 503 sinon. Aucun détail technique dans la réponse (ni adresse, ni message d'erreur de la base).
const DELAI_READINESS_MS = 2500;
app.get("/api/health/ready", async (req, res) => {
  const debut = Date.now();
  let minuterie;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, rejeter) => {
        minuterie = setTimeout(() => rejeter(new Error("délai de readiness dépassé")), DELAI_READINESS_MS);
      }),
    ]);
    res.json({ status: "ok", db: "ok", latenceMs: Date.now() - debut });
  } catch (err) {
    log.warn("sante", { requestId: req.id, db: "indisponible", message: messageErreur(err) });
    res.status(503).json({ status: "degraded", db: "indisponible" });
  } finally {
    clearTimeout(minuterie);
  }
});

// Paiements/Livraisons/Reçus : toute ÉCRITURE (création, annulation) reste
// exclusivement en routes imbriquées sous /api/commandes/:commandeId/...
// (voir commandes.routes.js) — /api/paiements, /api/livraisons et /api/recus
// ci-dessus n'exposent que de la LECTURE globale (listes toutes commandes
// confondues + détail/PDF pour les reçus), pour les pages de gestion dédiées
// du frontend.
//
// Dashboard/Rapports (§ci-dessus) sont purement consultatifs : aucune route
// n'y écrit en base, ils lisent uniquement les tables des modules précédents.
//
// Tous les modules métier backend prévus sont maintenant montés.

// 404 explicite pour tout /api/* non reconnu (évite de tomber sur le fallback SPA)
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Route API inconnue." });
});

// Filet de sécurité JSON pour tout le reste : cette app ne sert que /api/* (le
// frontend est servi séparément — Vercel en prod, Vite en dev, voir plus haut).
// Un chemin hors /api ne devrait jamais atteindre ce process, mais Express
// normalise ".." dans l'URL AVANT le routage : "/api/x/../../y" peut résoudre
// vers "/y", qui échapperait sinon au 404 JSON ci-dessus et tomberait sur le
// handler HTML par défaut d'Express — trouvé en testant les IDs malformés du
// module Commandes (voir tests IDOR).
app.use((req, res) => {
  res.status(404).json({ error: "Route inconnue." });
});

app.use(errorMiddleware);

export default app;
