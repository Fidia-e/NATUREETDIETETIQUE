// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  /*
   * Domaine canonique, donne par Florie. Il sert au sitemap, aux balises
   * canoniques et aux images de partage de chaque page.
   * natureetdietetique.ch existe aussi, mais il redirige ici : il ne doit
   * jamais apparaitre comme adresse officielle d'une page.
   */
  site: 'https://natureetdietetique.com',
  // Le back-office n'a rien a faire dans le plan du site : il demande a rester hors des moteurs.
  integrations: [sitemap({ filter: (page) => !page.endsWith('/admin/') })],
});
