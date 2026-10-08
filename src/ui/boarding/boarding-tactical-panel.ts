import type {
  BoardingEncounterSnapshot,
  BoardingHex,
  BoardingUnit,
} from '../../core/boarding-types';
import type { CrewBoardingEncounter } from '../../systems/boarding/crew-boarding-adapter';
import { boardingHexDistance, boardingHexKey } from '../../systems/boarding/boarding-geometry';

export interface BoardingTacticalPanel {
  update(): void;
  destroy(): void;
}

interface BoardingTacticalPanelOptions {
  readonly root: HTMLElement;
  readonly encounter: CrewBoardingEncounter;
  readonly onFinish: (snapshot: BoardingEncounterSnapshot) => void;
}

function nearestPlayer(enemy: BoardingUnit, players: readonly BoardingUnit[]): BoardingUnit | null {
  return (
    [...players].sort(
      (first, second) => boardingHexDistance(enemy, first) - boardingHexDistance(enemy, second)
    )[0] ?? null
  );
}

function cellClasses(
  wall: boolean,
  door: boolean,
  openDoor: boolean,
  reachable: boolean,
  unit: BoardingUnit | undefined,
  selectedUnitId: string | null
): string {
  return [
    'boarding-cell',
    wall ? 'is-wall' : '',
    door ? (openDoor ? 'is-door-open' : 'is-door') : '',
    reachable ? 'is-reachable' : '',
    unit?.team === 'player' ? 'has-player' : '',
    unit?.team === 'enemy' ? 'has-enemy' : '',
    unit?.id === selectedUnitId ? 'is-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

class BoardingTacticalPanelRuntime implements BoardingTacticalPanel {
  private readonly shell: HTMLElement;
  private readonly tactical: CrewBoardingEncounter['tactical'];

  constructor(private readonly options: BoardingTacticalPanelOptions) {
    this.shell = document.createElement('section');
    this.shell.className = 'boarding-shell';
    this.options.root.replaceChildren(this.shell);
    this.tactical = this.options.encounter.tactical;
    this.render();
  }

  update(): void {
    this.render();
  }

  destroy(): void {
    this.shell.remove();
  }

  private runEnemyTurn(): void {
    let snapshot = this.tactical.getSnapshot();
    if (snapshot.outcome !== 'active' || snapshot.activeTeam !== 'enemy') return;
    const enemyIds = snapshot.units
      .filter((unit) => unit.team === 'enemy' && unit.hp > 0)
      .map((unit) => unit.id);

    for (const enemyId of enemyIds) {
      snapshot = this.tactical.getSnapshot();
      if (snapshot.outcome !== 'active') break;
      this.runEnemyUnit(enemyId, snapshot);
    }
    if (this.tactical.getSnapshot().outcome === 'active') this.tactical.endTurn();
  }

  private runEnemyUnit(enemyId: string, snapshot: BoardingEncounterSnapshot): void {
    const enemy = snapshot.units.find((unit) => unit.id === enemyId && unit.hp > 0);
    const players = snapshot.units.filter((unit) => unit.team === 'player' && unit.hp > 0);
    if (!enemy) return;
    const target = nearestPlayer(enemy, players);
    if (!target) return;

    const range = boardingHexDistance(enemy, target);
    if (range === 1) {
      this.tactical.melee(enemy.id, target.id);
      return;
    }
    if (range <= enemy.weapon.range && this.tactical.shoot(enemy.id, target.id)) return;

    this.moveEnemyToward(enemy, target);
    this.attackAfterEnemyMove(enemy.id, target.id);
  }

  private moveEnemyToward(enemy: BoardingUnit, target: BoardingUnit): void {
    const reachable = this.tactical.reachable(enemy.id);
    const step = Object.entries(reachable)
      .filter(([, cost]) => cost > 0)
      .map(([key, cost]) => {
        const [rawQ, rawR] = key.split(',').map(Number);
        const q = rawQ ?? 0;
        const r = rawR ?? 0;
        return {
          q,
          r,
          cost,
          distance: boardingHexDistance({ q, r }, target),
        };
      })
      .sort((a, b) => a.distance - b.distance || b.cost - a.cost)[0];
    if (step) this.tactical.move(enemy.id, { q: step.q, r: step.r });
  }

  private attackAfterEnemyMove(enemyId: string, targetId: string): void {
    const snapshot = this.tactical.getSnapshot();
    const enemy = snapshot.units.find((unit) => unit.id === enemyId && unit.hp > 0);
    const target = snapshot.units.find((unit) => unit.id === targetId && unit.hp > 0);
    if (!enemy || !target) return;
    const range = boardingHexDistance(enemy, target);
    if (range === 1) this.tactical.melee(enemy.id, target.id);
    else if (range <= enemy.weapon.range) this.tactical.shoot(enemy.id, target.id);
  }

  private actOnHex(hex: BoardingHex): void {
    const snapshot = this.tactical.getSnapshot();
    if (snapshot.activeTeam !== 'player' || snapshot.outcome !== 'active') return;
    const selected = snapshot.units.find((unit) => unit.id === snapshot.selectedUnitId);
    const target = snapshot.units.find(
      (unit) => unit.q === hex.q && unit.r === hex.r && unit.hp > 0
    );
    if (target?.team === 'player') this.tactical.selectUnit(target.id);
    else if (selected && target?.team === 'enemy') this.attackSelected(selected, target);
    else if (selected) this.tactical.move(selected.id, hex);
    this.render();
  }

  private attackSelected(selected: BoardingUnit, target: BoardingUnit): void {
    if (boardingHexDistance(selected, target) === 1) {
      this.tactical.melee(selected.id, target.id);
    } else {
      this.tactical.shoot(selected.id, target.id);
    }
  }

  private cellMarkup(
    snapshot: BoardingEncounterSnapshot,
    reachable: Readonly<Record<string, number>>,
    q: number,
    r: number
  ): string {
    const key = boardingHexKey(q, r);
    const unit = snapshot.units.find((entry) => entry.q === q && entry.r === r && entry.hp > 0);
    const wall = snapshot.map.walls.includes(key);
    const door = snapshot.map.doors.find((entry) => entry.q === q && entry.r === r);
    const openDoor = door ? snapshot.doorStates[door.id] : false;
    const classes = cellClasses(
      wall,
      Boolean(door),
      openDoor === true,
      reachable[key] !== undefined && reachable[key]! > 0,
      unit,
      snapshot.selectedUnitId
    );
    const body = unit
      ? `<strong>${unit.name}</strong><small>HP ${unit.hp}/${unit.maxHp} · AP ${unit.ap}</small>`
      : door
        ? '<span>SCHOTT</span>'
        : '';
    return `<button type="button" class="${classes}" data-q="${q}" data-r="${r}" ${wall ? 'disabled' : ''}>${body}</button>`;
  }

  private gridMarkup(
    snapshot: BoardingEncounterSnapshot,
    reachable: Readonly<Record<string, number>>
  ): string {
    const cells: string[] = [];
    for (let r = 0; r < snapshot.map.rows; r += 1) {
      for (let q = 0; q < snapshot.map.columns; q += 1) {
        cells.push(this.cellMarkup(snapshot, reachable, q, r));
      }
    }
    return cells.join('');
  }

  private render(): void {
    const snapshot = this.tactical.getSnapshot();
    const selected = snapshot.units.find((unit) => unit.id === snapshot.selectedUnitId) ?? null;
    const reachable = selected ? this.tactical.reachable(selected.id) : {};
    const finished = snapshot.outcome !== 'active';
    const log = snapshot.log
      .slice(0, 8)
      .map((entry) => `<div>R${entry.round} · ${entry.text}</div>`)
      .join('');

    this.shell.innerHTML = `
      <header class="boarding-header">
        <div><span>ENTERKAMPF</span><strong>${snapshot.map.name}</strong><small>RUNDE ${snapshot.round} · ${snapshot.activeTeam === 'player' ? 'EIGENER ZUG' : 'FEINDLICHER ZUG'}</small></div>
        <div class="boarding-actions">
          <button type="button" data-boarding-end ${finished || snapshot.activeTeam !== 'player' ? 'disabled' : ''}>ZUG BEENDEN</button>
          <button type="button" data-boarding-retreat ${finished || snapshot.activeTeam !== 'player' ? 'disabled' : ''}>RÜCKZUG</button>
          ${finished ? '<button type="button" data-boarding-finish>WEITER</button>' : ''}
        </div>
      </header>
      <div class="boarding-status">${finished ? 'ERGEBNIS: ' + snapshot.outcome.toUpperCase() : 'Einheit wählen · Feld anklicken zum Bewegen · Gegner anklicken zum Angreifen'}</div>
      <div class="boarding-grid" style="--boarding-columns:${snapshot.map.columns}">${this.gridMarkup(snapshot, reachable)}</div>
      <aside class="boarding-log">${log}</aside>
    `;
    this.bindControls();
  }

  private bindControls(): void {
    for (const button of this.shell.querySelectorAll<HTMLButtonElement>('.boarding-cell[data-q]')) {
      button.addEventListener('click', () =>
        this.actOnHex({ q: Number(button.dataset.q), r: Number(button.dataset.r) })
      );
    }
    this.shell
      .querySelector<HTMLButtonElement>('[data-boarding-end]')
      ?.addEventListener('click', () => {
        this.tactical.endTurn();
        this.runEnemyTurn();
        this.render();
      });
    this.shell
      .querySelector<HTMLButtonElement>('[data-boarding-retreat]')
      ?.addEventListener('click', () => {
        this.tactical.retreat();
        this.render();
      });
    this.shell
      .querySelector<HTMLButtonElement>('[data-boarding-finish]')
      ?.addEventListener('click', () => {
        this.options.onFinish(this.options.encounter.settle());
      });
  }
}

export function createBoardingTacticalPanel(
  options: BoardingTacticalPanelOptions
): BoardingTacticalPanel {
  return new BoardingTacticalPanelRuntime(options);
}
