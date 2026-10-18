import type { ShipDefinition } from '../core/ship-types';

import type { NavigationService } from '../systems/navigation';

export interface GameControllerOptions {
  readonly root: HTMLElement;
  readonly ship: ShipDefinition;
  readonly navigation: NavigationService;
  readonly onReturnToMainMenu: () => void;
}

export interface GameController {
  tick(deltaSeconds: number): void;
  destroy(): void;
}
