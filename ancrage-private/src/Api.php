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
            'remembered' => $user ? (($_SESSION['remembered'] ?? false) === true) : false,
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
        $remember = ($body['remember'] ?? false) === true;

        if (($body['consent'] ?? false) !== true || ($body['policyVersion'] ?? '') !== self::POLICY) {
            throw new HttpError(422, 'Ton accord explicite est nécessaire pour enregistrer le carnet en ligne.');
        }
        if (($body['adult'] ?? false) !== true) {
            throw new HttpError(422, 'Cette version est proposée aux personnes majeures.');
        }

        $id = bin2hex(random_bytes(16));
        $hash = Security::hashPassword($password);
        $initial = array_key_exists('notebook', $body)
            ? Notebook::validate($body['notebook'])
            : Notebook::initial('');
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
        Security::login($user, $remember, $this->config);
        return [...$this->session(), 'notebook' => $initial, 'revision' => 0];
    }

    private function login(array $body): array
    {
        $email = Security::email($body['email'] ?? null);
        $remember = ($body['remember'] ?? false) === true;
        $this->throttle('login', $email);
        $user = $this->store->byEmail($email);
        $dummy = '$2y$12$SOpBVjyfpCNeOvNDIQIH2.On/eGWaYNOtH0JvpRlP92DOwm8NSQJO';
        $verified = Security::verify($body['password'] ?? null, $user['password_hash'] ?? $dummy);
        if (!$user || !$verified) {
            throw new HttpError(401, 'Adresse e-mail ou mot de passe incorrect.');
        }
        Security::login($user, $remember, $this->config);
        $this->store->query('UPDATE users SET last_seen_at = ? WHERE id = ?', [time(), $user['id']]);
        return [...$this->session(), ...$this->notebook($user)];
    }

    private function requestPasswordReset(array $body): array
    {
        $startedAt = microtime(true);
        $email = Security::email($body['email'] ?? null);
        $this->throttle('password-reset-request', $email, 5);

        $now = time();
        $ttl = max(300, (int) ($this->config['password_reset_seconds'] ?? 1800));
        $expiresAt = $now + $ttl;

        // Toujours générer un token, même si l'adresse n'existe pas,
        // pour éviter un chemin de code trivialement différent.
        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);

        $this->store->query('DELETE FROM password_resets WHERE expires_at <= ?', [$now]);
        $user = $this->store->byEmail($email);

        if ($user) {
            $db = $this->store->db;
            $db->beginTransaction();
            try {
                $this->store->query('DELETE FROM password_resets WHERE user_id = ?', [$user['id']]);
                $this->store->query(
                    'INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)',
                    [$user['id'], $tokenHash, $expiresAt, $now]
                );
                $db->commit();
            } catch (\Throwable $error) {
                if ($db->inTransaction()) { $db->rollBack(); }
                throw $error;
            }

            $url = rtrim($this->config['origin'], '/')
                . rtrim($this->config['base_path'], '/')
                . '/?reset='
                . rawurlencode($token);

            try {
                if (!Mailer::sendPasswordReset($this->config, $email, $url, $expiresAt)) {
                    error_log('Ancrage: password reset email could not be sent');
                }
            } catch (\Throwable $error) {
                // Ne pas révéler au client si l'adresse existe ou si l'envoi a échoué.
                error_log('Ancrage: password reset email failed');
            }
        }

        // Un minimum de temps commun réduit un peu les différences de réponse.
        $elapsedMicros = (int) ((microtime(true) - $startedAt) * 1_000_000);
        if ($elapsedMicros < 350_000) {
            usleep(350_000 - $elapsedMicros);
        }

        return [
            'message' => 'Si un compte correspond à cette adresse, un e-mail de réinitialisation a été envoyé.',
            'csrf' => $_SESSION['csrf'],
        ];
    }

    private function resetPassword(array $body): array
    {
        $token = $body['token'] ?? null;
        if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) {
            throw new HttpError(422, 'Ce lien de réinitialisation est invalide ou expiré.');
        }

        $newPassword = Security::newPassword($body['newPassword'] ?? null);
        $tokenHash = hash('sha256', $token);
        $this->throttle('password-reset', $tokenHash, 8);

        $now = time();
        $row = $this->store->query(
            'SELECT user_id, expires_at FROM password_resets WHERE token_hash = ?',
            [$tokenHash]
        )->fetch();

        if (!$row || (int) $row['expires_at'] < $now) {
            if ($row) {
                $this->store->query('DELETE FROM password_resets WHERE token_hash = ?', [$tokenHash]);
            }
            throw new HttpError(422, 'Ce lien de réinitialisation est invalide ou expiré.');
        }

        $db = $this->store->db;
        $db->beginTransaction();
        try {
            // Suppression atomique : un même token ne peut être consommé qu'une fois.
            $deleted = $this->store->query(
                'DELETE FROM password_resets WHERE token_hash = ? AND expires_at >= ?',
                [$tokenHash, $now]
            );
            if ($deleted->rowCount() !== 1) {
                throw new HttpError(422, 'Ce lien de réinitialisation est invalide ou expiré.');
            }

            $this->store->query(
                'UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?',
                [Security::hashPassword($newPassword), $row['user_id']]
            );
            $this->store->query(
                'DELETE FROM password_resets WHERE user_id = ?',
                [$row['user_id']]
            );
            $db->commit();
        } catch (\Throwable $error) {
            if ($db->inTransaction()) { $db->rollBack(); }
            throw $error;
        }

        // Le changement de auth_version invalide les anciennes sessions.
        Security::clear($this->config);

        return [
            'reset' => true,
            'csrf' => $_SESSION['csrf'],
        ];
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
        $remember = ($_SESSION['remembered'] ?? false) === true;

        $db = $this->store->db;
        $db->beginTransaction();
        try {
            $this->store->query(
                'UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?',
                [Security::hashPassword($new), $user['id']]
            );
            $this->store->query('DELETE FROM password_resets WHERE user_id = ?', [$user['id']]);
            $db->commit();
        } catch (\Throwable $error) {
            if ($db->inTransaction()) { $db->rollBack(); }
            throw $error;
        }

        Security::login($this->store->user($user['id']), $remember, $this->config);
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
        Security::clear($this->config);
        return ['deleted' => true, 'csrf' => $_SESSION['csrf']];
    }

    public function run(string $method, string $action, array $body): array
    {
        return match ($method . ' ' . $action) {
            'GET session' => $this->session(),
            'POST register' => $this->register($body),
            'POST login' => $this->login($body),
            'POST password-request' => $this->requestPasswordReset($body),
            'POST password-reset' => $this->resetPassword($body),
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
        Security::clear($this->config);
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
