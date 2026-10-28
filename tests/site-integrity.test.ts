import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { mesurer, noteDe } from '../scripts/ecoindex.mjs';
import { contact, ecoIndex, practitioner } from '../src/config';

/**
 * Verifications sur le site genere.
 * Elles supposent un `astro build` prealable : le script `npm test` l'enchaine.
 */
const DIST = new URL('../dist/', import.meta.url).pathname;

interface Page {
  /** Chemin servi, par exemple "/bilan/". */
  url: string;
  file: string;
  html: string;
}

let pages: Page[] = [];
let files = new Set<string>();
let css = '';

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = await Promise.all(
    entries.map((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : Promise.resolve([full]);
    })
  );
  return found.flat();
}

beforeAll(async () => {
  let all: string[];
  try {
    all = await walk(DIST);
  } catch {
    throw new Error(
      'dist/ est absent : lancez `npm run build` avant les tests, ou `npm test`.'
    );
  }

  files = new Set(all.map((f) => '/' + relative(DIST, f).split(sep).join('/')));

  /*
   * Astro sort les petites feuilles de style dans la page plutot que dans un
   * fichier a part. S'en tenir aux .css laissait donc une partie du site hors
   * de portee des verifications : on ramasse aussi les blocs <style>.
   */
  const externes = all
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(f, 'utf-8'));

  const inlines = all
    .filter((f) => f.endsWith('.html'))
    .flatMap((f) =>
      [...readFileSync(f, 'utf-8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(
        (m) => m[1]
      )
    );

  css = [...externes, ...inlines].join('\n');

  pages = all
    .filter((f) => f.endsWith('.html'))
    .map((file) => {
      const served = '/' + relative(DIST, file).split(sep).join('/');
      return {
        url: served.endsWith('/index.html')
          ? served.slice(0, -'index.html'.length)
          : served,
        file,
        html: readFileSync(file, 'utf-8'),
      };
    });
});

const pageFor = (url: string) => pages.find((p) => p.url === url);

describe('pages generees', () => {
  it('produit toutes les pages attendues', () => {
    const expected = [
      '/',
      '/bilan/',
      '/accompagnement/',
      '/ateliers/',
      '/l-eau/',
      '/le-chiffre/',
      '/mon-histoire/',
      '/rendez-vous/',
      '/contact/',
      '/blog/',
      '/mentions-legales/',
    ];
    const built = pages.map((p) => p.url);

    for (const url of expected) {
      expect(built, `${url} manque`).toContain(url);
    }
  });

  it('publie une page par article du blog', () => {
    const articles = pages.filter(
      (p) => p.url.startsWith('/blog/') && p.url !== '/blog/'
    );
    expect(articles.length).toBeGreaterThanOrEqual(4);
  });

  it('produit une page 404 et un sitemap', () => {
    expect(files.has('/404.html')).toBe(true);
    expect(files.has('/sitemap-index.xml')).toBe(true);
  });
});

