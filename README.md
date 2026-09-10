# AM Couture

Application de gestion pour atelier de couture — React/Vite (PWA) + Express + Prisma 7 + PostgreSQL (Neon) + Vercel.

## Démarrage local

```bash
npm install
cp .env.example .env   # puis renseigner DATABASE_URL / DIRECT_URL (Neon) et JWT_SECRET
npx prisma generate
npx prisma migrate dev # crée le schéma sur votre base Neon de dev

npm run dev:backend    # http://localhost:4000
npm run dev:frontend   # http://localhost:5173 (proxy /api -> :4000)
```

## Structure

- `frontend/` — React + Vite + Tailwind, PWA installable.
- `backend/` — Express, exporté sans `app.listen()` (voir `src/app.js`) ; `src/server.js` = dev local uniquement.
- `api/index.js` — point d'entrée Vercel Function (réexporte `backend/src/app.js`).
- `prisma/schema.prisma` + `prisma.config.ts` — schéma et configuration CLI (Prisma 7, driver adapter `@prisma/adapter-pg`).

## Déploiement

Push sur GitHub → Vercel construit avec `prisma generate && prisma migrate deploy && vite build` (voir `vercel.json`). Variables d'environnement à configurer dans le dashboard Vercel : `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `BLOB_READ_WRITE_TOKEN`.
