import {
  DUEL_MAPS,
  createDuelArena,
  type DuelMapKind,
} from '../../systems/combat/duel-arena-presets';
import { createFleetNativeCombatPanel } from '../combat/fleet-native-combat-panel';
import {
  createFleetScenarioRoster,
  DEFAULT_FLEET_SCENARIO,
  FLEET_SCENARIO_GROUPS,
  type FleetScenarioCounts,
  type FleetScenarioIncident,
  type FleetScenarioShip,
} from './fleet-scenario-roster';
import { createFleetScenarioRuntime } from './fleet-scenario-runtime';
import { createFleetIdleWorldCanvas } from './fleet-idle-world-canvas';

interface FleetTestConfiguration {
  readonly map: DuelMapKind;
  readonly incident: FleetScenarioIncident;
  readonly groups: readonly FleetScenarioCounts[];
  readonly ships: readonly FleetScenarioShip[];
}

function labeledSelect(label: string, values: readonly { id: string; title: string }[]) {
  const control = document.createElement('select');
  for (const value of values) control.append(new Option(value.title, value.id));
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  wrapper.append(control);
  return { wrapper, control };
}

function shipCount(label: string, initial: number) {
  const values = Array.from({ length: 11 }, (_, i) => ({
    id: String(i),
    title: i + (i === 1 ? ' Schiff' : ' Schiffe'),
  }));
  const select = labeledSelect(label, values);
  select.control.value = String(initial);
  return select;
}

interface GroupControls {
  readonly id: FleetScenarioCounts['group'];
  readonly initial: HTMLSelectElement;
  readonly joining: HTMLSelectElement;
  readonly seconds: HTMLInputElement;
  readonly element: HTMLElement;
}

function createGroupControls(setting: FleetScenarioCounts): GroupControls {
  const entry = FLEET_SCENARIO_GROUPS.find((group) => group.id === setting.group)!;
  const initial = shipCount('Beim Start', setting.initial);
  const joining = shipCount('Nachrücker', setting.joining);
  const secondsLabel = document.createElement('label');
  secondsLabel.textContent = 'Nach Sekunden';
  const seconds = document.createElement('input');
  seconds.type = 'number';
  seconds.min = '0';
  seconds.max = '3600';
  seconds.step = '1';
  seconds.value = String(setting.afterSeconds);
  seconds.setAttribute('aria-label', entry.title + ': Nachrücken nach Sekunden');
  secondsLabel.append(seconds);
  const element = document.createElement('div');
  element.className = 'harrow-fleet__scenario-row';
  element.style.cssText =
    'display:grid;grid-template-columns:minmax(130px,1.2fr) repeat(3,minmax(85px,1fr));' +
    'gap:12px;align-items:end;padding:12px 0;border-bottom:1px solid #354a51;';
  const name = document.createElement('strong');
  name.textContent = entry.title;
  name.style.cssText = 'color:' + entry.color + ';padding-bottom:8px;';
  element.append(name, initial.wrapper, joining.wrapper, secondsLabel);
  return {
    id: setting.group,
    initial: initial.control,
    joining: joining.control,
    seconds,
    element,
  };
}

function renderRoster(root: HTMLElement, config: FleetTestConfiguration): void {
  root.replaceChildren();
  for (const group of ['player', ...FLEET_SCENARIO_GROUPS.map((item) => item.id)]) {
    const ships = config.ships.filter((entry) => entry.group === group);
    if (!ships.length) continue;
    const card = document.createElement('section');
    card.className = 'harrow-duel__card';
    const heading = document.createElement('h2');
    heading.textContent =
      group === 'player'
        ? 'SPIELER · IMMER DABEI'
        : (FLEET_SCENARIO_GROUPS.find((item) => item.id === group)?.title ?? group);
    card.append(heading);
    for (const ship of ships) {
      const line = document.createElement('p');
      line.textContent =
        ship.id.toUpperCase() +
        ' · ' +
        ship.name +
        (ship.arrivalSeconds > 0 ? ' · Eintritt nach ' + ship.arrivalSeconds + ' s' : ' · Start');
      card.append(line);
    }
    root.append(card);
  }
}