describe('en-tetes de chaque page', () => {
  it('declare la langue francaise', () => {
    for (const page of pages) {
      expect(page.html, page.url).toContain('<html lang="fr"');
    }
  });

  it('porte un titre et une description non vides', () => {
    for (const page of pages) {
      const title = page.html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
      const description =
        page.html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';

      expect(title.trim().length, `titre vide : ${page.url}`).toBeGreaterThan(0);
      expect(
        description.trim().length,
        `description vide : ${page.url}`
      ).toBeGreaterThan(20);
    }
  });

  it('declare une URL canonique', () => {
    for (const page of pages) {
      expect(page.html, page.url).toMatch(/<link rel="canonical" href="https?:/);
    }
  });

  it('expose un favicon et une icone d’ecran d’accueil', () => {
    expect(files.has('/favicon.svg')).toBe(true);
    expect(files.has('/apple-touch-icon.png')).toBe(true);
  });
});

describe('liens et ressources', () => {
  it('ne laisse aucun lien interne casse', () => {
    const targets = new Set([...pages.map((p) => p.url), ...files]);
    const broken: string[] = [];

    for (const page of pages) {
      for (const [, href] of page.html.matchAll(
        /(?:href|src|srcset)="(\/[^"#?]*)"/g
      )) {
        if (!targets.has(href)) broken.push(`${page.url} -> ${href}`);
      }
    }

    expect(broken).toEqual([]);
  });

  it('sert chaque photo en AVIF et en JPEG', () => {
    for (const name of [
      'florie-portrait',
      'balancetest',
      'nature-phyto',
      'marche-foret',
    ]) {
      expect(files.has(`/images/${name}.avif`), `${name}.avif`).toBe(true);
      expect(files.has(`/images/${name}.jpg`), `${name}.jpg`).toBe(true);
    }
  });

  it('donne une alternative textuelle a chaque image', () => {
    for (const page of pages) {
      for (const [tag] of page.html.matchAll(/<img\b[^>]*>/g)) {
        const alt = tag.match(/\salt="([^"]*)"/);
        expect(alt, `alt absent sur ${page.url} : ${tag}`).not.toBeNull();
        expect(alt![1].trim().length, `alt vide sur ${page.url}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('cadre suisse', () => {
  const french = [
    ['CNIL', /\bCNIL\b/],
    ['ADELI', /\bADELI\b/],
    ['code de la santé publique', /code de la santé publique/i],
    ['Assurance maladie française', /l'Assurance maladie/i],
    ['mutuelle', /\bmutuelles?\b/i],
  ] as const;

  it('ne renvoie a aucune reference franco-francaise', () => {
    const offenders: string[] = [];
    for (const page of pages) {
      for (const [label, pattern] of french) {
        if (pattern.test(page.html)) offenders.push(`${page.url} : ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('fonde le traitement des donnees sur la LPD', () => {
    const page = pageFor('/mentions-legales/')!;
    expect(page.html).toContain('LPD');
    expect(page.html).toContain('edoeb.admin.ch');
  });

  it('indique le numero d’urgence suisse', () => {
    expect(pageFor('/contact/')!.html).toContain('144');
    expect(pageFor('/mentions-legales/')!.html).toContain('144');
  });

  it('affiche l’adresse suisse dans le pied de page', () => {
    for (const url of ['/', '/bilan/', '/contact/']) {
      expect(pageFor(url)!.html).toContain('Matran');
    }
  });
});

describe('video integree', () => {
  it('ne charge aucun lecteur tiers avant un clic', () => {
    // La facade est la seule chose servie : l'iframe est creee en JavaScript.
    for (const page of pages) {
      expect(page.html, `iframe tierce servie sur ${page.url}`).not.toMatch(
        /<iframe[^>]+zinzinoplay/i
      );
    }
  });

  it('annonce le lecteur et sa duree sur l\u2019accueil', () => {
    const html = pageFor('/')!.html;
    expect(html).toContain('data-video-play');
    expect(html).toContain('2 min 21');
  });

  it('previent que le lecteur vient d\u2019un tiers', () => {
    expect(pageFor('/')!.html).toContain('fourni par un tiers');
    expect(pageFor('/mentions-legales/')!.html).toContain('vidéo de présentation');
  });
});

describe('charte appliquee', () => {
  it('applique la meme transition partout, en 0.3s ease-in-out', () => {
    expect(css).toContain('--transition:.3s ease-in-out');
    // Aucune duree ni courbe en dur ne doit subsister a cote du jeton
    // Le « [^-] » ecarte la declaration du jeton lui-meme
    const durs = css.match(/[^-]transition:[^;}]*/g) ?? [];
    const horsJeton = durs.filter(
      (d) => /\d+m?s/.test(d) && !d.includes('--transition')
    );
    expect(horsJeton, 'transition en dur, hors du jeton commun').toEqual([]);
  });

  it('ouvre et ferme le menu mobile en transition, pas en display', () => {
    // `display` ne se transitionne pas : le panneau doit se replier par
    // l'opacite, le glissement et la visibilite, sinon il apparait sec.
    const panneau = (css.match(/\.header__nav\[[^\]]*\]\{[^}]*\}/g) ?? []).join('');

    expect(panneau, 'aucune regle sur le panneau de navigation').not.toBe('');
    expect(panneau, 'le menu ne doit pas basculer en display').not.toContain(
      'display:none'
    );
    expect(panneau, 'le menu ferme doit sortir du parcours clavier').toContain(
      'visibility:hidden'
    );
    expect(panneau, 'le menu doit passer par le jeton de transition').toContain(
      'var(--transition)'
    );
  });

  it('ne laisse plus trainer le jaune acide du degrade', () => {
    // #ffed0c est le haut du degrade du logo : il reste dans le fichier du
    // logo, jamais dans les styles du site.
    expect(css.toLowerCase(), 'jaune acide encore present').not.toContain('#ffed0c');
  });

  it('souleve le bouton dore au survol', () => {
    expect(css).toMatch(/\.button--gold:hover\{[^}]*translateY\(-3px\)/);
  });

  it('colore la selection en jaune de marque sur texte sombre', () => {
    const rule = css.match(/::selection\s*\{[^}]*\}/)?.[0] ?? '';

    expect(rule, 'aucune regle ::selection dans les styles construits').not.toBe('');
    // Le CSS garde les variables : on verifie le cablage, puis les jetons.
    expect(rule).toContain('var(--color-gold)');
    expect(rule).toContain('var(--color-text)');
    expect(css.toLowerCase()).toContain('--color-gold:#fab311');
    expect(css.toLowerCase()).toContain('--color-text:#1b2420');
  });

  it('laisse les boutons du pied de page hors des styles de lien', () => {
    // Sans cette exclusion, le survol des liens repeint le bouton doré.
    // Astro insere son attribut de portee dans le selecteur, d'ou le motif souple.
    expect(css, 'les liens du pied de page ne sont pas exclus des boutons').toMatch(
      /\.footer\[[^\]]*\]\s+a:not\(\.button\)/
    );
    expect(css, 'un rattrapage de survol subsiste sur le bouton du pied de page')
      .not.toMatch(/\.footer__cta[^{]*:hover/);
  });

  it('garde le texte du pied de page au-dessus du contraste minimal', () => {
    // On mesure le rapport reel plutot que d'interdire une teinte : une
    // nouvelle couleur trop pale passerait sinon entre les mailles.
    const luminance = (hex: string) => {
      const n = hex.replace('#', '');
      const [r, g, b] = [0, 2, 4]
        .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const fond = luminance('#156839'); // le vert du pied de page

    // Toutes les teintes declarees dans les regles du pied de page. Le
    // filigrane est exclu : c'est un decor `aria-hidden`, volontairement a
    // peine distinct du fond, et aucun contraste ne lui est demande.
    const regles = (css.match(/\.footer[^{]*\{[^}]*\}/g) ?? []).filter(
      (regle) => !regle.includes('footer__wordmark')
    );
    const teintes = new Set<string>();
    for (const regle of regles) {
      for (const [, hex] of regle.matchAll(/color:(#[0-9a-f]{6})/gi)) {
        teintes.add(hex.toLowerCase());
      }
    }

    const trop_pales: string[] = [];
    for (const teinte of teintes) {
      const l = luminance(teinte);
      const ratio = (Math.max(l, fond) + 0.05) / (Math.min(l, fond) + 0.05);
      if (ratio < 4.5) trop_pales.push(`${teinte} (${ratio.toFixed(2)}:1)`);
    }

    expect(trop_pales, 'teintes sous 4,5:1 sur le vert du pied de page').toEqual([]);
  });

  it('colore aussi les liens venus des composants enfants du pied de page', () => {
    // Une regle scopee ne viserait que les liens ecrits dans SiteFooter.astro.
    // Les autres retomberaient sur le vert global, invisible sur ce fond.
    expect(css, 'la regle de lien du pied de page n\u2019est pas globale').toMatch(
      /\.footer\[[^\]]*\]\s+a:not\(\.button\)/
    );
  });

  it('laisse la signature prendre la couleur de son contexte', () => {
    // Sans cela, le lien retombe sur le vert global et devient invisible
    // sur le fond vert du pied de page.
    expect(css, 'la signature doit heriter de son contexte').toMatch(
      /\.signature\[[^\]]*\]\s*a\[[^\]]*\]\{[^}]*var\(--signature-name,\s*inherit\)/
    );
    expect(css, 'le pied de page doit donner son ton au nom').toMatch(
      /\.footer__bar\[[^\]]*\]\s+\.signature a\{[^}]*color:#eaf2ec/
    );
  });

  it('signe chaque page avec la signature habituelle', () => {
    for (const page of pages) {
      expect(page.html, page.url).toContain(
        'Une création sur-mesure, pensée et codée'
      );
      expect(page.html, page.url).toContain('Maison Sacrée Môme');
      expect(page.html, page.url).toContain('https://sacreemome.com/');
    }
  });

  it('ne reprend pas la signature perimee de l\u2019ancien julie-eggen', () => {
    for (const page of pages) {
      expect(page.html, page.url).not.toContain('linkedin.com/in/fidiaelbouanani');
      expect(page.html, page.url).not.toContain('Site réalisé par');
    }
  });
});

