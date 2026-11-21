import type { FleetTestConfiguration } from '../ui/start/fleet-test-lobby';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { fieldWorldFor } from './game-controller-field-world-bridge';
import { generateMiningSpace } from '../systems/local-space/local-space-generator';
import type { SectorNpcState } from '../core/npc-types';

const FIELD_ID = 'greyrock-belt';
const sessions = new WeakMap<
  ControllerRuntimeContext,
  { elapsed: number; pending: { npc: SectorNpcState; seconds: number }[] }
>();

/** This is a disposable career session, using original NPC economy and field
 * services. Never attach it to a restored career or a separate PvP renderer. */
export function installFleetCareerTest(
  context: ControllerRuntimeContext,
  scenario: FleetTestConfiguration
): void {
  if (scenario.map !== 'scattered' && scenario.map !== 'asteroid_field') {
    throw new Error('FleetCombat test requires an existing asteroid field map');
  }
  const npcs = context.economy.sectorNpcs.npcs;
  const minerTemplates = npcs.filter((npc) => npc.job === 'miner');
  const pirateTemplates = npcs.filter((npc) => npc.pirate);
  const patrol = npcs.find((npc) => npc.job === 'patrol' && !npc.pirate);
  if (!minerTemplates.length || !pirateTemplates.length || !patrol) {
    throw new Error('FleetCombat career NPC templates are missing');
  }

  // An isolated world can keep its original traffic away from this test field.
  for (const npc of npcs) {
    if (npc.job === 'miner' && npc.workLocationId === FIELD_ID)
      npc.workLocationId = 'copper-crown-field';
    if (npc.pirate && npc.locationId === FIELD_ID)
      npc.locationId = npc.factionId === 'pirates2' ? 'gallows-anchor' : 'blackjaw-outpost';
  }

  const pending: { npc: SectorNpcState; seconds: number }[] = [];
  for (const entry of scenario.ships) {
    if (entry.role === 'player' || entry.role === 'drone') continue;
    const isMiner = entry.role === 'miner';
    const pool = isMiner
      ? minerTemplates
      : pirateTemplates.filter(
          (npc) => npc.factionId === (entry.role === 'pirate-b' ? 'pirates2' : 'pirates')
        );
    if (!pool.length) throw new Error('Missing NPC template for ' + entry.role);
    const source = pool[(Number(entry.id.split('-').at(-1)) - 1) % pool.length]!;
    const clone: SectorNpcState = {
      ...source,
      id: 'fleet-test-' + entry.id,
      name: entry.name,
      locationId: isMiner || entry.spawnAtSeconds === 0 ? FIELD_ID : source.locationId,
      ...(isMiner ? { workLocationId: FIELD_ID } : {}),
      cargo: {},
      marketIntel: {},
    };
    delete clone.travel;
    delete clone.combatMovement;
    npcs.push(clone);
    if (entry.spawnAtSeconds > 0 && !isMiner)
      pending.push({ npc: clone, seconds: entry.spawnAtSeconds });
  }

  const droneId = 'security-drone:' + FIELD_ID;
  if (scenario.counts.drones > 0 && !npcs.some((npc) => npc.id === droneId)) {
    npcs.push({
      ...patrol,
      id: droneId,
      name: 'Sicherheitsdrohne',
      locationId: FIELD_ID,
      cargo: {},
      marketIntel: {},
    });
  }
  const field = fieldWorldFor(context).field(FIELD_ID);
  if (!field) throw new Error('Existing FleetCombat career field was not found');
  if (scenario.counts.drones === 0) {
    field.drone.destroy();
    const npc = npcs.find((entry) => entry.id === droneId);
    if (npc) npc.hullHp = 0;
  }
  if (scenario.map === 'scattered') {
    // Replace contents of the original live asteroid collection, not its
    // identity: miner and drone services already reference this collection.
    const sparse = generateMiningSpace(FIELD_ID, field.instance.seed, undefined, 'sparse');
    field.instance.asteroids.splice(0, field.instance.asteroids.length, ...sparse.asteroids);
  }
  sessions.set(context, { elapsed: 0, pending });
}

export function isFleetCareerTest(context: ControllerRuntimeContext): boolean {
  return sessions.has(context);
}

/** Real local NPCs enter through normal sector location and traffic reconciliation. */
export function advanceFleetCareerTest(
  context: ControllerRuntimeContext,
  deltaSeconds: number
): void {
  const session = sessions.get(context);
  if (!session) return;
  session.elapsed += Math.max(0, deltaSeconds);
  for (let i = session.pending.length - 1; i >= 0; i--) {
    const arrival = session.pending[i]!;
    if (session.elapsed < arrival.seconds) continue;
    arrival.npc.locationId = FIELD_ID;
    delete arrival.npc.travel;
    session.pending.splice(i, 1);
  }
}
