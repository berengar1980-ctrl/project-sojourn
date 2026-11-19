import type { SalvageField } from '../core/salvage-types';
import type { PlayerEconomyState } from '../core/economy-types';
import type { ShipRole } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { WreckClaimRegistry } from '../systems/operations/wreck-claim-registry';

interface WreckClaimActionsOptions {
  readonly field: SalvageField;
  readonly role: ShipRole;
  readonly player: PlayerEconomyState;
  readonly wreckClaims: WreckClaimRegistry;
  readonly getCurrentDay: () => number;
  readonly log: SystemLogService;
  readonly refresh: () => void;
  readonly onUnauthorizedAttempt?: (wreckId: string) => void;
}

export function createWreckClaimActions(options: WreckClaimActionsOptions) {
  const { field, wreckClaims, getCurrentDay, log, player, refresh } = options;
  const claim = (wreckId: string): void => {
    const wreck = field.wrecks.find((entry) => entry.id === wreckId);
    if (!wreck || options.role !== 'salvage') return;
    if (wreckClaims.claim(field.id, wreckId, getCurrentDay())) {
      log.write('BERGUNG > WRACK HAT BEREITS EINEN ANSPRUCH');
      refresh();
      return;
    }
    const result = wreckClaims.register(field, wreck, 'player', getCurrentDay(), player.credits);
    if (result.ok) {
      player.credits -= result.fee;
      log.write('BERGUNG > WRACKANSPRUCH REGISTRIERT');
    } else {
      log.write('BERGUNG > ANSPRUCH NICHT MÖGLICH: ' + result.reason);
    }
    refresh();
  };
  const canWork = (wreckId: string): boolean => {
    const owner = wreckClaims.claim(field.id, wreckId, getCurrentDay());
    if (!owner || owner.ownerId === 'player') return true;
    log.write('BERGUNG > FREMDER WRACKANSPRUCH: BERGUNG GESPERRT');
    options.onUnauthorizedAttempt?.(wreckId);
    return false;
  };
  return { claim, canWork };
}

/** Expose authoritative ownership without adding claim logic to the view-model. */
export function wreckClaimOwners(
  field: SalvageField,
  registry: WreckClaimRegistry,
  day: number
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    field.wrecks.flatMap((wreck) => {
      const claim = registry.claim(field.id, wreck.id, day);
      return claim ? [[wreck.id, claim.ownerId]] : [];
    })
  );
}
