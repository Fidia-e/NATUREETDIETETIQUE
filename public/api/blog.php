<?php
/*
  =========================================================================
   Back-office du blog : le seul script côté serveur du site.

   Il vérifie le mot de passe, puis écrit les articles dans le dépôt GitHub
   (un fichier Markdown et une image par article, en un seul commit). Ce
   commit déclenche la GitHub Action, qui reconstruit le site et le met en
   ligne. Aucune base de données : GitHub est la mémoire du blog.

   Le jeton GitHub reste ici, sur le serveur. Il n'arrive jamais dans le
   navigateur.

   Deux niveaux de règles, parce qu'un commit part directement sur `main` :
   - celles du schéma (src/content.config.ts), brouillons compris : le build
     lit aussi les brouillons, et un article refusé bloquerait toute mise en
     ligne ;
   - celles que les tests gardent sur les pages publiées (SEO.md) : un article
     accepté ne doit jamais faire tomber `npm test`.
  =========================================================================
*/

declare(strict_types=1);

const CONTENT_DIR = 'src/content/blog';
const IMAGE_DIR = 'src/content/blog/images';
// Le modèle reste dans le dépôt pour Fidia : Florie ne le voit ni ne le modifie.
const TEMPLATE_SLUG = 'modele-article';
const MAX_IMAGE_BYTES = 1500000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_SECONDS = 900;
const IMAGE_TYPES = ['image/webp' => 'webp', 'image/jpeg' => 'jpg', 'image/png' => 'png'];
const CATEGORIES = ['Nutrition', 'Recettes', 'Bien-être', 'Décryptage'];
const CTAS = ['bilan', 'accompagnement', 'ateliers', 'rendez-vous'];
// Valeur des champs de config-exemple.php tant que Fidia ne les a pas remplis.
const UNSET_MARKER = 'A_DEMANDER_A_FIDIA';

/*
 * Mots que les tests refusent sur le site (tests/site-integrity.test.ts). Le
 * titre de diététicienne est réglementé en Suisse (LPSan), et les autres
 * renvoient au droit français. Voir SEO.md.
 */
const FORBIDDEN_WORDS = [
    '/di[eé]t[eé]ticien/iu' => 'Le titre de diététicienne est réglementé en Suisse : ce mot ne peut pas figurer sur le site tant que Florie n’a pas confirmé le sien.',
    '/\bCNIL\b/u' => 'La CNIL est française : en Suisse, c’est le PFPDT.',
    '/\bADELI\b/u' => 'Le répertoire ADELI est français : ce mot ne peut pas figurer sur le site.',
    '/code de la santé publique/iu' => 'Le code de la santé publique est français : ce terme ne peut pas figurer sur le site.',
    '/l[\'’]Assurance maladie/iu' => 'L’Assurance maladie est française : en Suisse, on parle de caisse maladie.',
    '/\bmutuelles?\b/iu' => 'Le mot « mutuelle » est français : en Suisse, on parle d’assurance complémentaire.',
];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

// ---- Outils -------------------------------------------------------------

function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $message, int $status = 400): never
{
    respond(['error' => $message], $status);
}

function config(): array
{
    static $config = null;
    if ($config === null) {
        // En local (npm run bo), la configuration d'essai remplace celle du serveur.
        $path = getenv('BO_LOCAL_CONFIG') ?: __DIR__ . '/config.php';
        if (!is_file($path)) {
            fail('Le back-office n’est pas encore configuré (config.php absent).', 503);
        }
        $config = require $path;
        foreach (['password_hash', 'github_token', 'github_repo'] as $key) {
            if (empty($config[$key]) || $config[$key] === UNSET_MARKER) {
                fail('Le back-office n’est pas encore configuré (' . $key . ' vide).', 503);
            }
        }
        $config += ['github_branch' => 'main', 'github_api' => 'https://api.github.com'];
    }
    return $config;
}

