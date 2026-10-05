import type {
  EconomyResourceDefinition,
  EconomyResourceId,
  MarketSituation,
} from '../../core/economy-types';
import type { PortDefinition } from '../../core/port-types';

interface SituationTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly resourceIds: readonly EconomyResourceId[];
  readonly modifiers: readonly number[];
}

const TEMPLATES: readonly SituationTemplate[] = [
  {
    id: 'medical-shortage',
    name: 'Medizinischer Engpass',
    description: 'Versorgungsengpässe treiben die Nachfrage nach medizinischen Gütern.',
    resourceIds: ['medical'],
    modifiers: [0.48],
  },
  {
    id: 'refinery-outage',
    name: 'Raffinerieausfall',
    description: 'Ausfälle in der Verarbeitung verknappen Treibstoffe und Kühlmittel.',
    resourceIds: ['synthetic-fuel', 'coolant'],
    modifiers: [0.38, 0.22],
  },
  {
    id: 'harvest-glut',
    name: 'Ernteüberschuss',
    description: 'Ungewöhnlich hohe Erträge drücken die Preise für Grundnahrung.',
    resourceIds: ['grain', 'protein'],
    modifiers: [-0.28, -0.18],
  },
  {
    id: 'dockyard-contract',
    name: 'Großauftrag der Werften',
    description: 'Ein Großauftrag erhöht den Bedarf an Metall und Maschinenkomponenten.',
    resourceIds: ['steel', 'machine-parts'],
    modifiers: [0.3, 0.24],
  },
  {
    id: 'luxury-demand',
    name: 'Festwoche',
    description: 'Lokale Feierlichkeiten erhöhen kurzfristig die Nachfrage nach Luxusgütern.',
    resourceIds: ['luxury-food', 'aged-spirits'],
    modifiers: [0.26, 0.22],
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function activeChance(count: number): number {
  if (count <= 1) return 0.62;
  if (count === 2) return 0.48;
  if (count === 3) return 0.25;
  if (count === 4) return 0.1;
  return 0;
}

function validTemplateResources(
  template: SituationTemplate,
  resources: readonly EconomyResourceDefinition[]
): readonly EconomyResourceId[] {
  const known = new Set(resources.map((resource) => resource.id));
  return template.resourceIds.filter((resourceId) => known.has(resourceId));
}

export interface MarketSituationService {
  readonly currentDay: number;
  active(): readonly MarketSituation[];
  modifier(locationId: string, resourceId: EconomyResourceId): number;
  add(situation: MarketSituation): void;
  advanceDay(day: number): void;
  advanceNextDay(): void;
}

export function createMarketSituationService(
  ports: readonly PortDefinition[],
  resources: readonly EconomyResourceDefinition[],
  seed = 1
): MarketSituationService {
  const situations: MarketSituation[] = [];
  let currentDay = -1;

  const expire = (): void => {
    for (let index = situations.length - 1; index >= 0; index -= 1) {
      if (situations[index]!.endDay <= currentDay) situations.splice(index, 1);
    }
  };

  const createSituation = (day: number, random: () => number): void => {
    if (situations.length >= 5 || ports.length === 0 || TEMPLATES.length === 0) return;

    const template = TEMPLATES[Math.floor(random() * TEMPLATES.length)]!;
    const resourceIds = validTemplateResources(template, resources);
    if (resourceIds.length === 0) return;

    const local = random() < 0.9;
    const port = local ? ports[Math.floor(random() * ports.length)]! : null;
    const duration = local ? 8 + Math.floor(random() * 7) : 20 + Math.floor(random() * 21);
    const resourceModifiers: Record<EconomyResourceId, number> = {};
    resourceIds.forEach((resourceId, index) => {
      resourceModifiers[resourceId] =
        template.modifiers[Math.min(index, template.modifiers.length - 1)] ?? 0;
    });

    situations.push({
      id: `${template.id}-${day}-${Math.floor(random() * 1_000_000)}`,
      name: template.name,
      description: template.description,
      scope: local ? 'local' : 'sector',
      ...(port ? { locationId: port.locationId } : {}),
      resourceModifiers,
      startDay: day,
      endDay: day + duration,
    });
  };

  const advanceDay = (day: number): void => {
    const target = Math.max(0, Math.floor(day));
    if (target <= currentDay) return;

    for (let nextDay = currentDay + 1; nextDay <= target; nextDay += 1) {
      currentDay = nextDay;
      expire();
      const random = seededRandom(seed + nextDay * 3571);
      if (random() < activeChance(situations.length)) createSituation(nextDay, random);
    }
  };

  return {
    get currentDay() {
      return currentDay;
    },
    active() {
      return situations.filter(
        (situation) => situation.startDay <= currentDay && situation.endDay > currentDay
      );
    },
    modifier(locationId, resourceId) {
      let total = 0;
      for (const situation of situations) {
        if (situation.startDay > currentDay || situation.endDay <= currentDay) continue;
        const affectsLocation =
          situation.scope === 'sector' ||
          (situation.scope === 'local' && situation.locationId === locationId);
        if (!affectsLocation) continue;
        total += situation.resourceModifiers[resourceId] ?? 0;
      }
      return clamp(total, -0.55, 0.9);
    },
    add(situation) {
      situations.push(situation);
    },
    advanceDay,
    advanceNextDay() {
      advanceDay(currentDay + 1);
    },
  };
}
