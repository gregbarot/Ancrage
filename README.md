# Ancrage 2 — comptes privés et carnet synchronisé

Version préparée le 9 septembre 2026 pour `https://lejokernoir.fr/ancrage/`.

Cette livraison contient le code, le schéma MySQL et les tests. Elle n’a pas été déployée sur o2switch. Commencer par une installation avec des données fictives. Lire aussi [la note sur les données personnelles](docs/STOCKAGE_ET_DONNEES.md), notamment le point HDS encore à qualifier.

Le projet est préparé pour Git sur la branche `main`. Voir [le guide Git et GitHub](docs/GIT.md) pour envoyer le premier commit et suivre les prochaines modifications.

## Ce que cette version apporte

- Création d’un compte sur invitation, avec identifiant, prénom ou pseudo et mot de passe. Aucun email utilisateur n’est collecté.
- Profil, photo, tags, journées, fiches, inquiétudes et repères synchronisés dans un carnet privé.
- Consentement explicite pour la synchronisation des informations sensibles ; variante locale sans compte.
- Connexion sur un autre appareil, changement du mot de passe et récupération par un code personnel.
- Export du carnet, export des données du compte et suppression du compte.
- Import volontaire de l’ancien carnet local ou d’une sauvegarde JSON.
- État d’enregistrement visible et détection des conflits entre appareils.
- Services JavaScript séparés, export PDF isolé, PHP organisé en classes et validation côté serveur.
- Formulaire réel pour la journée, boutons typés, accès direct au contenu, dialogues nommés et focus après navigation.

Les inscriptions sur invitation et la limite aux personnes majeures constituent le périmètre retenu pour cette première version destinée aux proches. Il faudra revoir ce périmètre avant une ouverture au public ou un usage avec des mineurs.

## Organisation de la livraison

| Dossier | Destination |
|---|---|
| `public/ancrage/` | Dossier `ancrage` dans la racine web de `lejokernoir.fr` |
| `ancrage-private/` | Dossier privé du compte d’hébergement, **hors de toute racine web** |
| `database/schema.sql` | À importer dans la base MySQL via phpMyAdmin |
| `docs/` | Documentation à conserver hors du site public |
| `tests/` et `package.json` | Vérifications de développement, à conserver hors du site public |

**Ne pas extraire toute l’archive dans le dossier public.** Seul le contenu de `public/ancrage` y va. Ne pas écraser un `.htaccess` existant sans rapprocher ses règles de celles livrées.

## 1. Préparer l’hébergement

Utiliser PHP 8.3, avec `pdo_mysql`, `mbstring`, `ctype` et `sodium`. Le serveur doit pouvoir conserver ses sessions PHP. Le certificat HTTPS de `lejokernoir.fr` doit être valide.

Dans cPanel, créer la base proposée `ancrage_bdd` et un utilisateur MySQL dédié. cPanel peut ajouter un préfixe : recopier le **nom complet réellement affiché**. Importer `database/schema.sql` dans cette base. L’application utilise ensuite les droits `SELECT`, `INSERT`, `UPDATE` et `DELETE` ; les opérations de création de tables sont faites lors de l’installation.

Le schéma ne supprime aucune table et ne crée pas la base à la place de cPanel. Ne pas importer `schema.test.sql` : il est réservé aux tests SQLite.

## 2. Placer les fichiers privés

Exemple d’organisation à adapter au chemin réel du compte :

| Chemin d’exemple | Contenu |
|---|---|
| `/home/TON_COMPTE/lejokernoir.fr/ancrage/` | Fichiers publics |
| `/home/TON_COMPTE/ancrage-private/` | Classes PHP, commandes et configuration |

La racine du domaine peut porter un autre nom. La trouver dans cPanel, rubrique Domaines configurés. Vérifier que le dossier privé n’est pas exposé par **un autre domaine** du même compte.

Dans `public/ancrage/api/index.php`, la variable `$privateDirectory` calcule le chemin privé par défaut. Si la disposition est différente, remplacer cette expression par le chemin absolu réel. Ce fichier public contient seulement le chemin ; jamais les identifiants MySQL ni la clé de chiffrement.

## 3. Configurer l’application

Copier `ancrage-private/config.example.php` en `ancrage-private/config.php`, puis renseigner :

- `dsn`, `db_user` et `db_password` avec les valeurs de cPanel ;
- `origin` : `https://lejokernoir.fr`, sans barre finale ;
- `base_path` : `/ancrage` ;
- `owner_name` et `privacy_contact` : responsable réel et adresse de contact pour les données ;
- `backup_retention_days` : durée confirmée pour toutes les sauvegardes contenant les données, y compris les sauvegardes automatiques de l’hébergeur ;
- `inactive_days` : durée d’inactivité choisie. La proposition de 730 jours est un choix de produit à valider, **pas une durée imposée par la loi**.

Le service reste indisponible si la configuration est incomplète. Le mode local reste proposé.

Depuis le terminal cPanel, se placer dans `ancrage-private`, vérifier que `php -v` correspond à PHP 8.3, puis générer une clé :

```bash
php bin/console.php key
```

Copier la valeur dans `encryption_key`. Restreindre les permissions du dossier privé et de `config.php` au compte d’hébergement, selon les permissions compatibles avec son exécution PHP. Conserver une copie protégée de cette clé, distincte de la sauvegarde de la base.

