import type {
  StrategicCombatService,
  StrategicCombatSnapshot,
} from '../../systems/combat/strategic-combat-service';
import { StrategicCombatRenderer } from './strategic-combat-renderer';

export interface StrategicCombatPanel {
  update(): void;
  destroy(): void;
}

interface StrategicCombatPanelOptions {
  readonly root: HTMLElement;
  readonly combat: StrategicCombatService;
  readonly onReturn: () => void;
}

function percent(current: number, maximum: number): number {
  return maximum <= 0 ? 0 : Math.max(0, Math.min(100, (current / maximum) * 100));
}

function combatantMarkup(
  side: 'ANGREIFER' | 'VERTEIDIGER',
  combatant: StrategicCombatSnapshot['attacker']
): string {
  return `
    <article class="strategic-combatant">
      <span>${side}</span>
      <strong>${combatant.name}</strong>
      <small>${combatant.shipId}</small>
      <div class="strategic-combat-stat">
        <label>SCHILD ${Math.round(combatant.shieldHp)} / ${combatant.shieldMaxHp}</label>
        <div>
          <i data-shield
            style="width:${percent(combatant.shieldHp, combatant.shieldMaxHp)}%"></i>
        </div>
      </div>
      <div class="strategic-combat-stat strategic-combat-stat--hull">
        <label>HÜLLE ${Math.round(combatant.hullHp)} / ${combatant.hullMaxHp}</label>
        <div>
          <i data-hull style="width:${percent(combatant.hullHp, combatant.hullMaxHp)}%"></i>
        </div>
      </div>
    </article>
  `;
}

export function createStrategicCombatPanel(
  options: StrategicCombatPanelOptions
): StrategicCombatPanel {
  const shell = document.createElement('section');
  shell.className = 'strategic-combat-shell';
  shell.innerHTML = `
    <canvas class="strategic-combat-map" aria-label="Lokaler Raumkampf"></canvas>
    <div class="strategic-combat-title">
      <span>SOJOURN // STRATEGISCHER RAUMKAMPF</span>
      <strong>KAMPF BEGINNT</strong>
    </div>
    <div class="strategic-combat-grid"></div>
    <div class="strategic-combat-event"></div>
    <button class="strategic-combat-return" type="button" hidden>ZUR STERNKARTE</button>
  `;
  options.root.replaceChildren(shell);

  const canvas = shell.querySelector<HTMLCanvasElement>('.strategic-combat-map');
  const grid = shell.querySelector<HTMLElement>('.strategic-combat-grid');
  const event = shell.querySelector<HTMLElement>('.strategic-combat-event');
  const returnButton = shell.querySelector<HTMLButtonElement>('.strategic-combat-return');
  const title = shell.querySelector<HTMLElement>('.strategic-combat-title strong');
  if (!canvas || !grid || !event || !returnButton || !title) {
    throw new Error('Strategic combat UI is incomplete.');
  }

  const renderer = new StrategicCombatRenderer(canvas, options.combat.getSnapshot());
  const resizeObserver = new ResizeObserver(() => renderer.resize());
  resizeObserver.observe(canvas);

  const render = (): void => {
    const model = options.combat.getSnapshot();
    grid.innerHTML =
      combatantMarkup('ANGREIFER', model.attacker) +
      combatantMarkup('VERTEIDIGER', model.defender);
    event.textContent = model.lastEvent;
    title.textContent = model.winner ? 'GEFECHT BEENDET' : 'KAMPF LÄUFT';
    returnButton.hidden = model.winner === null;
    renderer.update(model);
  };

  returnButton.addEventListener('click', options.onReturn);
  render();

  return {
    update: render,
    destroy() {
      resizeObserver.disconnect();
      shell.remove();
    },
  };
}
