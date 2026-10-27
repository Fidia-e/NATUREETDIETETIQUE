/**
 * Pilotage du bilan dans la page : navigation entre les etapes, compte rendu,
 * puis envoi.
 *
 * Le reseau et la navigation passent par des dependances injectables, ce qui
 * permet de verifier le parcours complet sans serveur ni client de messagerie.
 */
import {
  headlineFor,
  levelFor,
  overallRatio,
  payloadToText,
  scoreAnswers,
  visibleAxes,
  type Answer,
  type AxisCopy,
  type AxisKey,
  type LeadPayload,
  type ScoredAxis,
} from './quiz-scoring';

export interface FunnelOptions {
  axes: AxisCopy[];
  /** URL qui accepte un POST JSON, ou null pour passer par la messagerie. */
  leadEndpoint: string | null;
  /** Adresse de repli, utilisee quand aucune URL n'est configuree. */
  fallbackEmail: string;
  hasCalendly: boolean;
  /** Remplacable dans les tests. */
  send?: typeof fetch;
  /** Ouverture du client de messagerie, remplacable dans les tests. */
  openMail?: (href: string) => void;
  now?: () => Date;
}

export interface Snapshot {
  scored: ScoredAxis[];
  overall: number;
  answers: { question: string; reponse: string }[];
  cardio: boolean;
}

/** Releve l'etat du formulaire : scores par axe, reponses lisibles, signalements. */
export function collect(
  sections: HTMLElement[],
  axes: AxisCopy[]
): Snapshot {
  const scorable: Answer[] = [];
  const answers: { question: string; reponse: string }[] = [];
  let cardio = false;

  for (const section of sections) {
    for (const group of section.querySelectorAll('fieldset.question')) {
      const inputs = [
        ...group.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
      ];
      const checked = inputs.find((input) => input.checked);
      const legend = group.querySelector('legend')?.textContent?.trim() ?? '';

      if (checked?.dataset.flag === 'cardio') cardio = true;
      if (checked) {
        answers.push({ question: legend, reponse: checked.dataset.label ?? '' });
      }

      const axis = inputs[0]?.dataset.axis as AxisKey | undefined;
      if (!axis) continue;

      scorable.push({ axis, score: Number(checked?.dataset.score ?? 0) });
    }

    for (const field of section.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement
    >('input[type="number"], textarea')) {
      const label = field
        .closest('.field')
        ?.querySelector('span')
        ?.textContent?.trim();
      if (field.value.trim() && label) {
        answers.push({ question: label, reponse: field.value.trim() });
      }
    }
  }

  const scored = scoreAnswers(scorable, axes);
  return { scored, overall: overallRatio(scored), answers, cardio };
}

/** Une etape est franchissable quand chaque groupe obligatoire a une reponse. */
export function isComplete(step: HTMLElement): boolean {
  const names = new Set(
    [
      ...step.querySelectorAll<HTMLInputElement>(
        'input[type="radio"][required]'
      ),
    ].map((input) => input.name)
  );

  // Les noms viennent des identifiants de quiz-data, qui sont des mots simples
  return [...names].every((name) =>
    step.querySelector(`input[name="${name}"]:checked`)
  );
}

