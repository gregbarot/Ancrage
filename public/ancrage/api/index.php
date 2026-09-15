<?php
declare(strict_types=1);

// Par défaut : /home/COMPTE/ancrage-private, pour une racine web située un niveau sous /home/COMPTE.
// Si nécessaire, remplacer cette expression par le chemin absolu de votre dossier privé.
$privateDirectory = getenv('ANCRAGE_PRIVATE_DIR') ?: dirname(__DIR__, 3) . '/ancrage-private';

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');

try {
    $privateReal = realpath($privateDirectory);
    $publicReal = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
    if (!$privateReal || ($publicReal && ($privateReal === $publicReal || str_starts_with($privateReal, $publicReal . DIRECTORY_SEPARATOR)))) {
        throw new RuntimeException('Le code privé doit se trouver hors de la racine web.');
    }
    require $privateReal . '/bootstrap.php';
    $config = ancrageConfig();
    $cipher = new Ancrage\Cipher($config['encryption_key']);
    Ancrage\Security::startSession($config);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = $_GET['action'] ?? 'session';
    if (!is_string($action)) { throw new Ancrage\HttpError(400, 'Requête invalide.'); }
    $body = [];
    if ($method !== 'GET') {
        Ancrage\Security::checkMutation($config);
        if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
            throw new Ancrage\HttpError(415, 'Le format JSON est requis.');
        }
        $raw = file_get_contents('php://input', false, null, 0, Ancrage\Notebook::MAX_BYTES + 4097);
        if ($raw === false || strlen($raw) > Ancrage\Notebook::MAX_BYTES + 4096) { throw new Ancrage\HttpError(413, 'Ce carnet dépasse la limite de 4 Mo.'); }
        $body = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($body)) { throw new Ancrage\HttpError(400, 'Requête invalide.'); }
    }
    $api = new Ancrage\Api(new Ancrage\Store($config), $cipher, $config);
    $response = $api->run($method, $action, $body);
    echo json_encode($response, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
} catch (Ancrage\HttpError $error) {
    http_response_code($error->status);
    if ($error->status === 429) { header('Retry-After: 900'); }
    echo json_encode(['error' => $error->getMessage()], JSON_UNESCAPED_UNICODE);
} catch (InvalidArgumentException | JsonException $error) {
    http_response_code(422);
    echo json_encode(['error' => 'Les données transmises ne sont pas valides.'], JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    http_response_code(503);
    // Ne jamais journaliser les corps de requêtes, les mots de passe ou les carnets.
    error_log('Ancrage: ' . get_class($error) . ' (service indisponible)');
    echo json_encode(['error' => 'La synchronisation est indisponible. Le responsable doit vérifier la configuration du service.'], JSON_UNESCAPED_UNICODE);
} finally {
    if (session_status() === PHP_SESSION_ACTIVE) { session_write_close(); }
}
