<?php
// Roles and permissions: the matrix in role_permissions, checked on every write.
declare(strict_types=1);

/** Every permission row: perm_key => [group, label, scopes[]]. */
function perm_rows(): array
{
    static $rows = null;
    if ($rows === null) {
        $rows = [];
        foreach (rows('SELECT perm_key, group_name, label, scopes FROM permissions ORDER BY sort_order') as $r)
            $rows[$r['perm_key']] = ['key' => $r['perm_key'], 'group' => $r['group_name'], 'label' => $r['label'], 'scopes' => $r['scopes'] === '' ? [] : explode(',', $r['scopes'])];
    }
    return $rows;
}

/** role => perm_key => false | true | scope. Admin isn't stored: it has everything. */
function perm_matrix(): array
{
    static $m = null;
    if ($m === null) {
        $m = ['visitor' => [], 'member' => [], 'arbiter' => [], 'organiser' => []];
        $rows = perm_rows();
        foreach (rows('SELECT role, perm_key, allowed, scope FROM role_permissions') as $r) {
            if (!isset($rows[$r['perm_key']])) continue;
            $scoped = (bool) $rows[$r['perm_key']]['scopes'];
            $m[$r['role']][$r['perm_key']] = !$r['allowed'] ? false : ($scoped ? ($r['scope'] ?: $rows[$r['perm_key']]['scopes'][0]) : true);
        }
    }
    return $m;
}

/** What the current role has for a permission: false, true, or its scope. */
function grant(string $key): bool|string
{
    $role = my_role();
    if ($role === 'admin') return true;
    return perm_matrix()[$role][$key] ?? false;
}

/** This role's whole column (for the app to show and hide buttons). */
function my_grants(): array
{
    $out = [];
    foreach (array_keys(perm_rows()) as $k) $out[$k] = grant($k);
    return $out;
}

/**
 * Is the permission allowed here? $ctx says whether the record is the user's own / one they're assigned to.
 * Returns false, or ['approval' => bool] (true when the change has to wait for an admin).
 */
function allows(string $key, array $ctx = []): false|array
{
    $g = grant($key);
    if ($g === false) return false;
    if ($g === true || $g === 'all') return ['approval' => false];
    return match ($g) {
        'approval' => ['approval' => true],
        'own' => !empty($ctx['own']) ? ['approval' => false] : false,
        'own_approval' => !empty($ctx['own']) ? ['approval' => true] : false,
        'assigned' => !empty($ctx['assigned']) ? ['approval' => false] : false,
        default => false,
    };
}

function can(string $key, array $ctx = []): bool
{
    return allows($key, $ctx) !== false;
}

function need(string $key, array $ctx = [], string $what = 'do that'): array
{
    $a = allows($key, $ctx);
    if ($a === false) fail(me() ? 403 : 401, me() ? "Your role can’t $what." : 'Please sign in first.');
    return $a;
}

/** Any of the permissions (first allowed one wins). */
function need_any(array $keys, array $ctx, string $what): array
{
    foreach ($keys as $k) {
        $a = allows($k, $ctx);
        if ($a !== false) return $a;
    }
    fail(me() ? 403 : 401, me() ? "Your role can’t $what." : 'Please sign in first.');
}

/** Has the permission for at least one record (own / assigned unknown yet) – for showing data at all. */
function has_any(string $key): bool
{
    return grant($key) !== false;
}