export function initFunnel(root: HTMLElement, options: FunnelOptions): void {
  const {
    axes,
    leadEndpoint,
    fallbackEmail,
    hasCalendly,
    send = globalThis.fetch?.bind(globalThis),
    openMail = (href: string) => {
      window.location.href = href;
    },
    now = () => new Date(),
  } = options;

  const query = <T extends Element>(selector: string) =>
    root.querySelector<T>(selector)!;

  const form = query<HTMLFormElement>('[data-funnel-form]');
  const sections = [
    ...root.querySelectorAll<HTMLElement>('[data-funnel-step]'),
  ];
  const report = query<HTMLElement>('[data-funnel-report]');
  const next = query<HTMLButtonElement>('[data-funnel-next]');
  const back = query<HTMLButtonElement>('[data-funnel-back]');
  const restart = query<HTMLButtonElement>('[data-funnel-restart]');
  const counter = query<HTMLElement>('[data-funnel-current]');
  const bar = query<HTMLElement>('[data-funnel-bar]');
  const fill = query<HTMLElement>('[data-funnel-fill]');
  const error = query<HTMLElement>('[data-funnel-error]');
  const capture = query<HTMLFormElement>('[data-capture]');
  const status = query<HTMLElement>('[data-capture-status]');
  const submit = query<HTMLButtonElement>('[data-capture-submit]');

  // Les etapes de questions, le contexte, puis le compte rendu
  const total = sections.length + 1;
  let index = 0;
  let snapshot: Snapshot | null = null;

  const render = () => {
    sections.forEach((section, position) => {
      section.hidden = position !== index;
    });

    counter.textContent = String(index + 1);
    bar.setAttribute('aria-valuenow', String(index + 1));
    fill.style.width = `${((index + 1) / total) * 100}%`;

    back.hidden = index === 0;
    next.textContent =
      index === sections.length - 1 ? 'Voir mon compte rendu' : 'Continuer';
    next.disabled = !isComplete(sections[index]);
    error.hidden = true;
  };

  const showReport = () => {
    snapshot = collect(sections, axes);
    const headline = headlineFor(snapshot.overall);

    query<HTMLElement>('[data-report-title]').textContent = headline.title;
    query<HTMLElement>('[data-report-intro]').textContent = headline.intro;

    // La conclusion depend du profil : on la repose a chaque passage
    const conclusion = query<HTMLElement>('[data-report-conclusion]');
    conclusion.replaceChildren(
      ...headline.conclusion.map((texte) => {
        const p = document.createElement('p');
        p.textContent = texte;
        return p;
      })
    );

    const list = query<HTMLElement>('[data-report-axes]');
    list.replaceChildren();

    for (const axis of visibleAxes(snapshot.scored)) {
      const percent = Math.round(axis.ratio * 100);
      const item = document.createElement('li');
      item.className = 'report__axis';
      item.innerHTML = `
        <div class="report__axis-head">
          <h3></h3>
          <span class="report__level" data-level="${levelFor(axis.ratio)}">${percent} %</span>
        </div>
        <div class="report__meter"><span style="width:${percent}%"></span></div>
        <p></p>
      `;
      // Les textes passent par textContent : ils ne sont jamais interpretes
      item.querySelector('h3')!.textContent = axis.name;
      item.querySelector('p')!.textContent =
        axis.ratio >= 0.34 ? axis.high : axis.low;
      list.append(item);
    }

    query<HTMLElement>('[data-report-cardio]').hidden = !snapshot.cardio;

    form.hidden = true;
    report.hidden = false;
    report.focus();
  };

  form.addEventListener('change', () => {
    next.disabled = !isComplete(sections[index]);
  });

  next.addEventListener('click', () => {
    if (!isComplete(sections[index])) {
      error.hidden = false;
      return;
    }
    if (index === sections.length - 1) {
      showReport();
      return;
    }
    index += 1;
    render();
  });

  back.addEventListener('click', () => {
    if (index === 0) return;
    index -= 1;
    render();
  });

  restart.addEventListener('click', () => {
    form.reset();
    index = 0;
    report.hidden = true;
    form.hidden = false;
    status.hidden = true;
    submit.disabled = false;
    render();
  });

  capture.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = new FormData(capture);
    const prenom = String(data.get('prenom') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const telephone = String(data.get('telephone') ?? '').trim();

    // Donnees de sante : rien ne part sans consentement explicite
    if (
      !prenom ||
      !email ||
      !telephone ||
      !data.get('consentement') ||
      !snapshot
    ) {
      status.hidden = false;
      status.dataset.state = 'error';
      status.textContent =
        'Merci de renseigner votre prénom, votre téléphone, votre e-mail et de cocher le consentement.';
      return;
    }

    const payload: LeadPayload = {
      prenom,
      email,
      telephone,
      envoyeLe: now().toISOString(),
      synthese: snapshot.scored.map((axis) => ({
        axe: axis.name,
        niveau: Math.round(axis.ratio * 100),
      })),
      reponses: snapshot.answers,
    };

    if (!leadEndpoint) {
      // Aucun destinataire configure : on passe par la messagerie du visiteur,
      // ce qui evite de faire transiter des donnees de sante par un tiers.
      openMail(
        `mailto:${fallbackEmail}?subject=${encodeURIComponent(
          'Bilan en ligne'
        )}&body=${encodeURIComponent(payloadToText(payload))}`
      );
      status.hidden = false;
      status.dataset.state = 'ok';
      status.textContent =
        'Votre messagerie vient de s’ouvrir avec le compte rendu : il ne reste qu’à envoyer.';
      return;
    }

    submit.disabled = true;
    status.hidden = false;
    status.dataset.state = 'pending';
    status.textContent = 'Envoi en cours…';

    try {
      const response = await send!(leadEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(String(response.status));

      status.dataset.state = 'ok';
      status.textContent = hasCalendly
        ? 'C’est envoyé. Je vous rappelle sous 48 heures ouvrées, ou réservez vos quinze minutes dès maintenant.'
        : 'C’est envoyé. Je vous rappelle sous 48 heures ouvrées.';
    } catch {
      status.dataset.state = 'error';
      status.textContent = `L’envoi a échoué. Écrivez-moi directement à ${fallbackEmail}.`;
      submit.disabled = false;
    }
  });

  render();
}
