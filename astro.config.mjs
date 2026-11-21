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
  vite: {
    /*
     * Le CSS envoye doit garder les proprietes separees. Un moteur qui ne
     * connait pas `inset` ou `place-content` jette la declaration entiere.
     * Or le minifieur regroupe `top / right / bottom / left` en `inset` des
     * que tous les navigateurs vises le comprennent : la correction du 8
     * novembre etait defaite au build [vu le 2026-11-21].
     *
     * Aucun reglage ne l'en empeche : viser un vieux Safari garde `inset`
     * eclate mais fusionne quand meme `place-content`, et remplace les
     * proprietes logiques par leur seul repli. Le CSS part donc tel qu'il est
     * ecrit, sans minification. Le serveur le compresse a l'envoi : l'ecart
     * de poids reste de quelques centaines d'octets par page.
     */
    build: { cssMinify: false },
  },
});
