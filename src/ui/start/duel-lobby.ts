import { duelCombatant, duelInstalledComponents, type DuelDraft } from './duel-combatant-setup';
import { calculateShipModeEnergy } from '../../systems/ships/ship-component-service';
import type { ShipComponentType } from '../../core/ship-types';
import { buildDuelWeaponSections } from './duel-weapon-cards';
import { getAllShipDefinitions, type ShipDefinition } from '../../systems/ships';
import { createStrategicCombatService } from '../../systems/combat';
import { crewDefinitions } from '../../data/crew/crew-definitions';
import { createGameAudioService } from '../../systems/audio/game-audio-service';
import { createSettingsMenu } from '../settings/settings-menu';

import { SHIP_MINE_CATALOG } from '../../data/combat/ship-mines';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import { createStrategicCombatPanel } from '../combat/strategic-combat-panel';
import { DUEL_ENCOUNTERS, resolveDuelPreset } from './duel-presets';
import { analyzeDuelPreset, formatPresetAnalysis } from './duel-preset-analysis';
import {
  createDuelArena,
  DUEL_MAPS,
  type DuelMapKind,
} from '../../systems/combat/duel-arena-presets';

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

function mineSelectors(draft: DuelDraft, rerender: () => void): HTMLLabelElement[] {
  return [0, 1, 2].map((index) => {
    const select = document.createElement('select');
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Keine Mine';
    select.append(empty);
    for (const mine of SHIP_MINE_CATALOG) {
      const option = document.createElement('option');
      option.value = mine.id;
      option.textContent = mine.name;
      select.append(option);
    }
    select.value = draft.mines[index] ?? '';
    select.addEventListener('change', () => {
      draft.mines[index] = select.value;
      rerender();
    });
    return createLabel('Minenplatz ' + (index + 1), select);
  });
}

const COMPONENT_SELECTORS = [
  ['reactor', 'reactorId', 'Plasma-Reaktor / Energiekern'],
  ['engine', 'engineId', 'Plasma-Triebwerk'],
  ['shield', 'shieldId', 'Schildgenerator'],
  ['hull', 'hullId', 'Hüllenstruktur'],
  ['armor', 'armorId', 'Richtungs-Hüllenpanzerung'],
  ['sensor', 'sensorId', 'Sensoren'],
  ['tractor', 'tractorId', 'Traktorstrahl'],
  ['mining', 'miningId', 'Mining-Laser'],
  ['salvage', 'salvageId', 'Bergungssystem'],
  ['cargo', 'cargoId', 'Frachtmodul'],
] as const satisfies readonly (readonly [ShipComponentType, keyof DuelDraft, string])[];

function equipmentSelector(
  draft: DuelDraft,
  type: ShipComponentType,
  key: keyof DuelDraft,
  label: string,
  rerender: () => void
): HTMLLabelElement {
  const select = document.createElement('select');
  const optional = !['reactor', 'engine'].includes(type);
  if (optional) select.append(new Option('Nicht installiert', ''));
  for (const component of SHIP_COMPONENT_CATALOG[type] ?? []) {
    select.append(new Option(component.name + ' · ' + component.power + ' MW', component.id));
  }
  const stored = draft[key];
  select.value = typeof stored === 'string' ? stored : optional ? '' : type + '1';
  select.addEventListener('change', () => {
    // The selector keys are all optional scalar component identifiers.
    Object.assign(draft, { [key]: select.value });
    rerender();
  });
  return createLabel(label, select);
}

