<?php
// The app's API: /api/?a=<action>. Reads are GET, changes are POST with a JSON body
// (uploads: multipart) and the X-Principles header, which other sites can't send.
declare(strict_types=1);

require __DIR__ . '/_lib.php';
require __DIR__ . '/_perms.php';
require __DIR__ . '/_events.php';
require __DIR__ . '/_users.php';
require __DIR__ . '/_site.php';
require __DIR__ . '/_emails.php';

$routes = [
    // Signing in
    'state' => ['GET', fn() => state()],
    'login' => ['POST', fn() => login()],
    'logout' => ['POST', fn() => logout()],
    'register' => ['POST', fn() => register()],
    'forgot' => ['POST', fn() => forgot()],
    'reset' => ['POST', fn() => reset_password()],
    'password' => ['POST', fn() => change_password()],
    'profile' => ['POST', fn() => save_my_profile()],
    'contact' => ['POST', fn() => send_enquiry()],
    // Site data
    'design.put' => ['POST', fn() => put_design()],
    'design.delete' => ['POST', fn() => delete_design()],
    'settings.put' => ['POST', fn() => put_settings()],
    'categories.put' => ['POST', fn() => put_categories()],
    'event.put' => ['POST', fn() => put_event(is_array(input('base')) ? input('base') : null, is_array(input('next')) ? input('next') : fail(400, 'No event sent.'))],
    'event.delete' => ['POST', function () {
        delete_event(str_in('id', 64));
        return ['ok' => true];
    }],
    'event.arbiters' => ['POST', fn() => ['event' => set_arbiters(str_in('id', 64), (array) input('userIds', []))]],
    'players.put' => ['POST', fn() => put_players()],
    'upload' => ['POST', fn() => upload()],
    'file' => ['GET', fn() => send_file()],
    'documents.add' => ['POST', fn() => add_document()],
    'documents.delete' => ['POST', fn() => delete_document()],
    'import' => ['POST', fn() => import_state()],
    // User management
    'users.list' => ['GET', fn() => list_users()],
    'users.get' => ['POST', fn() => get_user()],
    'users.create' => ['POST', fn() => create_user()],
    'users.save' => ['POST', fn() => save_user()],
    'users.reset' => ['POST', fn() => admin_reset_password()],
    'users.disable' => ['POST', fn() => set_disabled(true)],
    'users.enable' => ['POST', fn() => set_disabled(false)],
    'users.approve' => ['POST', function () {
        decide_signup((int) input('id'), true);
        return get_user_by((int) input('id'));
    }],
    'users.reject' => ['POST', function () {
        decide_signup((int) input('id'), false, str_in('note', 500));
        return get_user_by((int) input('id'));
    }],
    'log' => ['POST', fn() => list_log()],
    'perms.get' => ['GET', fn() => get_permissions()],
    'perms.put' => ['POST', fn() => save_permissions()],
    'enquiries.list' => ['GET', fn() => list_enquiries()],
    'enquiries.handled' => ['POST', fn() => mark_enquiry()],
    'enquiries.delete' => ['POST', fn() => delete_enquiry()],
    'emails.list' => ['GET', fn() => list_email_templates()],
    'emails.save' => ['POST', fn() => save_email_template()],
    'emails.restore' => ['POST', fn() => restore_email_template()],
    'emails.log' => ['POST', fn() => list_email_log()],
    'approvals.list' => ['GET', fn() => list_approvals()],
    'approvals.decide' => ['POST', fn() => decide_approval()],
];

try {
    $a = (string) ($_GET['a'] ?? '');
    $route = $routes[$a] ?? fail(404, 'Unknown API action.');
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method !== $route[0]) fail(405, "Use $route[0] for $a.");
    if ($method === 'POST' && ($_SERVER['HTTP_X_PRINCIPLES'] ?? '') !== '1') fail(403, 'Missing request header.');
    send($route[1]());
} catch (HttpError $e) {
    send(['error' => $e->getMessage(), ...$e->extra], $e->status);
} catch (JsonException) {
    send(['error' => 'The request wasn’t valid JSON.'], 400);
} catch (Throwable $e) {
    error_log('[principles] ' . $e);
    $debug = (bool) (config()['debug'] ?? false);
    send(['error' => $debug ? $e->getMessage() : 'Something went wrong on the server. Try again, or check the PHP error log.'], 500);
}
