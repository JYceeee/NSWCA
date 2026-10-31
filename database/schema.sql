-- Principles: MySQL schema for DreamHost (MySQL 8 / MariaDB 10.6+).
-- Run once in phpMyAdmin (DreamHost panel › MySQL Databases › phpMyAdmin) on an empty database,
-- then run seed.sql. Every statement is safe to re-run: tables are only created when missing.
--
-- Hybrid design: things the club queries (users, players, events, entries, pairings…) are real tables;
-- brand/menu sets whose shape changes with the app are JSON documents in design_items.
-- Text ids (VARCHAR 64) are made by the app (e.g. "ev-lq3x9a1b"); user ids are numbers.
Use nswcaweb;
SET NAMES utf8mb4;

-- ---------- Accounts ----------

CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username        VARCHAR(64)  NOT NULL,
  email           VARCHAR(191) NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('admin','organiser','arbiter','member') NOT NULL DEFAULT 'member',
  -- pending = signed up, waiting for an admin; disabled = can't log in or enter events.
  status          ENUM('pending','active','disabled','rejected') NOT NULL DEFAULT 'pending',
  -- The All players record this account is (matched by email when approved).
  player_id       VARCHAR(64)  NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by      INT UNSIGNED NULL,
  approved_at     DATETIME     NULL,
  approved_by     INT UNSIGNED NULL,
  last_login_at   DATETIME     NULL,
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY ix_users_player (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One profile per user (Profile › Personal info). Dates are yyyy-mm-dd.
CREATE TABLE IF NOT EXISTS profiles (
  user_id             INT UNSIGNED PRIMARY KEY,
  photo_upload_id     VARCHAR(64)  NULL,
  prefix              VARCHAR(16)  NOT NULL DEFAULT '',
  first_name          VARCHAR(100) NOT NULL DEFAULT '',
  middle_name         VARCHAR(100) NOT NULL DEFAULT '',
  last_name           VARCHAR(100) NOT NULL DEFAULT '',
  email               VARCHAR(191) NOT NULL DEFAULT '',
  phone_country       CHAR(2)      NOT NULL DEFAULT 'AU',
  phone               VARCHAR(32)  NOT NULL DEFAULT '',
  street              VARCHAR(191) NOT NULL DEFAULT '',
  apartment           VARCHAR(100) NOT NULL DEFAULT '',
  suburb              VARCHAR(100) NOT NULL DEFAULT '',
  state               VARCHAR(64)  NOT NULL DEFAULT '',
  postcode            VARCHAR(16)  NOT NULL DEFAULT '',
  country             CHAR(2)      NOT NULL DEFAULT 'AU',
  dob                 DATE         NULL,
  sex                 VARCHAR(32)  NOT NULL DEFAULT '',
  citizenship         CHAR(2)      NOT NULL DEFAULT '',
  occupation          VARCHAR(100) NOT NULL DEFAULT '',
  clubs               VARCHAR(255) NOT NULL DEFAULT '',
  fide_id             VARCHAR(16)  NOT NULL DEFAULT '',
  acf_id              VARCHAR(16)  NOT NULL DEFAULT '',
  fide_standard       VARCHAR(8)   NOT NULL DEFAULT '',
  fide_rapid          VARCHAR(8)   NOT NULL DEFAULT '',
  fide_blitz          VARCHAR(8)   NOT NULL DEFAULT '',
  acf_rating          VARCHAR(8)   NOT NULL DEFAULT '',
  federation          VARCHAR(3)   NOT NULL DEFAULT '',
  k_fide              VARCHAR(4)   NOT NULL DEFAULT '',
  title               VARCHAR(8)   NOT NULL DEFAULT '',
  join_date           DATE         NULL,
  renew_date          DATE         NULL,
  -- [{ "kind": "join" | "renew", "date": "yyyy-mm-dd" }, …] oldest first
  membership_history  JSON         NULL,
  -- First full save; fields switched off in Page Config are view-only for the member after this.
  completed_at        DATETIME     NULL,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time password reset links (only the SHA-256 of the token is stored).
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash  CHAR(64)     PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME     NOT NULL,
  used_at     DATETIME     NULL,
  KEY ix_resets_user (user_id),
  CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Roles and permissions ----------

-- The rows of User management › Roles and permissions.
CREATE TABLE IF NOT EXISTS permissions (
  perm_key     VARCHAR(64)  PRIMARY KEY,
  group_name   VARCHAR(64)  NOT NULL,
  label        VARCHAR(191) NOT NULL,
  -- Scoped rows have a condition dropdown (scopes = the choices, comma separated).
  scopes       VARCHAR(191) NOT NULL DEFAULT '',
  sort_order   INT          NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One cell of the matrix. role 'visitor' = not logged in. Admin is always allowed (not stored).
-- scope: all | approval | own | own_approval | assigned  (NULL on simple rows)
CREATE TABLE IF NOT EXISTS role_permissions (
  role      ENUM('visitor','member','arbiter','organiser') NOT NULL,
  perm_key  VARCHAR(64) NOT NULL,
  allowed   TINYINT(1)  NOT NULL DEFAULT 0,
  scope     VARCHAR(16) NULL,
  PRIMARY KEY (role, perm_key),
  CONSTRAINT fk_roleperm_perm FOREIGN KEY (perm_key) REFERENCES permissions (perm_key) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Files ----------

-- Uploaded files live in /uploads on the web server; this is the index.
CREATE TABLE IF NOT EXISTS uploads (
  id           VARCHAR(64)  PRIMARY KEY,
  file_name    VARCHAR(255) NOT NULL,
  mime         VARCHAR(127) NOT NULL,
  size_bytes   INT UNSIGNED NOT NULL,
  -- Relative to the site folder, e.g. uploads/2026/10/as-lq3x9a1b.png
  path         VARCHAR(255) NOT NULL,
  -- public = logos, backgrounds; private = profile photos, documents (checked on download)
  visibility   ENUM('public','private') NOT NULL DEFAULT 'public',
  uploaded_by  INT UNSIGNED NULL,
  uploaded_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin › Document › Add document.
CREATE TABLE IF NOT EXISTS documents (
  id           VARCHAR(64)  PRIMARY KEY,
  title        VARCHAR(191) NOT NULL,
  description  TEXT         NULL,
  upload_id    VARCHAR(64)  NOT NULL,
  -- Roles that can see and download it, e.g. ["organiser","arbiter"] (admin always can).
  visible_to   JSON         NOT NULL,
  created_by   INT UNSIGNED NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_documents_upload FOREIGN KEY (upload_id) REFERENCES uploads (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Brand, menus, settings ----------

-- Palettes, typography sets, backgrounds, logo sets and menu sets, each as one JSON document.
CREATE TABLE IF NOT EXISTS design_items (
  slice       ENUM('palettes','typography','backgrounds','logos','menus') NOT NULL,
  id          VARCHAR(64) NOT NULL,
  name        VARCHAR(191) NOT NULL,
  builtin     TINYINT(1)  NOT NULL DEFAULT 0,
  sort_order  INT         NOT NULL DEFAULT 0,
  data        JSON        NOT NULL,
  updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by  INT UNSIGNED NULL,
  PRIMARY KEY (slice, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Site-wide values: 'applied' (which set of each kind the site wears), 'calendar_view', 'event_book', 'page_config'.
CREATE TABLE IF NOT EXISTS settings (
  setting_key  VARCHAR(64) PRIMARY KEY,
  value        JSON        NOT NULL,
  updated_at   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Club data ----------

CREATE TABLE IF NOT EXISTS event_categories (
  id          VARCHAR(64)  PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  -- ColorRef: { "token": "primary", "alpha": 100 } or { "hex": "#aabbcc", "alpha": 100 }
  color       JSON         NOT NULL,
  sort_order  INT          NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin › All players.
CREATE TABLE IF NOT EXISTS players (
  id             VARCHAR(64)  PRIMARY KEY,
  last_name      VARCHAR(100) NOT NULL DEFAULT '',
  first_name     VARCHAR(100) NOT NULL DEFAULT '',
  dob            DATE         NULL,
  gender         VARCHAR(32)  NOT NULL DEFAULT '',
  fed            VARCHAR(3)   NOT NULL DEFAULT '',
  title          VARCHAR(8)   NOT NULL DEFAULT '',
  fide_id        VARCHAR(16)  NOT NULL DEFAULT '',
  k_fide         VARCHAR(4)   NOT NULL DEFAULT '',
  fide_standard  VARCHAR(8)   NOT NULL DEFAULT '',
  fide_rapid     VARCHAR(8)   NOT NULL DEFAULT '',
  fide_blitz     VARCHAR(8)   NOT NULL DEFAULT '',
  acf_id         VARCHAR(16)  NOT NULL DEFAULT '',
  acf_rating     VARCHAR(8)   NOT NULL DEFAULT '',
  email          VARCHAR(191) NOT NULL DEFAULT '',
  added_at       VARCHAR(32)  NOT NULL DEFAULT '',
  sort_order     INT          NOT NULL DEFAULT 0,
  KEY ix_players_email (email),
  KEY ix_players_name (last_name, first_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Upcoming events. Times are HH:mm (24 h).
CREATE TABLE IF NOT EXISTS events (
  id              VARCHAR(64)  PRIMARY KEY,
  name            VARCHAR(191) NOT NULL DEFAULT '',
  category_id     VARCHAR(64)  NULL,
  start_date      DATE         NOT NULL,
  end_date        DATE         NOT NULL,
  all_day         TINYINT(1)   NOT NULL DEFAULT 0,
  start_time      CHAR(5)      NOT NULL DEFAULT '10:00',
  end_time        CHAR(5)      NOT NULL DEFAULT '11:00',
  location        VARCHAR(191) NOT NULL DEFAULT '',
  description     TEXT         NULL,
  -- Recurring on these weekdays, e.g. [1,3] (0 = Sunday); NULL = every day of the range.
  weekdays        JSON         NULL,
  member_only     TINYINT(1)   NOT NULL DEFAULT 0,
  citizens_only   TINYINT(1)   NOT NULL DEFAULT 0,
  -- The full details page (schedule, venue, fees, rules, pairing settings…) except divisions.
  details         JSON         NULL,
  -- Final standings uploaded by the organiser (EventResults).
  results         JSON         NULL,
  -- pending = waiting for an admin (hidden from the public); rejected = sent back to its organiser.
  status          ENUM('approved','pending','rejected') NOT NULL DEFAULT 'approved',
  created_by      INT UNSIGNED NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_events_dates (start_date, end_date),
  KEY ix_events_owner (created_by),
  CONSTRAINT fk_events_category FOREIGN KEY (category_id) REFERENCES event_categories (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS event_divisions (
  id            VARCHAR(64)  NOT NULL,
  event_id      VARCHAR(64)  NOT NULL,
  name          VARCHAR(100) NOT NULL DEFAULT '',
  rating_range  VARCHAR(64)  NOT NULL DEFAULT '',
  sort_order    INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, id),
  CONSTRAINT fk_divisions_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Arbiters a TO (or admin) assigned to run the tournament's pairings.
CREATE TABLE IF NOT EXISTS event_arbiters (
  event_id     VARCHAR(64)  NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  assigned_by  INT UNSIGNED NULL,
  assigned_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id, user_id),
  CONSTRAINT fk_arbiters_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE,
  CONSTRAINT fk_arbiters_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tournament entries (a copy of the player's details when they entered).
CREATE TABLE IF NOT EXISTS event_entries (
  id             VARCHAR(64)  NOT NULL,
  event_id       VARCHAR(64)  NOT NULL,
  player_id      VARCHAR(64)  NULL,
  name           VARCHAR(191) NOT NULL DEFAULT '',
  email          VARCHAR(191) NOT NULL DEFAULT '',
  fide_id        VARCHAR(16)  NOT NULL DEFAULT '',
  acf_id         VARCHAR(16)  NOT NULL DEFAULT '',
  fide_standard  VARCHAR(8)   NOT NULL DEFAULT '',
  fide_rapid     VARCHAR(8)   NOT NULL DEFAULT '',
  fide_blitz     VARCHAR(8)   NOT NULL DEFAULT '',
  acf_rating     VARCHAR(8)   NOT NULL DEFAULT '',
  fed            VARCHAR(3)   NOT NULL DEFAULT '',
  dob            DATE         NULL,
  gender         VARCHAR(32)  NOT NULL DEFAULT '',
  title          VARCHAR(8)   NOT NULL DEFAULT '',
  k_fide         VARCHAR(4)   NOT NULL DEFAULT '',
  source         ENUM('signup','import','manual') NULL,
  division_id    VARCHAR(64)  NOT NULL DEFAULT '',
  -- Fixed when round 1 is generated.
  start_no       INT UNSIGNED NULL,
  entered_at     VARCHAR(32)  NOT NULL DEFAULT '',
  sort_order     INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, id),
  KEY ix_entries_email (email),
  KEY ix_entries_player (player_id),
  CONSTRAINT fk_entries_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Requested / organiser-set byes. reason 'disabled' = added when the player's account was disabled.
CREATE TABLE IF NOT EXISTS event_byes (
  id          VARCHAR(64)  NOT NULL,
  event_id    VARCHAR(64)  NOT NULL,
  entry_id    VARCHAR(64)  NOT NULL,
  round_no    INT UNSIGNED NOT NULL,
  set_by      ENUM('player','organiser') NOT NULL,
  set_at      VARCHAR(32)  NOT NULL DEFAULT '',
  value       DECIMAL(2,1) NULL,
  reason      VARCHAR(16)  NULL,
  -- Handled on the Byes page (a player's row is Updated when all their byes are).
  done        TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, id),
  KEY ix_byes_entry (event_id, entry_id, round_no),
  CONSTRAINT fk_byes_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One round of pairings (uploaded from Vega / Swiss-Manager or generated with Gacrux).
CREATE TABLE IF NOT EXISTS pairing_rounds (
  event_id     VARCHAR(64)  NOT NULL,
  round_no     INT UNSIGNED NOT NULL,
  title        VARCHAR(191) NOT NULL DEFAULT '',
  file_name    VARCHAR(191) NOT NULL DEFAULT '',
  released_at  VARCHAR(32)  NOT NULL DEFAULT '',
  is_generated TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, round_no),
  CONSTRAINT fk_rounds_event FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Boards of a round. black_* are NULL for a bye.
-- result: "1 - 0", "½ - ½", "0 - 1", "+ - -" / "- - +" (forfeits), "" = not played yet.
CREATE TABLE IF NOT EXISTS pairing_boards (
  event_id         VARCHAR(64)  NOT NULL,
  round_no         INT UNSIGNED NOT NULL,
  board_no         INT UNSIGNED NOT NULL,
  white_entry_id   VARCHAR(64)  NULL,
  white_sno        VARCHAR(8)   NOT NULL DEFAULT '',
  white_title      VARCHAR(8)   NOT NULL DEFAULT '',
  white_name       VARCHAR(191) NOT NULL DEFAULT '',
  white_fed        VARCHAR(3)   NOT NULL DEFAULT '',
  white_pts        VARCHAR(8)   NOT NULL DEFAULT '',
  black_entry_id   VARCHAR(64)  NULL,
  black_sno        VARCHAR(8)   NULL,
  black_title      VARCHAR(8)   NULL,
  black_name       VARCHAR(191) NULL,
  black_fed        VARCHAR(3)   NULL,
  black_pts        VARCHAR(8)   NULL,
  result           VARCHAR(16)  NOT NULL DEFAULT '',
  bye_kind         ENUM('pab','half','zero') NULL,
  -- Set when the result was filled in because a player's account was disabled.
  auto_forfeit     TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, round_no, board_no),
  CONSTRAINT fk_boards_round FOREIGN KEY (event_id, round_no) REFERENCES pairing_rounds (event_id, round_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Review and approval ----------

-- event_new: a TO's new event (payload = null, the event row has status 'pending').
-- event_change: an edit to an approved event (payload = the proposed event fields; the live event is untouched until approved).
-- member_signup: a self-registered member (target = users.id).
CREATE TABLE IF NOT EXISTS approvals (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind          ENUM('event_new','event_change','member_signup') NOT NULL,
  target_id     VARCHAR(64)  NOT NULL,
  payload       JSON         NULL,
  status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  submitted_by  INT UNSIGNED NULL,
  submitted_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by   INT UNSIGNED NULL,
  reviewed_at   DATETIME     NULL,
  note          VARCHAR(500) NULL,
  KEY ix_approvals_status (status, kind),
  KEY ix_approvals_target (kind, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Contact Us ----------

-- Messages from the Contact Us form (Admin › Enquiries). ip_hash is only for limiting repeat sends.
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

-- ---------- Audit log (User management › Log) ----------

-- One row per changed field: profile edits, role changes, disable/enable, password resets,
-- approvals and permission changes. field / old_value / new_value are NULL for plain actions.
CREATE TABLE IF NOT EXISTS audit_log (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_id        INT UNSIGNED NULL,
  target_user_id  INT UNSIGNED NULL,
  -- profile_edit | user_edit | role_change | disable | enable | password_reset | approve | reject | user_create | permission_change | event_approve | event_reject
  action          VARCHAR(32)  NOT NULL,
  field           VARCHAR(64)  NULL,
  old_value       TEXT         NULL,
  new_value       TEXT         NULL,
  KEY ix_audit_at (at),
  KEY ix_audit_target (target_user_id, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
