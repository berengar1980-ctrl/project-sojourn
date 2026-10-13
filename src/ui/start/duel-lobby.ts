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
import { crewDefinitions, crewDefinitionById } from '../../data/crew/crew-definitions';
import {
  pilotingDodgeChance,
  sensorWeaponHitChanceBonus,
  weaponDamageMultiplier,
  weaponCriticalChance,
  weaponCycleTimeMultiplier,
} from '../../systems/crew/crew-skill-effects';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import { SHIP_MINE_CATALOG } from '../../data/combat/ship-mines';
import { createStrategicCombatPanel } from '../combat/strategic-combat-panel';
import { DUEL_ENCOUNTERS, resolveDuelPreset } from './duel-presets';
import { analyzeDuelPreset, formatPresetAnalysis } from './duel-preset-analysis';
import {
  createDuelArena,
  DUEL_MAPS,
  type DuelMapKind,
} from '../../systems/combat/duel-arena-presets';

interface DuelDraft {
  shipId: string;
  weapons: string[];
  mines: string[];
  crewId: string;
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
    if (draft.weapons[mount.slotIndex] === undefined) {
      draft.weapons[mount.slotIndex] = select.options[1]?.value ?? '';
    }
    select.value = draft.weapons[mount.slotIndex] ?? '';
    select.addEventListener('change', () => {
      draft.weapons[mount.slotIndex] = select.value;
    });
    return createLabel('Waffenplatz ' + (mount.slotIndex + 1) + ' · ' + mount.facing, select);
  });
}

function mineSelectors(draft: DuelDraft): HTMLLabelElement[] {
  return [0, 1, 2].map((index) => {
    const select = document.createElement('select');
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Keine Mine';
    select.append(empty);
    for (const mine of SHIP_MINE_CATALOG.filter((entry) => entry.tier === 2)) {
      const option = document.createElement('option');
      option.value = mine.id;
      option.textContent = mine.name;
      select.append(option);
    }
    select.value = draft.mines[index] ?? '';
    select.addEventListener('change', () => {
      draft.mines[index] = select.value;
    });
    return createLabel('Minenplatz ' + (index + 1), select);
  });
}

function crewSelector(draft: DuelDraft): HTMLLabelElement {
  const select = document.createElement('select');
  for (const member of crewDefinitions) {
    const option = document.createElement('option');
    option.value = member.id;
    option.textContent =
      member.name +
      ' · ' +
      member.title +
      ' (Pilot ' +
      member.skills.piloting +
      ', Waffen ' +
      member.skills.weapons +
      ')';
    select.append(option);
  }
  select.value = draft.crewId;
  select.addEventListener('change', () => {
    draft.crewId = select.value;
  });
  return createLabel('Crew / Kommandant', select);
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
  card.append(...mineSelectors(draft));
  card.append(crewSelector(draft));
  return card;
}

export function duelCombatant(
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
      ? [
          {
            slotIndex,
            x: (mount.x - points.pivot.x) * scale,
            y: (mount.y - points.pivot.y) * scale,
            facing: mount.facing,
            ...(mount.arcDegrees !== undefined ? { arcDegrees: mount.arcDegrees } : {}),
            ...(mount.allowedMounts ? { allowedMounts: mount.allowedMounts } : {}),
            ...(mount.allowedFamilies ? { allowedFamilies: mount.allowedFamilies } : {}),
          },
        ]
      : [];
  });
  const crew = crewDefinitionById(draft.crewId);
  const pilotSkill = crew?.skills.piloting ?? 50;
  const weaponSkill = crew?.skills.weapons ?? 50;
  const sensorSkill = crew?.skills.sensors ?? 50;
  return {
    id: 'duelist-' + index,
    name: 'Spieler ' + (index + 1) + ' · ' + ship.name,
    shipId: ship.id,
    shieldHp: shipShieldMaxHp(ship),
    shieldGeometry: createCombatShieldGeometry(points, ship.nominalLengthMeters),
    hullHp: shipHullMaxHp(ship),
    weapons: equipped.map((entry) => entry.component),
    mines: draft.mines.flatMap((id) => {
      const mine = SHIP_MINE_CATALOG.find((entry) => entry.id === id);
      return mine ? [mine] : [];
    }),
    weaponMounts: mounts,
    hitChance: 0.68 + sensorWeaponHitChanceBonus(sensorSkill),
    dodgeChance: pilotingDodgeChance(pilotSkill),
    damageMultiplier: weaponDamageMultiplier(weaponSkill),
    criticalChance: weaponCriticalChance(weaponSkill),
    cycleTimeMultiplier: weaponCycleTimeMultiplier(weaponSkill),
    preferredTactic: 'fight',
    ...resolveShipCombatMovementStats(ship),
    tractorRangeMeters: (points.tractorBeams?.length ?? 0) > 0 ? 400 : 0,
    aiControlled: true,
    aiAggression: 90,
  };
}

