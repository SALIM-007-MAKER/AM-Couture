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
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "AM Couture",
        short_name: "AM Couture",
        description: "Application de gestion pour atelier de couture",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        // Couleur de marque (voir --color-brand-600, index.css) : l'icone de
        // l'app installee reste le ciseau AM Couture generique (meme repli
        // que le logo dans la sidebar) - le vrai logo uploade par l'atelier
        // n'a pas vocation a devenir l'icone d'app/l'ecran de demarrage.
        theme_color: "#276386",
        icons: [{ src: "/icons.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
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
