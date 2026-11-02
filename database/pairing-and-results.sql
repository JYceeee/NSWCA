-- Pairing and results: separate pairings per division, the Result section's Release step, and the Results pages.
-- Run once on an existing database (phpMyAdmin › SQL, or: mysql -h HOST -u USER -p DB < pairing-and-results.sql).
-- It keeps every event, entry, round and board. A new database gets all of this from schema.sql and seed.sql instead.

SET NAMES utf8mb4;

-- ---------- Rounds and boards belong to a division ('' = the tournament has none) ----------

ALTER TABLE pairing_boards DROP FOREIGN KEY fk_boards_round;

ALTER TABLE pairing_rounds
  ADD COLUMN division_id VARCHAR(64) NOT NULL DEFAULT '' AFTER event_id,
  -- When the round's results were last released ('' = not yet).
  ADD COLUMN results_released_at VARCHAR(32) NOT NULL DEFAULT '' AFTER released_at,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (event_id, division_id, round_no);

ALTER TABLE pairing_boards
  ADD COLUMN division_id VARCHAR(64) NOT NULL DEFAULT '' AFTER event_id,
  ADD COLUMN white_rating VARCHAR(8) NOT NULL DEFAULT '' AFTER white_fed,
  ADD COLUMN black_rating VARCHAR(8) NULL AFTER black_fed,
  -- What the public sees. result is the working copy, copied here on Release.
  ADD COLUMN released_result VARCHAR(16) NOT NULL DEFAULT '' AFTER result,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (event_id, division_id, round_no, board_no),
  ADD CONSTRAINT fk_boards_round FOREIGN KEY (event_id, division_id, round_no)
    REFERENCES pairing_rounds (event_id, division_id, round_no) ON DELETE CASCADE;

-- ---------- External results links and the Fed column ----------

ALTER TABLE event_divisions
  ADD COLUMN results_url VARCHAR(500) NOT NULL DEFAULT '' AFTER rating_range;

ALTER TABLE event_entries
  -- Australian state code, e.g. NSW (shown in Fed on the results).
  ADD COLUMN state VARCHAR(3) NOT NULL DEFAULT '' AFTER fed;

-- Entries made before this change take the state from the player's profile.
UPDATE event_entries e
JOIN profiles p ON p.email <> '' AND LOWER(p.email) = LOWER(e.email)
SET e.state = CASE p.state
    WHEN 'Australian Capital Territory' THEN 'ACT'
    WHEN 'New South Wales' THEN 'NSW'
    WHEN 'Northern Territory' THEN 'NT'
    WHEN 'Queensland' THEN 'QLD'
    WHEN 'South Australia' THEN 'SA'
    WHEN 'Tasmania' THEN 'TAS'
    WHEN 'Victoria' THEN 'VIC'
    WHEN 'Western Australia' THEN 'WA'
    ELSE ''
  END
WHERE p.country = 'AU';

-- ---------- Roles and permissions ----------

INSERT INTO permissions (perm_key, group_name, label, scopes, sort_order) VALUES
  ('page.results', 'Results', 'Open page', '', 22),
  ('results.manage', 'Results', 'Enter and release results', 'all,own,assigned', 23)
ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), label = VALUES(label), scopes = VALUES(scopes), sort_order = VALUES(sort_order);

INSERT IGNORE INTO role_permissions (role, perm_key, allowed, scope) VALUES
  ('visitor', 'page.results', 1, NULL),
  ('member', 'page.results', 1, NULL),
  ('arbiter', 'page.results', 1, NULL),
  ('organiser', 'page.results', 1, NULL),
  ('visitor', 'results.manage', 0, 'all'),
  ('member', 'results.manage', 0, 'all'),
  ('arbiter', 'results.manage', 1, 'assigned'),
  ('organiser', 'results.manage', 1, 'own');
