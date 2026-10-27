import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FunnelQuiz from '../src/components/FunnelQuiz.astro';
import { initFunnel, type FunnelOptions } from '../src/lib/quiz-controller';
import { axes, steps } from '../src/lib/quiz-data';

/** Le composant est rendu une seule fois : son HTML ne depend d'aucune entree. */
const markup = await (await AstroContainer.create()).renderToString(FunnelQuiz);

const QUESTION_STEPS = steps.length;
const CONTEXT_STEP = QUESTION_STEPS;

interface Harness {
  root: HTMLElement;
  sections: HTMLElement[];
  next: HTMLButtonElement;
  back: HTMLButtonElement;
  report: HTMLElement;
  form: HTMLFormElement;
  capture: HTMLFormElement;
  status: HTMLElement;
  send: ReturnType<typeof vi.fn>;
  openMail: ReturnType<typeof vi.fn>;
}

function mount(overrides: Partial<FunnelOptions> = {}): Harness {
  // Les balises <script> du composant pointent vers le paquet construit :
  // elles n'ont rien a faire ici, le controleur est appele directement.
  document.body.innerHTML = markup.replace(
    /<script[\s\S]*?<\/script>/g,
    ''
  );

  const send = vi.fn(async () => new Response('', { status: 200 }));
  const openMail = vi.fn();
  const root = document.querySelector<HTMLElement>('[data-funnel]')!;

  initFunnel(root, {
    axes,
    leadEndpoint: null,
    fallbackEmail: 'contact@example.ch',
    hasCalendly: false,
    send: send as unknown as typeof fetch,
    openMail,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });

  const query = <T extends Element>(selector: string) =>
    root.querySelector<T>(selector)!;

  return {
    root,
    sections: [...root.querySelectorAll<HTMLElement>('[data-funnel-step]')],
    next: query<HTMLButtonElement>('[data-funnel-next]'),
    back: query<HTMLButtonElement>('[data-funnel-back]'),
    report: query<HTMLElement>('[data-funnel-report]'),
    form: query<HTMLFormElement>('[data-funnel-form]'),
    capture: query<HTMLFormElement>('[data-capture]'),
    status: query<HTMLElement>('[data-capture-status]'),
    send,
    openMail,
  };
}

