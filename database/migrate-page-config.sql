-- Principles: run ONCE on a database made before Page Config (Home, Contact Us, Enquiries, profile locks).
-- The pairing_rounds, pairing_boards and event_byes tables stay: tournament pairings and byes still use them.
-- Afterwards run seed.sql again: it adds the new Roles and permissions rows, keeping your existing ticks.
-- A new database doesn't need this file: schema.sql already has these changes.
SET NAMES utf8mb4;

ALTER TABLE profiles ADD COLUMN completed_at DATETIME NULL AFTER membership_history;

-- Filled-in profiles count as already saved: their switched-off fields lock straight away.
UPDATE profiles SET completed_at = NOW()
WHERE first_name <> '' AND last_name <> '' AND email <> '' AND phone <> '' AND street <> '' AND suburb <> ''
  AND state <> '' AND postcode <> '' AND country <> '' AND dob IS NOT NULL AND sex <> '';

CREATE TABLE IF NOT EXISTS enquiries (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name    VARCHAR(100) NOT NULL DEFAULT '',
  last_name     VARCHAR(100) NOT NULL DEFAULT '',
  email         VARCHAR(191) NOT NULL DEFAULT '',
  phone         VARCHAR(32)  NOT NULL DEFAULT '',
  club_name     VARCHAR(191) NOT NULL DEFAULT '',
  inquiry_type  VARCHAR(100) NOT NULL DEFAULT '',
  message       TEXT         NOT NULL,
  ip_hash       CHAR(64)     NOT NULL DEFAULT '',
  handled_at    DATETIME     NULL,
  handled_by    INT UNSIGNED NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_enquiries_ip (ip_hash, created_at),
  KEY ix_enquiries_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
