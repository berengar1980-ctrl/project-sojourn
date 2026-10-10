import type {
  CombatTactic,
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

function combatantHud(combatant: StrategicCombatSnapshot['attacker']): string {
  const shield = Math.round(percent(combatant.shieldHp, combatant.shieldMaxHp));
  const hull = Math.round(percent(combatant.hullHp, combatant.hullMaxHp));
  return `
    <strong>${combatant.name}</strong>
    <span>SCHILD ${Math.round(combatant.shieldHp)} / ${combatant.shieldMaxHp}</span>
    <div class="combat-hud-bar"><i data-layer="shield" style="width:${shield}%"></i></div>
    <span>HÜLLE ${Math.round(combatant.hullHp)} / ${combatant.hullMaxHp}</span>
    <div class="combat-hud-bar combat-hud-bar--hull"><i data-layer="hull" style="width:${hull}%"></i></div>
    <small>${combatant.tactic.toUpperCase()} · ${Math.round(combatant.speed)} m/s</small>
    <span>FEUERLEITUNG ${combatant.fireControl.charges} / ${combatant.fireControl.max}</span>
  `;
}

export function createStrategicCombatPanel(
  options: StrategicCombatPanelOptions
): StrategicCombatPanel {
  const shell = document.createElement('section');
  shell.className = 'strategic-combat-shell';
  shell.innerHTML = `
    <canvas class="strategic-combat-map" aria-label="Lokaler Raumkampf"></canvas>
    <div class="combat-map-title">SOJOURN // RAUMKAMPF</div>
    <aside class="combat-hud combat-hud--player"></aside>
    <aside class="combat-hud combat-hud--enemy"></aside>
    <div class="combat-tactics" aria-label="Kampftaktik">
      <button type="button" data-tactic="fight">KAMPF</button>
      <button type="button" data-tactic="kite">DISTANZ</button>
      <button type="button" data-tactic="minefield">MINEN</button>
      <button type="button" data-tactic="flee">FLUCHT</button>
    </div>
    <div class="strategic-combat-event"></div>
    <button class="strategic-combat-grapple" type="button">GREIFHAKEN</button>
    <button class="strategic-combat-return" type="button" hidden>ZUR STERNKARTE</button>
  `;
  options.root.replaceChildren(shell);

  const canvas = shell.querySelector<HTMLCanvasElement>('.strategic-combat-map');
  const playerHud = shell.querySelector<HTMLElement>('.combat-hud--player');
  const enemyHud = shell.querySelector<HTMLElement>('.combat-hud--enemy');
  const event = shell.querySelector<HTMLElement>('.strategic-combat-event');
  const returnButton = shell.querySelector<HTMLButtonElement>('.strategic-combat-return');
  const grappleButton = shell.querySelector<HTMLButtonElement>('.strategic-combat-grapple');
  const tacticButtons = [...shell.querySelectorAll<HTMLButtonElement>('[data-tactic]')];
  if (!canvas || !playerHud || !enemyHud || !event || !returnButton) {
    throw new Error('Strategic combat UI is incomplete.');
  }

  grappleButton?.addEventListener('click', () => options.combat.fireGrapple('attacker'));
  const renderer = new StrategicCombatRenderer(canvas, options.combat.getSnapshot());
  const resizeObserver = new ResizeObserver(() => renderer.resize());
  resizeObserver.observe(canvas);

  for (const button of tacticButtons) {
    button.addEventListener('click', () => {
      const tactic = button.dataset.tactic as CombatTactic | undefined;
      if (tactic) options.combat.setTactic('attacker', tactic);
    });
  }

  const render = (): void => {
    const model = options.combat.getSnapshot();
    playerHud.innerHTML = combatantHud(model.attacker);
    enemyHud.innerHTML = combatantHud(model.defender);
    event.textContent = model.lastEvent;
    returnButton.hidden = model.winner === null;
    returnButton.textContent = model.boardingInitiator ? 'ENTERKAMPF STARTEN' : 'ZUR STERNKARTE';
    if (grappleButton) {
      grappleButton.disabled =
        model.winner !== null ||
        model.grapple !== null ||
        model.grappleUsed.attacker ||
        model.defender.shieldHp > 0 ||
        Math.hypot(
          model.attacker.position.x - model.defender.position.x,
          model.attacker.position.y - model.defender.position.y
        ) > 900;
      grappleButton.textContent = model.grappleUsed.attacker
        ? 'GREIFHAKEN VERBRAUCHT'
        : 'GREIFHAKEN ABSCHIESSEN';
    }
    for (const button of tacticButtons) {
      button.classList.toggle('is-active', button.dataset.tactic === model.attacker.tactic);
      button.disabled = model.winner !== null;
    }
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
