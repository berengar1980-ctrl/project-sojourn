import { SHIP_MINE_CATALOG } from '../../data/combat/ship-mines';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import { DUEL_MAPS, type DuelMapKind } from '../../systems/combat/duel-arena-presets';
import { fitsWeaponHardpoint, getAllShipDefinitions, getShipsByRole } from '../../systems/ships';
import type { ShipDefinition } from '../../systems/ships';
import type { DuelDraft } from './duel-combatant-setup';
import { crewDefinitions } from '../../data/crew/crew-definitions';
import { duelCombatant } from './duel-combatant-setup';
import { createDuelArena } from '../../systems/combat/duel-arena-presets';
import { createFleetCombatService } from '../../systems/combat/fleet-combat-service';
import { createFleetCombatTestPanel } from './fleet-combat-test-panel';
import { getShipDefinition } from '../../systems/ships';

export type FleetTestRole = 'player' | 'miner' | 'drone' | 'pirate-a' | 'pirate-b';

export interface FleetTestShip {
  readonly team: 'player' | 'civilian' | 'security' | 'pirate-a' | 'pirate-b';
  readonly role: FleetTestRole;
  readonly id: string;
  readonly name: string;
  /** Drones have their own campaign entity type, not a fabricated ship hull. */
  readonly draft: DuelDraft | null;
  /** 0 for initial presence, otherwise simulated seconds until edge entry. */
  readonly spawnAtSeconds: number;
}

export interface FleetTestCounts {
  readonly miners: number;
  readonly drones: number;
  readonly piratesA: number;
  readonly piratesB: number;
}

export interface FleetTestConfiguration {
  readonly map: DuelMapKind;
  readonly playerShipId: string;
  readonly counts: FleetTestCounts;
  readonly ships: readonly FleetTestShip[];
  readonly rammingEnabled: true;
  readonly tractorAsteroidThrowEnabled: true;
}

function pick<T>(items: readonly T[]): T {
  if (!items.length) throw new Error('FleetCombat: no eligible ship definitions');
  return items[Math.floor(Math.random() * items.length)]!;
}

function previewDraft(ship: ShipDefinition): DuelDraft {
  const weapons = (SHIP_COMPONENT_CATALOG.weapon ?? []).filter((item) => item.tier === 1);
  const mines = SHIP_MINE_CATALOG.filter((item) => item.tier === 1);
  const weaponIds = (ship.sprite.hardpoints.weaponMounts ?? []).map((mount) => {
    const valid = weapons.filter(
      (item) => item.weapon && fitsWeaponHardpoint(ship, mount.slotIndex, item.weapon)
    );
    return valid.length ? pick(valid).id : '';
  });
  return {
    shipId: ship.id,
    weapons: weaponIds,
    mines: mines.length ? [pick(mines).id] : [],
    crewId: pick(crewDefinitions).id,
    reactorId: 'reactor4',
    engineId: 'engine1',
    shieldId: 'shield1',
    hullId: 'hull1',
    sensorId: 'sensor1',
    tractorId: 'tractor1',
  };
}

function boundedCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(10, Math.trunc(value))) : 0;
}

/**
 * Scenario setup shared by the FleetCombat test harness and (later) the career
 * encounter adapter. This does not start or modify StrategicCombatService.
 * Drones are explicit entities so their campaign sensor/AI code can be reused.
 */
export function createFleetTestScenario(
  map: DuelMapKind,
  playerShipId: string,
  counts: FleetTestCounts
): FleetTestConfiguration {
  const all = getAllShipDefinitions();
  const player = all.find((ship) => ship.id === playerShipId) ?? all[0]!;
  const miners = getShipsByRole('mining');
  const pirates = getShipsByRole('patrol');
  const normalized: FleetTestCounts = {
    miners: boundedCount(counts.miners),
    drones: boundedCount(counts.drones),
    piratesA: boundedCount(counts.piratesA),
    piratesB: boundedCount(counts.piratesB),
  };
  const roster: FleetTestShip[] = [
    {
      id: 'player',
      team: 'player',
      role: 'player',
      name: player.name,
      draft: previewDraft(player),
      spawnAtSeconds: 0,
    },
  ];
  const addShips = (
    role: 'miner' | 'pirate-a' | 'pirate-b',
    team: FleetTestShip['team'],
    count: number,
    pool: readonly ShipDefinition[]
  ): void => {
    for (let index = 0; index < count; index += 1) {
      const ship = pick(pool);
      roster.push({
        id: role + '-' + (index + 1),
        team,
        role,
        name: ship.name,
        draft: previewDraft(ship),
        spawnAtSeconds: 0,
      });
    }
  };
  addShips('miner', 'civilian', normalized.miners, miners);
  for (let index = 0; index < normalized.drones; index += 1) {
    roster.push({
      id: 'drone-' + (index + 1),
      team: 'security',
      role: 'drone',
      name: 'Sicherheitsdrohne',
      draft: null,
      spawnAtSeconds: 0,
    });
  }
  // Temporary loadout preview only. Real pirate hulls and NPC AI must come from
  // the shared campaign entity factories when the fleet runtime is connected.
  addShips('pirate-a', 'pirate-a', normalized.piratesA, pirates);
  addShips('pirate-b', 'pirate-b', normalized.piratesB, pirates);
  return {
    map,
    playerShipId: player.id,
    counts: normalized,
    ships: roster,
    rammingEnabled: true,
    tractorAsteroidThrowEnabled: true,
  };
}

