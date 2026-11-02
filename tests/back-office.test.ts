import { spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'astro/zod';
import { parse as parseYaml } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collections } from '../src/content.config';
import {
  CATEGORIES,
  CTAS,
  LIMITS,
  adviceChecks,
  containsKeyword,
  countWords,
  requiredChecks,
  slugify,
  textLength,
  type ArticleDraft,
} from '../src/lib/article-rules';

/**
 * Le back-office, de bout en bout : le vrai public/api/blog.php tourne sur le
 * serveur d'essai de `npm run bo`, dont le faux GitHub ecrit dans une copie
 * temporaire des articles. Rien ne touche a src/content/blog.
 *
 * Il suppose un `astro build` prealable : le script `npm test` l'enchaine.
 * PHP est donc necessaire : sans lui, le test tombe plutot que de se taire.
 */
const ROOT = new URL('../', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const EM_DASH = '\u2014';

/** Le meme schema que le build, avec un `image()` qui se contente du chemin. */
const schema = (collections.blog as any).schema({ image: () => z.string() });

interface Response {
  status: number;
  data: any;
}

/** Un serveur de back-office isole, avec son dossier d'articles et sa session. */
class BackOffice {
  private process?: ChildProcess;
  private port = 0;
  private cookie = '';
  private csrf = '';
  readonly dir = mkdtempSync(join(tmpdir(), 'nd-back-office-'));

  async start(config = join(ROOT, 'tools/local-config.php')) {
    cpSync(join(ROOT, 'src/content/blog'), join(this.dir, 'src/content/blog'), { recursive: true });
    this.port = await freePort();
    this.process = spawn(
      'php',
      ['-S', `localhost:${this.port}`, '-t', DIST, join(ROOT, 'tools/local-server.php')],
      {
        stdio: 'ignore',
        env: {
          ...process.env,
          BO_LOCAL_CONFIG: config,
          BO_PORT: String(this.port),
          BO_CONTENT_ROOT: this.dir,
          PHP_CLI_SERVER_WORKERS: '4',
          // Tentatives de connexion, sessions et faux GitHub restent dans ce dossier
          TMPDIR: this.dir,
        },
      }
    );
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const up = await this.call('GET', 'session').catch(() => null);
      if (up) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Le serveur PHP ne demarre pas : `php` est-il installe ?');
  }

  stop() {
    this.process?.kill();
    rmSync(this.dir, { recursive: true, force: true });
  }

  /** node:http plutot que fetch : Happy DOM remplace le fetch global, et ses cookies avec. */
  call(method: string, action: string, body?: object, headers: Record<string, string> = {}): Promise<Response> {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;
      const req = request(
        {
          host: 'localhost',
          port: this.port,
          method,
          path: `/api/blog.php?action=${action}`,
          headers: {
            ...(payload ? { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf } : {}),
            ...(this.cookie ? { Cookie: this.cookie } : {}),
            ...headers,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const cookie = res.headers['set-cookie']?.[0];
            if (cookie) this.cookie = cookie.split(';')[0];
            resolve({
              status: res.statusCode ?? 0,
              data: JSON.parse(Buffer.concat(chunks).toString() || '{}'),
            });
          });
        }
      );
      req.on('error', reject);
      req.end(payload);
    });
  }

  /** Une page servie telle quelle : statut et emplacement de la redirection. */
  page(path: string): Promise<{ status: number; location?: string; body: string }> {
    return new Promise((resolve, reject) => {
      const req = request({ host: 'localhost', port: this.port, path }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            body: Buffer.concat(chunks).toString(),
          })
        );
      });
      req.on('error', reject);
      req.end();
    });
  }

  async login(password = 'test') {
    const response = await this.call('POST', 'login', { password });
    if (response.data.csrf) this.csrf = response.data.csrf;
    return response;
  }

  save(article: object) {
    return this.call('POST', 'save', article);
  }

  file(slug: string) {
    return readFileSync(join(this.dir, 'src/content/blog', `${slug}.md`), 'utf-8');
  }

  exists(relative: string) {
    return existsSync(join(this.dir, 'src/content/blog', relative));
  }
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

/** Ouvre le fichier comme le build : l'en-tete YAML, puis le texte. */
function readArticle(source: string) {
  const [, header, body] = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)!;
  return { data: parseYaml(header) as Record<string, any>, body: body.trim() };
}

let unique = 0;

/** Un article valide et publiable : chaque cas ne change que ce qu'il teste. */
function validArticle(overrides: Record<string, unknown> = {}) {
  unique += 1;
  const keyword = `sujet numero ${unique}`;
  return {
    slug: '',
    keyword,
    title: `Un titre sur le ${keyword}`,
    seoTitle: '',
    description: `Une description assez longue pour le ${keyword}, avec une vraie raison de cliquer dessus.`,
    category: 'Nutrition',
    cta: 'bilan',
    coverAlt: '',
    body: `Ce premier paragraphe parle du ${keyword} et compte assez de caractères pour passer le seuil minimal.\n\n## Un intertitre\n\nLa suite.`,
    faq: [],
    pubDate: '2026-10-01',
    updatedDate: '',
    draft: false,
    image: null,
    removeImage: false,
    ...overrides,
  };
}

