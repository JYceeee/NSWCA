<?php
// Copy this file to config.php (same folder) and fill it in. config.php is git-ignored – never commit it.
// DreamHost: panel › MySQL Databases shows the hostname (e.g. mysql.example.com), database, user and password.
return [
    'db_host' => 'mysql.joyceyang.dreamhosters.com',
    'db_port' => 3306,
    'db_name' => 'principles',
    'db_user' => 'principles_user',
    'db_pass' => 'change-me',

    // Uploaded files (logos, backgrounds, photos, documents). Keep it OUTSIDE the website folder,
    // so files are only reachable through the API's permission checks.
    'upload_dir' => '/home/joyceyang/principles-uploads',

    // Used in password reset / welcome emails.
    'site_url' => 'https://joyceyang.dreamhosters.com',
    'mail_from' => 'no-reply@joyceyang.dreamhosters.com',

    // false only when testing on http://localhost.
    'cookie_secure' => true,

    // true shows server error messages in the app (turn off once it works).
    'debug' => false,
];
