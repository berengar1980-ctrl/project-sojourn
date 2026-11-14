import { miningResourceById } from '../data/resources/mining-resources';
import type { WorldLocation } from '../core/world-types';
import type { LocalAsteroid } from '../core/local-space-types';
import type { SectorNpcState } from '../core/npc-types';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

export function registerNpcAsteroidClaim(
  context: ControllerRuntimeContext,
  location: WorldLocation,
  npc: SectorNpcState,
  asteroid: LocalAsteroid
): void {
  const economy = context.economy;
  if (economy.asteroidClaims.claim(location.id, asteroid)) return;
  const oreValue = asteroid.deposits.reduce(
    (sum, deposit) =>
      sum + deposit.oreRemaining * (miningResourceById(deposit.resourceId)?.baseValue ?? 0),
    0
  );
  if (oreValue < 15000 || npc.credits < 2500) return;
  const result = economy.asteroidClaims.register(
    location.id,
    { ...asteroid, scanLevel: 'analyzed' },
    npc.id,
    economy.situations.currentDay,
    npc.credits
  );
  if (result.ok) npc.credits -= result.fee;
}

export function recordNpcAsteroidTheft(
  context: ControllerRuntimeContext,
  location: WorldLocation,
  npc: SectorNpcState,
  asteroid: LocalAsteroid,
  resourceId: string,
  amount: number
): void {
  const { economy, state } = context;
  const claim = economy.asteroidClaims.claim(location.id, asteroid);
  if (!claim || claim.ownerId === npc.id) return;
  const player = state.localSpace?.getSnapshot().instance.ship;
  const observer = state.localNpcMining?.ships.find((ship) => ship.npcId === npc.id);
  const detected =
    claim.ownerId === 'player' &&
    Boolean(
      player &&
      observer &&
      Math.hypot(player.position.x - observer.position.x, player.position.y - observer.position.y) <
        650
    );
  if (!detected) return;
  const wasDetected = economy.asteroidClaims
    .snapshot()
    .conflicts.some(
      (conflict) =>
        conflict.locationId === location.id &&
        conflict.asteroidId === asteroid.id &&
        conflict.intruderId === npc.id &&
        conflict.status === 'detected'
    );
  const conflict = economy.asteroidClaims.recordTheft(
    location.id,
    asteroid.id,
    npc.id,
    amount,
    true,
    miningResourceById(resourceId)?.baseValue ?? 1
  );
  if (conflict && !wasDetected)
    context.systemLog.write(
      'MINING > FREMDER MINER BAUT DEINE KONZESSION UNBEFUGT AB: ' + npc.name
    );
}

