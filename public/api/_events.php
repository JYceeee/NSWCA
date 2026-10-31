<?php
// Events: loading them from their tables, saving the app's CalEvent shape back, and checking who may change what.
declare(strict_types=1);

// ---------- The app's shape, normalised (so two copies of the same event compare equal) ----------

function s(mixed $v): string
{
    return is_scalar($v) ? (string) $v : '';
}

function norm_core(array $e): array
{
    $d = isset($e['details']) && is_array($e['details']) ? $e['details'] : null;
    if ($d !== null)
        $d['divisions'] = array_values(array_map(fn($x) => ['id' => s($x['id'] ?? ''), 'name' => s($x['name'] ?? ''), 'ratingRange' => s($x['ratingRange'] ?? '')],
            is_array($d['divisions'] ?? null) ? $d['divisions'] : []));
    return [
        'id' => s($e['id'] ?? ''),
        'name' => s($e['name'] ?? ''),
        'startDate' => s($e['startDate'] ?? ''),
        'endDate' => s($e['endDate'] ?? ''),
        'allDay' => (bool) ($e['allDay'] ?? false),
        'startTime' => s($e['startTime'] ?? ''),
        'endTime' => s($e['endTime'] ?? ''),
        'location' => s($e['location'] ?? ''),
        'description' => s($e['description'] ?? ''),
        'category' => s($e['category'] ?? ''),
        'weekdays' => array_values(array_map('intval', is_array($e['weekdays'] ?? null) ? $e['weekdays'] : [])),
        'memberOnly' => (bool) ($e['memberOnly'] ?? false),
        'citizensOnly' => (bool) ($e['citizensOnly'] ?? false),
        'details' => $d,
    ];
}

const ENTRY_TEXT = ['name', 'email', 'fideId', 'acfId', 'fideStandard', 'fideRapid', 'fideBlitz', 'acfRating', 'fed', 'dob', 'gender', 'title', 'kFide', 'division', 'at'];

function norm_entry(array $x): array
{
    $out = ['id' => s($x['id'] ?? ''), 'playerId' => s($x['playerId'] ?? '') ?: null];
    foreach (ENTRY_TEXT as $k) $out[$k] = s($x[$k] ?? '');
    $out['source'] = in_array($x['source'] ?? null, ['signup', 'import', 'manual'], true) ? $x['source'] : null;
    return $out;
}

function norm_bye(array $b): array
{
    $v = $b['value'] ?? null;
    return [
        'id' => s($b['id'] ?? ''),
        'entryId' => s($b['entryId'] ?? ''),
        'round' => (int) ($b['round'] ?? 0),
        'by' => ($b['by'] ?? '') === 'player' ? 'player' : 'organiser',
        'at' => s($b['at'] ?? ''),
        'value' => $v === null || $v === '' ? null : ((float) $v === 0.5 ? 0.5 : 0),
    ];
}

function norm_side(?array $x): ?array
{
    if ($x === null) return null;
    return ['entryId' => s($x['entryId'] ?? '') ?: null, 'sno' => s($x['sno'] ?? ''), 'title' => s($x['title'] ?? ''), 'name' => s($x['name'] ?? ''), 'fed' => s($x['fed'] ?? ''), 'pts' => s($x['pts'] ?? '')];
}

function norm_board(array $b): array
{
    return [
        'board' => (int) ($b['board'] ?? 0),
        'white' => norm_side(is_array($b['white'] ?? null) ? $b['white'] : []),
        'black' => norm_side(is_array($b['black'] ?? null) ? $b['black'] : null),
        'result' => s($b['result'] ?? ''),
        'byeKind' => in_array($b['byeKind'] ?? null, ['pab', 'half', 'zero'], true) ? $b['byeKind'] : null,
    ];
}

function norm_round(array $r): array
{
    return [
        'round' => (int) ($r['round'] ?? 0),
        'title' => s($r['title'] ?? ''),
        'fileName' => s($r['fileName'] ?? ''),
        'at' => s($r['at'] ?? ''),
        'boards' => array_values(array_map('norm_board', is_array($r['boards'] ?? null) ? $r['boards'] : [])),
        'generated' => (bool) ($r['generated'] ?? false),
    ];
}

