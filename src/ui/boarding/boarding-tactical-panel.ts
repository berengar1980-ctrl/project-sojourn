import type {
  BoardingEncounterSnapshot,
  BoardingHex,
  BoardingUnit,
} from '../../core/boarding-types';
import type { CrewBoardingEncounter } from '../../systems/boarding/crew-boarding-adapter';
import { boardingHexDistance, boardingHexKey } from '../../systems/boarding/boarding-geometry';
import { createBoardingCheckpointStore } from '../../systems/boarding/boarding-checkpoint-service';

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

function boardingUnitDetails(selected: BoardingUnit | null): string {
  if (!selected) return 'Trupp wählen';
  const weapon = selected.weapon;
  const attributes = [
    selected.name,
    weapon.name,
    'Reichweite ' + weapon.range,
    'Streuung ' + weapon.spread,
    'RD ' + weapon.armorPenetration,
  ];
  if (weapon.piercing) attributes.push('Piercing +' + weapon.piercing.bonusDamage);
  return attributes.join(' · ');
}

function boardingStatusText(snapshot: BoardingEncounterSnapshot): string {
  if (snapshot.outcome !== 'active') return 'ERGEBNIS: ' + snapshot.outcome.toUpperCase();
  return 'Einheit wählen · Aktion wählen · Ziel auf dem Hexfeld anklicken';
}

type BoardingAction = 'move' | 'shoot' | 'suppress' | 'overwatch';

function boardingActionControls(snapshot: BoardingEncounterSnapshot, selected: BoardingUnit | null) {
  const finished = snapshot.outcome !== 'active';
  const canAct = !finished && snapshot.activeTeam === 'player' && !!selected;
  const cannotShoot = !selected || selected.ap < 1 || selected.combatUsed;
  return {
    canAct,
    cannotShoot,
    cannotSuppress: cannotShoot || !selected?.weapon.canSuppress,
    cannotOverwatch: !selected || selected.ap < 2 || selected.combatUsed,
    cannotHold: !canAct || cannotShoot,
  };
}

function boardingActionButton(
  action: BoardingAction,
  selectedAction: BoardingAction,
  name: string,
  disabled: boolean
): string {
  const pressed = selectedAction === action ? 'aria-pressed="true"' : '';
  const unavailable = disabled ? 'disabled' : '';
  return `<button type="button" data-boarding-action="${action}" ${pressed} ${unavailable}>${name}</button>`;
}

class BoardingTacticalPanelRuntime implements BoardingTacticalPanel {
  private readonly shell: HTMLElement;
  private readonly tactical: CrewBoardingEncounter['tactical'];
  private action: 'move' | 'shoot' | 'suppress' | 'overwatch' = 'move';
  private checkpointMessage = '';

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
    if (range <= enemy.weapon.range && this.enemyFire(enemy, target)) return;

