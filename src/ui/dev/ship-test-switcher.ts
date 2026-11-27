import type { ShipDefinition } from '../../core/ship-types';

export interface ShipTestSwitcher {
  update(activeShipId: string, disabled: boolean): void;
  destroy(): void;
}

interface ShipTestSwitcherOptions {
  readonly root: HTMLElement;
  readonly ships: readonly ShipDefinition[];
  readonly activeShipId: string;
  readonly disabled?: boolean;
  readonly onSelect: (shipId: string) => void;
}

export function createShipTestSwitcher(options: ShipTestSwitcherOptions): ShipTestSwitcher {
  const wrapper = document.createElement('div');
  wrapper.className = 'ship-test-switcher';
  wrapper.innerHTML = [
    '<div class="ship-test-switcher__label">TEST // SCHIFF</div>',
    '<select class="ship-test-switcher__select" aria-label="Testschiff auswählen"></select>',
    '<div class="ship-test-switcher__hint">DEV ONLY</div>',
  ].join('');

  const select = wrapper.querySelector<HTMLSelectElement>('.ship-test-switcher__select');
  if (!select) throw new Error('Ship test switcher is incomplete.');

  for (const ship of options.ships) {
    const option = document.createElement('option');
    option.value = ship.id;
    option.textContent = ship.name;
    select.append(option);
  }

  const update = (activeShipId: string, disabled: boolean): void => {
    const nextDisabled = disabled || options.ships.length < 2;
    if (select.value !== activeShipId) select.value = activeShipId;
    if (select.disabled !== nextDisabled) select.disabled = nextDisabled;
    if (wrapper.classList.contains('is-disabled') !== nextDisabled)
      wrapper.classList.toggle('is-disabled', nextDisabled);
  };

  select.addEventListener('change', () => options.onSelect(select.value));
  update(options.activeShipId, options.disabled === true);
  options.root.append(wrapper);

  return {
    update,
    destroy(): void {
      wrapper.remove();
    },
  };
}
