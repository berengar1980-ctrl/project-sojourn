import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';

export class MiningResourceSelector {
  private model: LocalSpaceViewModel | null = null;
  private locked = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly onChange: (resourceIds: readonly string[] | null) => void
  ) {
    container.addEventListener('click', (event) => this.handleClick(event));
  }

  update(model: LocalSpaceViewModel, locked: boolean, visible = true): void {
    this.model = model;
    this.locked = locked;
    const asteroid = model.selectedAsteroid;
    const deposits =
      asteroid?.scanLevel === 'analyzed' ? asteroid.deposits.filter((entry) => entry.resourceId) : [];

    if (!visible || !asteroid || deposits.length < 2) {
      this.container.hidden = true;
      this.container.replaceChildren();
      return;
    }

    this.container.hidden = false;
    this.container.replaceChildren();

    const title = document.createElement('div');
    title.className = 'mining-resource-selector__title';
    title.textContent = 'ABBAU // ZIELRESSOURCEN';

    const choices = document.createElement('div');
    choices.className = 'mining-resource-selector__choices';

    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.dataset.allResources = 'true';
    allButton.textContent = 'ALLE';
    allButton.classList.toggle('is-active', model.miningResourceSelection === null);
    allButton.disabled = locked;
    choices.append(allButton);

    const selection = model.miningResourceSelection ?? [];
    for (const deposit of deposits) {
      if (!deposit.resourceId) continue;
      const active = selection.includes(deposit.resourceId);
      const depleted = (deposit.estimatedAmount ?? 0) <= 0;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.resourceId = deposit.resourceId;
      button.classList.toggle('is-active', active);
      button.classList.toggle('is-depleted', depleted);
      button.disabled = locked || depleted || (!active && selection.length >= 2);
      button.textContent =
        (deposit.resourceName ?? deposit.resourceId).toUpperCase() +
        ' · ~' +
        Math.round(deposit.estimatedAmount ?? 0);
      choices.append(button);
    }

    const hint = document.createElement('div');
    hint.className = 'mining-resource-selector__hint';
    hint.textContent =
      model.miningResourceSelection === null
        ? 'ALLE VORKOMMEN WERDEN GEBORGEN'
        : 'NICHT GEWÄHLT · 50 % SCHWUND · KEINE FRACHT';

    this.container.append(title, choices, hint);
  }

  private handleClick(event: Event): void {
    if (this.locked || !this.model) return;
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || target.disabled) return;

    if (target.dataset.allResources === 'true') {
      this.onChange(null);
      return;
    }

    const resourceId = target.dataset.resourceId;
    if (!resourceId) return;
    const current = this.model.miningResourceSelection;
    if (current === null) {
      this.onChange([resourceId]);
      return;
    }

    if (current.includes(resourceId)) {
      const next = current.filter((id) => id !== resourceId);
      this.onChange(next.length > 0 ? next : null);
      return;
    }

    if (current.length < 2) this.onChange([...current, resourceId]);
  }
}
