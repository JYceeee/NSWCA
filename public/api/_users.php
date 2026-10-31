<?php
// Accounts: sign in / up, password resets, profiles, User management, Review and approval, Roles and permissions.
declare(strict_types=1);

// ---------- Profile <-> profiles table ----------

/** App Profile field => column. */
const PROFILE_COLS = [
    'prefix' => 'prefix', 'firstName' => 'first_name', 'middleName' => 'middle_name', 'lastName' => 'last_name', 'email' => 'email',
    'phoneCountry' => 'phone_country', 'phone' => 'phone', 'street' => 'street', 'apartment' => 'apartment', 'suburb' => 'suburb', 'state' => 'state',
    'postcode' => 'postcode', 'country' => 'country', 'dob' => 'dob', 'sex' => 'sex', 'citizenship' => 'citizenship', 'occupation' => 'occupation',
    'clubs' => 'clubs', 'fideId' => 'fide_id', 'acfId' => 'acf_id', 'fideStandard' => 'fide_standard', 'fideRapid' => 'fide_rapid', 'fideBlitz' => 'fide_blitz',
    'acfRating' => 'acf_rating', 'federation' => 'federation', 'kFide' => 'k_fide', 'title' => 'title', 'joinDate' => 'join_date', 'renewDate' => 'renew_date',
];
const PROFILE_DATES = ['dob', 'joinDate', 'renewDate'];

function profile_out(int $userId): ?array
{
    $r = row('SELECT p.*, up.mime FROM profiles p LEFT JOIN uploads up ON up.id = p.photo_upload_id WHERE p.user_id = ?', [$userId]);
    if (!$r) return null;
    $p = ['photo' => $r['photo_upload_id'] ? ['assetId' => $r['photo_upload_id'], 'mime' => $r['mime'] ?? 'image/jpeg'] : null];
    foreach (PROFILE_COLS as $k => $col) $p[$k] = (string) ($r[$col] ?? '');
    $h = dec($r['membership_history']);
    if ($h) $p['membershipHistory'] = $h;
    if ($r['completed_at']) $p['completed'] = true;
    return $p;
}

/** Plain-text value of each profile field, for comparing and the log. */
function profile_flat(?array $p): array
{
    $out = [];
    foreach (array_keys(PROFILE_COLS) as $k) $out[$k] = s($p[$k] ?? '');
    $out['photo'] = s($p['photo']['assetId'] ?? '');
    $out['membershipHistory'] = isset($p['membershipHistory']) && $p['membershipHistory'] ? canon($p['membershipHistory']) : '';
    return $out;
}

