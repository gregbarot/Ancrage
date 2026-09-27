<?php
declare(strict_types=1);
namespace Ancrage;

use PDO;
use PDOException;

final class Store
{
    public readonly PDO $db;

    public function __construct(array $config)
    {
        $this->db = new PDO($config['dsn'], $config['db_user'] ?? null, $config['db_password'] ?? null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        if ($this->db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
            $this->db->exec('PRAGMA foreign_keys = ON');
            $this->db->exec('PRAGMA busy_timeout = 3000');
        }
    }

    public function query(string $sql, array $parameters = []): \PDOStatement
    {
        $statement = $this->db->prepare($sql);
        $statement->execute($parameters);
        return $statement;
    }

    public function user(string $id): ?array
    {
        return $this->query('SELECT * FROM users WHERE id = ?', [$id])->fetch() ?: null;
    }

    public function byEmail(string $email): ?array
    {
        return $this->query('SELECT * FROM users WHERE email = ?', [$email])->fetch() ?: null;
    }

    public function limit(string $opaqueKey, int $maximum, int $seconds): void
    {
        $now = time();
        $this->query('DELETE FROM rate_limits WHERE key_hash = ? AND expires_at <= ?', [$opaqueKey, $now]);
        try {
            $this->query('INSERT INTO rate_limits (key_hash, attempts, expires_at) VALUES (?, 0, ?)', [$opaqueKey, $now + $seconds]);
        } catch (PDOException $error) {
            if (!in_array((string) $error->getCode(), ['23000', '23505'], true)) { throw $error; }
        }
        $this->query('UPDATE rate_limits SET attempts = attempts + 1 WHERE key_hash = ?', [$opaqueKey]);
        $attempts = (int) $this->query('SELECT attempts FROM rate_limits WHERE key_hash = ?', [$opaqueKey])->fetchColumn();
        if ($attempts > $maximum) {
            throw new HttpError(429, 'Trop de tentatives. Réessaie dans quelques minutes.');
        }
    }
}
