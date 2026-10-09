let lastYardView: 'ships' | 'components' = 'ships';
let lastYardRole = 'patrol';
let lastYardShipId = '';

export function bindShipyardBrowser(shell: HTMLElement): void {
  const tabs = [...shell.querySelectorAll<HTMLButtonElement>('[data-yard-view]')];
  const sections = [...shell.querySelectorAll<HTMLElement>('[data-yard-section]')];
  const roleSelect = shell.querySelector<HTMLSelectElement>('[data-yard-role-select]');
  const shipSelect = shell.querySelector<HTMLSelectElement>('[data-yard-ship-select]');
  const offers = [...shell.querySelectorAll<HTMLElement>('[data-yard-ship]')];
  const count = shell.querySelector<HTMLElement>('[data-yard-ship-count]');
  const activate = (view: 'ships' | 'components'): void => {
    lastYardView = view;
    for (const button of tabs)
      button.classList.toggle('is-active', button.dataset.yardView === view);
    for (const section of sections) section.hidden = section.dataset.yardSection !== view;
  };
  for (const button of tabs) {
    button.addEventListener('click', () =>
      activate(button.dataset.yardView === 'components' ? 'components' : 'ships')
    );
  }
  activate(lastYardView);
  if (!roleSelect || !shipSelect) return;

  const updateShip = (): void => {
    lastYardShipId = shipSelect.value;
    for (const offer of offers) offer.hidden = offer.dataset.yardShip !== shipSelect.value;
  };
  const updateRole = (): void => {
    lastYardRole = roleSelect.value;
    const filtered = offers.filter((offer) => offer.dataset.yardRole === roleSelect.value);
    shipSelect.replaceChildren();
    for (const offer of filtered) {
      const option = document.createElement('option');
      option.value = offer.dataset.yardShip ?? '';
      option.textContent =
        offer.querySelector<HTMLElement>('.port-yard-preview-label strong')?.textContent ??
        option.value;
      shipSelect.append(option);
    }
    if (filtered.some((offer) => offer.dataset.yardShip === lastYardShipId)) {
      shipSelect.value = lastYardShipId;
    }
    if (count) count.textContent = filtered.length + ' MODELLE';
    updateShip();
  };
  roleSelect.value = lastYardRole;
  roleSelect.addEventListener('change', updateRole);
  shipSelect.addEventListener('change', updateShip);
  updateRole();
}