/** Appel à l'API GitHub. Renvoie [code HTTP, corps décodé]. */
function github(string $method, string $path, ?array $body = null): array
{
    $config = config();
    $curl = curl_init($config['github_api'] . $path);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $config['github_token'],
            'Accept: application/vnd.github+json',
            'X-GitHub-Api-Version: 2022-11-28',
            'User-Agent: natureetdietetique-back-office',
            'Content-Type: application/json',
        ],
    ]);
    if ($body !== null) {
        curl_setopt($curl, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    if ($raw === false) {
        fail('GitHub ne répond pas, réessaie dans un instant.', 502);
    }
    return [$status, json_decode((string) $raw, true) ?? []];
}

/** Comme github(), mais toute réponse autre qu'un succès arrête la requête. */
function githubOrFail(string $method, string $path, ?array $body = null): array
{
    [$status, $data] = github($method, $path, $body);
    if ($status < 200 || $status >= 300) {
        error_log("GitHub $method $path : $status " . json_encode($data));
        fail('GitHub a refusé l’opération (code ' . $status . ').', 502);
    }
    return $data;
}

function repoPath(string $suffix): string
{
    return '/repos/' . config()['github_repo'] . $suffix;
}

/**
 * Longueur comptée comme le schéma : en points de code. Zod 4 voit un emoji
 * pour un caractère, comme mb_strlen, et non pour deux comme String.length.
 */
function isBetween(string $value, int $min, int $max): bool
{
    $length = mb_strlen($value);
    return $length >= $min && $length <= $max;
}

/** « Mon Titre d'été ! » devient « mon-titre-d-ete ». */
function slugify(string $text): string
{
    // Table explicite plutôt que iconv : sa translittération change d'un serveur à l'autre.
    $text = strtr(mb_strtolower($text), [
        'à' => 'a', 'â' => 'a', 'ä' => 'a', 'ç' => 'c', 'é' => 'e', 'è' => 'e', 'ê' => 'e', 'ë' => 'e',
        'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u', 'û' => 'u', 'ü' => 'u', 'ÿ' => 'y',
        'œ' => 'oe', 'æ' => 'ae',
    ]);
    $text = preg_replace('/[^a-z0-9]+/', '-', $text) ?? '';
    return trim(substr(trim($text, '-'), 0, 80), '-');
}

function isSlug(mixed $value): bool
{
    return is_string($value) && preg_match('/^[a-z0-9]+(-[a-z0-9]+)*$/', $value) === 1 && strlen($value) <= 80;
}

function isDate(string $value): bool
{
    $date = DateTime::createFromFormat('!Y-m-d', $value);
    return $date && $date->format('Y-m-d') === $value;
}

// ---- Limitation des tentatives de connexion -----------------------------

function attemptsFile(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'inconnu';
    return sys_get_temp_dir() . '/nd-login-' . hash('sha256', $ip) . '.json';
}

function recentAttempts(): array
{
    $attempts = json_decode((string) @file_get_contents(attemptsFile()), true) ?: [];
    return array_values(array_filter($attempts, fn($time) => $time > time() - LOGIN_WINDOW_SECONDS));
}

// ---- Lecture et écriture des fichiers d'article -------------------------

/** Valeur YAML d'une ligne : entre guillemets doubles, simples, ou nue. */
function parseScalar(string $value): string
{
    $value = trim($value);
    if (str_starts_with($value, '"')) {
        $decoded = json_decode($value);
        return is_string($decoded) ? $decoded : trim($value, '"');
    }
    if (str_starts_with($value, "'")) {
        return str_replace("''", "'", substr($value, 1, -1));
    }
    return trim((string) preg_replace('/\s+#.*$/', '', $value));
}

/**
 * Sépare l'en-tête (entre les deux lignes « --- ») du texte de l'article. Il
 * lit ce que ce script écrit et ce que le modèle propose, faq comprise : pas
 * tout le YAML, et le test d'aller-retour le vérifie sur les articles du dépôt.
 */
function parseArticle(string $slug, string $source): array
{
    $article = ['slug' => $slug, 'title' => '', 'seoTitle' => '', 'description' => '', 'keyword' => '',
        'pubDate' => '', 'updatedDate' => '', 'category' => '', 'cover' => '', 'coverAlt' => '',
        'faq' => [], 'cta' => 'bilan', 'draft' => false, 'body' => $source];
    if (preg_match('/\A---\R(.*?)\R---\R?(.*)\z/s', $source, $parts) !== 1) {
        return $article;
    }
    $article['body'] = trim($parts[2]);

    $inFaq = false;
    foreach (preg_split('/\R/', $parts[1]) as $line) {
        if ($inFaq && preg_match('/^\s+-\s+(question|answer):\s*(.*)$/', $line, $pair) === 1) {
            $article['faq'][] = [$pair[1] => parseScalar($pair[2])];
            continue;
        }
        if ($inFaq && $article['faq'] !== [] && preg_match('/^\s+(question|answer):\s*(.*)$/', $line, $pair) === 1) {
            $article['faq'][array_key_last($article['faq'])][$pair[1]] = parseScalar($pair[2]);
            continue;
        }
        if (preg_match('/^(\w+):\s*(.*)$/', $line, $pair) !== 1) {
            continue;
        }
        $inFaq = $pair[1] === 'faq';
        if ($inFaq || !array_key_exists($pair[1], $article)) {
            continue;
        }
        $value = parseScalar($pair[2]);
        $article[$pair[1]] = match ($pair[1]) {
            'draft' => $value === 'true',
            // Le champ de date du navigateur n'accepte que AAAA-MM-JJ.
            'pubDate', 'updatedDate' => substr($value, 0, 10),
            default => $value,
        };
    }
    $article['faq'] = array_map(fn($item) => $item + ['question' => '', 'answer' => ''], $article['faq']);
    return $article;
}

/** L'en-tête est écrit en YAML ; une chaîne JSON est une chaîne YAML valide. */
function buildArticle(array $article): string
{
    $quote = fn(string $value) => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $lines = ['---', 'title: ' . $quote($article['title'])];
    if ($article['seoTitle'] !== '') {
        $lines[] = 'seoTitle: ' . $quote($article['seoTitle']);
    }
    $lines[] = 'description: ' . $quote($article['description']);
    $lines[] = 'keyword: ' . $quote($article['keyword']);
    $lines[] = 'pubDate: ' . $article['pubDate'];
    if ($article['updatedDate'] !== '') {
        $lines[] = 'updatedDate: ' . $article['updatedDate'];
    }
    $lines[] = 'category: ' . $article['category'];
    // l'image de couverture est facultative
    if ($article['cover'] !== '') {
        $lines[] = 'cover: ' . $article['cover'];
        $lines[] = 'coverAlt: ' . $quote($article['coverAlt']);
    }
    if ($article['faq'] !== []) {
        $lines[] = 'faq:';
        foreach ($article['faq'] as $item) {
            $lines[] = '  - question: ' . $quote($item['question']);
            $lines[] = '    answer: ' . $quote($item['answer']);
        }
    }
    $lines[] = 'cta: ' . $article['cta'];
    if ($article['draft']) {
        $lines[] = 'draft: true';
    }
    $lines[] = '---';
    return implode("\n", $lines) . "\n\n" . trim($article['body']) . "\n";
}

/** Tous les articles en une seule requête (GraphQL), du plus récent au plus ancien. */
function listArticles(): array
{
    [$owner, $name] = explode('/', config()['github_repo'], 2);
    $query = 'query($owner: String!, $name: String!, $expression: String!) {
        repository(owner: $owner, name: $name) {
            object(expression: $expression) {
                ... on Tree { entries { name object { ... on Blob { text } } } }
            }
        }
    }';
    $data = githubOrFail('POST', '/graphql', [
        'query' => $query,
        'variables' => ['owner' => $owner, 'name' => $name,
            'expression' => config()['github_branch'] . ':' . CONTENT_DIR],
    ]);
    $articles = [];
    foreach ($data['data']['repository']['object']['entries'] ?? [] as $entry) {
        $slug = substr($entry['name'], 0, -3);
        if (str_ends_with($entry['name'], '.md') && $slug !== TEMPLATE_SLUG && isset($entry['object']['text'])) {
            $articles[] = parseArticle($slug, $entry['object']['text']);
        }
    }
    usort($articles, fn($a, $b) => strcmp($b['pubDate'], $a['pubDate']));
    return $articles;
}

