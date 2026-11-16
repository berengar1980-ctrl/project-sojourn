import type { CampaignJournalEntry } from '../../core/campaign-types';
import type { StarMapViewModel } from '../../features/star-map/star-map-view-model';
import { renderCampaignJournal } from './star-map-campaign-journal';
import { renderStarMapEvents } from './star-map-menu-content';
import {
  loadMissionFilters,
  missionFilterControls,
  saveMissionFilters,
  signalKind,
  type SignalKind,
} from './star-map-event-filters';

interface MissionPaneOptions {
  readonly container: HTMLElement;
  readonly model: StarMapViewModel;
  readonly journal: readonly CampaignJournalEntry[];
  readonly onSelectLocation: (id: string) => void;
  readonly onChoice: (id: string, dialogueId: string, choiceId: string) => void;
  readonly refresh: () => void;
}

/** All event filtering is presentation-only; navigation and missions stay authoritative. */
export function renderStarMapMissionPane(options: MissionPaneOptions): void {
  const { model, journal } = options;
  const role = model.playerShip.role ?? 'freighter';
  const filters = loadMissionFilters(role);
  const counts: Record<SignalKind | 'campaign', number> = {
    distress: model.locations.filter((location) => signalKind(location) === 'distress').length,
    salvage: model.locations.filter((location) => signalKind(location) === 'salvage').length,
    campaign: journal.length,
  };
  const controls = missionFilterControls(filters, counts, (next) => {
    saveMissionFilters(role, next);
    options.refresh();
  });
  const journalPane = document.createElement('div');
  if (filters.campaign) {
    renderCampaignJournal(journalPane, journal, model.navigation.currentLocationId, {
      selectLocation: options.onSelectLocation,
      choose: options.onChoice,
    });
  }
  const signalsPane = document.createElement('div');
  renderStarMapEvents(
    model,
    signalsPane,
    {
      onSelectNpc: () => {},
      onSelectLocation: options.onSelectLocation,
    },
    filters
  );
  options.container.replaceChildren(controls, journalPane, signalsPane);
}
