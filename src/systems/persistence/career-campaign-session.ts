import type {
  CampaignActionPort,
  CampaignDefinition,
  CampaignSnapshot,
} from '../../core/campaign-types';
import { createCampaignEventBus, type CampaignEventBus } from '../campaigns/campaign-event-bus';
import { createCampaignRuntime, type CampaignRuntime } from '../campaigns/campaign-runtime';
import { cloneCareerJson } from './career-save-contract';

export interface StagedCareerCampaignSession {
  readonly events: CampaignEventBus;
  readonly campaigns: CampaignRuntime;
  activate(): void;
}

/** Capture applied action receipts and mission progress as detached JSON. */
export function captureCareerCampaigns(runtime: CampaignRuntime): CampaignSnapshot {
  return cloneCareerJson(runtime.snapshot());
}

/**
 * Build a new, isolated campaign runtime without replaying startup events or
 * previously applied actions. Attach the real game action port only to the new session.
 */
export function stageCareerCampaigns(
  checkpoint: CampaignSnapshot,
  definitions: readonly CampaignDefinition[],
  actions: CampaignActionPort
): StagedCareerCampaignSession {
  const events = createCampaignEventBus();
  let active = false;
  const gatedActions: CampaignActionPort = {
    apply: (action, id) => active && actions.apply(action, id),
    releaseCampaign: (id) => {
      if (active) actions.releaseCampaign?.(id);
    },
  };
  const campaigns = createCampaignRuntime(
    events,
    cloneCareerJson(checkpoint),
    undefined,
    gatedActions
  );
  try {
    for (const definition of definitions) campaigns.register(definition);
    if (campaigns.unavailableIds().length > 0) {
      throw new Error('Career campaign package unavailable or incompatible');
    }
    return {
      events,
      campaigns,
      activate: () => {
        active = true;
      },
    };
  } catch (error) {
    campaigns.destroy();
    throw error;
  }
}
