import type {
  CombatTactic,
  StrategicCombatService,
  StrategicCombatSnapshot,
} from '../../systems/combat/strategic-combat-service';
import { StrategicCombatRenderer } from './strategic-combat-renderer';
import { analyzeCombatLog } from '../../systems/combat/combat-log-analysis';

export interface StrategicCombatPanel {
  update(): void;
  destroy(): void;
}

interface StrategicCombatPanelOptions {
  readonly root: HTMLElement;
  readonly combat: StrategicCombatService;
  readonly onReturn: () => void;
  readonly encounterName?: string;
}

function percent(current: number, maximum: number): number {
  return maximum <= 0 ? 0 : Math.max(0, Math.min(100, (current / maximum) * 100));
}

function combatantHud(combatant: StrategicCombatSnapshot['attacker']): string {
  const shield = Math.round(percent(combatant.shieldHp, combatant.shieldMaxHp));
  const hull = Math.round(percent(combatant.hullHp, combatant.hullMaxHp));
  const engine = Math.round(combatant.subsystems.engine);
  const tractor = Math.round(combatant.subsystems.tractor);
  return `
    <strong>${combatant.name}</strong>
    <span>SCHILD ${Math.round(combatant.shieldHp)} / ${combatant.shieldMaxHp}</span>
    <div class="combat-hud-bar"><i data-layer="shield" style="width:${shield}%"></i></div>
    <span>HÜLLE ${Math.round(combatant.hullHp)} / ${combatant.hullMaxHp}</span>
    <div class="combat-hud-bar combat-hud-bar--hull"><i data-layer="hull" style="width:${hull}%"></i></div>
    <span>TRIEBWERK ${engine} / ${combatant.subsystems.maximum} ${engine <= 0 ? '· DEFEKT' : ''}</span>
    <span>TRAKTOR ${tractor} / ${combatant.subsystems.maximum} ${tractor <= 0 ? '· DEFEKT / NICHT VORHANDEN' : ''}</span>
    <small>${combatant.tactic.toUpperCase()} · ${Math.round(combatant.speed)} m/s · ZIEL ${combatant.strategy?.targetSubsystem?.toUpperCase() ?? 'HÜLLE'}</small>
    <span>FEUERLEITUNG ${combatant.fireControl.charges} / ${combatant.fireControl.max}</span>
    <span>MINEN ${combatant.mineCount} · TRAKTOR ${combatant.tractorRangeMeters > 0 ? combatant.tractorRangeMeters + ' m' : 'NICHT MONTIERT'}</span>
  `;
}

function attachCombatLogExport(shell: HTMLElement, options: StrategicCombatPanelOptions): void {
  shell
    .querySelector<HTMLButtonElement>('.strategic-combat-log-export')
    ?.addEventListener('click', () => {
      const payload = JSON.stringify(
        {
          format: 'harrowdrift-combat-log-v1',
          encounter: options.encounterName ?? 'Freies Duell',
          snapshot: options.combat.getSnapshot(),
          events: options.combat.getCombatLog(),
          analysis: analyzeCombatLog(options.combat.getCombatLog()),
        },
        null,
        2
      );
      const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      const slug = (options.encounterName ?? 'freies-duell')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      link.download = 'harrowdrift-' + slug + '-kampflog.json';
      link.click();
      URL.revokeObjectURL(url);
    });
}

export function createStrategicCombatPanel(
  options: StrategicCombatPanelOptions
): StrategicCombatPanel {
  const shell = document.createElement('section');
  shell.className = 'strategic-combat-shell';
  shell.innerHTML = `
    <canvas class="strategic-combat-map" aria-label="Lokaler Raumkampf"></canvas>
    <div class="combat-map-title">HARROWDRIFT // RAUMKAMPF <span class="combat-encounter-time"></span></div>
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
    <button class="strategic-combat-log-export" type="button">KAMPFLOG EXPORTIEREN</button>
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
  attachCombatLogExport(shell, options);
  if (!canvas || !playerHud || !enemyHud || !event || !returnButton) {
    throw new Error('Strategic combat UI is incomplete.');
  }

  grappleButton?.addEventListener('click', () => options.combat.fireGrapple('attacker'));
  const renderer = new StrategicCombatRenderer(canvas, options.combat.getSnapshot());
  let previousDrag: { x: number; y: number } | null = null;
  const pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    previousDrag = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent): void => {
    if (!previousDrag) return;
    renderer.pan(event.clientX - previousDrag.x, event.clientY - previousDrag.y);
    previousDrag = { x: event.clientX, y: event.clientY };
  };
  const pointerUp = (event: PointerEvent): void => {
    previousDrag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    renderer.zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
  };
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('wheel', wheel, { passive: false });
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
    const timer = shell.querySelector<HTMLElement>('.combat-encounter-time');
    if (timer) {
      const seconds = Math.floor(model.elapsedSeconds);
      timer.textContent =
        (options.encounterName ?? 'Freies Duell') +
        ' · ' +
        String(Math.floor(seconds / 60)).padStart(2, '0') +
        ':' +
        String(seconds % 60).padStart(2, '0');
    }
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
      button.disabled =
        model.winner !== null ||
        (button.dataset.tactic === 'minefield' && model.attacker.mineCount === 0);
      if (button.dataset.tactic === 'minefield') {
        button.title =
          model.attacker.mineCount === 0
            ? 'Keine Minen ausgerüstet'
            : model.attacker.mineCount + ' Minen vorhanden';
        button.textContent = 'MINEN (' + model.attacker.mineCount + ')';
      }
    }
    renderer.update(model);
  };

  returnButton.addEventListener('click', options.onReturn);
  render();

  return {
    update: render,
    destroy() {
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
      canvas.removeEventListener('wheel', wheel);
      shell.remove();
    },
  };
}