function norm_event(array $e): array
{
    $list = fn($k) => is_array($e[$k] ?? null) ? array_values(array_filter($e[$k], 'is_array')) : [];
    $sno = [];
    foreach (is_array($e['startNumbers'] ?? null) ? $e['startNumbers'] : [] as $id => $n) $sno[(string) $id] = (int) $n;
    ksort($sno);
    $rounds = array_map('norm_round', $list('pairings'));
    usort($rounds, fn($a, $b) => $a['round'] <=> $b['round']);
    return [
        'core' => norm_core($e),
        'entries' => array_map('norm_entry', $list('entries')),
        'byes' => array_map('norm_bye', $list('byes')),
        'pairings' => $rounds,
        'results' => is_array($e['results'] ?? null) ? $e['results'] : null,
        'startNumbers' => $sno,
    ];
}

// ---------- Loading ----------

/** Every event (or the ones in $ids), normalised, with meta: status, createdBy, arbiters. */
function load_events(?array $ids = null): array
{
    $where = $ids === null ? '' : ' WHERE event_id IN (' . (implode(',', array_fill(0, count($ids), '?')) ?: "''") . ')';
    $whereE = $ids === null ? '' : ' WHERE id IN (' . (implode(',', array_fill(0, count($ids), '?')) ?: "''") . ')';
    $p = $ids ?? [];
    $by = function (string $sql) use ($p) {
        $out = [];
        foreach (rows($sql, $p) as $r) $out[$r['event_id']][] = $r;
        return $out;
    };
    $divs = $by("SELECT * FROM event_divisions$where ORDER BY sort_order");
    $entries = $by("SELECT * FROM event_entries$where ORDER BY sort_order");
    $byes = $by("SELECT * FROM event_byes$where ORDER BY round_no, set_at");
    $rounds = $by("SELECT * FROM pairing_rounds$where ORDER BY round_no");
    $boards = [];
    foreach (rows("SELECT * FROM pairing_boards$where ORDER BY round_no, board_no", $p) as $b) $boards[$b['event_id']][$b['round_no']][] = $b;
    $arbs = $by("SELECT event_id, user_id FROM event_arbiters$where");
    $changes = [];
    foreach (rows("SELECT target_id FROM approvals WHERE kind = 'event_change' AND status = 'pending'") as $r) $changes[$r['target_id']] = true;

    $out = [];
    foreach (rows("SELECT * FROM events$whereE ORDER BY start_date, start_time", $p) as $r) {
        $id = $r['id'];
        $details = dec($r['details']);
        if (is_array($details))
            $details['divisions'] = array_map(fn($d) => ['id' => $d['id'], 'name' => $d['name'], 'ratingRange' => $d['rating_range']], $divs[$id] ?? []);
        $sno = [];
        $ents = [];
        foreach ($entries[$id] ?? [] as $x) {
            if ($x['start_no'] !== null) $sno[$x['id']] = (int) $x['start_no'];
            $ents[] = norm_entry([
                'id' => $x['id'], 'playerId' => $x['player_id'], 'name' => $x['name'], 'email' => $x['email'], 'fideId' => $x['fide_id'], 'acfId' => $x['acf_id'],
                'fideStandard' => $x['fide_standard'], 'fideRapid' => $x['fide_rapid'], 'fideBlitz' => $x['fide_blitz'], 'acfRating' => $x['acf_rating'], 'fed' => $x['fed'],
                'dob' => $x['dob'] ?? '', 'gender' => $x['gender'], 'title' => $x['title'], 'kFide' => $x['k_fide'], 'source' => $x['source'], 'division' => $x['division_id'], 'at' => $x['entered_at'],
            ]);
        }
        ksort($sno);
        $side = fn($b, $c) => $b[$c . '_name'] === null && $c === 'black' ? null
            : norm_side(['entryId' => $b[$c . '_entry_id'], 'sno' => $b[$c . '_sno'], 'title' => $b[$c . '_title'], 'name' => $b[$c . '_name'], 'fed' => $b[$c . '_fed'], 'pts' => $b[$c . '_pts']]);
        $out[$id] = [
            'core' => norm_core([
                'id' => $id, 'name' => $r['name'], 'startDate' => $r['start_date'], 'endDate' => $r['end_date'], 'allDay' => (bool) $r['all_day'],
                'startTime' => $r['start_time'], 'endTime' => $r['end_time'], 'location' => $r['location'], 'description' => $r['description'] ?? '',
                'category' => $r['category_id'] ?? '', 'weekdays' => dec($r['weekdays']) ?? [], 'memberOnly' => (bool) $r['member_only'], 'citizensOnly' => (bool) $r['citizens_only'],
                'details' => $details,
            ]),
            'entries' => $ents,
            'byes' => array_map(fn($b) => norm_bye(['id' => $b['id'], 'entryId' => $b['entry_id'], 'round' => $b['round_no'], 'by' => $b['set_by'], 'at' => $b['set_at'], 'value' => $b['value']]), $byes[$id] ?? []),
            'pairings' => array_map(fn($rd) => norm_round([
                'round' => $rd['round_no'], 'title' => $rd['title'], 'fileName' => $rd['file_name'], 'at' => $rd['released_at'], 'generated' => (bool) $rd['is_generated'],
                'boards' => array_map(fn($b) => ['board' => $b['board_no'], 'white' => $side($b, 'white'), 'black' => $side($b, 'black'), 'result' => $b['result'], 'byeKind' => $b['bye_kind']],
                    $boards[$id][$rd['round_no']] ?? []),
            ]), $rounds[$id] ?? []),
            'results' => dec($r['results']),
            'startNumbers' => $sno,
            'meta' => [
                'status' => $r['status'],
                'createdBy' => $r['created_by'] === null ? null : (int) $r['created_by'],
                'arbiters' => array_map(fn($a) => (int) $a['user_id'], $arbs[$id] ?? []),
                'pendingChange' => isset($changes[$id]),
            ],
        ];
    }
    return $out;
}

