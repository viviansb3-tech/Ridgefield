CREATE DATABASE IF NOT EXISTS ridgefield CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ridgefield;

CREATE TABLE IF NOT EXISTS ridgefield_records (
  collection VARCHAR(80) NOT NULL,
  record_id BIGINT UNSIGNED NOT NULL,
  payload JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (collection, record_id),
  INDEX idx_collection (collection),
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NULL,
  ip_hash CHAR(64) NULL,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attempted_at (attempted_at),
  INDEX idx_username_time (username, attempted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_resets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_token (token_hash),
  INDEX idx_reset_user (user_id),
  INDEX idx_reset_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100) NOT NULL,
  entity_id BIGINT NULL,
  ip_hash CHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_entity (entity, entity_id)
) ENGINE=InnoDB;