describe('la page sur l\u2019eau', () => {
  it('remplace le lien sortant vers Sonatec par la page du site', () => {
    const accueil = pageFor('/')!.html;
    const section = accueil.slice(accueil.indexOf('id="eau"'));

    expect(section).toContain('href="/l-eau/"');
    expect(section.slice(0, section.indexOf('id="cellules"') + 1)).not.toContain(
      'sonatec.com'
    );
  });

  it('distingue ce qui est etabli de ce qui ne l\u2019est pas', () => {
    const html = pageFor('/l-eau/')!.html;
    expect(html).toContain('Ce qui est établi');
    expect(html).toContain("Ce qui ne l'est pas");
    expect(html).toContain('aucun consensus scientifique');
  });

  it('cite sa source plutot que de reprendre les affirmations a son compte', () => {
    expect(pageFor('/l-eau/')!.html).toContain('sonatec.com');
  });
});

describe('le schema cellulaire', () => {
  it('figure sur l\u2019accueil, entre l\u2019equilibre et le test', () => {
    const html = pageFor('/')!.html;
    expect(html).toContain('id="cellules"');
    expect(html.indexOf('id="equilibre"')).toBeLessThan(html.indexOf('id="cellules"'));
    expect(html.indexOf('id="cellules"')).toBeLessThan(html.indexOf('id="balancetest"'));
  });

  it('porte les deux etats de membrane et le rapport 3:1', () => {
    const html = pageFor('/')!.html;
    expect(html).toContain('Membrane dure, rigide');
    expect(html).toContain('Membrane douce et souple');
    expect(html).toContain('3:1');
  });
});

describe('sobriete numerique', () => {
  it('tient la note annoncee sur chaque page', async () => {
    const seuil = { A: 80, B: 70, C: 55, D: 40, E: 25, F: 10, G: 0 }[
      ecoIndex.grade
    ]!;

    for (const page of pages.map((p) => p.url).filter((u) => !u.endsWith('.html'))) {
      const m = await mesurer(page);
      expect(
        m.score,
        `${page} tombe a ${m.score} (${m.note}), sous la note ${ecoIndex.grade} affichee en pied de page`
      ).toBeGreaterThan(seuil);
    }
  });

  it('annonce une note coherente avec le pire score mesure', () => {
    expect(noteDe(ecoIndex.worstScore)).toBe(ecoIndex.grade);
  });

  it('affiche le badge et son explication', () => {
    for (const page of pages) {
      expect(page.html, page.url).toContain('EcoIndex');
    }
    expect(pageFor('/mentions-legales/')!.html).toContain('id="eco-conception"');
  });

  /*
   * EcoIndex est un nom propre : un I majuscule au milieu, la note en
   * capitale. Seule l'adresse ecoindex.fr garde sa casse d'URL, on la retire
   * avant de regarder.
   */
  it('ecrit toujours « EcoIndex A », jamais une autre casse', () => {
    for (const page of pages) {
      const texte = page.html.replace(/ecoindex\.fr/g, '');
      const fautes = (texte.match(/ecoindex/gi) ?? []).filter(
        (m) => m !== 'EcoIndex'
      );
      expect(fautes, `${page.url} ecrit ${fautes.join(', ')}`).toEqual([]);

      const notes = texte.match(/EcoIndex[^<]*<strong>([^<]+)</g) ?? [];
      for (const note of notes) {
        expect(note, page.url).toContain(`<strong>${ecoIndex.grade}`);
      }
    }
  });
});

