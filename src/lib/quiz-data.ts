/**
 * Questions et textes du bilan.
 * Isoles du composant pour que le rendu, le controleur et les tests
 * s'appuient sur une seule et meme source.
 */
import type { AxisCopy, AxisKey } from './quiz-scoring';

export interface Choice {
  label: string;
  score: 0 | 1 | 2;
}

export interface Question {
  id: string;
  label: string;
  axis: AxisKey;
  choices: Choice[];
}

export interface Step {
  title: string;
  intro: string;
  questions: Question[];
}

/** Nombre d'etapes du formulaire : les questions, le contexte, puis le compte rendu. */
export const TOTAL_STEPS = 7;

const never: Choice[] = [
  { label: 'Jamais ou presque', score: 0 },
  { label: 'De temps en temps', score: 1 },
  { label: 'Souvent', score: 2 },
];

export const steps: Step[] = [
  {
    title: 'Énergie et sommeil',
    intro: "On commence par le carburant : la façon dont vous récupérez.",
    questions: [
      {
        id: 'sommeil',
        label: 'Est-ce que vous dormez bien ?',
        axis: 'energie',
        choices: [
          { label: 'Oui, je récupère', score: 0 },
          { label: 'Moyennement', score: 1 },
          { label: 'Non, mon sommeil est difficile', score: 2 },
        ],
      },
      {
        id: 'fatigue-reveil',
        label: 'Vous vous sentez fatigué au réveil ?',
        axis: 'energie',
        choices: never,
      },
      {
        id: 'fatigue-journee',
        label: 'Et dans la journée ?',
        axis: 'energie',
        choices: [
          { label: 'Je tiens la journée', score: 0 },
          { label: 'Un creux en début d’après-midi', score: 1 },
          { label: 'Une fatigue qui dure toute la journée', score: 2 },
        ],
      },
      {
        id: 'sieste',
        label: 'Avez-vous besoin d’une sieste ?',
        axis: 'energie',
        choices: [
          { label: 'Non', score: 0 },
          { label: 'Parfois le week-end', score: 1 },
          { label: 'Presque tous les jours', score: 2 },
        ],
      },
    ],
  },
  {
    title: 'Douleurs et confort',
    intro: 'Les gênes qu’on finit par trouver normales.',
    questions: [
      {
        id: 'articulations',
        label: 'Avez-vous des douleurs articulaires ?',
        axis: 'inflammation',
        choices: never,
      },
      {
        id: 'muscles',
        label: 'Des douleurs musculaires ou des raideurs ?',
        axis: 'inflammation',
        choices: never,
      },
      {
        id: 'maux-de-tete',
        label: 'Des maux de tête ?',
        axis: 'inflammation',
        choices: never,
      },
      {
        id: 'frilosite',
        label: 'Êtes-vous frileux ?',
        axis: 'inflammation',
        choices: [
          { label: 'Pas particulièrement', score: 0 },
          { label: 'Un peu plus que la moyenne', score: 1 },
          { label: 'Oui, j’ai souvent froid', score: 2 },
        ],
      },
    ],
  },
  {
    title: 'Digestion et élimination',
    intro: 'Le sujet dont on parle peu, et qui pèse tous les jours.',
    questions: [
      {
        id: 'digestion',
        label: 'Est-ce que vous digérez bien ?',
        axis: 'digestion',
        choices: [
          { label: 'Oui, sans y penser', score: 0 },
          { label: 'Cela dépend des repas', score: 1 },
          { label: 'Non, c’est souvent lourd', score: 2 },
        ],
      },
      {
        id: 'douleurs-digestives',
        label: 'Ballonnements ou douleurs après les repas ?',
        axis: 'digestion',
        choices: never,
      },
      {
        id: 'elimination',
        label: 'Est-ce que vous éliminez bien ?',
        axis: 'digestion',
        choices: [
          { label: 'Transit régulier', score: 0 },
          { label: 'Irrégulier', score: 1 },
          { label: 'Constipation ou épisodes difficiles', score: 2 },
        ],
      },
    ],
  },
  {
    title: 'Peau, cheveux et poids',
    intro: 'Ce que les cellules montrent en surface.',
    questions: [
      {
        id: 'peau',
        label: 'Votre peau est-elle sèche ?',
        axis: 'cellules',
        choices: [
          { label: 'Non', score: 0 },
          { label: 'Par périodes', score: 1 },
          { label: 'Oui, en permanence', score: 2 },
        ],
      },
      {
        id: 'cheveux',
        label: 'Vos cheveux ou vos ongles sont-ils fragiles ?',
        axis: 'cellules',
        choices: [
          { label: 'Non', score: 0 },
          { label: 'Un peu', score: 1 },
          { label: 'Oui, nettement', score: 2 },
        ],
      },
      {
        id: 'poids',
        label: 'Avez-vous des kilos que vous aimeriez perdre ?',
        axis: 'cellules',
        choices: [
          { label: 'Non, mon poids me convient', score: 0 },
          { label: 'Quelques-uns', score: 1 },
          { label: 'Oui, et ils ne bougent pas', score: 2 },
        ],
      },
    ],
  },
  {
    title: 'Moral et mouvement',
    intro: "Ces deux-là avancent presque toujours ensemble.",
    questions: [
      {
        id: 'moral',
        label: 'Avez-vous bon moral en ce moment ?',
        axis: 'moral',
        choices: [
          { label: 'Oui, globalement', score: 0 },
          { label: 'En dents de scie', score: 1 },
          { label: 'Non, c’est difficile', score: 2 },
        ],
      },
      {
        id: 'bien-etre',
        label: 'Vous sentez-vous bien dans votre vie quotidienne ?',
        axis: 'moral',
        choices: [
          { label: 'Oui', score: 0 },
          { label: 'Partiellement', score: 1 },
          { label: 'Pas vraiment', score: 2 },
        ],
      },
      {
        id: 'activite',
        label: 'Avez-vous une activité physique régulière ?',
        axis: 'moral',
        choices: [
          { label: 'Oui, au moins trois fois par semaine', score: 0 },
          { label: 'Une à deux fois par semaine', score: 1 },
          { label: 'Rarement ou jamais', score: 2 },
        ],
      },
    ],
  },
];

