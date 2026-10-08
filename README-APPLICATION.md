# Patch Ancrage — local d’abord + « Se souvenir de moi »

Ce patch modifie le parcours d’Ancrage sans changer la base de données.

## Nouveau comportement

- Sans compte, Ancrage ouvre directement le carnet.
- Le carnet est enregistré automatiquement dans le `localStorage` du navigateur.
- Une phrase indique qu’un compte est nécessaire pour sauvegarder le suivi en ligne et le retrouver sur d’autres appareils.
- Le bouton « Sauvegarder en ligne » ouvre l’écran de connexion / création de compte.
- Lorsqu’un utilisateur crée un compte après avoir commencé un carnet local, ce carnet local devient le carnet initial du compte.
- Une connexion à un compte déjà existant n’écrase pas automatiquement le carnet en ligne avec le carnet local.
- « Se souvenir de moi » maintient la session pendant 30 jours.
- Sans « Se souvenir de moi », la session reste une session classique du navigateur avec les limites serveur existantes.
- « Me déconnecter » reste disponible et ramène au mode local.

## Fichiers à remplacer dans le dépôt

- `public/ancrage/main.js`
- `public/ancrage/modules/account.mjs`
- `ancrage-private/src/Security.php`
- `ancrage-private/src/Api.php`
- `ancrage-private/config.example.php` (documentation seulement)

Aucune migration SQL n’est nécessaire.

## Important pour config.php

Le patch fonctionne même si ton vrai `~/ancrage-private/config.php` ne contient pas encore `remember_session_seconds` : la valeur par défaut est 30 jours.

Si tu veux rendre la durée explicite, ajoute dans `config.php` :

```php
'remember_session_seconds' => 2592000,
```

Ne remplace PAS ton vrai `config.php` par `config.example.php`.

## Après avoir copié les fichiers dans ton dépôt local

```bash
git add public/ancrage/main.js \
        public/ancrage/modules/account.mjs \
        ancrage-private/src/Security.php \
        ancrage-private/src/Api.php \
        ancrage-private/config.example.php

git commit -m "UX local first and remember me"
git push origin main
```

## Sur le serveur O2switch

```bash
cd ~/repositories/Ancrage
git pull --ff-only origin main
```

Puis déployer :

```bash
cp ~/repositories/Ancrage/ancrage-private/src/Security.php ~/ancrage-private/src/Security.php
cp ~/repositories/Ancrage/ancrage-private/src/Api.php ~/ancrage-private/src/Api.php
cp ~/repositories/Ancrage/public/ancrage/main.js ~/lejokernoir.fr/ancrage/main.js
cp ~/repositories/Ancrage/public/ancrage/modules/account.mjs ~/lejokernoir.fr/ancrage/modules/account.mjs
```

## Vérifications rapides

```bash
php -l ~/ancrage-private/src/Security.php
php -l ~/ancrage-private/src/Api.php
grep -n "AUTH_SCREEN_KEY" ~/lejokernoir.fr/ancrage/main.js
grep -n "remember" ~/ancrage-private/src/Api.php | head
```

Ensuite faire un Ctrl+F5 sur `https://lejokernoir.fr/ancrage`.
