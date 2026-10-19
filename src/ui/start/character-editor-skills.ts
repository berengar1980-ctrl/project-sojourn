import type { ShipStationDefinition, ShipStationSkill } from '../../core/ship-types';
import {
  COMBAT_POINT_BUDGET,
  STATION_POINT_BUDGET,
  STATION_SKILLS,
  defaultStationSkills,
  type PlayerProfile,
} from '../../core/player-profile';

const SKILL_LABELS: Readonly<Record<ShipStationSkill, string>> = {
  piloting: 'Brücke',
  sensors: 'Sensorik',
  weapons: 'Waffen',
  engineering: 'Technik',
  salvage: 'Bergung',
  mining: 'Bergbau',
  logistics: 'Logistik',
};

export interface SkillAllocator {
  valid(): boolean;
  values(): Pick<PlayerProfile, 'combatSkills' | 'stationSkills' | 'stationId'>;
}

function createSlider(
  parent: HTMLElement,
  label: string,
  initial: number,
  min: number,
  max: number,
  onInput: (value: number) => void
): { input: HTMLInputElement; output: HTMLOutputElement } {
  const row = document.createElement('label');
  row.className = 'character-editor__skill-row';
  const title = document.createElement('span');
  title.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.value = String(initial);
  input.setAttribute('aria-label', label);
  const output = document.createElement('output');
  output.textContent = String(initial);
  input.addEventListener('input', () => {
    output.textContent = input.value;
    onInput(Number(input.value));
  });
  row.append(title, input, output);
  parent.append(row);
  return { input, output };
}

function createPanel(
  root: HTMLElement,
  title: string,
  points: number
): {
  rows: HTMLElement;
  total: HTMLElement;
} {
  const panel = document.createElement('section');
  panel.className = 'character-editor__skill-panel';
  const header = document.createElement('div');
  header.className = 'character-editor__skill-header';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const total = document.createElement('span');
  total.className = 'character-editor__skill-points';
  total.textContent = '0 / ' + points;
  header.append(heading, total);
  const rows = document.createElement('div');
  rows.className = 'character-editor__skill-rows';
  panel.append(header, rows);
  root.append(panel);
  return { rows, total };
}

export function createSkillAllocator(
  root: HTMLElement,
  stations: readonly ShipStationDefinition[],
  onChange: () => void
): SkillAllocator {
  const combat = { ranged: 65, melee: 65 };
  const stationSkills = defaultStationSkills();
  const combatPanel = createPanel(root, 'KAMPFAUSBILDUNG', COMBAT_POINT_BUDGET);
  const combatSliders = {} as Record<'ranged' | 'melee', ReturnType<typeof createSlider>>;
  for (const mode of ['ranged', 'melee'] as const) {
    combatSliders[mode] = createSlider(
      combatPanel.rows,
      mode === 'ranged' ? 'Fernkampf' : 'Nahkampf',
      combat[mode],
      30,
      100,
      (value) => {
        combat[mode] = value;
        const opposite = mode === 'ranged' ? 'melee' : 'ranged';
        combat[opposite] = COMBAT_POINT_BUDGET - value;
        combatSliders[opposite].input.value = String(combat[opposite]);
        combatSliders[opposite].output.textContent = String(combat[opposite]);
        onChange();
      }
    );
  }
  combatPanel.total.textContent = COMBAT_POINT_BUDGET + ' / ' + COMBAT_POINT_BUDGET;
  const stationPanel = createPanel(root, 'SCHIFFSDIENST', STATION_POINT_BUDGET);
  const stationTotal = (): number =>
    STATION_SKILLS.reduce((sum, skill) => sum + stationSkills[skill], 0);
  const update = (): void => {
    const points = stationTotal();
    stationPanel.total.textContent = points + ' / ' + STATION_POINT_BUDGET;
    stationPanel.total.classList.toggle('is-invalid', points !== STATION_POINT_BUDGET);
    onChange();
  };
  for (const skill of STATION_SKILLS) {
    createSlider(stationPanel.rows, SKILL_LABELS[skill], stationSkills[skill], 10, 75, (value) => {
      stationSkills[skill] = value;
      update();
    });
  }
  const hint = document.createElement('p');
  hint.className = 'character-editor__skill-hint';
  hint.textContent = 'Nah-/Fernkampf: 130 Punkte (30–100). Schiffsdienst: 245 Punkte (10–75).';
  root.append(hint);
  const stationLabel = document.createElement('label');
  stationLabel.className = 'character-editor__station-choice';
  stationLabel.textContent = 'DEIN DIENSTPOSTEN';
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Eigene Schiffsstation');
  for (const station of stations) {
    const option = document.createElement('option');
    option.value = station.id;
    option.textContent = SKILL_LABELS[station.skill];
    select.append(option);
  }
  stationLabel.append(select);
  select.addEventListener('change', onChange);
  root.append(stationLabel);
  stationPanel.total.textContent = STATION_POINT_BUDGET + ' / ' + STATION_POINT_BUDGET;
  return {
    valid: () => stationTotal() === STATION_POINT_BUDGET && select.value !== '',
    values: () => ({
      combatSkills: { ...combat },
      stationSkills: { ...stationSkills },
      stationId: select.value,
    }),
  };
}
