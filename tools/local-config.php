<?php
// Configuration d'ESSAI, utilisée seulement par `npm run bo`. Le mot de passe
// local est « test » ; le faux GitHub est servi par tools/local-server.php et
// écrit directement dans src/content/blog, sans jamais toucher au vrai dépôt.
return [
    'password_hash' => password_hash('test', PASSWORD_DEFAULT),
    'github_token' => 'local',
    'github_repo' => 'local/natureetdietetique',
    'github_branch' => 'main',
    'github_api' => 'http://localhost:' . (getenv('BO_PORT') ?: '4400') . '/mock-github',
];
