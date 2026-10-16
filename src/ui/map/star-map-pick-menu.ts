import type { StarMapPickOption } from './star-map-contact-picking';

export interface StarMapPickMenu {
  show(options: readonly StarMapPickOption[], point: { x: number; y: number }): void;
  close(): void;
  destroy(): void;
}

export function createStarMapPickMenu(
  parent: HTMLElement,
  onSelect: (contact: StarMapPickOption) => void
): StarMapPickMenu {
  const panel = document.createElement('div');
  panel.className = 'star-map-pick';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Ziel auswählen');
  panel.hidden = true;
  parent.append(panel);

  const close = (): void => {
    panel.hidden = true;
    panel.replaceChildren();
  };
  const closeOutside = (event: PointerEvent): void => {
    if (!panel.hidden && !panel.contains(event.target as Node)) close();
  };
  const closeOnEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || panel.hidden) return;
    close();
    event.stopPropagation();
  };

  document.addEventListener('pointerdown', closeOutside);
  window.addEventListener('keydown', closeOnEscape);

  return {
    show(options, point): void {
      const title = document.createElement('div');
      title.className = 'star-map-pick__heading';
      title.textContent = 'AUSWAHL // ' + options.length + ' ZIELE';
      const items = options.map((contact) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'star-map-pick__item';
        const kind = document.createElement('small');
        kind.textContent = contact.detail;
        const name = document.createElement('strong');
        name.textContent = contact.name;
        button.append(kind, name);
        button.addEventListener('click', () => {
          close();
          onSelect(contact);
        });
        return button;
      });
      panel.replaceChildren(title, ...items);
      const maxX = Math.max(8, parent.clientWidth - 312);
      const maxY = Math.max(8, parent.clientHeight - Math.min(400, 39 + options.length * 53));
      panel.style.left = Math.max(8, Math.min(point.x + 12, maxX)) + 'px';
      panel.style.top = Math.max(8, Math.min(point.y + 12, maxY)) + 'px';
      panel.hidden = false;
      items[0]?.focus();
    },
    close,
    destroy(): void {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeOnEscape);
      panel.remove();
    },
  };
}
