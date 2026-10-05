import type {
  PortCommodityDefinition,
  PortCrewCandidate,
  PortDefinition,
} from '../../core/port-types';
import type { EconomyResourceId } from '../../core/economy-types';
import { economyResourceById } from '../economy/economy-resources';

type Security = PortDefinition['security'];

interface PortProfile {
  readonly locationId: string;
  readonly subtitle: string;
  readonly economy: string;
  readonly population: string;
  readonly security: Security;
  readonly shipyard?: boolean;
  readonly produces: readonly EconomyResourceId[];
  readonly needs: readonly EconomyResourceId[];
  readonly trades?: readonly EconomyResourceId[];
  readonly crew?: readonly PortCrewCandidate[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function commodity(
  id: EconomyResourceId,
  role: 'produces' | 'needs' | 'trade'
): PortCommodityDefinition {
  const basePrice = economyResourceById(id)?.basePrice ?? 100;
  const baseline = clamp(Math.round(240000 / Math.max(1, basePrice)), 36, 8000);
  if (role === 'produces') {
    return {
      id,
      stock: clamp(Math.round(baseline * 2.15), 80, 14000),
      demand: 0.34,
      production: 0.84,
    };
  }
  if (role === 'needs') {
    return {
      id,
      stock: clamp(Math.round(baseline * 0.48), 18, 4200),
      demand: 0.86,
      production: 0.04,
    };
  }
  return {
    id,
    stock: clamp(Math.round(baseline * 1.05), 28, 7600),
    demand: 0.55,
    production: 0.08,
  };
}

function crew(
  id: string,
  name: string,
  role: string,
  traits: readonly string[],
  combat: number,
  salary: number,
  equipment: readonly string[]
): PortCrewCandidate {
  return { id, name, role, traits, combat, salary, equipment };
}

function makePort(profile: PortProfile): PortDefinition {
  const produced = new Set(profile.produces);
  const needed = new Set(profile.needs);
  const commodityIds = [
    ...new Set([...profile.produces, ...profile.needs, ...(profile.trades ?? [])]),
  ];
  return {
    locationId: profile.locationId,
    subtitle: profile.subtitle,
    economy: profile.economy,
    population: profile.population,
    security: profile.security,
    shipyard: profile.shipyard ?? false,
    producedCommodityIds: [...profile.produces],
    neededCommodityIds: [...profile.needs],
    commodities: commodityIds.map((id) =>
      commodity(id, produced.has(id) ? 'produces' : needed.has(id) ? 'needs' : 'trade')
    ),
    crew: [...(profile.crew ?? [])],
  };
}

// prettier-ignore
const profiles: readonly PortProfile[] = [
  {
    locationId: 'varras-prime',
    subtitle: 'Wüstenwelt // Chemische Industrie',
    economy: 'Polymere, Chemikalien, Wüstenkolonien',
    population: '3.1 Mio.',
    security: 'medium',
    produces: ['chemicals', 'polymers', 'lubricants'],
    needs: [
      'water',
      'grain',
      'vegetables',
      'medical',
      'coolant',
      'machine-parts',
      'industry-parts',
      'spare-parts',
      'batteries',
      'tools',
      'clothing',
    ],
  },
  {
    locationId: 'cinder-refinery',
    subtitle: 'Raffineriering // Hochtemperaturindustrie',
    economy: 'Treibstoffe, Raffineriegas, Chemikalien',
    population: '118.000',
    security: 'medium',
    produces: ['promethium', 'refinery-gas', 'chemicals', 'lubricants', 'polymers', 'explosives'],
    needs: [
      'sulfur',
      'carbon',
      'water',
      'machine-parts',
      'electronics',
      'coolant',
      'tools',
      'spare-parts',
    ],
  },
  {
    locationId: 'karth-forge',
    subtitle: 'Industriewelt // Schwerindustrie',
    economy: 'Metallurgie, Maschinenbau, Panzerung',
    population: '8.7 Mio.',
    security: 'high',
    shipyard: true,
    produces: [
      'steel',
      'plasteel',
      'ceramite',
      'alloys',
      'machine-parts',
      'reactor-parts',
      'industry-parts',
      'tools',
      'armor-plate',
    ],
    needs: [
      'ferrite',
      'silicite',
      'cuprium',
      'kharvium',
      'cobaltite',
      'rare-metals',
      'carbon',
      'water',
      'grain',
      'electronics',
      'chemicals',
      'lubricants',
      'refinery-gas',
    ],
    crew: [
      crew(
        'crew-tomas-reik',
        'Tomas Reik',
        'Waffenoffizier',
        ['Diszipliniert', 'Aggressiv'],
        5,
        1700,
        ['Karabiner', 'Panzerweste']
      ),
      crew(
        'crew-lysa-orn',
        'Lysa Orn',
        'Reaktortechnik',
        ['Hartnäckig', 'Effizient'],
        2,
        1650,
        ['Werkzeug']
      ),
    ],
  },
  {
    locationId: 'brass-moon',
    subtitle: 'Bergbaumond // Erzumschlag',
    economy: 'Bergbau, Erzhandel, Minenversorgung',
    population: '340.000',
    security: 'medium',
    produces: [],
    needs: [
      'water',
      'nutrient-paste',
      'medical',
      'tools',
      'spare-parts',
      'explosives',
      'batteries',
      'promethium',
    ],
    trades: ['ferrite', 'cuprium', 'cobaltite', 'rare-metals'],
  },
  {
    locationId: 'helix-shipyards',
    subtitle: 'Orbitalwerft // Rumpfbau und Reparatur',
    economy: 'Schiffbau, Reaktoren, Ersatzteile',
    population: '92.000',
    security: 'high',
    shipyard: true,
    produces: ['ship-parts', 'spare-parts', 'reactor-parts', 'machine-parts'],
    needs: [
      'steel',
      'plasteel',
      'ceramite',
      'alloys',
      'electronics',
      'cogitator-parts',
      'reactor-fuel',
      'plasma-fuel',
      'coolant',
      'tools',
      'batteries',
    ],
  },
  {
    locationId: 'verdant',
    subtitle: 'Agrarwelt // Biosphärenexport',
    economy: 'Nahrung, Textilien, Luxusagrarwaren',
    population: '5.6 Mio.',
    security: 'high',
    produces: ['grain', 'protein', 'meat', 'vegetables', 'luxury-food', 'spices', 'clothing'],
    needs: ['machine-parts', 'tools', 'batteries', 'promethium', 'medical', 'spare-parts', 'water'],
  },
  {
    locationId: 'haven',
    subtitle: 'Kernwelt // Ziviler Handelsknoten',
    economy: 'Medizin, Versorgung, Handel, Kultur',
    population: '12.4 Mio.',
    security: 'high',
    produces: ['medical', 'clothing', 'nutrient-paste', 'art'],
    needs: [
      'steel',
      'electronics',
      'ship-parts',
      'reactor-parts',
      'spare-parts',
      'promethium',
      'grain',
      'protein',
      'luxury-food',
      'amasec',
    ],
    crew: [
      crew('crew-elara-voss', 'Elara Voss', 'Sensorik', ['Scharfsinnig', 'Umsichtig'], 2, 1800, [
        'Scanner',
        'Pistole',
      ]),
      crew('crew-joran-kade', 'Joran Kade', 'Techniker', ['Diszipliniert', 'Loyal'], 3, 1500, [
        'Werkzeug',
        'Karabiner',
      ]),
    ],
  },
  {
    locationId: 'meridian-exchange',
    subtitle: 'Freihafen // Transit und Großhandel',
    economy: 'Versorgung, Umschlag, Zwischenhandel',
    population: '210.000',
    security: 'high',
    produces: ['nutrient-paste'],
    needs: [
      'water',
      'grain',
      'protein',
      'medical',
      'clothing',
      'tools',
      'spare-parts',
      'promethium',
      'electronics',
      'batteries',
      'luxury-food',
      'spices',
      'art',
    ],
  },
  {
    locationId: 'crown-exchange',
    subtitle: 'Freihafen // Luxusmarkt',
    economy: 'Edelsteine, Kunst, Genusswaren',
    population: '76.000',
    security: 'medium',
    produces: ['gems', 'luxury-food', 'art', 'amasec'],
    needs: ['rare-tech', 'spices', 'relics', 'medical', 'clothing', 'vegetables', 'meat'],
  },
  {
    locationId: 'eidolon',
    subtitle: 'Pilgerwelt // Kulturzentrum',
    economy: 'Amasec, Kunst, Pilgerhandel',
    population: '2.2 Mio.',
    security: 'medium',
    produces: ['amasec', 'art', 'relics'],
    needs: [
      'water',
      'grain',
      'protein',
      'medical',
      'clothing',
      'luxury-food',
      'spices',
      'reactor-fuel',
      'batteries',
    ],
  },
  {
    locationId: 'saint-tear',
    subtitle: 'Schreinmond // Pilgerhafen',
    economy: 'Reliquien, Pilgerbedarf',
    population: '190.000',
    security: 'medium',
    produces: ['relics'],
    needs: ['medical', 'water', 'nutrient-paste', 'tools', 'batteries', 'amasec'],
  },
  {
    locationId: 'asterion-array',
    subtitle: 'Forschungsstation // Hochtechnologie',
    economy: 'Elektronik, Cogitatoren, experimentelle Energie',
    population: '64.000',
    security: 'high',
    produces: ['electronics', 'cogitator-parts', 'batteries', 'plasma-fuel', 'rare-tech'],
    needs: [
      'silicite',
      'cuprium',
      'iridite',
      'volucrium',
      'elydrase',
      'orvessium',
      'cyranthite',
      'rare-metals',
      'reactor-parts',
      'coolant',
      'chemicals',
      'polymers',
      'water',
    ],
  },
  {
    locationId: 'vigil-bastion',
    subtitle: 'Militärstation // Arsenal',
    economy: 'Munition, Waffen, Panzerung',
    population: '145.000',
    security: 'high',
    produces: ['ammo', 'infantry-weapons', 'armor-plate', 'explosives'],
    needs: [
      'steel',
      'plasteel',
      'electronics',
      'cogitator-parts',
      'promethium',
      'plasma-fuel',
      'medical',
      'protein',
      'spare-parts',
      'reactor-fuel',
    ],
  },
  {
    locationId: 'niveus',
    subtitle: 'Eiswelt // Kryoindustrie',
    economy: 'Wasser, Kühlmittel, Raffineriegas',
    population: '1.1 Mio.',
    security: 'medium',
    produces: ['water', 'coolant', 'refinery-gas'],
    needs: [
      'machine-parts',
      'industry-parts',
      'tools',
      'spare-parts',
      'reactor-fuel',
      'grain',
      'protein',
      'medical',
      'clothing',
    ],
  },
  {
    locationId: 'skadi',
    subtitle: 'Eismond // Extraktionshafen',
    economy: 'Wassergewinnung, Kühlmittel, Bergbau',
    population: '97.000',
    security: 'medium',
    produces: ['water', 'coolant'],
    needs: [
      'tools',
      'machine-parts',
      'spare-parts',
      'reactor-fuel',
      'nutrient-paste',
      'medical',
      'batteries',
    ],
    trades: ['silicite', 'rare-metals'],
  },
  {
    locationId: 'coldwater-station',
    subtitle: 'Außenstation // Treibstoffdepot',
    economy: 'Promethium, Reaktorbrennstoff, Raffinerie',
    population: '84.000',
    security: 'medium',
    produces: ['promethium', 'reactor-fuel', 'refinery-gas', 'lubricants'],
    needs: [
      'machine-parts',
      'spare-parts',
      'electronics',
      'water',
      'grain',
      'medical',
      'tools',
      'coolant',
    ],
    crew: [
      crew('crew-ivar-denn', 'Ivar Denn', 'Maschinenraum', ['Pragmatisch', 'Robust'], 3, 1250, [
        'Werkzeug',
        'Pistole',
      ]),
    ],
  },
  {
    locationId: 'pale-reach',
    subtitle: 'Eiswelt // Energieversuchsfeld',
    economy: 'Plasmaenergie, Batteriezellen, Forschung',
    population: '420.000',
    security: 'medium',
    produces: ['plasma-fuel', 'batteries'],
    needs: [
      'water',
      'nutrient-paste',
      'medical',
      'tools',
      'spare-parts',
      'reactor-parts',
      'electronics',
      'coolant',
    ],
  },
  {
    locationId: 'blackjaw-outpost',
    subtitle: 'Piratenhafen // Schwarzmarkt',
    economy: 'Schmuggel, Reparaturen, verbotene Daten',
    population: '31.000',
    security: 'low',
    produces: ['obscura', 'proscribed-data'],
    needs: [
      'xeno-artifacts',
      'medical',
      'promethium',
      'spare-parts',
      'ammo',
      'infantry-weapons',
      'armor-plate',
      'water',
      'protein',
      'amasec',
    ],
  },
  {
    locationId: 'gallows-anchor',
    subtitle: 'Piratenanker // Unterwelthandel',
    economy: 'Xeno-Ware, Hehler, Schmuggel',
    population: '18.000',
    security: 'low',
    produces: ['xeno-artifacts'],
    needs: [
      'obscura',
      'proscribed-data',
      'medical',
      'reactor-fuel',
      'spare-parts',
      'ammo',
      'infantry-weapons',
      'luxury-food',
      'amasec',
      'gems',
    ],
  },
];

export const sectorPorts: readonly PortDefinition[] = profiles.map(makePort);

export function sectorPortByLocationId(locationId: string): PortDefinition | null {
  return sectorPorts.find((port) => port.locationId === locationId) ?? null;
}
