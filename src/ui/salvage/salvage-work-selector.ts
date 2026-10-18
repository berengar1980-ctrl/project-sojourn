import type { SalvageSpaceViewModel } from '../../features/salvage/salvage-space-view-model';

/** Select a salvage target first, then start one operation; preserve DOM during HUD ticks. */
export class SalvageWorkSelector {
  private model: SalvageSpaceViewModel | null = null;
  private layoutKey: string | null = null;
  private choice: string | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly startButton: HTMLButtonElement,
    private readonly onStrip: (wreckId: string, resourceId: string) => void,
    private readonly onComponent: (wreckId: string) => void
  ) {
    container.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>('button[data-work-choice]');
      if (!button || button.disabled || !container.contains(button)) return;
      this.choice = button.dataset.workChoice ?? null;
      this.refresh();
    });
    startButton.addEventListener('click', () => {
      const wreck = this.model?.selectedWreck;
      if (!wreck || startButton.disabled || !this.choice) return;
      if (this.choice === 'component') {
        this.onComponent(wreck.id);
      } else if (this.choice.startsWith('resource:')) {
        this.onStrip(wreck.id, this.choice.slice('resource:'.length));
      }
    });
  }

  update(model: SalvageSpaceViewModel, visible = true): void {
    this.model = model;
    const wreck = model.selectedWreck;
    if (!visible || !wreck?.inspected) {
      this.container.hidden = true;
      this.startButton.hidden = true;
      this.layoutKey = null;
      this.choice = null;
      return;
    }
    const choices = [
      ...wreck.resources.map((resource) => 'resource:' + resource.resourceId),
      ...(wreck.component ? ['component'] : []),
    ];
    const key = wreck.id + ':' + choices.join('|');
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.choice = choices.find((choice) => this.isAvailable(choice, model)) ?? null;
      const heading = document.createElement('div');
      heading.className = 'mining-resource-selector__title';
      heading.textContent = 'BERGUNG // ZIEL AUSWÄHLEN';
      const buttons = document.createElement('div');
      buttons.className = 'mining-resource-selector__choices';
      for (const choice of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.workChoice = choice;
        buttons.append(button);
      }
      const hint = document.createElement('div');
      hint.className = 'mining-resource-selector__hint';
      hint.textContent = 'MATERIAL ODER KOMPONENTE WÄHLEN · EIN ZIEL PRO VORGANG';
      this.container.replaceChildren(heading, buttons, hint);
    }
    this.container.hidden = false;
    this.startButton.hidden = false;
    this.refresh();
  }

  private isAvailable(choice: string, model: SalvageSpaceViewModel): boolean {
    const wreck = model.selectedWreck;
    if (!wreck) return false;
    if (choice === 'component') return wreck.component?.status === 'available';
    if (!choice.startsWith('resource:')) return false;
    return wreck.resources.some(
      (item) => item.resourceId === choice.slice('resource:'.length) && item.remaining > 0
    );
  }

  private refresh(): void {
    const model = this.model;
    const wreck = model?.selectedWreck;
    if (!model || !wreck || !wreck.inspected) return;
    const busy =
      model.phase !== 'idle' ||
      model.salvageEvent !== null ||
      model.salvageEventRecoverySeconds > 0;
    if (this.choice && !this.isAvailable(this.choice, model)) {
      this.choice =
        [...wreck.resources.map((item) => 'resource:' + item.resourceId), 'component'].find(
          (item) => this.isAvailable(item, model)
        ) ?? null;
    }
    for (const button of this.container.querySelectorAll<HTMLButtonElement>('[data-work-choice]')) {
      const choice = button.dataset.workChoice ?? '';
      const resource = choice.startsWith('resource:')
        ? wreck.resources.find((entry) => entry.resourceId === choice.slice('resource:'.length))
        : null;
      button.textContent =
        choice === 'component' && wreck.component
          ? 'KOMPONENTE · ' +
            wreck.component.name.toUpperCase() +
            ' · ' +
            wreck.component.chancePercent +
            ' %'
          : resource
            ? resource.name.toUpperCase() + ' · ' + Math.round(resource.remaining) + ' t'
            : choice;
      button.disabled = busy || !this.isAvailable(choice, model);
      button.classList.toggle('is-active', choice === this.choice);
      button.setAttribute('aria-pressed', String(choice === this.choice));
    }
    this.startButton.textContent = model.salvageAvailable
      ? busy
        ? 'BERGUNGSSYSTEM BESCHÄFTIGT'
        : 'BERGUNG STARTEN'
      : 'BERGUNGSMODUL FEHLT';
    this.startButton.disabled = busy || !model.salvageAvailable || this.choice === null;
    this.startButton.title = !model.salvageAvailable
      ? 'Dieses Schiff hat kein einsatzfähiges Bergungssystem.'
      : this.choice === null
        ? 'Kein bergbares Material oder keine verfügbare Komponente'
        : '';
  }
}
