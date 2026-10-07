import type { ShipDefinition } from '../core/ship-types';
import type { SystemLogService } from '../core/system-log-types';
import { narrowsSector } from '../data/maps/narrows-sector';
import { createStarMapViewModel } from '../features/star-map/star-map-view-model';
import type { NavigationService } from '../systems/navigation';
import { sectorSensorContactInfo } from '../systems/scanning/sensor-contact-service';
import { getShipDefinition } from '../systems/ships';
import { createStarMapPanel, type StarMapPanel } from '../ui/map/star-map-panel';
import type { ControllerEconomy } from './game-controller-economy';

function locationHasActivity(locationId: string, activity: 'mine' | 'salvage'): boolean {
  const location = narrowsSector.locations.find((entry) => entry.id === locationId);
  return Boolean(location?.activities[activity]);
}

export function createControllerStarPanel(options: {
  readonly root: HTMLElement;
  readonly navigation: NavigationService;
  readonly log: SystemLogService;
  readonly getModel: () => ReturnType<typeof createStarMapViewModel>;
  readonly onEnterLocalSpace: () => void;
  readonly onEnterSalvageSpace: () => void;
  readonly onSelectNpc: (id: string) => void;
  readonly onAttackNpc: (id: string) => void;
  readonly onDock: () => void;
}): StarMapPanel {
  let panel: StarMapPanel | null = null;
  panel = createStarMapPanel({
    root: options.root,
    model: options.getModel(),
    log: options.log,
    onSelectLocation: (id) => {
      options.onSelectNpc('');
      const snapshot = options.navigation.getSnapshot();
      if (snapshot.currentLocationId === id && !snapshot.isTravelling) {
        if (locationHasActivity(id, 'mine')) {
          options.onEnterLocalSpace();
          return;
        }
        if (locationHasActivity(id, 'salvage')) {
          options.onEnterSalvageSpace();
          return;
        }
      }
      options.navigation.selectDestination(id);
      panel?.update(options.getModel());
    },
    onSelectNpc: options.onSelectNpc,
    onAttackNpc: options.onAttackNpc,
    onStartTravel: () => {
      options.navigation.startTravel();
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
  sensorModifier: number
) {
  const navigationSnapshot = navigation.getSnapshot();
  economy.marketIntel.observeFromSensors(
    narrowsSector.locations.map((location) => ({
      locationId: location.id,
      position: location.position,
    })),
    navigationSnapshot.currentPosition,
    economy.situations.currentDay,
    sensorCrewSkill,
    sensorModifier
  );

  const npcShips = economy.sectorNpcs.npcs.flatMap((npc) => {
    const definition = getShipDefinition(npc.shipId);
    if (!definition) return [];
    const position = economy.sectorNpcs.livePosition(npc);
    const contact = sectorSensorContactInfo({
      playerPosition: navigationSnapshot.currentPosition,
      targetPosition: position,
      sensorSkill: sensorCrewSkill,
      sensorModifier,
      civilianTransponder: !npc.pirate,
    });
    if (!contact.visible) return [];
    return [
      {
        id: npc.id,
        name: contact.identified ? npc.name : 'Unbekannter Kontakt',
        job: npc.job,
        position,
        headingRadians: economy.sectorNpcs.liveHeading(npc),
        isTravelling: economy.sectorNpcs.isTravelling(npc),
        activity: npc.activity,
        combatMode: economy.sectorNpcs.combatMode(npc),
        nominalLengthMeters: definition.nominalLengthMeters,
        spriteUrl: definition.sprite.assetUrl,
        spriteAspectRatio: definition.sprite.widthPx / definition.sprite.heightPx,
        hardpoints: definition.sprite.hardpoints,
        ...(contact.identified && npc.pirateFaction && npc.pirateEmblem
          ? { pirateFaction: npc.pirateFaction, pirateEmblem: npc.pirateEmblem }
          : {}),
      },
    ];
  });

  return createStarMapViewModel(narrowsSector, navigationSnapshot, ship, npcShips, selectedNpcId);
}
