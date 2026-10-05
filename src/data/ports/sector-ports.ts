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
    locationId: 'cinder',
    subtitle: 'Glutwelt // Hochtemperaturindustrie',
    economy: 'Treibstoffe, Raffineriegas, Chemikalien',
    population: '118.000',
    security: 'medium',
    produces: [
      'synthetic-fuel',
      'refinery-gas',
      'chemicals',
      'lubricants',
      'polymers',
      'explosives',
    ],
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
    locationId: 'karth-industrial',
    subtitle: 'Industriewelt // Schwerindustrie',
    economy: 'Metallurgie, Maschinenbau, Panzerung',
    population: '8.7 Mio.',
    security: 'high',
    shipyard: true,
    produces: [
      'steel',
      'composite-plate',
      'industrial-ceramics',
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
      'synthetic-fuel',
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
      'composite-plate',
      'industrial-ceramics',
      'alloys',
      'electronics',
      'processor-modules',
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
    needs: [
      'machine-parts',
      'tools',
      'batteries',
      'synthetic-fuel',
      'medical',
      'spare-parts',
      'water',
    ],
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
      'synthetic-fuel',
      'grain',
      'protein',
      'luxury-food',
      'aged-spirits',
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
      'synthetic-fuel',
      'electronics',
      'batteries',
      'luxury-food',
      'spices',
      'art',
    ],
  },
  {
    locationId: 'crown',
    subtitle: 'Handelswelt // Luxusmarkt',
    economy: 'Edelsteine, Kunst, Genusswaren',
    population: '76.000',
    security: 'medium',
    produces: ['gems', 'luxury-food', 'art', 'aged-spirits'],
    needs: ['rare-tech', 'spices', 'antiquities', 'medical', 'clothing', 'vegetables', 'meat'],
  },
  {
    locationId: 'eidolon',
    subtitle: 'Kulturwelt // Archive und Bildung',
    economy: 'Kunst, Spirituosen, Archivhandel',
    population: '2.2 Mio.',
    security: 'medium',
    produces: ['aged-spirits', 'art', 'antiquities'],
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
    locationId: 'aurora',
    subtitle: 'Eiswelt // Außenkolonie',
    economy: 'Archive, Versorgung, Forschung',
    population: '190.000',
    security: 'medium',
    produces: ['antiquities'],
    needs: ['medical', 'water', 'nutrient-paste', 'tools', 'batteries', 'aged-spirits'],
  },
  {
    locationId: 'asterion-array',
    subtitle: 'Forschungsstation // Hochtechnologie',
    economy: 'Elektronik, Prozessormodule, experimentelle Energie',
    population: '64.000',
    security: 'high',
    produces: ['electronics', 'processor-modules', 'batteries', 'plasma-fuel', 'rare-tech'],
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
    locationId: 'vigil-station',
    subtitle: 'Militärstation // Arsenal',
    economy: 'Munition, Waffen, Panzerung',
    population: '145.000',
    security: 'high',
    produces: ['ammo', 'infantry-weapons', 'armor-plate', 'explosives'],
    needs: [
      'steel',
      'composite-plate',
      'electronics',
      'processor-modules',
      'synthetic-fuel',
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
    economy: 'Synthetische Treibstoffe, Reaktorbrennstoff, Raffinerie',
    population: '84.000',
    security: 'medium',
    produces: ['synthetic-fuel', 'reactor-fuel', 'refinery-gas', 'lubricants'],
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
    locationId: 'ilex',
    subtitle: 'Koloniewelt // Sensortechnik',
    economy: 'Energiesysteme, Batteriezellen, Sensorik',
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
    produces: ['narcotics', 'stolen-data'],
    needs: [
      'alien-artifacts',
      'medical',
      'synthetic-fuel',
      'spare-parts',
      'ammo',
      'infantry-weapons',
      'armor-plate',
      'water',
      'protein',
      'aged-spirits',
    ],
  },
  {
    locationId: 'gallows-anchor',
    subtitle: 'Piratenanker // Unterwelthandel',
    economy: 'Artefakte, Hehlerware, Schmuggel',
    population: '18.000',
    security: 'low',
    produces: ['alien-artifacts'],
    needs: [
      'narcotics',
      'stolen-data',
      'medical',
      'reactor-fuel',
      'spare-parts',
      'ammo',
      'infantry-weapons',
      'luxury-food',
      'aged-spirits',
      'gems',
    ],
  },
];

export const sectorPorts: readonly PortDefinition[] = profiles.map(makePort);

export function sectorPortByLocationId(locationId: string): PortDefinition | null {
  return sectorPorts.find((port) => port.locationId === locationId) ?? null;
}
