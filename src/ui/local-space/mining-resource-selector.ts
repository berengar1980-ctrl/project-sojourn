import type { LocalSpaceViewModel } from '../../features/local-space/local-space-view-model';

export function toggleMiningResourceSelection(
  current: readonly string[] | null,
  resourceId: string
): readonly string[] | null {
  if (current === null) return [resourceId];
  if (current.includes(resourceId)) {
    const next = current.filter((id) => id !== resourceId);
    return next.length > 0 ? next : null;
  }
  return [...current, resourceId];
}

export class MiningResourceSelector {
  private model: LocalSpaceViewModel | null = null;
  private selection: readonly string[] | null = null;
  private locked = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly onChange: (resourceIds: readonly string[] | null) => void
  ) {
    container.addEventListener('click', (event) => this.handleClick(event));
  }

  update(model: LocalSpaceViewModel, locked: boolean, visible = true): void {
    this.model = model;
    this.selection = model.miningResourceSelection ? [...model.miningResourceSelection] : null;
    this.locked = locked;
    const asteroid = model.selectedAsteroid;
    const deposits =
      asteroid?.scanLevel === 'analyzed'
        ? asteroid.deposits.filter((entry) => entry.resourceId)
        : [];

    if (!visible || !asteroid || deposits.length < 1) {
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
    allButton.classList.toggle('is-active', this.selection === null);
    allButton.disabled = locked;
    choices.append(allButton);

    const selection = this.selection ?? [];
    for (const deposit of deposits) {
      if (!deposit.resourceId) continue;
      const active = selection.includes(deposit.resourceId);
      const depleted = (deposit.estimatedAmount ?? 0) <= 0;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.resourceId = deposit.resourceId;
      button.classList.toggle('is-active', active);
      button.classList.toggle('is-depleted', depleted);
      button.disabled = locked || depleted;
      button.textContent =
        (deposit.resourceName ?? deposit.resourceId).toUpperCase() +
        ' · ~' +
        Math.round(deposit.estimatedAmount ?? 0);
      choices.append(button);
    }

    const hint = document.createElement('div');
    hint.className = 'mining-resource-selector__hint';
    hint.textContent =
      this.selection === null
        ? 'ALLE VORKOMMEN WERDEN GEBORGEN'
        : 'FREIE KOMBINATION · NICHT GEWÄHLTE VORKOMMEN VERLIEREN 50 %';

    this.container.append(title, choices, hint);
  }

  private handleClick(event: Event): void {
    if (this.locked || !this.model) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button');
    if (!(button instanceof HTMLButtonElement) ||
        !this.container.contains(button) || button.disabled) return;

    if (button.dataset.allResources === 'true') {
      this.selection = null;
      this.onChange(null);
      this.container.querySelectorAll<HTMLButtonElement>('[data-resource-id]')
        .forEach((choice) => choice.classList.remove('is-active'));
      this.container.querySelector<HTMLButtonElement>('[data-all-resources]')
        ?.classList.add('is-active');
      return;
    }

    const resourceId = button.dataset.resourceId;
    if (!resourceId) return;

    const next = toggleMiningResourceSelection(this.selection, resourceId);
    this.selection = next;
    this.onChange(next);
    // Mark the choice immediately; HUD updates are throttled at 100ms.
    // The authoritative per-asteroid selection arrives on the next model tick.
    this.container.querySelectorAll<HTMLButtonElement>('[data-resource-id]').forEach((choice) => {
      choice.classList.toggle('is-active', next?.includes(choice.dataset.resourceId ?? '') ?? false);
    });
    this.container.querySelector<HTMLButtonElement>('[data-all-resources]')
      ?.classList.toggle('is-active', next === null);
  }
}