function labeledSelect(label: string, values: readonly { id: string; title: string }[]) {
  const control = document.createElement('select');
  for (const value of values) control.append(new Option(value.title, value.id));
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  wrapper.append(control);
  return { wrapper, control };
}

function countSelect(label: string, initial: number) {
  const values = Array.from({ length: 11 }, (_, count) => ({
    id: String(count),
    title: String(count),
  }));
  const field = labeledSelect(label, values);
  field.control.value = String(initial);
  return field;
}

function createFleetPrototype(config: FleetTestConfiguration) {
  const arenaSeed = Math.floor(Math.random() * 0x7fffffff);
  const arena = createDuelArena(config.map, arenaSeed);
  const participants = config.ships.map((entry, index) => {
    if (!entry.draft) throw new Error('The initial 2vs1 test cannot run drone entities');
    const ship = getShipDefinition(entry.draft.shipId);
    if (!ship) throw new Error('Missing FleetCombat hull: ' + entry.draft.shipId);
    const setup = duelCombatant(index, entry.draft, ship);
    const isPlayer = entry.role === 'player';
    const distanceFactor = index === 1 ? -1 : 1;
    return {
      setup: { ...setup, id: entry.id, name: entry.name },
      factionId: isPlayer ? 'player' : 'pirate-a',
      position: {
        // Delayed contacts enter near the local map boundary, not at an existing ship.
        x: entry.spawnAtSeconds > 0 ? arena.width - 180 : arena.width * (isPlayer ? 0.27 : 0.72),
        y: arena.height * (isPlayer ? 0.5 : 0.5 + distanceFactor * 0.09),
      },
      targetId: isPlayer ? 'pirate-a-1' : 'player',
      spawnAtSeconds: entry.spawnAtSeconds,
    };
  });
  return createFleetCombatService(participants, arena);
}

function renderFleetRoster(
  roster: HTMLElement,
  config: FleetTestConfiguration,
  setArrival: (id: string, seconds: number) => void
): void {
  roster.replaceChildren();
  for (const [team, label] of [
    ['player', 'Spieler'],
    ['civilian', 'Miner'],
    ['security', 'Sicherheitsdrohnen'],
    ['pirate-a', 'Piraten · Fraktion A'],
    ['pirate-b', 'Piraten · Fraktion B'],
  ] as const) {
    const section = document.createElement('section');
    section.className = 'harrow-duel__card';
    const title = document.createElement('h2');
    const entries = config.ships.filter((entry) => entry.team === team);
    title.textContent = label + ' (' + entries.length + ')';
    section.append(title);
    for (const ship of entries) {
      const line = document.createElement('p');
      if (!ship.draft) {
        line.textContent = ship.id + ' · ' + ship.name + ' · Kampagnen-KI vorgesehen';
      } else {
        const weaponCatalog = SHIP_COMPONENT_CATALOG.weapon ?? [];
        const equipped = ship.draft.weapons
          .map((id) => weaponCatalog.find((item) => item.id === id)?.name)
          .filter(Boolean);
        const mine = SHIP_MINE_CATALOG.find((item) => item.id === ship.draft?.mines[0]);
        line.textContent = [
          ship.id.toUpperCase() + ' · ' + ship.name,
          equipped.join(', ') || 'Keine kompatiblen Waffenplätze',
          mine?.name ?? 'Keine Mine',
          'Reaktor Mk IV',
        ].join(' | ');
      }
      section.append(line);
      if (ship.role !== 'player' && ship.role !== 'drone') {
        const setting = document.createElement('div');
        setting.className = 'harrow-fleet__arrival';
        const initialLabel = document.createElement('label');
        initialLabel.textContent = 'Von Beginn an auf der Karte';
        const initial = document.createElement('input');
        initial.type = 'checkbox';
        initial.checked = ship.spawnAtSeconds === 0;
        const secondsLabel = document.createElement('label');
        secondsLabel.textContent = 'Eintritt nach (Sekunden)';
        const seconds = document.createElement('input');
        seconds.type = 'number';
        seconds.min = '1';
        seconds.max = '3600';
        seconds.step = '1';
        seconds.value = String(ship.spawnAtSeconds || 30);
        seconds.disabled = initial.checked;
        initialLabel.append(initial);
        secondsLabel.append(seconds);
        initial.addEventListener('change', () => {
          seconds.disabled = initial.checked;
          setArrival(ship.id, initial.checked ? 0 : Number(seconds.value));
        });
        seconds.addEventListener('change', () => {
          if (!initial.checked) setArrival(ship.id, Number(seconds.value));
        });
        setting.append(initialLabel, secondsLabel);
        section.append(setting);
      }
    }
    roster.append(section);
  }
}

