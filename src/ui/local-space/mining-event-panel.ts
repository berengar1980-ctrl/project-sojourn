import type { MiningEventResolution, MiningEventState } from '../../core/local-space-types';
import type { SystemLogService } from '../../core/system-log-types';
import type { SystemLogPanel } from '../system-log/system-log-panel';

interface MiningEventPanelOptions {
  readonly container: HTMLElement;
  readonly log: SystemLogService;
  readonly logPanel: SystemLogPanel;
  readonly onChoice: (choiceId: string) => MiningEventResolution | null;
}

export interface MiningEventPanel {
  update(event: MiningEventState | null, recoverySeconds: number): void;
}

function buttonForChoice(
  event: MiningEventState,
  choiceId: string,
  options: MiningEventPanelOptions
): HTMLButtonElement {
  const choice = event.choices.find((entry) => entry.id === choiceId);
  if (!choice) throw new Error('Unknown mining event choice: ' + choiceId);

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.risk = choice.risk;
  const label = document.createElement('span');
  label.textContent = choice.label;
  const risk = document.createElement('small');
  risk.className = 'local-mining-event__risk';
  risk.textContent = choice.riskLabel;
  button.append(label, risk);
  button.addEventListener('click', () => {
    const result = options.onChoice(choice.id);
    if (!result) return;
    renderRecovery(options.container, result, null);
    options.log.write('MINING > ' + result.title.toUpperCase());
    options.log.write('MINING > ' + result.resultText);
    options.logPanel.update();
  });
  return button;
}

function renderEvent(event: MiningEventState, options: MiningEventPanelOptions): void {
  const kicker = document.createElement('div');
  kicker.className = 'local-mining-event__kicker';
  kicker.textContent = 'ABBAUEREIGNIS // LIVE';

  const title = document.createElement('h3');
  title.textContent = event.title;
  const description = document.createElement('p');
  description.textContent = event.description;
  const progress = document.createElement('div');
  progress.className = 'local-mining-event__progress';
  progress.textContent = 'ABBAUFORTSCHRITT · ' + Math.round(event.extractionProgress * 100) + ' %';

  const actions = document.createElement('div');
  actions.className = 'local-mining-event__actions';
  for (const choice of event.choices) {
    actions.append(buttonForChoice(event, choice.id, options));
  }

  options.container.replaceChildren(kicker, title, description, progress, actions);
}

function renderRecovery(
  container: HTMLElement,
  result: MiningEventResolution | null,
  seconds: number | null
): void {
  container.hidden = false;
  if (!container.querySelector('.local-mining-event__busy')) {
    const kicker = document.createElement('div');
    kicker.className = 'local-mining-event__kicker';
    kicker.textContent = 'ENTSCHEIDUNG ÜBERMITTELT // VERARBEITUNG';
    const title = document.createElement('h3');
    title.textContent = result?.title ?? 'Bergbausysteme stabilisieren';
    const description = document.createElement('p');
    description.textContent =
      result?.resultText ?? 'Mining wird nach der Systemprüfung fortgesetzt.';
    const busy = document.createElement('div');
    busy.className = 'local-mining-event__busy';
    busy.setAttribute('role', 'status');
    busy.setAttribute('aria-live', 'polite');
    const status = document.createElement('span');
    status.className = 'local-mining-event__remaining';
    const activity = document.createElement('div');
    activity.className = 'local-mining-event__activity';
    activity.setAttribute('aria-hidden', 'true');
    busy.append(status, activity);
    container.replaceChildren(kicker, title, description, busy);
  }
  const remaining = container.querySelector<HTMLElement>('.local-mining-event__remaining');
  if (remaining) {
    remaining.textContent =
      seconds === null
        ? 'ENTSCHEIDUNG WIRD AUSGEFÜHRT…'
        : 'SYSTEME STABILISIEREN · ' + Math.ceil(seconds) + ' s';
  }
}

export function createMiningEventPanel(options: MiningEventPanelOptions): MiningEventPanel {
  let renderedEventId: string | null = null;

  return {
    update(event, recoverySeconds) {
      if (event) {
        options.container.hidden = false;
        if (renderedEventId === event.id) return;
        renderedEventId = event.id;
        renderEvent(event, options);
        options.log.write('MINING > EREIGNIS: ' + event.title.toUpperCase());
        options.logPanel.update();
        return;
      }
      renderedEventId = null;
      if (recoverySeconds > 0) {
        renderRecovery(options.container, null, recoverySeconds);
      } else {
        options.container.hidden = true;
        options.container.replaceChildren();
      }
    },
  };
}
