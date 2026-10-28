import type { APIRoute } from 'astro';

/*
 * Tout le site est ouvert aux moteurs de recherche, et on leur indique ou se
 * trouve le plan du site. Le domaine vient de astro.config.mjs : il n'est
 * ecrit qu'a un seul endroit.
 */
export const GET: APIRoute = ({ site }) =>
  new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap-index.xml', site)}\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  );