const text = (length: number) => 'a'.repeat(length);

const faqItem = (overrides: Record<string, string> = {}) => ({
  question: 'Une question assez longue ?',
  answer: 'Une réponse assez longue pour dépasser le seuil minimal.',
  ...overrides,
});

/** Un PNG d'un pixel : le plus petit fichier que blog.php reconnaisse comme une image. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const bo = new BackOffice();
const repositoryFiles = readdirSync(join(ROOT, 'src/content/blog'));

beforeAll(async () => {
  if (!existsSync(join(DIST, 'api/blog.php'))) {
    throw new Error('dist/ est absent : lancez `npm run build` avant les tests, ou `npm test`.');
  }
  await bo.start();
  await bo.login();
}, 30000);

afterAll(() => bo.stop());

/*
 * Un article que le PHP accepte et que le schema refuse bloque toute mise en
 * ligne : le build echoue sur `main`, pour tous les articles. Chaque cas passe
 * donc par les trois : les limites de l'editeur fabriquent la valeur, le
 * schema et le PHP doivent rendre le meme verdict.
 */
describe('le schema et blog.php rendent le meme verdict', () => {
  interface Case {
    name: string;
    overrides: Record<string, unknown>;
    accepted: boolean;
  }

  const bounds = (name: string, min: number, max: number, field = name): Case[] => [
    { name: `${name} a ${min - 1}`, overrides: { [field]: text(min - 1) }, accepted: false },
    { name: `${name} a ${min}`, overrides: { [field]: text(min) }, accepted: true },
    { name: `${name} a ${max}`, overrides: { [field]: text(max) }, accepted: true },
    { name: `${name} a ${max + 1}`, overrides: { [field]: text(max + 1) }, accepted: false },
  ];

  const faqBounds = (key: 'question' | 'answer'): Case[] =>
    [LIMITS[key].min - 1, LIMITS[key].min, LIMITS[key].max, LIMITS[key].max + 1].map((length) => ({
      name: `${key} a ${length}`,
      overrides: { faq: [faqItem({ [key]: text(length) })] },
      accepted: length >= LIMITS[key].min && length <= LIMITS[key].max,
    }));

  const cases: Case[] = [
    ...bounds('title', LIMITS.title.min, LIMITS.title.max),
    ...bounds('seoTitle', LIMITS.seoTitle.min, LIMITS.seoTitle.max),
    ...bounds('description', LIMITS.description.min, LIMITS.description.max),
    ...bounds('keyword', LIMITS.keyword.min, LIMITS.keyword.max),
    ...faqBounds('question'),
    ...faqBounds('answer'),
    // Zod 4 compte en points de code : si cela change, ces deux cas tombent
    {
      name: 'description a 160 avec un emoji',
      overrides: { description: text(159) + '\u{1F34E}' },
      accepted: true,
    },
    {
      name: 'description a 161 avec un emoji',
      overrides: { description: text(160) + '\u{1F34E}' },
      accepted: false,
    },
    ...CATEGORIES.map((category) => ({
      name: `rubrique ${category}`,
      overrides: { category },
      accepted: true,
    })),
    { name: 'rubrique inconnue', overrides: { category: 'Sport' }, accepted: false },
    ...Object.keys(CTAS).map((cta) => ({ name: `renvoi ${cta}`, overrides: { cta }, accepted: true })),
    { name: 'renvoi inconnu', overrides: { cta: 'boutique' }, accepted: false },
    { name: 'date de publication absente', overrides: { pubDate: '' }, accepted: false },
    { name: 'date de publication sans sens', overrides: { pubDate: 'bientot' }, accepted: false },
    { name: 'date de mise a jour', overrides: { updatedDate: '2026-10-20' }, accepted: true },
    { name: 'date de mise a jour sans sens', overrides: { updatedDate: 'hier' }, accepted: false },
  ];

  /** L'en-tete que ces valeurs donneraient, sans passer par le PHP. */
  const toFrontmatter = (article: ReturnType<typeof validArticle>) =>
    Object.fromEntries(
      Object.entries({
        title: article.title,
        seoTitle: article.seoTitle,
        description: article.description,
        keyword: article.keyword,
        pubDate: article.pubDate,
        updatedDate: article.updatedDate,
        category: article.category,
        faq: article.faq,
        cta: article.cta,
        draft: article.draft,
      }).filter(([key, value]) => value !== '' || !['seoTitle', 'updatedDate'].includes(key))
    );

  it.each(cases)('$name', async ({ overrides, accepted }) => {
    const article = validArticle({ draft: true, ...overrides });

    expect(schema.safeParse(toFrontmatter(article)).success, 'verdict du schema').toBe(accepted);

    const response = await bo.save(article);
    expect(response.status, `verdict de blog.php : ${response.data.error}`).toBe(accepted ? 200 : 400);

    if (accepted) {
      const written = readArticle(bo.file(response.data.slug));
      const result = schema.safeParse(written.data);
      expect(result.success, 'le schema doit accepter le fichier ecrit').toBe(true);
    }
  });

  it('ne retient une couverture qu’avec sa description', async () => {
    const image = { data: PNG };

    const without = await bo.save(validArticle({ image, coverAlt: text(LIMITS.coverAlt.min - 1) }));
    expect(without.status).toBe(400);
    expect(schema.safeParse({ ...toFrontmatter(validArticle()), cover: 'a.png', coverAlt: 'abcd' }).success).toBe(false);

    const tooLong = await bo.save(validArticle({ image, coverAlt: text(LIMITS.coverAlt.max + 1) }));
    expect(tooLong.status).toBe(400);

    const saved = await bo.save(validArticle({ image, coverAlt: 'Une assiette de légumes' }));
    expect(saved.status).toBe(200);

    const written = readArticle(bo.file(saved.data.slug));
    expect(written.data.cover).toBe(`./images/${saved.data.slug}.png`);
    expect(written.data.coverAlt).toBe('Une assiette de légumes');
    expect(bo.exists(`images/${saved.data.slug}.png`)).toBe(true);
    expect(schema.safeParse(written.data).success).toBe(true);
  });
});