function load_event(string $id): ?array
{
    return load_events([$id])[$id] ?? null;
}

// ---------- Who is looking ----------

function my_emails(): array
{
    $me = me();
    if (!$me) return [];
    $emails = [strtolower(trim($me['email']))];
    $p = value('SELECT email FROM profiles WHERE user_id = ?', [$me['id']]);
    if ($p) $emails[] = strtolower(trim($p));
    return array_values(array_unique(array_filter($emails)));
}

function event_ctx(array $ev): array
{
    $id = my_id();
    return ['own' => $id !== null && $ev['meta']['createdBy'] === $id, 'assigned' => $id !== null && in_array($id, $ev['meta']['arbiters'], true)];
}

function can_see_event(array $ev): bool
{
    if ($ev['meta']['status'] === 'approved' || is_admin()) return true;
    return can('events.viewPending', event_ctx($ev));
}

/** Contact details (email, DOB) of other people's entries are only sent to those who manage them. */
function sees_contacts(array $ev): bool
{
    $ctx = event_ctx($ev);
    return can('entries.manage', $ctx) || can('entries.export', $ctx) || can('page.players') || can('pairings.generate', $ctx);
}

function strip_nulls(array $a): array
{
    return array_filter($a, fn($v) => $v !== null);
}

/** The event as the app's CalEvent, for this viewer. */
function event_out(array $ev): array
{
    $contacts = sees_contacts($ev);
    $mine = my_emails();
    $c = $ev['core'];
    $out = strip_nulls($c);
    if (!$c['weekdays']) unset($out['weekdays']);
    $out['entries'] = array_map(function ($x) use ($contacts, $mine) {
        if (!$contacts && !in_array(strtolower(trim($x['email'])), $mine, true)) {
            $x['email'] = '';
            $x['dob'] = '';
        }
        return strip_nulls($x);
    }, $ev['entries']);
    $out['byes'] = array_map('strip_nulls', $ev['byes']);
    $out['pairings'] = array_map(fn($r) => [...$r, 'boards' => array_map(fn($b) => strip_nulls([...$b, 'white' => strip_nulls($b['white']), 'black' => $b['black'] === null ? null : strip_nulls($b['black'])]) + ['black' => null], $r['boards'])], $ev['pairings']);
    if ($ev['results'] !== null) $out['results'] = $ev['results'];
    if ($ev['startNumbers']) $out['startNumbers'] = $ev['startNumbers'];
    $ctx = event_ctx($ev);
    $out['status'] = $ev['meta']['status'];
    $out['createdBy'] = $ev['meta']['createdBy'];
    $out['arbiters'] = $ev['meta']['arbiters'];
    if ($ev['meta']['pendingChange'] && ($ctx['own'] || is_admin())) $out['pendingChange'] = true;
    return $out;
}