function attachEncounterSelector(
  select: HTMLSelectElement,
  ships: readonly ShipDefinition[],
  drafts: [DuelDraft, DuelDraft],
  onSelected: (id: string) => void
): void {
  select.addEventListener('change', () => {
    const selectedEncounter = select.value;
    const scenario = DUEL_ENCOUNTERS.find((item) => item.id === selectedEncounter);
    if (scenario) {
      const configured = resolveDuelPreset(scenario, ships);
      configured.forEach((entry, index) => {
        drafts[index]!.shipId = entry.shipId;
        drafts[index]!.weapons = [...entry.weapons];
        drafts[index]!.mines = [];
        drafts[index]!.crewId = crewDefinitions[entry.crewIndex % crewDefinitions.length]!.id;
      });
    }
    onSelected(selectedEncounter);
  });
}

function createDuelMapSelector(): { mapLabel: HTMLLabelElement; mapSelect: HTMLSelectElement } {
  const mapLabel = document.createElement('label');
  mapLabel.textContent = 'Kampfkarte';
  const mapSelect = document.createElement('select');
  for (const map of DUEL_MAPS) {
    const option = document.createElement('option');
    option.value = map.id;
    option.textContent = map.title;
    mapSelect.append(option);
  }
  mapLabel.append(mapSelect);
  return { mapLabel, mapSelect };
}

function populateEncounterOptions(encounterSelect: HTMLSelectElement): void {
  const manual = document.createElement('option');
  manual.value = '';
  manual.textContent = 'Freies Duell · eigene Konfiguration';
  encounterSelect.append(manual);
  for (const encounter of DUEL_ENCOUNTERS) {
    const option = document.createElement('option');
    option.value = encounter.id;
    option.textContent = encounter.title + ' — ' + encounter.purpose;
    encounterSelect.append(option);
  }
}

function tuneAlphaSetups(
  setups: StrategicCombatantSetup[],
  isAlpha: boolean
): StrategicCombatantSetup[] {
  return isAlpha
    ? setups.map((setup) => ({
        ...setup,
        shieldHp: setup.shieldHp * 8,
        hullHp: setup.hullHp * 5,
        damageMultiplier: setup.damageMultiplier * 0.25,
      }))
    : setups;
}