describe('le nettoyage de ce qu’envoie le formulaire', () => {
  const bodyOf = async (body: string) => {
    const response = await bo.save(validArticle({ body, draft: true }));
    expect(response.status, response.data.error).toBe(200);
    return readArticle(bo.file(response.data.slug)).body;
  };

  it('ne garde aucun tiret cadratin, sous aucune forme', async () => {
    const saved = await bo.save(
      validArticle({
        title: `Un titre ${EM_DASH} assez long pour passer`,
        description: `Une description ${EM_DASH} ${text(70)}`,
        body: `Un ${EM_DASH} deux &mdash; trois &#8212; quatre -- cinq --- six`,
        draft: true,
      })
    );
    const source = bo.file(saved.data.slug);

    expect(source).not.toContain(EM_DASH);
    expect(source).not.toContain('&mdash;');
    expect(source).not.toContain('&#8212;');
    expect(readArticle(source).body).not.toMatch(/-{2,}/);
  });

  it('ne touche pas aux tirets d’une adresse', async () => {
    expect(await bodyOf('Voir [ce site](https://exemple.ch/a--b) -- ici.')).toBe(
      'Voir [ce site](https://exemple.ch/a--b) - ici.'
    );
  });

  it('laisse intacts les tableaux et les filets', async () => {
    const table = '| Avant | Après |\n| --- | --- |\n| un | deux |\n\n---\n\nFin.';
    expect(await bodyOf(table)).toBe(table);
  });

  it('retire le HTML', async () => {
    expect(await bodyOf('Avant <script>alert(1)</script> après <b>gras</b> et 3 < 5.')).toBe(
      'Avant alert(1) après gras et 3 < 5.'
    );
  });

  it('ne laisse qu’un seul titre de niveau 1 sur la page', async () => {
    expect(await bodyOf('# Un\n\nTitre souligné\n===\n\n## Deux')).toBe('## Un\n\n## Titre souligné\n\n## Deux');
  });

  it('donne aux liens internes l’adresse canonique de la page', async () => {
    const body = await bodyOf(
      '[a](/bilan) [b](/bilan/) [c](/mentions-legales#eco-conception) [d](https://natureetdietetique.com/ateliers) [e](https://www.natureetdietetique.ch/l-eau/) [f](/images/logo-blanc.png) [g](https://exemple.ch/page)'
    );
    expect(body).toBe(
      '[a](/bilan/) [b](/bilan/) [c](/mentions-legales/#eco-conception) [d](/ateliers/) [e](/l-eau/) [f](/images/logo-blanc.png) [g](https://exemple.ch/page)'
    );
  });

  it('refuse une image dans le texte, qui peut faire echouer le build', async () => {
    const response = await bo.save(validArticle({ body: `![photo](./absente.jpg) ${text(120)}`, draft: true }));
    expect(response.status).toBe(400);
    expect(response.data.error).toContain('couverture');
  });

  it('ecarte les questions laissees vides dans le formulaire', async () => {
    const saved = await bo.save(
      validArticle({ faq: [{ question: ' ', answer: '' }, faqItem()], draft: true })
    );
    expect(readArticle(bo.file(saved.data.slug)).data.faq).toEqual([faqItem()]);
  });

  it('resserre les espaces et retire les caracteres de controle', async () => {
    const saved = await bo.save(
      validArticle({ title: '  Un   titre\u0007 assez\nlong pour passer  ', draft: true })
    );
    expect(readArticle(bo.file(saved.data.slug)).data.title).toBe('Un titre assez long pour passer');
  });

  it('ne plante pas sur des champs du mauvais type', async () => {
    const response = await bo.save(
      validArticle({ title: ['liste'], faq: 'pas une liste', draft: true })
    );
    expect(response.status).toBe(400);

    // Une ligne de faq illisible vaut une ligne vide : elle est ecartee
    const faq = await bo.save(validArticle({ faq: ['pas un objet'], draft: true }));
    expect(faq.status).toBe(200);
    expect(readArticle(bo.file(faq.data.slug)).data.faq).toBeUndefined();
  });

  it('refuse un fichier qui n’est pas une image', async () => {
    const response = await bo.save(
      validArticle({ image: { data: Buffer.from('<?php echo 1;').toString('base64') }, coverAlt: 'Une photo' })
    );
    expect(response.status).toBe(400);
    expect(response.data.error).toContain('image');
  });
});

