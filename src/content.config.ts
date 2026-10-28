import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/*
 * Articles du blog : un fichier Markdown par article dans src/content/blog,
 * son image de couverture dans src/content/blog/images.
 *
 * Les limites ne sont pas decoratives : ce sont celles que Google affiche
 * avant de couper. Un article qui les depasse fait echouer le build, plutot
 * que de partir en ligne avec un titre tronque dans les resultats.
 * Le mode d'emploi complet est dans SEO.md.
 */
const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
  schema: ({ image }) =>
    z
      .object({
        // Le titre affiche en haut de l'article (balise h1)
        title: z.string().min(20).max(90),
        /*
         * Le titre pour Google, quand celui de l'article est trop long ou ne
         * contient pas l'expression visee. Sans lui, Google reprend `title`.
         */
        seoTitle: z.string().min(20).max(60).optional(),
        // Le texte gris sous le lien dans Google, et l'extrait de la carte
        description: z.string().min(70).max(160),
        /*
         * L'expression que l'article vise dans Google, telle que les gens la
         * tapent. Elle doit figurer dans le titre Google, la description et
         * le texte : les tests le verifient.
         */
        keyword: z.string().min(3).max(60),
        pubDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        category: z.enum(['Nutrition', 'Recettes', 'Bien-être', 'Décryptage']),
        // Image de couverture facultative ; sa description l'accompagne
        cover: image().optional(),
        coverAlt: z.string().max(200).optional(),
        /*
         * Questions frequentes affichees en fin d'article. Elles reprennent
         * les questions que les gens posent a Google, mot pour mot si
         * possible.
         */
        faq: z
          .array(
            z.object({
              question: z.string().min(10).max(150),
              answer: z.string().min(40).max(600),
            })
          )
          .default([]),
        // La page vers laquelle l'article oriente la lectrice a la fin
        cta: z
          .enum(['bilan', 'accompagnement', 'ateliers', 'rendez-vous'])
          .default('bilan'),
        // Un brouillon reste dans le depot mais n'est jamais mis en ligne
        draft: z.boolean().default(false),
      })
      .refine((data) => !data.cover || (data.coverAlt ?? '').length >= 5, {
        message: 'Une image de couverture demande sa description (coverAlt).',
        path: ['coverAlt'],
      }),
});

export const collections = { blog };
