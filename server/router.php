<?php
// Development only; production uses Apache in the Docker image.
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if ($path==='/') { header('Content-Type: text/html; charset=utf-8'); readfile(dirname(__DIR__).'/public/index.html'); return true; }
$static=['/','/index.html','/app.js','/styles.css','/favicon.svg'];
if (in_array($path,$static,true)) return false;
require __DIR__.'/api.php';