/*
 * Ces regles ne sont pas dans le schema : ce sont celles que
 * tests/site-integrity.test.ts garde sur les pages publiees. Sans elles, un
 * article de Florie ferait tomber `npm test` au prochain commit de code.
 */
describe('ce que blog.php exige d’un article publie', () => {
  it('publie un article qui respecte tout', async () => {
    const response = await bo.save(validArticle());
    expect(response.status, response.data.error).toBe(200);
    expect(response.data.draft).toBe(false);
    expect(readArticle(bo.file(response.data.slug)).data.draft).toBeUndefined();
  });

  it.each([
    ['le titre pour Google', { seoTitle: 'Un titre sans le bon sujet' }, 'titre pour Google'],
    ['la description', { description: text(80) }, 'description'],
    ['le texte', { body: text(120) }, 'texte'],
  ])('veut l’expression visee dans %s', async (_, overrides, message) => {
    const response = await bo.save(validArticle(overrides));
    expect(response.status).toBe(400);
    expect(response.data.error).toContain(message);

    // Un brouillon peut rester inacheve
    expect((await bo.save(validArticle({ ...overrides, draft: true }))).status).toBe(200);
  });

  it('cherche l’expression sans se soucier de la casse, du gras ni de l’apostrophe', async () => {
    const response = await bo.save(
      validArticle({
        keyword: "L'eau du robinet",
        title: 'Que vaut l’eau du robinet chez nous ?',
        description: `Tout sur l’EAU du robinet : ${text(60)}`,
        body: `Parlons de **l'eau** du [robinet](/l-eau/) ici et maintenant. ${text(100)}`,
      })
    );
    expect(response.status, response.data.error).toBe(200);
  });

  it('demande un titre pour Google quand celui de l’article est trop long', async () => {
    const article = validArticle();
    const longTitle = `${article.keyword} ${text(60)}`;

    const refused = await bo.save({ ...article, title: longTitle });
    expect(refused.status).toBe(400);
    expect(refused.data.error).toContain('titre pour Google');

    const accepted = await bo.save({ ...article, title: longTitle, seoTitle: `${article.keyword} en clair` });
    expect(accepted.status, accepted.data.error).toBe(200);
  });

  it('refuse un texte presque vide', async () => {
    const keyword = 'texte trop court';
    const response = await bo.save(validArticle({
      keyword,
      title: `Un titre sur ${keyword}`,
      description: `Une description sur ${keyword}, assez longue pour passer le seuil des longueurs du schema.`,
      body: keyword,
    }));
    expect(response.status).toBe(400);
    expect(response.data.error).toContain('court');
  });

  /*
   * Les motifs viennent de tests/site-integrity.test.ts. Le premier est aussi
   * une question de droit : le titre est reglemente en Suisse (LPSan).
   */
  it.each([
    ['diététicienne', 'réglementé'],
    ['dieteticien', 'réglementé'],
    ['la CNIL', 'CNIL'],
    ['ADELI', 'ADELI'],
    ['le code de la santé publique', 'santé publique'],
    ["l'Assurance maladie", 'caisse maladie'],
    ['l’Assurance maladie', 'caisse maladie'],
    ['votre mutuelle', 'complémentaire'],
  ])('refuse « %s » sur une page publiee', async (word, message) => {
    const inBody = validArticle();
    const refused = await bo.save({ ...inBody, body: `${inBody.body} Il y a ${word} ici.` });
    expect(refused.status).toBe(400);
    expect(refused.data.error).toContain(message);

    const inFaq = await bo.save(
      validArticle({ faq: [faqItem({ answer: `Une réponse où il y a ${word} au milieu du texte.` })] })
    );
    expect(inFaq.status).toBe(400);
  });

  it('accepte le nom du site, qui n’est pas le titre reglemente', async () => {
    const article = validArticle();
    const response = await bo.save({ ...article, body: `${article.body} Nature & diététique, à Matran.` });
    expect(response.status, response.data.error).toBe(200);
  });

  it('refuse deux pages au meme titre ou a la meme description', async () => {
    const first = validArticle();
    expect((await bo.save(first)).status).toBe(200);

    const sameDescription = validArticle();
    const refused = await bo.save({
      ...sameDescription,
      description: first.description,
      keyword: first.keyword.slice(0, -1) + 'x',
    });
    expect(refused.status).toBe(400);
  });

  it('refuse deux articles sur la meme expression', async () => {
    const first = validArticle();
    expect((await bo.save(first)).status).toBe(200);

    const refused = await bo.save(
      validArticle({ keyword: first.keyword, title: first.title + ' bis', body: first.body })
    );
    expect(refused.status).toBe(400);
    expect(refused.data.error).toContain('expression');
  });

  describe('les liens', () => {
    const withLink = (link: string) => {
      const article = validArticle();
      return { ...article, body: `${article.body} Voir [ce lien](${link}).` };
    };

    it.each([
      '/bilan/',
      '/bilan',
      '/mentions-legales/#eco-conception',
      '/blog/faim-emotionnelle/',
      '/images/logo-blanc.png',
      '#une-partie',
      'https://exemple.ch/',
      'mailto:contact@exemple.ch',
      'tel:+41000000000',
    ])('accepte %s', async (link) => {
      const response = await bo.save(withLink(link));
      expect(response.status, response.data.error).toBe(200);
    });

    it.each([
      '/page-inconnue/',
      '/blog/article-inconnu/',
      // Le modele existe en brouillon, mais il n'a pas de page
      '/blog/modele-article/',
      '/images/absente.png',
      'bilan',
      './bilan',
      'www.exemple.ch',
      'javascript:alert(1)',
    ])('refuse %s', async (link) => {
      const response = await bo.save(withLink(link));
      expect(response.status).toBe(400);
      expect(response.data.error).toContain('ne mène nulle part');
    });

    it('accepte un lien vers un article qui vient d’etre publie', async () => {
      const first = await bo.save(validArticle());
      const response = await bo.save(withLink(`/blog/${first.data.slug}/`));
      expect(response.status, response.data.error).toBe(200);
    });

    it('refuse un lien vers un brouillon, qui n’a pas de page', async () => {
      const draft = await bo.save(validArticle({ draft: true }));
      const response = await bo.save(withLink(`/blog/${draft.data.slug}/`));
      expect(response.status).toBe(400);
    });
  });
});

