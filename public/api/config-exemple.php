<?php
/*
  Configuration du back-office. À copier en `config.php`, à remplir, puis à
  déposer UNE FOIS sur le serveur, dans le dossier /api, par FTP.

  `config.php` n'est jamais envoyé sur GitHub (voir .gitignore) et le
  .htaccess en interdit la lecture depuis un navigateur.

  Tant qu'un champ vaut A_DEMANDER_A_FIDIA, le back-office refuse de démarrer.
*/

return [
    // Empreinte du mot de passe de Florie, jamais le mot de passe lui-même.
    // Pour la produire :  npm run password
    'password_hash' => 'A_DEMANDER_A_FIDIA',

    // Jeton GitHub « fine-grained », limité à CE dépôt, avec les droits :
    //   Contents : Read and write   (écrire les articles)
    //   Actions  : Read-only        (suivre la mise en ligne)
    'github_token' => 'A_DEMANDER_A_FIDIA',

    'github_repo' => 'Fidia-e/NATUREETDIETETIQUE',
    'github_branch' => 'main',
];
