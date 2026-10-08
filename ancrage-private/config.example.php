<?php
declare(strict_types=1);

// Copier en config.php. Ce dossier doit rester HORS de la racine web.
return [
    'dsn' => 'mysql:host=localhost;dbname=VOTRE_PREFIXE_ancrage_bdd;charset=utf8mb4',
    'db_user' => 'VOTRE_UTILISATEUR_MYSQL',
    'db_password' => 'VOTRE_MOT_DE_PASSE_MYSQL',
    // Générer avec : php bin/console.php key
    'encryption_key' => 'COLLER_LA_CLE_BASE64_ICI',
    'origin' => 'https://lejokernoir.fr',
    'base_path' => '/ancrage',
    'owner_name' => 'RESPONSABLE_A_COMPLETER',
    'privacy_contact' => 'ADRESSE_EMAIL_A_COMPLETER',
    // Durées proposées, à adapter et documenter avant utilisation réelle.
    'inactive_days' => 730,
    'backup_retention_days' => null, // Renseigner après confirmation de l’hébergeur.
    'session_idle_seconds' => 1800,
    'session_max_seconds' => 43200,
    'remember_session_seconds' => 2592000, // 30 jours si « Se souvenir de moi » est coché.
    'allow_local_http' => false, // Tests sur loopback uniquement.
    'timezone' => 'Europe/Paris',
];
