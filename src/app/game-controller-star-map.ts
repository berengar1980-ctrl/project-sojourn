import { scanCargoMarkets } from '../systems/economy/cargo-market-scanner';
import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import type { WorldMap } from '../core/world-types';
import type { CampaignRuntime } from '../systems/campaigns/campaign-runtime';
import type { CampaignEventBus } from '../systems/campaigns/campaign-event-bus';
import { createStarMapViewModel } from '../features/star-map/star-map-view-model';
import type { NavigationService } from '../systems/navigation';
import { sectorSensorContactInfo } from '../systems/scanning/sensor-contact-service';
import { getShipDefinition } from '../systems/ships';
import { createStarMapPanel, type StarMapPanel } from '../ui/map/star-map-panel';
import type { ControllerEconomy } from './game-controller-economy';

function locationHasActivity(
  world: WorldMap,
  locationId: string,
  activity: 'mine' | 'salvage'
): boolean {
  const location = world.locations.find((entry) => entry.id === locationId);
  return Boolean(location?.activities[activity]);
}

export function createControllerStarPanel(options: {
  readonly root: HTMLElement;
  readonly world: () => WorldMap;
  readonly campaigns: CampaignRuntime;
  readonly campaignEvents: CampaignEventBus;
  readonly exitLocationId: () => string | null;
  readonly returnFromCampaignSystem: () => boolean;
  readonly navigation: NavigationService;
  readonly log: SystemLogService;
  readonly getModel: () => ReturnType<typeof createStarMapViewModel>;
  readonly onEnterLocalSpace: () => void;
  readonly onEnterSalvageSpace: () => void;
  readonly onSelectNpc: (id: string) => void;
  readonly onAttackNpc: (id: string) => void;
  readonly onDock: () => void;
  readonly canStartTravel?: () => boolean;
  readonly startFuelTravel?: () => boolean;
  readonly onRouteSelectionChanged?: () => void;
  readonly onAcceptEvent?: (id: string) => void;
  readonly eventById?: (
    id: string
  ) => { readonly position: { readonly x: number; readonly y: number } } | null;
}): StarMapPanel {
  let panel: StarMapPanel | null = null;
  panel = createStarMapPanel({
    root: options.root,
    model: options.getModel(),
    log: options.log,
    getCampaignJournal: () =>
      options.campaigns.journal(options.navigation.getSnapshot().currentLocationId),
    onCampaignChoice: (id, dialogueId, choiceId) => {
      const nav = options.navigation.getSnapshot();
      if (!nav.currentLocationId || nav.isTravelling) return;
      const dialogue = options.campaigns
        .journal(nav.currentLocationId)
        .find((entry) => entry.id === id)?.dialogue;
      if (
        dialogue?.id !== dialogueId ||
        !dialogue.choices.some((choice) => choice.id === choiceId)
      ) {
        return;
      }
      options.campaignEvents.emit({
        type: 'dialogue.choice',
        campaignId: id,
        dialogueId,
        choiceId,
        locationId: nav.currentLocationId,
      });
      panel?.update(options.getModel());
    },
    onSelectLocation: (id) => {
      options.onRouteSelectionChanged?.();
      options.onSelectNpc('');
      const snapshot = options.navigation.getSnapshot();
      if (snapshot.currentLocationId === id && !snapshot.isTravelling) {
        if (options.exitLocationId() === id) {
          if (options.returnFromCampaignSystem()) panel?.update(options.getModel());
          return;
        }
        if (locationHasActivity(options.world(), id, 'mine')) {
          options.onEnterLocalSpace();
          return;
        }
        if (locationHasActivity(options.world(), id, 'salvage') || options.eventById?.(id)) {
          options.onEnterSalvageSpace();
          return;
        }
      }
      const event = options.eventById?.(id);
      if (event) {
        options.onAcceptEvent?.(id);
        options.navigation.selectPointDestination(id, event.position);
      } else options.navigation.selectDestination(id);
      panel?.update(options.getModel());
    },
    onSelectNpc: options.onSelectNpc,
    onAttackNpc: options.onAttackNpc,
    onStartTravel: () => {
      if (options.startFuelTravel) {
        if (!options.startFuelTravel()) return;
      } else {
        if (options.canStartTravel?.() === false) return;
        options.navigation.startTravel();
      }
      options.log.write('NAV > FLUG GESTARTET');
      panel?.update(options.getModel());
    },
    onDock: options.onDock,
  });
  return panel;
}