    const adjacentDoor = snapshot.map.doors.find(
      (door) => !snapshot.doorStates[door.id] && boardingHexDistance(enemy, door) === 1
    );
    if (adjacentDoor) this.tactical.openDoor(enemy.id, adjacentDoor.id);
    this.moveEnemyToward(enemy, target);
    this.attackAfterEnemyMove(enemy.id, target.id);
    const after = this.tactical.getSnapshot();
    const unit = after.units.find((entry) => entry.id === enemy.id);
    if (unit && unit.hp > 0 && unit.ap >= 2 && !unit.combatUsed) {
      this.tactical.overwatch(unit.id, target);
    }
  }

  private enemyFire(enemy: BoardingUnit, target: BoardingUnit): boolean {
    if (enemy.weapon.canSuppress && target.holdingCover) {
      if (this.tactical.suppress(enemy.id, target.id)) return true;
    }
    return this.tactical.shoot(enemy.id, target.id) !== null;
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
    else if (range <= enemy.weapon.range) this.enemyFire(enemy, target);
  }

  private actOnHex(hex: BoardingHex): void {
    const snapshot = this.tactical.getSnapshot();
    if (snapshot.activeTeam !== 'player' || snapshot.outcome !== 'active') return;
    const selected = snapshot.units.find((unit) => unit.id === snapshot.selectedUnitId);
    const target = snapshot.units.find(
      (unit) => unit.q === hex.q && unit.r === hex.r && unit.hp > 0
    );
    if (target?.team === 'player') {
      this.tactical.selectUnit(target.id);
      this.action = 'move';
    } else if (selected) {
      const door = snapshot.map.doors.find(
        (entry) => entry.q === hex.q && entry.r === hex.r && !snapshot.doorStates[entry.id]
      );
      if (door) this.tactical.openDoor(selected.id, door.id);
      else if (this.action === 'overwatch') {
        if (this.tactical.overwatch(selected.id, hex)) this.action = 'move';
      } else if (this.action === 'suppress') {
        if (this.tactical.suppressArea(selected.id, hex)) this.action = 'move';
      } else if (target?.team === 'enemy') this.attackSelected(selected, target);
      else if (this.action === 'move') this.tactical.move(selected.id, hex);
    }
    this.render();
  }

  private attackSelected(selected: BoardingUnit, target: BoardingUnit): void {
    if (boardingHexDistance(selected, target) === 1 && this.action !== 'shoot') {
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
    const flags = unit
      ? (unit.overwatch ? ' · WACHE' : '') + (unit.suppressed ? ' · NIEDER' : '')
      : '';
    const body = unit
      ? `<strong>${unit.name}</strong><small>HP ${unit.hp}/${unit.maxHp} · AP ${unit.ap}${flags}</small>`
      : door
        ? '<span>SCHOTT</span>'
        : '';
    const suppression = snapshot.suppressionZones.some(
      (zone) => boardingHexDistance(zone.center, { q, r }) <= 1
    );
    const cover = snapshot.map.cover.some((entry) => entry.q === q && entry.r === r);
    const highlighting = (suppression ? ' is-suppressed-zone' : '') + (cover ? ' is-cover' : '');
    const disabled = wall ? 'disabled' : '';
    return `<button type="button" class="${classes}${highlighting}" data-q="${q}" data-r="${r}" ${disabled}>${body}</button>`;
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
    const controls = boardingActionControls(snapshot, selected);
    const button = (action: BoardingAction, name: string, disabled = false): string =>
      boardingActionButton(action, this.action, name, !controls.canAct || disabled);
    const { cannotShoot, cannotSuppress, cannotOverwatch, cannotHold } = controls;
    const statusLabel = this.checkpointMessage || boardingStatusText(snapshot);
    const details = boardingUnitDetails(selected);
    const log = snapshot.log
      .slice(0, 8)
      .map((entry) => `<div>R${entry.round} · ${entry.text}</div>`)
      .join('');

    this.shell.innerHTML = `
      <header class="boarding-header">
        <div><span>ENTERKAMPF</span><strong>${snapshot.map.name}</strong><small>RUNDE ${snapshot.round} · ${snapshot.activeTeam === 'player' ? 'EIGENER ZUG' : 'FEINDLICHER ZUG'}</small></div>
        <div class="boarding-actions">
          <button type="button" data-boarding-end ${finished || snapshot.activeTeam !== 'player' ? 'disabled' : ''}>ZUG BEENDEN</button>
          <button type="button" data-boarding-retreat ${finished || snapshot.activeTeam !== 'player' || !snapshot.allowRetreat ? 'disabled' : ''}>RÜCKZUG</button>
          <button type="button" data-boarding-save ${finished ? 'disabled' : ''}>KAMPF SPEICHERN</button>
          <button type="button" data-boarding-load ${finished ? 'disabled' : ''}>KAMPF LADEN</button>
          ${finished ? '<button type="button" data-boarding-finish>WEITER</button>' : ''}
        </div>
      </header>
      <div class="boarding-status">${statusLabel}</div>
      <div class="boarding-tactics">
        <div class="boarding-tactics-actions">
          ${button('move', 'BEWEGEN')}
          ${button('shoot', 'SCHIESSEN · 1 AP', cannotShoot)}
          ${button('suppress', 'UNTERDRÜCKEN · 1 AP', cannotSuppress)}
          ${button('overwatch', 'FEUERBEREITSCHAFT · 2 AP', cannotOverwatch)}
          <button type="button" data-boarding-hold ${cannotHold ? 'disabled' : ''}>DECKUNG HALTEN</button>
        </div>
        <div class="boarding-unit-detail">${details}</div>
      </div>
      <div class="boarding-grid" style="--boarding-columns:${snapshot.map.columns}">${this.gridMarkup(snapshot, reachable)}</div>
      <aside class="boarding-log">${log}</aside>
    `;
    this.bindControls();
  }

  private bindControls(): void {
    this.shell
      .querySelector<HTMLButtonElement>('[data-boarding-save]')
      ?.addEventListener('click', () => {
        try {
          createBoardingCheckpointStore(window.localStorage).save(this.tactical.getSnapshot());
          this.checkpointMessage = 'ENTERKAMPF GESPEICHERT · NUR TAKTISCHER CHECKPOINT';
        } catch {
          this.checkpointMessage = 'SPEICHERN NICHT MÖGLICH · BROWSER-SPEICHER PRÜFEN';
        }
        this.render();
      });
    this.shell
      .querySelector<HTMLButtonElement>('[data-boarding-load]')
      ?.addEventListener('click', () => {
        try {
          const checkpoint = createBoardingCheckpointStore(window.localStorage).load();
          if (checkpoint && this.tactical.restoreCheckpoint(checkpoint)) {
            this.checkpointMessage = 'TAKTISCHER CHECKPOINT GELADEN';
            this.runEnemyTurn();
          } else {
            this.checkpointMessage = 'KEIN PASSENDER ENTERKAMPFSTAND VORHANDEN';
          }
        } catch {
          this.checkpointMessage = 'ENTERKAMPFSTAND BESCHÄDIGT ODER NICHT LESBAR';
        }
        this.render();
      });
    for (const action of this.shell.querySelectorAll<HTMLButtonElement>('[data-boarding-action]')) {
      action.addEventListener('click', () => {
        const next = action.dataset.boardingAction;
        if (next === 'move' || next === 'shoot' || next === 'suppress' || next === 'overwatch') {
          this.action = next;
          this.render();
        }
      });
    }
    this.shell
      .querySelector<HTMLButtonElement>('[data-boarding-hold]')
      ?.addEventListener('click', () => {
        const snapshot = this.tactical.getSnapshot();
        if (snapshot.selectedUnitId) this.tactical.holdCover(snapshot.selectedUnitId);
        this.action = 'move';
        this.render();
      });
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
        try {
          createBoardingCheckpointStore(window.localStorage).clear();
        } catch {
          // A disabled browser store must not block finishing the encounter.
        }
        this.options.onFinish(this.options.encounter.settle());
      });
  }
}

export function createBoardingTacticalPanel(
  options: BoardingTacticalPanelOptions
): BoardingTacticalPanel {
  return new BoardingTacticalPanelRuntime(options);
}
