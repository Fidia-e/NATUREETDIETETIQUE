/**
 * Calcul de la note EcoIndex sur le site construit.
 *
 * L'algorithme est celui publie par GreenIT : trois mesures, le nombre de
 * noeuds du DOM, le nombre de requetes et le poids transfere, chacune ramenee
 * a un rang par interpolation dans des quantiles de reference.
 *
 * Les chiffres sont calcules sur `dist/`, hors serveur : ils servent de garde
 * contre les regressions. La note publiee reste celle mesuree sur le site en
 * ligne, ou la compression et le cache de l'hebergeur entrent aussi en compte.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const QUANTILES_DOM = [0, 47, 75, 159, 233, 298, 358, 417, 476, 537, 603, 674,
  753, 843, 949, 1076, 1237, 1459, 1801, 2479, 594601];
const QUANTILES_REQ = [0, 2, 15, 25, 34, 42, 49, 56, 63, 70, 78, 86, 95, 105,
  117, 130, 147, 170, 205, 281, 3920];
const QUANTILES_KO = [0, 1.37, 144.7, 319.53, 479.46, 631.97, 783.38, 937.91,
  1098.62, 1265.47, 1448.32, 1648.27, 1876.08, 2142.06, 2465.37, 2866.31,
  3401.59, 4155.73, 5400.08, 8037.54, 223212.26];

/** Rang de la valeur dans les quantiles, interpole entre deux bornes. */
function rang(quantiles, valeur) {
  for (let i = 1; i < quantiles.length; i++) {
    if (valeur < quantiles[i]) {
      return i - 1 + (valeur - quantiles[i - 1]) / (quantiles[i] - quantiles[i - 1]);
    }
  }
  return quantiles.length - 1;
}

export function noteDe(score) {
  if (score > 80) return 'A';
  if (score > 70) return 'B';
  if (score > 55) return 'C';
  if (score > 40) return 'D';
  if (score > 25) return 'E';
  if (score > 10) return 'F';
  return 'G';
}

/** Compte les elements d'un document, scripts et commentaires exclus. */
export function compterNoeuds(html) {
  const sansScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const balises = sansScript.match(/<([a-zA-Z][a-zA-Z0-9-]*)\b/g) ?? [];
  return balises.length;
}

/** Les ressources chargees par la page : styles, scripts, images, polices. */
async function ressources(html, distDir) {
  const trouvees = new Set();

  for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"]+\.(?:css|js))"/g)) {
    trouvees.add(url);
  }
  for (const [, url] of html.matchAll(/<img[^>]+src="(\/[^"]+)"/g)) {
    trouvees.add(url);
  }
  // Le navigateur ne telecharge qu'une source par <picture> : l'AVIF gagne,
  // et le repli, quel que soit son format, n'est jamais demande.
  for (const [, url] of html.matchAll(/<source[^>]+srcset="(\/[^"]+\.avif)"/g)) {
    trouvees.add(url);
    for (const repli of ['.jpg', '.jpeg', '.webp', '.png']) {
      trouvees.delete(url.replace(/\.avif$/, repli));
    }
  }

  // Les polices sont appelees depuis les feuilles de style, et seul le
  // sous-ensemble latin est telecharge en pratique.
  for (const feuille of [...trouvees].filter((u) => u.endsWith('.css'))) {
    const css = await readFile(join(distDir, feuille), 'utf-8').catch(() => '');
    for (const [, url] of css.matchAll(/url\(([^)]+\.woff2)\)/g)) {
      if (/latin-(?:wght|full|standard)/.test(url) && !url.includes('latin-ext')) {
        trouvees.add(url.replace(/^["']|["']$/g, ''));
      }
    }
  }
  return [...trouvees];
}

/** Poids reellement transfere : gzip pour le texte, tel quel pour le binaire. */
async function poids(chemin) {
  const brut = await readFile(chemin);
  return /\.(css|js|html|svg|json|xml)$/.test(chemin)
    ? gzipSync(brut, { level: 9 }).length
    : brut.length;
}

export async function mesurer(page, distDir = 'dist') {
  const fichier = page === '/'
    ? join(distDir, 'index.html')
    : join(distDir, page.replace(/^\/|\/$/g, ''), 'index.html');

  const html = await readFile(fichier, 'utf-8');
  const liens = await ressources(html, distDir);

  let octets = gzipSync(Buffer.from(html), { level: 9 }).length;
  for (const lien of liens) {
    octets += await poids(join(distDir, lien)).catch(() => 0);
  }

  const noeuds = compterNoeuds(html);
  const requetes = liens.length + 1;
  const ko = octets / 1024;

  const score = 100 - (5 * (3 * rang(QUANTILES_DOM, noeuds)
    + 2 * rang(QUANTILES_REQ, requetes)
    + rang(QUANTILES_KO, ko))) / 6;

  return {
    page,
    noeuds,
    requetes,
    ko: Math.round(ko),
    score: Math.round(score * 10) / 10,
    note: noteDe(score),
  };
}

/** Appel direct : `node scripts/ecoindex.mjs` affiche le tableau complet. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = 'dist';
  const pages = [];
  for (const entree of await readdir(dist, { withFileTypes: true })) {
    if (entree.isDirectory() && !entree.name.startsWith('_')) {
      const index = join(dist, entree.name, 'index.html');
      if (await stat(index).then(() => true).catch(() => false)) {
        pages.push(`/${entree.name}/`);
      }
    }
  }
  const toutes = ['/', ...pages.sort()];

  console.log('page'.padEnd(26), 'noeuds  requetes   poids   score  note');
  for (const page of toutes) {
    const m = await mesurer(page, dist);
    console.log(
      m.page.padEnd(26),
      String(m.noeuds).padStart(6),
      String(m.requetes).padStart(9),
      String(m.ko + ' Ko').padStart(8),
      String(m.score).padStart(7),
      '  ' + m.note
    );
  }
}
