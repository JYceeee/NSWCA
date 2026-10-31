<?php
// Admin › Email templates: the wording of every email the site sends, earlier versions and the change log.
// The current text and its history live in settings.email_templates; templates nobody edited use these defaults.
declare(strict_types=1);

const MAX_SUBJECT = 200;
const MAX_BODY = 20000;

/**
 * id => what the page shows, the placeholders (key => [label, sample]) and the default wording.
 * required: placeholders the body can't lose. optional: an empty body means the email isn't sent.
 */
function email_defaults(): array
{
    $person = ['name' => ['Their name', 'Alex Chen']];
    $link = ['link' => ['One-time link', site_url() . '/#reset/sample-link']];
    $cfg = setting('page_config')['contact'] ?? [];
    // The automatic reply used to be set in Page Config.
    $reply = trim((string) ($cfg['autoReply'] ?? 'Thanks for contacting us. We have your message and will reply as soon as we can.'));
    return [
        'password_reset' => [
            'name' => 'Reset password', 'description' => 'When someone asks to reset their password, or an admin resets it.', 'to' => 'The user',
            'vars' => $person + $link, 'required' => ['link'], 'optional' => false,
            'subject' => 'Reset your password',
            'body' => "Hi {{name}},\n\nUse this link to set a new password – it works once, for 48 hours:\n\n{{link}}\n\nIf you didn’t ask for this, ignore this email.",
        ],
        'account_created' => [
            'name' => 'New account', 'description' => 'When an admin creates an account for someone.', 'to' => 'The new user',
            'vars' => $person + ['username' => ['Username', 'alexchen']] + $link, 'required' => ['link'], 'optional' => false,
            'subject' => 'Your account',
            'body' => "Hi {{name}},\n\nAn account has been made for you (username: {{username}}).\nSet your password here – the link works once, for 48 hours:\n\n{{link}}",
        ],
        'signup_approved' => [
            'name' => 'Sign-up approved', 'description' => 'When a member sign-up is approved.', 'to' => 'The new member',
            'vars' => $person + ['site' => ['Website address', site_url() . '/']], 'required' => [], 'optional' => false,
            'subject' => 'Your sign-up was approved',
            'body' => "Hi {{name}},\n\nYour account is ready. Sign in at {{site}}",
        ],
        'enquiry_notify' => [
            'name' => 'New enquiry', 'description' => 'When the Contact Us form is sent. Goes to the address in Page Config.', 'to' => 'Staff',
            'vars' => [
                'name' => ['Sender’s name', 'Alex Chen'], 'email' => ['Sender’s email', 'alex@example.com'], 'phone' => ['Sender’s phone', '0400 000 000'],
                'club' => ['Sender’s club', 'City Chess Club'], 'type' => ['Inquiry type', 'Membership'], 'message' => ['Their message', 'Hello, how do I join the club?'],
            ],
            'required' => ['message'], 'optional' => false,
            'subject' => 'Website enquiry: {{type}}',
            'body' => "New enquiry from the website\n\nName: {{name}}\nEmail: {{email}}\nPhone: {{phone}}\nClub: {{club}}\nType: {{type}}\n\n{{message}}",
        ],
        'enquiry_reply' => [
            'name' => 'Enquiry automatic reply', 'description' => 'When the Contact Us form is sent with an email address. Leave the text empty to send no reply.', 'to' => 'The sender',
            'vars' => ['first_name' => ['Sender’s first name', 'Alex']], 'required' => [], 'optional' => true,
            'subject' => 'We received your message',
            'body' => $reply === '' ? '' : "Hi {{first_name}},\n\n$reply",
        ],
    ];
}

/** The template as it stands now: defaults, then whatever was saved. */
function email_view(string $id, array $def, array $saved): array
{
    return [
        'id' => $id, 'name' => $def['name'], 'description' => $def['description'], 'to' => $def['to'],
        'vars' => array_map(fn($k, $v) => ['key' => $k, 'label' => $v[0], 'sample' => $v[1]], array_keys($def['vars']), $def['vars']),
        'required' => $def['required'], 'optional' => $def['optional'],
        'subject' => $saved['subject'] ?? $def['subject'], 'body' => $saved['body'] ?? $def['body'],
        'version' => (int) ($saved['version'] ?? 1), 'at' => $saved['at'] ?? null, 'by' => $saved['by'] ?? 'Site default',
        'history' => array_reverse($saved['history'] ?? []),
    ];
}

function list_email_templates(): array
{
    need('page.emails', [], 'see the email templates');
    $saved = setting('email_templates') ?? [];
    $out = [];
    foreach (email_defaults() as $id => $def) $out[] = email_view($id, $def, $saved[$id] ?? []);
    return ['templates' => $out];
}