**Ne pas remplacer cette clé après avoir enregistré des carnets** : ils ne seraient plus déchiffrables. Une rotation exige une migration dédiée. Le code livré ne met pas en place cette migration.

Vérifier la configuration :

```bash
php bin/console.php check
```

Cette commande vérifie la configuration technique, la connexion et les tables ; elle ne valide pas la conformité juridique de l’hébergement.

## 4. Installer l’interface

Transférer le contenu de `public/ancrage/` dans le dossier `ancrage` du domaine. Le `.htaccess` fourni :

- déclare les modules `.mjs` comme JavaScript ;
- redirige vers le domaine canonique HTTPS `lejokernoir.fr` ;
- désactive la liste des fichiers et ajoute les en-têtes de protection.

Si l’adresse change, adapter à la fois le `.htaccess` et la configuration privée. Conserver la version précédente hors du dossier public pour pouvoir revenir en arrière. Une exportation JSON de l’ancien carnet permet de conserver les données avant la migration.

## 5. Créer les premiers comptes et transférer les données

Créer une invitation dans le terminal :

```bash
php bin/console.php invite
```

Chaque code permet une inscription pendant sept jours et une seule fois. On peut générer plusieurs invitations, par exemple avec `php bin/console.php invite 3`. La commande affiche les codes ; elle ne contacte personne.

Ouvrir le site, choisir « Créer un compte », puis conserver le code de récupération remis à la fin. Ce code remplace une procédure par email. Un changement du mot de passe génère un nouveau code et invalide l’ancien.

Pour reprendre le carnet précédent, aller dans **Mon profil → Transférer mon ancien carnet** ou restaurer une sauvegarde JSON. L’import n’est jamais automatique : le navigateur peut contenir le carnet d’une autre personne. Un import confirmé remplace le carnet du compte ; exporter d’abord toute version à conserver.

Le stockage local distingue HTTP et HTTPS ainsi que les navigateurs. Si le carnet ancien n’apparaît pas, retrouver le navigateur et l’adresse utilisés précédemment pour en exporter les données.

## 6. Exploitation et conservation

Planifier quotidiennement dans les tâches cron du compte, avec le chemin PHP adapté à l’hébergement :

```bash
php /home/TON_COMPTE/ancrage-private/bin/console.php maintenance --apply
```

La commande supprime les comptes dépassant la durée d’inactivité choisie, leurs carnets, les invitations expirées et les compteurs anti-abus expirés. Sans `--apply`, elle affiche seulement le nombre de comptes concernés.

Les suppressions dans la base active sont immédiates. Les copies de sauvegarde nécessitent une procédure distincte : définir leur expiration, limiter leur accès et tenir un suivi des suppressions pour éviter de réactiver des comptes effacés après une restauration. Cette coordination avec les sauvegardes o2switch n’est pas automatisée par l’application.

Le texte d’information fourni dans `modules/privacy.mjs` est une base liée au fonctionnement livré. Le compléter avec les conditions réelles de l’hébergement et des intervenants, les éventuels transferts et les modalités de contact. Conserver les versions de cette information et mettre à jour sa référence dans `Api::POLICY` si son contenu change. Un changement de finalité peut aussi nécessiter de recueillir un nouvel accord, ce que cette version ne gère pas automatiquement.

## Limites à connaître

- Le chiffrement est réalisé côté serveur : le responsable disposant de la clé peut techniquement déchiffrer les carnets. Il ne s’agit pas d’un coffre à chiffrement de bout en bout.
- Le compte complet est enregistré comme un document chiffré, avec une limite de 4 Mo. Cette organisation est pensée pour un petit cercle, sans recherche ni statistiques entre utilisateurs.
- La connexion nécessite Internet. Les modifications non envoyées restent en mémoire dans la page et peuvent être perdues si le navigateur est fermé ou arrêté. Un bouton permet d’exporter la copie en attente.
- En cas de conflit entre appareils, aucune fusion silencieuse n’est faite. Exporter la copie en attente, recharger celle du compte, puis choisir les données à garder.
- La synchronisation recharge les données à la connexion ou à l’actualisation. Ce n’est pas de l’édition collaborative en temps réel.
- Il n’y a pas de MFA ni d’interface d’administration permettant de lire les carnets. L’absence de MFA devra être réévaluée avant d’élargir le service.
- L’interface et les en-têtes Apache restent à vérifier sur l’hébergement final. Les tests de l’API ont utilisé SQLite et non le serveur MySQL d’o2switch.

## Vérifications reproductibles

Sans dépendance JavaScript à installer :

```bash
npm test
python3 tests/backend_test.py
```

Le second test utilise PHP 8.3 avec `pdo_sqlite`, `mbstring`, `ctype` et `sodium`, dans une base et une configuration temporaires. Pour préciser un exécutable PHP, définir `ANCRAGE_PHP_BIN`. Aucun compte réel ni service o2switch n’est utilisé.

La validation effectuée comprend 10 tests JavaScript, 31 contrôles HTTP, la syntaxe PHP et JavaScript, ainsi que les références de fichiers. Voir [le compte rendu de validation](docs/VALIDATION.md).
