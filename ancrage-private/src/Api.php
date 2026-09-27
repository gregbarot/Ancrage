<?php
declare(strict_types=1);
namespace Ancrage;

use PDOException;

final class Api
{
    public const POLICY = '2026-09-09-v2';

    public function __construct(private Store $store, private Cipher $cipher, private array $config) {}

    private function user(bool $required = true): ?array
    {
        $user = isset($_SESSION['user_id']) ? $this->store->user($_SESSION['user_id']) : null;
        if ($user && (int) $user['auth_version'] !== ($_SESSION['auth_version'] ?? 0)) { $user = null; }
        if (!$user && $required) { throw new HttpError(401, 'Reconnecte-toi pour accéder à ton carnet.'); }
        if ($user && time() - (int) $user['last_seen_at'] > 3600) {
            $this->store->query('UPDATE users SET last_seen_at = ? WHERE id = ?', [time(), $user['id']]);
        }
        return $user;
    }

    private function throttle(string $action, string $subject = '', int $maximum = 10): void
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $this->store->limit($this->cipher->opaqueIdentifier($action . ':ip:' . $ip), 60, 900);
        if ($subject !== '') {
            $this->store->limit($this->cipher->opaqueIdentifier($action . ':subject:' . $subject), $maximum, 900);
        }
    }

    private function identity(array $user): array
    {
        return ['id' => $user['id'], 'email' => $user['email'] ?? ''];
    }

    private function session(): array
    {
        $user = $this->user(false);
        return [
            'csrf' => $_SESSION['csrf'],
            'user' => $user ? $this->identity($user) : null,
            'policy' => [
                'version' => self::POLICY,
                'owner' => $this->config['owner_name'],
                'contact' => $this->config['privacy_contact'],
                'inactiveDays' => $this->config['inactive_days'],
                'backupDays' => $this->config['backup_retention_days'],
            ],
        ];
    }

    private function notebook(array $user): array
    {
        $row = $this->store->query('SELECT * FROM notebooks WHERE user_id = ?', [$user['id']])->fetch();
        if (!$row) { throw new \RuntimeException('Carnet absent.'); }
        return [
            'notebook' => $this->cipher->decrypt($row['payload'], $user['id']),
            'revision' => (int) $row['revision'],
        ];
    }

    private function register(array $body): array
    {
        $email = Security::email($body['email'] ?? null);
        $this->throttle('register', $email, 5);
        $password = Security::newPassword($body['password'] ?? null);

        if (($body['consent'] ?? false) !== true || ($body['policyVersion'] ?? '') !== self::POLICY) {
            throw new HttpError(422, 'Ton accord explicite est nécessaire pour enregistrer le carnet en ligne.');
        }
        if (($body['adult'] ?? false) !== true) {
            throw new HttpError(422, 'Cette version est proposée aux personnes majeures.');
        }

        $id = bin2hex(random_bytes(16));
        $hash = Security::hashPassword($password);
        $initial = Notebook::initial('toi');
        $payload = $this->cipher->encrypt($initial, $id);
        $db = $this->store->db;
        $db->beginTransaction();
        try {
            $this->store->query(
                'INSERT INTO users (id, email, password_hash, auth_version, consent_version, consent_at, created_at, last_seen_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)',
                [$id, $email, $hash, self::POLICY, time(), time(), time()]
            );
            $this->store->query(
                'INSERT INTO notebooks (user_id, payload, revision, updated_at) VALUES (?, ?, 0, ?)',
                [$id, $payload, time()]
            );
            $db->commit();
        } catch (\Throwable $error) {
            if ($db->inTransaction()) { $db->rollBack(); }
            if ($error instanceof PDOException && in_array((string) $error->getCode(), ['23000', '23505'], true)) {
                throw new HttpError(409, 'Un compte existe déjà avec cette adresse e-mail.');
            }
            throw $error;
        }

        $user = $this->store->user($id);
        Security::login($user);
        return [...$this->session(), 'notebook' => $initial, 'revision' => 0];
    }

    private function login(array $body): array
    {
        $email = Security::email($body['email'] ?? null);
        $this->throttle('login', $email);
        $user = $this->store->byEmail($email);
        $dummy = '$2y$12$SOpBVjyfpCNeOvNDIQIH2.On/eGWaYNOtH0JvpRlP92DOwm8NSQJO';
        $verified = Security::verify($body['password'] ?? null, $user['password_hash'] ?? $dummy);
        if (!$user || !$verified) {
            throw new HttpError(401, 'Adresse e-mail ou mot de passe incorrect.');
        }
        Security::login($user);
        $this->store->query('UPDATE users SET last_seen_at = ? WHERE id = ?', [time(), $user['id']]);
        return [...$this->session(), ...$this->notebook($user)];
    }

    private function save(array $body): array
    {
        $user = $this->user();
        $revision = $body['revision'] ?? null;
        if (!is_int($revision) || $revision < 0) { throw new HttpError(422, 'Version du carnet invalide.'); }
        $data = Notebook::validate($body['notebook'] ?? null);
        $payload = $this->cipher->encrypt($data, $user['id']);
        $result = $this->store->query(
            'UPDATE notebooks SET payload = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?',
            [$payload, time(), $user['id'], $revision]
        );
        if ($result->rowCount() !== 1) {
            throw new HttpError(409, 'Ce carnet a été modifié ailleurs. Exporte ta copie avant de recharger la version du compte.');
        }
        return ['revision' => $revision + 1];
    }

    private function password(array $body): array
    {
        $user = $this->user();
        $this->throttle('password', $user['id']);
        if (!Security::verify($body['currentPassword'] ?? null, $user['password_hash'])) {
            throw new HttpError(401, 'Mot de passe actuel incorrect.');
        }
        $new = Security::newPassword($body['newPassword'] ?? null);
        $this->store->query(
            'UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?',
            [Security::hashPassword($new), $user['id']]
        );
        Security::login($this->store->user($user['id']));
        return $this->session();
    }

    private function deleteAccount(array $body): array
    {
        $user = $this->user();
        $this->throttle('delete', $user['id'], 5);
        if (($body['confirm'] ?? false) !== true || !Security::verify($body['password'] ?? null, $user['password_hash'])) {
            throw new HttpError(422, 'Confirme la suppression avec ton mot de passe.');
        }
        $this->store->query('DELETE FROM users WHERE id = ?', [$user['id']]);
        Security::clear();
        return ['deleted' => true, 'csrf' => $_SESSION['csrf']];
    }

    public function run(string $method, string $action, array $body): array
    {
        return match ($method . ' ' . $action) {
            'GET session' => $this->session(),
            'POST register' => $this->register($body),
            'POST login' => $this->login($body),
            'GET notebook' => $this->notebook($this->user()),
            'PUT notebook' => $this->save($body),
            'POST password' => $this->password($body),
            'DELETE account' => $this->deleteAccount($body),
            'POST logout' => $this->logout(),
            'GET export' => $this->export(),
            default => throw new HttpError(405, 'Action ou méthode non autorisée.'),
        };
    }

    private function logout(): array
    {
        Security::clear();
        return ['csrf' => $_SESSION['csrf']];
    }

    private function export(): array
    {
        $user = $this->user();
        return ['account' => [
            'id' => $user['id'],
            'email' => $user['email'] ?? null,
            'createdAt' => gmdate(DATE_ATOM, (int) $user['created_at']),
            'lastSeenAt' => gmdate(DATE_ATOM, (int) $user['last_seen_at']),
            'consentAt' => gmdate(DATE_ATOM, (int) $user['consent_at']),
            'consentVersion' => $user['consent_version'],
        ], ...$this->notebook($user)];
    }
}