/** Visible events for this viewer, in the app's shape. */
function events_for_me(): array
{
    $out = [];
    foreach (load_events() as $ev) if (can_see_event($ev)) $out[] = event_out($ev);
    return $out;
}

// ---------- Saving ----------

function save_event(array $ev, string $status, ?int $createdBy): void
{
    $c = $ev['core'];
    $id = $c['id'];
    $details = $c['details'];
    $divisions = $details['divisions'] ?? [];
    if ($details !== null) unset($details['divisions']);
    $cat = $c['category'] !== '' && value('SELECT 1 FROM event_categories WHERE id = ?', [$c['category']]) ? $c['category'] : null;
    if (!sql_date($c['startDate']) || !sql_date($c['endDate'])) fail(400, 'An event needs a start and end date.');

    // Keep what the app doesn't send: the disabled-player byes and auto forfeits.
    $reasons = [];
    foreach (rows('SELECT id, reason FROM event_byes WHERE event_id = ?', [$id]) as $r) $reasons[$r['id']] = $r['reason'];
    $auto = [];
    foreach (rows('SELECT round_no, board_no, result FROM pairing_boards WHERE event_id = ? AND auto_forfeit = 1', [$id]) as $r) $auto[$r['round_no'] . ':' . $r['board_no']] = $r['result'];

    q('INSERT INTO events (id, name, category_id, start_date, end_date, all_day, start_time, end_time, location, description, weekdays, member_only, citizens_only, details, results, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), category_id = VALUES(category_id), start_date = VALUES(start_date), end_date = VALUES(end_date), all_day = VALUES(all_day),
         start_time = VALUES(start_time), end_time = VALUES(end_time), location = VALUES(location), description = VALUES(description), weekdays = VALUES(weekdays),
         member_only = VALUES(member_only), citizens_only = VALUES(citizens_only), details = VALUES(details), results = VALUES(results), status = VALUES(status)', [
        $id, mb_substr($c['name'], 0, 191), $cat, $c['startDate'], $c['endDate'], (int) $c['allDay'], substr($c['startTime'], 0, 5), substr($c['endTime'], 0, 5),
        mb_substr($c['location'], 0, 191), $c['description'], $c['weekdays'] ? enc($c['weekdays']) : null, (int) $c['memberOnly'], (int) $c['citizensOnly'],
        $details === null ? null : enc($details), $ev['results'] === null ? null : enc($ev['results']), $status, $createdBy,
    ]);

    q('DELETE FROM event_divisions WHERE event_id = ?', [$id]);
    foreach ($divisions as $i => $d)
        q('INSERT INTO event_divisions (id, event_id, name, rating_range, sort_order) VALUES (?, ?, ?, ?, ?)', [$d['id'] ?: uid('div'), $id, $d['name'], $d['ratingRange'], $i]);

    q('DELETE FROM event_entries WHERE event_id = ?', [$id]);
    foreach ($ev['entries'] as $i => $x)
        q('INSERT INTO event_entries (id, event_id, player_id, name, email, fide_id, acf_id, fide_standard, fide_rapid, fide_blitz, acf_rating, fed, dob, gender, title, k_fide, source, division_id, start_no, entered_at, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            $x['id'], $id, $x['playerId'], $x['name'], $x['email'], $x['fideId'], $x['acfId'], $x['fideStandard'], $x['fideRapid'], $x['fideBlitz'], $x['acfRating'],
            substr($x['fed'], 0, 3), sql_date($x['dob']), $x['gender'], $x['title'], $x['kFide'], $x['source'], $x['division'], $ev['startNumbers'][$x['id']] ?? null, $x['at'], $i,
        ]);

    q('DELETE FROM event_byes WHERE event_id = ?', [$id]);
    foreach ($ev['byes'] as $b)
        q('INSERT INTO event_byes (id, event_id, entry_id, round_no, set_by, set_at, value, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$b['id'], $id, $b['entryId'], $b['round'], $b['by'], $b['at'], $b['value'], $reasons[$b['id']] ?? null]);

    q('DELETE FROM pairing_rounds WHERE event_id = ?', [$id]);
    foreach ($ev['pairings'] as $r) {
        q('INSERT INTO pairing_rounds (event_id, round_no, title, file_name, released_at, is_generated) VALUES (?, ?, ?, ?, ?, ?)', [$id, $r['round'], $r['title'], $r['fileName'], $r['at'], (int) $r['generated']]);
        foreach ($r['boards'] as $b) {
            $w = $b['white'];
            $k = $b['black'];
            $key = $r['round'] . ':' . $b['board'];
            q('INSERT INTO pairing_boards (event_id, round_no, board_no, white_entry_id, white_sno, white_title, white_name, white_fed, white_pts,
                 black_entry_id, black_sno, black_title, black_name, black_fed, black_pts, result, bye_kind, auto_forfeit)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                $id, $r['round'], $b['board'], $w['entryId'], $w['sno'], $w['title'], $w['name'], substr($w['fed'], 0, 3), $w['pts'],
                $k['entryId'] ?? null, $k['sno'] ?? null, $k['title'] ?? null, $k['name'] ?? null, $k === null ? null : substr($k['fed'], 0, 3), $k['pts'] ?? null,
                $b['result'], $b['byeKind'], (int) (isset($auto[$key]) && $auto[$key] === $b['result']),
            ]);
        }
    }
}

