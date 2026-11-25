import type { CombatCamera, CombatCameraPose } from './combat-camera';
import type {
  StrategicCombatService,
  StrategicCombatSnapshot,
} from '../../systems/combat/strategic-combat-service';
import { FleetNativeCombatRenderer } from './fleet-native-combat-renderer';
import { createFleetDisplayMenu } from './fleet-display-menu';
import type {
  NativeFleetEngagement,
  ParallelNativeDuelSnapshot,
} from '../../systems/combat/parallel-native-duels';
import { analyzeCombatLog } from '../../systems/combat/combat-log-analysis';
import { combatWeaponTelemetryHtml } from './combat-weapon-telemetry-panel';
import { describeCombatStatus } from '../../systems/combat/combat-intent-labels';

export interface FleetNativeCombatPanel {
  update(): void;
  destroy(): void;
}

interface FleetNativeCombatPanelOptions {
  readonly root: HTMLElement;
  /** Reuse the same physical canvas when an idle world becomes a battle. */
  readonly canvas?: HTMLCanvasElement;
  readonly camera?: CombatCamera;
  readonly combat: StrategicCombatService;
  readonly onReturn: () => void;
  readonly returnLabel?: string;
  readonly encounterName?: string;
  readonly fleet?: () => ParallelNativeDuelSnapshot;
  readonly spectator?: boolean;
  readonly isComplete?: () => boolean;
  /** Noncombat campaign NPCs are rendered by the native fleet canvas, not another scene. */
  readonly drawField?: (width: number, height: number, time: number) => void;
  readonly drawWorldActors?: (
    pose: CombatCameraPose,
    width: number,
    height: number,
    timeSeconds: number
  ) => void;
}

function percent(current: number, maximum: number): number {
  return maximum <= 0 ? 0 : Math.max(0, Math.min(100, (current / maximum) * 100));
}

function combatHudWeapons(
  combatant: StrategicCombatSnapshot['attacker'],
  elapsedSeconds: number,
  visible: boolean
): string {
  if (!visible) return '';
  return `<span>WAFFEN BEREIT ${combatant.readyWeapons} / ${combatant.installedWeapons}</span>${combatWeaponTelemetryHtml(combatant, elapsedSeconds)}`;
}

