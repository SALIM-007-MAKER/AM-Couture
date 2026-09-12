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
        name: "AM Couture",
        short_name: "AM Couture",
        description: "Application de gestion pour atelier de couture",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        // Couleur de marque (voir --color-brand-600, index.css) - reste
        // independante du logo (icone d'app) ci-dessous, qui est le vrai
        // logo AM Couture fourni par l'atelier, pas une couleur.
        theme_color: "#276386",
        icons: [{ src: "/favicon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }],
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