/**
 * Three-way merge of a list keyed by $key: the changes the app made (base -> next) are applied onto the database's
 * current list, so two people editing different entries don't overwrite each other. Returns [merged, changes].
 */
function merge_list(array $base, array $next, array $cur, string $key, string $what): array
{
    $index = function (array $list) use ($key) {
        $m = [];
        foreach ($list as $x) $m[(string) $x[$key]] = $x;
        return $m;
    };
    [$B, $N, $C] = [$index($base), $index($next), $index($cur)];
    $changes = [];
    $out = $C;
    foreach (array_unique([...array_keys($B), ...array_keys($N)]) as $k) {
        $k = (string) $k;
        $b = $B[$k] ?? null;
        $n = $N[$k] ?? null;
        if (same($b, $n)) continue;
        $c = $C[$k] ?? null;
        if (!same($c, $b) && !same($c, $n)) fail(409, "Someone else changed $what at the same time. Reload to see their change, then try again.");
        $changes[] = [$k, $b, $n];
        if ($n === null) unset($out[$k]);
        else $out[$k] = $n;
    }
    // The app's order, then anything only the database has.
    $ordered = [];
    foreach ($N as $k => $_) if (isset($out[$k])) $ordered[$k] = $out[$k];
    foreach ($out as $k => $x) $ordered[$k] ??= $x;
    return [array_values($ordered), $changes];
}

function merge_one(mixed $base, mixed $next, mixed $cur, string $what): array
{
    if (same($base, $next)) return [$cur, false];
    if (!same($cur, $base) && !same($cur, $next)) fail(409, "Someone else changed $what at the same time. Reload to see their change, then try again.");
    return [$next, true];
}

function is_mine(array $entry): bool
{
    $email = strtolower(trim($entry['email'] ?? ''));
    return $email !== '' && in_array($email, my_emails(), true);
}

