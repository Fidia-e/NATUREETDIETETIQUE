<?php
/*
  Serveur d'essai du back-office : `npm run bo`, puis http://localhost:4400/admin/
  (mot de passe : test).

  Il fait deux choses que o2switch et GitHub font en production :
  1. servir /bilan/ pour bilan/index.html et la page 404, comme Apache ;
  2. jouer le rôle de GitHub : les articles enregistrés sont écrits dans
     src/content/blog, sur cette machine, sans commit ni mise en ligne.

  Les tests redirigent ces écritures vers un dossier temporaire (BO_CONTENT_ROOT).
*/

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = getenv('BO_CONTENT_ROOT') ?: dirname(__DIR__);
$store = sys_get_temp_dir() . '/nd-mock-github';

if (str_starts_with($path, '/mock-github')) {
    header('Content-Type: application/json');
    @mkdir($store);
    $body = json_decode((string) file_get_contents('php://input'), true) ?? [];
    $keep = function (array $data) use ($store): string {
        $sha = sha1(json_encode($data));
        file_put_contents("$store/$sha.json", json_encode($data));
        return $sha;
    };
    $reply = fn(array $data) => exit(json_encode($data));

    if (str_ends_with($path, '/graphql')) {
        $entries = [];
        foreach (glob("$root/src/content/blog/*.md") as $file) {
            $entries[] = ['name' => basename($file), 'object' => ['text' => file_get_contents($file)]];
        }
        $reply(['data' => ['repository' => ['object' => ['entries' => $entries]]]]);
    }
    if (str_contains($path, '/git/ref/')) {
        $reply(['object' => ['sha' => 'local']]);
    }
    if (str_contains($path, '/git/commits/')) {
        $reply(['tree' => ['sha' => 'local']]);
    }
    if (str_ends_with($path, '/git/blobs') || str_ends_with($path, '/git/trees')) {
        $reply(['sha' => $keep($body)]);
    }
    if (str_ends_with($path, '/git/commits')) {
        $reply(['sha' => $body['tree']]);
    }
    if (str_contains($path, '/git/refs/')) {
        // « pousser » le commit : on applique l'arbre aux fichiers locaux
        $tree = json_decode(file_get_contents("$store/{$body['sha']}.json"), true);
        foreach ($tree['tree'] as $entry) {
            $file = "$root/{$entry['path']}";
            if ($entry['sha'] === null) {
                @unlink($file);
                continue;
            }
            $blob = json_decode(file_get_contents("$store/{$entry['sha']}.json"), true);
            @mkdir(dirname($file), 0777, true);
            file_put_contents($file, $blob['encoding'] === 'base64' ? base64_decode($blob['content']) : $blob['content']);
        }
        $reply(['ref' => 'refs/heads/main']);
    }
    if (str_contains($path, '/actions/runs')) {
        $reply(['workflow_runs' => [['status' => 'completed', 'conclusion' => 'success']]]);
    }
    http_response_code(404);
    $reply(['message' => 'Not Found']);
}

$docroot = $_SERVER['DOCUMENT_ROOT'];

// /bilan renvoie vers /bilan/, comme le fait Apache pour un dossier
if (!str_ends_with($path, '/') && is_dir($docroot . $path)) {
    header('Location: ' . $path . '/', true, 301);
    return true;
}

// Une adresse inexistante : la page 404 du site
if (!is_file($docroot . $path) && !is_file($docroot . rtrim($path, '/') . '/index.html')) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    readfile("$docroot/404.html");
    return true;
}

return false; // tout le reste : fichiers statiques et api/blog.php
