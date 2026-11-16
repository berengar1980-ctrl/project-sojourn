export type StartMenuAction = 'campaign' | 'continue' | 'campaigns' | 'pvp' | 'options' | 'quit';

export interface StartMenu {
  destroy(): void;
}

export function createStartMenu(
  root: HTMLElement,
  onAction: (action: StartMenuAction) => void,
  hasCareerSave = false
): StartMenu {
  const shell = document.createElement('section');
  shell.className = 'harrow-start';
  shell.setAttribute('aria-label', 'Harrowdrift Hauptmenü');
  const shade = document.createElement('div');
  shade.className = 'harrow-start__shade';
  const layout = document.createElement('div');
  layout.className = 'harrow-start__layout';
  const brand = document.createElement('header');
  brand.className = 'harrow-start__brand';
  const title = document.createElement('h1');
  title.textContent = 'HARROWDRIFT';
  brand.append(title);
  const nav = document.createElement('nav');
  nav.className = 'harrow-start__nav';
  nav.setAttribute('aria-label', 'Hauptmenü');
  const entries: readonly { label: string; action?: StartMenuAction }[] = [
    { label: 'Kampagnenspiel', action: 'campaign' },
    { label: 'PvP-Modus', action: 'pvp' },
    { label: 'Kampagnen', action: 'campaigns' },
    { label: 'Karriere fortsetzen', ...(hasCareerSave ? { action: 'continue' as const } : {}) },
    { label: 'Optionen', action: 'options' },
    { label: 'Beenden', action: 'quit' },
  ];
  for (const entry of entries) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = entry.label;
    button.disabled = !entry.action;
    if (!entry.action) {
      button.title = 'Noch kein gültiger Karriere-Spielstand vorhanden';
    } else {
      button.dataset.action = entry.action;
      button.addEventListener('click', () => onAction(entry.action!));
    }
    nav.append(button);
  }
  layout.append(brand, nav);
  shell.append(shade, layout);
  root.replaceChildren(shell);
  return { destroy: () => shell.remove() };
}