function findArticle(array $articles, string $slug): ?array
{
    foreach ($articles as $article) {
        if ($article['slug'] === $slug) {
            return $article;
        }
    }
    return null;
}

/**
 * Un seul commit pour tous les fichiers, donc une seule mise en ligne.
 * $files : chemin => contenu (chaîne), contenu binaire ['base64' => ...], ou null pour supprimer.
 */
function commitFiles(array $files, string $message): void
{
    $branch = config()['github_branch'];
    $ref = githubOrFail('GET', repoPath('/git/ref/heads/' . $branch));
    $parent = $ref['object']['sha'];
    $baseTree = githubOrFail('GET', repoPath('/git/commits/' . $parent))['tree']['sha'];

    $entries = [];
    foreach ($files as $path => $content) {
        $entry = ['path' => $path, 'mode' => '100644', 'type' => 'blob'];
        if ($content === null) {
            $entry['sha'] = null;
        } else {
            $blob = is_array($content)
                ? ['content' => $content['base64'], 'encoding' => 'base64']
                : ['content' => $content, 'encoding' => 'utf-8'];
            $entry['sha'] = githubOrFail('POST', repoPath('/git/blobs'), $blob)['sha'];
        }
        $entries[] = $entry;
    }

    $tree = githubOrFail('POST', repoPath('/git/trees'), ['base_tree' => $baseTree, 'tree' => $entries]);
    $commit = githubOrFail('POST', repoPath('/git/commits'), [
        'message' => $message,
        'tree' => $tree['sha'],
        'parents' => [$parent],
    ]);
    githubOrFail('PATCH', repoPath('/git/refs/heads/' . $branch), ['sha' => $commit['sha']]);
}

