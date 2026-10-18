import { renderOperationEventFeedback } from '../local-operations/event-feedback';
import type { SalvageEventResolution, SalvageEventState } from '../../core/salvage-types';
import type { SystemLogService } from '../../core/system-log-types';
import type { SystemLogPanel } from '../system-log/system-log-panel';

interface SalvageEventPanelOptions {
  readonly container: HTMLElement;
  readonly log: SystemLogService;
  readonly logPanel: SystemLogPanel;
  readonly onChoice: (choiceId: string) => SalvageEventResolution | null;
}

export interface SalvageEventPanel {
  update(event: SalvageEventState | null, recoverySeconds: number): void;
}

function choiceButton(
  event: SalvageEventState,
  choiceId: string,
  options: SalvageEventPanelOptions
): HTMLButtonElement {
  const choice = event.choices.find((entry) => entry.id === choiceId);
  if (!choice) throw new Error('Unknown salvage event choice: ' + choiceId);

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.risk = choice.risk;
  const label = document.createElement('span');
  label.textContent = choice.label;
  const risk = document.createElement('small');
  risk.textContent = choice.riskLabel;
  button.append(label, risk);
  button.addEventListener('click', () => {
    const result = options.onChoice(choice.id);
    if (!result) return;
    renderOperationEventFeedback(options.container, result, null, 'salvage');
    options.log.write('BERGUNG > ' + result.title.toUpperCase());
    options.log.write('BERGUNG > ' + result.resultText);
    options.logPanel.update();
  });
  return button;
}

function render(event: SalvageEventState, options: SalvageEventPanelOptions): void {
  const kicker = document.createElement('div');
  kicker.className = 'salvage-event__kicker';
  kicker.textContent = 'BERGUNGSEREIGNIS // LIVE';

  const title = document.createElement('h3');
  title.textContent = event.title;
  const description = document.createElement('p');
  description.textContent = event.description;
  const actions = document.createElement('div');
  actions.className = 'salvage-event__actions';
  for (const choice of event.choices) {
    actions.append(choiceButton(event, choice.id, options));
  }

  options.container.replaceChildren(kicker, title, description, actions);
}

export function createSalvageEventPanel(options: SalvageEventPanelOptions): SalvageEventPanel {
  let renderedId: string | null = null;
  return {
    update(event, recoverySeconds) {
      options.container.hidden = event === null && recoverySeconds <= 0;
      if (!event) {
        renderedId = null;
        if (recoverySeconds > 0) {
          renderOperationEventFeedback(options.container, null, recoverySeconds, 'salvage');
        } else {
          options.container.replaceChildren();
        }
        return;
      }
      if (renderedId === event.id) return;
      renderedId = event.id;
      render(event, options);
      options.log.write('BERGUNG > EREIGNIS: ' + event.title.toUpperCase());
      options.logPanel.update();
    },
  };
}
