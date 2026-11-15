import { log, messageErreur } from "../lib/logger.js";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { reconcilierNotifications } from "../lib/notifications.js";
import { envoyerEmail } from "../lib/resend.js";
import { origineApplication } from "../lib/appUrl.js";
import { rappelsQuotidiensTemplate } from "../lib/emailTemplates.js";
import { purgerJournalSecurite } from "../lib/securityLog.js";
import { purgerClesIdempotence } from "../lib/idempotence.js";
import { envoyerRappelsAbonnement } from "../lib/rappelsAbonnement.js";

const router = Router();

const LIBELLES = {
  RETARD: "Commande(s) en retard",
  PRET: "Commande(s) prête(s) à récupérer",
  LIVRAISON_PROCHE: "Livraison(s) prévue(s) sous 3 jours",
  IMPAYE: "Commande(s) impayée(s)",
};

// GET /api/cron/rappels-quotidiens — appelée par Vercel Cron (voir vercel.json),
// jamais par le frontend. Vercel envoie automatiquement
// `Authorization: Bearer ${CRON_SECRET}` quand cette variable d'environnement
// est définie sur le projet : c'est la seule vérification, pas de session ni
// de cookie ici (l'appelant n'est pas un utilisateur connecté).
//
// Fail CLOSED (503) si CRON_SECRET n'est pas configuré — contrairement au
// rate-limiter (fail open sur panne DB), un déclenchement non authentifié de
// cette route enverrait de vrais emails à de vrais ateliers, donc pas de
// dégradation silencieuse acceptable ici.
router.get("/rappels-quotidiens", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "CRON_SECRET non configuré : rappels automatiques désactivés." });
  }
  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Non autorisé." });
  }

  // Conservation limitée du journal de sécurité (IP = donnée personnelle) —
  // un échec de purge ne doit jamais empêcher l'envoi des rappels.
  const journalPurge = await purgerJournalSecurite().catch((err) => {
    log.error("erreur", { categorie: "cron", operation: "purge_journal_securite", message: messageErreur(err) });
    return null;
  });

  // Clés d'idempotence expirées (durée de vie 24 h) : même principe, un échec ne bloque pas les rappels.
  const clesPurgees = await purgerClesIdempotence().catch((err) => {
    log.error("erreur", { categorie: "cron", operation: "purge_cles_idempotence", message: messageErreur(err) });
    return null;
  });

  const origin = origineApplication(req);
  const ateliers = await prisma.atelier.findMany({
    where: { actif: true },
    select: {
      id: true,
      users: { where: { email: { not: null } }, select: { email: true, prenom: true } },
    },
  });

  let emailsEnvoyes = 0;
  const erreurs = [];

  for (const atelier of ateliers) {
    if (atelier.users.length === 0) continue;

    await reconcilierNotifications(prisma, atelier.id);

    const comptes = await prisma.notification.groupBy({
      by: ["type"],
      where: { lu: false, commande: { atelierId: atelier.id } },
      _count: true,
    });
    const total = comptes.reduce((acc, c) => acc + c._count, 0);
    if (total === 0) continue;

    const lignes = Object.entries(LIBELLES).map(([type, label]) => ({
      label,
      nombre: comptes.find((c) => c.type === type)?._count ?? 0,
    }));

    for (const user of atelier.users) {
      try {
        await envoyerEmail({
          to: user.email,
          subject: "Gestion d'Atelier — vos rappels du jour",
          html: rappelsQuotidiensTemplate({ prenom: user.prenom, lignes, lienNotifications: `${origin}/notifications` }),
        });
        emailsEnvoyes += 1;
      } catch (err) {
        erreurs.push({ atelierId: atelier.id, email: user.email, message: err.message });
      }
    }
  }

  // Rappels d'abonnement (fin d'essai, échéance) : un échec ici ne doit pas masquer le reste du compte rendu.
  const rappelsAbonnement = await envoyerRappelsAbonnement({ prisma, envoyer: envoyerEmail, origine: origin }).catch((err) => {
    log.error("erreur", { categorie: "cron", operation: "rappels_abonnement", message: messageErreur(err) });
    return null;
  });

  res.json({
    ateliersTraites: ateliers.length,
    emailsEnvoyes,
    erreurs,
    journalSecuritePurge: journalPurge,
    clesIdempotencePurgees: clesPurgees,
    rappelsAbonnement,
  });
});

export default router;
