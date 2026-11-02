<?php
/*
  Choisir ou changer le mot de passe du back-office :  npm run password

  Le mot de passe est demandé au clavier (il ne s'affiche pas) et seule son
  empreinte est écrite dans public/api/config.php. Le fichier est créé à
  partir de config-exemple.php s'il n'existe pas encore. Il reste ensuite à
  envoyer config.php sur le serveur, dans le dossier api/.
*/

$config = getenv('BO_CONFIG_PATH') ?: dirname(__DIR__) . '/public/api/config.php';
$example = dirname(__DIR__) . '/public/api/config-exemple.php';

if (!is_file($config)) {
    copy($example, $config);
    echo "Fichier créé : public/api/config.php\n";
}

// Saisie masquée quand on est dans un vrai terminal.
function ask(string $label): string
{
    $terminal = function_exists('posix_isatty') && posix_isatty(STDIN);
    echo $label;
    if ($terminal) {
        shell_exec('stty -echo');
    }
    $value = rtrim((string) fgets(STDIN), "\r\n");
    if ($terminal) {
        shell_exec('stty echo');
        echo "\n";
    }
    return $value;
}

$password = ask('Nouveau mot de passe (12 caractères au moins) : ');
if (mb_strlen($password) < 12) {
    exit("Trop court : rien n'a été modifié.\n");
}
if ($password !== ask('Le même, pour confirmer : ')) {
    exit("Les deux saisies sont différentes : rien n'a été modifié.\n");
}

$hash = password_hash($password, PASSWORD_DEFAULT);
$source = file_get_contents($config);
$updated = preg_replace_callback(
    "/('password_hash'\s*=>\s*)'[^']*'/",
    fn($match) => $match[1] . var_export($hash, true),
    $source,
    1,
    $count
);
if ($count !== 1) {
    exit("La ligne 'password_hash' est introuvable dans config.php : rien n'a été modifié.\n");
}
file_put_contents($config, $updated);

echo "C'est enregistré. Envoie maintenant public/api/config.php sur le serveur, dans le dossier api/.\n";