describe('modifier un article', () => {
  /*
   * Le risque du portage : LNBIENETRE ne lisait que des lignes a plat. Ici, un
   * article ouvert puis enregistre sans rien toucher ne doit rien perdre, ni
   * sa faq, ni son renvoi, ni le moindre mot.
   */
  it.each(
    readdirSync(join(ROOT, 'src/content/blog'))
      .filter((name) => name.endsWith('.md') && name !== 'modele-article.md')
      .map((name) => name.slice(0, -3))
  )('reecrit %s a l’identique', async (slug) => {
    const original = readArticle(readFileSync(join(ROOT, 'src/content/blog', `${slug}.md`), 'utf-8'));
    const { articles } = (await bo.call('GET', 'list')).data;
    const article = articles.find((entry: any) => entry.slug === slug);

    const response = await bo.save({ ...article, image: null, removeImage: false });
    expect(response.status, response.data.error).toBe(200);

    const written = readArticle(bo.file(slug));
    expect(written.body).toBe(original.body);
    expect(written.data).toEqual(original.data);
    expect(schema.safeParse(written.data).success).toBe(true);
  });

  it('relit tous les champs d’un article ecrit par le back-office', async () => {
    const sent = validArticle({
      seoTitle: '',
      updatedDate: '2026-10-20',
      category: 'Bien-être',
      cta: 'rendez-vous',
      faq: [faqItem(), faqItem({ question: 'Une autre « question » ? Oui : "ici".' })],
      image: { data: PNG },
      coverAlt: 'Une photo : "avec" des guillemets',
      draft: true,
    });
    const { slug } = (await bo.save(sent)).data;

    const { articles } = (await bo.call('GET', 'list')).data;
    const article = articles.find((entry: any) => entry.slug === slug);

    expect(article).toMatchObject({
      keyword: sent.keyword,
      title: sent.title,
      description: sent.description,
      pubDate: sent.pubDate,
      updatedDate: sent.updatedDate,
      category: sent.category,
      cta: sent.cta,
      faq: sent.faq,
      coverAlt: sent.coverAlt,
      cover: `./images/${slug}.png`,
      draft: true,
      body: sent.body,
    });
  });

  it('garde l’adresse quand l’expression visee change', async () => {
    const first = validArticle();
    const { slug } = (await bo.save(first)).data;
    const keyword = 'une tout autre expression';

    const response = await bo.save({
      ...first,
      slug,
      keyword,
      title: `Un titre sur ${keyword}`,
      description: `Une description sur ${keyword}, assez longue pour passer le seuil du schema.`,
      body: `${first.body} Et ${keyword}.`,
    });

    expect(response.data.slug).toBe(slug);
    expect(readArticle(bo.file(slug)).data.keyword).toBe(keyword);
  });

  it('ne pose pas de date de mise a jour toute seule', async () => {
    const first = validArticle();
    const { slug } = (await bo.save(first)).data;
    await bo.save({ ...first, slug, body: `${first.body} Une coquille corrigée.` });

    expect(readArticle(bo.file(slug)).data.updatedDate).toBeUndefined();
  });

  it('retire l’image et son fichier a la demande', async () => {
    const first = validArticle({ image: { data: PNG }, coverAlt: 'Une photo' });
    const { slug } = (await bo.save(first)).data;
    expect(bo.exists(`images/${slug}.png`)).toBe(true);

    await bo.save({ ...first, slug, image: null, removeImage: true });

    expect(bo.exists(`images/${slug}.png`)).toBe(false);
    expect(readArticle(bo.file(slug)).data.cover).toBeUndefined();
  });

  it('refuse un article inconnu ou une adresse suspecte', async () => {
    expect((await bo.save(validArticle({ slug: 'inconnu' }))).status).toBe(404);
    expect((await bo.save(validArticle({ slug: '../../secret' }))).status).toBe(404);
    expect((await bo.save(validArticle({ slug: ['liste'] }))).status).toBe(404);
  });

  it('ne repasse pas en brouillon un article vers lequel un autre renvoie', async () => {
    const target = validArticle();
    const { slug } = (await bo.save(target)).data;
    const linking = validArticle();
    await bo.save({ ...linking, body: `${linking.body} Voir [cet article](/blog/${slug}/).` });

    const refused = await bo.save({ ...target, slug, draft: true });
    expect(refused.status).toBe(400);
    expect(refused.data.error).toContain('renvoie vers');
  });
});

