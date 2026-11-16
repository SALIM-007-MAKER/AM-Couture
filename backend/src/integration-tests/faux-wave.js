// Faux serveur Wave pour les tests : implémente, d'après docs.wave.com (Checkout), la création de session, sa
// relecture et le remboursement. Il n'existe QUE dans les tests ; l'application n'a aucun mode simulé. Il permet de
// provoquer les cas qu'on ne peut pas obtenir de l'API réelle à la demande : pannes, paiement d'un autre montant,
// session expirée.
import http from "node:http";
import { once } from "node:events";

export const CLE_API = "wave_sn_prod_cle_de_test";

export async function demarrerFauxWave() {
  const sessions = new Map();
  const appels = [];
  const pannes = { creation: false, lecture: false, remboursement: false };
  let compteur = 0;

  const serveur = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const corps = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    const chemin = new URL(req.url, "http://x").pathname;
    appels.push({ methode: req.method, chemin, autorisation: req.headers.authorization, corps });
    const repondre = (status, objet) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(objet === undefined ? "" : JSON.stringify(objet));
    };

    if (req.headers.authorization !== `Bearer ${CLE_API}`) return repondre(401, { message: "Clé API invalide." });

    if (req.method === "POST" && chemin === "/v1/checkout/sessions") {
      if (pannes.creation) return repondre(500, { message: "Panne simulée." });
      for (const champ of ["amount", "currency", "client_reference", "success_url", "error_url"]) {
        if (!corps?.[champ]) return repondre(400, { message: `Champ manquant : ${champ}` });
      }
      if (!corps.success_url.startsWith("https://")) return repondre(400, { message: "success_url doit être en https." });
      compteur += 1;
      const session = {
        id: `cos-${compteur}`,
        amount: corps.amount,
        currency: corps.currency,
        client_reference: corps.client_reference,
        checkout_status: "open",
        payment_status: "processing",
        wave_launch_url: `https://pay.wave.com/c/cos-${compteur}`,
        refunded: false,
      };
      sessions.set(session.id, session);
      return repondre(200, session);
    }

    const m = chemin.match(/^\/v1\/checkout\/sessions\/([^/]+)(\/refund)?$/);
    if (m) {
      const session = sessions.get(decodeURIComponent(m[1]));
      if (!session) return repondre(404, { message: "Session introuvable." });
      if (req.method === "GET" && !m[2]) {
        if (pannes.lecture) return repondre(500, { message: "Panne simulée." });
        return repondre(200, session);
      }
      if (req.method === "POST" && m[2]) {
        if (pannes.remboursement) return repondre(500, { message: "Panne simulée." });
        if (session.payment_status !== "succeeded") return repondre(400, { message: "checkout-refund-failed" });
        session.refunded = true; // idempotent : un second appel renvoie aussi 200
        return repondre(200);
      }
    }
    return repondre(404, { message: "Route inconnue." });
  });
  serveur.listen(0, "127.0.0.1");
  await once(serveur, "listening");
  const url = `http://127.0.0.1:${serveur.address().port}/v1`;

  return {
    url,
    sessions,
    appels,
    pannes,
    /** Le payeur a payé (éventuellement un autre montant). */
    payer(id, { montant } = {}) {
      const s = sessions.get(id);
      s.checkout_status = "complete";
      s.payment_status = "succeeded";
      if (montant !== undefined) s.amount = String(montant);
    },
    expirer(id) {
      const s = sessions.get(id);
      s.checkout_status = "expired";
      s.payment_status = "cancelled";
    },
    derniereSession: () => [...sessions.values()].at(-1),
    arreter: () => new Promise((resolve) => serveur.close(resolve)),
  };
}
