<?php
declare(strict_types=1);
namespace Ancrage;

final class Security
{
    public static function startSession(array $config): void
    {
        $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        $local = ($config['allow_local_http'] ?? false)
            && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)
            && in_array(parse_url($config['origin'], PHP_URL_HOST), ['127.0.0.1', 'localhost', '::1'], true);
        if (!$https && !$local) { throw new HttpError(426, 'Ouvre Ancrage avec une adresse HTTPS.'); }
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.gc_maxlifetime', (string) $config['session_max_seconds']);
        session_name('ANCRAGESESSID');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => rtrim($config['base_path'], '/') . '/api/',
            'secure' => !$local,
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
        session_cache_limiter('');
        if (!session_start()) { throw new \RuntimeException('Stockage des sessions indisponible.'); }
        $now = time();
        if (isset($_SESSION['user_id']) && (
            $now - ($_SESSION['last_activity'] ?? 0) > $config['session_idle_seconds']
            || $now - ($_SESSION['authenticated_at'] ?? 0) > $config['session_max_seconds']
        )) {
            self::clear();
        }
        $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
        $_SESSION['last_activity'] = $now;
    }

    public static function checkMutation(array $config): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!hash_equals(rtrim($config['origin'], '/'), $origin)
            || !is_string($_SESSION['csrf'] ?? null)
            || !hash_equals($_SESSION['csrf'], $csrf)
            || ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
            throw new HttpError(403, 'La session de ce formulaire a expiré. Recharge la page.');
        }
    }

    public static function login(array $user): void
    {
        $_SESSION = [];
        if (!session_regenerate_id(true)) { throw new \RuntimeException('Session indisponible.'); }
        $_SESSION = [
            'user_id' => $user['id'],
            'auth_version' => (int) $user['auth_version'],
            'authenticated_at' => time(),
            'last_activity' => time(),
            'csrf' => bin2hex(random_bytes(32)),
        ];
    }

    public static function clear(): void
    {
        $_SESSION = [];
        if (!session_regenerate_id(true)) { throw new \RuntimeException('Session indisponible.'); }
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }

    public static function email(mixed $value): string
    {
        if (!is_string($value)) {
            throw new HttpError(422, 'Vérifie ton adresse e-mail.');
        }
        $value = strtolower(trim($value));
        if ($value === '' || strlen($value) > 254 || filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            throw new HttpError(422, 'Indique une adresse e-mail valide.');
        }
        return $value;
    }

    public static function newPassword(mixed $value): string
    {
        if (!is_string($value) || mb_strlen($value) < 15 || strlen($value) > 72 || str_contains($value, "\0")) {
            throw new HttpError(422, 'Choisis une phrase de passe d’au moins 15 caractères (72 octets maximum).');
        }
        return $value;
    }

    public static function hashPassword(string $password): string
    {
        if (defined('PASSWORD_ARGON2ID')) {
            return password_hash($password, PASSWORD_ARGON2ID, [
                'memory_cost' => 65536,
                'time_cost' => 3,
                'threads' => 1,
            ]);
        }
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    public static function verify(mixed $password, string $hash): bool
    {
        return is_string($password)
            && strlen($password) <= 72
            && !str_contains($password, "\0")
            && password_verify($password, $hash);
    }
}
