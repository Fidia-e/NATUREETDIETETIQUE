/** Donnees de la structure, rassemblees ici pour n'avoir qu'un seul endroit a modifier. */
export const site = {
  name: 'Nature & diététique',
  tagline: 'bien vivre, chaque jour',
  description:
    "Faites le point sur votre équilibre : BalanceTest, état des lieux personnalisé et accompagnement en nutrition pour retrouver énergie et confiance. Florie Deternod, Matran (FR).",
} as const;

export const practitioner = {
  firstName: 'Florie',
  lastName: 'Deternod',
  get fullName() {
    return `${this.firstName} ${this.lastName}`;
  },
} as const;

export const contact = {
  email: 'fdeternod@deternodf.ch',
  phone: '+41 79 552 74 84',
  // Sans espaces ni indicatif local, pour les liens tel:
  phoneLink: '+41795527484',
  address: {
    street: 'Route de la Maison Neuve 5A',
    zip: 'CH-1753',
    city: 'Matran',
    canton: 'Fribourg',
  },
} as const;

/**
 * Lien Calendly du rendez-vous decouverte de 15 minutes.
 * Tant qu'il vaut null, les pages concernees basculent sur le telephone et le
 * formulaire plutot que d'afficher un widget vide.
 */
/**
 * Numero d'identification des entreprises, inscrit au registre du commerce.
 * Mentionne dans les mentions legales, comme l'exige la LCD art. 3 al. 1 let. s.
 */
export const ide = 'CHE-112.041.437';

export const calendlyUrl: string | null =
  'https://calendly.com/fdeternod-deternodf/15minutes-offertes';

/**
 * Video de presentation (2 min 21) sur l'equilibre, servie par Zinzino.
 * C'est leur lecteur integrable : la video reste a jour de leur cote et
 * n'est pas recopiee ici.
 */
export const balanceVideoUrl: string | null =
  'https://www.zinzinoplay.com/embedded/assets/297?language=fr';

/**
 * Destination des bilans remplis dans le quiz.
 * Attendu : une URL qui accepte un POST JSON (Brevo, Formspree, fonction
 * serverless...). Tant qu'elle vaut null, le bilan est envoye par le client de
 * messagerie du visiteur, sans transiter par un tiers.
 */
export const leadEndpoint: string | null = null;

/**
 * Destination du formulaire de contact.
 * Attendu : une URL qui accepte un POST (Formspree, Brevo, fonction
 * serverless...). Renseignee, le formulaire fonctionne meme sans JavaScript,
 * puisque le navigateur poste directement dessus. Tant qu'elle vaut null, le
 * message part par le client de messagerie du visiteur.
 */
export const contactEndpoint: string | null = null;

/**
 * Compteur de tests realises, affiche sur la page entonnoir.
 * Chiffre communique par Zinzino : il avance en permanence, d'ou la date.
 */
export const testsRealises = {
  nombre: 1_889_176,
  releveLe: '2026-10-24',
};

/** Liens vers les partenaires et les boutiques. */
export const links = {
  sonatec: 'https://www.sonatec.com/fr/accueil.php',
  zestalnow: 'http://florie1.zestalnow.com',
  vidyaAyurveda: 'https://vidya-ayurveda.org/heroes-shop/ref/6/',
} as const;

/**
 * Note EcoIndex affichee en pied de page.
 * Mesuree par `npm run eco` sur le site construit, pas estimee a vue. La
 * valeur ci-dessous est la plus basse obtenue sur l'ensemble des pages.
 */
export const ecoIndex = {
  grade: 'A',
  /** Score de la page la moins bien notee, sur 100. */
  worstScore: 82.4,
  measuredOn: '2026-10-24',
} as const;

export const nav = [
  { href: '/bilan/', label: 'Le bilan offert' },
  { href: '/accompagnement/', label: 'Accompagnement' },
  { href: '/ateliers/', label: 'Ateliers' },
  { href: '/mon-histoire/', label: 'Mon histoire' },
  { href: '/blog/', label: 'Conseils' },
  { href: '/contact/', label: 'Contact' },
] as const;