/** The account (if any) an entry belongs to, by email or linked player. */
function entry_user(array $entry): ?array
{
    $email = strtolower(trim($entry['email']));
    return row('SELECT u.id, u.status FROM users u LEFT JOIN profiles p ON p.user_id = u.id
                WHERE (? <> \'\' AND (LOWER(u.email) = ? OR LOWER(p.email) = ?)) OR (? IS NOT NULL AND u.player_id = ?) LIMIT 1',
        [$email, $email, $email, $entry['playerId'], $entry['playerId']]);
}

/** Only the board results differ between two versions of a round. */
function only_results_changed(?array $a, ?array $b): bool
{
    if ($a === null || $b === null || count($a['boards']) !== count($b['boards'])) return false;
    $strip = fn($r) => [...$r, 'boards' => array_map(fn($x) => [...$x, 'result' => ''], $r['boards'])];
    return same($strip($a), $strip($b));
}

/**
 * Save one event from the app. $baseIn is the copy the app started from (null for a new event).
 * Returns ['event' => CalEvent for the app, 'pending' => true when an admin has to approve the change].
 */
function put_event(?array $baseIn, array $nextIn): array
{
    require_login();
    return tx(function () use ($baseIn, $nextIn) {
        $N = norm_event($nextIn);
        $id = $N['core']['id'];
        if (!preg_match('/^[\w-]{1,64}$/', $id)) fail(400, 'Bad event id.');
        $cur = load_event($id);
        $pending = false;

        if ($cur === null) {
            $a = need('events.add', [], 'add events');
            foreach ($N['entries'] as $x) check_entry_allowed($x);
            $status = $a['approval'] ? 'pending' : 'approved';
            link_players($N);
            save_event($N, $status, my_id());
            if ($a['approval']) {
                q("INSERT INTO approvals (kind, target_id, submitted_by) VALUES ('event_new', ?, ?)", [$id, my_id()]);
                $pending = true;
            }
            return ['event' => event_out(load_event($id)), 'pending' => $pending];
        }

        if ($baseIn === null) fail(409, 'This event already exists. Reload to see it.');
        if (!can_see_event($cur)) fail(404, 'That event no longer exists.');
        $B = norm_event($baseIn);
        $ctx = event_ctx($cur);
        $merged = $cur;
        $status = $cur['meta']['status'];

        // The event itself and its details page.
        [$core, $changed] = merge_one($B['core'], $N['core'], $cur['core'], 'this event');
        if ($changed) {
            $a = need('events.edit', $ctx, 'edit this event');
            if ($a['approval'] && $status === 'approved') {
                $open = value("SELECT id FROM approvals WHERE kind = 'event_change' AND target_id = ? AND status = 'pending'", [$id]);
                if ($open) q('UPDATE approvals SET payload = ?, submitted_by = ?, submitted_at = ? WHERE id = ?', [enc($core), my_id(), now(), $open]);
                else q("INSERT INTO approvals (kind, target_id, payload, submitted_by) VALUES ('event_change', ?, ?, ?)", [$id, enc($core), my_id()]);
                $pending = true;
            } else {
                $merged['core'] = $core;
                if ($status === 'rejected') {
                    // Edited after being sent back: it goes back to the admins.
                    $status = 'pending';
                    q("INSERT INTO approvals (kind, target_id, submitted_by) VALUES ('event_new', ?, ?)", [$id, my_id()]);
                    $pending = true;
                }
            }
        }

        // Entries: your own (enter / withdraw) or managing everyone's.
        [$merged['entries'], $changes] = merge_list($B['entries'], $N['entries'], $cur['entries'], 'id', 'the entries');
        foreach ($changes as [, $b, $n]) {
            $own = ($b === null || is_mine($b)) && ($n === null || is_mine($n));
            if ($own) need($n === null ? 'events.withdraw' : 'events.enter', $ctx, $n === null ? 'withdraw entries' : 'enter events');
            else need('entries.manage', $ctx, 'change the entries of this event');
            if ($n !== null && $b === null) check_entry_allowed($n);
        }

        $entryById = [];
        foreach ($merged['entries'] as $x) $entryById[$x['id']] = $x;

        [$merged['byes'], $changes] = merge_list($B['byes'], $N['byes'], $cur['byes'], 'id', 'the byes');
        foreach ($changes as [, $b, $n]) {
            $x = $n ?? $b;
            $entry = $entryById[$x['entryId']] ?? null;
            $own = $entry && is_mine($entry) && ($b === null || $b['by'] === 'player') && ($n === null || $n['by'] === 'player');
            if ($own) need('events.requestBye', $ctx, 'request byes');
            else need('pairings.byes', $ctx, 'set byes in this tournament');
        }

        [$merged['pairings'], $changes] = merge_list($B['pairings'], $N['pairings'], $cur['pairings'], 'round', 'the pairings');
        foreach ($changes as [, $b, $n]) {
            if (only_results_changed($b, $n)) need_any(['pairings.results', 'events.uploadPairings'], $ctx, 'enter results in this tournament');
            else need_any(['pairings.generate', 'events.uploadPairings'], $ctx, 'change the pairings of this tournament');
        }
        usort($merged['pairings'], fn($a, $b) => $a['round'] <=> $b['round']);

        [$merged['startNumbers'], $changed] = merge_one($B['startNumbers'], $N['startNumbers'], $cur['startNumbers'], 'the start numbers');
        if ($changed) need_any(['pairings.generate', 'events.uploadPairings', 'entries.manage'], $ctx, 'change start numbers');

        [$merged['results'], $changed] = merge_one($B['results'], $N['results'], $cur['results'], 'the results');
        if ($changed) need_any(['pairings.results', 'events.uploadPairings'], $ctx, 'upload results');

        link_players($merged);
        save_event($merged, $status, $cur['meta']['createdBy']);
        return ['event' => event_out(load_event($id)), 'pending' => $pending];
    });
}

/** A disabled account can't be entered into events. */
function check_entry_allowed(array $entry): void
{
    $u = entry_user($entry);
    if ($u && $u['status'] === 'disabled') fail(403, "{$entry['name']}’s account is disabled, so they can’t be entered into events.");
}

/**
 * Entries whose player isn't in All players yet are linked to the entrant's own player (users.player_id),
 * a listed player with the same email or FIDE ID, or listed as a new player – so a member entering
 * doesn't need to see the player list.
 */
function link_players(array &$ev): void
{
    foreach ($ev['entries'] as &$x) {
        if ($x['playerId'] && value('SELECT 1 FROM players WHERE id = ?', [$x['playerId']])) continue;
        $email = strtolower(trim($x['email']));
        $pid = null;
        if ($email !== '') {
            $pid = value('SELECT u.player_id FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.player_id IS NOT NULL AND (LOWER(u.email) = ? OR LOWER(p.email) = ?) LIMIT 1', [$email, $email])
                ?: value('SELECT id FROM players WHERE LOWER(email) = ? LIMIT 1', [$email]);
        }
        if (!$pid && $x['fideId'] !== '') $pid = value('SELECT id FROM players WHERE fide_id = ? LIMIT 1', [$x['fideId']]);
        if (!$pid) {
            $pid = $x['playerId'] ?: uid('pl');
            [$last, $first] = split_name($x['name']);
            q('INSERT INTO players (id, last_name, first_name, dob, gender, fed, title, fide_id, k_fide, fide_standard, fide_rapid, fide_blitz, acf_id, acf_rating, email, added_at, sort_order)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(p2.sort_order), 0) + 1 FROM players p2))', [
                $pid, $last, $first, sql_date($x['dob']), $x['gender'], substr($x['fed'], 0, 3), $x['title'], $x['fideId'], $x['kFide'], $x['fideStandard'], $x['fideRapid'],
                $x['fideBlitz'], $x['acfId'], $x['acfRating'], $x['email'], $x['at'] ?: gmdate('c'),
            ]);
        }
        $x['playerId'] = $pid;
        // The account this entry belongs to now has its player.
        if ($email !== '') q('UPDATE users SET player_id = ? WHERE player_id IS NULL AND LOWER(email) = ?', [$pid, $email]);
    }
}

/** "Surname, Firstname" (or "Firstname Surname") -> [last, first], as the app's splitName. */
function split_name(string $name): array
{
    $n = trim(preg_replace('/\s+/', ' ', $name));
    if (str_contains($n, ',')) {
        [$last, $rest] = explode(',', $n, 2);
        return [trim($last), trim($rest)];
    }
    $i = strrpos($n, ' ');
    return $i === false ? [$n, ''] : [substr($n, $i + 1), substr($n, 0, $i)];
}

function delete_event(string $id): void
{
    require_login();
    tx(function () use ($id) {
        $cur = load_event($id) ?? fail(404, 'That event no longer exists.');
        need('events.delete', event_ctx($cur), 'delete this event');
        q('DELETE FROM events WHERE id = ?', [$id]);
        q("DELETE FROM approvals WHERE kind IN ('event_new', 'event_change') AND target_id = ? AND status = 'pending'", [$id]);
    });
}

function set_arbiters(string $id, array $userIds): array
{
    require_login();
    return tx(function () use ($id, $userIds) {
        $cur = load_event($id) ?? fail(404, 'That event no longer exists.');
        need('events.assignArbiters', event_ctx($cur), 'assign arbiters to this event');
        $ids = array_values(array_unique(array_map('intval', $userIds)));
        q('DELETE FROM event_arbiters WHERE event_id = ?', [$id]);
        foreach ($ids as $u) {
            if (!value("SELECT 1 FROM users WHERE id = ? AND role IN ('arbiter', 'admin')", [$u])) fail(400, 'Only arbiters can be assigned.');
            q('INSERT INTO event_arbiters (event_id, user_id, assigned_by) VALUES (?, ?, ?)', [$id, $u, my_id()]);
        }
        return event_out(load_event($id));
    });
}

// ---------- Disabled players ----------

/** Rounds in the schedule (with a date), as the app's scheduledRounds. */
function scheduled_round_count(array $ev): int
{
    $n = count(array_filter($ev['core']['details']['schedule'] ?? [], fn($r) => !empty($r['date'])));
    foreach ($ev['pairings'] as $r) $n = max($n, $r['round']);
    return $n;
}

/** The (event id, entry id) pairs of a user's tournament entries. */
function user_entries(int $userId): array
{
    $u = row('SELECT u.email, u.player_id, p.email AS profile_email FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?', [$userId]);
    if (!$u) return [];
    $emails = array_values(array_filter(array_unique([strtolower(trim($u['email'])), strtolower(trim($u['profile_email'] ?? ''))])));
    $in = implode(',', array_fill(0, max(1, count($emails)), '?'));
    return rows("SELECT event_id, id FROM event_entries WHERE (email <> '' AND LOWER(email) IN ($in)) OR (? IS NOT NULL AND player_id = ?)",
        [...($emails ?: ['']), $u['player_id'], $u['player_id']]);
}

/**
 * A disabled player's games in rounds already paired are forfeited (the opponent wins, + - - / - - +),
 * and they're left out of later rounds with a zero-point bye until they're enabled again.
 */
function forfeit_disabled(int $userId): void
{
    foreach (user_entries($userId) as $e) {
        $ev = load_event($e['event_id']);
        if (!$ev) continue;
        $entry = $e['id'];
        q("UPDATE pairing_boards SET result = '- - +', auto_forfeit = 1 WHERE event_id = ? AND white_entry_id = ? AND black_name IS NOT NULL AND result = ''", [$e['event_id'], $entry]);
        q("UPDATE pairing_boards SET result = '+ - -', auto_forfeit = 1 WHERE event_id = ? AND black_entry_id = ? AND result = ''", [$e['event_id'], $entry]);
        $paired = array_map(fn($r) => $r['round'], $ev['pairings']);
        $total = scheduled_round_count($ev);
        for ($r = 1; $r <= $total; $r++) {
            if (in_array($r, $paired, true)) continue;
            if (value('SELECT 1 FROM event_byes WHERE event_id = ? AND entry_id = ? AND round_no = ?', [$e['event_id'], $entry, $r])) continue;
            q("INSERT INTO event_byes (id, event_id, entry_id, round_no, set_by, set_at, value, reason) VALUES (?, ?, ?, ?, 'organiser', ?, 0, 'disabled')",
                [uid('bye'), $e['event_id'], $entry, $r, gmdate('c')]);
        }
    }
}

/** Enabled again: they rejoin from the next unpaired round. Forfeits already given stay. */
function unforfeit_enabled(int $userId): void
{
    foreach (user_entries($userId) as $e)
        q("DELETE b FROM event_byes b WHERE b.event_id = ? AND b.entry_id = ? AND b.reason = 'disabled'
           AND NOT EXISTS (SELECT 1 FROM pairing_rounds r WHERE r.event_id = b.event_id AND r.round_no = b.round_no)", [$e['event_id'], $e['id']]);
}
