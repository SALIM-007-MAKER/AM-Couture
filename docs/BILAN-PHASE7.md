# Bilan de la phase 7 — Vitrine, expérience client et usage hors connexion

Mesures du 16 novembre 2026, relevées en exécutant les commandes indiquées, en local (Windows, Postgres 17 dans Docker). **Rien n'a été exécuté sur GitHub, Vercel, Neon, Wave ni Resend.** Documents liés : [PHASE7-ANALYSE.md](PHASE7-ANALYSE.md) (analyse, décisions, détail par sous-phase §7 à §14), [PERFORMANCES.md](PERFORMANCES.md) §6, [API.md](API.md), [TESTS.md](TESTS.md).

## 1. Synthèse

| | |
|---|---|
| Ce qui fonctionne | lookbook à plusieurs photos, vitrine publique par atelier, demandes en ligne sans compte (avec consentement), suivi d'étapes et droits d'accès/effacement pour la cliente, consultation hors connexion, trois écritures hors connexion sûres avec rejeu sans doublon, textes du serveur en français et anglais |
| Ce qui est préparé mais **inactif ou absent** | stockage objet des images (seul l'adaptateur « base de données » existe) ; flux iCal (non fait) ; 3ᵉ langue (aucune traduction) |
| Ce qui **ne peut pas** être vérifié ici | comportement sur de vrais iPhone/Android (stockage, purge, service worker), qualité de l'anglais, valeur juridique des durées de conservation |
| Tests de la suite | **996** : 344 unitaires backend, 124 frontend, 7 déploiement, 441 d'intégration (dont 1 `TODO` volontaire), 80 de bout en bout. Dernière exécution : 995 réussis, 0 échec, 1 `TODO` |
| Migrations | 5 nouvelles (`lookbook`, `vitrine`, `demandes_vitrine`, `droit_effacement`, `messages_multilingues`), **toutes additives** |
| Routes documentées | 195 (vérifiées par test contre le code) |
| Lint, audit des dépendances d'exécution | 0 erreur (avertissements préexistants), 0 vulnérabilité |

## 2. Les 10 points de la mission

| # | Point | État | Remarque |
|---|---|---|---|
| 1 | Lookbook | **Fait** | Plusieurs photos par modèle, ordre, légendes, tags, publication explicite (faux par défaut) |
| 2 | Vitrine publique | **Fait** | `/a/<slug>`, désactivée par défaut, liste blanche stricte de champs (test qui échoue si une clé non prévue sort), couleur de marque à contraste vérifié. **Aperçu de lien (Open Graph) non personnalisé** : le partage WhatsApp montre le titre générique (routine serveur non écrite, voir PHASE7-ANALYSE §8) |
| 3 | Commandes en ligne | **Fait (demande, pas paiement)** | Demande sans compte, consentement horodaté, anti-abus, purge, notification au PDG. Pas de paiement en ligne (décision) |
| 4 | Espace client avancé | **Fait** | Suivi d'étapes, export JSON des données, suppression du compte avec mot de passe, anonymisation par le PDG |
| 5 | Multilingue | **Partiel** | FR/EN de bout en bout (interface, fil d'activité, PDF reçu/fiche, 3 courriels). Non traduits : rappels, factures d'abonnement, erreurs API. « ha » accepté mais sans traduction |
| 6 | PWA / hors connexion | **Partiel** | Lecture : fait, testé avec serveur injoignable simulé. **Non testé sur appareils réels.** Démarrage sans réseau : repose sur le service worker, non testable en développement |
| 7 | Synchronisation | **Fait, périmètre volontairement étroit** | 3 écritures (cliente, mesures, avance de statut avec garde), jamais d'argent. Pas de fusion automatique, pas d'envoi en arrière-plan |
| 8 | Intégrations externes | **Documenté seulement** | WhatsApp en liens `wa.me` (existant). API WhatsApp, SMS, paiements mobiles : non faits, dépendent de contrats. **iCal non fait** |
| 9 | Personnalisation | **Partiel** | Couleur principale de la vitrine (contraste vérifié). **Pas appliquée aux PDF ni à l'espace client**, pas d'en-tête/pied personnalisables |
| 10 | Évolutivité | **Partiel** | Mesuré (aucune route lente, pas de N+1), cache HTTP public vérifié. **Stockage objet non écrit** : les photos restent dans PostgreSQL |

## 3. Consignes de la mission

| Consigne | Comment elle est tenue |
|---|---|
| Analyser d'abord l'existant | `PHASE7-ANALYSE.md` §1 à §5, avant tout code |
| Rien de public sans geste explicite | `vitrineActive`, `Modele.publie`, `demandesEnLigne` : faux par défaut ; une vitrine désactivée répond 404 partout, images comprises (testé) |
| Aucune donnée de cliente dans une route publique | Schéma de sortie en liste blanche ; test avec cliente, commande, stock et prix de revient remplis |
| Hors ligne : jamais de paiement | Liste blanche de 3 écritures, chemin vérifié (un paiement ne peut pas se déguiser en mesure) ; test E2E : un paiement hors ligne n'est ni mis en attente ni rejoué |
| Pas de doublon au rejeu | Clé d'idempotence par écriture ; test E2E « réponse perdue » (la requête atteint le serveur, la réponse non) : une seule cliente |
| Données personnelles sur l'appareil | Instantané et file propres à l'utilisateur, effacés à la déconnexion et au 401, expirés après 7 jours, jamais pour une cliente |
| Tester avant d'affirmer | Chaque sous-phase : tests unitaires, intégration, E2E, **mutations** (règle cassée volontairement, le test doit échouer) |
| Migrations sans risque | Additives uniquement, contrôle de dérive du schéma propre |

## 4. Ce qui reste à faire, par priorité

**Avant le déploiement (bloquant)**
1. **Point de restauration Neon**, puis `prisma migrate deploy`. Migrations probablement en attente en production (je ne peux pas le vérifier) : phase 4 (2), phase 5 (4), 6.1, 6.3 à 6.6, 7.1 à 7.4 et 7.7 — soit toutes celles postérieures à `20261114120000_journal_securite` encore absentes de la table `_prisma_migrations` de production.
2. **Protection de la branche** : `ci-ok` comme vérification obligatoire.
3. **Relire l'anglais** (messages serveur, courriels, PDF) par une personne de langue anglaise.

**Décisions à prendre**
4. **Stockage objet des images** : choisir un fournisseur (coût, compte, variables d'environnement). Le code est prêt côté interface (adaptateur) ; l'adaptateur objet est à écrire et à tester contre le vrai service. Tant que ce n'est pas fait, de vraies photos (0,2 à 2 Mo) alourdissent la base et les sauvegardes.
5. **Tarifs et mentions légales** (phase 5, toujours ouvertes).
6. **Durées de conservation** (demandes refusées 30 j / sans suite 90 j, 7 jours d'instantané) : valeurs de départ, **non validées juridiquement**.
7. **iCal des livraisons** : à décider avec un jeton révocable (le lien expose des données de clientes).

**À vérifier en conditions réelles**
8. Hors ligne sur de vrais appareils (iOS : purge du stockage, pas de synchronisation en arrière-plan ; Android) et ouverture sans réseau via le service worker.
9. Aperçus de partage : **à construire** (balises Open Graph injectées côté serveur), puis à vérifier sur WhatsApp.
10. Temps de réponse sur Vercel + Neon (voir PERFORMANCES.md §6).

## 5. Risques connus

- **Sauvegardes** : une sauvegarde antérieure à une anonymisation contient encore l'identité de la cliente. Une demande d'effacement ne purge pas les sauvegardes existantes ; à indiquer dans la politique de confidentialité.
- **Droits non mis à jour hors ligne** : un employé dont le PDG retire une permission garde la lecture des données déjà enregistrées sur son appareil jusqu'à son prochain contact avec le serveur (7 jours au plus). Données non chiffrées dans IndexedDB (le chiffrement sans secret saisi par l'utilisateur n'apporterait qu'une fausse sécurité) : la protection est l'effacement à la déconnexion et le verrouillage de l'appareil.
- **Déconnexion avec des modifications en attente** : elles sont supprimées (le bandeau prévient). Choix de confidentialité sur un appareil partagé.
- **Écritures de plus de 23 h en attente** : marquées « à vérifier », pas rejouées (les clés d'idempotence ne vivent que 24 h).
- **Vitrine** : la recherche texte parcourt les modèles de l'atelier (rapide jusqu'à plusieurs milliers) ; une écriture de limiteur par consultation non cachée.

## 6. Reproduire les mesures

```bash
export TEST_DATABASE_URL=postgresql://test:test@localhost:55432/gestion_atelier_test
npm run test:integration                 # 441 tests, base locale uniquement
npm test                                 # 344 + 124 + 7
export E2E_DATABASE_URL=postgresql://test:test@localhost:55432/gestion_atelier_e2e
npm run test:e2e                         # 80 tests, navigateur réel
# Performances : voir PERFORMANCES.md §1 (réinitialiser avec seed-volume.sql avant chaque mesure)
```