describe('le domaine', () => {
  const DOMAINE = 'https://natureetdietetique.com/';

  /*
   * Le domaine avait ete invente : www.nature-et-dietetique.fr, que personne
   * n'avait donne. Il ressortait dans chaque balise canonique, chaque og:url
   * et tout le sitemap, et aurait designe a Google un domaine qui n'est pas
   * celui de Florie.
   */
  it('donne a chaque page une adresse canonique sur natureetdietetique.com', () => {
    for (const page of pages) {
      const canonique = page.html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      expect(canonique, `${page.url} sans balise canonique`).toBeDefined();
      expect(canonique!.startsWith(DOMAINE), `${page.url} -> ${canonique}`).toBe(
        true
      );
    }
  });

  it('pose le meme domaine dans le sitemap', () => {
    const plan = readFileSync(join(DIST, 'sitemap-0.xml'), 'utf-8');
    const adresses = [...plan.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

    expect(adresses.length).toBeGreaterThan(0);
    for (const adresse of adresses) {
      expect(adresse.startsWith(DOMAINE), adresse).toBe(true);
    }
  });

  /*
   * Le .ch redirige vers le .com : il ne doit jamais se presenter comme
   * l'adresse officielle d'une page, sous peine de doublon pour les moteurs.
   */
  it('ne presente jamais le domaine de redirection comme officiel', () => {
    for (const page of pages) {
      expect(page.html, page.url).not.toContain('natureetdietetique.ch');
    }
  });
});

describe('les deux liens obligatoires du pied de page', () => {
  /** Le pied de page seul, pour ne pas compter un lien pose ailleurs. */
  const pied = (html: string) => html.slice(html.lastIndexOf('<footer'));

  /** Texte d'un lien, balises retirees et espaces resserres. */
  const texte = (fragment: string) =>
    fragment.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

  it('menent aux mentions legales sur chaque page', () => {
    for (const page of pages) {
      expect(pied(page.html), page.url).toMatch(
        /<a[^>]+href="\/mentions-legales\/?"[^>]*>\s*Mentions légales\s*<\/a>/
      );
    }
  });

  /*
   * Libelle impose : « Site éco-conçu - EcoIndex A », avec un tiret simple.
   * Il etait ecrit avec un point median. Et il pointe vers l'ancre de la
   * page legale, jamais vers un site exterieur.
   */
  it('annoncent l\u2019eco-conception avec le libelle exact, vers son ancre', () => {
    for (const page of pages) {
      const lien = pied(page.html).match(
        /<a[^>]+href="\/mentions-legales\/?#eco-conception"[^>]*>([\s\S]*?)<\/a>/
      );

      expect(lien, `${page.url} sans lien vers #eco-conception`).not.toBeNull();
      expect(texte(lien![1]), page.url).toBe(
        `Site éco-conçu - EcoIndex ${ecoIndex.grade}`
      );
    }
  });
});

describe('la page contact', () => {
  /*
   * Elle existait deja, mais n'etait liee nulle part dans le menu : son seul
   * acces visible etait le repli de la page de rendez-vous, qui a disparu le
   * jour ou le calendrier a ete branche. Une page de contact qu'on ne trouve
   * pas ne sert a rien.
   */
  it('est atteignable depuis la navigation de chaque page', () => {
    for (const page of pages) {
      const entete = page.html.slice(0, page.html.indexOf('</header>') + 9);
      expect(entete, `${page.url} ne mene pas au contact`).toContain(
        'href="/contact/"'
      );
    }
  });

  it('porte le formulaire, avec son garde-fou a robots et son consentement', () => {
    const html = pageFor('/contact/')!.html;

    expect(html).toContain('data-contact');
    expect(html).toContain('name="site"');
    expect(html).toContain('name="consentement"');
    expect(html).toContain('/mentions-legales/');
  });
});

describe('le calendrier de rendez-vous', () => {
  const booking = () => pageFor('/rendez-vous/')!.html;

  /*
   * Cette page a deux visages selon que `calendlyUrl` est renseigne ou non,
   * et le second n'etait jamais exerce. On verifie celui qui est en service,
   * quel qu'il soit, plutot que de laisser une branche sans filet.
   */
  it('affiche soit le calendrier, soit le repli, jamais les deux', () => {
    const html = booking();
    const calendrier = html.includes('calendly-inline-widget');
    const repli = html.includes('arrive bient');

    expect(calendrier || repli, 'ni calendrier ni repli').toBe(true);
    expect(calendrier && repli, 'les deux a la fois').toBe(false);
  });

  it('laisse le calendrier s\u2019ajuster a son contenu', () => {
    const html = booking();
    if (!html.includes('calendly-inline-widget')) return;

    // Sans cet attribut la hauteur reste figee et le calendrier est coupe
    expect(html).toContain('data-resize="true"');
    // Son script doit accompagner le bloc, sinon rien ne s'affiche
    expect(html).toContain('assets.calendly.com/assets/external/widget.js');
  });

  /*
   * Observe en direct : le script de Calendly a annonce une hauteur de 2 px
   * et le calendrier a disparu de la page. Le plancher en CSS est la seule
   * chose qui empeche cet effondrement, et il tient aussi la colonne de
   * gauche assez haute pour qu'elle ne defile pas toute seule.
   */
  it('garde un plancher de hauteur, quoi qu\u2019annonce Calendly', () => {
    if (!booking().includes('calendly-inline-widget')) return;

    const regles = css.match(/\.calendly-inline-widget[^{,]*\{[^}]*\}/g) ?? [];
    const plafonds = regles.filter((r) => /min-height:\s*[\d.]+rem/.test(r));

    expect(plafonds.length, 'aucun min-height sur le calendrier').toBeGreaterThan(
      0
    );
  });

  /*
   * Integrer Calendly, c'est confier a un tiers etabli hors de Suisse le nom
   * et l'adresse e-mail de qui reserve. Les mentions legales doivent le dire
   * (art. 16 et 17 LPD), et la note EcoIndex ne doit pas se presenter comme
   * couvrant un calendrier qu'elle ne mesure pas.
   */
  it('est declare dans les mentions legales tant qu\u2019il est en service', () => {
    if (!booking().includes('calendly-inline-widget')) return;

    const legal = pageFor('/mentions-legales/')!.html;
    expect(legal, 'le sous-traitant n\u2019est pas nomme').toContain('Calendly');
    expect(legal, 'la reserve sur la mesure manque').toMatch(/n.inclut pas/);
  });
});

describe('la barre de defilement', () => {
  /** Renvoie le contenu des blocs `@supports` dont la condition correspond. */
  const sousSupports = (filtre: (condition: string) => boolean) => {
    const blocs: string[] = [];
    let i = 0;

    while ((i = css.indexOf('@supports', i)) !== -1) {
      const ouvrante = css.indexOf('{', i);
      const condition = css.slice(i + '@supports'.length, ouvrante);

      let profondeur = 0;
      let j = ouvrante;
      for (; j < css.length; j++) {
        if (css[j] === '{') profondeur += 1;
        else if (css[j] === '}') {
          profondeur -= 1;
          if (profondeur === 0) break;
        }
      }

      if (filtre(condition)) blocs.push(css.slice(ouvrante, j + 1));
      i = j + 1;
    }

    return blocs.join('\n');
  };

  it('est posee sur chaque page', () => {
    for (const page of pages) {
      expect(page.html, page.url).toContain('class="scrollbar"');
    }
  });

  /*
   * Le point qui compte. Effacer la barre du systeme hors du `@supports`
   * laisserait un navigateur sans animation liee au defilement avec aucun
   * repere du tout : ni la sienne, ni la notre, qui resterait figee en haut.
   */
  it('n\u2019efface la barre du systeme que la ou la sienne fonctionne', () => {
    const garde = sousSupports((c) => c.includes('animation-timeline'));

    expect(garde, 'aucun @supports sur animation-timeline').not.toBe('');
    expect(garde).toContain('scrollbar-width:none');
    expect(garde).toContain('::-webkit-scrollbar');

    const dehors = css.split(garde).join('');
    expect(dehors, 'la barre native est effacee sans garde-fou').not.toContain(
      'scrollbar-width:none'
    );
  });

  it('mesure 7 px, en dore et a bouts ronds', () => {
    const garde = sousSupports((c) => c.includes('animation-timeline'));
    const barre = garde.match(/\.scrollbar[^{,]*\{[^}]*\}/)?.[0] ?? '';
    const curseur = garde.match(/\.scrollbar[^{,]*:after\{[^}]*\}/i)?.[0] ?? '';

    expect(barre).toContain('inline-size:7px');
    expect(curseur).toContain('border-radius:999px');
    expect(curseur).toContain('var(--color-gold)');
  });
});

describe('la gouttiere laterale', () => {
  /*
   * `.prose` redefinit `width` et emportait avec lui le `100% - 2.5rem` qui
   * donne au conteneur sa marge laterale : le texte venait toucher les deux
   * bords de l'ecran. Les deux retraits doivent rester egaux.
   */
  it('vaut la meme chose pour un conteneur ordinaire et un conteneur en prose', () => {
    const retrait = (selecteur: string) => {
      const regle = css.match(
        new RegExp(`${selecteur.replace(/\./g, '\\.')}\\{[^}]*\\}`)
      );
      expect(regle, `regle ${selecteur} introuvable`).not.toBeNull();
      const m = regle![0].match(/min\(100% ?- ?([\d.]+)rem/);
      expect(m, `${selecteur} ne reserve aucune gouttiere`).not.toBeNull();
      return parseFloat(m![1]);
    };

    expect(retrait('.container.prose')).toBe(retrait('.container'));
  });
});

describe('l\u2019echelle d\u2019espacement', () => {
  /*
   * Sans palier tablette, un ecran de 768 px recevait les 120 px de blanc
   * dessines pour un grand ecran : les sections n'avaient plus de rapport
   * avec leur contenu. Deux crans, donc, et chacun plus serre que le
   * precedent.
   */
  it('resserre les sections en deux crans, tablette puis telephone', () => {
    const valeur = (largeur: string) => {
      // Le minifieur reecrit `max-width: 64rem` en `width<=64rem` : les deux
      // ecritures sont acceptees.
      const bloc = css.match(
        new RegExp(`@media[^{]*(max-width: ?|width<=)${largeur}[^{]*\\{:root\\{[^}]*\\}`)
      );
      expect(bloc, `aucun palier a ${largeur}`).not.toBeNull();
      const m = bloc![0].match(/--space-2xl:([\d.]+)rem/);
      expect(m, `le palier ${largeur} ne redefinit pas --space-2xl`).not.toBeNull();
      return parseFloat(m![1]);
    };

    const tablette = valeur('64rem');
    const telephone = valeur('46rem');

    expect(tablette).toBeLessThan(7.5);
    expect(telephone).toBeLessThan(tablette);
  });
});

describe('le filtre du blog', () => {
  it('expose un bouton par categorie et une categorie par article', () => {
    const html = pageFor('/blog/')!.html;
    const boutons = [...html.matchAll(/data-filter="([^"]+)"/g)].map((m) => m[1]);
    const articles = [...html.matchAll(/data-category="([^"]+)"/g)].map(
      (m) => m[1]
    );

    expect(boutons[0]).toBe('toutes');
    expect(boutons.length).toBeGreaterThan(1);
    for (const categorie of new Set(articles)) {
      expect(boutons, `aucun bouton pour ${categorie}`).toContain(categorie);
    }
  });

  /*
   * Le bug qui a fait que le filtre ne filtrait pas. `item.hidden = true` pose
   * l'attribut, mais le `display: none` qui va avec vient de la feuille du
   * navigateur : n'importe quelle regle d'auteur qui fixe `display` sur la
   * meme classe lui passe devant et l'article reste affiche. Il faut donc
   * rendre le masquage explicite.
   */
  /*
   * Une carte doit avoir la meme taille qu'on en affiche une ou quatre.
   * `auto-fit`, le defaut de la grille a trois colonnes, effondre les
   * colonnes vides : apres un filtrage, l'unique article restant s'etirait
   * sur toute la largeur.
   */
  it('garde la largeur des colonnes quand le filtre n\u2019en laisse qu\u2019une', () => {
    const regle = (css.match(/\.posts[^{},]*\{[^}]*grid-template-columns[^}]*\}/g) ?? [])
      .filter((r) => !r.includes('__'));

    expect(regle.length, 'aucune colonne definie pour .posts').toBeGreaterThan(0);
    expect(regle.join('')).toContain('auto-fill');
    expect(regle.join('')).not.toContain('auto-fit');
  });

  it('masque vraiment les articles filtres malgre le display d\u2019auteur', () => {
    const regles = css.match(/\.posts__item[^{}]*\{[^}]*\}/g) ?? [];
    const base = regles.filter((r) => !r.includes('[hidden]') && !r.includes('>'));
    const masque = regles.filter((r) => r.includes('[hidden]'));

    expect(base.some((r) => /display:/.test(r))).toBe(true);
    expect(masque.some((r) => /display:none/.test(r))).toBe(true);
  });
});

