// Point d'entrée UNIQUEMENT pour le développement local.
// En production (Vercel), c'est api/index.js qui exporte l'app — jamais ce fichier.
import app from "./app.js";

const port = process.env.PORT || 4000;

app.listen(port, () => {
  console.log(`Gestion d'Atelier API — http://localhost:${port}/api/health`);
});
