import type {
  StrategicCombatService,
  StrategicCombatSnapshot,
} from '../../systems/combat/strategic-combat-service';
import { StrategicCombatRenderer } from './strategic-combat-renderer';
import { analyzeCombatLog } from '../../systems/combat/combat-log-analysis';
import { combatWeaponTelemetryHtml } from './combat-weapon-telemetry-panel';

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

function combatantHud(
  combatant: StrategicCombatSnapshot['attacker'],
  elapsedSeconds: number
): string {
  const shield = Math.round(percent(combatant.shieldHp, combatant.shieldMaxHp));
  const hull = Math.round(percent(combatant.hullHp, combatant.hullMaxHp));
  const engine = Math.round(combatant.subsystems.engine);
  const tractor = Math.round(combatant.subsystems.tractor);
  const enginePercent = Math.round(percent(engine, combatant.subsystems.maximum));
  const tractorPercent = Math.round(percent(tractor, combatant.subsystems.maximum));
  const tractorInstalled = combatant.tractorRangeMeters > 0;
  return `
    <strong>${combatant.name}</strong>
    <span>SCHILD ${Math.round(combatant.shieldHp)} / ${combatant.shieldMaxHp}</span>
    <div class="combat-hud-bar"><i data-layer="shield" style="width:${shield}%"></i></div>
    <span>HÜLLE ${Math.round(combatant.hullHp)} / ${combatant.hullMaxHp}</span>
    <div class="combat-hud-bar combat-hud-bar--hull"><i data-layer="hull" style="width:${hull}%"></i></div>
    <span>ANTRIEB ${engine} / ${combatant.subsystems.maximum} (${enginePercent} %) ${engine <= 0 ? '· AUSGEFALLEN' : enginePercent < 100 ? '· BESCHÄDIGT' : ''}</span>
    <div class="combat-hud-bar combat-hud-bar--engine"><i data-layer="engine" style="width:${enginePercent}%"></i></div>
    <span>TRAKTOR ${tractorInstalled ? tractor + ' / ' + combatant.subsystems.maximum + ' (' + tractorPercent + ' %)' : 'NICHT MONTIERT'} ${tractorInstalled && tractor <= 0 ? '· AUSGEFALLEN' : tractorInstalled && tractorPercent < 100 ? '· BESCHÄDIGT' : ''}</span>
    <div class="combat-hud-bar combat-hud-bar--tractor"><i data-layer="tractor" style="width:${tractorInstalled ? tractorPercent : 0}%"></i></div>
    <small>${combatant.tactic.toUpperCase()} · ${Math.round(combatant.speed)} m/s · ZIEL ${combatant.strategy?.targetSubsystem?.toUpperCase() ?? 'HÜLLE'}</small>
    <span>WAFFEN BEREIT ${combatant.readyWeapons} / ${combatant.installedWeapons}</span>
    ${combatWeaponTelemetryHtml(combatant, elapsedSeconds)}
    <span>MINEN ${combatant.mineCount > 0 ? combatant.mineCount : 'Keine Minen ausgerüstet'} · TRAKTOR ${combatant.tractorRangeMeters > 0 ? combatant.tractorRangeMeters + ' m' : 'NICHT MONTIERT'}</span>
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

function bindCombatCamera(
  canvas: HTMLCanvasElement,
  renderer: StrategicCombatRenderer
): () => void {
  let previousDrag: { x: number; y: number } | null = null;
  const pointerDown = (pointerEvent: PointerEvent): void => {
    if (pointerEvent.button !== 0) return;
    previousDrag = { x: pointerEvent.clientX, y: pointerEvent.clientY };
    canvas.setPointerCapture(pointerEvent.pointerId);
  };
  const pointerMove = (pointerEvent: PointerEvent): void => {
    if (!previousDrag) return;
    renderer.pan(pointerEvent.clientX - previousDrag.x, pointerEvent.clientY - previousDrag.y);
    previousDrag = { x: pointerEvent.clientX, y: pointerEvent.clientY };
  };
  const pointerUp = (pointerEvent: PointerEvent): void => {
    previousDrag = null;
    if (canvas.hasPointerCapture(pointerEvent.pointerId))
      canvas.releasePointerCapture(pointerEvent.pointerId);
  };
  const wheel = (wheelEvent: WheelEvent): void => {
    wheelEvent.preventDefault();
    const rect = canvas.getBoundingClientRect();
    renderer.zoomAt(
      wheelEvent.deltaY < 0 ? 1.12 : 1 / 1.12,
      wheelEvent.clientX - rect.left,
      wheelEvent.clientY - rect.top
    );
  };
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);
  canvas.addEventListener('wheel', wheel, { passive: false });
  return () => {
    canvas.removeEventListener('pointerdown', pointerDown);
    canvas.removeEventListener('pointermove', pointerMove);
    canvas.removeEventListener('pointerup', pointerUp);
    canvas.removeEventListener('pointercancel', pointerUp);
    canvas.removeEventListener('wheel', wheel);
  };
}

function makeCombatShell(root: HTMLElement): HTMLElement {
  const shell = document.createElement('section');
  shell.className = 'strategic-combat-shell';
  shell.innerHTML = `
    <canvas class="strategic-combat-map" aria-label="Lokaler Raumkampf"></canvas>
    <div class="combat-map-title">HARROWDRIFT // RAUMKAMPF <span class="combat-encounter-time"></span></div>
    <aside class="combat-hud combat-hud--player"></aside>
    <aside class="combat-hud combat-hud--enemy"></aside>
    <div class="combat-tactics" aria-label="Kampfbefehle">
      <button type="button" data-command="flee">FLIEHEN</button>
      <button type="button" data-command="surrender">AUFGEBEN</button>
    </div>
    <div class="combat-surrender-confirm" role="dialog" aria-modal="true"
      aria-label="Kapitulation bestätigen" hidden
      style="position:absolute;z-index:8;top:50%;left:50%;transform:translate(-50%,-50%);width:min(410px,calc(100vw - 32px));padding:22px;border:1px solid rgba(198,119,96,.65);background:rgba(11,17,23,.97);color:#dfe7ea;box-shadow:0 15px 65px #000;font:12px monospace">
      <strong>KAPITULATION BESTÄTIGEN?</strong>
      <p style="color:#b0bac2;line-height:1.7">Das Gefecht endet als Niederlage. Dein Schiff wird nicht automatisch zerstört.</p>
      <div class="combat-surrender-actions" style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" data-surrender="cancel"
          style="padding:9px 12px;border:1px solid #789cac;background:#101f28;color:#dfe7ea;cursor:pointer">ABBRECHEN</button>
        <button type="button" data-surrender="confirm"
          style="padding:9px 12px;border:1px solid #b96e62;background:#452421;color:#f0c2b7;cursor:pointer">JA, AUFGEBEN</button>
      </div>
    </div>
    <div class="strategic-combat-event"></div>
    <button class="strategic-combat-grapple" type="button">GREIFHAKEN</button>
    <button class="strategic-combat-log-export" type="button">KAMPFLOG EXPORTIEREN</button>
    <button class="strategic-combat-return" type="button" hidden>ZUR STERNKARTE</button>
  `;
  root.replaceChildren(shell);

  return shell;
}

function bindCombatOrders(
  shell: HTMLElement,
  combat: StrategicCombatService,
  onUpdate: () => void
): void {
  const flee = shell.querySelector<HTMLButtonElement>('[data-command="flee"]');
  const surrender = shell.querySelector<HTMLButtonElement>('[data-command="surrender"]');
  const dialog = shell.querySelector<HTMLElement>('.combat-surrender-confirm');
  const cancel = shell.querySelector<HTMLButtonElement>('[data-surrender="cancel"]');
  const confirm = shell.querySelector<HTMLButtonElement>('[data-surrender="confirm"]');
  flee?.addEventListener('click', () => {
    const tactic = combat.getSnapshot().attacker.tactic;
    combat.setTactic('attacker', tactic === 'flee' ? 'fight' : 'flee');
    onUpdate();
  });
  surrender?.addEventListener('click', () => {
    if (combat.getSnapshot().winner) return;
    if (dialog) dialog.hidden = false;
    cancel?.focus();
  });
  const hideDialog = (): void => {
    if (dialog) dialog.hidden = true;
    surrender?.focus();
  };
  cancel?.addEventListener('click', hideDialog);
  dialog?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideDialog();
  });
  confirm?.addEventListener('click', () => {
    if (dialog) dialog.hidden = true;
    combat.surrender('attacker');
    onUpdate();
  });
}

export function createStrategicCombatPanel(
  options: StrategicCombatPanelOptions
): StrategicCombatPanel {
  const shell = makeCombatShell(options.root);

  const canvas = shell.querySelector<HTMLCanvasElement>('.strategic-combat-map');
  const playerHud = shell.querySelector<HTMLElement>('.combat-hud--player');
  const enemyHud = shell.querySelector<HTMLElement>('.combat-hud--enemy');
  const event = shell.querySelector<HTMLElement>('.strategic-combat-event');
  const returnButton = shell.querySelector<HTMLButtonElement>('.strategic-combat-return');
  const grappleButton = shell.querySelector<HTMLButtonElement>('.strategic-combat-grapple');
  const fleeButton = shell.querySelector<HTMLButtonElement>('[data-command="flee"]');
  const surrenderButton = shell.querySelector<HTMLButtonElement>('[data-command="surrender"]');
  attachCombatLogExport(shell, options);
  if (!canvas || !playerHud || !enemyHud || !event || !returnButton) {
    throw new Error('Strategic combat UI is incomplete.');
  }

  grappleButton?.addEventListener('click', () => options.combat.fireGrapple('attacker'));
  const renderer = new StrategicCombatRenderer(canvas, options.combat.getSnapshot());
  const unbindCamera = bindCombatCamera(canvas, renderer);
  const resizeObserver = new ResizeObserver(() => renderer.resize());
  resizeObserver.observe(canvas);

  let lastHudTime = -Infinity;
  const render = (): void => {
    const model = options.combat.getSnapshot();
    renderer.update(model);
    // Canvas follows every frame; rebuilding HTML/HUD controls at 60 FPS causes
    // avoidable layout and garbage-collection work during longer duels.
    if (model.elapsedSeconds - lastHudTime < 0.1 && model.winner === null) return;
    lastHudTime = model.elapsedSeconds;
    playerHud.innerHTML = combatantHud(model.attacker, model.elapsedSeconds);
    enemyHud.innerHTML = combatantHud(model.defender, model.elapsedSeconds);
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
    if (fleeButton) {
      const fleeing = model.attacker.tactic === 'flee';
      fleeButton.textContent = fleeing ? 'KAMPF AUFNEHMEN' : 'FLIEHEN';
      fleeButton.classList.toggle('is-active', fleeing);
      fleeButton.disabled = model.winner !== null;
    }
    if (surrenderButton) surrenderButton.disabled = model.winner !== null;
  };

  returnButton.addEventListener('click', options.onReturn);
  bindCombatOrders(shell, options.combat, render);
  render();

  return {
    update: render,
    destroy() {
      resizeObserver.disconnect();
      unbindCamera();
      shell.remove();
    },
  };
}
