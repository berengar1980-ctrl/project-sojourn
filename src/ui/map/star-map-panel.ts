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
}

function activitiesLabel(model: StarMapViewModel): string {
  const selected = model.locations.find((location) => location.isSelected);
  if (!selected) return 'Wähle ein Ziel auf der Karte.';

  const labels = [
    selected.activities.trade ? 'Handel' : null,
    selected.activities.mine ? 'Mining' : null,
    selected.activities.salvage ? 'Bergung' : null,
    selected.activities.refuel ? 'Treibstoff' : null,
    selected.activities.missions ? 'Missionen' : null,
  ].filter((label): label is string => Boolean(label));

  return labels.length ? labels.join(' · ') : 'Keine Dienste';
}

export function createStarMapPanel(options: StarMapPanelOptions): StarMapPanel {
  const shell = document.createElement('section');
  shell.className = 'star-map-shell';
  shell.innerHTML = `
    <header class="star-map-header">
      <div>
        <p class="eyebrow">TUTORIAL SECTOR</p>
        <h1>${options.model.title}</h1>
      </div>
      <div class="map-help">Ziehen: verschieben · Mausrad: zoomen</div>
    </header>
    <div class="star-map-layout">
      <div class="map-stage"><canvas class="star-map-canvas"></canvas></div>
      <aside class="map-inspector">
        <p class="eyebrow">NAVIGATION</p>
        <h2 class="inspector-title">Kein Ziel gewählt</h2>
        <p class="inspector-description">Wähle einen Ort auf der Sternkarte.</p>
        <div class="inspector-meta"></div>
        <div class="inspector-actions"></div>
      </aside>
    </div>
  `;
  options.root.replaceChildren(shell);

  const canvas = shell.querySelector<HTMLCanvasElement>('.star-map-canvas');
  if (!canvas) throw new Error('Star map canvas missing.');

  let model = options.model;
  const renderer = new TopdownMapRenderer(canvas, model);
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;

  const updateInspector = (): void => {
    const selected = model.locations.find((location) => location.isSelected);
    const title = shell.querySelector<HTMLElement>('.inspector-title');
    const description = shell.querySelector<HTMLElement>('.inspector-description');
    const meta = shell.querySelector<HTMLElement>('.inspector-meta');
    const actions = shell.querySelector<HTMLElement>('.inspector-actions');
    if (!title || !description || !meta || !actions) return;

    title.textContent = selected?.name ?? 'Kein Ziel gewählt';
    description.textContent = selected?.description ?? 'Wähle einen Ort auf der Sternkarte.';
    meta.textContent = selected
      ? `${selected.kind} · Gefahr ${selected.dangerLevel}/3 · ${activitiesLabel(model)}`
      : '';

    actions.textContent = '';
    if (model.route) {
      const route = document.createElement('div');
      route.className = 'route-card';
      route.textContent = `Route · ${Math.round(model.route.distance)} Einheiten`;
      actions.append(route);
    }
  };

  const resize = (): void => renderer.resize();
  const observer = new ResizeObserver(resize);
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

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      renderer.zoomAt(event.deltaY < 0 ? 1.12 : 0.89, event.offsetX, event.offsetY);
    },
    { passive: false }
  );

  updateInspector();

  return {
    update(nextModel): void {
      model = nextModel;
      renderer.update(model);
      updateInspector();
    },
    destroy(): void {
      observer.disconnect();
      shell.remove();
    },
  };
}