function attachAnalysisControls(
  actions: HTMLElement,
  encounterSelect: HTMLSelectElement,
  mapSelect: HTMLSelectElement
): void {
  const seedInput = document.createElement('input');
  seedInput.type = 'number';
  seedInput.placeholder = 'Seed (optional)';
  seedInput.title = 'Leer = fester Preset-Seed';
  const run = document.createElement('button');
  run.textContent = 'Analyse exportieren';
  const all = document.createElement('button');
  all.textContent = 'Alle 9 analysieren';
  const status = document.createElement('span');
  actions.append(seedInput, run, all, status);
  const execute = async (batch: boolean): Promise<void> => {
    if (!batch && !encounterSelect.value) {
      status.textContent = 'Bitte ein Testgefecht wählen.';
      return;
    }
    run.disabled = true;
    all.disabled = true;
    const ids = batch ? DUEL_ENCOUNTERS.map((entry) => entry.id) : [encounterSelect.value];
    const reports = [];
    try {
      for (const [index, id] of ids.entries()) {
        status.textContent = 'Analysiere ' + (index + 1) + '/' + ids.length + ': ' + id;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const manualSeed = seedInput.value.trim();
        reports.push(
          analyzeDuelPreset(
            id,
            mapSelect.value as DuelMapKind,
            !batch && manualSeed ? Number(manualSeed) : undefined
          )
        );
      }
      const text = formatPresetAnalysis(reports);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'harrowdrift-duel-analysis-' + (batch ? 'all' : ids[0]) + '.txt';
      link.click();
      URL.revokeObjectURL(url);
      status.textContent = 'Analyse abgeschlossen: ' + ids.length + ' Duelle.';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Analyse fehlgeschlagen';
    } finally {
      run.disabled = false;
      all.disabled = false;
    }
  };
  run.addEventListener('click', () => {
    void execute(false);
  });
  all.addEventListener('click', () => {
    void execute(true);
  });
}

export function createDuelLobby(root: HTMLElement, onBack: () => void): { destroy(): void } {
  const ships = getAllShipDefinitions();
  const drafts: [DuelDraft, DuelDraft] = [
    { shipId: ships[0]!.id, weapons: [], mines: [], crewId: crewDefinitions[0]!.id },
    {
      shipId: ships.find((ship) => ship.role === 'patrol')?.id ?? ships[1]!.id,
      weapons: [],
      mines: [],
      crewId: crewDefinitions[1]!.id,
    },
  ];
  let selectedEncounter = '';
  const { mapLabel, mapSelect } = createDuelMapSelector();
  const encounterLabel = document.createElement('label');
  encounterLabel.textContent = 'Vorgefertigtes Testgefecht';
  const encounterSelect = document.createElement('select');
  populateEncounterOptions(encounterSelect);
  encounterLabel.append(encounterSelect);
  const shell = document.createElement('section');
  shell.className = 'harrow-duel';
  const title = document.createElement('h1');
  title.textContent = 'HARROWDRIFT · LOKALES DUELL';
  const description = document.createElement('p');
  description.textContent =
    'Zwei Schiffe mit individuellen Waffen und Crewmitgliedern. Danach übernehmen die Kampf-KIs.';
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
  attachAnalysisControls(actions, encounterSelect, mapSelect);
  attachEncounterSelector(encounterSelect, ships, drafts, (id) => {
    selectedEncounter = id;
    render();
  });
  shell.append(title, description, encounterLabel, mapLabel, actions, cards);
  root.replaceChildren(shell);

  let activePanel: ReturnType<typeof createStrategicCombatPanel> | null = null;
  let canceled = false;
  let frame = 0;
  const render = (): void => {
    cards.replaceChildren(...drafts.map((draft, index) => playerCard(index, draft, ships, render)));
  };
  fight.addEventListener('click', () => {
    const setups = drafts.map((draft) =>
      duelCombatant(
        drafts.indexOf(draft),
        draft,
        ships.find((ship) => ship.id === draft.shipId) ?? ships[0]!
      )
    );
    const scenario = DUEL_ENCOUNTERS.find((item) => item.id === selectedEncounter);
    // Analysis-only durability: preserve damage mechanics, extend observation time.
    const tunedSetups = tuneAlphaSetups(setups, scenario?.id === 'alpha');
    const duelSeed = scenario?.seed ?? Math.floor(Math.random() * 0x7fffffff);
    const combat = createStrategicCombatService(
      tunedSetups[0]!,
      tunedSetups[1]!,
      duelSeed,
      createDuelArena(mapSelect.value as DuelMapKind, duelSeed)
    );
    activePanel = createStrategicCombatPanel({
      root,
      combat,
      ...(scenario ? { encounterName: scenario.title } : {}),
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
