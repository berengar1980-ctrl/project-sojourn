import { silentSignalCampaign } from './silent-signal';
import type { CampaignDefinition } from '../../core/campaign-types';

/** Install packages here before game.initialized is emitted. Story packages are registered before the startup event. */
export const campaignPackages: readonly CampaignDefinition[] = [silentSignalCampaign];
