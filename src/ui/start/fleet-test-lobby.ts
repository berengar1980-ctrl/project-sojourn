import { SHIP_MINE_CATALOG } from '../../data/combat/ship-mines';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import { DUEL_MAPS, type DuelMapKind } from '../../systems/combat/duel-arena-presets';
import { fitsWeaponHardpoint, getAllShipDefinitions, getShipsByRole } from '../../systems/ships';
import type { ShipDefinition } from '../../systems/ships';
import type { DuelDraft } from './duel-combatant-setup';
import { crewDefinitions } from '../../data/crew/crew-definitions';

export type FleetTestRole = 'player' | 'miner' | 'drone' | 'pirate-a' | 'pirate-b';

export interface FleetTestShip {
  readonly team: 'player' | 'civilian' | 'security' | 'pirate-a' | 'pirate-b';
  readonly role: FleetTestRole;
  readonly id: string;
  readonly name: string;
  /** Drones have their own campaign entity type, not a fabricated ship hull. */
  readonly draft: DuelDraft | null;
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
    { id: 'player', team: 'player', role: 'player', name: player.name, draft: previewDraft(player) },
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
    map.wrapper, player.wrapper, miners.wrapper, drones.wrapper,
    piratesA.wrapper, piratesB.wrapper
  );
  const capabilities = document.createElement('p');
  capabilities.className = 'harrow-fleet__capabilities';
  capabilities.textContent =
    'Testaufbau · Die gemeinsame Kampfsimulation und die Kampagnen-NPC-KI sind noch nicht angeschlossen. Es werden keine separaten 1vs1-Kämpfe als FleetCombat vorgetäuscht.';
  const roster = document.createElement('div');
  roster.className = 'harrow-fleet__roster';
  const actions = document.createElement('div');
  actions.className = 'harrow-duel__actions';
  const shuffle = document.createElement('button');
  shuffle.type = 'button';
  shuffle.textContent = 'Ausrüstung neu auslosen';
  const start = document.createElement('button');
  start.type = 'button';
  start.textContent = 'FleetCombat starten (Simulation in Arbeit)';
  start.disabled = true;
  start.title = 'Start erst nach Anbindung einer gemeinsamen Mehrschiff-Simulation';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Zurück zum Hauptmenü';
  back.addEventListener('click', onBack);
  actions.append(back, shuffle, start);
  shell.append(heading, description, options, capabilities, actions, roster);
  root.replaceChildren(shell);

  let config: FleetTestConfiguration;
  const counts = (): FleetTestCounts => ({
    miners: Number(miners.control.value),
    drones: Number(drones.control.value),
    piratesA: Number(piratesA.control.value),
    piratesB: Number(piratesB.control.value),
  });
  const draw = (): void => {
    config = createFleetTestScenario(map.control.value as DuelMapKind, player.control.value, counts());
    roster.replaceChildren();
    for (const [team, label] of [
      ['player', 'Spieler'], ['civilian', 'Miner'], ['security', 'Sicherheitsdrohnen'],
      ['pirate-a', 'Piraten · Fraktion A'], ['pirate-b', 'Piraten · Fraktion B'],
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
      }
      roster.append(section);
    }
  };
  shuffle.addEventListener('click', draw);
  for (const select of [
    map.control, player.control, miners.control, drones.control,
    piratesA.control, piratesB.control,
  ]) select.addEventListener('change', draw);
  draw();
  return { destroy: () => shell.remove() };
}
