export type StarMapMenuSection = 'map' | 'trade' | 'contacts' | 'missions' | 'system';

export interface StarMapMenu {
  readonly mapPane: HTMLElement;
  readonly tradePane: HTMLElement;
  readonly contactsPane: HTMLElement;
  readonly missionsPane: HTMLElement;
  readonly systemPane: HTMLElement;
  activeSection(): StarMapMenuSection | null;
  close(): void;
  destroy(): void;
}

interface MenuDefinition {
  readonly id: StarMapMenuSection;
  readonly label: string;
  readonly icon: string;
}

const MENU_ITEMS: readonly MenuDefinition[] = [
  { id: 'map', label: 'Karte', icon: '<path d="M3 5h18v14H3zM9 5v14m6-14v14"/>' },
  { id: 'trade', label: 'Handel', icon: '<path d="M4 19h16M7 16V9m5 7V5m5 11v-5"/>' },
  { id: 'contacts', label: 'Kontakte', icon: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8h8"/>' },
  { id: 'missions', label: 'Aufträge', icon: '<path d="M5 4h14v17H5zM9 9h6m-6 4h6m-6 4h4"/>' },
  { id: 'system', label: 'System', icon: '<path d="M3 4h18v16H3zM7 9l3 3-3 3m6 0h4"/>' },
];

function createMenuSurface(parent: HTMLElement) {
  const shell = document.createElement('div');
  shell.className = 'star-map-menu';

  const drawer = document.createElement('aside');
  drawer.className = 'star-map-menu__drawer';
  drawer.setAttribute('aria-label', 'Sternkartenmenü');
  drawer.hidden = true;

  const heading = document.createElement('header');
  heading.className = 'star-map-menu__heading';
  const title = document.createElement('strong');
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'star-map-menu__close';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Menü schließen');
  heading.append(title, closeButton);
  drawer.append(heading);

  const nav = document.createElement('nav');
  nav.className = 'star-map-menu__toolbar';
  nav.setAttribute('aria-label', 'Sternkarten-Werkzeuge');

  const panes = new Map<StarMapMenuSection, HTMLElement>();
  const buttons = new Map<StarMapMenuSection, HTMLButtonElement>();

  for (const item of MENU_ITEMS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'star-map-menu__tool';
    button.title = item.label;
    button.setAttribute('aria-label', item.label);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'star-map-pane-' + item.id);
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg><span>${item.label}</span>`;
    buttons.set(item.id, button);
    nav.append(button);

    const pane = document.createElement('section');
    pane.id = 'star-map-pane-' + item.id;
    pane.className = 'star-map-menu__pane';
    pane.setAttribute('aria-label', item.label);
    pane.hidden = true;
    panes.set(item.id, pane);
    drawer.append(pane);
  }

  shell.append(drawer, nav);
  parent.append(shell);

  return { shell, drawer, title, closeButton, panes, buttons };
}

export function createStarMapMenu(
  parent: HTMLElement,
  onSectionChange: (section: StarMapMenuSection | null) => void
): StarMapMenu {
  const { shell, drawer, title, closeButton, panes, buttons } = createMenuSurface(parent);
  let selected: StarMapMenuSection | null = null;
  const setSection = (next: StarMapMenuSection | null): void => {
    if (selected === next) return;
    selected = next;
    drawer.hidden = next === null;
    for (const item of MENU_ITEMS) {
      const active = item.id === next;
      const button = buttons.get(item.id)!;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-expanded', String(active));
      panes.get(item.id)!.hidden = !active;
    }
    const label = MENU_ITEMS.find((item) => item.id === next)?.label;
    title.textContent = label ? 'SOJOURN // ' + label.toUpperCase() : '';
    onSectionChange(next);
  };

  for (const item of MENU_ITEMS) {
    const button = buttons.get(item.id)!;
    button.addEventListener('click', () => {
      setSection(selected === item.id ? null : item.id);
    });
  }
  const close = (): void => setSection(null);
  const closeOutside = (event: PointerEvent): void => {
    if (selected !== null && !shell.contains(event.target as Node)) close();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && selected !== null) {
      close();
      event.stopPropagation();
    }
  };
  closeButton.addEventListener('click', close);
  document.addEventListener('pointerdown', closeOutside);
  window.addEventListener('keydown', onKeyDown);

  return {
    mapPane: panes.get('map')!,
    tradePane: panes.get('trade')!,
    contactsPane: panes.get('contacts')!,
    missionsPane: panes.get('missions')!,
    systemPane: panes.get('system')!,
    activeSection: () => selected,
    close,
    destroy(): void {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', onKeyDown);
      shell.remove();
    },
  };
}
