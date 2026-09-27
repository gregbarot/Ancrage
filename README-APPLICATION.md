# Ancrage — simplification de l'authentification

Cette version remplace l'ancien système **identifiant + invitation + code de récupération** par :

- adresse e-mail ;
- mot de passe ;
- confirmation du mot de passe à l'inscription ;
- session PHP sécurisée et CSRF conservés ;
- hachage Argon2id, avec bcrypt en repli ;
- limitation des tentatives conservée.

## 1. Base existante

Dans phpMyAdmin, sélectionner la base `qisa5358_ancrage`, puis exécuter :

`database/migrate_email_auth.sql`

Cette migration ajoute `email` et rend les anciennes colonnes `username` et `recovery_hash` facultatives. Elle ne supprime aucun carnet existant.

## 2. Fichiers à remplacer

Copier ensuite les fichiers suivants à leur emplacement correspondant :

- `ancrage-private/src/Security.php`
- `ancrage-private/src/Store.php`
- `ancrage-private/src/Api.php`
- `public/ancrage/main.js`
- `public/ancrage/modules/account.mjs`

`database/schema.sql` sert désormais aux installations neuves.

## 3. Comportement attendu

L'inscription demande l'adresse e-mail, le mot de passe, sa confirmation, puis conserve les cases de consentement déjà présentes. Le carnet est créé avec le nom d'accueil temporaire `toi`; l'utilisateur peut ensuite modifier son prénom/pseudo depuis **Mon profil**.

Le bouton **Mot de passe oublié** et le code de récupération ont été retirés. Une vraie réinitialisation par e-mail pourra être ajoutée plus tard.