export const axes: AxisCopy[] = [
  {
    key: 'energie',
    name: 'Énergie et récupération',
    high: "Votre sommeil ne joue plus son rôle de réparation. C'est le premier point sur lequel travailler, parce qu'il conditionne tous les autres : on ne change pas ses habitudes alimentaires en étant épuisé.",
    low: 'Votre récupération tient la route. C’est un appui solide pour le reste.',
  },
  {
    key: 'inflammation',
    name: 'Douleurs et terrain inflammatoire',
    high: "Douleurs diffuses, maux de tête et frilosité dessinent ensemble un terrain qu'il vaut la peine de mesurer. C'est exactement ce que regarde un bilan en acides gras.",
    low: 'Peu de signaux de ce côté, et c’est une bonne nouvelle.',
  },
  {
    key: 'digestion',
    name: 'Digestion et élimination',
    high: "Votre digestion demande de l'attention. C'est souvent là que les résultats arrivent le plus vite, parce que les leviers sont concrets et se voient en quelques semaines.",
    low: 'Votre digestion ne vous encombre pas au quotidien.',
  },
  {
    key: 'cellules',
    name: 'Peau, cheveux et poids',
    high: "Une peau sèche, des cheveux fragiles et un poids qui ne bouge pas malgré vos efforts : ces trois signes parlent de la qualité des matériaux disponibles pour vos cellules.",
    low: 'Rien d’alarmant sur ce terrain.',
  },
  {
    key: 'moral',
    name: 'Moral et activité',
    high: "Le moral et le mouvement se tirent l'un l'autre, dans les deux sens. Remettre un peu d'activité, même modeste, est souvent le levier le plus rentable.",
    low: 'Votre moral et votre activité physique vous soutiennent.',
  },
];
