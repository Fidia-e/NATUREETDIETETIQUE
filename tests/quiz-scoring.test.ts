import { describe, expect, it } from 'vitest';
import {
  FLAG_THRESHOLD,
  STRONG_THRESHOLD,
  headlineFor,
  levelFor,
  overallRatio,
  payloadToText,
  scoreAnswers,
  visibleAxes,
  type Answer,
  type AxisCopy,
  type ScoredAxis,
} from '../src/lib/quiz-scoring';
import { axes, steps } from '../src/lib/quiz-data';

const fakeAxes: AxisCopy[] = [
  { key: 'energie', name: 'Énergie', high: 'haut energie', low: 'bas energie' },
  { key: 'digestion', name: 'Digestion', high: 'haut digestion', low: 'bas digestion' },
];

const axisWith = (ratio: number): ScoredAxis => ({ ...fakeAxes[0], ratio });

describe('scoreAnswers', () => {
  it('ramene chaque axe a une part de son maximum', () => {
    const answers: Answer[] = [
      { axis: 'energie', score: 2 },
      { axis: 'energie', score: 1 },
      { axis: 'digestion', score: 0 },
    ];

    const scored = scoreAnswers(answers, fakeAxes);
    const byKey = Object.fromEntries(scored.map((a) => [a.key, a.ratio]));

    expect(byKey.energie).toBeCloseTo(3 / 4);
    expect(byKey.digestion).toBe(0);
  });

  it('classe les axes du plus marque au moins marque', () => {
    const scored = scoreAnswers(
      [
        { axis: 'energie', score: 0 },
        { axis: 'digestion', score: 2 },
      ],
      fakeAxes
    );

    expect(scored.map((a) => a.key)).toEqual(['digestion', 'energie']);
  });

  it('garde a zero un axe sans aucune reponse plutot que de le supprimer', () => {
    const scored = scoreAnswers([{ axis: 'energie', score: 2 }], fakeAxes);

    expect(scored).toHaveLength(2);
    expect(scored.find((a) => a.key === 'digestion')?.ratio).toBe(0);
  });

  it('ne renvoie aucun axe quand la liste des axes est vide', () => {
    expect(scoreAnswers([{ axis: 'energie', score: 2 }], [])).toEqual([]);
  });

  it('conserve les textes de chaque axe', () => {
    const scored = scoreAnswers([{ axis: 'energie', score: 1 }], fakeAxes);
    expect(scored[0].high).toBe('haut energie');
    expect(scored[0].low).toBe('bas energie');
  });
});

describe('overallRatio', () => {
  it('fait la moyenne des axes', () => {
    expect(overallRatio([axisWith(1), axisWith(0)])).toBe(0.5);
  });

  it('vaut zero sans aucun axe', () => {
    expect(overallRatio([])).toBe(0);
  });
});

describe('levelFor', () => {
  it('classe selon les deux seuils', () => {
    expect(levelFor(0)).toBe('faible');
    expect(levelFor(FLAG_THRESHOLD - 0.01)).toBe('faible');
    expect(levelFor(FLAG_THRESHOLD)).toBe('moyen');
    expect(levelFor(STRONG_THRESHOLD - 0.01)).toBe('moyen');
    expect(levelFor(STRONG_THRESHOLD)).toBe('fort');
    expect(levelFor(1)).toBe('fort');
  });
});

describe('visibleAxes', () => {
  it('ne retient que les axes au-dessus du seuil', () => {
    const scored = [axisWith(0.8), axisWith(0.4), axisWith(0.1)];
    expect(visibleAxes(scored)).toHaveLength(2);
  });

  it('montre tout de meme le plus haut quand aucun ne depasse le seuil', () => {
    const scored = [axisWith(0.2), axisWith(0.1)];
    const visible = visibleAxes(scored);

    expect(visible).toHaveLength(1);
    expect(visible[0].ratio).toBe(0.2);
  });

  it('ne renvoie rien quand il n’y a aucun axe', () => {
    expect(visibleAxes([])).toEqual([]);
  });
});

