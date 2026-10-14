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

/**
 * Keep resource buttons mounted across frequent HUD updates. Replacing their
 * DOM nodes between pointerdown and pointerup cancels the browser's click,
 * which previously made resource selection require repeated attempts.
 */
export class MiningResourceSelector {
  private model: LocalSpaceViewModel | null = null;
  private selection: readonly string[] | null = null;
  private locked = false;
  private layoutKey: string | null = null;
  private asteroidId: string | null = null;

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
      asteroid?.scanLevel === 'analyzed'
        ? asteroid.deposits.filter((entry) => entry.resourceId)
        : [];

    if (!visible || !asteroid || deposits.length === 0) {
      this.container.hidden = true;
      if (this.layoutKey !== null) this.container.replaceChildren();
      this.layoutKey = null;
      this.asteroidId = null;
      this.selection = null;
      return;
    }

    const key = asteroid.id + ':' + deposits.map((entry) => entry.resourceId).join('|');
    if (this.layoutKey !== key) {
      this.layoutKey = key;
      this.asteroidId = asteroid.id;
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
      choices.append(allButton);

      for (const deposit of deposits) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.resourceId = deposit.resourceId!;
        choices.append(button);
      }

      const hint = document.createElement('div');
      hint.className = 'mining-resource-selector__hint';
      this.container.append(title, choices, hint);
    }

    this.container.hidden = false;
    this.selection = model.miningResourceSelection
      ? [...model.miningResourceSelection]
      : null;
    this.updateButtons(deposits);
  }

  private updateButtons(
    deposits: NonNullable<LocalSpaceViewModel['selectedAsteroid']>['deposits']
  ): void {
    const selected = this.selection ?? [];
    const allButton = this.container.querySelector<HTMLButtonElement>('[data-all-resources]');
    if (allButton) {
      allButton.disabled = this.locked;
      allButton.classList.toggle('is-active', this.selection === null);
    }
    for (const deposit of deposits) {
      if (!deposit.resourceId) continue;
      const button = [...this.container.querySelectorAll<HTMLButtonElement>('[data-resource-id]')]
        .find((item) => item.dataset.resourceId === deposit.resourceId);
      if (!button) continue;
      const depleted = (deposit.estimatedAmount ?? 0) <= 0;
      button.classList.toggle('is-active', selected.includes(deposit.resourceId));
      button.classList.toggle('is-depleted', depleted);
      button.disabled = this.locked || depleted;
      button.textContent = (deposit.resourceName ?? deposit.resourceId).toUpperCase() +
        ' · ~' + Math.round(deposit.estimatedAmount ?? 0);
    }
    const hint = this.container.querySelector<HTMLElement>('.mining-resource-selector__hint');
    if (hint) {
      hint.textContent = this.selection === null
        ? 'ALLE VORKOMMEN WERDEN GEBORGEN'
        : 'FREIE KOMBINATION · NICHT GEWÄHLTE VORKOMMEN VERLIEREN 50 %';
    }
  }

  private handleClick(event: Event): void {
    if (this.locked || !this.model) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('button');
    if (!(button instanceof HTMLButtonElement) ||
        !this.container.contains(button) || button.disabled) return;

    const next = button.dataset.allResources === 'true'
      ? null
      : button.dataset.resourceId
        ? toggleMiningResourceSelection(this.selection, button.dataset.resourceId)
        : this.selection;
    this.selection = next;
    // Update the same existing buttons immediately, without rebuilding the
    // DOM or losing pointer focus. The next game snapshot confirms the choice.
    const deposits = this.model.selectedAsteroid?.deposits ?? [];
    this.updateButtons(deposits);
    this.onChange(next);
  }
}
