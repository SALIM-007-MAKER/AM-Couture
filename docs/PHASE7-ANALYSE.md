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

## 7. Réalisé en 7.1 — stockage d'images et lookbook

**Fonctionnement** : le lookbook est la fiche **Modèle** étendue (pas de module en double). Section « Lookbook » de la fiche : jusqu'à 8 photos par modèle (la première est la couverture), ajout depuis l'appareil (redimensionné côté navigateur, 2 Mo au plus côté serveur), réordonnancement, suppression, tags (12 au plus), bouton **Publier / Retirer**. Rien n'est publié par défaut ; publier exige au moins une photo ; retirer la dernière photo, ou archiver le modèle, le dépublie. « Publié » ne rend encore **rien public** : la diffusion arrive avec la vitrine (7.2).

**Stockage derrière une interface** (`lib/stockageImages.js`, décision du 16/11) : `enregistrer`, `lire`, `supprimer`, toujours bornés à l'atelier. L'adaptateur fourni est la **base de données** (table `ImageAtelier`, octets réels, plus de base64 en texte). L'**adaptateur objet (S3, R2, Vercel Blob) n'est pas écrit** : aucun compte ni clé disponibles pour le vérifier ; le brancher ne demande que d'implémenter ces trois fonctions et de changer `stockage`. Photo historique `Modele.photoUrl` (base64) conservée telle quelle ; pas de migration automatique des anciennes images.

**Sécurité** : le fichier doit être une vraie image (octets magiques vérifiés, pas seulement l'en-tête déclaré), jamais une URL externe ; route `GET /api/images/:id` réservée aux membres de l'atelier avec `modeles.lire`, 404 pour l'image d'un autre atelier, `X-Content-Type-Options: nosniff`, cache privé. Verrou de ligne sur le modèle : 12 ajouts simultanés donnent 8 photos aux positions distinctes et aucune image orpheline.

**Base de données** (migration additive `20261126090000_lookbook`) : `Modele.publie`, `Modele.tags` ; tables `ImageAtelier` et `PhotoModele`. Retour arrière : supprimer les deux tables et les deux colonnes.

**API** : 4 routes ajoutées (185 documentées) + `publie` et `tags` sur `PATCH /api/modeles/:id`.

**Tests** : 10 d'intégration (publication refusée sans photo, octets exacts servis avec le bon type, faux fichier / trop lourd / URL externe refusés, limite de 8 sous concurrence, ordre, tags normalisés, dépublication automatique, archivage, isolation, droits) ; 2 mutations détectées (image lue sans filtre d'atelier, limite de photos) ; 4 E2E (photos réelles, couverture, ordre, tags, publication, retrait). Suites complètes : 333 unitaires backend, 374 intégration, 97 frontend, 59 E2E.

**Limites** : les octets sont dans PostgreSQL tant qu'un adaptateur objet n'est pas branché (peu coûteux pour des galeries de 8 photos redimensionnées, à surveiller au-delà de quelques centaines d'ateliers actifs) ; pas de miniatures serveur (le navigateur réduit avant l'envoi) ; pas de légende modifiable dans l'interface (l'API l'accepte à l'ajout).

## 8. Réalisé en 7.2 — vitrine publique

**Fonctionnement** : chaque atelier peut ouvrir une page publique `/a/<identifiant>` (sans compte, adaptée au mobile) : bandeau à la couleur de l'atelier, logo, slogan, présentation, coordonnées **si le PDG les montre**, catalogue des modèles **publiés** du lookbook (recherche, catégorie, tags, pagination, fiche avec toutes les photos), bouton WhatsApp « Demander ce modèle » (lien `wa.me` pré-rempli, sans API payante). Réglages dans **Vitrine** (PDG seulement, non délégable) : activer, identifiant, présentation, couleur, coordonnées visibles, lien à copier.

**Intérêt commercial** : une adresse à mettre en bio WhatsApp/Instagram, qui remplace l'envoi de photos une à une ; point d'entrée de la 7.3 (demandes en ligne).

