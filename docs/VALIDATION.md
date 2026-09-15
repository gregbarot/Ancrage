# Validation technique — 9 septembre 2026

## Contrôles réalisés

10 tests JavaScript avec `node --test` : conservation du stockage local, sérialisation des envois, reprise après coupure, conflits, sessions expirées, limite de taille, confirmation de révision, compatibilité d’un ancien export et échappement HTML.

31 contrôles HTTP contre la véritable API PHP, avec une base SQLite et des comptes fictifs temporaires :

- Session et jeton CSRF ; cookies HttpOnly/SameSite ; réponses privées sans cache.
- Authentification obligatoire, rejet d’une origine étrangère et d’un jeton invalide.
- Consentement requis et inscription par invitation à usage unique.
- Deux comptes isolés ; les paramètres du client ne permettent pas de sélectionner le carnet d’autrui.
- Carnet chiffré en base, lié cryptographiquement à son propriétaire.
- Écriture avec révision et refus d’une ancienne révision.
- Connexion d’un second client et récupération du carnet.
- Rejet de données hors schéma et de propriétés inattendues.
- Export sans hachages de mots de passe ni codes de récupération.
- Changement du mot de passe et invalidation des autres sessions.
- Rotation et utilisation du code de récupération.
- Suppression du compte, du carnet et de l’accès.
- Limitation des tentatives et refus du HTTP hors mode local de test.

La syntaxe des fichiers PHP et JavaScript, les imports et les références locales sont aussi vérifiés lors de la préparation de l’archive.

## Portée

Ces vérifications ne constituent pas un audit de sécurité, un audit d’accessibilité ou une certification RGPD/HDS. Aucun test interactif dans un navigateur n’a été réalisé. Le moteur MySQL, les modules Apache, les sauvegardes, le certificat et les réglages du compte o2switch n’ont pas été testés depuis cet environnement.

## Vérification sur l’installation cible

Avec des comptes et des données fictifs, vérifier : création par invitation ; déconnexion puis connexion ; ajout et modification d’une journée ; photo ; fiche et inquiétude ; exports JSON, CSV et PDF ; récupération depuis un second appareil ; conflit volontaire ; récupération du compte ; suppression. Vérifier aussi les commandes de maintenance et une restauration de sauvegarde avant usage réel.

Pour la partie interface, vérifier clavier seul, mise au point dans les dialogues, lecture des messages d’erreur, écran de téléphone et zoom. Les changements sémantiques effectués sont une base, pas une attestation de conformité à un référentiel d’accessibilité.
