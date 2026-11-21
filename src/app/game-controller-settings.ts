import { createSettingsMenu } from '../ui/settings/settings-menu';
import { saveControllerCareer } from './game-controller-career-install';
import { controllerCareerSaveBlockReason } from './game-controller-career-save-policy';
import type { ControllerRuntimeContext } from './game-controller-runtime-types';
import type { GameControllerOptions } from './game-controller-types';

/** Keep career save eligibility live in the settings menu without bloating
 * the main game controller or changing the existing load callback.
 */
export function createControllerSettingsMenu(
  context: ControllerRuntimeContext,
  options: GameControllerOptions
): ReturnType<typeof createSettingsMenu> {
  return createSettingsMenu(
    context.audio,
    options.onReturnToMainMenu,
    context.state.playerProfile,
    () => saveControllerCareer(context),
    options.onLoadCareer,
    () => controllerCareerSaveBlockReason(context)
  );
}