/** Saves a profile; returns the fields that changed [field => [old, new]]. */
function save_profile(int $userId, array $p): array
{
    $before = profile_flat(profile_out($userId));
    $after = profile_flat($p);
    $email = strtolower(trim($after['email']));
    if ($email !== '') {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(400, 'Enter a valid email address.');
        if (value('SELECT 1 FROM users WHERE LOWER(email) = ? AND id <> ?', [$email, $userId])) fail(409, 'Another account already uses that email.');
    }
    $photo = $after['photo'] !== '' ? $after['photo'] : null;
    $cols = ['user_id', 'photo_upload_id', 'membership_history'];
    $vals = [$userId, $photo, !empty($p['membershipHistory']) ? enc($p['membershipHistory']) : null];
    foreach (PROFILE_COLS as $k => $col) {
        $cols[] = $col;
        $vals[] = in_array($k, PROFILE_DATES, true) ? sql_date($after[$k]) : mb_substr($after[$k], 0, 191);
    }
    $set = implode(', ', array_map(fn($c) => "$c = VALUES($c)", array_slice($cols, 1)));
    q('INSERT INTO profiles (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ") ON DUPLICATE KEY UPDATE $set", $vals);
    // Sign-in email follows the profile.
    if ($email !== '') q('UPDATE users SET email = ? WHERE id = ?', [$email, $userId]);
    $changes = [];
    foreach ($after as $k => $v) if ($v !== $before[$k]) $changes[$k] = [$before[$k], $v];
    return $changes;
}

// ---------- Sign in, sign up, passwords ----------

function user_public(array $u): array
{
    return ['id' => (int) $u['id'], 'username' => $u['username'], 'email' => $u['email'], 'role' => $u['role'], 'name' => display_name($u), 'playerId' => $u['player_id']];
}

function check_password(string $pw): void
{
    if (mb_strlen($pw) < 8) fail(400, 'Use at least 8 characters for the password.');
}

function check_username(string $name): void
{
    if (!preg_match('/^[A-Za-z0-9._-]{3,64}$/', $name)) fail(400, 'A username is 3–64 letters, numbers, dots, dashes or underscores.');
}

function login(): array
{
    $login = strtolower(str_in('login', 191));
    $pw = (string) input('password', '');
    $u = row('SELECT * FROM users WHERE LOWER(username) = ? OR LOWER(email) = ? LIMIT 1', [$login, $login]);
    if (!$u || !password_verify($pw, $u['password_hash'])) {
        usleep(400000);
        fail(401, 'That username or password isn’t right.');
    }
    if ($u['status'] === 'pending') fail(403, 'Your sign-up is waiting for an admin to approve it.');
    if ($u['status'] === 'rejected') fail(403, 'Your sign-up wasn’t approved. Contact the club for help.');
    if ($u['status'] === 'disabled') fail(403, 'Your account is disabled. Contact the club for help.');
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $u['id']]);
    start_session();
    session_regenerate_id(true);
    $_SESSION['uid'] = (int) $u['id'];
    q('UPDATE users SET last_login_at = ? WHERE id = ?', [now(), $u['id']]);
    return ['ok' => true];
}

function logout(): array
{
    start_session();
    $_SESSION = [];
    session_destroy();
    return ['ok' => true];
}

/** Sign up as a member (waits for approval). The very first account sets up the site as its Admin. */
function register(): array
{
    $username = str_in('username', 64);
    $email = strtolower(str_in('email', 191));
    $pw = (string) input('password', '');
    $first = str_in('firstName', 100);
    $last = str_in('lastName', 100);
    check_username($username);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(400, 'Enter a valid email address.');
    check_password($pw);
    if ($first === '' || $last === '') fail(400, 'Enter your first and last name.');
    return tx(function () use ($username, $email, $pw, $first, $last) {
        if (value('SELECT 1 FROM users WHERE LOWER(username) = ?', [strtolower($username)])) fail(409, 'That username is taken.');
        if (value('SELECT 1 FROM users WHERE LOWER(email) = ?', [$email])) fail(409, 'An account with that email already exists. Try Forgot password.');
        $first_user = !value('SELECT 1 FROM users LIMIT 1');
        q('INSERT INTO users (username, email, password_hash, role, status, approved_at) VALUES (?, ?, ?, ?, ?, ?)',
            [$username, $email, password_hash($pw, PASSWORD_DEFAULT), $first_user ? 'admin' : 'member', $first_user ? 'active' : 'pending', $first_user ? now() : null]);
        $id = (int) db()->lastInsertId();
        q('INSERT INTO profiles (user_id, first_name, last_name, email) VALUES (?, ?, ?, ?)', [$id, $first, $last, $email]);
        if ($first_user) {
            start_session();
            session_regenerate_id(true);
            $_SESSION['uid'] = $id;
            return ['ok' => true, 'admin' => true];
        }
        q("INSERT INTO approvals (kind, target_id, submitted_by) VALUES ('member_signup', ?, ?)", [(string) $id, $id]);
        return ['ok' => true, 'pending' => true];
    });
}

function needs_setup(): bool
{
    return !value('SELECT 1 FROM users LIMIT 1');
}