/** Repond a toutes les questions obligatoires d'une etape. */
function answerStep(h: Harness, index: number, pick: 'neutre' | 'marquee') {
  const step = h.sections[index];
  const names = new Set(
    [
      ...step.querySelectorAll<HTMLInputElement>(
        'input[type="radio"][required]'
      ),
    ].map((input) => input.name)
  );

  for (const name of names) {
    const options = step.querySelectorAll<HTMLInputElement>(
      `input[name="${name}"]`
    );
    const chosen = pick === 'neutre' ? options[0] : options[options.length - 1];
    chosen.checked = true;
  }

  h.form.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Parcourt tout le questionnaire jusqu'au compte rendu. */
function completeAll(h: Harness, pick: 'neutre' | 'marquee') {
  for (let i = 0; i < QUESTION_STEPS; i++) {
    answerStep(h, i, pick);
    h.next.click();
  }
  // L'etape de contexte ne comporte aucune question obligatoire
  h.next.click();
}

function fillCapture(
  h: Harness,
  {
    consent = true,
    prenom = 'Camille',
    email = 'camille@example.ch',
    telephone = '+41 79 000 00 00',
  } = {}
) {
  h.capture.querySelector<HTMLInputElement>('[name="prenom"]')!.value = prenom;
  h.capture.querySelector<HTMLInputElement>('[name="telephone"]')!.value =
    telephone;
  h.capture.querySelector<HTMLInputElement>('[name="email"]')!.value = email;
  h.capture.querySelector<HTMLInputElement>('[name="consentement"]')!.checked =
    consent;
}

describe('navigation entre les etapes', () => {
  let h: Harness;
  beforeEach(() => {
    h = mount();
  });

  it('affiche la premiere etape, sans retour possible', () => {
    expect(h.sections[0].hidden).toBe(false);
    expect(h.sections[1].hidden).toBe(true);
    expect(h.back.hidden).toBe(true);
  });

  it('verrouille le bouton tant que l’etape est incomplete', () => {
    expect(h.next.disabled).toBe(true);
  });

  it('reste verrouille quand une seule question est repondue', () => {
    const first = h.sections[0].querySelector<HTMLInputElement>(
      'input[type="radio"]'
    )!;
    first.checked = true;
    h.form.dispatchEvent(new Event('change', { bubbles: true }));

    expect(h.next.disabled).toBe(true);
  });

  it('deverrouille une fois l’etape complete, puis avance', () => {
    answerStep(h, 0, 'neutre');
    expect(h.next.disabled).toBe(false);

    h.next.click();
    expect(h.sections[0].hidden).toBe(true);
    expect(h.sections[1].hidden).toBe(false);
    expect(h.back.hidden).toBe(false);
  });

  it('revient a l’etape precedente en conservant les reponses', () => {
    answerStep(h, 0, 'marquee');
    h.next.click();
    h.back.click();

    expect(h.sections[0].hidden).toBe(false);
    expect(
      h.sections[0].querySelector('input[type="radio"]:checked')
    ).not.toBeNull();
    expect(h.next.disabled).toBe(false);
  });

  it('annonce la derniere etape par un libelle different', () => {
    for (let i = 0; i < CONTEXT_STEP; i++) {
      answerStep(h, i, 'neutre');
      h.next.click();
    }
    expect(h.next.textContent?.trim()).toBe('Voir mon compte rendu');
  });

  it('fait progresser le compteur et la barre', () => {
    const counter = h.root.querySelector('[data-funnel-current]')!;
    const fill = h.root.querySelector<HTMLElement>('[data-funnel-fill]')!;

    expect(counter.textContent).toBe('1');
    const atStart = parseFloat(fill.style.width);

    answerStep(h, 0, 'neutre');
    h.next.click();

    expect(counter.textContent).toBe('2');
    expect(parseFloat(fill.style.width)).toBeGreaterThan(atStart);
  });
});

describe('compte rendu', () => {
  it('remplace le formulaire une fois le parcours termine', () => {
    const h = mount();
    completeAll(h, 'neutre');

    expect(h.form.hidden).toBe(true);
    expect(h.report.hidden).toBe(false);
  });

  it('annonce un terrain solide quand tout est au vert', () => {
    const h = mount();
    completeAll(h, 'neutre');

    expect(
      h.root.querySelector('[data-report-title]')!.textContent
    ).toBe('Un terrain déjà solide');
    expect(h.root.querySelectorAll('.report__axis')).toHaveLength(1);
  });

  it('commente les cinq axes quand tout est au rouge', () => {
    const h = mount();
    completeAll(h, 'marquee');

    expect(
      h.root.querySelector('[data-report-title]')!.textContent
    ).toContain('plusieurs signaux');
    expect(h.root.querySelectorAll('.report__axis')).toHaveLength(axes.length);
    expect(
      [...h.root.querySelectorAll('.report__level')].map((el) => el.textContent)
    ).toEqual(Array(axes.length).fill('100 %'));
  });

  it('masque l’avertissement cardiovasculaire par defaut', () => {
    const h = mount();
    completeAll(h, 'marquee');

    expect(h.root.querySelector<HTMLElement>('[data-report-cardio]')!.hidden).toBe(
      true
    );
  });

  it('affiche l’avertissement quand des antecedents sont declares', () => {
    const h = mount();
    for (let i = 0; i < QUESTION_STEPS; i++) {
      answerStep(h, i, 'neutre');
      h.next.click();
    }
    h.sections[CONTEXT_STEP]
      .querySelector<HTMLInputElement>('input[data-flag="cardio"]')!
      .checked = true;
    h.next.click();

    expect(h.root.querySelector<HTMLElement>('[data-report-cardio]')!.hidden).toBe(
      false
    );
  });

  it('remet tout a zero quand on recommence', () => {
    const h = mount();
    completeAll(h, 'marquee');
    h.root.querySelector<HTMLButtonElement>('[data-funnel-restart]')!.click();

    expect(h.report.hidden).toBe(true);
    expect(h.form.hidden).toBe(false);
    expect(h.sections[0].hidden).toBe(false);
    expect(h.next.disabled).toBe(true);
    expect(
      h.sections[0].querySelector('input[type="radio"]:checked')
    ).toBeNull();
  });
});

describe('consentement et envoi', () => {
  it('n’envoie rien sans la case de consentement', async () => {
    const h = mount({ leadEndpoint: 'https://exemple.test/bilans' });
    completeAll(h, 'marquee');
    fillCapture(h, { consent: false });

    h.capture.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();

    expect(h.send).not.toHaveBeenCalled();
    expect(h.status.hidden).toBe(false);
    expect(h.status.dataset.state).toBe('error');
  });

  it('n’envoie rien sans adresse e-mail', async () => {
    const h = mount({ leadEndpoint: 'https://exemple.test/bilans' });
    completeAll(h, 'marquee');
    fillCapture(h, { email: '' });

    h.capture.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();

    expect(h.send).not.toHaveBeenCalled();
    expect(h.status.dataset.state).toBe('error');
  });

  /*
   * Le formulaire promet un rappel telephonique : partir sans numero reviendrait
   * a promettre ce qu'on ne peut pas tenir.
   */
  it('n’envoie rien sans numero de telephone', async () => {
    const h = mount({ leadEndpoint: 'https://exemple.test/bilans' });
    completeAll(h, 'marquee');
    fillCapture(h, { telephone: '  ' });

    h.capture.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();

    expect(h.send).not.toHaveBeenCalled();
    expect(h.status.dataset.state).toBe('error');
  });

  it('n’envoie rien quand le prenom est vide', async () => {
    const h = mount({ leadEndpoint: 'https://exemple.test/bilans' });
    completeAll(h, 'marquee');
    fillCapture(h, { prenom: '   ' });

    h.capture.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();

    expect(h.send).not.toHaveBeenCalled();
  });

  it('transmet le bilan complet quand tout est renseigne', async () => {
    const h = mount({ leadEndpoint: 'https://exemple.test/bilans' });
    completeAll(h, 'marquee');
    fillCapture(h);

    h.capture.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(h.status.dataset.state).toBe('ok'));

    expect(h.send).toHaveBeenCalledTimes(1);
    const [url, init] = h.send.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://exemple.test/bilans');
    expect(init.method).toBe('POST');

    const payload = JSON.parse(String(init.body));
    expect(payload.prenom).toBe('Camille');
    expect(payload.email).toBe('camille@example.ch');
    expect(payload.synthese).toHaveLength(axes.length);
    expect(payload.reponses.length).toBeGreaterThanOrEqual(
      steps.reduce((n, step) => n + step.questions.length, 0)
    );
  });

  it('bascule sur la messagerie quand aucun service n’est configure', async () => {
    const h = mount({ leadEndpoint: null });
    completeAll(h, 'marquee');
    fillCapture(h);

    h.capture.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();

    expect(h.send).not.toHaveBeenCalled();
    expect(h.openMail).toHaveBeenCalledTimes(1);

    const href = h.openMail.mock.calls[0][0] as string;
    expect(href.startsWith('mailto:contact@example.ch')).toBe(true);
    expect(decodeURIComponent(href)).toContain('Camille');
    expect(h.status.dataset.state).toBe('ok');
  });

  it('signale un echec et laisse reessayer', async () => {
    const h = mount({ leadEndpoint: 'https://exemple.test/bilans' });
    h.send.mockResolvedValue(new Response('', { status: 500 }));
    completeAll(h, 'marquee');
    fillCapture(h);

    h.capture.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(h.status.dataset.state).toBe('error'));

    const submit = h.capture.querySelector<HTMLButtonElement>(
      '[data-capture-submit]'
    )!;
    expect(submit.disabled).toBe(false);
    expect(h.status.textContent).toContain('contact@example.ch');
  });
});