export function createFleetTestLobby(root: HTMLElement, onBack: () => void): { destroy(): void } {
  const shell = document.createElement('section');
  shell.className = 'harrow-duel harrow-fleet';
  const heading = document.createElement('h1');
  heading.textContent = 'FLEETCOMBAT · TESTLABOR';
  const description = document.createElement('p');
  description.textContent =
    'Szenario einer gemeinsamen lokalen Karte: Der Spieler ist immer dabei. Zivile Miner, Sicherheitsdrohnen und zwei Piratenfraktionen werden unabhängig konfiguriert.';
  const map = labeledSelect('Kampfkarte', DUEL_MAPS);
  const player = labeledSelect(
    'Spielerschiff (immer vorhanden)',
    getAllShipDefinitions().map((ship) => ({ id: ship.id, title: ship.name }))
  );
  const miners = countSelect('NPC-Miner', 2);
  const drones = countSelect('Sicherheitsdrohnen', 1);
  const piratesA = countSelect('Piraten · Fraktion A', 1);
  const piratesB = countSelect('Piraten · Fraktion B', 1);
  const options = document.createElement('div');
  options.className = 'harrow-fleet__options';
  options.append(
    map.wrapper,
    player.wrapper,
    miners.wrapper,
    drones.wrapper,
    piratesA.wrapper,
    piratesB.wrapper
  );
  const capabilities = document.createElement('p');
  capabilities.className = 'harrow-fleet__capabilities';
  capabilities.textContent =
    'Testaufbau · Der gemeinsame 2vs1-Kampfkern ist für 0 Miner, 0 Drohnen, 2 Piraten A und 0 Piraten B verfügbar. Kampagnen-NPC-KI, Minen, Traktor und vollständige Waffenphysik folgen.';
  const roster = document.createElement('div');
  roster.className = 'harrow-fleet__roster';
  const actions = document.createElement('div');
  actions.className = 'harrow-duel__actions';
  const shuffle = document.createElement('button');
  shuffle.type = 'button';
  shuffle.textContent = 'Ausrüstung neu auslosen';
  const start = document.createElement('button');
  start.type = 'button';
  start.textContent = '2vs1-Prototyp starten';
  start.disabled = true;
  start.title = 'Aktuell nur Spieler gegen zwei Piraten derselben Fraktion ohne Miner oder Drohnen';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Zurück zum Hauptmenü';
  back.addEventListener('click', onBack);
  actions.append(back, shuffle, start);
  shell.append(heading, description, options, capabilities, actions, roster);
  root.replaceChildren(shell);

  let config: FleetTestConfiguration;
  let activePanel: ReturnType<typeof createFleetCombatTestPanel> | null = null;
  const canLaunch = (): boolean =>
    config.counts.miners === 0 &&
    config.counts.drones === 0 &&
    config.counts.piratesA === 2 &&
    config.counts.piratesB === 0;
  const updateLaunch = (): void => {
    start.disabled = !canLaunch();
    start.title = canLaunch()
      ? 'Experimenteller 2vs1-Kern, noch ohne Minen, Traktor und vollständige Waffenphysik'
      : 'Für den ersten Test: 0 Miner, 0 Drohnen, 2 Piraten A und 0 Piraten B auswählen';
  };
  start.addEventListener('click', () => {
    if (!canLaunch()) return;
    const combat = createFleetPrototype(config);
    activePanel?.destroy();
    activePanel = createFleetCombatTestPanel(root, combat, () => {
      activePanel?.destroy();
      activePanel = null;
      root.replaceChildren(shell);
    });
  });
  const counts = (): FleetTestCounts => ({
    miners: Number(miners.control.value),
    drones: Number(drones.control.value),
    piratesA: Number(piratesA.control.value),
    piratesB: Number(piratesB.control.value),
  });
  const setArrival = (id: string, seconds: number): void => {
    const spawnAtSeconds = seconds === 0 ? 0 : Math.max(1, Math.min(3600, Number.isFinite(seconds) ? Math.floor(seconds) : 30));
    config = {
      ...config,
      ships: config.ships.map((ship) => ship.id === id ? { ...ship, spawnAtSeconds } : ship),
    };
    renderFleetRoster(roster, config, setArrival);
  };
  const draw = (): void => {
    const oldArrivals = new Map((config?.ships ?? []).map((ship) => [ship.id, ship.spawnAtSeconds]));
    config = createFleetTestScenario(
      map.control.value as DuelMapKind,
      player.control.value,
      counts()
    );
    config = {
      ...config,
      ships: config.ships.map((ship) => ({
        ...ship,
        spawnAtSeconds: oldArrivals.get(ship.id) ?? 0,
      })),
    };
    renderFleetRoster(roster, config, setArrival);
    updateLaunch();
  };
  shuffle.addEventListener('click', draw);
  for (const select of [
    map.control,
    player.control,
    miners.control,
    drones.control,
    piratesA.control,
    piratesB.control,
  ])
    select.addEventListener('change', draw);
  draw();
  return {
    destroy: () => {
      activePanel?.destroy();
      shell.remove();
    },
  };
}