/** A one-time link that sets a new password (valid 48 hours). */
function reset_link(int $userId): string
{
    $token = bin2hex(random_bytes(24));
    q('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [hash('sha256', $token), $userId, gmdate('Y-m-d H:i:s', time() + 48 * 3600)]);
    return site_url() . '/#reset/' . $token;
}

function mail_reset(array $u, string $link, bool $welcome = false): bool
{
    $vars = ['name' => display_name($u), 'username' => $u['username'], 'link' => $link];
    return send_template($welcome ? 'account_created' : 'password_reset', $u['email'], $vars);
}

function forgot(): array
{
    $login = strtolower(str_in('login', 191));
    $u = row("SELECT u.*, p.first_name, p.last_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id
              WHERE (LOWER(u.username) = ? OR LOWER(u.email) = ?) AND u.status = 'active' LIMIT 1", [$login, $login]);
    if ($u) mail_reset($u, reset_link((int) $u['id']));
    // Same answer either way, so this can't be used to find accounts.
    return ['ok' => true];
}

function reset_password(): array
{
    $token = str_in('token', 100);
    $pw = (string) input('password', '');
    check_password($pw);
    return tx(function () use ($token, $pw) {
        $r = row('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? FOR UPDATE', [hash('sha256', $token), now()]);
        if (!$r) fail(400, 'This link has expired or was already used. Ask for a new one.');
        q('UPDATE password_resets SET used_at = ? WHERE token_hash = ?', [now(), $r['token_hash']]);
        q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $r['user_id']]);
        return ['ok' => true];
    });
}

function change_password(): array
{
    $me = require_login();
    $hash = value('SELECT password_hash FROM users WHERE id = ?', [$me['id']]);
    if (!password_verify((string) input('current', ''), $hash)) fail(400, 'Your current password isn’t right.');
    $pw = (string) input('password', '');
    check_password($pw);
    q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($pw, PASSWORD_DEFAULT), $me['id']]);
    return ['ok' => true];
}

/** Fields this user can't change on $userId's profile: the ones switched off in Page Config, after the first full save. */
function locked_profile_fields(int $userId): array
{
    if (is_admin() || can('users.edit')) return [];
    if (!value('SELECT completed_at FROM profiles WHERE user_id = ?', [$userId])) return [];
    $fields = setting('page_config')['profileFields'] ?? [];
    $locked = array_keys(array_filter((array) $fields, fn($on) => $on === false));
    return in_array('phone', $locked, true) ? [...$locked, 'phoneCountry'] : $locked;
}

/** Locked fields go back to their saved values, whatever was sent. */
function keep_locked(array $before, array $p, array $locked): array
{
    foreach ($locked as $k) $p[$k] = $before[$k] ?? ($k === 'photo' ? null : '');
    return $p;
}

/** The dates only Admin can type. Anyone else keeps the saved ones. */
function keep_membership(array $before, array $p): array
{
    foreach (['joinDate', 'renewDate'] as $k) $p[$k] = $before[$k] ?? '';
    $p['membershipHistory'] = $before['membershipHistory'] ?? [];
    return $p;
}

/** Join/Renew: a member's changed dates only ask for it – the date is always the server's today. */
function stamp_membership(array $before, array $p): array
{
    $asked = s($p['joinDate'] ?? '') !== s($before['joinDate'] ?? '') || s($p['renewDate'] ?? '') !== s($before['renewDate'] ?? '');
    $out = keep_membership($before, $p);
    if (!$asked || !can('profile.joinRenew')) return $out;
    $today = date('Y-m-d');
    $history = $out['membershipHistory'];
    if (!$history) {
        if ($out['joinDate'] !== '') $history[] = ['kind' => 'join', 'date' => $out['joinDate']];
        if ($out['renewDate'] !== '') $history[] = ['kind' => 'renew', 'date' => $out['renewDate']];
    }
    $kind = $out['joinDate'] === '' ? 'join' : 'renew';
    $out[$kind === 'join' ? 'joinDate' : 'renewDate'] = $today;
    $history[] = ['kind' => $kind, 'date' => $today];
    $out['membershipHistory'] = $history;
    return $out;
}

const PROFILE_REQUIRED = ['firstName', 'lastName', 'email', 'phone', 'street', 'suburb', 'state', 'postcode', 'country', 'dob', 'sex'];

