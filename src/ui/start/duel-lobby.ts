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

function createLabel(text: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.textContent = text;
  label.append(control);
  return label;
}

function shipSelector(
  draft: DuelDraft,
  ships: readonly ShipDefinition[],
  rerender: () => void
): HTMLLabelElement {
  const select = document.createElement('select');
  for (const ship of ships) {
    const option = document.createElement('option');
    option.value = ship.id;
    option.textContent = ship.name;
    select.append(option);
  }
  select.value = draft.shipId;
  select.addEventListener('change', () => {
    draft.shipId = select.value;
    draft.weapons = [];
    rerender();
  });
  return createLabel('Schiff', select);
}

function weaponSelectors(draft: DuelDraft, ship: ShipDefinition): HTMLLabelElement[] {
  const catalog = SHIP_COMPONENT_CATALOG.weapon ?? [];
  return (ship.sprite.hardpoints.weaponMounts ?? []).map((mount) => {
    const select = document.createElement('select');
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Nicht ausgerüstet';
    select.append(empty);
    for (const component of catalog) {
      if (!component.weapon || !fitsWeaponHardpoint(ship, mount.slotIndex, component.weapon)) {
        continue;
      }
      const option = document.createElement('option');
      option.value = component.id;
      option.textContent = component.name;
      select.append(option);
    }
    if (!draft.weapons[mount.slotIndex]) {
      draft.weapons[mount.slotIndex] = select.options[1]?.value ?? '';
    }
    select.value = draft.weapons[mount.slotIndex] ?? '';
    select.addEventListener('change', () => {
      draft.weapons[mount.slotIndex] = select.value;
    });
    return createLabel('Waffenplatz ' + (mount.slotIndex + 1) + ' · ' + mount.facing, select);
  });
}

function crewSelector(draft: DuelDraft): HTMLLabelElement {
  const select = document.createElement('select');
  for (const [value, label] of [
    [25, 'Rekruten'],
    [50, 'Erfahren'],
    [75, 'Veteranen'],
    [95, 'Elite'],
  ] as const) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = label;
    select.append(option);
  }
  select.value = String(draft.crew);
  select.addEventListener('change', () => {
    draft.crew = Number(select.value);
  });
  return createLabel('Crew-Erfahrung', select);
}

function playerCard(
  index: number,
  draft: DuelDraft,
  ships: readonly ShipDefinition[],
  rerender: () => void
): HTMLElement {
  const card = document.createElement('section');
  card.className = 'harrow-duel__card';
  const heading = document.createElement('h2');
  heading.textContent = 'Spieler ' + (index + 1);
  const ship = ships.find((entry) => entry.id === draft.shipId) ?? ships[0]!;
  card.append(heading, shipSelector(draft, ships, rerender));
  card.append(...weaponSelectors(draft, ship));
  card.append(crewSelector(draft));
  return card;
}

function duelCombatant(
  index: number,
  draft: DuelDraft,
  ship: ShipDefinition
): StrategicCombatantSetup {
  const points = ship.sprite.hardpoints;
  const scale = ship.nominalLengthMeters / points.sourceWidth;
  const equipped = draft.weapons.flatMap((id, slotIndex) => {
    const component = getShipComponent('weapon', id);
    return component?.weapon && fitsWeaponHardpoint(ship, slotIndex, component.weapon)
      ? [{ component, slotIndex }]
      : [];
  });
  const mounts = equipped.flatMap((entry, slotIndex) => {
    const mount = points.weaponMounts?.find((point) => point.slotIndex === entry.slotIndex);
    return mount
      ? [{
          slotIndex,
          x: (mount.x - points.pivot.x) * scale,
          y: (mount.y - points.pivot.y) * scale,
          facing: mount.facing,
          ...(mount.arcDegrees !== undefined ? { arcDegrees: mount.arcDegrees } : {}),
          ...(mount.allowedMounts ? { allowedMounts: mount.allowedMounts } : {}),
          ...(mount.allowedFamilies ? { allowedFamilies: mount.allowedFamilies } : {}),
        }]
      : [];
  });
  const experience = draft.crew / 100;
  return {
    id: 'duelist-' + index,
    name: 'Spieler ' + (index + 1) + ' · ' + ship.name,
    shipId: ship.id,
    shieldHp: shipShieldMaxHp(ship),
    shieldGeometry: createCombatShieldGeometry(points, ship.nominalLengthMeters),
    hullHp: shipHullMaxHp(ship),
    weapons: equipped.map((entry) => entry.component),
    weaponMounts: mounts,
    hitChance: 0.58 + experience * 0.24,
    dodgeChance: experience * 0.13,
    damageMultiplier: 0.95 + experience * 0.16,
    criticalChance: experience * 0.12,
    cycleTimeMultiplier: 1.12 - experience * 0.18,
    preferredTactic: 'fight',
    ...resolveShipCombatMovementStats(ship),
    tractorRangeMeters: points.tractorBeams.length ? 400 : 0,
    aiControlled: true,
    aiAggression: 90,
  };
}

export function createDuelLobby(root: HTMLElement, onBack: () => void): { destroy(): void } {
  const ships = getAllShipDefinitions();
  const drafts: [DuelDraft, DuelDraft] = [
    { shipId: ships[0]!.id, weapons: [], crew: 50 },
    { shipId: ships.find((ship) => ship.role === 'patrol')?.id ?? ships[1]!.id, weapons: [], crew: 50 },
  ];
  const shell = document.createElement('section');
  shell.className = 'harrow-duel';
  const title = document.createElement('h1');
  title.textContent = 'HARROWDRIFT · LOKALES DUELL';
  const description = document.createElement('p');
  description.textContent = 'Zwei Schiffe mit individuellen Waffen und Crew-Erfahrung. Danach übernehmen die Kampf-KIs.';
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

  let activePanel: ReturnType<typeof createStrategicCombatPanel> | null = null;
  let canceled = false;
  let frame = 0;
  const render = (): void => {
    cards.replaceChildren(...drafts.map((draft, index) => playerCard(index, draft, ships, render)));
  };
  fight.addEventListener('click', () => {
    const setups = drafts.map((draft) => duelCombatant(
      drafts.indexOf(draft), draft, ships.find((ship) => ship.id === draft.shipId) ?? ships[0]!
    ));
    const combat = createStrategicCombatService(setups[0]!, setups[1]!);
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
