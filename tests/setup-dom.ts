/**
 * Installe un DOM avant les tests.
 *
 * Vitest tourne en environnement « node » : c'est ce qui permet au conteneur
 * Astro de rendre les composants cote serveur. Le DOM est donc ajoute a la
 * main plutot que par l'option `environment`, qui basculerait la resolution
 * des modules du cote navigateur et casserait le rendu.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