describe('headlineFor', () => {
  it('choisit le ton selon le niveau general', () => {
    expect(headlineFor(0).title).toBe('Un terrain déjà solide');
    expect(headlineFor(0.3).title).toContain('Quelques signaux');
    expect(headlineFor(0.9).title).toContain('plusieurs signaux');
  });

  it('bascule exactement aux seuils annonces', () => {
    expect(headlineFor(0.199).title).toBe('Un terrain déjà solide');
    expect(headlineFor(0.2).title).toContain('Quelques signaux');
    expect(headlineFor(0.449).title).toContain('Quelques signaux');
    expect(headlineFor(0.45).title).toContain('plusieurs signaux');
  });

  it('donne toujours un titre et une introduction non vides', () => {
    for (const value of [0, 0.25, 0.5, 1]) {
      const headline = headlineFor(value);
      expect(headline.title.length).toBeGreaterThan(0);
      expect(headline.intro.length).toBeGreaterThan(20);
    }
  });
});

describe('conclusion du compte rendu', () => {
  /*
   * Le texte de fin doit parler du profil du visiteur, pas du bilan en general.
   * Trois paliers, trois conclusions : si deux se ressemblent, c'est que le
   * texte est redevenu generique sans qu'on s'en apercoive.
   */
  it('donne une conclusion propre a chaque palier', () => {
    const paliers = [0.1, 0.3, 0.8].map((n) => headlineFor(n));

    for (const palier of paliers) {
      expect(palier.conclusion.length).toBeGreaterThan(0);
      for (const paragraphe of palier.conclusion) {
        expect(paragraphe.trim().length).toBeGreaterThan(40);
      }
    }

    const textes = paliers.map((p) => p.conclusion.join(' '));
    expect(new Set(textes).size, 'deux paliers partagent la meme conclusion').toBe(
      textes.length
    );
  });
});

describe('payloadToText', () => {
  it('reprend le contact, la synthese et les reponses', () => {
    const text = payloadToText({
      prenom: 'Camille',
      telephone: '+41 79 000 00 00',
      email: 'camille@example.ch',
      envoyeLe: '2026-01-01T00:00:00.000Z',
      synthese: [{ axe: 'Énergie', niveau: 75 }],
      reponses: [{ question: 'Dormez-vous bien ?', reponse: 'Non' }],
    });

    expect(text).toContain('Camille');
    // Le numero est la raison d'etre du formulaire : il doit arriver en clair
    expect(text).toContain('+41 79 000 00 00');
    expect(text).toContain('camille@example.ch');
    expect(text).toContain('- Énergie : 75 %');
    expect(text).toContain('- Dormez-vous bien ? : Non');
  });
});

describe('donnees du questionnaire', () => {
  it('couvre les cinq axes commentes dans le compte rendu', () => {
    const used = new Set(
      steps.flatMap((step) => step.questions.map((q) => q.axis))
    );
    expect([...used].sort()).toEqual(axes.map((a) => a.key).sort());
  });

  it('propose des identifiants de question uniques', () => {
    const ids = steps.flatMap((step) => step.questions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('n\u2019utilise que des identifiants simples, utilisables en selecteur', () => {
    for (const step of steps) {
      for (const question of step.questions) {
        expect(question.id).toMatch(/^[a-z][a-z0-9-]*$/);
      }
    }
  });

  it('offre partout au moins une reponse neutre et une reponse marquee', () => {
    for (const step of steps) {
      for (const question of step.questions) {
        const scores = question.choices.map((c) => c.score);
        expect(Math.min(...scores)).toBe(0);
        expect(Math.max(...scores)).toBe(2);
      }
    }
  });

  it('donne a chaque axe un texte haut et un texte bas distincts', () => {
    for (const axis of axes) {
      expect(axis.high).not.toBe(axis.low);
      expect(axis.high.length).toBeGreaterThan(30);
      expect(axis.low.length).toBeGreaterThan(10);
    }
  });
});
