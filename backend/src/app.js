import express from "express";
import cookieParser from "cookie-parser";
import { errorMiddleware } from "./middlewares/error.middleware.js";
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

// Pas de app.listen() ici : ce fichier est importé à la fois par
// backend/src/server.js (dev local) et par api/index.js (Vercel Function).
// Frontend et API partagent le même domaine en prod → pas de CORS nécessaire.
// En dev, le proxy Vite (frontend/vite.config.js) joue ce rôle.

const app = express();

// Vercel place l'app derrière un proxy : indispensable pour que req.ip
// (rate limiting) et les cookies "secure" reflètent la vraie requête client.
app.set("trust proxy", 1);

// 5mb : les photos (modèles) et le logo de l'atelier sont uploadés en base64
// dans le corps JSON (voir optionalImageField, zodHelpers.js) — une image de
// 2 Mo encodée en base64 pèse ~2.7 Mo, plus le reste des champs du formulaire.
app.use(express.json({ limit: "5mb" }));
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

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "am-couture-api" });
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
