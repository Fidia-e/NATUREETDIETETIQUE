import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'blog'>;

/** Articles publies, du plus recent au plus ancien. Les brouillons n'en sont jamais. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

/** Nombre de mots du texte, sans la syntaxe Markdown. */
export function wordCount(post: Post): number {
  const text = (post.body ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|]/g, ' ');
  // Un tiret de liste ou de tableau n'est pas un mot : il faut une lettre ou un chiffre
  return text.split(/\s+/).filter((token) => /[\p{L}\d]/u.test(token)).length;
}

/**
 * Temps de lecture : 200 mots par minute, une minute au moins.
 * Calcule plutot qu'ecrit a la main, pour qu'il suive le texte quand on le
 * retouche.
 */
export function readingTime(post: Post): number {
  return Math.max(1, Math.round(wordCount(post) / 200));
}

const dateFormat = new Intl.DateTimeFormat('fr-CH', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export const formatDate = (date: Date) => dateFormat.format(date);

/**
 * Espaces insecables de la typographie francaise : devant : ; ! ? et », apres «.
 * Sans elles, la ponctuation double peut se retrouver seule en debut de ligne.
 * Le texte source reste ecrit avec des espaces ordinaires.
 */
export const frenchSpacing = (text: string) =>
  text.replace(/ ([:;!?»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');

/** Titre que Google affichera pour l'article. */
export const searchTitle = (post: Post) => post.data.seoTitle ?? post.data.title;

/**
 * Deux articles a lire ensuite : la meme categorie d'abord, puis les plus
 * recents. Le lien entre articles aide la lectrice autant que Google, qui
 * decouvre et classe les pages en suivant ces liens.
 */
export function relatedPosts(post: Post, posts: Post[], count = 2): Post[] {
  const others = posts.filter((entry) => entry.id !== post.id);
  return [
    ...others.filter((entry) => entry.data.category === post.data.category),
    ...others.filter((entry) => entry.data.category !== post.data.category),
  ].slice(0, count);
}