function powerBudget(draft: DuelDraft): HTMLElement {
  const energy = calculateShipModeEnergy(duelInstalledComponents(draft));
  const panel = document.createElement('p');
  panel.className = 'harrow-duel__energy';
  const combatExcess = Math.max(0, energy.combat - energy.output);
  const industryExcess = Math.max(0, energy.industrial - energy.output);
  const draw = (label: string, value: number): string => label + ' ' + value + ' MW';
  const summary = [
    draw('REAKTOR', energy.output),
    draw('KAMPF', energy.combat),
    draw('ARBEIT', energy.industrial),
    draw('INDUSTRIE IM KAMPF AUS', energy.shedInCombat),
  ];
  if (combatExcess) summary.push(draw('KAMPF-ÜBERLAST', combatExcess) + ' · Ausfallrisiko');
  if (industryExcess) summary.push(draw('ARBEITS-ÜBERLAST', industryExcess));
  panel.textContent = 'ENERGIE · ' + summary.join(' · ');
  return panel;
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
  card.append(...buildDuelWeaponSections(draft, ship, rerender));
  for (const [type, key, label] of COMPONENT_SELECTORS) {
    card.append(equipmentSelector(draft, type, key, label, rerender));
  }
  card.append(...mineSelectors(draft, rerender));
  card.append(powerBudget(draft));
  card.append(crewSelector(draft));
  return card;
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
        Object.assign(drafts[index]!, {
          reactorId: 'reactor1',
          engineId: 'engine1',
          shieldId: 'shield1',
          hullId: 'hull1',
          sensorId: 'sensor1',
          tractorId: 'tractor1',
          miningId: '',
          salvageId: '',
          cargoId: '',
          armorId: '',
        });
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
  // A change of battlefield must never change ship durability. All five maps
  // use the exact same loadout, start shields, hull and combat damage rules.
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

function logSlowDuelFrame(
  simulationStart: number,
  renderStart: number,
  encounter: string,
  elapsedSeconds: number
): void {
  const finished = performance.now();
  if (finished - simulationStart <= 80) return;
  console.warn('[Harrowdrift combat performance]', {
    simulationMs: Math.round(renderStart - simulationStart),
    renderMs: Math.round(finished - renderStart),
    encounter,
    elapsedSeconds: Math.round(elapsedSeconds),
  });
}

function initialDuelDrafts(
  ships: ReturnType<typeof getAllShipDefinitions>
): [DuelDraft, DuelDraft] {
  return [
    { shipId: ships[0]!.id, weapons: [], mines: [], crewId: crewDefinitions[0]!.id },
    {
      shipId: ships.find((ship) => ship.role === 'patrol')?.id ?? ships[1]!.id,
      weapons: [],
      mines: [],
      crewId: crewDefinitions[1]!.id,
    },
  ];
}

function duelSetups(
  drafts: [DuelDraft, DuelDraft],
  ships: ReturnType<typeof getAllShipDefinitions>
) {
  return drafts.map((draft, index) =>
    duelCombatant(index, draft, ships.find((ship) => ship.id === draft.shipId) ?? ships[0]!)
  );
}

function mountDuelSettings(onBack: () => void): () => void {
  const audio = createGameAudioService();
  const settingsMenu = createSettingsMenu(audio, onBack);
  return () => {
    settingsMenu.destroy();
    audio.destroy();
  };
}

export function createDuelLobby(root: HTMLElement, onBack: () => void): { destroy(): void } {
  const ships = getAllShipDefinitions();
  const drafts = initialDuelDrafts(ships);
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
  const destroySettings = mountDuelSettings(onBack);

  let activePanel: ReturnType<typeof createStrategicCombatPanel> | null = null;
  let canceled = false;
  let frame = 0;
  let duelGeneration = 0;
  const render = (): void => {
    cards.replaceChildren(...drafts.map((draft, index) => playerCard(index, draft, ships, render)));
  };
  fight.addEventListener('click', () => {
    // Invalidate any existing animation callback before creating another duel.
    duelGeneration += 1;
    cancelAnimationFrame(frame);
    activePanel?.destroy();
    const generation = duelGeneration;
    const setups = duelSetups(drafts, ships);
    const scenario = DUEL_ENCOUNTERS.find((item) => item.id === selectedEncounter);
    // Preserve the same prepared combatants on every PvP map: in particular,
    // never silently replace the working asteroid map's shield defaults.
    const duelSeed = scenario?.seed ?? Math.floor(Math.random() * 0x7fffffff);
    const combat = createStrategicCombatService(
      setups[0]!,
      setups[1]!,
      duelSeed,
      createDuelArena(mapSelect.value as DuelMapKind, duelSeed)
    );
    activePanel = createStrategicCombatPanel({
      root,
      combat,
      ...(scenario ? { encounterName: scenario.title } : {}),
      onReturn: () => {
        duelGeneration += 1;
        cancelAnimationFrame(frame);
        activePanel?.destroy();
        activePanel = null;
        root.replaceChildren(shell);
      },
    });
    let previous = performance.now();
    const tick = (now: number): void => {
      if (canceled || !activePanel || generation !== duelGeneration) return;
      const dt = Math.min((now - previous) / 1000, 0.08);
      previous = now;
      const simulationStart = performance.now();
      combat.tick(dt);
      const renderStart = performance.now();
      activePanel.update();
      logSlowDuelFrame(
        simulationStart,
        renderStart,
        scenario?.id ?? 'custom',
        combat.getSnapshot().elapsedSeconds
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
  render();
  return {
    destroy() {
      canceled = true;
      duelGeneration += 1;
      cancelAnimationFrame(frame);
      activePanel?.destroy();
      destroySettings();
      shell.remove();
    },
  };
}