function save_my_profile(): array
{
    $me = require_login();
    need('profile.edit', [], 'edit the profile');
    $p = input('profile');
    if (!is_array($p)) fail(400, 'No profile sent.');
    tx(function () use ($me, $p) {
        $before = profile_out($me['id']) ?? [];
        $p = keep_locked($before, $p, locked_profile_fields($me['id']));
        if (!is_admin()) $p = stamp_membership($before, $p);
        save_profile($me['id'], $p);
        // Only a complete profile counts as the first save (Join/Renew on an empty one doesn't).
        $now = profile_flat(profile_out($me['id']));
        if (!array_filter(PROFILE_REQUIRED, fn($k) => $now[$k] === '')) q('UPDATE profiles SET completed_at = COALESCE(completed_at, ?) WHERE user_id = ?', [now(), $me['id']]);
    });
    return ['profile' => profile_out($me['id'])];
}

// ---------- User management ----------

function user_row(int $id): array
{
    return row('SELECT u.*, p.first_name, p.last_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?', [$id]) ?? fail(404, 'That user no longer exists.');
}

function list_users(): array
{
    need('users.edit', [], 'see users');
    $out = [];
    foreach (rows('SELECT u.id, u.username, u.email, u.role, u.status, u.player_id, u.created_at, u.last_login_at, p.first_name, p.last_name
                   FROM users u LEFT JOIN profiles p ON p.user_id = u.id ORDER BY u.id') as $u)
        $out[] = [...user_public($u), 'status' => $u['status'], 'createdAt' => $u['created_at'], 'lastLoginAt' => $u['last_login_at']];
    return ['users' => $out];
}

function get_user(): array
{
    need('users.edit', [], 'see users');
    $id = (int) input('id');
    $u = user_row($id);
    return ['user' => [...user_public($u), 'status' => $u['status'], 'createdAt' => $u['created_at'], 'lastLoginAt' => $u['last_login_at']], 'profile' => profile_out($id)];
}

function create_user(): array
{
    need('users.create', [], 'create users');
    $username = str_in('username', 64);
    $email = strtolower(str_in('email', 191));
    $role = str_in('role', 16);
    check_username($username);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(400, 'Enter a valid email address.');
    if (!in_array($role, ROLES, true)) fail(400, 'Pick a role.');
    $profile = is_array(input('profile')) ? input('profile') : [];
    if (!is_admin()) $profile = keep_membership([], $profile);
    return tx(function () use ($username, $email, $role, $profile) {
        if (value('SELECT 1 FROM users WHERE LOWER(username) = ?', [strtolower($username)])) fail(409, 'That username is taken.');
        if (value('SELECT 1 FROM users WHERE LOWER(email) = ?', [$email])) fail(409, 'An account with that email already exists.');
        // A random password nobody knows: they set their own from the emailed link.
        q("INSERT INTO users (username, email, password_hash, role, status, created_by, approved_at, approved_by) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)",
            [$username, $email, password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT), $role, my_id(), now(), my_id()]);
        $id = (int) db()->lastInsertId();
        save_profile($id, [...$profile, 'email' => $email]);
        link_user_player($id);
        audit('user_create', $id, 'role', null, $role);
        $link = reset_link($id);
        $sent = mail_reset(user_row($id), $link, true);
        return ['id' => $id, 'link' => $link, 'mailed' => $sent];
    });
}

/** User details + profile saved from User management; every changed field goes in the log. */
function save_user(): array
{
    need('users.edit', [], 'edit users');
    $id = (int) input('id');
    $in = is_array(input('user')) ? input('user') : [];
    $profile = input('profile');
    return tx(function () use ($id, $in, $profile) {
        $u = user_row($id);
        if (isset($in['username']) && $in['username'] !== $u['username']) {
            check_username((string) $in['username']);
            if (value('SELECT 1 FROM users WHERE LOWER(username) = ? AND id <> ?', [strtolower((string) $in['username']), $id])) fail(409, 'That username is taken.');
            q('UPDATE users SET username = ? WHERE id = ?', [$in['username'], $id]);
            audit('user_edit', $id, 'username', $u['username'], $in['username']);
        }
        if (isset($in['role']) && $in['role'] !== $u['role']) {
            if (!in_array($in['role'], ROLES, true)) fail(400, 'Pick a role.');
            if ($u['role'] === 'admin' && (int) value("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'") <= 1) fail(400, 'This is the only admin – make someone else an admin first.');
            q('UPDATE users SET role = ? WHERE id = ?', [$in['role'], $id]);
            audit('role_change', $id, 'role', $u['role'], $in['role']);
        }
        if (is_array($profile)) {
            $email = strtolower(trim((string) ($profile['email'] ?? '')));
            if ($email === '') $profile['email'] = $u['email'];
            if (!is_admin()) $profile = keep_membership(profile_out($id) ?? [], $profile);
            foreach (save_profile($id, $profile) as $field => [$old, $new]) audit('profile_edit', $id, $field, $old, $new);
        }
        return get_user_by($id);
    });
}

function get_user_by(int $id): array
{
    $u = user_row($id);
    return ['user' => [...user_public($u), 'status' => $u['status'], 'createdAt' => $u['created_at'], 'lastLoginAt' => $u['last_login_at']], 'profile' => profile_out($id)];
}

function admin_reset_password(): array
{
    need('users.resetPassword', [], 'reset passwords');
    $id = (int) input('id');
    $u = user_row($id);
    $link = reset_link($id);
    $sent = mail_reset($u, $link);
    audit('password_reset', $id);
    return ['link' => $link, 'mailed' => $sent];
}

function set_disabled(bool $disable): array
{
    need('users.disable', [], 'disable users');
    $id = (int) input('id');
    if ($id === my_id()) fail(400, 'You can’t disable your own account.');
    return tx(function () use ($id, $disable) {
        $u = user_row($id);
        if ($disable && $u['status'] === 'disabled') return get_user_by($id);
        if (!$disable && $u['status'] !== 'disabled') return get_user_by($id);
        q('UPDATE users SET status = ? WHERE id = ?', [$disable ? 'disabled' : 'active', $id]);
        if ($disable) forfeit_disabled($id);
        else unforfeit_enabled($id);
        audit($disable ? 'disable' : 'enable', $id, 'status', $u['status'], $disable ? 'disabled' : 'active');
        return get_user_by($id);
    });
}

/** Links an account to its All players record (same email), or lists them as a new player. */
function link_user_player(int $id): void
{
    $u = row('SELECT u.*, p.* FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?', [$id]);
    if (!$u || $u['player_id']) return;
    $email = strtolower(trim($u['email']));
    $pid = value('SELECT id FROM players WHERE LOWER(email) = ? LIMIT 1', [$email]);
    if (!$pid) {
        $pid = uid('pl');
        q('INSERT INTO players (id, last_name, first_name, dob, gender, fed, title, fide_id, k_fide, fide_standard, fide_rapid, fide_blitz, acf_id, acf_rating, email, added_at, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(p2.sort_order), 0) + 1 FROM players p2))', [
            $pid, $u['last_name'] ?? '', $u['first_name'] ?? '', $u['dob'], $u['sex'] ?? '', $u['federation'] ?? '', $u['title'] ?? '', $u['fide_id'] ?? '', $u['k_fide'] ?? '',
            $u['fide_standard'] ?? '', $u['fide_rapid'] ?? '', $u['fide_blitz'] ?? '', $u['acf_id'] ?? '', $u['acf_rating'] ?? '', $email, gmdate('c'),
        ]);
    }
    q('UPDATE users SET player_id = ? WHERE id = ?', [$pid, $id]);
}

function decide_signup(int $userId, bool $approve, string $note = ''): void
{
    need('approvals.signups', [], 'approve sign-ups');
    tx(function () use ($userId, $approve, $note) {
        $u = user_row($userId);
        if ($u['status'] !== 'pending') fail(409, 'This sign-up was already handled.');
        q('UPDATE users SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?', [$approve ? 'active' : 'rejected', now(), my_id(), $userId]);
        q("UPDATE approvals SET status = ?, reviewed_by = ?, reviewed_at = ?, note = ? WHERE kind = 'member_signup' AND target_id = ? AND status = 'pending'",
            [$approve ? 'approved' : 'rejected', my_id(), now(), $note ?: null, (string) $userId]);
        if ($approve) link_user_player($userId);
        audit($approve ? 'approve' : 'reject', $userId, 'status', 'pending', $approve ? 'active' : 'rejected');
        if ($approve) send_template('signup_approved', $u['email'], ['name' => display_name($u), 'site' => site_url() . '/']);
    });
}

function list_log(): array
{
    need('users.log', [], 'see the log');
    $uid = input('userId');
    return ['log' => log_rows($uid ? 'WHERE l.target_user_id = ?' : '', $uid ? [(int) $uid] : [])];
}

function list_email_log(): array
{
    need('emails.log', [], 'see the log');
    return ['log' => log_rows("WHERE l.action IN ('email_edit', 'email_restore')")];
}

function log_rows(string $where, array $args = []): array
{
    $rows = rows("SELECT l.*, a.username AS actor_username, CONCAT_WS(' ', ap.first_name, ap.last_name) AS actor_name,
                         t.username AS target_username, CONCAT_WS(' ', tp.first_name, tp.last_name) AS target_name
                  FROM audit_log l
                  LEFT JOIN users a ON a.id = l.actor_id LEFT JOIN profiles ap ON ap.user_id = l.actor_id
                  LEFT JOIN users t ON t.id = l.target_user_id LEFT JOIN profiles tp ON tp.user_id = l.target_user_id
                  $where ORDER BY l.id DESC LIMIT 1000", $args);
    return array_map(fn($r) => [
        'id' => (int) $r['id'], 'at' => $r['at'], 'action' => $r['action'], 'field' => $r['field'], 'old' => $r['old_value'], 'new' => $r['new_value'],
        'actor' => trim((string) $r['actor_name']) ?: ($r['actor_username'] ?? '—'),
        'targetId' => $r['target_user_id'] === null ? null : (int) $r['target_user_id'],
        'target' => $r['target_user_id'] === null ? null : (trim((string) $r['target_name']) ?: $r['target_username']),
    ], $rows);
}

// ---------- Roles and permissions ----------

function get_permissions(): array
{
    need('users.permissions', [], 'see roles and permissions');
    return ['rows' => array_values(perm_rows()), 'matrix' => perm_matrix()];
}

/** matrix: role => perm_key => false | true | scope. Every changed cell is logged. */
function save_permissions(): array
{
    need('users.permissions', [], 'change roles and permissions');
    $in = input('matrix');
    if (!is_array($in)) fail(400, 'No permissions sent.');
    $rows = perm_rows();
    $old = perm_matrix();
    tx(function () use ($in, $rows, $old) {
        foreach (['visitor', 'member', 'arbiter', 'organiser'] as $role) {
            foreach ($rows as $key => $r) {
                if ($key === 'profile.memberDates' || !array_key_exists($key, $in[$role] ?? [])) continue;
                $v = $in[$role][$key];
                $scope = null;
                if ($v !== false && $r['scopes']) {
                    $scope = is_string($v) && in_array($v, $r['scopes'], true) ? $v : $r['scopes'][0];
                    $v = $scope;
                } elseif ($v !== false) $v = true;
                $was = $old[$role][$key] ?? false;
                if ($was === $v) continue;
                q('INSERT INTO role_permissions (role, perm_key, allowed, scope) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), scope = VALUES(scope)',
                    [$role, $key, $v === false ? 0 : 1, $scope]);
                $label = fn($x) => $x === false ? 'No' : ($x === true ? 'Yes' : $x);
                audit('permission_change', null, "$role · {$r['group']} › {$r['label']}", $label($was), $label($v));
            }
        }
    });
    return ['rows' => array_values(perm_rows()), 'matrix' => (function () {
        // Fresh read (perm_matrix() caches).
        $m = ['visitor' => [], 'member' => [], 'arbiter' => [], 'organiser' => []];
        $rows = perm_rows();
        foreach (rows('SELECT role, perm_key, allowed, scope FROM role_permissions') as $r)
            if (isset($rows[$r['perm_key']])) $m[$r['role']][$r['perm_key']] = !$r['allowed'] ? false : ($rows[$r['perm_key']]['scopes'] ? ($r['scope'] ?: $rows[$r['perm_key']]['scopes'][0]) : true);
        return $m;
    })()];
}

// ---------- Review and approval ----------

function list_approvals(): array
{
    need('page.approvals', [], 'see approvals');
    $events = load_events();
    $item = function (array $a) use ($events) {
        $out = ['id' => (int) $a['id'], 'kind' => $a['kind'], 'status' => $a['status'], 'submittedAt' => $a['submitted_at'], 'reviewedAt' => $a['reviewed_at'], 'note' => $a['note'],
            'submittedBy' => trim((string) $a['by_name']) ?: $a['by_username'], 'reviewedBy' => trim((string) $a['rev_name']) ?: $a['rev_username']];
        if ($a['kind'] === 'member_signup') {
            $u = row('SELECT u.id, u.username, u.email, u.status, u.created_at FROM users u WHERE u.id = ?', [(int) $a['target_id']]);
            $out['user'] = $u ? [...$u, 'id' => (int) $u['id']] : null;
            $out['profile'] = $u ? profile_out((int) $u['id']) : null;
        } else {
            $ev = $events[$a['target_id']] ?? null;
            $out['event'] = $ev ? event_out($ev) : null;
            if ($a['kind'] === 'event_change') $out['proposed'] = dec($a['payload']);
        }
        return $out;
    };
    $sql = "SELECT a.*, bu.username AS by_username, CONCAT_WS(' ', bp.first_name, bp.last_name) AS by_name,
                   ru.username AS rev_username, CONCAT_WS(' ', rp.first_name, rp.last_name) AS rev_name
            FROM approvals a
            LEFT JOIN users bu ON bu.id = a.submitted_by LEFT JOIN profiles bp ON bp.user_id = a.submitted_by
            LEFT JOIN users ru ON ru.id = a.reviewed_by LEFT JOIN profiles rp ON rp.user_id = a.reviewed_by";
    return [
        'pending' => array_map($item, rows("$sql WHERE a.status = 'pending' ORDER BY a.submitted_at")),
        'recent' => array_map($item, rows("$sql WHERE a.status <> 'pending' ORDER BY a.reviewed_at DESC LIMIT 50")),
    ];
}

function decide_approval(): array
{
    $id = (int) input('id');
    $approve = (bool) input('approve');
    $note = str_in('note', 500);
    $a = row('SELECT * FROM approvals WHERE id = ?', [$id]) ?? fail(404, 'That request no longer exists.');
    if ($a['status'] !== 'pending') fail(409, 'This request was already handled.');
    if ($a['kind'] === 'member_signup') {
        decide_signup((int) $a['target_id'], $approve, $note);
        return list_approvals();
    }
    need($a['kind'] === 'event_new' ? 'approvals.events' : 'approvals.changes', [], 'approve events');
    tx(function () use ($a, $approve, $note) {
        $ev = load_event($a['target_id']);
        if ($ev) {
            if ($a['kind'] === 'event_new') {
                q('UPDATE events SET status = ? WHERE id = ?', [$approve ? 'approved' : 'rejected', $a['target_id']]);
            } elseif ($approve) {
                $ev['core'] = norm_core(dec($a['payload']) ?? []);
                $ev['core']['id'] = $a['target_id'];
                save_event($ev, $ev['meta']['status'], $ev['meta']['createdBy']);
            }
        }
        q('UPDATE approvals SET status = ?, reviewed_by = ?, reviewed_at = ?, note = ? WHERE id = ?', [$approve ? 'approved' : 'rejected', my_id(), now(), $note ?: null, $a['id']]);
        $owner = $ev['meta']['createdBy'] ?? null;
        audit($approve ? 'event_approve' : 'event_reject', $owner, $a['kind'] === 'event_new' ? 'event' : 'event change', null, $ev['core']['name'] ?? $a['target_id']);
    });
    return list_approvals();
}
