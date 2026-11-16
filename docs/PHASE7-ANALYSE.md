# Phase 7 — Évolution et différenciation : analyse (7.0)

Analyse faite avant tout développement, à partir du code (aucune donnée de production consultée). Pour chaque point : ce qui existe, ce qui manque, l'utilité réelle pour un atelier de couture, les dépendances et coûts, le risque, et une recommandation (faire / faire en version réduite / reporter).

## 1. Existant (vérifié dans le code)

| Sujet | État actuel |
|---|---|
| Modèles | `Modele` : nom, catégorie, description, prix indicatif, **une** photo (data URL base64 stockée en base, 2 Mo max), archivage. Aucun indicateur « publié », aucune galerie |
| Public | **Aucune route publique** ni page publique. Pas d'identifiant public d'atelier (slug). Seule route sans session utile : le nom/logo à l'écran de connexion |
| Commandes en ligne | Une **cliente connectée** (rôle USER, invitée par l'atelier) peut déjà envoyer une `DemandeCommande` (modèle + description) que le PDG accepte (création de la commande, prix et dates fixés par lui) ou refuse (motif). Pas de demande « anonyme » |
| Espace client | `/api/moi` : profil, mesures, commandes (+ détail), paiements, reçus (liste, PDF, émission), notifications (état + événements), demandes |
| Multilingue | Français et anglais complets (parité vérifiée par test), langue enregistrée par compte, repli sur le français. Les textes **côté serveur** (messages d'erreur, PDF, emails, notifications client figées) sont en français |
| PWA | `vite-plugin-pwa` : manifeste, icône unique, précache de l'interface, mise à jour automatique. **Aucune donnée** n'est disponible hors connexion et aucune écriture n'est mise en file |
| Personnalisation | Logo, nom, slogan, téléphone, adresse, ville, pays, devise, configuration des reçus (`recuConfig`). **Pas de couleurs** de marque |
| Paiement | Wave (inactif par défaut, non vérifié en réel) ; paiements manuels ; WhatsApp par lien `wa.me` |
| Échelle | Index par atelier, mesures de la phase 4.6 (pagination partout). **Photos en base64 dans PostgreSQL** et corps de requête limité à 5 Mo : première limite sérieuse à l'échelle |

## 2. Analyse par proposition

### 2.1 Lookbook (catalogue numérique des modèles) — utilité **forte**
Les ateliers montrent déjà leurs créations sur WhatsApp et Instagram ; un catalogue **dans l'outil**, que la cliente consulte pour choisir, évite d'envoyer des photos une à une et alimente directement la commande.
- Existant à étendre, pas à doubler : `Modele` devient le lookbook. Ajouts : plusieurs photos, indicateur « publié », ordre d'affichage, tags (occasion, tissu), « sur mesure uniquement ».
- Dépendance : **stockage des images** (voir §3). Sans stockage objet, des galeries de 5–10 photos en base64 dans la base dégradent les requêtes et les sauvegardes.
- Risque : faible (données de l'atelier, pas de données personnelles).

### 2.2 Vitrine publique — utilité **forte**, c'est le vrai différenciateur
Une page `/a/<slug>` par atelier : présentation, coordonnées, lookbook publié, bouton WhatsApp, bouton « demander ce modèle ».
- Nouveau : un identifiant public (slug) unique par atelier, un réglage « vitrine activée » (désactivée par défaut), des routes publiques **en lecture seule**.
- **Sécurité / vie privée** : aucun champ privé ne doit sortir (jamais de prix de revient, clientes, stock). Liste blanche de champs par un schéma de sortie dédié, test qui échoue si une clé non prévue apparaît (même méthode que le masquage financier de la 6.1). Pas d'énumération des ateliers (pas d'annuaire global). Limiteur de débit par IP. Pas d'indexation par défaut (`noindex`) tant que l'atelier ne l'active pas.
- Rendu : SSR n'est pas disponible (SPA Vite). Pour le partage sur WhatsApp, il faut des **balises Open Graph** : une petite route serveur qui renvoie l'`index.html` avec les balises de l'atelier (sans framework).
- Coût : aucun service payant ; un nom de domaine personnalisé par atelier est hors périmètre (à reporter).

### 2.3 Commandes en ligne — utilité **forte** mais à cadrer
Aujourd'hui la demande exige un compte. Cible : un visiteur de la vitrine envoie une **demande** (nom, téléphone, modèle choisi, description, date souhaitée) sans compte ; le PDG la traite dans la page Demandes existante (acceptation → commande).
- Pas de paiement en ligne à ce stade (prix et mesures se fixent avec l'atelier) : cohérent avec le métier, évite la responsabilité financière.
- **Anti-abus** : limiteur de débit, champ piège, taille bornée, validation du téléphone, pas de pièce jointe. Notification au PDG.
- **Données personnelles** : consentement explicite affiché, finalité unique (traiter la demande), conservation limitée (purge des demandes refusées/sans suite après N jours), jamais de création automatique de compte.
- Réutilise `DemandeCommande` : le `clienteId` devient facultatif (coordonnées du visiteur portées par la demande), à l'acceptation la cliente est rattachée ou créée (dédoublonnage par téléphone, règle existante).

### 2.4 Espace client avancé — utilité **moyenne**
Il couvre déjà commandes, paiements, reçus PDF, mesures, notifications. Manques réels : **suivi visuel** d'une commande (étapes), **facture/reçu consolidé**, **télécharger ses données**, **demander la suppression** de son compte (obligation de protection des données), messages de l'atelier traduits dans la langue de la cliente. À faire en version réduite : suivi d'étapes + export/suppression de données + langue des messages.

### 2.5 Multilingue — utilité **moyenne** (selon le marché)
FR/EN couvrent l'interface. Reste le **serveur** : messages d'erreur, PDF (reçus, fiche), emails, notifications figées. Recommandation : ne pas ajouter de langue avant de traiter ces points ; les rendre dépendants de la langue du destinataire (pas de la requête) pour les documents. Une troisième langue (ex. wolof, haoussa) demande une vraie traduction humaine : reportée.

### 2.6 PWA et hors connexion — utilité **moyenne à forte, risque élevé**
Les ateliers travaillent avec un réseau instable : consulter ses commandes et clientes sans réseau est utile ; saisir hors ligne est utile pour **les opérations simples et sans conflit possible**. Un simple cache de pages est insuffisant (consigne). Étude des opérations :

| Opération | Hors ligne ? | Pourquoi |
|---|---|---|
| Consulter commandes du jour, clientes, mesures, modèles | **Oui (lecture, instantané local)** | Aucun risque, données déjà accessibles à l'utilisateur |
| Créer une cliente / enregistrer des mesures | **Oui, en file** | Création sans conflit ; doublon de téléphone traité à la synchronisation (409 affiché) |
| Faire avancer le statut d'une commande | **Oui, en file, avec garde** | Conflit possible (autre personne a changé le statut) : n'appliquer que si le statut serveur est encore celui vu hors ligne |
| Enregistrer un paiement | **Non au départ** | Opération financière, solde partagé, reçus : un paiement hors ligne non confirmé crée de la confusion avec la cliente. À étudier plus tard, avec clé d'idempotence (déjà disponible) |
| Créer une commande | **Possible plus tard** | Numérotation globale séquentielle serveur : numéro provisoire à gérer |
| Annulations, droits, abonnement, suppressions | **Jamais** | Doivent être validés par le serveur en direct |

Briques existantes réutilisables : en-tête `Idempotency-Key` (rejeu sans doublon), verrous serveur, machine à états de statut. À construire : stockage local chiffré ? (IndexedDB, données personnelles sur l'appareil : effacées à la déconnexion), file d'opérations, rejeu ordonné, **règles de conflit par opération** (ci-dessus), écran « à synchroniser / en échec ». Compatibilité : iOS limite le stockage et la synchronisation en arrière-plan (Background Sync absent) : la synchronisation se fait à l'ouverture de l'application.
- Risque principal : divergence silencieuse. Mesure : aucune écriture hors ligne sans retour visible, jamais de rejeu automatique d'une opération financière.

### 2.7 Synchronisation — **fait partie de 2.6**
Pas de projet séparé : une file d'opérations côté client, des routes serveur déjà idempotentes, et des règles de conflit explicites (« le serveur gagne, l'utilisateur est prévenu » par défaut).

### 2.8 Intégrations externes — utilité **faible à moyenne**
- **WhatsApp** (déjà en liens `wa.me`) : suffisant. L'API officielle (WhatsApp Business) est **payante**, soumise à validation de modèles de messages : reportée.
- **Paiement mobile** (Wave déjà codé, inactif ; Orange Money, MTN MoMo selon pays) : dépend de contrats marchands propres à chaque atelier ou à la plateforme ; **non vérifiable sans accès** : à ne pas promettre.
- **SMS / email** : email existant (Resend). SMS payant par message : reporter.
- **Export comptable** (CSV existe) ; **calendrier** (flux iCal des livraisons) : peu coûteux, utile, à envisager.
Recommandation : documenter les possibilités, ne développer que le flux iCal si le temps le permet.

### 2.9 Personnalisation — utilité **moyenne**
Existe (logo, coordonnées, reçu). Ajouts raisonnables : **couleur principale** de l'atelier (vitrine, espace client, PDF), en-tête/pied de page des documents. Garde-fou : contraste lisible vérifié (pas de couleur libre qui rende le texte illisible), valeurs validées (code hexadécimal), jamais de CSS libre.

### 2.10 Évolutivité — utilité **forte, invisible**
1. **Images hors base** : stockage objet (Vercel Blob, Cloudflare R2, S3, Supabase Storage) avec URL signées ; miniatures générées ; migration progressive des data URLs existantes. Dépendance externe **payante à l'usage** (faible).
2. Cache HTTP des routes publiques (vitrine) : `Cache-Control` court + `ETag` ; pas de cache pour les routes privées.
3. Limiteurs de débit déjà persistants en base (OK), vérifier leur coût en lecture publique forte.
4. Mesurer à nouveau (`scripts/perf`) après l'ajout des routes publiques.
5. Pool de connexions Neon et région : déjà documentés (phase 4).

## 3. Décisions d'architecture structurantes

1. **Stockage d'images** : sans lui, lookbook et vitrine ne passent pas à l'échelle. Choix du fournisseur = décision à prendre (coût, compte à créer, variables d'environnement). Je ne peux pas le créer ni le tester contre un vrai service ici : le code sera écrit derrière une interface (adaptateur) avec un adaptateur « base de données » (comportement actuel, pour le développement et les tests) et un adaptateur objet **non vérifié en réel**.
2. **Slug et publication** : `Atelier.slug` unique, `Atelier.vitrineActive` (faux par défaut), `Modele.publie` (faux par défaut) : **rien ne devient public sans geste explicite du PDG**.
3. **Données personnelles** : aucune donnée de cliente dans une route publique ; la demande publique n'est visible que par l'atelier concerné.
4. **Hors ligne** : lecture + 2 écritures sûres d'abord ; le paiement hors ligne n'est pas promis.

## 4. Plan proposé (à valider)

| Sous-phase | Contenu |
|---|---|
| 7.1 | Stockage d'images (adaptateur) et lookbook : plusieurs photos, publication, ordre, tags |
| 7.2 | Vitrine publique : slug, page, réglage d'activation, schéma de sortie en liste blanche, Open Graph, couleur de marque |
| 7.3 | Demandes en ligne sans compte : formulaire public, anti-abus, consentement, rattachement à la cliente, notification au PDG, purge |
| 7.4 | Espace client : suivi d'étapes, export et suppression des données, langue des messages |
| 7.5 | Hors ligne, lecture : instantané local par utilisateur, effacé à la déconnexion, indicateur de connexion |
| 7.6 | Hors ligne, écritures sûres : file, rejeu idempotent, conflits, écran de synchronisation |
| 7.7 | Multilingue serveur (PDF, emails, messages) ; flux iCal des livraisons (si retenu) |
| 7.8 | Évolutivité : mesures, cache des routes publiques ; documentation et bilan |

## 5. Limites de cette analyse
- Lecture du code seulement ; pas de retour d'ateliers réels sur l'usage de la vitrine ni du hors ligne.
- Coûts de stockage et services tiers estimés par ordre de grandeur, à confirmer au choix du fournisseur.
- Hors ligne : comportement iOS/Android à vérifier sur appareils réels (non testable ici avec certitude).

## 6. Décisions du 16/11/2026

Les quatre options recommandées ont été retenues : **adaptateur de stockage d'images** (adaptateur base de données pour le développement et les tests, adaptateur objet à brancher et vérifier avec le fournisseur choisi) ; **hors ligne** = lecture + écritures sûres (jamais de paiement) ; **demandes publiques sans compte** avec consentement ; la phase 6 est mise en pause (6.6 fusionnée, **6.7 rapports et 6.8 bilan restent à faire**) pour avancer sur la phase 7.