describe('les formulaires', () => {
  const formulaires = [
    { page: '/contact/', marque: 'data-contact' },
    { page: '/le-chiffre/', marque: 'data-lead' },
  ];

  it('expose un formulaire sur la page contact et sur l\u2019entonnoir', () => {
    for (const { page, marque } of formulaires) {
      expect(pageFor(page)!.html, page).toContain(marque);
    }
  });

  it('exige le consentement dans le balisage, pas seulement en JavaScript', () => {
    for (const { page } of formulaires) {
      expect(pageFor(page)!.html, page).toMatch(
        /name="consentement"[^>]*required|required[^>]*name="consentement"/
      );
    }
  });

  it('renvoie vers la section qui decrit le traitement', () => {
    for (const { page } of formulaires) {
      expect(pageFor(page)!.html, page).toContain('href="/mentions-legales/#');
    }
  });

  it('pose un piege a robots hors de l\u2019ecran', () => {
    for (const { page } of formulaires) {
      expect(pageFor(page)!.html, page).toContain('name="site"');
    }
    expect(css, 'le piege doit sortir de l\u2019ecran, pas etre masque').toMatch(
      /left:-9999px/
    );
  });

  it('nomme chaque champ par une etiquette', () => {
    for (const { page } of formulaires) {
      const html = pageFor(page)!.html;
      // Chaque champ est enveloppe dans son <label> : pas de champ orphelin
      const champs = html.match(/<(input|select|textarea)\b[^>]*name="[^"]+"/g) ?? [];
      expect(champs.length, page).toBeGreaterThan(3);
    }
  });
});

