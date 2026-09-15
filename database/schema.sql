-- Sélectionner la base créée dans cPanel avant l'import. Aucun DROP ni CREATE DATABASE.
CREATE TABLE IF NOT EXISTS users (
    id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    username VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    recovery_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    auth_version INT UNSIGNED NOT NULL DEFAULT 1,
    consent_version VARCHAR(40) NOT NULL,
    consent_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    last_seen_at BIGINT NOT NULL,
    INDEX users_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notebooks (
    user_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    payload MEDIUMTEXT NOT NULL,
    revision INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL,
    CONSTRAINT fk_notebook_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invitations (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    used_at BIGINT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rate_limits (
    key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    attempts INT NOT NULL,
    expires_at BIGINT NOT NULL,
    INDEX rate_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