// ---- Nettoyage et vérification de ce qu'envoie le formulaire ------------

/** Forme canonique, sans caractère de contrôle ni tiret cadratin. */
function cleanText(mixed $value): string
{
    $text = is_string($value) ? $value : '';
    if (class_exists('Normalizer')) {
        // Un texte collé depuis un Mac peut arriver décomposé : « é » compterait pour deux.
        $text = Normalizer::normalize($text) ?: $text;
    }
    $text = str_replace("\r\n", "\n", $text);
    $text = (string) preg_replace('/[^\P{Cc}\n\t]/u', '', $text);
    return trim(str_replace("\u{2014}", '-', $text));
}

function cleanLine(mixed $value): string
{
    return trim((string) preg_replace('/\s+/u', ' ', cleanText($value)));
}

/** Le texte tel que Markdown le rendra : pas de HTML, un seul niveau 1, liens internes canoniques. */
function cleanBody(string $body): string
{
    // Pas de HTML dans un article : seulement du Markdown.
    $body = (string) preg_replace('/<\/?[a-zA-Z!][^>]*>/', '', $body);
    $body = (string) preg_replace('/&(mdash|#8212|#x2014);/i', '-', $body);

    // Le build transforme « -- » en tiret cadratin, sauf dans les filets et les tableaux.
    $body = implode("\n", array_map(
        fn(string $line) => preg_match('/^[\s|:\-]+$/', $line) === 1
            ? $line
            : (string) preg_replace('/\]\([^)]*\)(*SKIP)(*F)|-{2,}/', '-', $line),
        explode("\n", $body)
    ));

    // Le seul titre de niveau 1 est celui de la page : « # » et « === » deviennent « ## ».
    $body = (string) preg_replace('/^#(?!#)\s*/m', '## ', $body);
    $body = (string) preg_replace('/^(\S.*)\n=+[ \t]*$/m', '## $1', $body);

    // Une adresse complète du site redevient un lien interne. Le .ch ne se présente jamais comme officiel.
    $body = (string) preg_replace('#\]\(https?://(?:www\.)?natureetdietetique\.(?:com|ch)(/[^)\s]*)?#i', '](/$1', $body);
    $body = str_replace('](//', '](/', $body);

    // Toutes les pages du site finissent par « / » : /bilan en serait une autre adresse.
    return (string) preg_replace_callback(
        '/\]\((\/[^)\s#?]*)/',
        fn(array $link) => preg_match('#(/|\.[a-z0-9]+)$#i', $link[1]) === 1 ? $link[0] : '](' . $link[1] . '/',
        $body
    );
}

