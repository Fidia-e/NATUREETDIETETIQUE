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
```

## Vérifications avant commit

```bash
npm run check && npm test
```

- `npm run check` lance `astro check` : types TypeScript et diagnostics sur les
  fichiers `.astro`.
- `npm test` construit le site puis lance Vitest : 150 tests répartis en trois
  fichiers.
- `npm run eco` construit le site et affiche la note EcoIndex de chaque page.

### Ce que couvrent les tests

| Fichier | Ce qu'il vérifie |
| --- | --- |
| `tests/quiz-scoring.test.ts` | Le calcul du compte rendu : répartition par axe, seuils, choix du titre, cohérence des questions |
| `tests/quiz-funnel.test.ts` | Le parcours réel : verrouillage des étapes, retour arrière, compte rendu, consentement obligatoire, envoi et repli e-mail |
| `tests/site-integrity.test.ts` | Le site généré : pages attendues, liens internes, métadonnées, alternatives textuelles, absence de référence au droit français, contraste du pied de page, note EcoIndex, et référencement (titres, descriptions, données structurées, articles du blog) |

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
devient l'URL. L'en-tête attendu est décrit dans
[`src/content.config.ts`](src/content.config.ts) : `title`, `description`,
`pubDate`, `category`, `readingTime`, et `draft` pour masquer un brouillon.

## Structure

```
src/
  components/   Composants réutilisables (en-tête, pied de page, quiz, visuels)
  content/blog/ Les articles, en Markdown
  layouts/      Le gabarit commun à toutes les pages
  pages/        Une page par fichier, l'URL suit le chemin
  styles/       Les jetons de design tirés du logo
public/images/  Le logo détouré
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