describe('supprimer un article', () => {
  it('retire le fichier et son image', async () => {
    const { slug } = (await bo.save(validArticle({ image: { data: PNG }, coverAlt: 'Une photo' }))).data;

    const response = await bo.call('POST', 'delete', { slug });

    expect(response.status).toBe(200);
    expect(bo.exists(`${slug}.md`)).toBe(false);
    expect(bo.exists(`images/${slug}.png`)).toBe(false);
  });

  it('refuse tant qu’un article publie renvoie vers lui', async () => {
    const { slug } = (await bo.save(validArticle())).data;
    const linking = validArticle();
    await bo.save({ ...linking, body: `${linking.body} Voir [cet article](/blog/${slug}/).` });

    const response = await bo.call('POST', 'delete', { slug });

    expect(response.status).toBe(400);
    expect(response.data.error).toContain('renvoie vers');
    expect(bo.exists(`${slug}.md`)).toBe(true);
  });

  it('refuse un article inconnu ou une adresse suspecte', async () => {
    expect((await bo.call('POST', 'delete', { slug: 'inconnu' })).status).toBe(404);
    expect((await bo.call('POST', 'delete', { slug: '../content.config' })).status).toBe(404);
  });
});

describe('le modele d’article', () => {
  it('reste invisible et intouchable depuis le back-office', async () => {
    const { articles } = (await bo.call('GET', 'list')).data;
    expect(articles.map((entry: any) => entry.slug)).not.toContain('modele-article');

    expect((await bo.call('POST', 'delete', { slug: 'modele-article' })).status).toBe(404);
    expect((await bo.save(validArticle({ slug: 'modele-article' }))).status).toBe(404);
    expect(bo.exists('modele-article.md')).toBe(true);
  });

  it('ne se laisse pas ecraser par un nouvel article', async () => {
    const before = bo.file('modele-article');
    const response = await bo.save(
      validArticle({
        keyword: 'modèle article',
        title: 'Un modèle article pour écraser',
        description: `Un modèle article pour écraser l'autre, ${text(60)}`,
        body: `Un modèle article. ${text(120)}`,
      })
    );

    expect(response.status).toBe(400);
    expect(bo.file('modele-article')).toBe(before);
  });
});