/** Vérifie le formulaire et renvoie l'article nettoyé, ou arrête avec le premier défaut. */
function validateArticle(array $input): array
{
    $article = [
        'title' => cleanLine($input['title'] ?? ''),
        'seoTitle' => cleanLine($input['seoTitle'] ?? ''),
        'description' => cleanLine($input['description'] ?? ''),
        'keyword' => cleanLine($input['keyword'] ?? ''),
        'pubDate' => cleanLine($input['pubDate'] ?? ''),
        'updatedDate' => cleanLine($input['updatedDate'] ?? ''),
        'category' => cleanLine($input['category'] ?? ''),
        'coverAlt' => cleanLine($input['coverAlt'] ?? ''),
        'cta' => cleanLine($input['cta'] ?? ''),
        'faq' => [],
        'draft' => !empty($input['draft']),
        'body' => cleanBody(cleanText($input['body'] ?? '')),
    ];

    if (!isBetween($article['title'], 20, 90)) {
        fail('Le titre de l’article doit compter entre 20 et 90 caractères.');
    }
    if ($article['seoTitle'] !== '' && !isBetween($article['seoTitle'], 20, 60)) {
        fail('Le titre pour Google doit compter entre 20 et 60 caractères.');
    }
    if (!isBetween($article['description'], 70, 160)) {
        fail('La description doit compter entre 70 et 160 caractères.');
    }
    if (!isBetween($article['keyword'], 3, 60)) {
        fail('L’expression visée doit compter entre 3 et 60 caractères.');
    }
    if (!isDate($article['pubDate'])) {
        fail('La date de publication n’est pas valide.');
    }
    if ($article['updatedDate'] !== '' && !isDate($article['updatedDate'])) {
        fail('La date de mise à jour n’est pas valide.');
    }
    if (!in_array($article['category'], CATEGORIES, true)) {
        fail('Choisis une rubrique dans la liste.');
    }
    if (!in_array($article['cta'], CTAS, true)) {
        fail('Choisis la page vers laquelle l’article oriente.');
    }

    $faq = is_array($input['faq'] ?? null) ? $input['faq'] : [];
    foreach ($faq as $item) {
        $question = cleanLine(is_array($item) ? ($item['question'] ?? '') : '');
        $answer = cleanLine(is_array($item) ? ($item['answer'] ?? '') : '');
        // Une ligne laissée vide dans le formulaire n'est pas une question.
        if ($question === '' && $answer === '') {
            continue;
        }
        if (!isBetween($question, 10, 150)) {
            fail('Chaque question doit compter entre 10 et 150 caractères.');
        }
        if (!isBetween($answer, 40, 600)) {
            fail('Chaque réponse doit compter entre 40 et 600 caractères.');
        }
        $article['faq'][] = ['question' => $question, 'answer' => $answer];
    }

    if (mb_strlen($article['body']) > 60000) {
        fail('Le texte de l’article est trop long.');
    }
    // Une image locale absente fait échouer le build, brouillon compris, et le poids fait baisser la note EcoIndex A.
    if (preg_match('/!\[[^\]]*\]\(/', $article['body']) === 1) {
        fail('Le texte ne peut pas contenir d’image : utilise l’image de couverture.');
    }

    return $article;
}

