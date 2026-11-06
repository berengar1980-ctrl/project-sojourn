import type { ShipDefinition } from '../core/ship-types';
import type { PlayerProfile } from '../core/player-profile';

import type { NavigationService } from '../systems/navigation';

export interface GameControllerOptions {
  readonly root: HTMLElement;
  readonly ship: ShipDefinition;
  readonly playerProfile: PlayerProfile;
  readonly navigation: NavigationService;
  readonly onReturnToMainMenu: () => void;
  readonly campaignSelection?: Readonly<Record<string, boolean>>;
}

export interface GameController {
  warmStartTraffic(seconds: number): void;
  tick(deltaSeconds: number): void;
  profileSnapshot(): PlayerProfile;
  destroy(): void;
}