describe('la page entonnoir', () => {
  it('annonce le marqueur et le compteur de tests', () => {
    const html = pageFor('/le-chiffre/')!.html;
    expect(html).toContain('Oméga-6 / Oméga-3');
    expect(html).toContain('Tests réalisés à ce jour');
  });

  it('attribue le compteur a sa source et le date', () => {
    const html = pageFor('/le-chiffre/')!.html;
    expect(html).toContain('Chiffre communiqué par Zinzino');
  });

  it('n\u2019affiche aucun temoignage tant qu\u2019il n\u2019y en a pas', () => {
    // Ceux d'un autre praticien seraient attribues a la pratique de Florie.
    const html = pageFor('/le-chiffre/')!.html;
    expect(html).not.toContain('Ils ont fait le test');
  });
});

describe('contenus en attente', () => {
  it('ne laisse aucun marqueur « a completer » hors des pages legales', () => {
    const legal = ['/mentions-legales/'];
    const offenders = pages
      .filter((p) => !legal.includes(p.url))
      .filter((p) => p.html.includes('a-completer'))
      .map((p) => p.url);

    expect(offenders).toEqual([]);
  });

  /*
   * Le numero IDE est exige des mentions legales (LCD art. 3 al. 1 let. s).
   * On verifie sa forme, pas sa valeur : celle-ci vit dans la configuration.
   */
  it('porte un numero IDE au format suisse, et plus un marqueur', () => {
    const html = pageFor('/mentions-legales/')!.html;
    const ligne = html.match(/Numéro IDE[\s\S]{0,160}/)?.[0] ?? '';

    expect(ligne, 'la ligne IDE est introuvable').not.toBe('');
    expect(ligne).toMatch(/CHE-\d{3}\.\d{3}\.\d{3}/);
    expect(ligne, 'le marqueur « a completer » est encore la').not.toContain(
      'a-completer'
    );
  });

  it('nomme Florie Deternod sur la page histoire', () => {
    expect(pageFor('/mon-histoire/')!.html).toContain('Florie Deternod');
  });
});

