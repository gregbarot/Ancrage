<?php
declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    if (str_starts_with($class, 'Ancrage\\')) {
        $name = substr($class, strlen('Ancrage\\'));
        if (preg_match('/^[A-Za-z]+$/D', $name)) { require __DIR__ . '/src/' . $name . '.php'; }
    }
});

function ancrageConfig(): array
{
    if (!is_file(__DIR__ . '/config.php')) { throw new RuntimeException('Configuration absente.'); }
    $config = require __DIR__ . '/config.php';
    foreach (['dsn', 'encryption_key', 'origin', 'base_path', 'owner_name', 'privacy_contact'] as $key) {
        if (!is_string($config[$key] ?? null) || trim($config[$key]) === '' || str_contains($config[$key], 'A_COMPLETER')) {
            throw new RuntimeException('Configuration incomplète.');
        }
    }
    if (!filter_var($config['privacy_contact'], FILTER_VALIDATE_EMAIL)) { throw new RuntimeException('Contact non configuré.'); }
    if (!preg_match('~^/[a-zA-Z0-9/_-]*$~D', $config['base_path'])) { throw new RuntimeException('Chemin non valide.'); }
    foreach (['session_idle_seconds', 'session_max_seconds', 'inactive_days'] as $key) {
        if (!is_int($config[$key] ?? null) || $config[$key] < 1) { throw new RuntimeException('Durée non valide.'); }
    }
    if (!is_int($config['backup_retention_days'] ?? null) || $config['backup_retention_days'] < 0) {
        throw new RuntimeException('Durée des sauvegardes à renseigner.');
    }
    date_default_timezone_set($config['timezone'] ?? 'Europe/Paris');
    return $config;
}
