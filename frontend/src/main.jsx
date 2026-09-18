import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { queryClient } from "./lib/queryClient.js";

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
