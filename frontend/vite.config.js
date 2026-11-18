import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon-512.png", "apple-touch-icon.png"],
      workbox: {
        // Par defaut, le service worker redirige TOUTE navigation (y
        // compris l'ouverture d'un lien /api/... dans un nouvel onglet,
        // comme le bouton "PDF" d'un reçu) vers index.html - la SPA ne
        // reconnaissant pas cette URL, elle affichait sa page "introuvable"
        // a la place du vrai fichier PDF. Les routes /api/* doivent toujours
        // atteindre le serveur, jamais ce fallback.
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        // Plateforme partagée par plusieurs ateliers (Phase 8 — multi-tenant) :
        // ce nom d'installation PWA est vu par TOUS les ateliers, jamais un
        // seul tenant en particulier - voir aussi AppLayout.jsx (Logo), qui
        // affiche lui le nom de l'atelier de l'utilisateur connecté.
        name: "Tailora",
        short_name: "Tailora",
        description: "Plateforme de gestion pour ateliers de couture",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#276386",
        // Icônes de la plateforme Tailora (logo sur fond blanc), générées depuis le logo d'origine : jamais le logo d'un atelier.
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/favicon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      // Dev local uniquement : en prod, frontend et API sont sur le même domaine.
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
