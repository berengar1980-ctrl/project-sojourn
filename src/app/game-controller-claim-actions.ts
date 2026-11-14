import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import { controllerLocalModel } from './game-controller-models';

export function toggleControllerAsteroidClaim(context: ControllerRuntimeContext): void {
  const { state, economy } = context;
  const field = state.localSpace?.getSnapshot().instance;
  const selectedId = state.localSpace?.getSnapshot().selectedAsteroidId;
  const asteroid = field?.asteroids.find((entry) => entry.id === selectedId);
  if (!field || !asteroid) return;
  const claims = economy.asteroidClaims;
  const existing = claims.claim(field.sourceLocationId, asteroid);
  if (existing?.ownerId === 'player') {
    if (claims.abandon(field.sourceLocationId, asteroid.id, 'player'))
      context.systemLog.write('MINING > KONZESSION AUF ASTEROID AUFGEGEBEN');
  } else {
    const result = claims.register(
      field.sourceLocationId,
      asteroid,
      'player',
      economy.situations.currentDay,
      economy.trade.player.credits
    );
    if (result.ok) {
      economy.trade.player.credits -= result.fee;
      context.systemLog.write('MINING > KONZESSION AUF ASTEROID ' + asteroid.id + ' REGISTRIERT');
    } else {
      const reasons = {
        unscanned: 'ZUERST NAHBEREICHSSCAN ABSCHLIESSEN',
        empty: 'KEINE VERWERTBAREN ERZRESERVEN',
        occupied: 'ASTEROID HAT BEREITS EINEN EIGENTÜMER',
        unaffordable: 'NICHT GENÜGEND CREDITS',
      };
      context.systemLog.write('MINING > ' + reasons[result.reason]);
    }
  }
  state.panels.local?.update(controllerLocalModel(context));
}
