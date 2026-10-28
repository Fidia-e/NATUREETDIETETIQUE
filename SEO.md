# Référencement : être trouvée sur Google

Le but du site est d'apparaître dans les premiers résultats quand quelqu'un du
canton de Fribourg cherche de l'aide pour son alimentation. Deux leviers y
mènent, et le premier ne se trouve pas dans le code.

1. **La recherche locale** (« nutrition Fribourg », « atelier cuisine Matran ») :
   la fiche Google de l'établissement et la cohérence des coordonnées.
2. **Le contenu** (« faim émotionnelle », « petit-déjeuner rassasiant ») : des
   articles qui répondent mieux que les autres à une question précise, et qui
   renvoient vers les pages du cabinet.

## Avant tout : à confirmer avec Florie

**Son titre professionnel exact.** En Suisse, le titre de diététicien·ne est
réglementé par la loi sur les professions de la santé (LPSan) et suppose un
diplôme reconnu. « Diététicienne Fribourg » est sans doute l'expression la plus
cherchée du secteur, mais le site ne la vise pas, et ne doit pas la viser, tant
qu'on ne sait pas si Florie peut porter ce titre. Le site parle pour l'instant
d'« accompagnement en nutrition », qui décrit l'activité sans revendiquer de
titre. Même question pour ASCA et RME : si elle est agréée, c'est un argument
fort (remboursement par les complémentaires) et une expression recherchée.

## Hors du site : ce qui pèse le plus en local

| Action | Pourquoi |
| --- | --- |
| Créer et vérifier la **fiche Google Business Profile** | C'est elle qui apparaît sur la carte, au-dessus des résultats. Sans fiche, le site ne sort presque jamais dans le bloc local. |
| Mettre exactement **les mêmes coordonnées** partout | Nom « Nature & diététique », Route de la Maison Neuve 5A, 1753 Matran, +41 79 552 74 84. Google recoupe : le moindre écart affaiblit la fiche. |
| Demander **des avis Google** aux clientes satisfaites | Nombre, régularité et réponses aux avis comptent dans le classement local. |
| S'inscrire sur **local.ch et search.ch** | Les annuaires suisses de référence, très bien classés eux-mêmes. |
| Valider le domaine dans **Google Search Console** et y déclarer `https://natureetdietetique.com/sitemap-index.xml` | Pour savoir quelles recherches amènent du monde, et repérer les pages ignorées. |
| Vérifier que **natureetdietetique.ch redirige en 301** vers le `.com` | Une redirection temporaire (302) ou une copie du site diluerait le référencement entre deux domaines. |

## Les expressions visées

Pas de volumes de recherche inventés ici : on les relèvera dans Search Console
une fois le site en ligne, puis on ajustera.

### Pages du cabinet (intention : trouver une praticienne)

| Expression | Page qui la porte |
| --- | --- |
| nutrition Matran, nutrition Fribourg | Accueil |
| accompagnement en nutrition Fribourg, rééquilibrage alimentaire Fribourg | /accompagnement/ |
| bilan nutritionnel en ligne, bilan alimentation gratuit | /bilan/ |
| test oméga-3, rapport oméga-6 oméga-3, BalanceTest | /le-chiffre/ |
| atelier cuisine Fribourg, cours de cuisine santé Matran | /ateliers/ |
| filtration de l'eau, eau du robinet qualité | /l-eau/ |

Les communes voisines (Villars-sur-Glâne, Avry, Neyruz, Hauterive, Fribourg)
peuvent être nommées naturellement dans les textes, jamais en liste de mots-clés :
Google sanctionne le bourrage.

### Articles du blog (intention : comprendre, trouver une réponse)

Chaque article vise une seule expression et renvoie vers une page du cabinet
(champ `cta`). Sujets déjà publiés, puis pistes, par grappe :

| Grappe | Articles publiés | Pistes d'articles | Renvoi |
| --- | --- | --- | --- |
| Faim et envies | faim émotionnelle | grignotage le soir, envie de sucre après le repas, manger trop vite | accompagnement |
| Petit-déjeuner et énergie | petit-déjeuner rassasiant | coup de fatigue après le repas, collation de l'après-midi, fatigue et alimentation | bilan |
| Faire ses courses | lire une étiquette | aliments ultra-transformés, sucres cachés, huiles à choisir | bilan |
| Organisation | batch cooking | menus de la semaine, cuisiner pour une personne, repas rapides et sains | ateliers |
| Oméga-3 | | aliments riches en oméga-3, poissons gras, rapport oméga-6 oméga-3 expliqué | /le-chiffre/ via bilan |
| Digestion | | ballonnements et alimentation, fibres, manger lentement | accompagnement |
| Eau | | combien boire par jour, eau du robinet ou en bouteille | /l-eau/ via rendez-vous |

Un article par mois, régulièrement, vaut mieux que dix d'un coup puis rien.

## Les règles d'un article

Les champs (`keyword`, `title`, `seoTitle`, `description`, `faq`, `cover`)
sont vérifiés par le build (schéma dans `src/content.config.ts`) et par les
tests : un article qui ne les respecte pas ne part pas en ligne. Le reste
relève de l'écriture et ne se vérifie pas automatiquement.

- **`keyword`** : l'expression visée, telle que les gens la tapent. Elle doit
  figurer dans le titre Google, la description et le texte.
- **`title`** : le titre affiché en haut de l'article, 20 à 90 caractères.
- **`seoTitle`** : le titre dans Google, 60 caractères au plus, l'expression
  visée au début. Facultatif si `title` convient déjà.
- **`description`** : 70 à 160 caractères, l'expression visée dedans, et une
  raison de cliquer.
- **Le premier paragraphe** contient l'expression visée.
- **Les intertitres** (`##`) répondent chacun à une question. À partir de
  trois, un sommaire s'affiche.
- **`faq`** : deux à quatre questions reprises de « Autres questions posées »
  dans Google, réponses de deux ou trois phrases.
- **Au moins un lien** vers un autre article et un vers une page du cabinet.
- **`cover`** facultative, mais sa description `coverAlt` est obligatoire dès
  qu'il y a une image.
- **`updatedDate`** quand on retouche un article sur le fond : Google favorise
  les contenus tenus à jour.

Le modèle à copier est `src/content/blog/modele-article.md` (en brouillon).

## Ce que le code fait déjà

- Titre et description propres à chaque page, adresse canonique, plan du site
  et `robots.txt`.
- Données structurées sur toutes les pages : le site, le cabinet (adresse,
  téléphone, canton desservi) et Florie comme personne.
- Sur chaque article : `BlogPosting` (autrice, dates, rubrique), fil d'Ariane,
  et `FAQPage` quand il y a des questions.
- Balises de partage `article` avec dates, image de partage en 1200 px quand
  l'article a une couverture.
- Encadré de l'autrice qui renvoie vers « Mon histoire » : Google tient compte
  de qui écrit sur la santé.
- Liens entre articles de la même rubrique, et appel final vers une page du
  cabinet.
- Pages légères (EcoIndex A) : la vitesse fait partie des critères de Google.