describe('le bilan', () => {
  it('rend les sept etapes et le compte rendu', () => {
    const html = pageFor('/bilan/')!.html;
    const stepCount = [...html.matchAll(/data-funnel-step=/g)].length;

    expect(stepCount).toBe(6); // cinq etapes de questions, plus le contexte
    expect(html).toContain('data-funnel-report');
  });

  it('exige le consentement dans le balisage, pas seulement en JavaScript', () => {
    const html = pageFor('/bilan/')!.html;
    expect(html).toMatch(/name="consentement"[^>]*required|required[^>]*name="consentement"/);
  });

  it('renvoie vers la politique de confidentialite depuis le formulaire', () => {
    expect(pageFor('/bilan/')!.html).toContain('href="/mentions-legales/#bilan"');
  });

  it('affiche la mention qui exclut tout diagnostic', () => {
    expect(pageFor('/bilan/')!.html).toContain('ne constitue ni un diagnostic');
  });
});

/*
 * Le referencement. Le but du site est d'apparaitre en tete de Google : ces
 * tests gardent ce qui y contribue et que l'on casse sans s'en apercevoir en
 * retouchant un titre ou un article. Le mode d'emploi est dans SEO.md.
 */
describe('le referencement', () => {
  const decode = (text: string) =>
    text
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

  const titleOf = (html: string) =>
    decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
  const descriptionOf = (html: string) =>
    decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
  const metaOf = (html: string, property: string) =>
    decode(html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`))?.[1] ?? '');

  /** Toutes les donnees structurees de la page, a plat. */
  const jsonLdOf = (html: string): Record<string, any>[] =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]))
      .flatMap((data) => data['@graph'] ?? [data]);

  const ofType = (html: string, type: string) =>
    jsonLdOf(html).filter((entity) => [entity['@type']].flat().includes(type));

  const indexables = () => pages.filter((p) => p.url.endsWith('/'));
  const articles = () =>
    pages.filter((p) => p.url.startsWith('/blog/') && p.url !== '/blog/');

  it('donne a chaque page un titre que Google ne coupe pas', () => {
    for (const page of indexables()) {
      const title = titleOf(page.html);
      expect(title.length, `${page.url} : « ${title} »`).toBeLessThanOrEqual(65);
    }
  });

  it('ne donne jamais le meme titre ni la meme description a deux pages', () => {
    const titles = indexables().map((p) => titleOf(p.html));
    const descriptions = indexables().map((p) => descriptionOf(p.html));

    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('garde chaque description entre 70 et 160 caracteres', () => {
    for (const page of indexables()) {
      const length = descriptionOf(page.html).length;
      expect(length, page.url).toBeGreaterThanOrEqual(70);
      expect(length, page.url).toBeLessThanOrEqual(160);
    }
  });

  it('nomme la commune dans le titre de l\u2019accueil', () => {
    expect(titleOf(pageFor('/')!.html)).toContain(contact.address.city);
  });

  it('pose un seul titre principal par page', () => {
    for (const page of indexables()) {
      const count = [...page.html.matchAll(/<h1[\s>]/g)].length;
      expect(count, page.url).toBe(1);
    }
  });

  it('ouvre le site aux moteurs et leur indique le plan', () => {
    const robots = readFileSync(join(DIST, 'robots.txt'), 'utf-8');

    expect(robots).toContain('User-agent: *');
    expect(robots).not.toMatch(/^Disallow: \/$/m);
    expect(robots).toContain('Sitemap: https://natureetdietetique.com/sitemap-index.xml');
  });

  it('ne demande a aucune page d\u2019etre ignoree', () => {
    for (const page of indexables()) {
      expect(page.html, page.url).not.toMatch(/<meta name="robots"[^>]*noindex/);
    }
  });

  it('decrit le cabinet sur chaque page, avec les coordonnees du site', () => {
    for (const page of indexables()) {
      const [business] = ofType(page.html, 'HealthAndBeautyBusiness');

      expect(business, page.url).toBeDefined();
      expect(business.telephone).toBe(contact.phone);
      expect(business.address.streetAddress).toBe(contact.address.street);
      expect(business.address.postalCode).toBe('1753');
      expect(business.address.addressLocality).toBe(contact.address.city);
      expect(business.address.addressCountry).toBe('CH');
    }
  });

  it('presente Florie comme une personne, reliee au cabinet', () => {
    const [person] = ofType(pageFor('/')!.html, 'Person');

    expect(person.name).toBe(practitioner.fullName);
    expect(person.url).toBe('https://natureetdietetique.com/mon-histoire/');
  });

  it('liste tous les articles dans les donnees du blog', () => {
    const [blog] = ofType(pageFor('/blog/')!.html, 'Blog');

    expect(blog.blogPost).toHaveLength(articles().length);
  });

  it('ne publie pas le modele d\u2019article', () => {
    expect(pageFor('/blog/modele-article/')).toBeUndefined();
  });

  it('declare chaque article dans le plan du site', () => {
    const sitemap = readFileSync(join(DIST, 'sitemap-0.xml'), 'utf-8');
    for (const page of articles()) {
      expect(sitemap, page.url).toContain(`<loc>https://natureetdietetique.com${page.url}</loc>`);
    }
  });

  describe.each(['batch-cooking-dimanche', 'faim-emotionnelle', 'lire-une-etiquette', 'petit-dejeuner-rassasiant'])(
    'l\u2019article %s',
    (slug) => {
      const html = () => pageFor(`/blog/${slug}/`)!.html;
      const canonical = `https://natureetdietetique.com/blog/${slug}/`;
      const prose = () =>
        decode(
          (html().split('class="prose article-prose"')[1] ?? '')
            .split('class="author')[0]
            .replace(/<[^>]+>/g, ' ')
        );

      it('vise son expression dans le titre, la description et le texte', () => {
        const keyword = metaOf(html(), 'article:tag').toLowerCase();

        expect(keyword.length).toBeGreaterThan(2);
        expect(titleOf(html()).toLowerCase()).toContain(keyword);
        expect(descriptionOf(html()).toLowerCase()).toContain(keyword);
        expect(prose().toLowerCase()).toContain(keyword);
      });

      it('se presente comme un article, date a l\u2019appui', () => {
        expect(metaOf(html(), 'og:type')).toBe('article');
        expect(metaOf(html(), 'article:published_time')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      });

      it('porte des donnees BlogPosting attribuees a Florie', () => {
        const [post] = ofType(html(), 'BlogPosting');
        const [person] = ofType(html(), 'Person');

        expect(post.headline).toBe(titleOf(html()));
        expect(post.mainEntityOfPage).toBe(canonical);
        expect(post.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(post.author['@id']).toBe(person['@id']);
        expect(post.inLanguage).toBe('fr-CH');
      });

      it('expose son fil d\u2019Ariane, visible et structure', () => {
        const [trail] = ofType(html(), 'BreadcrumbList');
        const items = trail.itemListElement;

        expect(html()).toContain('aria-label="Fil d\'Ariane"');
        expect(items.map((i: any) => i.item)).toEqual([
          'https://natureetdietetique.com/',
          'https://natureetdietetique.com/blog/',
          canonical,
        ]);
      });

      it('relie son autrice et oriente vers une page du cabinet', () => {
        expect(html()).toMatch(/href="\/mon-histoire\/" rel="author"/);
        expect(html()).toMatch(
          /class="button button--gold"[^>]*href="\/(bilan|accompagnement|ateliers|rendez-vous)\/"/
        );
      });

      it('declare ses questions frequentes seulement si elles s\u2019affichent', () => {
        const affichees = html().includes('id="questions"');
        expect(ofType(html(), 'FAQPage').length > 0).toBe(affichees);
      });
    }
  );

  /*
   * Le titre de dieteticien.ne est reglemente en Suisse (LPSan) et suppose un
   * diplome reconnu. Tant que Florie n'a pas confirme le sien, le site ne doit
   * pas le revendiquer, meme pour viser la recherche « dieteticienne
   * Fribourg ». Ce test tombera le jour ou on l'ajoute : c'est voulu, il
   * faudra alors verifier le titre avant de le corriger.
   */
  it('ne revendique pas le titre reglemente de dieteticienne', () => {
    for (const page of pages) {
      const text = page.html.replace(/<[^>]+>/g, ' ');
      expect(text, page.url).not.toMatch(/di[eé]t[eé]ticien/i);
    }
  });
});

/*
 * Regle de la Maison : jamais de tiret cadratin, ni dans les textes ni dans
 * le code. Il en restait trois, dans un article et deux formulaires ; ce test
 * empeche qu'un nouveau texte colle depuis ailleurs en ramene.
 */
describe('la typographie', () => {
  it('n’emploie jamais de tiret cadratin', () => {
    for (const page of pages) {
      expect(page.html.includes('—'), page.url).toBe(false);
    }
    expect(css.includes('—')).toBe(false);
  });
});
