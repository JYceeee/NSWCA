-- Principles: run ONCE on a database made before the Byes page's Status column.
-- A new database doesn't need this file: schema.sql already has it.
ALTER TABLE event_byes ADD COLUMN done TINYINT(1) NOT NULL DEFAULT 0 AFTER reason;
