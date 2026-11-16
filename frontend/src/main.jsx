import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { queryClient } from "./lib/queryClient.js";
import { restaurerDepuis, demarrerSauvegarde } from "./lib/instantane.js";
import { stockageIndexedDb } from "./lib/instantaneStockage.js";

// PWA (registerType: "autoUpdate", voir vite.config.js) : le nouveau service
// worker prend le contrôle en arrière-plan (skipWaiting/clientsClaim) mais
// l'onglet déjà ouvert continue d'exécuter l'ANCIEN bundle JS en mémoire tant
// qu'il n'est pas rechargé — d'où des utilisateurs coincés sur une version
// corrigée par un déploiement précédent. `hadController` distingue la prise
// de contrôle initiale (premier chargement, rien à recharger) d'une vraie
// mise à jour (l'app tournait déjà sous un service worker précédent).
if ("serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

// Consultation hors connexion (7.5) : on recharge l'instantané de l'appareil AVANT d'afficher l'application, pour qu'elle
// s'ouvre directement avec les données déjà consultées, même sans réseau. Borné à 1,5 s : un stockage lent ne doit jamais
// retarder l'ouverture. Sans instantané (premier lancement, déconnexion, expiration) tout fonctionne comme avant.
try {
  await Promise.race([restaurerDepuis(stockageIndexedDb, queryClient), new Promise((r) => setTimeout(r, 1500))]);
} catch {
  // ignoré : pas d'instantané
}
demarrerSauvegarde(queryClient, stockageIndexedDb);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
