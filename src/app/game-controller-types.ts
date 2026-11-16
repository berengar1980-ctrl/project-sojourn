import type { ShipDefinition } from '../core/ship-types';
import type { PlayerProfile } from '../core/player-profile';

import type { NavigationService } from '../systems/navigation';
import type { StagedFullCareerSession } from '../systems/persistence/career-full-session';
import type { CareerSnapshot } from '../systems/persistence/career-save-contract';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';

export interface GameControllerOptions {
  readonly root: HTMLElement;
  readonly ship: ShipDefinition;
  readonly playerProfile: PlayerProfile;
  readonly navigation: NavigationService;
  readonly onReturnToMainMenu: () => void;
  readonly campaignSelection?: Readonly<Record<string, boolean>>;
  /** Fully validated, detached Save session; never a partially restored controller. */
  readonly restoredSession?: StagedFullCareerSession;
  /** Bind deferred campaign and local-field effects to the new controller. */
  readonly onCareerContextReady?: (context: ControllerRuntimeContext) => void;
}

export interface GameController {
  tick(deltaSeconds: number): void;
  profileSnapshot(): PlayerProfile;
  careerSnapshot(): CareerSnapshot;
  destroy(): void;
}