/** Fills in {{placeholders}}. One pass, so text someone typed into a form can't bring in another placeholder. */
function email_fill(string $text, array $vars): string
{
    return preg_replace_callback('/\{\{\s*(\w+)\s*\}\}/', fn($m) => array_key_exists($m[1], $vars) ? (string) $vars[$m[1]] : $m[0], $text);
}

/** Sends a template; a template with an empty body is switched off. */
function send_template(string $id, string $to, array $vars, ?string $replyTo = null): bool
{
    $def = email_defaults()[$id];
    $saved = setting('email_templates')[$id] ?? [];
    $body = trim((string) ($saved['body'] ?? $def['body']));
    if ($body === '') return false;
    return send_mail($to, email_fill($saved['subject'] ?? $def['subject'], $vars), email_fill($body, $vars) . "\n", $replyTo);
}

function check_email_text(array $def, string $subject, string $body): void
{
    if ($subject === '') fail(400, 'Enter a subject.');
    if ($body === '' && !$def['optional']) fail(400, 'Enter the email’s text.');
    preg_match_all('/\{\{\s*(\w+)\s*\}\}/', "$subject $body", $m);
    foreach (array_unique($m[1]) as $key)
        if (!isset($def['vars'][$key])) fail(400, "{{{$key}}} isn’t a placeholder this email can use.");
    if ($body === '') return;
    foreach ($def['required'] as $key)
        if (!preg_match('/\{\{\s*' . $key . '\s*\}\}/', $body)) fail(400, "This email needs {{{$key}}} in its text.");
}

/** Puts the current version in the history and makes `$subject` / `$body` the current one. Returns the new version number. */
function put_email_version(array &$all, string $id, array $def, string $subject, string $body): int
{
    $cur = email_view($id, $def, $all[$id] ?? []);
    $history = $all[$id]['history'] ?? [];
    $history[] = ['version' => $cur['version'], 'subject' => $cur['subject'], 'body' => $cur['body'], 'at' => $cur['at'], 'by' => $cur['by']];
    $version = $cur['version'] + 1;
    $all[$id] = ['subject' => $subject, 'body' => $body, 'version' => $version, 'at' => now(), 'by' => display_name(me()), 'history' => $history];
    return $version;
}

function email_template_arg(array $defs): string
{
    $id = str_in('id', 32);
    if (!isset($defs[$id])) fail(404, 'That email template doesn’t exist.');
    return $id;
}

function save_email_template(): array
{
    need('emails.edit', [], 'edit email templates');
    $subject = str_in('subject', MAX_SUBJECT);
    $body = str_in('body', MAX_BODY);
    tx(function () use ($subject, $body) {
        $defs = email_defaults();
        $id = email_template_arg($defs);
        $def = $defs[$id];
        check_email_text($def, $subject, $body);
        $all = setting('email_templates') ?? [];
        $cur = email_view($id, $def, $all[$id] ?? []);
        if ((int) input('base') !== $cur['version']) fail(409, 'Someone else changed this template. Reload the page and try again.');
        if ($subject === $cur['subject'] && $body === $cur['body']) return;
        $version = put_email_version($all, $id, $def, $subject, $body);
        put_setting('email_templates', $all);
        $name = "{$def['name']} v$version";
        if ($subject !== $cur['subject']) audit('email_edit', null, "$name · Subject", $cur['subject'], $subject);
        if ($body !== $cur['body']) audit('email_edit', null, "$name · Text", $cur['body'], $body);
    });
    return list_email_templates();
}

/** Brings an earlier version back as a new version, so the history keeps everything. */
function restore_email_template(): array
{
    need('emails.edit', [], 'edit email templates');
    tx(function () {
        $defs = email_defaults();
        $id = email_template_arg($defs);
        $def = $defs[$id];
        $all = setting('email_templates') ?? [];
        $cur = email_view($id, $def, $all[$id] ?? []);
        if ((int) input('base') !== $cur['version']) fail(409, 'Someone else changed this template. Reload the page and try again.');
        $wanted = (int) input('version');
        $old = null;
        foreach ($cur['history'] as $h) if ((int) $h['version'] === $wanted) $old = $h;
        if (!$old) fail(404, 'That version doesn’t exist.');
        $version = put_email_version($all, $id, $def, $old['subject'], $old['body']);
        put_setting('email_templates', $all);
        audit('email_restore', null, "{$def['name']} v$version", "Version {$cur['version']}", "Version $wanted");
    });
    return list_email_templates();
}
