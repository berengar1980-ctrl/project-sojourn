import type { SectorNpcState } from '../../core/npc-types';
import type { NavigationService } from '../navigation';
import type { NpcSectorService } from '../npcs/npc-sector-service';

interface PlayerAttackReactionOptions {
  readonly navigation: NavigationService;
  readonly sectorNpcs: NpcSectorService;
  readonly log: (message: string) => void;
}
import { npcDefenseReaction } from '../npcs/npc-combat-ai';

export function reactToPlayerAttack(
  options: PlayerAttackReactionOptions,
  defender: SectorNpcState,
  attackerId: string
): void {
  const playerPosition = options.navigation.getSnapshot().currentPosition;
  const reaction = npcDefenseReaction(defender);
  if (reaction === 'fight') {
    options.sectorNpcs.startPursuit(defender, 'player', attackerId, playerPosition, 'Gegenangriff');
    options.log('COMBAT > ' + defender.name.toUpperCase() + ' DREHT ZUM GEGENANGRIFF');
    return;
  }
  options.sectorNpcs.startFlee(defender, 'player', attackerId, playerPosition, 'Flucht');
  options.log('COMBAT > ' + defender.name.toUpperCase() + ' VERSUCHT ZU FLIEHEN');
}
