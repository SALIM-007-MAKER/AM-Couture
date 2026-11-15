-- Jeu de données volumétrique pour la mesure de performance (base locale JETABLE uniquement).
-- Un gros atelier (perf-gros) + 40 petits ateliers, pour que les index soient réellement sélectifs.
-- Volumes du gros atelier : 5 000 clientes, 40 000 commandes, ~80 000 paiements, 10 000 dépenses, 1 000 articles.
-- Données déterministes (aucun aléa) : deux exécutions donnent le même résultat.

TRUNCATE "Atelier", "User", "Counter" RESTART IDENTITY CASCADE;

-- Ateliers : g0 = gros, p1..p40 = petits.
INSERT INTO "Atelier"(id, nom, "updatedAt") VALUES ('perf-gros', 'Perf Gros', now());
INSERT INTO "Atelier"(id, nom, "updatedAt") SELECT 'perf-p' || g, 'Perf Petit ' || g, now() FROM generate_series(1, 40) g;

-- Compte PDG du gros atelier. Hash bcrypt (coût 4) du mot de passe « Passe-perf-123 » fourni par le script de mesure.
-- (inséré par mesure.mjs, qui connaît le hash)

-- Clientes : 5 000 (gros) + 40 × 100 (petits).
INSERT INTO "Cliente"(id, "atelierId", nom, prenom, telephone, "updatedAt")
SELECT 'cl-g-' || g, 'perf-gros', 'Nom' || (g % 700), 'Prenom' || g, lpad((10000000 + g)::text, 8, '0'), now()
FROM generate_series(1, 5000) g;
INSERT INTO "Cliente"(id, "atelierId", nom, prenom, telephone, "updatedAt")
SELECT 'cl-p' || p || '-' || g, 'perf-p' || p, 'Nom' || g, 'Prenom' || g, lpad((20000000 + p * 1000 + g)::text, 8, '0'), now()
FROM generate_series(1, 40) p, generate_series(1, 100) g;

-- Mesures : une par cliente.
INSERT INTO "Mesure"(id, "clienteId", taille) SELECT 'me-' || id, id, 70 FROM "Cliente";

-- Commandes : 40 000 (gros), répartition de statuts réaliste (la majorité livrées), dates étalées sur 3 ans.
INSERT INTO "Commande"(id, "atelierId", numero, "clienteId", "typeVetement", quantite, "prixTotal", statut, "dateCommande", "dateLivraisonPrevue", "updatedAt")
SELECT 'cm-g-' || g, 'perf-gros', 'PERF-G-' || lpad(g::text, 6, '0'), 'cl-g-' || (1 + g % 5000),
       (ARRAY['ROBE','BOUBOU','ENSEMBLE','PANTALON','CHEMISE','JUPE','KAFTAN','COSTUME','AUTRE'])[1 + g % 9]::"CategorieVetement",
       1, 10000 + (g % 50) * 1000,
       (CASE WHEN g % 100 < 70 THEN 'LIVREE' WHEN g % 100 < 75 THEN 'TERMINEE' WHEN g % 100 < 78 THEN 'ANNULEE'
             WHEN g % 100 < 85 THEN 'NOUVELLE' WHEN g % 100 < 92 THEN 'EN_CONFECTION' ELSE 'RETOUCHES' END)::"StatutCommande",
       now() - ((40000 - g) * 0.027 || ' days')::interval,
       now() - ((40000 - g) * 0.027 || ' days')::interval + interval '14 days',
       now()
FROM generate_series(1, 40000) g;
INSERT INTO "Commande"(id, "atelierId", numero, "clienteId", "typeVetement", quantite, "prixTotal", statut, "dateCommande", "dateLivraisonPrevue", "updatedAt")
SELECT 'cm-p' || p || '-' || g, 'perf-p' || p, 'PERF-P' || p || '-' || lpad(g::text, 4, '0'), 'cl-p' || p || '-' || (1 + g % 100),
       'ROBE', 1, 15000, 'NOUVELLE', now() - (g || ' days')::interval, now() + interval '7 days', now()
FROM generate_series(1, 40) p, generate_series(1, 200) g;

-- Paiements : ~2 par commande du gros atelier ; les 3 % de commandes de g%33=0 restent SANS paiement (impayées).
INSERT INTO "Paiement"(id, "commandeId", montant, date, mode)
SELECT 'pa-' || c.id || '-' || n, c.id, c."prixTotal" / 2, c."dateCommande", 'ESPECES'
FROM "Commande" c, generate_series(1, 2) n
WHERE c."atelierId" = 'perf-gros' AND c.statut <> 'ANNULEE' AND split_part(c.id, '-', 3)::int % 33 <> 0;
INSERT INTO "Paiement"(id, "commandeId", montant, date, mode)
SELECT 'pa-' || id, id, 5000, "dateCommande", 'ESPECES' FROM "Commande" WHERE "atelierId" <> 'perf-gros';

-- Livraisons des commandes livrées (gros atelier).
INSERT INTO "Livraison"(id, "commandeId", "dateLivraison", "montantRestant", "createdAt")
SELECT 'li-' || id, id, "dateLivraisonPrevue", 0, "dateLivraisonPrevue" FROM "Commande" WHERE "atelierId" = 'perf-gros' AND statut = 'LIVREE';

-- Dépenses : 10 000 (gros).
INSERT INTO "Depense"(id, "atelierId", categorie, montant, date)
SELECT 'de-' || g, 'perf-gros', (ARRAY['Tissu','Loyer','Fournitures','Transport'])[1 + g % 4], 2000 + (g % 20) * 500, now() - ((10000 - g) * 0.1 || ' days')::interval
FROM generate_series(1, 10000) g;

ANALYZE;