/** Le titre que Google affichera, comme searchTitle() dans src/lib/blog.ts. */
function searchTitle(array $article): string
{
    return $article['seoTitle'] !== '' ? $article['seoTitle'] : $article['title'];
}

/** Pour chercher l'expression visée : ni casse, ni syntaxe Markdown, ni apostrophe courbe. */
function searchable(string $text): string
{
    $text = (string) preg_replace('/\]\([^)]*\)/', '', $text);
    $text = str_replace(['*', '_', '[', ']', '#', '`', "\u{2019}"], ['', '', '', '', '', '', "'"], $text);
    return trim((string) preg_replace('/[\s\x{00A0}\x{202F}]+/u', ' ', mb_strtolower($text)));
}

/** Le chemin interne mène-t-il à une page existante ? Le site servi est dans le dossier parent. */
function internalPageExists(string $path, array $published): bool
{
    if (preg_match('#^/blog/([^/]+)/$#', $path, $article) === 1) {
        return in_array($article[1], array_column($published, 'slug'), true);
    }
    if (str_contains($path, '..')) {
        return false;
    }
    $root = dirname(__DIR__);
    return str_ends_with($path, '/') ? is_file($root . $path . 'index.html') : is_file($root . $path);
}

/** Les règles que les tests gardent sur une page publiée. Un brouillon n'est pas une page. */
function checkPublishable(array $article, string $slug, array $others): void
{
    $keyword = searchable($article['keyword']);
    if (mb_strlen(searchTitle($article)) > 60) {
        fail('Google couperait ce titre : remplis le « titre pour Google » (60 caractères au plus).');
    }
    if (!str_contains(searchable(searchTitle($article)), $keyword)) {
        fail('L’expression visée doit figurer dans le titre pour Google.');
    }
    if (!str_contains(searchable($article['description']), $keyword)) {
        fail('L’expression visée doit figurer dans la description.');
    }
    if (!str_contains(searchable($article['body']), $keyword)) {
        fail('L’expression visée doit figurer dans le texte de l’article.');
    }
    if (mb_strlen($article['body']) < 100) {
        fail('Le texte de l’article est trop court.');
    }

    $texts = [$article['title'], $article['seoTitle'], $article['description'], $article['keyword'],
        $article['coverAlt'], $article['body']];
    foreach ($article['faq'] as $item) {
        $texts[] = $item['question'];
        $texts[] = $item['answer'];
    }
    foreach (FORBIDDEN_WORDS as $pattern => $message) {
        if (preg_match($pattern, implode("\n", $texts)) === 1) {
            fail($message);
        }
    }

    $published = array_values(array_filter($others, fn($other) => !$other['draft']));
    foreach ($published as $other) {
        if (searchTitle($other) === searchTitle($article)) {
            fail('Un autre article porte déjà ce titre dans Google : « ' . $other['title'] . ' ».');
        }
        if ($other['description'] === $article['description']) {
            fail('Un autre article porte déjà cette description : « ' . $other['title'] . ' ».');
        }
    }

    $linkable = [...$published, ['slug' => $slug]];
    preg_match_all('/\]\(([^)\s]*)/', $article['body'], $links);
    foreach ($links[1] as $link) {
        if (preg_match('/^(#|https?:\/\/|mailto:|tel:)/i', $link) === 1) {
            continue;
        }
        $path = (string) preg_replace('/[#?].*$/', '', $link);
        if (!str_starts_with($path, '/') || !internalPageExists($path, $linkable)) {
            fail('Le lien « ' . $link . ' » ne mène nulle part : écris /bilan/ pour une page du site, https://… pour un autre site.');
        }
    }
}