export function createControllerStarModel(
  navigation: NavigationService,
  ship: ShipDefinition,
  economy: ControllerEconomy,
  selectedNpcId: string | null,
  sensorCrewSkill: number,
  sensorModifier: number,
  world: WorldMap,
  foreignSystem = false,
  saleFeeRate = 0.25
) {
  const navigationSnapshot = navigation.getSnapshot();
  if (!foreignSystem)
    economy.marketIntel.observeFromSensors(
      world.locations.map((location) => ({
        locationId: location.id,
        position: location.position,
      })),
      navigationSnapshot.currentPosition,
      economy.situations.currentDay,
      sensorCrewSkill,
      sensorModifier
    );

  const npcShips = foreignSystem
    ? []
    : economy.sectorNpcs.npcs.flatMap((npc) => {
        if (npc.hullHp <= 0) return [];
        const definition = getShipDefinition(npc.shipId);
        if (!definition) return [];
        const position = economy.sectorNpcs.livePosition(npc);
        const contact = sectorSensorContactInfo({
          playerPosition: navigationSnapshot.currentPosition,
          targetPosition: position,
          sensorSkill: sensorCrewSkill,
          sensorModifier,
          civilianTransponder: npc.pirate !== true,
          pirate: npc.pirate === true,
        });
        if (!contact.visible) return [];
        return [
          {
            id: npc.id,
            locationId: npc.locationId,
            name: contact.identified ? npc.name : 'Unbekannter Kontakt',
            job: contact.identified ? npc.job : 'patrol',
            ...(contact.identified && npc.factionId ? { factionId: npc.factionId } : {}),
            ...(contact.identified && npc.pirateMark ? { pirateMark: npc.pirateMark } : {}),
            position,
            headingRadians: economy.sectorNpcs.liveHeading(npc),
            isTravelling: economy.sectorNpcs.isTravelling(npc),
            activity: npc.activity,
            combatMode: economy.sectorNpcs.combatMode(npc),
            nominalLengthMeters: definition.nominalLengthMeters,
            spriteUrl: definition.sprite.assetUrl,
            spriteAspectRatio: definition.sprite.widthPx / definition.sprite.heightPx,
            hardpoints: definition.sprite.hardpoints,
          },
        ];
      });

  const eventLocations = (foreignSystem ? [] : economy.salvageEvents.playerVisible).map(
    (event) => ({
      id: event.id,
      name: event.title,
      kind: 'wreck' as const,
      position: event.position,
      radius: event.type === 'distress-rescue' ? 12 : 9,
      description: event.description,
      activities: { salvage: true, missions: event.type === 'distress-rescue' },
      dangerLevel:
        event.type === 'distress-rescue' && event.distressTrap ? (2 as const) : (1 as const),
    })
  );
  const cargoScanner = foreignSystem
    ? null
    : scanCargoMarkets({
        player: economy.trade.player,
        intel: economy.marketIntel,
        locations: world.locations,
        origin: navigationSnapshot.currentPosition,
        currentDay: economy.situations.currentDay,
        saleFeeRate,
      });
  return {
    ...createStarMapViewModel(
      world,
      navigationSnapshot,
      ship,
      npcShips,
      selectedNpcId,
      eventLocations
    ),
    ...(cargoScanner ? { cargoScanner } : {}),
  };
}
