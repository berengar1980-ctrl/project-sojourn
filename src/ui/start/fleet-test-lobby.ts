import { SHIP_MINE_CATALOG } from '../../data/combat/ship-mines';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import { DUEL_MAPS, type DuelMapKind } from '../../systems/combat/duel-arena-presets';
import { fitsWeaponHardpoint, getAllShipDefinitions } from '../../systems/ships';
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

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

/** Preview-only loadouts. The FleetCombat runtime must consume these later, not the 1vs1 service. */
export function createFleetTestRoster(countA: number, countB: number): FleetTestShip[] {
  const ships = getAllShipDefinitions();
  const weapons = (SHIP_COMPONENT_CATALOG.weapon ?? []).filter((item) => item.tier === 1);
  const mines = SHIP_MINE_CATALOG.filter((item) => item.tier === 1);
  const roster: FleetTestShip[] = [];
  for (const [team, count] of [['a', countA], ['b', countB]] as const) {
    for (let index = 0; index < count; index += 1) {
      const ship = pick(ships);
      const weaponIds = (ship.sprite.hardpoints.weaponMounts ?? []).map((mount) => {
        const valid = weapons.filter((item) =>
          fitsWeaponHardpoint(ship, mount.slotIndex, item.weapon)
        );
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
  const choices = Array.from({ length: 10 }, (_, i) => ({
    id: String(i + 1),
    title: String(i + 1) + (i === 0 ? ' Schiff' : ' Schiffe'),
  }));
  const result = labeledSelect(label, choices);
  result.control.value = String(initial);
  return result;
}

export function createFleetTestLobby(root: HTMLElement): { destroy(): void } {
  const shell = document.createElement('section');
  shell.className = 'harrow-duel harrow-fleet';
  const heading = document.createElement('h1');
  heading.textContent = 'FLEETCOMBAT · TESTLABOR';
  const description = document.createElement('p');
  description.textContent =
    'Vorbereitung für Mehrschiffgefechte. Der neue Kampfkern wird erst im nächsten Schritt angebunden; bestehende 1vs1-Duelle bleiben unverändert.';
  const map = labeledSelect('Kampfkarte', DUEL_MAPS);
  const teamA = teamCount('Fraktion A', 2);
  const teamB = teamCount('Fraktion B', 1);
  const options = document.createElement('div');
  options.className = 'harrow-fleet__options';
  options.append(map.wrapper, teamA.wrapper, teamB.wrapper);
  const capabilities = document.createElement('p');
  capabilities.className = 'harrow-fleet__capabilities';
  capabilities.textContent =
    'Geplant: Rammen · Asteroidenwurf mit Traktorstrahl · dynamische Zielwechsel · Verstärkung';
  const roster = document.createElement('div');
  roster.className = 'harrow-fleet__roster';
  const actions = document.createElement('div');
  actions.className = 'harrow-duel__actions';
  const shuffle = document.createElement('button');
  shuffle.type = 'button';
  shuffle.textContent = 'Schiffe neu auslosen';
  const start = document.createElement('button');
  start.type = 'button';
  start.textContent = 'FleetCombat starten (noch nicht verfügbar)';
  start.disabled = true;
  start.title = 'Wird aktiviert, sobald die Mehrschiff-Simulation implementiert ist';
  actions.append(shuffle, start);
  shell.append(heading, description, options, capabilities, actions, roster);
  root.replaceChildren(shell);

  let config: FleetTestConfiguration;
  const draw = (): void => {
    config = {
      map: map.control.value as DuelMapKind,
      ships: createFleetTestRoster(Number(teamA.control.value), Number(teamB.control.value)),
      rammingEnabled: true,
      tractorAsteroidThrowEnabled: true,
    };
    roster.replaceChildren();
    for (const team of ['a', 'b'] as const) {
      const section = document.createElement('section');
      section.className = 'harrow-duel__card';
      const title = document.createElement('h2');
      title.textContent = 'Fraktion ' + team.toUpperCase();
      section.append(title);
      for (const ship of config.ships.filter((entry) => entry.team === team)) {
        const line = document.createElement('p');
        const equipped = ship.draft.weapons
          .map((id) => (SHIP_COMPONENT_CATALOG.weapon ?? []).find((item) => item.id === id)?.name)
          .filter(Boolean);
        const mine = SHIP_MINE_CATALOG.find((item) => item.id === ship.draft.mines[0]);
        line.textContent =
          ship.id.toUpperCase() +
          ' · ' +
          ship.name +
          ' | ' +
          (equipped.join(', ') || 'Keine kompatiblen Waffenplätze') +
          ' | ' +
          (mine?.name ?? 'Keine Mine') +
          ' | Reaktor Mk IV';
        section.append(line);
      }
      roster.append(section);
    }
  };
  shuffle.addEventListener('click', draw);
  teamA.control.addEventListener('change', draw);
  teamB.control.addEventListener('change', draw);
  map.control.addEventListener('change', () => {
    // Map choice is retained without re-rolling ship equipment.
    config = { ...config, map: map.control.value as DuelMapKind };
  });
  draw();
  return { destroy: () => shell.remove() };
}
