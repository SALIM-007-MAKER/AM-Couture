// Entrée unique de la Vercel Function : réexporte l'app Express du backend.
// Vercel détecte ce fichier et route /api/* dessus (voir vercel.json).
export { default } from "../backend/src/app.js";
