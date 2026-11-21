import { SHIP_MINE_CATALOG } from '../../data/combat/ship-mines';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import { DUEL_MAPS, type DuelMapKind } from '../../systems/combat/duel-arena-presets';
import { fitsWeaponHardpoint, getAllShipDefinitions, getShipDefinition } from '../../systems/ships';
import { duelCombatant } from './duel-combatant-setup';
import { createParallelNativeDuels } from '../../systems/combat/parallel-native-duels';
import { createDuelArena } from '../../systems/combat/duel-arena-presets';
import { createStrategicCombatPanel } from '../combat/strategic-combat-panel';
import type { DuelDraft } from './duel-combatant-setup';
import { crewDefinitions } from '../../data/crew/crew-definitions';

export interface FleetTestShip {
  readonly team: 'a' | 'b';
  readonly id: string;
  readonly name: string;
  readonly draft: DuelDraft;
}

export interface FleetTestConfiguration {
  readonly map: DuelMapKind;
  readonly ships: readonly FleetTestShip[];
  readonly rammingEnabled: true;
  readonly tractorAsteroidThrowEnabled: true;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Preview-only loadouts. The FleetCombat runtime must consume these later, not the 1vs1 service. */
export function createFleetTestRoster(countA: number, countB: number): FleetTestShip[] {
  const ships = getAllShipDefinitions();
  const weapons = (SHIP_COMPONENT_CATALOG.weapon ?? []).filter((item) => item.tier === 1);
  const mines = SHIP_MINE_CATALOG.filter((item) => item.tier === 1);
  const roster: FleetTestShip[] = [];
  for (const team of ['a', 'b'] as const) {
    const count = team === 'a' ? countA : countB;
    for (let index = 0; index < count; index += 1) {
      const ship = pick(ships);
      const weaponIds = (ship.sprite.hardpoints.weaponMounts ?? []).map((mount) => {
        const valid = weapons.filter((item) => {
          if (!item.weapon) return false;
          return fitsWeaponHardpoint(ship, mount.slotIndex, item.weapon);
        });
        return valid.length ? pick(valid).id : '';
      });
      const draft: DuelDraft = {
        shipId: ship.id,
        weapons: weaponIds,
        mines: [pick(mines).id],
        crewId: pick(crewDefinitions).id,
        reactorId: 'reactor4',
        engineId: 'engine1',
        shieldId: 'shield1',
        hullId: 'hull1',
        sensorId: 'sensor1',
        tractorId: 'tractor1',
      };
      roster.push({
        team,
        id: team + '-' + (index + 1),
        name: ship.name,
        draft,
      });
    }
  }
  return roster;
}

function labeledSelect(label: string, values: readonly { id: string; title: string }[]) {
  const control = document.createElement('select');
  for (const value of values) control.append(new Option(value.title, value.id));
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  wrapper.append(control);
  return { wrapper, control };
}

function teamCount(label: string, initial: number) {
  const choices = Array.from({ length: 2 }, (_, i) => ({
    id: String(i + 1),
    title: String(i + 1) + (i === 0 ? ' Schiff' : ' Schiffe'),
  }));
  const result = labeledSelect(label, choices);
  result.control.value = String(initial);
  return result;
}

export function createFleetTestLobby(
  root: HTMLElement,
  onBack: () => void,
  onCombatActiveChange: (active: boolean) => void = () => {}
): { destroy(): void } {
  const shell = document.createElement('section');
  shell.className = 'harrow-duel harrow-fleet';
  const heading = document.createElement('h1');
  heading.textContent = 'FLEETCOMBAT · TESTLABOR';
  const description = document.createElement('p');
  description.textContent =
    'Erster Integrationstest: zwei originale 1vs1-Kämpfe parallel auf derselben Karte. ' +
    '2 gegen 1 folgt nach diesem Test; die unveränderte 1vs1-KI steuert alle Schiffe.';
  const map = labeledSelect('Kampfkarte', DUEL_MAPS);
  const teamA = teamCount('Fraktion A', 2);
  const teamB = teamCount('Fraktion B', 2);
  const options = document.createElement('div');
  options.className = 'harrow-fleet__options';
  options.append(map.wrapper, teamA.wrapper, teamB.wrapper);
  const capabilities = document.createElement('p');
  capabilities.className = 'harrow-fleet__capabilities';
  capabilities.textContent =
    '2 vs 2: zwei unabhängige native Duelle, eine gemeinsame Karte und Kollisionswelt.';
  const roster = document.createElement('div');
  roster.className = 'harrow-fleet__roster';
  const actions = document.createElement('div');
  actions.className = 'harrow-duel__actions';
  const shuffle = document.createElement('button');
  shuffle.type = 'button';
  shuffle.textContent = 'Schiffe neu auslosen';
  const start = document.createElement('button');
  start.type = 'button';
  start.textContent = '2 vs 2 starten';
  start.title = 'Zwei echte 1vs1-Duelle auf derselben vorhandenen Karte';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'Zurück zum Hauptmenü';
  back.addEventListener('click', onBack);
  actions.append(back, shuffle, start);
  shell.append(heading, description, options, capabilities, actions, roster);
  root.replaceChildren(shell);

  let config: FleetTestConfiguration;
  let activePanel: ReturnType<typeof createStrategicCombatPanel> | null = null;
  let frame = 0;
  let stopped = false;
  let generation = 0;
  const returnToLobby = (): void => {
    generation++;
    cancelAnimationFrame(frame);
    activePanel?.destroy();
    activePanel = null;
    root.replaceChildren(shell);
    onCombatActiveChange(false);
  };
  const draw = (): void => {
    config = {
      map: map.control.value as DuelMapKind,
      ships: createFleetTestRoster(Number(teamA.control.value), Number(teamB.control.value)),
      rammingEnabled: true,
      tractorAsteroidThrowEnabled: true,
    };
    const supported = Number(teamA.control.value) === 2 && Number(teamB.control.value) === 2;
    start.disabled = !supported;
    start.title = supported
      ? 'Zwei echte 1vs1-Duelle starten'
      : '2 gegen 1 ist der nächste Schritt nach dem 2-gegen-2-Test';
    capabilities.textContent = supported
      ? '2 vs 2: zwei native Duelle, eine Karte, gemeinsame Kollisionen.'
      : 'Diese Konstellation folgt nach dem ersten erfolgreichen 2-vs-2-Test.';
    roster.replaceChildren();
    for (const team of ['a', 'b'] as const) {
      const section = document.createElement('section');
      section.className = 'harrow-duel__card';
      const title = document.createElement('h2');
      title.textContent = 'Fraktion ' + team.toUpperCase();
      section.append(title);
      for (const ship of config.ships.filter((entry) => entry.team === team)) {
        const line = document.createElement('p');
        const weaponCatalog = SHIP_COMPONENT_CATALOG.weapon ?? [];
        const equipped = ship.draft.weapons
          .map((id) => weaponCatalog.find((item) => item.id === id)?.name)
          .filter(Boolean);
        const mine = SHIP_MINE_CATALOG.find((item) => item.id === ship.draft.mines[0]);
        line.textContent = [
          ship.id.toUpperCase() + ' · ' + ship.name,
          equipped.join(', ') || 'Keine kompatiblen Waffenplätze',
          mine?.name ?? 'Keine Mine',
          'Reaktor Mk IV',
        ].join(' | ');
        section.append(line);
      }
      roster.append(section);
    }
  };
  start.addEventListener('click', () => {
    if (start.disabled || stopped) return;
    generation++;
    const current = generation;
    cancelAnimationFrame(frame);
    activePanel?.destroy();
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const arena = createDuelArena(config.map, seed);
    const ships = config.ships.map((ship, index) => {
      const definition = getShipDefinition(ship.draft.shipId);
      if (!definition) throw new Error('Unbekanntes Duellschiff: ' + ship.draft.shipId);
      const setup = duelCombatant(index, ship.draft, definition);
      return {
        id: ship.id,
        team: ship.team,
        setup: { ...setup, id: ship.id, name: ship.id.toUpperCase() + ' · ' + ship.name },
      };
    });
    const duels = createParallelNativeDuels(ships, arena, seed);
    onCombatActiveChange(true);
    activePanel = createStrategicCombatPanel({
      root,
      combat: duels.duels[0]!,
      spectator: true,
      parallelDuels: () => duels.getSnapshot().duels.slice(1),
      isComplete: () => duels.getSnapshot().finished,
      encounterName: 'Zwei parallele 1vs1-Duelle',
      onReturn: returnToLobby,
    });
    let previous = performance.now();
    const tick = (now: number): void => {
      if (stopped || !activePanel || current !== generation) return;
      const dt = Math.min((now - previous) / 1000, 0.08);
      previous = now;
      duels.tick(dt);
      activePanel.update();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
  shuffle.addEventListener('click', draw);
  teamA.control.addEventListener('change', draw);
  teamB.control.addEventListener('change', draw);
  map.control.addEventListener('change', () => {
    // Map choice is retained without re-rolling ship equipment.
    config = { ...config, map: map.control.value as DuelMapKind };
  });
  draw();
  return {
    destroy() {
      stopped = true;
      generation++;
      cancelAnimationFrame(frame);
      activePanel?.destroy();
      onCombatActiveChange(false);
      shell.remove();
    },
  };
}
