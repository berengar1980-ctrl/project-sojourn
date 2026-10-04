import type { ShipDefinition } from '../../core/ship-types';

export interface ShipTestSwitcher {
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
    option.selected = ship.id === options.activeShipId;
    select.append(option);
  }

  select.disabled = options.disabled === true || options.ships.length < 2;
  select.addEventListener('change', () => options.onSelect(select.value));

  options.root.append(wrapper);

  return {
    destroy(): void {
      wrapper.remove();
    },
  };
}
