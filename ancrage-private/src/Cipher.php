<?php
declare(strict_types=1);

namespace Ancrage;

use RuntimeException;

/** Chiffrement authentifié au repos. Le serveur conserve la capacité de déchiffrer. */
final class Cipher
{
    private string $key;

    public function __construct(string $encodedKey)
    {
        $key = base64_decode($encodedKey, true);
        if ($key === false || strlen($key) !== 32 || !function_exists('sodium_crypto_secretbox')) {
            throw new RuntimeException('Chiffrement non configuré.');
        }
        $this->key = $key;
    }

    private function userKey(string $userId): string
    {
        return hash_hkdf('sha256', $this->key, SODIUM_CRYPTO_SECRETBOX_KEYBYTES, 'ancrage-notebook-v1:' . $userId);
    }

    public function encrypt(array $data, string $userId): string
    {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plain = json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        return base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, $this->userKey($userId)));
    }

    public function decrypt(string $payload, string $userId): array
    {
        $binary = base64_decode($payload, true);
        if ($binary === false || strlen($binary) < SODIUM_CRYPTO_SECRETBOX_NONCEBYTES + SODIUM_CRYPTO_SECRETBOX_MACBYTES) {
            throw new RuntimeException('Carnet illisible.');
        }
        $nonce = substr($binary, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plain = sodium_crypto_secretbox_open(substr($binary, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), $nonce, $this->userKey($userId));
        if ($plain === false) { throw new RuntimeException('Carnet illisible.'); }
        return json_decode($plain, true, 64, JSON_THROW_ON_ERROR);
    }

    public function opaqueIdentifier(string $value): string
    {
        return hash_hmac('sha256', $value, $this->key);
    }
}
