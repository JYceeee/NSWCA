<?php
// Shared helpers: config, database, JSON in/out, session and the signed-in user.
declare(strict_types=1);

const ROLES = ['admin', 'organiser', 'arbiter', 'member'];

final class HttpError extends Exception
{
    public function __construct(public int $status, string $message, public array $extra = [])
    {
        parent::__construct($message);
    }
}

function fail(int $status, string $message, array $extra = []): never
{
    throw new HttpError($status, $message, $extra);
}

function config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        // PRINCIPLES_CONFIG lets a local test server use a config file kept outside the site.
        $file = getenv('PRINCIPLES_CONFIG') ?: __DIR__ . '/config.php';
        if (!is_file($file)) fail(500, 'The API is not set up yet: copy api/config.sample.php to api/config.php and fill it in.');
        $cfg = require $file;
    }
    return $cfg;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = config();
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['db_host'], $c['db_port'] ?? 3306, $c['db_name']);
        $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
    }
    return $pdo;
}

/** Runs a statement and returns it (for fetch / rowCount). */
function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function rows(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function row(string $sql, array $params = []): ?array
{
    $r = q($sql, $params)->fetch();
    return $r === false ? null : $r;
}

function value(string $sql, array $params = []): mixed
{
    $v = q($sql, $params)->fetchColumn();
    return $v === false ? null : $v;
}

/** Runs $fn in a transaction (nested calls join the outer one). */
function tx(callable $fn): mixed
{
    $pdo = db();
    if ($pdo->inTransaction()) return $fn();
    $pdo->beginTransaction();
    try {
        $out = $fn();
        $pdo->commit();
        return $out;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

function body(): array
{
    static $b = null;
    if ($b === null) {
        $raw = file_get_contents('php://input') ?: '';
        $b = $raw === '' ? [] : json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($b)) $b = [];
    }
    return $b;
}

function input(string $key, mixed $default = null): mixed
{
    return body()[$key] ?? $_POST[$key] ?? $default;
}

function str_in(string $key, int $max = 255): string
{
    $v = input($key, '');
    if (!is_scalar($v)) fail(400, "$key must be text");
    return mb_substr(trim((string) $v), 0, $max);
}

function send(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function enc(mixed $v): string
{
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

function dec(?string $json): mixed
{
    return $json === null || $json === '' ? null : json_decode($json, true);
}

/** JSON of a value with object keys sorted, so two copies of the same data compare equal. */
function canon(mixed $v): string
{
    $sort = function ($x) use (&$sort) {
        if (!is_array($x)) return $x;
        if (!array_is_list($x)) ksort($x);
        return array_map($sort, $x);
    };
    return json_encode($sort($v), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function same(mixed $a, mixed $b): bool
{
    return canon($a) === canon($b);
}

function now(): string
{
    return gmdate('Y-m-d H:i:s');
}

/** '' -> NULL for DATE columns; anything that isn't yyyy-mm-dd is dropped. */
function sql_date(mixed $d): ?string
{
    return is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) ? $d : null;
}

function uid(string $prefix): string
{
    return $prefix . '-' . base_convert((string) (int) (microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(3));
}

// ---------- Session and the signed-in user ----------

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_name('principles');
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 30,
        'path' => '/',
        'secure' => (bool) (config()['cookie_secure'] ?? true),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    ini_set('session.gc_maxlifetime', (string) (60 * 60 * 24 * 30));
    session_start();
}

/** The signed-in user (active accounts only), or null for a visitor. */
function me(): ?array
{
    static $me = false;
    if ($me !== false) return $me;
    start_session();
    $id = $_SESSION['uid'] ?? null;
    $me = $id ? row("SELECT u.id, u.username, u.email, u.role, u.status, u.player_id, p.first_name, p.last_name
                     FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?", [$id]) : null;
    if ($me && $me['status'] !== 'active') {
        // Disabled (or no longer approved) while signed in.
        unset($_SESSION['uid']);
        $me = null;
    }
    if ($me) $me['id'] = (int) $me['id'];
    return $me;
}

function my_id(): ?int
{
    return me()['id'] ?? null;
}

function my_role(): string
{
    return me()['role'] ?? 'visitor';
}

function is_admin(): bool
{
    return my_role() === 'admin';
}

function require_login(): array
{
    return me() ?? fail(401, 'Please sign in first.');
}

function display_name(array $u): string
{
    $n = trim(($u['first_name'] ?? '') . ' ' . ($u['last_name'] ?? ''));
    return $n !== '' ? $n : (string) ($u['username'] ?? '');
}

// ---------- Audit log ----------

function audit(string $action, ?int $target = null, ?string $field = null, mixed $old = null, mixed $new = null): void
{
    $txt = fn($v) => $v === null ? null : (is_scalar($v) ? (string) $v : enc($v));
    q('INSERT INTO audit_log (actor_id, target_user_id, action, field, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
        [my_id(), $target, $action, $field, $txt($old), $txt($new)]);
}

// ---------- Mail ----------

function send_mail(string $to, string $subject, string $text, ?string $replyTo = null): bool
{
    $from = config()['mail_from'] ?? ('no-reply@' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $headers = "From: $from\r\n" . ($replyTo ? "Reply-To: $replyTo\r\n" : '') . "Content-Type: text/plain; charset=utf-8\r\n";
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, $headers);
}

function site_url(): string
{
    $c = config();
    if (!empty($c['site_url'])) return rtrim($c['site_url'], '/');
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
}
