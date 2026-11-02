/**
 * Les regles d'un article, cote editeur : limites du schema et reperes de
 * SEO.md, en fonctions pures pour etre testees sans navigateur.
 *
 * Le schema (src/content.config.ts) reste la reference, et blog.php applique
 * les memes regles cote serveur. tests/back-office.test.ts passe les trois au
 * meme jeu de cas : si l'un bouge sans les autres, le test tombe.
 */

export const LIMITS = {
  title: { min: 20, max: 90 },
  seoTitle: { min: 20, max: 60 },
  description: { min: 70, max: 160 },
  keyword: { min: 3, max: 60 },
  coverAlt: { min: 5, max: 200 },
  question: { min: 10, max: 150 },
  answer: { min: 40, max: 600 },
} as const;

export const CATEGORIES = ['Nutrition', 'Recettes', 'Bien-être', 'Décryptage'] as const;

/** Les pages vers lesquelles un article peut orienter (champ `cta`). */
export const CTAS = {
  bilan: 'Le bilan offert',
  accompagnement: "L'accompagnement",
  ateliers: 'Les ateliers',
  'rendez-vous': 'Le rendez-vous de 15 minutes',
} as const;

export interface FaqItem {
  question: string;
  answer: string;
}

export interface ArticleDraft {
  title: string;
  seoTitle: string;
  description: string;
  keyword: string;
  body: string;
  faq: FaqItem[];
  hasCover: boolean;
  coverAlt: string;
}

export interface Check {
  label: string;
  done: boolean;
  why: string;
}

/**
 * Espaces insecables de la typographie francaise : devant : ; ! ? et », apres «.
 * Sans elles, la ponctuation double peut se retrouver seule en debut de ligne.
 * Le texte source reste ecrit avec des espaces ordinaires.
 */
export const frenchSpacing = (text: string) =>
  text.replace(/ ([:;!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');

/** « Mon Titre d'été ! » devient « mon-titre-d-ete », comme slugify() dans blog.php. */
export const slugify = (text: string) =>
  text
    .toLowerCase()
    // Le decoupage NFD ne separe pas ces deux-la : sans cela, « bœuf » donnerait « b-uf »
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '');

/** Nombre de mots d'un texte Markdown, sans sa syntaxe. */
export function countWords(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|]/g, ' ');
  // Un tiret de liste ou de tableau n'est pas un mot : il faut une lettre ou un chiffre
  return text.split(/\s+/).filter((token) => /[\p{L}\d]/u.test(token)).length;
}

/** Pour chercher l'expression visee, comme searchable() dans blog.php. */
const searchable = (text: string) =>
  text
    .replace(/\]\([^)]*\)/g, '')
    .replace(/[*_[\]#`]/g, '')
    .replace(/’/g, "'")
    .replace(/[\s  ]+/g, ' ')
    .toLowerCase()
    .trim();

export const containsKeyword = (text: string, keyword: string) =>
  keyword.trim() !== '' && searchable(text).includes(searchable(keyword));

/** Le titre que Google affichera, comme searchTitle() dans src/lib/blog.ts. */
export const searchTitle = (draft: Pick<ArticleDraft, 'title' | 'seoTitle'>) =>
  draft.seoTitle.trim() || draft.title.trim();

/** Longueur comptee comme le schema : Zod 4 voit un emoji pour un caractere, pas deux. */
export const textLength = (value: string) => [...value].length;

const isBetween = (value: string, { min, max }: { min: number; max: number }) =>
  textLength(value) >= min && textLength(value) <= max;

/** Le premier paragraphe du texte : Google lit ce debut avec plus d'attention. */
const firstParagraph = (body: string) =>
  body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block !== '' && !block.startsWith('#')) ?? '';

/** Ce qui bloque la publication : blog.php refuse l'article tant que ce n'est pas rempli. */
export function requiredChecks(draft: ArticleDraft): Check[] {
  const title = draft.title.trim();
  const shown = searchTitle(draft);
  const description = draft.description.trim();

  return [
    {
      label: `Titre de l'article entre ${LIMITS.title.min} et ${LIMITS.title.max} caractères`,
      done: isBetween(title, LIMITS.title),
      why: "Le grand titre en haut de l'article.",
    },
    {
      label: `Titre dans Google de ${LIMITS.seoTitle.max} caractères au plus`,
      done: isBetween(shown, LIMITS.seoTitle),
      why: "Au-delà, Google le coupe. Si le titre de l'article est trop long, remplis « Titre pour Google ».",
    },
    {
      label: `Description entre ${LIMITS.description.min} et ${LIMITS.description.max} caractères`,
      done: isBetween(description, LIMITS.description),
      why: 'Le petit texte sous le titre dans Google : il donne envie de cliquer, ou non.',
    },
    {
      label: 'Expression visée dans le titre pour Google',
      done: containsKeyword(shown, draft.keyword),
      why: "Si possible au début : c'est ce que Google lit en premier.",
    },
    {
      label: 'Expression visée dans la description',
      done: containsKeyword(description, draft.keyword),
      why: 'Google la met en gras quand elle correspond à la recherche.',
    },
    {
      label: 'Expression visée dans le texte',
      done: containsKeyword(draft.body, draft.keyword),
      why: "Un article doit parler de ce qu'il annonce.",
    },
  ];
}

/** Les reperes de SEO.md : des conseils, on peut publier sans tout cocher. */
export function adviceChecks(draft: ArticleDraft): Check[] {
  const words = countWords(draft.body);
  // « # » compte aussi : blog.php le ramene a « ## », le seul niveau 1 etant le titre de la page
  const headings = (draft.body.match(/^##?\s/gm) ?? []).length;
  const questions = draft.faq.filter((item) => item.question.trim() !== '').length;

  return [
    {
      label: 'Expression visée dans le premier paragraphe',
      done: containsKeyword(firstParagraph(draft.body), draft.keyword),
      why: "Dis tout de suite à la lectrice qu'elle est au bon endroit.",
    },
    {
      label: `Au moins 300 mots (${words} pour l'instant)`,
      done: words >= 300,
      why: 'Un article très court est rarement mis en avant.',
    },
    {
      label: 'Au moins trois intertitres',
      done: headings >= 3,
      why: 'Chacun répond à une question. À partir de trois, un sommaire s’affiche.',
    },
    {
      label: 'Deux à quatre questions fréquentes',
      done: questions >= 2 && questions <= 4,
      why: 'Reprises de « Autres questions posées » dans Google.',
    },
    {
      label: 'Un lien vers un autre article',
      done: /\]\(\/blog\/[a-z0-9-]+/.test(draft.body),
      why: 'Par exemple /blog/faim-emotionnelle/. La lectrice continue sa visite.',
    },
    {
      label: 'Un lien vers une page du cabinet',
      done: /\]\(\/(?!blog\/)[a-z]/.test(draft.body),
      why: 'Par exemple /bilan/ ou /accompagnement/, avec des mots qui disent où il mène.',
    },
    {
      label: 'Une image de couverture décrite',
      done: draft.hasCover && isBetween(draft.coverAlt.trim(), LIMITS.coverAlt),
      why: 'Facultative. Google ne voit pas la photo : il lit sa description.',
    },
  ];
}