/** Un article publié renvoie-t-il vers celui-ci ? Le retirer laisserait un lien cassé. */
function findLinkingArticle(string $slug, array $others): ?array
{
    foreach ($others as $other) {
        if (!$other['draft'] && str_contains($other['body'], '](/blog/' . $slug . '/')) {
            return $other;
        }
    }
    return null;
}

/** Vérifie l'image envoyée (déjà réduite par le navigateur) et renvoie [extension, base64]. */
function validateImage(array $image): array
{
    $binary = base64_decode((string) ($image['data'] ?? ''), true);
    if ($binary === false || $binary === '') {
        fail('L’image n’a pas pu être lue.');
    }
    if (strlen($binary) > MAX_IMAGE_BYTES) {
        fail('L’image est trop lourde.');
    }
    $type = (new finfo(FILEINFO_MIME_TYPE))->buffer($binary);
    if (!isset(IMAGE_TYPES[$type]) || @getimagesizefromstring($binary) === false) {
        fail('L’image doit être au format JPEG, PNG ou WebP.');
    }
    return [IMAGE_TYPES[$type], base64_encode($binary)];
}

/** Le fichier d'une couverture, seulement si son chemin reste dans le dossier des images. */
function coverFile(string $cover): ?string
{
    return preg_match('#^\./images/[A-Za-z0-9_-]+\.(webp|jpe?g|png|avif)$#', $cover) === 1
        ? CONTENT_DIR . '/' . substr($cover, 2)
        : null;
}

// ---- Session ------------------------------------------------------------

session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => !empty($_SERVER['HTTPS']),
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_name('nd_admin');
session_start();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = (string) ($_GET['action'] ?? '');
$input = [];
if ($method === 'POST') {
    $input = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($input)) {
        fail('Requête illisible.');
    }
}
$authenticated = !empty($_SESSION['authenticated']);

if ($action === 'session' && $method === 'GET') {
    respond(['authenticated' => $authenticated, 'csrf' => $_SESSION['csrf'] ?? null]);
}

if ($action === 'login' && $method === 'POST') {
    $attempts = recentAttempts();
    if (count($attempts) >= MAX_LOGIN_ATTEMPTS) {
        fail('Trop de tentatives. Réessaie dans un quart d’heure.', 429);
    }
    if (!password_verify((string) (is_string($input['password'] ?? null) ? $input['password'] : ''), config()['password_hash'])) {
        $attempts[] = time();
        file_put_contents(attemptsFile(), json_encode($attempts), LOCK_EX);
        sleep(1);
        fail('Mot de passe incorrect.', 401);
    }
    @unlink(attemptsFile());
    session_regenerate_id(true);
    $_SESSION['authenticated'] = true;
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    respond(['authenticated' => true, 'csrf' => $_SESSION['csrf']]);
}

// ---- Tout ce qui suit demande d'être connectée --------------------------

