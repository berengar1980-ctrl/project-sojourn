import { recordPerformance } from '../../core/performance-diagnostics';
import { duelCombatant, duelInstalledComponents, type DuelDraft } from './duel-combatant-setup';
import { calculateShipModeEnergy } from '../../systems/ships/ship-component-service';
import type { ShipComponentType } from '../../core/ship-types';
import { buildDuelWeaponSections } from './duel-weapon-cards';
import { getAllShipDefinitions, getShipDefinition, type ShipDefinition } from '../../systems/ships';
import { campaignCombatPresets, campaignPresetDraft } from './campaign-combat-preset';
import { createStrategicCombatService } from '../../systems/combat';
import { crewDefinitions } from '../../data/crew/crew-definitions';
import { createGameAudioService } from '../../systems/audio/game-audio-service';
import { createSettingsMenu } from '../settings/settings-menu';

import { SHIP_MINE_CATALOG } from '../../data/combat/ship-mines';
import { SHIP_COMPONENT_CATALOG } from '../../data/ships/ship-component-catalog';
import { createFleetNativeCombatPanel } from '../combat/fleet-native-combat-panel';
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
    delete draft.campaignNpcId;
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
    const amount = type === 'reactor' ? (component.output ?? 0) : component.power;
    const labelText = type === 'reactor' ? 'Erzeugung' : 'Verbrauch';
    const optionText = component.name + ' · ' + labelText + ' ' + amount + ' MW';
    select.append(new Option(optionText, component.id));
  }
  const stored = draft[key];
  const defaults: Partial<Record<ShipComponentType, string>> = {
    reactor: 'reactor1',
    engine: 'engine1',
    shield: 'shield1',
    hull: 'hull1',
    sensor: 'sensor1',
    tractor: 'tractor1',
  };
  select.value = typeof stored === 'string' ? stored : (defaults[type] ?? '');
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
    draw('MINING', energy.mining),
    draw('BERGUNG', energy.salvage),
    draw('REISE', energy.travel),
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

function campaignPresetSelector(draft: DuelDraft, rerender: () => void): HTMLLabelElement {
  const select = document.createElement('select');
  select.append(new Option('Manuelle Konfiguration', ''));
  for (const npc of campaignCombatPresets()) {
    const name = getShipDefinition(npc.shipId)?.name ?? npc.shipId;
    select.append(new Option(name + ' · ' + npc.name, npc.id));
  }
  select.value = draft.campaignNpcId ?? '';
  select.addEventListener('change', () => {
    if (select.value) Object.assign(draft, campaignPresetDraft(select.value));
    else {
      delete draft.campaignNpcId;
      draft.shipId = getAllShipDefinitions()[0]!.id;
      draft.crewId = crewDefinitions[0]!.id;
      draft.weapons = [];
      draft.mines = [];
      for (const [, key] of COMPONENT_SELECTORS) delete draft[key];
    }
    rerender();
  });
  return createLabel('Kampfprofil', select);
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
  card.append(heading, campaignPresetSelector(draft, rerender));
  if (draft.campaignNpcId) {
    const setup = duelCombatant(index, draft, getShipDefinition(draft.shipId)!);
    const summary = document.createElement('p');
    summary.textContent = setup.name + ' · Hülle ' + setup.hullHp + ' · Schild ' + setup.shieldHp + ' · ' + setup.weapons.map((weapon) => weapon.name).join(', ');
    card.append(summary, powerBudget(draft));
    return card;
  }
  card.append(shipSelector(draft, ships, rerender));
  card.append(...buildDuelWeaponSections(draft, ship, rerender));
  for (const [type, key, label] of COMPONENT_SELECTORS) {
    card.append(equipmentSelector(draft, type, key, label, rerender));
  }
  card.append(...mineSelectors(draft, rerender));
  card.append(powerBudget(draft));
  card.append(crewSelector(draft));
  return card;
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

export function createDuelLobby(
  root: HTMLElement,
  onBack: () => void,
  onCombatActiveChange: (active: boolean) => void = () => {}
): { destroy(): void } {
  const ships = getAllShipDefinitions();
  const drafts = initialDuelDrafts(ships);
  const { mapLabel, mapSelect } = createDuelMapSelector();
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
  shell.append(title, description, mapLabel, actions, cards);
  root.replaceChildren(shell);
  const destroySettings = mountDuelSettings(onBack);

  let activePanel: ReturnType<typeof createFleetNativeCombatPanel> | null = null;
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
    // Preserve the same prepared combatants on every PvP map: in particular,
    // never silently replace the working asteroid map's shield defaults.
    const duelSeed = Math.floor(Math.random() * 0x7fffffff);
    const combat = createStrategicCombatService(
      setups[0]!,
      setups[1]!,
      duelSeed,
      createDuelArena(mapSelect.value as DuelMapKind, duelSeed)
    );
    onCombatActiveChange(true);
    activePanel = createFleetNativeCombatPanel({
      root,
      combat,
      onReturn: () => {
        duelGeneration += 1;
        cancelAnimationFrame(frame);
        activePanel?.destroy();
        activePanel = null;
        root.replaceChildren(shell);
        onCombatActiveChange(false);
      },
    });
    let previous = performance.now();
    const tick = (now: number): void => {
      if (canceled || !activePanel || generation !== duelGeneration) return;
      const dt = Math.min((now - previous) / 1000, 0.08);
      previous = now;
      const simulationStart = performance.now();
      combat.advance(dt);
      const renderStart = performance.now();
      activePanel.update();
      recordPerformance('pvp.duel.simulation', renderStart - simulationStart);
      recordPerformance('pvp.duel.render', performance.now() - renderStart);
      logSlowDuelFrame(simulationStart, renderStart, 'custom', combat.getSnapshot().elapsedSeconds);
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
      onCombatActiveChange(false);
      destroySettings();
      shell.remove();
    },
  };
}
