import {
  getAllShipDefinitions,
  getShipComponent,
  fitsWeaponHardpoint,
  resolveShipCombatMovementStats,
  shipHullMaxHp,
  shipShieldMaxHp,
  type ShipDefinition,
} from '../../systems/ships';
import {
  createCombatShieldGeometry,
  createStrategicCombatService,
  type StrategicCombatantSetup,
} from '../../systems/combat';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import { createStrategicCombatPanel } from '../combat/strategic-combat-panel';

interface DuelDraft {
  shipId: string;
  weapons: string[];
  crew: number;
}

export function createDuelLobby(root: HTMLElement, onBack: () => void): { destroy(): void } {
  const ships = getAllShipDefinitions();
  const weapons = SHIP_COMPONENT_CATALOG.weapon ?? [];
  const drafts: [DuelDraft, DuelDraft] = [
    { shipId: ships[0]!.id, weapons: [], crew: 50 },
    { shipId: ships.find((ship) => ship.role === 'patrol')?.id ?? ships[1]!.id, weapons: [], crew: 50 },
  ];
  let activePanel: ReturnType<typeof createStrategicCombatPanel> | null = null;
  let canceled = false;
  let frame = 0;
  const shell = document.createElement('section');
  shell.className = 'harrow-duel';
  const title = document.createElement('h1');
  title.textContent = 'HARROWDRIFT · LOKALES DUELL';
  const description = document.createElement('p');
  description.textContent = 'Beide Spieler konfigurieren ihre Schiffe und Crews. Im Gefecht übernimmt jeweils die Kampf-KI.';
  const cards = document.createElement('div');
  cards.className = 'harrow-duel__cards';
  const actions = document.createElement('div');
  actions.className = 'harrow-duel__actions';
  const back = document.createElement('button');
  back.textContent = 'Zurück zum Hauptmenü';
  back.addEventListener('click', onBack);
  const fight = document.createElement('button');
  fight.textContent = 'Duell starten';
  actions.append(back, fight);
  shell.append(title, description, cards, actions);
  root.replaceChildren(shell);

  const shipFor = (index: number): ShipDefinition =>
    ships.find((ship) => ship.id === drafts[index]!.shipId) ?? ships[0]!;

  const configure = (index: number): void => {
    const draft = drafts[index]!;
    const card = document.createElement('section');
    card.className = 'harrow-duel__card';
    const heading = document.createElement('h2');
    heading.textContent = 'Spieler ' + (index + 1);
    const shipLabel = document.createElement('label');
    shipLabel.textContent = 'Schiff';
    const shipSelect = document.createElement('select');
    for (const ship of ships) {
      const option = document.createElement('option');
      option.value = ship.id;
      option.textContent = ship.name;
      shipSelect.append(option);
    }
    shipSelect.value = draft.shipId;
    shipSelect.addEventListener('change', () => {
      draft.shipId = shipSelect.value;
      draft.weapons = [];
      render();
    });
    shipLabel.append(shipSelect);
    card.append(heading, shipLabel);
    const current = shipFor(index);
    for (const mount of current.sprite.hardpoints.weaponMounts ?? []) {
      const label = document.createElement('label');
      label.textContent = 'Waffenplatz ' + (mount.slotIndex + 1) + ' · ' + mount.facing;
      const select = document.createElement('select');
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Nicht ausgerüstet';
      select.append(empty);
      for (const weapon of weapons) {
        if (!weapon.weapon || !fitsWeaponHardpoint(current, mount.slotIndex, weapon.weapon)) {
          continue;
        }
        const option = document.createElement('option');
        option.value = weapon.id;
        option.textContent = weapon.name;
        select.append(option);
      }
      if (!draft.weapons[mount.slotIndex]) {
        draft.weapons[mount.slotIndex] = select.options[1]?.value ?? '';
      }
      select.value = draft.weapons[mount.slotIndex] ?? '';
      select.addEventListener('change', () => { draft.weapons[mount.slotIndex] = select.value; });
      label.append(select);
      card.append(label);
    }
    const crewLabel = document.createElement('label');
    crewLabel.textContent = 'Crew-Erfahrung';
    const crew = document.createElement('select');
    for (const [value, name] of [[25, 'Rekruten'], [50, 'Erfahren'], [75, 'Veteranen'], [95, 'Elite']] as const) {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = name;
      crew.append(option);
    }
    crew.value = String(draft.crew);
    crew.addEventListener('change', () => { draft.crew = Number(crew.value); });
    crewLabel.append(crew);
    card.append(crewLabel);
    cards.append(card);
  };

  const render = (): void => {
    cards.replaceChildren();
    configure(0);
    configure(1);
  };

  const combatant = (index: number): StrategicCombatantSetup => {
    const draft = drafts[index]!;
    const ship = shipFor(index);
    const hardpoints = ship.sprite.hardpoints;
    const scale = ship.nominalLengthMeters / hardpoints.sourceWidth;
    const selected = draft.weapons.flatMap((id, slotIndex) => {
      const component = getShipComponent('weapon', id);
      return component?.weapon && fitsWeaponHardpoint(ship, slotIndex, component.weapon)
        ? [{ component, slotIndex }] : [];
    });
    const crew = draft.crew / 100;
    return {
      id: 'duelist-' + index,
      name: 'Spieler ' + (index + 1) + ' · ' + ship.name,
      shipId: ship.id,
      shieldHp: shipShieldMaxHp(ship),
      shieldGeometry: createCombatShieldGeometry(hardpoints, ship.nominalLengthMeters),
      hullHp: shipHullMaxHp(ship, 0),
      weapons: selected.map((entry) => entry.component),
      weaponMounts: selected.flatMap((entry, slotIndex) => {
        const mount = hardpoints.weaponMounts?.find((point) => point.slotIndex === entry.slotIndex);
        return mount ? [{
          slotIndex,
          x: (mount.x - hardpoints.pivot.x) * scale,
          y: (mount.y - hardpoints.pivot.y) * scale,
          facing: mount.facing,
          ...(mount.arcDegrees !== undefined ? { arcDegrees: mount.arcDegrees } : {}),
          ...(mount.allowedMounts ? { allowedMounts: mount.allowedMounts } : {}),
          ...(mount.allowedFamilies ? { allowedFamilies: mount.allowedFamilies } : {}),
        }] : [];
      }),
      hitChance: 0.58 + crew * 0.24,
      dodgeChance: crew * 0.13,
      damageMultiplier: 0.95 + crew * 0.16,
      criticalChance: crew * 0.12,
      cycleTimeMultiplier: 1.12 - crew * 0.18,
      preferredTactic: 'fight',
      ...resolveShipCombatMovementStats(ship),
      tractorRangeMeters: hardpoints.tractorBeams.length ? 400 : 0,
      aiControlled: true,
      aiAggression: 90,
    };
  };

  fight.addEventListener('click', () => {
    const combat = createStrategicCombatService(combatant(0), combatant(1));
    activePanel = createStrategicCombatPanel({
      root,
      combat,
      onReturn: () => {
        cancelAnimationFrame(frame);
        activePanel?.destroy();
        activePanel = null;
        root.replaceChildren(shell);
      },
    });
    let previous = performance.now();
    const tick = (now: number): void => {
      if (canceled || !activePanel) return;
      const dt = Math.min((now - previous) / 1000, 0.08);
      previous = now;
      combat.tick(dt);
      activePanel.update();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });

  render();
  return {
    destroy() {
      canceled = true;
      cancelAnimationFrame(frame);
      activePanel?.destroy();
      shell.remove();
    },
  };
}
