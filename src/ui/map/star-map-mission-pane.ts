import type { CampaignJournalEntry } from '../../core/campaign-types';
import type { ShipRole } from '../../core/ship-types';
import type { StarMapViewModel } from '../../features/star-map/star-map-view-model';
import { renderCampaignJournal } from './star-map-campaign-journal';
import { renderStarMapEvents } from './star-map-menu-content';
import { renderStarMapWorldEvents } from './star-map-world-events';
import {
  EVENT_KINDS,
  loadMissionFilters,
  missionFilterControls,
  saveMissionFilters,
  signalKind,
  type EventFilterKind,
  type MissionFilters,
} from './star-map-event-filters';

interface MissionPaneOptions {
  readonly container: HTMLElement;
  readonly model: StarMapViewModel;
  readonly journal: readonly CampaignJournalEntry[];
  readonly onSelectLocation: (id: string) => void;
  readonly onChoice: (id: string, dialogueId: string, choiceId: string) => void;
  readonly refresh: () => void;
}

interface MissionPaneState {
  role: ShipRole;
  filters: MissionFilters;
  controls: HTMLElement;
  journal: HTMLElement;
  signals: HTMLElement;
  world: HTMLElement;
  options: MissionPaneOptions;
}

const panes = new WeakMap<HTMLElement, MissionPaneState>();

function eventCounts(options: MissionPaneOptions): Record<EventFilterKind, number> {
  const counts: Record<EventFilterKind, number> = {
    distress: 0, salvage: 0, trade: 0, mining: 0, patrol: 0, blockade: 0,
    campaign: options.journal.length,
  };
  for (const location of options.model.locations) {
    const kind = signalKind(location);
    if (kind) counts[kind] += 1;
  }
  for (const event of options.model.worldEvents ?? []) counts[event.kind] += 1;
  return counts;
}

/** Reuse interactive controls even when the star map refreshes at 650 ms intervals. */
function createMissionPaneState(options: MissionPaneOptions, role: ShipRole): MissionPaneState {
  const filters = loadMissionFilters(role);
  const state: MissionPaneState = {
    role, filters, options,
    controls: document.createElement('div'),
    journal: document.createElement('div'),
    signals: document.createElement('div'),
    world: document.createElement('div'),
  };
  state.controls = missionFilterControls(filters, eventCounts(options), (next) => {
    state.filters = next;
    saveMissionFilters(state.role, next);
    updateMissionContents(state);
  });
  options.container.replaceChildren(state.controls, state.journal, state.signals, state.world);
  return state;
}

function updateMissionContents(state: MissionPaneState): void {
  const { model, journal, onSelectLocation, onChoice } = state.options;
  const counts = eventCounts(state.options);
  for (const [kind, label] of EVENT_KINDS) {
    const counter = state.controls.querySelector<HTMLElement>(
      '.star-map-event-filter--' + kind + ' .star-map-event-filter__count'
    );
    if (counter) counter.textContent = label + ' (' + counts[kind] + ')';
  }
  state.journal.hidden = !state.filters.campaign;
  if (state.filters.campaign) {
    renderCampaignJournal(state.journal, journal, model.navigation.currentLocationId, {
      selectLocation: onSelectLocation,
      choose: onChoice,
    });
  } else {
    state.journal.replaceChildren();
  }
  renderStarMapEvents(model, state.signals, {
    onSelectNpc: () => {},
    onSelectLocation,
  }, state.filters);
  renderStarMapWorldEvents(model, state.world, state.filters, onSelectLocation);
}

export function renderStarMapMissionPane(options: MissionPaneOptions): void {
  const role = options.model.playerShip.role ?? 'freighter';
  let state = panes.get(options.container);
  if (!state || state.role !== role) {
    state = createMissionPaneState(options, role);
    panes.set(options.container, state);
  }
  state.options = options;
  updateMissionContents(state);
}
