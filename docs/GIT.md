# Ancrage — Git et GitHub

## État de cette préparation

Ce dépôt reprend la V2 de l’archive `Ancrage_o2switch.zip` livrée le 9 septembre 2026. Le premier commit enregistre cette version, les exclusions Git et ce guide. Il ne reconstitue pas l’historique de développement précédent.

L’archive `Ancrage_Git.zip` inclut le dossier `.git` et son historique. Décompresser le dossier `Ancrage`, puis l’ouvrir dans VS Code ou dans un terminal. Il n’est pas nécessaire de relancer `git init`.

```bash
git status
git log --oneline
```

Ce dépôt local n’a pas encore été envoyé sur GitHub. Aucune installation sur o2switch n’est effectuée par ces commandes.

## Premier envoi sur GitHub

Créer un dépôt GitHub nommé `Ancrage` dans le compte souhaité. Un dépôt privé permet de commencer avec un accès limité. Le laisser vide : ne pas ajouter de README, de licence ou de fichier `.gitignore`, car le projet possède déjà son premier commit.

Depuis le dossier `Ancrage`, remplacer `URL_DU_DEPOT` par l’adresse HTTPS affichée par GitHub :

```bash
git remote add origin URL_DU_DEPOT
git push -u origin main
```

Utiliser le mécanisme de connexion proposé par Git ou GitHub. Ne jamais écrire de jeton d’accès dans les fichiers du projet ni dans l’URL du dépôt.

## Modifications suivantes

Configurer son nom et son adresse de commit si nécessaire. Pour éviter de publier une adresse personnelle, recopier l’adresse de confidentialité proposée dans les paramètres email de son compte GitHub.

Après une modification, vérifier les fichiers avant de les enregistrer :

```bash
git status
git diff
git add README.md
git diff --cached
git commit -m "docs: préciser les instructions d’installation"
git push
```

L’exemple sélectionne seulement `README.md`. Adapter la liste aux fichiers réellement modifiés et choisir un message décrivant le changement.

## Contenu suivi

- Code HTML, CSS, JavaScript et PHP, ainsi que les ressources graphiques de l’application.
- Schémas de tables MySQL et SQLite de test, sans données utilisateurs.
- Modèle `ancrage-private/config.example.php`, documentation et tests.

Le `.gitignore` exclut notamment la configuration réelle `config.php`, les fichiers `.env`, les bases locales, les sauvegardes, les dossiers `exports` et `backups`, les journaux et les archives. Conserver les exports manuels du carnet dans `exports/` ou hors du projet.

Ces règles ne reconnaissent pas tous les secrets possibles. Avant chaque commit, vérifier la sélection avec `git diff --cached`. Ne pas forcer l’ajout d’un fichier de configuration réel. Le fichier `.gitattributes` normalise les fins de ligne des fichiers texte pour le travail entre Windows et Linux.

## Hébergement

GitHub conserve le code et l’historique. L’installation de l’application reste celle décrite dans le README, avec PHP et MySQL sur o2switch. Ne pas transférer le dépôt entier dans le dossier public du site : le dossier `.git`, les tests, la documentation et le code privé doivent rester hors de la racine web.

Source : GitHub, [Ajout de code hébergé localement dans GitHub](https://docs.github.com/fr/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github), documentation consultée le 15 septembre 2026.
