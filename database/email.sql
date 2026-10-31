USE nswcaweb;
SET NAMES utf8mb4;

-- New rows in Roles and permissions
INSERT INTO permissions (perm_key, group_name, label, scopes, sort_order) VALUES
  ('page.emails', 'Email templates', 'Open page and see each template''s history', '', 41),
  ('emails.edit', 'Email templates', 'Edit templates and restore earlier versions', '', 42),
  ('emails.log', 'Email templates', 'View log', '', 43)
ON DUPLICATE KEY UPDATE group_name = VALUES(group_name), label = VALUES(label), scopes = VALUES(scopes), sort_order = VALUES(sort_order);

-- Move the later rows down so Email templates sits after Enquiries
UPDATE permissions SET sort_order = CASE perm_key
  WHEN 'page.documents' THEN 44
  WHEN 'documents.download' THEN 45
  WHEN 'documents.add' THEN 46
  WHEN 'documents.delete' THEN 47
  WHEN 'page.users' THEN 48
  WHEN 'users.create' THEN 49
  WHEN 'users.edit' THEN 50
  WHEN 'users.resetPassword' THEN 51
  WHEN 'users.disable' THEN 52
  WHEN 'users.log' THEN 53
  WHEN 'users.permissions' THEN 54
  WHEN 'users.import' THEN 55
  WHEN 'page.approvals' THEN 56
  WHEN 'approvals.events' THEN 57
  WHEN 'approvals.changes' THEN 58
  WHEN 'approvals.signups' THEN 59
  ELSE sort_order END;

-- Off for every role by default (Admin always has everything)
INSERT IGNORE INTO role_permissions (role, perm_key, allowed, scope) VALUES
  ('visitor', 'page.emails', 0, NULL),
  ('member', 'page.emails', 0, NULL),
  ('arbiter', 'page.emails', 0, NULL),
  ('organiser', 'page.emails', 0, NULL),
  ('visitor', 'emails.edit', 0, NULL),
  ('member', 'emails.edit', 0, NULL),
  ('arbiter', 'emails.edit', 0, NULL),
  ('organiser', 'emails.edit', 0, NULL),
  ('visitor', 'emails.log', 0, NULL),
  ('member', 'emails.log', 0, NULL),
  ('arbiter', 'emails.log', 0, NULL),
  ('organiser', 'emails.log', 0, NULL);