**Vie privée et sécurité (le point central)**
- **Rien n'est public sans geste explicite** : vitrine désactivée par défaut, modèles non publiés par défaut, coordonnées masquées par défaut.
- **Liste blanche stricte** : les réponses publiques sont construites champ par champ ; un test fixe l'ensemble **exact** des clés (ajouter une clé le fait échouer) et vérifie qu'aucune donnée privée ne sort (clientes, commandes, prix de vente ou indicatif, stock, fournisseurs, dépenses, identifiants d'atelier, modèles non publiés ou archivés). **Aucun prix n'est montré** : décision par défaut, à rouvrir si les ateliers veulent afficher un « à partir de ».
- **Pas d'énumération** : vitrine désactivée, atelier suspendu ou adresse inconnue donnent exactement la même réponse 404.
- **Images** : une photo n'est servie que si elle appartient à un modèle publié, non archivé, d'une vitrine active, et seulement via l'adresse de **cette** vitrine ; l'URL privée `/api/images/:id` reste fermée aux visiteurs. Dépublier ou désactiver coupe l'accès immédiatement (cache public court : 60 s pour le catalogue, 5 min pour les images).
- **Abus** : 120 requêtes par minute et par IP sur le catalogue (429 au-delà, limiteur persistant existant).
- **Identifiant** : 3 à 40 caractères minuscules, chiffres, tirets ; mots réservés refusés ; unique sur toute la plateforme (comparé sans casse).
- **Couleur de marque** : `#RRGGBB` uniquement, refusée si un texte blanc n'y est pas lisible (contraste WCAG AA ≥ 4,5 calculé côté serveur) ; jamais de CSS libre.

**Base de données** (migration additive `20261127090000_vitrine`) : `Atelier.slug` (unique), `vitrineActive`, `vitrineDescription`, `couleurPrincipale`, `vitrineContact`. Retour arrière : supprimer les cinq colonnes.

**API** : 5 routes (`/api/vitrine` ×2, `/api/public/vitrines/:slug` ×3), 190 routes documentées.

**Tests** : 3 unitaires (contraste) ; 18 d'intégration (réglages réservés au PDG même face à un employé tout-puissant, validations, unicité, même 404, **liste blanche exacte des clés**, recherche de 20 chaînes privées dans la réponse, coordonnées, filtres, images, dépublication immédiate, atelier suspendu, isolation, limiteur) ; 4 mutations détectées (archivés exposés, coordonnées toujours montrées, photo non publiée servie, clé supplémentaire exposée) ; 4 E2E (réglage avec couleur refusée puis acceptée, visiteur sans compte, brouillon et prix absents, image réellement affichée, vitrine fermée). Suites complètes : 336 unitaires backend, 392 intégration, 97 frontend, 63 E2E. Un test E2E instable a été corrigé (message de succès perdu au remontage du formulaire) puis exécuté 4 fois de suite sans échec.

**Limites**
- **Aperçu de lien (Open Graph) non personnalisé** : l'application est une page unique ; les aperçus WhatsApp/Facebook d'un lien de vitrine montrent le titre générique. Le corriger demande une route serveur qui injecte les balises dans la page (réécriture Vercel à vérifier en déploiement, non testable ici).
- Pas de nom de domaine personnalisé par atelier, pas de statistiques de visites, pas de prix affichés, pas de référencement garanti (pas de plan de site).
- Modifier l'identifiant invalide l'ancien lien.

## 9. Réalisé en 7.3 — demandes de commande en ligne (sans compte)

**Fonctionnement** : si le PDG coche « Recevoir des demandes de commande en ligne » (désactivé par défaut, exige la vitrine active), la vitrine affiche « Faire une demande de commande » et, sur chaque modèle, « Demander ce modèle ». Le visiteur renseigne prénom, nom, téléphone et un message facultatif, et **coche un consentement explicite** (jamais pré-coché). L'atelier retrouve la demande dans **Demandes** (déjà comptée dans la cloche), crée en un clic la **fiche cliente** à partir des coordonnées (ou retrouve la fiche portant le même numéro), puis suit le circuit habituel : création de la commande, acceptation ou refus. **Aucune commande ni fiche cliente n'est créée automatiquement**, aucun paiement n'est demandé en ligne (prix, mesures et délais se conviennent avec l'atelier).

