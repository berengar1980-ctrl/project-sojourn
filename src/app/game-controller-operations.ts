import { operationalRoleAllowed } from '../systems/operations/ship-operation-permissions';
import type { SectorNpcState } from '../core/npc-types';
import type { ControllerEconomy } from './game-controller-economy';
import { narrowsSector } from '../data/maps/narrows-sector';
import { economyResources } from '../data/economy/economy-resources';
import { miningResources } from '../data/resources/mining-resources';
import {
  createOperationsPanel,
  type OperationsAction,
  type OperationsModel,
} from '../ui/operations/operations-panel';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

function permissions(c: ControllerRuntimeContext) {
  const nav = c.navigation.getSnapshot();
  const location = narrowsSector.locations.find((l) => l.id === nav.currentLocationId);
  const idle = !nav.isTravelling && !nav.isPursuing && !c.engagements.activePlayerCombat();
  return {
    location,
    port:
      idle &&
      c.state.mode === 'port' &&
      Boolean(location?.activities.dock) &&
      location?.stationType !== 'pirate',
    field: idle && c.state.mode === 'local-space' && Boolean(location?.activities.mine),
  };
}
function operationsModel(c: ControllerRuntimeContext): OperationsModel {
  const { economy: e, state } = c;
  const p = permissions(c);
  return {
    credits: e.trade.player.credits,
    shipRole: state.activeShip.role,
    wreckClaims: e.wreckClaims.snapshot(e.situations.currentDay),
    port: p.port,
    patrolShip: state.activeShip.role === 'patrol',
    locationId: p.location?.id ?? null,
    locationName: p.location?.name ?? 'Unterwegs',
    locations: e.markets
      .snapshot()
      .filter((m) => m.needs.size > 0)
      .map((m) => ({
        id: m.locationId,
        name: narrowsSector.locations.find((l) => l.id === m.locationId)?.name ?? m.locationId,
        resources: [...m.needs].map((id) => ({
          id,
          name: economyResources.find((r) => r.id === id)?.name ?? id,
        })),
      })),
    pirates: e.blockades.available().map((n) => ({ id: n.id, name: n.name })),
    blockades: e.blockades.snapshot(),
    patrol: e.patrol.snapshot(),
    offers: e.patrol.offers(),
    claims: e.asteroidClaims.snapshot().claims,
    names: Object.fromEntries(
      [
        ...narrowsSector.locations,
        ...economyResources,
        ...miningResources,
        ...e.sectorNpcs.npcs,
        { id: 'player', name: 'Eigene Konzession' },
      ].map((x) => [x.id, x.name])
    ),
  };
}
function patrolAction(
  c: ControllerRuntimeContext,
  m: OperationsModel,
  action: OperationsAction,
  values: string[]
): boolean {
  const e = c.economy,
    id = values[0] ?? '';
  let ok = false;
  if (action === 'enlist' && m.port && m.patrolShip && m.locationId)
    ok = e.patrol.enlist(m.locationId);
  if (action === 'resign') {
    e.patrol.resign();
    ok = true;
  }
  if (
    action === 'accept' &&
    m.port &&
    m.patrolShip &&
    m.locationId &&
    (id === 'route' || id === 'bounty')
  )
    ok = e.patrol.accept(id, values[1] ?? '', m.locationId);
  if (action === 'reward' && m.port && m.locationId) ok = e.patrol.claimReward(m.locationId) > 0;
  return ok;
}
function act(c: ControllerRuntimeContext, action: OperationsAction, values: string[]): string {
  const m = operationsModel(c),
    e = c.economy,
    id = values[0] ?? '';
  let ok = false;
  if (action === 'order' && m.port && operationalRoleAllowed(m.shipRole, 'blockade'))
    ok = e.blockades.order('player', id, values[1] ?? '', values.slice(3), Number(values[2]));
  if (action === 'cancel') ok = e.blockades.cancel(id);
  if (['enlist', 'resign', 'accept', 'reward'].includes(action))
    ok = patrolAction(c, m, action, values);
  if (action === 'claim-route' && m.shipRole === 'mining') {
    const [fieldId, asteroidId] = id.split('|');
    const known = e.asteroidClaims
      .snapshot()
      .claims.some((claim) => claim.locationId === fieldId && claim.asteroidId === asteroidId);
    if (known && fieldId && asteroidId) {
      c.state.selectedClaimTarget = { locationId: fieldId, asteroidId };
      c.navigation.selectDestination(fieldId);
      ok = true;
    }
  }
  if (action === 'navigate') {
    c.navigation.selectDestination(id);
    ok = true;
  }
  const message = ok
    ? 'Auftrag ausgeführt.'
    : 'Nicht möglich: Ort, Schiff, Guthaben oder Verfügbarkeit prüfen.';
  c.systemLog.write('AUFTRÄGE > ' + message);
  return message;
}
export function mountControllerOperations(c: ControllerRuntimeContext, onClose: () => void) {
  return createOperationsPanel({
    root: c.root,
    onClose,
    model: () => operationsModel(c),
    quote: (ids, days) => c.economy.blockades.quote(ids, days),
    act: (action, values) => act(c, action, values),
  });
}

export function operationsCombatHooks(economy: ControllerEconomy) {
  return {
    playerProtectedFromPirate: (npc: SectorNpcState) =>
      economy.blockades.protectsPlayer(npc.id) ||
      (Boolean(npc.pirate) && economy.protectsPirate(npc.factionId)),
    mayInitiateAttack: (npc: SectorNpcState) => economy.blockades.mayAttack(npc.id),
    protectsNpc: (attacker: SectorNpcState, defender: SectorNpcState) =>
      economy.blockades.protectsOwner(attacker.id, defender.id),
    onPlayerAttack: (npc: SectorNpcState) => economy.patrol.recordAttack(npc),
    onPlayerVictory: (id: string) => economy.patrol.recordVictory(id),
  };
}
export function observeControllerOperations(c: ControllerRuntimeContext, seconds: number): void {
  const nav = c.navigation.getSnapshot();
  const location = !nav.isTravelling && !nav.isPursuing ? nav.currentLocationId : null;
  if (c.state.activeShip.role === 'patrol') c.economy.patrol.observeArrival(location, seconds);
}
