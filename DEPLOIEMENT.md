# Mise en ligne sur o2switch

Tout se fait une seule fois. Ensuite, chaque commit sur `main` et chaque
article publié depuis `/admin/` mettent le site à jour tout seuls.

**Rien n'est encore rempli.** Les valeurs ci-dessous n'ont pas été données : le
dépôt porte le marqueur `A_DEMANDER_A_FIDIA` à leur place, et le back-office
refuse de démarrer tant qu'il le trouve.

| À fournir | Où ça va | Étape |
| --- | --- | --- |
| Hôte, identifiant et mot de passe FTP | secrets GitHub | 1 |
| Dossier du site sur le serveur | variable GitHub | 1 |
| Jeton GitHub | `config.php` | 2 |
| Mot de passe de Florie | `npm run password` | 2 |
| Nom du sous-domaine du back-office, s'il y en a un | cPanel | 3 |

## 1. La GitHub Action

Dans le dépôt `Fidia-e/NATUREETDIETETIQUE` : Settings → Secrets and variables →
Actions.

| Secret         | Valeur                        |
| -------------- | ----------------------------- |
| `FTP_SERVER`   | l'hôte FTP du compte o2switch |
| `FTP_USERNAME` | l'identifiant FTP             |
| `FTP_PASSWORD` | le mot de passe FTP           |

Dans l'onglet Variables, créer `FTP_SERVER_DIR` : le dossier du site, avec la
barre finale, par exemple `./natureetdietetique.com/`.

**Cette variable est la dernière à poser.** Tant qu'elle n'existe pas, le
workflow s'arrête sans rien envoyer : un dossier deviné pourrait écraser un
autre site du même compte. Une fois posée, le prochain commit sur `main` part
en ligne.

Conseil : créer dans cPanel un compte FTP limité au dossier du site, plutôt que
d'utiliser le compte principal.

## 2. Le back-office

### Le jeton GitHub

GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.

- Repository access : **Only select repositories** → `NATUREETDIETETIQUE`
- Permissions : **Contents : Read and write**, **Actions : Read-only**

### Le fichier de configuration

```bash
npm run password
```

La commande demande le mot de passe de Florie (12 caractères au moins), crée
`public/api/config.php` à partir de l'exemple et n'y écrit que son empreinte.
Coller ensuite le jeton dans `github_token`, puis déposer ce fichier **par FTP**
dans le dossier `api/` du site. Il n'est pas dans git et la GitHub Action ne le
touche jamais : le jeton ne quitte pas le serveur.

## 3. L'adresse à donner à Florie

Le back-office est sur `https://natureetdietetique.com/admin/`.

Pour lui éviter de retenir `/admin/`, un sous-domaine peut y rediriger. Son nom
reste à décider (`A_DEMANDER_A_FIDIA`). Dans cPanel, il a son propre dossier sur
le serveur (celui qui contient `cgi-bin`) : il suffit d'y déposer, une fois, le
fichier `tools/admin-subdomain/.htaccess` du projet. Il ne change jamais, la
GitHub Action n'a pas à y toucher.

Le sous-domaine n'héberge rien et n'ajoute aucune sécurité : c'est une adresse
plus simple, rien d'autre.

## 4. Premier envoi

Pousser `main`, ou lancer le workflow à la main depuis l'onglet Actions. Le
premier envoi dure quelques minutes (toutes les images), les suivants une à deux.

## 5. Vérifier

| À tester                                          | Attendu                                                 |
| ------------------------------------------------- | ------------------------------------------------------- |
| `http://www.natureetdietetique.com`               | une seule redirection vers `https://natureetdietetique.com/` |
| `https://natureetdietetique.com/bilan/`           | la page, **avec** sa barre finale                       |
| `https://natureetdietetique.com/bilan`            | redirige vers `/bilan/`                                 |
| une adresse inexistante                           | la page 404 du site                                     |
| `https://natureetdietetique.com/api/config.php`   | accès refusé (403)                                      |
| `https://natureetdietetique.com/admin/`           | la connexion, puis la liste des articles                |
| le sous-domaine du back-office, s'il existe       | redirige vers `https://natureetdietetique.com/admin/`   |
| enregistrer un brouillon depuis `/admin/`         | un commit « Blog : nouvel article » dans le dépôt       |
| `https://natureetdietetique.ch`                   | une redirection 301 vers le `.com` (voir `SEO.md`)      |

Le `.htaccess` a été essayé sur un Apache local, à une exception près : la
redirection arrive bien sur `https` sans `www`, mais le certificat lui-même
demande le vrai serveur. C'est donc la première ligne du tableau qu'il faut
regarder de près en ligne.

## 6. Après la mise en ligne

- **Note EcoIndex A** : la mesurer sur le site en ligne, avec la compression et
  le cache de l'hébergeur.
- **Search Console** : voir `SEO.md`.