**Intérêt commercial** : transforme la vitrine en canal d'acquisition de clientes, sans compte à créer pour la visiteuse ; la demande arrive déjà structurée (modèle souhaité, téléphone, message) au lieu d'une conversation WhatsApp à reconstituer.

**Protection des données personnelles**
- **Minimisation** : seulement prénom, nom, téléphone, message et modèle. Pas de courriel, pas d'adresse, pas de pièce jointe.
- **Consentement** : valeur exactement `true` exigée côté serveur (la chaîne `"true"`, `1` ou l'absence sont refusés) et **horodatée**. Le texte affiché indique la finalité et la durée de conservation.
- **Réponse muette** : le visiteur reçoit `{ ok: true }` sans identifiant ; un doublon détecté ou un piège à robots déclenché ne se distinguent pas d'un succès (aucune information exploitable).
- **Conservation limitée** (`lib/demandesPubliques.js`, exécutée par la tâche quotidienne) : coordonnées **effacées de la demande dès son rattachement à une fiche cliente** (elles vivent alors sur la fiche) ; demande refusée jamais rattachée : purgée après **30 jours** ; demande restée en attente sans suite : après **90 jours**. Les demandes de l'espace client et celles qui ont une fiche ne sont jamais purgées.
- **Isolation** : une demande n'est visible que de l'atelier destinataire (404 pour un autre) ; un modèle non publié, archivé ou d'un autre atelier est refusé.
- **Garde-fou en base** : un `CHECK` interdit une demande sans fiche cliente qui n'aurait pas aussi nom, prénom, téléphone **et consentement**.

**Anti-abus** : 5 envois par heure et par IP (429) ; piège à robots (champ hors écran, ignoré sans erreur s'il est rempli) ; pas de doublon pour la même personne et le même modèle en attente (y compris sous envois simultanés) ; 3 demandes par numéro et par jour ; 50 demandes en attente par atelier au plus ; champs bornés et schéma strict (prix, statut, atelier ou fiche refusés).

**Base de données** (migration additive `20261128090000_demandes_vitrine`) : `DemandeCommande.clienteId` devient facultatif ; colonnes `origine`, `contactPrenom`, `contactNom`, `contactTelephone`, `consentementLe` ; `Atelier.demandesEnLigne`. Retour arrière : supprimer les demandes de la vitrine non rattachées, remettre `clienteId` obligatoire, supprimer les colonnes et la contrainte.

**API** : 2 routes (`POST /api/public/vitrines/:slug/demandes`, `POST /api/demandes/:id/cliente`), 192 routes documentées.

**Tests** : 17 d'intégration (activation, 404 identique, consentement et validations sur 17 corps invalides, piège à robots, doublons y compris simultanés, plafonds, limiteur par IP, apparition chez l'atelier et dans la cloche, accepter refusé avant la fiche, droits, isolation, rattachement avec effacement des coordonnées, réutilisation d'une fiche existante, fiche archivée, refus sans notification, purge ciblée, CHECK en base) ; **6 mutations détectées** (piège à robots, modèle non publié accepté, coordonnées non effacées, purge de demandes rattachées, consentement faible, doublons) ; 4 E2E (visiteur sans compte, consentement bloquant l'envoi, erreur de numéro affichée sans écran d'erreur, atelier crée la fiche, vitrine refermée). Suites complètes : 336 unitaires backend, 409 intégration, 97 frontend, 67 E2E.

**Limites**
- Aucune notification externe à l'atelier (courriel, push) à l'arrivée d'une demande : elle apparaît dans la cloche et la page Demandes ; un courriel au PDG est possible (Resend existe) mais n'a pas été ajouté pour ne pas multiplier les envois.
- Pas de réponse automatique au visiteur (pas de courriel collecté) : l'atelier le rappelle par téléphone ou WhatsApp.
- Le visiteur n'a aucun accès à sa demande après l'envoi ; pas de suivi en ligne tant qu'il n'a pas de compte (espace client).
- La demande de **suppression anticipée** par le visiteur passe par l'atelier (le refus ou la suppression de la fiche) : pas de procédure en libre-service.