describe('la connexion', () => {
  it('ferme tout sans session', async () => {
    const stranger = new BackOffice();
    await stranger.start();
    try {
      expect((await stranger.call('GET', 'session')).data.authenticated).toBe(false);
      expect((await stranger.call('GET', 'list')).status).toBe(401);
      expect((await stranger.call('POST', 'save', validArticle())).status).toBe(401);
      expect((await stranger.call('POST', 'delete', { slug: 'faim-emotionnelle' })).status).toBe(401);
      expect((await stranger.call('GET', 'status')).status).toBe(401);
      expect(stranger.exists('faim-emotionnelle.md')).toBe(true);
    } finally {
      stranger.stop();
    }
  }, 30000);

  it('refuse un mauvais mot de passe, puis bloque apres cinq essais', async () => {
    const stranger = new BackOffice();
    await stranger.start();
    try {
      const attempts = await Promise.all([1, 2, 3, 4].map(() => stranger.login('mauvais')));
      expect(attempts.map((attempt) => attempt.status)).toEqual([401, 401, 401, 401]);
      expect((await stranger.login('mauvais')).status).toBe(401);

      // Le bon mot de passe ne passe plus non plus
      expect((await stranger.login('test')).status).toBe(429);
    } finally {
      stranger.stop();
    }
  }, 30000);

  it('exige le jeton de la session pour toute ecriture', async () => {
    const before = bo.file('faim-emotionnelle');
    const response = await bo.call('POST', 'delete', { slug: 'faim-emotionnelle' }, { 'X-CSRF-Token': 'faux' });

    expect(response.status).toBe(403);
    expect(bo.file('faim-emotionnelle')).toBe(before);
  });

  it('referme la session a la deconnexion', async () => {
    const visitor = new BackOffice();
    await visitor.start();
    try {
      expect((await visitor.login()).status).toBe(200);
      expect((await visitor.call('GET', 'list')).status).toBe(200);

      await visitor.call('POST', 'logout', {});

      expect((await visitor.call('GET', 'list')).status).toBe(401);
    } finally {
      visitor.stop();
    }
  }, 30000);

  /*
   * Rien ne doit partir avec une valeur inventee : tant que le jeton et le mot
   * de passe n'ont pas ete donnes, le back-office refuse de demarrer.
   */
  it('refuse de demarrer tant que la configuration porte les marqueurs', async () => {
    const unset = new BackOffice();
    await unset.start(join(ROOT, 'public/api/config-exemple.php'));
    try {
      const response = await unset.login('A_DEMANDER_A_FIDIA');
      expect(response.status).toBe(503);
      expect(response.data.error).toContain('configuré');
    } finally {
      unset.stop();
    }
  }, 30000);
});

describe('le serveur d’essai', () => {
  it('sert les pages a leur adresse canonique, comme Apache', async () => {
    expect((await bo.page('/admin/')).status).toBe(200);
    expect((await bo.page('/bilan/')).status).toBe(200);

    const redirect = await bo.page('/admin');
    expect(redirect.status).toBe(301);
    expect(redirect.location).toBe('/admin/');

    const missing = await bo.page('/page-inconnue/');
    expect(missing.status).toBe(404);
    expect(missing.body).toContain('<html');
  });
});

