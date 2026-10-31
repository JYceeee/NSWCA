<?php
// Everything else the app reads and writes: the start-up state, brand/menu sets, settings, categories,
// All players, uploaded files, documents and the one-off import of a browser's data.
declare(strict_types=1);

const DESIGN_SLICES = ['palettes', 'typography', 'backgrounds', 'logos', 'menus'];

function setting(string $key): mixed
{
    return dec(value('SELECT value FROM settings WHERE setting_key = ?', [$key]));
}

function put_setting(string $key, mixed $value): void
{
    q('INSERT INTO settings (setting_key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [$key, enc($value)]);
}

// ---------- Players ----------

const PLAYER_COLS = [
    'lastName' => 'last_name', 'firstName' => 'first_name', 'dob' => 'dob', 'gender' => 'gender', 'fed' => 'fed', 'title' => 'title', 'fideId' => 'fide_id',
    'kFide' => 'k_fide', 'fideStandard' => 'fide_standard', 'fideRapid' => 'fide_rapid', 'fideBlitz' => 'fide_blitz', 'acfId' => 'acf_id', 'acfRating' => 'acf_rating',
    'email' => 'email', 'added' => 'added_at',
];

function player_out(array $r): array
{
    $p = ['id' => $r['id']];
    foreach (PLAYER_COLS as $k => $col) $p[$k] = (string) ($r[$col] ?? '');
    return $p;
}

function norm_player(array $p): array
{
    $out = ['id' => s($p['id'] ?? '')];
    foreach (array_keys(PLAYER_COLS) as $k) $out[$k] = s($p[$k] ?? '');
    return $out;
}

function players_all(): array
{
    return array_map('player_out', rows('SELECT * FROM players ORDER BY sort_order, last_name, first_name'));
}

function save_player(array $p, int $sort): void
{
    $vals = [$p['id']];
    foreach (PLAYER_COLS as $k => $col) $vals[] = $k === 'dob' ? sql_date($p[$k]) : ($k === 'fed' ? substr($p[$k], 0, 3) : $p[$k]);
    $vals[] = $sort;
    $cols = ['id', ...array_values(PLAYER_COLS), 'sort_order'];
    $set = implode(', ', array_map(fn($c) => "$c = VALUES($c)", array_slice($cols, 1)));
    q('INSERT INTO players (' . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ") ON DUPLICATE KEY UPDATE $set", $vals);
}

/** Player fields copied onto the profile of the account that player belongs to (empty values never clear required ones). */
function player_to_profile(array $p, bool $respectLocks = false): void
{
    $u = row('SELECT id FROM users WHERE player_id = ? OR (? <> \'\' AND LOWER(email) = ?) LIMIT 1', [$p['id'], $p['email'], strtolower($p['email'])]);
    if (!$u) return;
    $prof = profile_out((int) $u['id']);
    if (!$prof) return;
    $map = ['lastName' => 'lastName', 'firstName' => 'firstName', 'dob' => 'dob', 'gender' => 'sex', 'fed' => 'federation', 'title' => 'title', 'fideId' => 'fideId',
        'kFide' => 'kFide', 'fideStandard' => 'fideStandard', 'fideRapid' => 'fideRapid', 'fideBlitz' => 'fideBlitz', 'acfId' => 'acfId', 'acfRating' => 'acfRating'];
    $keep = ['lastName', 'firstName', 'dob', 'sex'];
    $sex = ['M' => 'Male', 'F' => 'Female'];
    foreach ($map as $pk => $fk) {
        $v = $pk === 'gender' ? ($sex[$p[$pk]] ?? $p[$pk]) : $p[$pk];
        if ($v === '' && in_array($fk, $keep, true)) continue;
        $prof[$fk] = $v;
    }
    if ($respectLocks) $prof = keep_locked(profile_out((int) $u['id']), $prof, locked_profile_fields((int) $u['id']));
    save_profile((int) $u['id'], $prof);
}

/**
 * The app's player list changes (base -> next). New players the app made for new entries are already listed by
 * the entry's save, so they are skipped rather than refused.
 */
function put_players(): array
{
    require_login();
    $base = array_map('norm_player', array_filter((array) input('base', []), 'is_array'));
    $next = array_map('norm_player', array_filter((array) input('next', []), 'is_array'));
    tx(function () use ($base, $next) {
        $cur = array_map('norm_player', players_all());
        $order = array_flip(array_map(fn($p) => $p['id'], $next));
        [, $changes] = merge_list($base, $next, $cur, 'id', 'the player list');
        foreach ($changes as [$id, $b, $n]) {
            $exists = (bool) value('SELECT 1 FROM players WHERE id = ?', [$id]);
            if ($n === null) {
                need('players.delete', [], 'delete players');
                q('DELETE FROM players WHERE id = ?', [$id]);
                q('UPDATE users SET player_id = NULL WHERE player_id = ?', [$id]);
                continue;
            }
            if ($b === null && !$exists) {
                // Listed by hand, or for an entry the app just made.
                if (!can('players.add') && !value('SELECT 1 FROM event_entries WHERE player_id = ?', [$id])) continue;
                save_player($n, ($order[$id] ?? 0) + 1);
                continue;
            }
            if ($b === null) continue;
            $mine = $n['email'] !== '' && in_array(strtolower($n['email']), my_emails(), true);
            if (!can('players.edit') && !$mine && !manages_player_entries($id)) fail(403, 'Your role can’t edit players.');
            save_player($n, ($order[$id] ?? 0) + 1);
            // A member's own record can't get around the fields locked on their profile.
            player_to_profile($n, $mine && !can('players.edit') && !manages_player_entries($id));
        }
    });
    return ['players' => players_all()];
}

/** The player has an entry in an event whose entries this user manages (edits flow from entry to player). */
function manages_player_entries(string $playerId): bool
{
    foreach (rows('SELECT DISTINCT event_id FROM event_entries WHERE player_id = ?', [$playerId]) as $r) {
        $ev = load_event($r['event_id']);
        if ($ev && can('entries.manage', event_ctx($ev))) return true;
    }
    return false;
}

// ---------- Brand and menu sets, settings, categories ----------

function design_all(): array
{
    $out = array_fill_keys(DESIGN_SLICES, []);
    foreach (rows('SELECT slice, data FROM design_items ORDER BY slice, sort_order') as $r) $out[$r['slice']][] = dec($r['data']);
    return $out;
}

function design_perm(string $slice): string
{
    return $slice === 'menus' ? 'menu.edit' : 'brand.edit';
}

function put_design(): array
{
    $slice = str_in('slice', 16);
    $item = input('item');
    if (!in_array($slice, DESIGN_SLICES, true) || !is_array($item) || !preg_match('/^[\w-]{1,64}$/', s($item['id'] ?? ''))) fail(400, 'Bad brand item.');
    need(design_perm($slice), [], 'edit ' . ($slice === 'menus' ? 'menus' : 'the brand'));
    $sort = (int) input('index', 0);
    q('INSERT INTO design_items (slice, id, name, builtin, sort_order, data, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), builtin = VALUES(builtin), sort_order = VALUES(sort_order), data = VALUES(data), updated_by = VALUES(updated_by)',
        [$slice, $item['id'], mb_substr(s($item['name'] ?? ''), 0, 191), (int) !empty($item['builtin']), $sort, enc($item), my_id()]);
    return ['ok' => true];
}

function delete_design(): array
{
    $slice = str_in('slice', 16);
    if (!in_array($slice, DESIGN_SLICES, true)) fail(400, 'Bad brand item.');
    need(design_perm($slice), [], 'delete ' . ($slice === 'menus' ? 'menus' : 'brand items'));
    q('DELETE FROM design_items WHERE slice = ? AND id = ?', [$slice, str_in('id', 64)]);
    return ['ok' => true];
}

/** applied (which sets the site wears), calendar_view, event_book (its name), page_config. */
function put_settings(): array
{
    $key = str_in('key', 32);
    $v = input('value');
    if (!is_array($v)) fail(400, 'Bad setting.');
    if ($key === 'applied') {
        $old = setting('applied') ?? [];
        $next = $old;
        foreach (['palette', 'typography', 'background', 'logos', 'menu'] as $k) {
            if (!isset($v[$k]) || ($old[$k] ?? null) === $v[$k]) continue;
            need($k === 'menu' ? 'menu.apply' : 'brand.apply', [], 'apply ' . ($k === 'menu' ? 'menus' : 'brand sets') . ' to the site');
            $next[$k] = s($v[$k]);
        }
        $next['events'] = 'events-default';
        put_setting('applied', $next);
    } elseif ($key === 'calendar_view') {
        need('events.viewSettings', [], 'change the calendar settings');
        put_setting('calendar_view', $v);
    } elseif ($key === 'page_config') {
        need('pages.edit', [], 'change Page Config');
        put_setting('page_config', $v);
    } elseif ($key === 'event_book') {
        if (!is_admin()) fail(403, 'Only admins can rename the event book.');
        put_setting('event_book', ['id' => 'events-default', 'name' => s($v['name'] ?? 'Events')]);
    } else fail(400, 'Unknown setting.');
    return ['ok' => true];
}

function categories_all(): array
{
    return array_map(fn($r) => ['id' => $r['id'], 'name' => $r['name'], 'color' => dec($r['color'])], rows('SELECT * FROM event_categories ORDER BY sort_order'));
}

function put_categories(): array
{
    need('events.categories', [], 'edit categories');
    $list = array_values(array_filter((array) input('categories', []), 'is_array'));
    tx(function () use ($list) {
        $keep = [];
        foreach ($list as $i => $c) {
            $id = s($c['id'] ?? '');
            if (!preg_match('/^[\w-]{1,64}$/', $id)) fail(400, 'Bad category id.');
            $keep[] = $id;
            q('INSERT INTO event_categories (id, name, color, sort_order) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), color = VALUES(color), sort_order = VALUES(sort_order)',
                [$id, mb_substr(s($c['name'] ?? ''), 0, 100), enc($c['color'] ?? ['alpha' => 100]), $i]);
        }
        if ($keep) q('DELETE FROM event_categories WHERE id NOT IN (' . implode(',', array_fill(0, count($keep), '?')) . ')', $keep);
        else q('DELETE FROM event_categories');
    });
    return ['categories' => categories_all()];
}

// ---------- Uploaded files ----------

function upload_dir(): string
{
    $dir = config()['upload_dir'] ?? (dirname(__DIR__, 2) . '/principles-uploads');
    return rtrim($dir, '/\\');
}

const MAX_UPLOAD = 60 * 1024 * 1024;

/** Stores $_FILES['file'] under the given id; returns the upload row id. */
function store_upload(string $id, string $visibility): string
{
    if (!preg_match('/^[\w-]{1,64}$/', $id)) fail(400, 'Bad file id.');
    $f = $_FILES['file'] ?? null;
    if (!$f || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) fail(400, 'The file didn’t arrive. Check its size (the server limit may be lower than 60 MB).');
    if ($f['size'] > MAX_UPLOAD) fail(413, 'Files can be up to 60 MB.');
    $name = basename((string) $f['name']);
    $ext = strtolower(preg_replace('/[^A-Za-z0-9]/', '', pathinfo($name, PATHINFO_EXTENSION)));
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']) ?: 'application/octet-stream';
    // SVGs are served as files to download, never inline, so scripts inside can't run on the site.
    $rel = gmdate('Y/m') . "/$id" . ($ext ? ".$ext" : '');
    $abs = upload_dir() . '/' . $rel;
    if (!is_dir(dirname($abs)) && !mkdir(dirname($abs), 0750, true)) fail(500, 'Could not create the upload folder – check upload_dir in api/config.php.');
    $old = value('SELECT path FROM uploads WHERE id = ?', [$id]);
    if (!move_uploaded_file($f['tmp_name'], $abs)) fail(500, 'Could not save the file.');
    if ($old && $old !== $rel) @unlink(upload_dir() . '/' . $old);
    q('INSERT INTO uploads (id, file_name, mime, size_bytes, path, visibility, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE file_name = VALUES(file_name), mime = VALUES(mime), size_bytes = VALUES(size_bytes), path = VALUES(path), visibility = VALUES(visibility), uploaded_by = VALUES(uploaded_by)',
        [$id, mb_substr($name, 0, 255), $mime, (int) $f['size'], $rel, $visibility, my_id()]);
    return $id;
}

/** Logos, backgrounds and profile photos uploaded from the app (its asset ids). */
function upload(): array
{
    require_login();
    $kind = str_in('kind', 16);
    if ($kind === 'photo') need('profile.edit', [], 'upload photos');
    elseif (!can('brand.edit') && !can('pages.edit') && !can('users.import') && !can('users.edit')) fail(403, 'Your role can’t upload files.');
    $id = store_upload(str_in('id', 64), $kind === 'photo' ? 'private' : 'public');
    return ['id' => $id];
}

function can_read_upload(array $u): bool
{
    if ($u['visibility'] === 'public' || is_admin()) return true;
    $me = me();
    if (!$me) return false;
    if ((int) $u['uploaded_by'] === $me['id'] || can('users.edit')) return true;
    if (value('SELECT 1 FROM profiles WHERE photo_upload_id = ? AND user_id = ?', [$u['id'], $me['id']])) return true;
    $doc = row('SELECT visible_to FROM documents WHERE upload_id = ?', [$u['id']]);
    return $doc && can('documents.download') && in_array($me['role'], dec($doc['visible_to']) ?? [], true);
}

function send_file(): never
{
    $u = row('SELECT * FROM uploads WHERE id = ?', [(string) ($_GET['id'] ?? '')]);
    if (!$u || !can_read_upload($u)) {
        http_response_code(404);
        exit;
    }
    $abs = upload_dir() . '/' . $u['path'];
    if (!is_file($abs)) {
        http_response_code(404);
        exit;
    }
    $inline = preg_match('#^(image/(png|jpe?g|gif|webp|avif)|video/|application/pdf)#', $u['mime']) === 1;
    header('Content-Type: ' . ($inline ? $u['mime'] : ($u['mime'] === 'image/svg+xml' ? 'image/svg+xml' : 'application/octet-stream')));
    header('Content-Length: ' . filesize($abs));
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox");
    header('Content-Disposition: ' . ($inline || $u['mime'] === 'image/svg+xml' ? 'inline' : 'attachment') . '; filename="' . addcslashes($u['file_name'], '"\\') . '"');
    header('Cache-Control: ' . ($u['visibility'] === 'public' ? 'public, max-age=31536000, immutable' : 'private, max-age=3600'));
    readfile($abs);
    exit;
}

// ---------- Contact Us ----------

const MAX_ENQUIRIES_PER_HOUR = 5;

/** The Contact Us form. Bots fill the hidden `website` field and get a quiet "ok". */
function send_enquiry(): array
{
    need('page.contact', [], 'send the contact form');
    if (str_in('website', 50) !== '') return ['ok' => true];
    $first = str_in('firstName', 100);
    $last = str_in('lastName', 100);
    $email = strtolower(str_in('email', 191));
    $phone = str_in('phone', 32);
    $club = str_in('clubName', 191);
    $type = str_in('inquiryType', 100);
    $message = str_in('message', 5000);
    if ($first === '' || $last === '') fail(400, 'Enter your first and last name.');
    if ($email === '' && $phone === '') fail(400, 'Enter an email address or a phone number.');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) fail(400, 'Enter a valid email address.');
    if ($phone !== '' && !preg_match('/^[\d\s()+-]{6,32}$/', $phone)) fail(400, 'Enter a valid phone number.');
    if ($type === '') fail(400, 'Choose an inquiry type.');
    if ($message === '') fail(400, 'Enter your message.');
    $ip = hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    if ((int) value('SELECT COUNT(*) FROM enquiries WHERE ip_hash = ? AND created_at > ?', [$ip, gmdate('Y-m-d H:i:s', time() - 3600)]) >= MAX_ENQUIRIES_PER_HOUR)
        fail(429, 'That’s a lot of messages – please try again in an hour.');
    q('INSERT INTO enquiries (first_name, last_name, email, phone, club_name, inquiry_type, message, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$first, $last, $email, $phone, $club, $type, $message, $ip, gmdate('Y-m-d H:i:s')]);
    $cfg = setting('page_config')['contact'] ?? [];
    $to = trim((string) ($cfg['notifyEmail'] ?? ''));
    if ($to !== '') {
        $text = "New enquiry from the website\n\nName: $first $last\nEmail: " . ($email ?: '—') . "\nPhone: " . ($phone ?: '—') . "\nClub: " . ($club ?: '—') . "\nType: $type\n\n$message\n";
        send_mail($to, "Website enquiry: $type", $text, $email ?: null);
    }
    $reply = trim((string) ($cfg['autoReply'] ?? ''));
    if ($email !== '' && $reply !== '') send_mail($email, 'We received your message', "Hi $first,\n\n$reply\n");
    return ['ok' => true];
}

function list_enquiries(): array
{
    need('page.enquiries', [], 'see enquiries');
    return ['enquiries' => array_map(fn($r) => [
        'id' => (int) $r['id'], 'firstName' => $r['first_name'], 'lastName' => $r['last_name'], 'email' => $r['email'], 'phone' => $r['phone'], 'clubName' => $r['club_name'],
        'inquiryType' => $r['inquiry_type'], 'message' => $r['message'], 'handled' => $r['handled_at'] !== null, 'createdAt' => $r['created_at'],
    ], rows('SELECT * FROM enquiries ORDER BY created_at DESC, id DESC LIMIT 500'))];
}

function mark_enquiry(): array
{
    need('enquiries.manage', [], 'manage enquiries');
    $on = (bool) input('handled', true);
    q('UPDATE enquiries SET handled_at = ?, handled_by = ? WHERE id = ?', [$on ? now() : null, $on ? my_id() : null, (int) input('id')]);
    return list_enquiries();
}

function delete_enquiry(): array
{
    need('enquiries.manage', [], 'manage enquiries');
    q('DELETE FROM enquiries WHERE id = ?', [(int) input('id')]);
    return list_enquiries();
}

// ---------- Documents ----------

function documents_for_me(): array
{
    if (!can('page.documents')) return [];
    $role = my_role();
    $out = [];
    foreach (rows('SELECT d.*, u.file_name, u.mime, u.size_bytes FROM documents d JOIN uploads u ON u.id = d.upload_id ORDER BY d.created_at DESC') as $d) {
        $roles = dec($d['visible_to']) ?? [];
        if ($role !== 'admin' && !in_array($role, $roles, true)) continue;
        $out[] = ['id' => $d['id'], 'title' => $d['title'], 'description' => $d['description'] ?? '', 'fileName' => $d['file_name'], 'mime' => $d['mime'],
            'size' => (int) $d['size_bytes'], 'uploadId' => $d['upload_id'], 'visibleTo' => $roles, 'createdAt' => $d['created_at']];
    }
    return $out;
}

function add_document(): array
{
    need('documents.add', [], 'add documents');
    $title = str_in('title', 191);
    if ($title === '') fail(400, 'Give the document a title.');
    $roles = dec((string) input('visibleTo', '[]'));
    $roles = array_values(array_intersect(is_array($roles) ? $roles : [], ['organiser', 'arbiter', 'member', 'visitor']));
    $id = uid('doc');
    tx(function () use ($id, $title, $roles) {
        $upload = store_upload('up-' . $id, 'private');
        q('INSERT INTO documents (id, title, description, upload_id, visible_to, created_by) VALUES (?, ?, ?, ?, ?, ?)', [$id, $title, str_in('description', 2000), $upload, enc($roles), my_id()]);
    });
    return ['documents' => documents_for_me()];
}

function delete_document(): array
{
    need('documents.delete', [], 'delete documents');
    $d = row('SELECT d.id, u.id AS upload_id, u.path FROM documents d JOIN uploads u ON u.id = d.upload_id WHERE d.id = ?', [str_in('id', 64)]) ?? fail(404, 'That document no longer exists.');
    tx(function () use ($d) {
        q('DELETE FROM documents WHERE id = ?', [$d['id']]);
        q('DELETE FROM uploads WHERE id = ?', [$d['upload_id']]);
    });
    @unlink(upload_dir() . '/' . $d['path']);
    return ['documents' => documents_for_me()];
}

// ---------- Start-up state ----------

/** Everything this viewer may see, in the app's shapes. */
function state(): array
{
    $me = me();
    $book = setting('event_book') ?? ['id' => 'events-default', 'name' => 'Events'];
    $view = setting('calendar_view');
    $pages = setting('page_config');
    // Where enquiries go and the reply text aren't public.
    if ($pages && !can('pages.edit')) unset($pages['contact']['notifyEmail'], $pages['contact']['autoReply']);
    $sawPlayers = can('page.players') || has_any('entries.manage');
    $out = [
        'user' => $me ? user_public($me) : null,
        'setup' => $me ? false : needs_setup(),
        'grants' => my_grants(),
        'design' => design_all(),
        'applied' => setting('applied'),
        'book' => [
            'id' => $book['id'], 'name' => $book['name'], 'builtin' => true,
            'events' => events_for_me(),
            'categories' => categories_all(),
            ...($sawPlayers ? ['players' => players_all()] : []),
            ...($view ? ['view' => $view] : []),
        ],
        'pages' => $pages,
        'playersVisible' => $sawPlayers,
        'profile' => $me ? profile_out($me['id']) : null,
        'documents' => documents_for_me(),
    ];
    if (has_any('events.assignArbiters'))
        $out['arbiters'] = array_map(fn($u) => ['id' => (int) $u['id'], 'name' => display_name($u)],
            rows("SELECT u.id, u.username, p.first_name, p.last_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.role = 'arbiter' AND u.status = 'active' ORDER BY p.last_name, p.first_name"));
    if (can('page.players')) $out['accountPlayerIds'] = array_map(fn($r) => $r['player_id'], rows('SELECT player_id FROM users WHERE player_id IS NOT NULL'));
    if (can('page.approvals')) $out['pendingApprovals'] = (int) value("SELECT COUNT(*) FROM approvals WHERE status = 'pending'");
    return $out;
}

// ---------- Import (Admin, once) ----------

/** Copies a browser's saved data (the app's localStorage SavedState) into the database. Files are uploaded first. */
function import_state(): array
{
    need('users.import', [], 'import data');
    $s = input('state');
    if (!is_array($s)) fail(400, 'Nothing to import.');
    $count = ['design' => 0, 'events' => 0, 'players' => 0, 'categories' => 0];
    tx(function () use ($s, &$count) {
        foreach (DESIGN_SLICES as $slice)
            foreach (array_values(array_filter((array) ($s[$slice] ?? []), 'is_array')) as $i => $item) {
                if (!preg_match('/^[\w-]{1,64}$/', s($item['id'] ?? ''))) continue;
                q('INSERT INTO design_items (slice, id, name, builtin, sort_order, data, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON DUPLICATE KEY UPDATE name = VALUES(name), builtin = VALUES(builtin), sort_order = VALUES(sort_order), data = VALUES(data), updated_by = VALUES(updated_by)',
                    [$slice, $item['id'], mb_substr(s($item['name'] ?? ''), 0, 191), (int) !empty($item['builtin']), $i, enc($item), my_id()]);
                $count['design']++;
            }
        if (is_array($s['pages'][0] ?? null)) put_setting('page_config', $s['pages'][0]);
        if (is_array($s['applied'] ?? null)) put_setting('applied', [...$s['applied'], 'events' => 'events-default']);
        $book = null;
        foreach ((array) ($s['events'] ?? []) as $b) if (is_array($b) && (($b['id'] ?? '') === (($s['applied']['events'] ?? '') ?: 'events-default') || !$book)) $book = $b;
        if ($book) {
            put_setting('event_book', ['id' => 'events-default', 'name' => s($book['name'] ?? 'Events')]);
            if (is_array($book['view'] ?? null)) put_setting('calendar_view', $book['view']);
            foreach (array_values(array_filter((array) ($book['categories'] ?? []), 'is_array')) as $i => $c) {
                q('INSERT INTO event_categories (id, name, color, sort_order) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), color = VALUES(color), sort_order = VALUES(sort_order)',
                    [s($c['id']), mb_substr(s($c['name'] ?? ''), 0, 100), enc($c['color'] ?? ['alpha' => 100]), $i]);
                $count['categories']++;
            }
            foreach (array_values(array_filter((array) ($book['players'] ?? []), 'is_array')) as $i => $p) {
                save_player(norm_player($p), $i + 1);
                $count['players']++;
            }
            foreach (array_filter((array) ($book['events'] ?? []), 'is_array') as $e) {
                $ev = norm_event($e);
                if (!preg_match('/^[\w-]{1,64}$/', $ev['core']['id']) || !sql_date($ev['core']['startDate'])) continue;
                $existing = load_event($ev['core']['id']);
                link_players($ev);
                save_event($ev, $existing['meta']['status'] ?? 'approved', $existing['meta']['createdBy'] ?? my_id());
                $count['events']++;
            }
        }
        // Your sign-in email stays as it is.
        if (is_array($s['profile'] ?? null)) save_profile(my_id(), [...$s['profile'], 'email' => me()['email']]);
    });
    return ['ok' => true, 'imported' => $count];
}
