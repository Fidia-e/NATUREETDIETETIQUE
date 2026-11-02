# Nature & diététique

Site vitrine et entonnoir de conversion, construit avec [Astro](https://astro.build).
Site statique : aucune base de données, aucun serveur à maintenir.

## Référencement

Le but du site est d'apparaître en tête de Google. Les expressions visées, les
sujets d'articles, les règles d'écriture d'un article et ce qui reste à faire
hors du site (fiche Google, annuaires, Search Console) sont dans
[`SEO.md`](SEO.md).

## Démarrer

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # génère dist/
npm run preview  # sert dist/ en local
npm run bo       # essai du back-office : http://localhost:4400/admin/, mot de passe test
npm run password # choisit le mot de passe du back-office (écrit son empreinte dans public/api/config.php)
```

## Vérifications avant commit

```bash
npm run check && npm test
```

- `npm run check` lance `astro check` : types TypeScript et diagnostics sur les
  fichiers `.astro`.
- `npm test` construit le site puis lance Vitest : 278 tests répartis en
  quatre fichiers. PHP est nécessaire, le back-office tourne pour de vrai.
- `npm run eco` construit le site et affiche la note EcoIndex de chaque page.

### Ce que couvrent les tests

| Fichier | Ce qu'il vérifie |
| --- | --- |
| `tests/quiz-scoring.test.ts` | Le calcul du compte rendu : répartition par axe, seuils, choix du titre, cohérence des questions |
| `tests/quiz-funnel.test.ts` | Le parcours réel : verrouillage des étapes, retour arrière, compte rendu, consentement obligatoire, envoi et repli e-mail |
| `tests/site-integrity.test.ts` | Le site généré : pages attendues, liens internes, métadonnées, alternatives textuelles, absence de référence au droit français, contraste du pied de page, note EcoIndex, et référencement (titres, descriptions, données structurées, chacun des articles publiés) |
| `tests/back-office.test.ts` | Le vrai `blog.php` sur le serveur d'essai : mêmes verdicts que le schéma, nettoyage, règles de publication, aller-retour sur les articles du dépôt, connexion, fichiers de mise en ligne |

Le quiz est découpé en trois modules dans `src/lib/` : les données, le calcul
(fonctions pures) et le contrôleur DOM. Le composant `FunnelQuiz.astro` ne fait
que le rendu et l'appel au contrôleur, ce qui rend chaque partie testable
séparément.

## À renseigner

Tout se trouve dans [`src/config.ts`](src/config.ts).

| Clé | Ce qu'elle attend | Effet tant qu'elle vaut `null` |
| --- | --- | --- |
| `calendlyUrl` | URL Calendly du rendez-vous de 15 min | La page rendez-vous affiche le téléphone et le formulaire |
| `balanceVideoUrl` | URL d'intégration de la vidéo de 2 min | Un emplacement visuel tient la place |

La vidéo passe par [`VideoEmbed.astro`](src/components/VideoEmbed.astro), qui
n'insère l'`iframe` qu'au clic du visiteur. Rien du lecteur tiers n'est
téléchargé avant, ce qui allège la page et évite tout dépôt de cookie non
sollicité. Tout autre lecteur intégrable se branche de la même façon.
| `leadEndpoint` | URL acceptant un POST JSON pour les bilans | Le bilan part par la messagerie du visiteur |
| `contactEndpoint` | URL acceptant un POST pour les formulaires | Le message part par la messagerie du visiteur |

Sont aussi à ajuster : `contact`, `nav`, `links`, et le domaine dans
[`astro.config.mjs`](astro.config.mjs) (`site`), qui sert au sitemap et aux
URL canoniques.

## Contenus à fournir

- **Photo manquante** : un seul emplacement reste en attente, le dossier remis
  après l'état des lieux, sur la page accompagnement. Cherchez `MediaSlot`
  dans `src/pages/` et remplacez-le par `<Photo>`.
- **Mentions légales** : une seule page couvre aussi la confidentialité. Les
  passages surlignés en jaune (classe `a-completer`) attendent les informations
  de la structure : le numéro IDE, le titre exact utilisé, un éventuel agrément
  ASCA ou RME, l'outil de mesure d'audience et le support de conservation.

Les photos fournies sont dans `public/images/`, en AVIF avec un repli JPEG. Le
composant [`Photo.astro`](src/components/Photo.astro) sert les deux formats.

## Articles

Un fichier Markdown par article dans `src/content/blog/`. Le nom du fichier
devient l'URL. Les champs sont décrits dans
[`src/content.config.ts`](src/content.config.ts), leurs règles d'écriture dans
[`SEO.md`](SEO.md).

## Le back-office

Florie écrit ses articles sur `/admin/`, sans passer par le code. Rien ne tourne
côté serveur pour les visiteurs : le site reste statique.

1. Elle écrit et clique sur « Publier ».
2. [`public/api/blog.php`](public/api/blog.php) vérifie sa session et l'article,
   puis écrit le fichier et son image dans ce dépôt, en un seul commit sur `main`
   (API GitHub).
3. Le commit déclenche [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) :
   build, puis envoi FTP sur o2switch.

`npm run bo` n'envoie rien sur GitHub : un faux GitHub
([`tools/local-server.php`](tools/local-server.php)) écrit les articles
directement dans `src/content/blog`. Ce sont de vrais fichiers : supprimez un
article d'essai depuis la liste du back-office avant de commiter. Le site servi
sur le port 4400 ne change qu'au prochain lancement de `npm run bo`.

Trois fichiers portent les mêmes règles : le schéma, `blog.php` et
[`src/lib/article-rules.ts`](src/lib/article-rules.ts) pour les compteurs et les
repères de l'éditeur. Si une limite change, changez les trois : le test tombe
sinon. Ce que les tests exigent d'une page publiée (expression visée, liens
valides, mots réservés) est aussi vérifié par `blog.php`, pour qu'un article de
Florie ne fasse jamais tomber la suite.

La mise en place (secrets, jeton, mot de passe) est décrite dans
[`DEPLOIEMENT.md`](DEPLOIEMENT.md).

## Structure

```
src/
  components/   Composants réutilisables (en-tête, pied de page, quiz, visuels)
  content/blog/ Les articles, en Markdown, écrits par le back-office
  layouts/      Le gabarit commun à toutes les pages
  pages/        Une page par fichier, l'URL suit le chemin
  styles/       Les jetons de design tirés du logo
public/api/     Le back-office côté serveur (PHP)
public/images/  Le logo détouré
tools/          Le serveur d'essai du back-office et le choix du mot de passe
```

## Sobriété

[`scripts/ecoindex.mjs`](scripts/ecoindex.mjs) applique l'algorithme EcoIndex
de GreenIT au site construit : nombre d'éléments, nombre de requêtes et poids
transféré. Un test échoue si une page descend sous la note affichée en pied de
page, déclarée dans `ecoIndex` ([`src/config.ts`](src/config.ts)).

Après avoir ajouté du contenu, lancez `npm run eco` et mettez `ecoIndex` à jour
si la note bouge. Le badge n'a de valeur que s'il dit vrai.

Ce qui tient la note : pages statiques, aucun suivi, polices servies depuis le
projet, images en AVIF, et le lecteur vidéo chargé seulement au clic.

## Les formulaires

Deux formulaires : celui de la page contact et la capture de coordonnées de la
page entonnoir `/le-chiffre/`. Les deux pointent sur `contactEndpoint`.

Renseignez-le et ils fonctionnent **même sans JavaScript**, le navigateur
postant directement dessus ; le script se contente alors d'envoyer en
arrière-plan pour ne pas quitter la page. Chacun porte un consentement
obligatoire, un lien vers la politique de confidentialité et un piège à robots
placé hors de l'écran plutôt que masqué.

Les témoignages de `/le-chiffre/` sont un tableau vide dans la page : la
section ne s'affiche pas tant qu'il est vide. N'y reprenez jamais ceux d'un
autre praticien, ils seraient attribués à la pratique de Florie.

## Identité

Site de **Florie Deternod**, Route de la Maison Neuve 5A, CH-1753 Matran
(canton de Fribourg). Les pages légales sont rédigées selon le **droit
suisse** : loi fédérale sur la protection des données (LPD) et non RGPD,
autorité de recours le PFPDT, numéro d'urgence 144.

## Charte

Couleurs relevées sur le logo, définies dans
[`src/styles/global.css`](src/styles/global.css) :

| Rôle | Valeur |
| --- | --- |
| Vert profond | `#156839` |
| Vert feuille | `#599E33` |
| Or (dégradé) | `#FFED0C` → `#FAB311` |
| Taupe | `#8A7671` |

Typographie : **Lora** pour les titres, les chiffres et les citations,
**Nunito Sans** pour le texte courant et l'interface. Deux jetons les
séparent, `--font-display` et `--font-ui` : le serif ne doit jamais atterrir
sur un bouton. Les deux sont servies depuis le projet, aucune requête vers un
service tiers.

Le mot-symbole du pied de page est le vrai logo, en variante blanche
(`public/images/logo-blanc.png`), et non une imitation en CSS.

Les deux illustrations de cellule (`cellule-rigide`, `cellule-souple`) viennent
du support de Zinzino. Leurs flèches font partie de l'image : la page ne pose
que les légendes. Elles ont de la transparence, donc leur repli est en WebP et
non en JPEG, via la propriété `fallback` de
[`Photo.astro`](src/components/Photo.astro). Les deux sont calées sur le même
gabarit de 656 × 414, pour qu'elles s'alignent côte à côte.

Toutes les transitions de survol passent par le jeton `--transition`
(`0.3s ease-in-out`). Un test refuse toute durée écrite en dur.

Favicon : une feuille dorée à nervure verte sur le vert profond du logo
(`public/favicon.svg`). Quatre autres pistes sont conservées dans
`design/favicons/`, avec une page de comparaison aux tailles réelles : ouvrez
`design/favicons/index.html` pour les revoir, puis copiez la retenue vers
`public/favicon.svg`.
