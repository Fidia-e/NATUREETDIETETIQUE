/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// getViteConfig donne a Vitest la meme resolution qu'Astro : les imports
// `.astro` et le rendu par conteneur fonctionnent sans configuration de plus.
export default getViteConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup-dom.ts'],
  },
});