export function combatantHud(
  combatant: StrategicCombatSnapshot['attacker'],
  elapsedSeconds: number,
  weaponsVisible = true
): string {
  const shield = Math.round(percent(combatant.shieldHp, combatant.shieldMaxHp));
  const hull = Math.round(percent(combatant.hullHp, combatant.hullMaxHp));
  const engine = Math.round(combatant.subsystems.engine);
  const tractor = Math.round(combatant.subsystems.tractor);
  const enginePercent = Math.round(percent(engine, combatant.subsystems.maximum));
  const tractorPercent = Math.round(percent(tractor, combatant.subsystems.maximum));
  const tractorInstalled = combatant.tractorRangeMeters > 0;
  const status = describeCombatStatus(combatant);
  const power = combatant.power;
  const faultLabel = combatant.powerFault === 'total' ? 'GESAMT' : 'WAFFEN';
  const powerState = combatant.powerFault ? 'AUSFALL ' + faultLabel : 'AKTIV';
  const energyLine = power ? `ENERGIE ${power.combat} / ${power.output} MW · ${powerState}` : '';
  let maneuver = status.maneuver ?? 'KEIN AKTIVES MANÖVER';
  if (combatant.powerFault === 'total') maneuver = 'ENERGIEAUSFALL';
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
    <small>STRATEGIE · ${status.strategy}</small>
    <small>MANÖVER · ${maneuver}</small>
    <small>${energyLine}</small>
    ${combatHudWeapons(combatant, elapsedSeconds, weaponsVisible)}
    <span>MINEN ${combatant.mineCount > 0 ? combatant.mineCount : 'Keine Minen ausgerüstet'} · TRAKTOR ${combatant.tractorRangeMeters > 0 ? combatant.tractorRangeMeters + ' m' : 'NICHT MONTIERT'}</span>
  `;
}

function attachCombatLogExport(shell: HTMLElement, options: FleetNativeCombatPanelOptions): void {
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
  renderer: FleetNativeCombatRenderer
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

function makeCombatShell(root: HTMLElement, existingCanvas?: HTMLCanvasElement): HTMLElement {
  const shell = document.createElement('section');
  if (existingCanvas) shell.style.display = 'contents';
  else shell.className = 'strategic-combat-shell';
  shell.innerHTML = `
    ${existingCanvas ? '' : '<canvas class="strategic-combat-map" aria-label="Lokaler Raumkampf"></canvas>'}
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
  if (existingCanvas) root.append(shell);
  else root.replaceChildren(shell);

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

function combatReturnLabel(model: StrategicCombatSnapshot, returnLabel = 'ZUR STERNKARTE'): string {
  if (model.winner !== null && model.attacker.hullHp <= 0) return 'SCHIFF ZERSTÖRT · BERGUNG...';
  return model.boardingInitiator ? 'ENTERKAMPF STARTEN' : returnLabel;
}

function prepareParallelDuelPanel(
  shell: HTMLElement,
  options: FleetNativeCombatPanelOptions
): HTMLElement | null {
  if (options.spectator) {
    shell.querySelector<HTMLElement>('.combat-tactics')?.remove();
    shell.querySelector<HTMLElement>('.strategic-combat-grapple')?.remove();
  }
  if (!options.fleet) return null;
  const status = document.createElement('aside');
  status.className = 'combat-parallel-duels-status';
  status.style.cssText =
    'position:absolute;top:50px;left:14px;z-index:3;padding:8px 11px;max-width:56vw;' +
    'background:rgba(10,20,27,.88);border:1px solid #556973;' +
    'color:#d8e7ee;font:12px ui-monospace,monospace;pointer-events:none;';
  shell.append(status);
  return status;
}

function updateParallelDuelStatus(
  status: HTMLElement | null,
  engagements: readonly NativeFleetEngagement[]
): void {
  if (!status) return;
  const label = engagements
    .map((link) =>
      link.role === 'duel'
        ? 'D' + link.label + ' ' + link.sourceId + ' ↔ ' + link.targetId
        : '+' + link.label + ' ' + link.sourceId + ' → ' + link.targetId
    )
    .join('   |   ');
  const content = label || 'KEINE AKTIVEN DUELLE';
  if (status.textContent !== content) status.textContent = content;
}

function setFleetOverlayVisible(element: HTMLElement | null, visible: boolean): void {
  if (!element) return;
  const display = visible ? '' : 'none';
  if (element.style.display !== display) element.style.display = display;
}

function updateCombatReturnButton(
  button: HTMLButtonElement,
  options: FleetNativeCombatPanelOptions,
  model: StrategicCombatSnapshot,
  defeatStartedAt: number | null
): void {
  const complete = options.isComplete?.() ?? model.winner !== null;
  button.hidden = options.spectator ? false : !complete;
  button.textContent = options.spectator
    ? complete
      ? 'ZUM TESTLABOR'
      : 'TEST BEENDEN'
    : combatReturnLabel(model, options.returnLabel);
  button.disabled =
    !options.spectator && defeatStartedAt !== null && performance.now() - defeatStartedAt < 2200;
}

function updateCombatActionButtons(
  grappleButton: HTMLButtonElement | null,
  fleeButton: HTMLButtonElement | null,
  surrenderButton: HTMLButtonElement | null,
  model: StrategicCombatSnapshot
): void {
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
}

function updateCombatEncounterTime(
  shell: HTMLElement,
  encounterName: string,
  elapsedSeconds: number
): void {
  const timer = shell.querySelector<HTMLElement>('.combat-encounter-time');
  if (timer) {
    const seconds = Math.floor(elapsedSeconds);
    timer.textContent =
      encounterName +
      ' · ' +
      String(Math.floor(seconds / 60)).padStart(2, '0') +
      ':' +
      String(seconds % 60).padStart(2, '0');
  }
}

function combatPanelDisplay(shell: HTMLElement, options: FleetNativeCombatPanelOptions) {
  return createFleetDisplayMenu(shell, [
    ...(!options.fleet ? (['lines', 'assignments', 'overview'] as const) : []),
    ...(options.spectator ? (['playerMarker'] as const) : []),
  ]);
}

export function createFleetNativeCombatPanel(
  options: FleetNativeCombatPanelOptions
): FleetNativeCombatPanel {
  const shell = makeCombatShell(options.root, options.canvas);
  const parallelStatus = prepareParallelDuelPanel(shell, options);
  const displayMenu = combatPanelDisplay(shell, options);

  const canvas = options.canvas ?? shell.querySelector<HTMLCanvasElement>('.strategic-combat-map');
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
  const firstSnapshot = options.combat.getSnapshot();
  const renderer = new FleetNativeCombatRenderer(
    canvas,
    firstSnapshot,
    options.drawWorldActors,
    options.camera,
    options.drawField
  );
  const unbindCamera = options.camera ? undefined : bindCombatCamera(canvas, renderer);
  const resizeObserver = new ResizeObserver(() => renderer.resize());
  resizeObserver.observe(canvas);

  let lastHudTime = -Infinity;
  let defeatReturnTimer: ReturnType<typeof setTimeout> | null = null;
  let defeatReturnStartedAt: number | null = null;
  const render = (): void => {
    const model = options.combat.getSnapshot();
    const display = displayMenu.get();
    const fleet = options.fleet?.();
    const engagements = fleet?.engagements ?? [];
    renderer.updateEncounter(
      model,
      fleet,
      options.spectator ? { ...display, playerMarker: false } : display
    );
    updateParallelDuelStatus(parallelStatus, engagements);
    setFleetOverlayVisible(parallelStatus, display.overview);
    setFleetOverlayVisible(playerHud, display.playerHud);
    setFleetOverlayVisible(enemyHud, display.enemyHud);
    setFleetOverlayVisible(event, display.events);
    if (
      !options.spectator &&
      model.winner !== null &&
      model.attacker.hullHp <= 0 &&
      (options.isComplete?.() ?? true) &&
      defeatReturnTimer === null
    ) {
      defeatReturnStartedAt = performance.now();
      defeatReturnTimer = setTimeout(() => options.onReturn(), 2200);
    }
    // Canvas follows every frame; rebuilding HTML/HUD controls at 60 FPS causes
    // avoidable layout and garbage-collection work during longer duels.
    if (model.elapsedSeconds - lastHudTime < 0.1 && model.winner === null) return;
    lastHudTime = model.elapsedSeconds;
    if (display.playerHud)
      playerHud.innerHTML = combatantHud(
        model.attacker,
        model.elapsedSeconds,
        display.playerWeapons
      );
    if (display.enemyHud)
      enemyHud.innerHTML = combatantHud(model.defender, model.elapsedSeconds, display.enemyWeapons);
    event.textContent = model.lastEvent;
    updateCombatEncounterTime(shell, options.encounterName ?? 'Freies Duell', model.elapsedSeconds);
    updateCombatReturnButton(returnButton, options, model, defeatReturnStartedAt);
    updateCombatActionButtons(grappleButton, fleeButton, surrenderButton, model);
  };

  displayMenu.onChange(() => {
    lastHudTime = -Infinity;
    render();
  });
  returnButton.addEventListener('click', () => {
    if (defeatReturnStartedAt !== null && performance.now() - defeatReturnStartedAt < 2200) return;
    options.onReturn();
  });
  if (!options.spectator) bindCombatOrders(shell, options.combat, render);
  render();

  return {
    update: render,
    destroy() {
      renderer.suspend();
      if (defeatReturnTimer !== null) clearTimeout(defeatReturnTimer);
      resizeObserver.disconnect();
      unbindCamera?.();
      shell.remove();
    },
  };
}
