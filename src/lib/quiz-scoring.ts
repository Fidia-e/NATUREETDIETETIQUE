/**
 * Calcul du compte rendu du bilan.
 * Fonctions pures : elles ne touchent ni au DOM ni au reseau, ce qui permet de
 * les verifier directement et de garder le controleur le plus mince possible.
 */

export type AxisKey = 'energie' | 'inflammation' | 'digestion' | 'cellules' | 'moral';

/** Score maximal d'une question : trois reponses de 0 a 2. */
export const MAX_SCORE_PER_QUESTION = 2;

/** Au-dela de ce rapport, un axe est juge digne d'etre commente. */
export const FLAG_THRESHOLD = 0.34;

/** Au-dela de celui-ci, il est signale comme marque. */
export const STRONG_THRESHOLD = 0.6;

export interface AxisCopy {
  key: AxisKey;
  name: string;
  high: string;
  low: string;
}

/** Une reponse retenue, reduite a ce qui compte pour le score. */
export interface Answer {
  axis: AxisKey;
  score: number;
}

export interface ScoredAxis extends AxisCopy {
  /** Part du maximum atteignable sur cet axe, entre 0 et 1. */
  ratio: number;
}

export type Level = 'faible' | 'moyen' | 'fort';

export interface Headline {
  title: string;
  intro: string;
  /**
   * Conclusion propre au profil, un paragraphe par entree. C'est le texte
   * qu'on lit apres les axes : il remplace l'ancien bloc identique pour tout
   * le monde. Les trois jeux ci-dessous attendent les textes de Florie.
   */
  conclusion: string[];
}

/**
 * Repartit les reponses par axe et ramene chaque total a une part du maximum.
 * Un axe sans aucune reponse reste a zero plutot que de disparaitre : le
 * compte rendu doit pouvoir afficher les cinq axes.
 */
export function scoreAnswers(answers: Answer[], axes: AxisCopy[]): ScoredAxis[] {
  const totals = new Map<AxisKey, number>();
  const maxima = new Map<AxisKey, number>();

  for (const answer of answers) {
    totals.set(answer.axis, (totals.get(answer.axis) ?? 0) + answer.score);
    maxima.set(
      answer.axis,
      (maxima.get(answer.axis) ?? 0) + MAX_SCORE_PER_QUESTION
    );
  }

  return axes
    .map((axis) => {
      const max = maxima.get(axis.key) ?? 0;
      return { ...axis, ratio: max === 0 ? 0 : (totals.get(axis.key) ?? 0) / max };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** Moyenne des axes, qui donne le ton general du compte rendu. */
export function overallRatio(scored: ScoredAxis[]): number {
  if (scored.length === 0) return 0;
  return scored.reduce((sum, axis) => sum + axis.ratio, 0) / scored.length;
}

export function levelFor(ratio: number): Level {
  if (ratio >= STRONG_THRESHOLD) return 'fort';
  if (ratio >= FLAG_THRESHOLD) return 'moyen';
  return 'faible';
}

/**
 * Axes commentes dans le compte rendu.
 * Quand rien ne depasse le seuil, on montre tout de meme le plus haut : une
 * page de resultat vide ne dit rien a personne.
 */
export function visibleAxes(scored: ScoredAxis[]): ScoredAxis[] {
  const flagged = scored.filter((axis) => axis.ratio >= FLAG_THRESHOLD);
  return flagged.length > 0 ? flagged : scored.slice(0, 1);
}

export function headlineFor(overall: number): Headline {
  if (overall < 0.2) {
    return {
      title: 'Un terrain déjà solide',
      intro:
        "Vos réponses décrivent un quotidien plutôt équilibré. Un bilan sanguin reste le seul moyen de vérifier ce qui ne se voit pas, mais rien dans vos réponses n'appelle d'urgence.",
      conclusion: [
        "Vous n'avez rien à réparer dans l'urgence. La question qui se pose à vous est plutôt celle de l'entretien : garder ce terrain-là dans dix ans demande de savoir où vous en êtes aujourd'hui, pas de corriger un problème.",
        "Un test sanguin prend la mesure de ce qui ne se ressent pas encore. C'est le bon moment pour le faire, justement parce que rien ne presse.",
      ],
    };
  }

  if (overall < 0.45) {
    return {
      title: 'Quelques signaux à ne pas laisser s’installer',
      intro:
        "Plusieurs de vos réponses pointent dans la même direction. Pris isolément, ces signes sont banals. Ensemble, ils méritent qu'on regarde de plus près, maintenant plutôt que dans deux ans.",
      conclusion: [
        "Ce que vous décrivez s'installe lentement, et c'est ce qui le rend facile à ignorer. On s'habitue à une digestion lourde, à un réveil difficile, et on finit par les prendre pour son tempérament.",
        "À ce stade, les choses bougent encore vite. Un test sanguin met des chiffres sur ce terrain, et quelques ajustements tenables suffisent souvent à renverser la pente.",
      ],
    };
  }

  return {
    title: 'Votre corps envoie plusieurs signaux',
    intro:
      "Vos réponses décrivent une fatigue et des gênes qui se répondent entre elles. C'est précisément le genre de tableau qui s'explique souvent, se mesure, et sur lequel on peut agir.",
    conclusion: [
      "Rien de ce que vous venez de décrire n'est une fatalité, et rien ne se règle par une liste de conseils génériques. Ce qui se répond entre soi se traite ensemble, pas symptôme par symptôme.",
      "L'étape suivante consiste à mesurer. Un test sanguin met des chiffres sur ce terrain, et à partir de là on construit un plan qui tient dans votre quotidien, pas dans un livre.",
    ],
  };
}

export interface LeadPayload {
  prenom: string;
  email: string;
  /** Numero a rappeler : c'est la demande meme du formulaire. */
  telephone: string;
  envoyeLe: string;
  synthese: { axe: string; niveau: number }[];
  reponses: { question: string; reponse: string }[];
}

/** Mise en forme du bilan pour un corps d'e-mail, quand aucun service n'est configure. */
export function payloadToText(payload: LeadPayload): string {
  return [
    `Prénom : ${payload.prenom}`,
    `Téléphone : ${payload.telephone}`,
    `E-mail : ${payload.email}`,
    '',
    'Synthèse :',
    ...payload.synthese.map((item) => `- ${item.axe} : ${item.niveau} %`),
    '',
    'Réponses :',
    ...payload.reponses.map((item) => `- ${item.question} : ${item.reponse}`),
  ].join('\n');
}