describe('les aides de l’editeur', () => {
  const draft = (overrides: Partial<ArticleDraft> = {}): ArticleDraft => ({
    title: 'La faim émotionnelle expliquée',
    seoTitle: '',
    description: `La faim émotionnelle : ${text(60)}`,
    keyword: 'faim émotionnelle',
    body: 'La faim émotionnelle touche tout le monde.\n\n## Une partie',
    faq: [],
    hasCover: false,
    coverAlt: '',
    ...overrides,
  });

  /** Les memes adresses des deux cotes : l'apercu de l'editeur annonce la vraie. */
  it.each([
    ['faim émotionnelle du soir', 'faim-emotionnelle-du-soir'],
    ['Œuf et cœur de bœuf', 'oeuf-et-coeur-de-boeuf'],
    ["L'eau du robinet : qualité ?", 'l-eau-du-robinet-qualite'],
    ['Cuisine à côté, être là', 'cuisine-a-cote-etre-la'],
  ])('donne a « %s » la meme adresse que blog.php', async (keyword, slug) => {
    expect(slugify(keyword)).toBe(slug);

    const response = await bo.save(validArticle({ keyword, draft: true }));
    expect(response.data.slug).toBe(slug);
  });

  it('coche ce qui bloque la publication au meme niveau que blog.php', async () => {
    const complete = draft();
    expect(requiredChecks(complete).every((check) => check.done)).toBe(true);

    const incomplete = [
      { title: 'Trop court' },
      { title: `La faim émotionnelle ${text(60)}` },
      { description: 'Trop courte, et sans le sujet.' },
      { body: 'Un texte sur autre chose.' },
    ];
    for (const overrides of incomplete) {
      expect(
        requiredChecks(draft(overrides)).every((check) => check.done),
        JSON.stringify(overrides)
      ).toBe(false);
    }
  });

  it('coche le titre Google quand il prend le relais d’un titre trop long', () => {
    const longTitle = draft({
      title: `La faim émotionnelle ${text(60)}`,
      seoTitle: 'Faim émotionnelle : la comprendre',
    });
    expect(requiredChecks(longTitle).every((check) => check.done)).toBe(true);
  });

  it('cherche l’expression comme blog.php', () => {
    expect(containsKeyword('Parlons de **faim** émotionnelle', 'faim émotionnelle')).toBe(true);
    expect(containsKeyword('Que vaut l’eau du robinet', "l'eau du robinet")).toBe(true);
    expect(containsKeyword('Sur un [sujet](/faim-emotionnelle/) voisin', 'faim-emotionnelle')).toBe(false);
    expect(containsKeyword('Un texte', '')).toBe(false);
  });

  it('suit les reperes de SEO.md', () => {
    const labels = (overrides: Partial<ArticleDraft>) =>
      adviceChecks(draft(overrides))
        .filter((check) => check.done)
        .map((check) => check.label);

    expect(labels({})).toEqual(['Expression visée dans le premier paragraphe']);
    expect(labels({ body: 'Autre sujet.\n\nLa faim émotionnelle.' })).toEqual([]);
    expect(labels({ body: '## Un\n\n## Deux\n\n## Trois' })).toContain('Au moins trois intertitres');
    expect(labels({ body: '[a](/blog/faim-emotionnelle/)' })).toEqual(['Un lien vers un autre article']);
    expect(labels({ body: '[a](/bilan/)' })).toEqual(['Un lien vers une page du cabinet']);
    expect(labels({ faq: [faqItem(), faqItem()] })).toContain('Deux à quatre questions fréquentes');
    expect(labels({ faq: [faqItem()] })).not.toContain('Deux à quatre questions fréquentes');
    expect(labels({ hasCover: true, coverAlt: 'Une photo' })).toContain('Une image de couverture décrite');
    expect(labels({ hasCover: true })).not.toContain('Une image de couverture décrite');
  });

  it('compte les caracteres comme le schema', () => {
    expect(textLength('a\u{1F34E}')).toBe(2);
  });

  it('compte les mots sans la syntaxe Markdown', () => {
    expect(countWords('## Un titre\n\n- une [liste](/bilan/) *ici* | - |')).toBe(5);
  });
});

describe('la mise en ligne', () => {
  const read = (path: string) => readFileSync(join(ROOT, path), 'utf-8');

  it('ne laisse jamais partir la configuration sur GitHub', () => {
    expect(read('.gitignore')).toContain('public/api/config.php');
  });

  it('ne recopie aucun secret dans l’exemple de configuration', () => {
    const example = read('public/api/config-exemple.php');
    expect(example).toContain("'password_hash' => 'A_DEMANDER_A_FIDIA'");
    expect(example).toContain("'github_token' => 'A_DEMANDER_A_FIDIA'");
    expect(example).toContain("'github_repo' => 'Fidia-e/NATUREETDIETETIQUE'");
  });

  it('interdit de lire la configuration depuis un navigateur', () => {
    expect(read('dist/.htaccess')).toMatch(/<FilesMatch "\^\(config\\\.php\|config-exemple\\\.php\)\$">\s*Require all denied/);
  });

  /*
   * Le .htaccess de LNBIENETRE retire la barre finale : ses pages sont des
   * fichiers. Ici ce sont des dossiers, et la meme regle fait tourner chaque
   * page en boucle.
   */
  it('ne retire pas la barre finale, qui fait partie des adresses du site', () => {
    const htaccess = read('public/.htaccess');
    expect(htaccess).not.toMatch(/DirectorySlash\s+Off/);
    expect(htaccess).not.toMatch(/\/\$\s+\/\$1/);
    expect(htaccess).toContain('https://natureetdietetique.com%{REQUEST_URI}');
  });

  it('ne touche jamais a config.php sur le serveur, ni a un dossier devine', () => {
    const workflow = read('.github/workflows/deploy.yml');
    expect(workflow).toContain('api/config.php');
    expect(workflow).toContain('npm run build');
    // Un dossier par defaut pourrait ecraser un autre site du meme compte o2switch
    expect(workflow).not.toContain('public_html');
    expect(workflow).toContain("if: ${{ vars.FTP_SERVER_DIR != '' }}");
  });

  it('n’emploie jamais de tiret cadratin dans ce qui part sur le serveur', () => {
    for (const path of ['public/api/blog.php', 'public/api/config-exemple.php', 'public/.htaccess', 'tools/local-server.php', 'src/pages/admin.astro', 'src/lib/article-rules.ts']) {
      expect(read(path).includes(EM_DASH), path).toBe(false);
    }
  });
});

describe('la suite elle-meme', () => {
  it('n’a rien ecrit dans les articles du depot', () => {
    const written = readdirSync(join(bo.dir, 'src/content/blog'));

    expect(written.length).toBeGreaterThan(repositoryFiles.length);
    expect(readdirSync(join(ROOT, 'src/content/blog'))).toEqual(repositoryFiles);
  });
});
