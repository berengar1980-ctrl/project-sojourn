import type {
  CommodityId,
  PortCommodityDefinition,
  PortCrewCandidate,
  PortDefinition,
} from '../../core/port-types';

function commodity(
  id: CommodityId,
  name: string,
  basePrice: number,
  stock: number,
  demand: number,
  production: number
): PortCommodityDefinition {
  return { id, name, basePrice, stock, demand, production };
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

export const tutorialPorts: readonly PortDefinition[] = [
  {
    locationId: 'haven',
    subtitle: 'Freihafen // Ziviler Handelsknoten',
    economy: 'Handel, Versorgung, Transit',
    population: '1.8 Mio.',
    security: 'high',
    shipyard: false,
    producedCommodityIds: ['food', 'water', 'medicine'],
    neededCommodityIds: ['steel', 'machine-parts', 'electronics'],
    commodities: [
      commodity('steel', 'Stahl', 510, 3200, 0.86, 0.28),
      commodity('fuel', 'Treibstoff', 118, 8300, 0.55, 0.78),
      commodity('food', 'Nahrung', 94, 9200, 0.48, 0.92),
      commodity('machine-parts', 'Maschinenteile', 390, 1400, 0.82, 0.34),
      commodity('electronics', 'Elektronik', 660, 680, 0.91, 0.18),
      commodity('medicine', 'Medikamente', 305, 4100, 0.52, 0.74),
      commodity('promethium', 'Promethium', 2380, 180, 0.88, 0.08),
      commodity('water', 'Wasser', 58, 12600, 0.36, 0.95),
      commodity('ferrite', 'Ferrit', 12, 4300, 0.62, 0.2),
    ],
    crew: [
      crew(
        'crew-elara-voss',
        'Elara Voss',
        'Sensorik',
        ['Scharfsinnig', 'Umsichtig'],
        2,
        1800,
        ['Scanner', 'Pistole']
      ),
      crew(
        'crew-joran-kade',
        'Joran Kade',
        'Techniker',
        ['Diszipliniert', 'Loyal'],
        3,
        1500,
        ['Werkzeug', 'Karabiner']
      ),
      crew('crew-mira-solen', 'Mira Solen', 'Steuermann', ['Ruhig', 'Präzise'], 2, 1600, [
        'Pistole',
      ]),
      crew(
        'crew-sila-renn',
        'Sila Renn',
        'Quartiermeister',
        ['Skrupellos', 'Effizient'],
        3,
        1400,
        ['Pistole', 'Panzerweste']
      ),
    ],
  },
  {
    locationId: 'karth-forge',
    subtitle: 'Industriewelt // Orbitalwerft',
    economy: 'Schwerindustrie, Raffinerien, Schiffbau',
    population: '6.4 Mio.',
    security: 'high',
    shipyard: true,
    producedCommodityIds: ['steel', 'machine-parts', 'fuel'],
    neededCommodityIds: ['ferrite', 'electronics', 'food'],
    commodities: [
      commodity('steel', 'Stahl', 510, 14800, 0.42, 0.96),
      commodity('fuel', 'Treibstoff', 118, 11400, 0.45, 0.9),
      commodity('food', 'Nahrung', 94, 1700, 0.92, 0.12),
      commodity('machine-parts', 'Maschinenteile', 390, 8800, 0.5, 0.88),
      commodity('electronics', 'Elektronik', 660, 520, 0.96, 0.16),
      commodity('medicine', 'Medikamente', 305, 1900, 0.66, 0.28),
      commodity('promethium', 'Promethium', 2380, 640, 0.72, 0.44),
      commodity('water', 'Wasser', 58, 7200, 0.54, 0.58),
      commodity('ferrite', 'Ferrit', 12, 780, 0.98, 0.04),
    ],
    crew: [
      crew(
        'crew-darek-ibn',
        'Darek Ibn',
        'Navigator',
        ['Umsichtig', 'Loyal'],
        2,
        1900,
        ['Nav-Deck', 'Pistole']
      ),
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
    locationId: 'coldwater-station',
    subtitle: 'Versorgungsstation // Randsektor',
    economy: 'Versorgung, Treibstoff, Umschlag',
    population: '84.000',
    security: 'medium',
    shipyard: false,
    producedCommodityIds: ['fuel', 'water'],
    neededCommodityIds: ['food', 'medicine', 'machine-parts'],
    commodities: [
      commodity('steel', 'Stahl', 510, 900, 0.76, 0.08),
      commodity('fuel', 'Treibstoff', 118, 9200, 0.44, 0.88),
      commodity('food', 'Nahrung', 94, 620, 0.94, 0.06),
      commodity('machine-parts', 'Maschinenteile', 390, 450, 0.92, 0.05),
      commodity('electronics', 'Elektronik', 660, 240, 0.78, 0.03),
      commodity('medicine', 'Medikamente', 305, 190, 0.96, 0.02),
      commodity('promethium', 'Promethium', 2380, 300, 0.67, 0.18),
      commodity('water', 'Wasser', 58, 15400, 0.3, 0.94),
      commodity('ferrite', 'Ferrit', 12, 1600, 0.71, 0.08),
    ],
    crew: [
      crew(
        'crew-ivar-denn',
        'Ivar Denn',
        'Maschinenraum',
        ['Pragmatisch', 'Robust'],
        3,
        1250,
        ['Werkzeug', 'Pistole']
      ),
      crew(
        'crew-naia-vex',
        'Naia Vex',
        'Medizin',
        ['Ruhig', 'Gewissenhaft'],
        1,
        1450,
        ['Medkit']
      ),
    ],
  },
];

export function tutorialPortByLocationId(locationId: string): PortDefinition | null {
  return tutorialPorts.find((port) => port.locationId === locationId) ?? null;
}
