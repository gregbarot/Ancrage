<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/bootstrap.php';

$command = $argv[1] ?? 'help';
if ($command === 'key') {
    echo base64_encode(random_bytes(32)) . PHP_EOL;
    exit;
}
if ($command === 'help') {
    echo "Ancrage\n  php bin/console.php key\n  php bin/console.php check\n  php bin/console.php invite [nombre=1]\n  php bin/console.php maintenance [--apply]\n";
    exit;
}

try {
    $config = ancrageConfig();
    $cipher = new Ancrage\Cipher($config['encryption_key']);
    $store = new Ancrage\Store($config);
    if ($command === 'check') {
        foreach (['users', 'notebooks', 'invitations', 'rate_limits'] as $table) {
            $store->query('SELECT COUNT(*) FROM ' . $table);
        }
        echo "Configuration, connexion, tables et chiffrement disponibles.\n";
        echo "Vérifier séparément le HTTPS, les sauvegardes et le cadre d’hébergement.\n";
    } elseif ($command === 'invite') {
        $count = filter_var($argv[2] ?? '1', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 20]]);
        if ($count === false) { throw new RuntimeException('Nombre attendu : de 1 à 20.'); }
        for ($i = 0; $i < $count; $i++) {
            $token = Ancrage\Security::recoveryCode();
            $store->query('INSERT INTO invitations (token_hash, created_at, expires_at, used_at) VALUES (?, ?, ?, NULL)', [hash('sha256', $token), time(), time() + 7 * 86400]);
            echo $token . PHP_EOL;
        }
        echo "Chaque code est utilisable une fois, pendant 7 jours.\n";
    } elseif ($command === 'maintenance') {
        $threshold = time() - $config['inactive_days'] * 86400;
        $count = $store->query('SELECT COUNT(*) FROM users WHERE last_seen_at < ?', [$threshold])->fetchColumn();
        echo "$count compte(s) dépassent la durée d’inactivité configurée.\n";
        if (($argv[2] ?? '') === '--apply') {
            $store->query('DELETE FROM users WHERE last_seen_at < ?', [$threshold]);
            $store->query('DELETE FROM rate_limits WHERE expires_at <= ?', [time()]);
            $store->query('DELETE FROM invitations WHERE expires_at <= ? OR used_at IS NOT NULL', [time()]);
            echo "Maintenance appliquée. Les carnets des comptes supprimés sont retirés par la clé étrangère.\n";
        } else {
            echo "Simulation uniquement. Ajouter --apply pour appliquer la politique de conservation.\n";
        }
    } else {
        throw new RuntimeException('Commande inconnue.');
    }
} catch (Throwable $error) {
    fwrite(STDERR, "Échec : " . $error->getMessage() . PHP_EOL);
    exit(1);
}
