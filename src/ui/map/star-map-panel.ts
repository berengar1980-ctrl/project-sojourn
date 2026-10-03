import type { StarMapViewModel } from '../../features/star-map/star-map-view-model';
import { TopdownMapRenderer } from './topdown-map-renderer';

export interface StarMapPanel {
  update(model: StarMapViewModel): void;
  destroy(): void;
}

interface StarMapPanelOptions {
  readonly root: HTMLElement;
  readonly model: StarMapViewModel;
  readonly onSelectLocation: (id: string) => void;
  readonly onStartTravel: () => void;
}

function activityLabels(model: StarMapViewModel): string {
  const selected = model.locations.find((location) => location.isSelected);
  if (!selected) return '';

  return [
    selected.activities.trade ? 'HANDEL' : null,
    selected.activities.mine ? 'MINING' : null,
    selected.activities.salvage ? 'BERGUNG' : null,
    selected.activities.refuel ? 'TREIBSTOFF' : null,
    selected.activities.missions ? 'MISSIONEN' : null,
  ]
    .filter((label): label is string => Boolean(label))
    .join(' · ');
}

export function createStarMapPanel(options: StarMapPanelOptions): StarMapPanel {
  const shell = document.createElement('section');
  shell.className = 'star-map-shell';
  shell.innerHTML = `
    <canvas class="star-map-canvas" aria-label="Sternkarte"></canvas>
    <div class="map-title">
      <span>SOJOURN</span>
      <strong>${options.model.title}</strong>
    </div>
    <div class="travel-status" hidden></div>
    <div class="map-controls">DOPPELKLICK · ANSICHT ZURÜCKSETZEN &nbsp;&nbsp; MAUSRAD · ZOOM</div>
    <div class="selection-card" hidden>
      <div class="selection-kind"></div>
      <div class="selection-name"></div>
      <div class="selection-description"></div>
      <div class="selection-meta"></div>
      <button class="travel-button" type="button">FLUG STARTEN</button>
    </div>
  `;
  options.root.replaceChildren(shell);

  const canvas = shell.querySelector<HTMLCanvasElement>('.star-map-canvas');
  const card = shell.querySelector<HTMLElement>('.selection-card');
  const travelButton = shell.querySelector<HTMLButtonElement>('.travel-button');
  const travelStatus = shell.querySelector<HTMLElement>('.travel-status');
  if (!canvas || !card || !travelButton || !travelStatus) {
    throw new Error('Star map UI is incomplete.');
  }

  let model = options.model;
  const renderer = new TopdownMapRenderer(canvas, model);
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;

  const updateSelection = (): void => {
    const selected = model.locations.find((location) => location.isSelected);
    card.hidden = !selected;
    travelStatus.hidden = !model.navigation.isTravelling;

    if (model.navigation.isTravelling) {
      const percent = Math.round(model.navigation.progress * 100);
      travelStatus.textContent =
        'KURS · ' + percent + '% · ' + Math.round(model.navigation.speed) + ' u/s';
    }

    if (!selected) return;

    const kind = card.querySelector<HTMLElement>('.selection-kind');
    const name = card.querySelector<HTMLElement>('.selection-name');
    const description = card.querySelector<HTMLElement>('.selection-description');
    const meta = card.querySelector<HTMLElement>('.selection-meta');
    if (!kind || !name || !description || !meta) return;

    kind.textContent = selected.kind.replace('-', ' ').toUpperCase();
    name.textContent = selected.name;
    description.textContent = selected.description;
    const route = model.route ? ` · ROUTE ${Math.round(model.route.distance)}` : '';
    meta.textContent = `GEFAHR ${selected.dangerLevel}/3 · ${activityLabels(model)}${route}`;
    travelButton.hidden =
      model.navigation.isTravelling || selected.id === model.navigation.currentLocationId;
  };

  const observer = new ResizeObserver(() => renderer.resize());
  observer.observe(canvas);

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    moved = false;
    lastX = event.offsetX;
    lastY = event.offsetY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.offsetX - lastX;
    const dy = event.offsetY - lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
    renderer.pan(dx, dy);
    lastX = event.offsetX;
    lastY = event.offsetY;
  });

  canvas.addEventListener('pointerup', (event) => {
    dragging = false;
    if (moved) return;
    const id = renderer.pickLocation(event.offsetX, event.offsetY);
    if (id) options.onSelectLocation(id);
  });

  canvas.addEventListener('dblclick', () => renderer.resetCamera());
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      renderer.zoomAt(event.deltaY, event.offsetX, event.offsetY);
    },
    { passive: false }
  );
  travelButton.addEventListener('click', options.onStartTravel);

  updateSelection();

  return {
    update(nextModel): void {
      model = nextModel;
      renderer.update(model);
      updateSelection();
    },
    destroy(): void {
      observer.disconnect();
      shell.remove();
    },
  };
}
