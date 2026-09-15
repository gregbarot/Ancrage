# Ancrage — stockage et données personnelles

Analyse préparée le 9 septembre 2026, à partir du code transmis et des choix confirmés : usage personnel et par les proches, avec synchronisation du carnet complet. Cette note expose les points établis et ceux qui restent à qualifier ; elle ne certifie ni l’application ni l’offre d’hébergement.

## Serveur, base ou navigateur ?

Le serveur héberge le service PHP et la base MySQL. La base est un moyen de conserver les données sur ce serveur. Le choix utile oppose donc le stockage local à un stockage en ligne, et non « serveur » à « base ».

| Solution | Fonctionnement | Conséquence pour Ancrage |
|---|---|---|
| Navigateur uniquement | Carnet dans le stockage local | Pas de compte ni de synchronisation ; sauvegarde manuelle à conserver |
| Fichiers sur le serveur | Carnets gérés par des fichiers privés | Possible techniquement, mais nécessite aussi authentification, contrôle d’accès, verrouillage et sauvegardes |
| Base MySQL sur le serveur | Comptes et carnet privé associés | Solution retenue pour la synchronisation, avec requêtes préparées et contrôle des révisions |

La base n’est pas directement accessible depuis le JavaScript. Chaque lecture et écriture passe par PHP, qui identifie l’utilisateur connecté. Le client ne choisit jamais l’identifiant du propriétaire du carnet à ouvrir.

## Nature des données

Les tags « crise d’angoisse », « insomnie », les symptômes, les notes et les fiches peuvent révéler la santé physique ou mentale. **J’en déduis qu’il faut concevoir Ancrage pour protéger des données susceptibles d’être des données de santé**, même si toutes les entrées ne le sont pas. Le simple nom « carnet de bien-être » ne suffit pas à changer leur nature. La qualification dépend du contenu et de l’usage. [CNIL, *Qu’est-ce qu’une donnée de santé ?*, 8 janvier 2018, page consultée le 9 septembre 2026](https://www.cnil.fr/fr/quest-ce-ce-quune-donnee-de-sante).

## Peut-on les enregistrer en ligne ?

Le RGPD prévoit des conditions permettant de traiter des données sensibles, notamment un consentement explicite pour une finalité précise. Il faut également une base juridique au titre de l’article 6. Pour cette version, la proposition est : gestion du compte nécessaire au service demandé, et consentement explicite pour synchroniser les informations sensibles. Il faut pouvoir prouver cet accord et permettre son retrait. Une case cochée ne règle pas, à elle seule, les autres obligations. [Parlement européen et Conseil, règlement (UE) 2016/679 du 27 avril 2016, articles 5 à 9, texte consulté via la CNIL le 9 septembre 2026](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre2).

L’exception pour une activité strictement personnelle ou domestique existe. **Je ne sais pas si elle couvrirait ton exploitation définitive du service.** Le périmètre « proches » ne décrit pas, à lui seul, toutes les modalités d’exploitation. La version proposée adopte donc des protections et une information explicite sans se reposer sur cette exception. [RGPD, article 2 §2 c et définitions de l’article 4, texte consulté via la CNIL le 9 septembre 2026](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre1).

## HDS : une question distincte

L’exigence française de certification concerne notamment l’hébergement pour autrui de données de santé recueillies à l’occasion d’activités de prévention, diagnostic, soins ou suivi médico-social. Elle ne découle pas automatiquement de la seule présence d’une information sensible dans une base. L’usage autonome annoncé doit être distingué d’un carnet proposé dans un accompagnement : les fonctions TCC et la préparation de consultations invitent à préciser ce cadre. **Je ne sais pas si HDS serait obligatoire pour l’usage exact d’Ancrage, ni si ton offre o2switch couvre le besoin éventuel.** Le chiffrement ne constitue pas une dispense automatique. [Agence du Numérique en Santé, *Certification HDS*, page consultée le 9 septembre 2026](https://esante.gouv.fr/produits-services/hds).

Avant de confier à cette version les carnets réels de tes proches, faire qualifier le périmètre HDS et obtenir les conditions d’hébergement correspondantes. Si HDS est applicable, choisir une prestation certifiée couvrant les activités nécessaires et examiner aussi le rôle d’exploitation assuré par Le Joker Noir.

## Information, droits et organisation

L’information doit préciser le responsable, les finalités, les bases juridiques, les destinataires, la conservation, les éventuels transferts et les droits. La version fournit un texte initial, un export, la modification du profil et la suppression du compte. Les demandes hors interface doivent également être traitées. Les exports JSON contiennent des informations personnelles en clair ; l’utilisateur choisit où les conserver. [RGPD, articles 12 à 20, texte consulté via la CNIL le 9 septembre 2026](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3).

Les mesures techniques doivent être accompagnées d’une organisation : contrat de sous-traitance adapté, gestion des accès, sauvegardes, procédure de restauration et réaction aux incidents. Le besoin d’une analyse d’impact doit être examiné en fonction du risque ; le petit nombre d’utilisateurs ne remplace pas cette analyse. La proposition de 730 jours d’inactivité est à choisir et justifier, pas à présenter comme une prescription légale. [RGPD, articles 28, 32 et 35, texte consulté via la CNIL le 9 septembre 2026](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4).

## Questions concrètes à adresser à l’hébergeur

1. L’offre souscrite permet-elle d’héberger ce carnet privé, dont les notes peuvent concerner la santé mentale ?
2. Si le périmètre relève de HDS, quelle prestation et quel certificat couvrent l’hébergement, l’exploitation et les sauvegardes concernés ?
3. Quels engagements de sous-traitance au sens de l’article 28 sont disponibles, avec quels lieux de stockage, sous-traitants et accès techniques ?
4. Quelles durées s’appliquent aux sauvegardes et journaux, et comment traiter une suppression de compte lors d’une restauration ?

Aucun message n’a été envoyé à l’hébergeur. Ces réponses et la qualification d’usage permettront de décider où activer la synchronisation des données réelles.

## Décisions techniques retenues

| Élément | Mise en œuvre dans le code |
|---|---|
| Identité | Identifiant public au sein du compte, prénom/pseudo dans le carnet ; aucun email utilisateur |
| Authentification | Mot de passe haché par PHP, Argon2id si disponible, sinon bcrypt ; code de récupération aléatoire haché |
| Accès | Invitation à usage unique ; contrôle de la session à chaque opération ; pas de carnet consultable par un autre compte |
| Carnet | Document JSON chiffré avec libsodium, stocké dans `notebooks` et lié au propriétaire |
| Clé | Configuration privée hors des racines web ; capacité de déchiffrement conservée par le serveur |
| Synchronisation | Envois sérialisés et révision attendue ; un conflit est signalé plutôt qu’écrasé |
| Anciennes données | Import explicite de la sauvegarde ou du carnet local ; aucun transfert automatique |
| Suppression | Effacement du compte et du carnet en base active ; traitement des sauvegardes à organiser avec l’hébergeur |

Le choix du chiffrement au repos simplifie la récupération du compte, mais protège surtout contre une fuite de la base seule. Une compromission du compte d’hébergement incluant la clé reste un risque. Une version à chiffrement de bout en bout demanderait une autre gestion des clés et de leur récupération.

Les primitives utilisées sont documentées par [PHP, `password_hash`](https://www.php.net/manual/fr/function.password-hash.php) et [PHP, `sodium_crypto_secretbox`](https://www.php.net/manual/fr/function.sodium-crypto-secretbox.php), pages consultées le 9 septembre 2026. Le choix du hachage se réfère également aux [recommandations OWASP sur les mots de passe](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), consultées à la même date.