if (!$authenticated) {
    fail('Connexion requise.', 401);
}
if ($method === 'POST' && !hash_equals($_SESSION['csrf'] ?? '', (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
    fail('Session expirée, reconnecte-toi.', 403);
}

if ($action === 'logout' && $method === 'POST') {
    $_SESSION = [];
    session_destroy();
    respond(['authenticated' => false]);
}

if ($action === 'list' && $method === 'GET') {
    respond(['articles' => listArticles()]);
}

if ($action === 'save' && $method === 'POST') {
    $article = validateArticle($input);
    $articles = listArticles();
    $editing = isset($input['slug']) && $input['slug'] !== '';
    $files = [];

    if ($editing) {
        // L'adresse d'un article ne change plus après sa création : un lien
        // partagé ou déjà référencé par Google doit continuer de fonctionner.
        $slug = $input['slug'];
        $existing = isSlug($slug) ? findArticle($articles, $slug) : null;
        if ($existing === null) {
            fail('Article introuvable.', 404);
        }
        $article['cover'] = $existing['cover'];
        // « Retirer l'image » : le fichier est supprimé du dépôt avec l'article mis à jour
        if (!empty($input['removeImage']) && empty($input['image']) && $article['cover'] !== '') {
            if (($file = coverFile($article['cover'])) !== null) {
                $files[$file] = null;
            }
            $article['cover'] = '';
        }
    } else {
        // L'adresse vient de l'expression visée : elle est courte et Google y lit le sujet.
        $slug = slugify($article['keyword']);
        if (!isSlug($slug)) {
            fail('L’expression visée ne permet pas de construire l’adresse de l’article.');
        }
        // Une expression, un article : deux pages sur le même sujet se feraient concurrence.
        if ($slug === TEMPLATE_SLUG || findArticle($articles, $slug) !== null) {
            fail('Un article vise déjà cette expression.');
        }
        $article['cover'] = '';
    }
    $others = array_values(array_filter($articles, fn($other) => $other['slug'] !== $slug));

    if ($article['draft']) {
        $linking = $editing ? findLinkingArticle($slug, $others) : null;
        if ($linking !== null) {
            fail('L’article « ' . $linking['title'] . ' » renvoie vers celui-ci : retire d’abord ce lien.');
        }
    } else {
        checkPublishable($article, $slug, $others);
    }

    if (!empty($input['image']) && is_array($input['image'])) {
        [$extension, $base64] = validateImage($input['image']);
        $cover = './images/' . $slug . '.' . $extension;
        // une nouvelle image d'un autre format remplace l'ancien fichier
        if ($editing && $article['cover'] !== '' && $article['cover'] !== $cover && ($file = coverFile($article['cover'])) !== null) {
            $files[$file] = null;
        }
        $article['cover'] = $cover;
        $files[IMAGE_DIR . '/' . $slug . '.' . $extension] = ['base64' => $base64];
    }

    // Une image sans description est invisible pour Google et pour les lecteurs d'écran.
    if ($article['cover'] !== '' && !isBetween($article['coverAlt'], 5, 200)) {
        fail('Décris l’image en quelques mots (5 à 200 caractères).');
    }

    $files[CONTENT_DIR . '/' . $slug . '.md'] = buildArticle($article);
    commitFiles($files, ($editing ? 'Blog : mise à jour de « ' : 'Blog : nouvel article « ') . $article['title'] . ' »');
    respond(['slug' => $slug, 'draft' => $article['draft']]);
}

if ($action === 'delete' && $method === 'POST') {
    $slug = $input['slug'] ?? '';
    $articles = listArticles();
    $existing = isSlug($slug) ? findArticle($articles, $slug) : null;
    if ($existing === null) {
        fail('Article introuvable.', 404);
    }
    $linking = findLinkingArticle($slug, array_filter($articles, fn($other) => $other['slug'] !== $slug));
    if ($linking !== null) {
        fail('L’article « ' . $linking['title'] . ' » renvoie vers celui-ci : retire d’abord ce lien.');
    }
    $files = [CONTENT_DIR . '/' . $slug . '.md' => null];
    if (($file = coverFile($existing['cover'])) !== null) {
        $files[$file] = null;
    }
    commitFiles($files, 'Blog : suppression de « ' . $existing['title'] . ' »');
    respond(['deleted' => $slug]);
}

// Où en est la mise en ligne déclenchée par le dernier enregistrement.
if ($action === 'status' && $method === 'GET') {
    [$status, $data] = github('GET', repoPath('/actions/runs?per_page=1&branch=' . config()['github_branch']));
    $run = $data['workflow_runs'][0] ?? null;
    if ($status !== 200 || $run === null) {
        respond(['state' => 'unknown']);
    }
    respond([
        'state' => $run['status'] !== 'completed' ? 'running' : ($run['conclusion'] === 'success' ? 'online' : 'failed'),
        'startedAt' => $run['run_started_at'] ?? null,
    ]);
}

fail('Action inconnue.', 404);