// The launcher owns both the idle world clock and successive native battles.
// eslint-disable-next-line max-lines-per-function
function createSimulatorLauncher(
  root: HTMLElement,
  lobby: HTMLElement,
  onCombatActiveChange: (active: boolean) => void
) {
  let panel: ReturnType<typeof createFleetNativeCombatPanel> | null = null;
  let idleWorld: ReturnType<typeof createFleetIdleWorldCanvas> | null = null;
  let displayedFleet: ReturnType<typeof createFleetScenarioRuntime>['fleet'] = null;
  let frame = 0;
  let generation = 0;
  let destroyed = false;
  const stop = (): void => {
    generation++;
    cancelAnimationFrame(frame);
    idleWorld?.deactivate();
    idleWorld = null;
    panel?.destroy();
    panel = null;
    displayedFleet = null;
    onCombatActiveChange(false);
  };
  return {
    start(config: FleetTestConfiguration): void {
      if (destroyed) return;
      stop();
      const epoch = generation;
      const seed = Math.floor(Math.random() * 0x7fffffff);
      const arena = createDuelArena(config.map, seed);
      const session = createFleetScenarioRuntime(
        config.ships,
        arena,
        seed,
        config.incident,
        config.map
      );
      const waiting = document.createElement('section');
      waiting.className = 'strategic-combat-shell';
      const heading = document.createElement('div');
      heading.className = 'combat-map-title';
      heading.textContent = 'FLEETCOMBAT · EINSATZGEBIET';
      const status = document.createElement('div');
      status.className = 'combat-parallel-duels-status';
      status.style.cssText =
        'position:absolute;top:50px;left:14px;z-index:3;padding:8px 11px;' +
        'background:rgba(10,20,27,.88);color:#d8e7ee;font:12px monospace';
      const canvas = document.createElement('canvas');
      canvas.className = 'strategic-combat-map';
      canvas.setAttribute('aria-label', 'FleetCombat Einsatzgebiet');
      idleWorld = createFleetIdleWorldCanvas(canvas, arena, () => session.worldContacts);
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Test beenden';
      cancel.className = 'strategic-combat-return';
      cancel.hidden = false;
      const returnToLobby = (): void => {
        stop();
        root.replaceChildren(lobby);
      };
      cancel.addEventListener('click', returnToLobby);
      waiting.append(canvas, heading, status, cancel);
      root.replaceChildren(waiting);
      idleWorld.activate();
      onCombatActiveChange(true);

      const mountCombat = (): void => {
        const fleet = session.fleet;
        if (!fleet || panel) return;
        displayedFleet = fleet;
        const initialCameraPose = idleWorld?.pose();
        idleWorld?.deactivate();
        panel = createFleetNativeCombatPanel({
          root,
          canvas,
          initialCameraPose,
          combat: fleet.duels[0]!,
          spectator: true,
          parallelDuels: () => [
            ...fleet.getSnapshot().duels.slice(1),
            ...fleet.getSnapshot().supporters,
          ],
          parallelSupportStartIndex: fleet.duels.length - 1,
          parallelEscapedShipIds: () => fleet.getSnapshot().escapedShipIds,
          fleetEngagements: () => fleet.getSnapshot().engagements,
          isComplete: () => session.finished(),
          encounterName: 'KAMPAGNEN-SIMULATION',
          worldContacts: () => session.worldContacts,
          onReturn: returnToLobby,
        });
      };
      mountCombat();
      let previous = performance.now();
      const tick = (now: number): void => {
        if (destroyed || epoch !== generation) return;
        const dt = Math.min(Math.max(0, now - previous) / 1000, 0.08);
        previous = now;
        session.tick(dt);
        if (panel && displayedFleet !== session.fleet) {
          const cameraPose = panel.cameraPose();
          panel.destroy();
          panel = null;
          displayedFleet = null;
          waiting.prepend(canvas);
          root.replaceChildren(waiting);
          idleWorld?.restorePose(cameraPose);
          idleWorld?.activate();
        }
        mountCombat();
        if (panel) {
          panel.update();
        } else {
          idleWorld?.draw();
          const next = session.nextArrivalSeconds();
          status.textContent =
            'Schiffe im Einsatzgebiet: ' +
            session.arrivedCount +
            ' / ' +
            session.totalCount +
            ' · Warte auf feindlichen Kontakt. ' +
            (next === null
              ? 'Keine weiteren Verstärkungen vorgesehen.'
              : 'Nächster Eintritt in ' +
                Math.max(0, Math.ceil(next - session.elapsedSeconds)) +
                ' Sekunden.');
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    },
    destroy(): void {
      destroyed = true;
      stop();
    },
  };
}

export function createFleetTestLobby(
  root: HTMLElement,
  onBack: () => void,
  onCombatActiveChange: (active: boolean) => void = () => {}
): { destroy(): void } {
  const shell = document.createElement('section');
  shell.className = 'harrow-duel harrow-fleet';
  const heading = document.createElement('h1');
  heading.textContent = 'FLEETCOMBAT · KAMPAGNEN-TESTLABOR';
  const description = document.createElement('p');
  description.textContent =
    'Der Spieler ist immer dabei. Konfiguriere zivile NPCs, beide Piratengruppen ' +
    'und Sicherheitsdrohnen für den Start oder für ein zeitversetztes Eingreifen.';
  const map = labeledSelect('Kampfkarte', DUEL_MAPS);
  const incident = labeledSelect('Konflikt zwischen Spieler und NPCs', [
    { id: 'none', title: 'Keiner · neutral bis zum Angriff' },
    { id: 'player-attacks-npc', title: 'Spieler greift NPC an · Drohnen helfen NPC' },
    { id: 'npc-attacks-player', title: 'NPC greift Spieler an · Drohnen helfen Spieler' },
  ]);
  const settings = DEFAULT_FLEET_SCENARIO.map(createGroupControls);
  const options = document.createElement('div');
  options.className = 'harrow-fleet__options';
  options.append(map.wrapper, incident.wrapper);
  const groups = document.createElement('div');
  groups.className = 'harrow-fleet__groups';
  const always = document.createElement('p');
  always.textContent = 'SPIELER · 1 Schiff von Beginn an (fest)';
  groups.append(always, ...settings.map((entry) => entry.element));
  const capabilities = document.createElement('p');
  capabilities.className = 'harrow-fleet__capabilities';
  const roster = document.createElement('div');
  roster.className = 'harrow-fleet__roster';
  const actions = document.createElement('div');
  actions.className = 'harrow-duel__actions';
  const shuffle = document.createElement('button');
  shuffle.type = 'button';
  shuffle.textContent = 'Schiffe neu auslosen';
  const start = document.createElement('button');
  start.type = 'button';
  start.textContent = 'Simulation starten';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Zurück zum Hauptmenü';
  back.addEventListener('click', onBack);
  actions.append(back, shuffle, start);
  shell.append(heading, description, options, groups, capabilities, actions, roster);
  root.replaceChildren(shell);

  const launcher = createSimulatorLauncher(root, shell, onCombatActiveChange);
  let config: FleetTestConfiguration;
  const draw = (): void => {
    const counts = settings.map((entry) => ({
      group: entry.id,
      initial: Number(entry.initial.value),
      joining: Number(entry.joining.value),
      afterSeconds: Math.max(0, Math.min(3600, Number(entry.seconds.value) || 0)),
    }));
    config = {
      map: map.control.value as DuelMapKind,
      incident: incident.control.value as FleetScenarioIncident,
      groups: counts,
      ships: createFleetScenarioRoster(counts),
    };
    const startCount = config.ships.filter((ship) => ship.arrivalSeconds === 0).length;
    const laterCount = config.ships.length - startCount;
    capabilities.textContent =
      startCount +
      ' beim Start · ' +
      laterCount +
      ' zeitversetzte Nachrücker · gemeinsame native 1vs1-Kampf-Engine.';
    start.disabled = config.ships.length < 2;
    renderRoster(roster, config);
  };
  start.addEventListener('click', () => {
    if (!start.disabled) launcher.start(config);
  });
  shuffle.addEventListener('click', draw);
  for (const entry of settings) {
    entry.initial.addEventListener('change', draw);
    entry.joining.addEventListener('change', draw);
    entry.seconds.addEventListener('change', draw);
  }
  incident.control.addEventListener('change', draw);
  map.control.addEventListener('change', () => {
    config = { ...config, map: map.control.value as DuelMapKind };
  });
  draw();
  return {
    destroy() {
      launcher.destroy();
      shell.remove();
    },
  };
}
