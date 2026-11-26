import type { NpcEconomyState } from '../core/economy-types';
import type { LocalAsteroid } from '../core/local-space-types';
import { economyResources } from '../data/economy/economy-resources';
import { narrowsSector } from '../data/maps/narrows-sector';
import { knownWorkPrice, type NpcWorksite } from '../systems/economy/npc-work-planning';
import type { AsteroidFieldWorld } from '../systems/operations/asteroid-field-world';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

function ownDepositValue(npc: NpcEconomyState, asteroid: LocalAsteroid): number {
  return asteroid.deposits.reduce((sum, deposit) => {
    const price = knownWorkPrice(npc, deposit.resourceId, economyResources);
    return sum + Math.floor(deposit.oreRemaining) * price;
  }, 0);
}

export function installNpcWorkPlanning(
  context: ControllerRuntimeContext,
  fields: AsteroidFieldWorld,
  salvageResources: (danger: number) => readonly string[]
): void {
  const sites: NpcWorksite[] = [];
  for (const location of narrowsSector.locations) {
    const base = {
      id: location.id,
      position: location.position,
      danger: location.dangerLevel,
    };
    if (location.activities.mine) {
      sites.push({ ...base, role: 'miner', resourceIds: location.minedResourceIds ?? [] });
    }
    if (location.activities.salvage) {
      const resourceIds = salvageResources(location.dangerLevel);
      sites.push({ ...base, role: 'salvager', resourceIds });
    }
  }
  const { npcs, sectorNpcs, asteroidClaims } = context.economy;
  npcs.setWorkPlanning({
    sites,
    fleet: sectorNpcs.npcs,
    knownClaimValue: (npc, locationId) => {
      const field = fields.field(locationId);
      if (!field) return 0;
      return field.instance.asteroids.reduce((sum, asteroid) => {
        const claim = asteroidClaims.claim(locationId, asteroid);
        return claim?.ownerId === npc.id ? sum + ownDepositValue(npc, asteroid) : sum;
      }, 0);
    },
  });
}

/** Owners can abandon uneconomic claims; never release the player's concession. */
export function reviewNpcMiningClaims(
  context: ControllerRuntimeContext,
  fields: AsteroidFieldWorld
): void {
  const { asteroidClaims, sectorNpcs } = context.economy;
  for (const claim of asteroidClaims.snapshot().claims) {
    if (claim.ownerId === 'player') continue;
    const npc = sectorNpcs.npcs.find((entry) => entry.id === claim.ownerId);
    const field = fields.field(claim.locationId);
    const asteroid = field?.instance.asteroids.find((entry) => entry.id === claim.asteroidId);
    if (!asteroid) continue;
    const active = field?.miners.ships.some(
      (ship) => ship.npcId === claim.ownerId && ship.targetAsteroidId === asteroid.id
    );
    if (active) continue;
    if (!npc || npc.retiredUntilDay !== undefined || ownDepositValue(npc, asteroid) < 150) {
      asteroidClaims.abandon(claim.locationId, claim.asteroidId, claim.ownerId);
    }
  }
}
