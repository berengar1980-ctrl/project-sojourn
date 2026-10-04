import type { PortDefinition } from '../../core/port-types';

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
      { id: 'steel', name: 'Stahl', basePrice: 510, stock: 3200, demand: 0.86, production: 0.28 },
      { id: 'fuel', name: 'Treibstoff', basePrice: 118, stock: 8300, demand: 0.55, production: 0.78 },
      { id: 'food', name: 'Nahrung', basePrice: 94, stock: 9200, demand: 0.48, production: 0.92 },
      { id: 'machine-parts', name: 'Maschinenteile', basePrice: 390, stock: 1400, demand: 0.82, production: 0.34 },
      { id: 'electronics', name: 'Elektronik', basePrice: 660, stock: 680, demand: 0.91, production: 0.18 },
      { id: 'medicine', name: 'Medikamente', basePrice: 305, stock: 4100, demand: 0.52, production: 0.74 },
      { id: 'promethium', name: 'Promethium', basePrice: 2380, stock: 180, demand: 0.88, production: 0.08 },
      { id: 'water', name: 'Wasser', basePrice: 58, stock: 12600, demand: 0.36, production: 0.95 },
      { id: 'ferrite', name: 'Ferrit', basePrice: 12, stock: 4300, demand: 0.62, production: 0.2 },
    ],
    crew: [
      { id: 'crew-elara-voss', name: 'Elara Voss', role: 'Sensorik', traits: ['Scharfsinnig', 'Umsichtig'], combat: 2, salary: 1800, equipment: ['Scanner', 'Pistole'] },
      { id: 'crew-joran-kade', name: 'Joran Kade', role: 'Techniker', traits: ['Diszipliniert', 'Loyal'], combat: 3, salary: 1500, equipment: ['Werkzeug', 'Karabiner'] },
      { id: 'crew-mira-solen', name: 'Mira Solen', role: 'Steuermann', traits: ['Ruhig', 'Präzise'], combat: 2, salary: 1600, equipment: ['Pistole'] },
      { id: 'crew-sila-renn', name: 'Sila Renn', role: 'Quartiermeister', traits: ['Skrupellos', 'Effizient'], combat: 3, salary: 1400, equipment: ['Pistole', 'Panzerweste'] },
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
      { id: 'steel', name: 'Stahl', basePrice: 510, stock: 14800, demand: 0.42, production: 0.96 },
      { id: 'fuel', name: 'Treibstoff', basePrice: 118, stock: 11400, demand: 0.45, production: 0.9 },
      { id: 'food', name: 'Nahrung', basePrice: 94, stock: 1700, demand: 0.92, production: 0.12 },
      { id: 'machine-parts', name: 'Maschinenteile', basePrice: 390, stock: 8800, demand: 0.5, production: 0.88 },
      { id: 'electronics', name: 'Elektronik', basePrice: 660, stock: 520, demand: 0.96, production: 0.16 },
      { id: 'medicine', name: 'Medikamente', basePrice: 305, stock: 1900, demand: 0.66, production: 0.28 },
      { id: 'promethium', name: 'Promethium', basePrice: 2380, stock: 640, demand: 0.72, production: 0.44 },
      { id: 'water', name: 'Wasser', basePrice: 58, stock: 7200, demand: 0.54, production: 0.58 },
      { id: 'ferrite', name: 'Ferrit', basePrice: 12, stock: 780, demand: 0.98, production: 0.04 },
    ],
    crew: [
      { id: 'crew-darek-ibn', name: 'Darek Ibn', role: 'Navigator', traits: ['Umsichtig', 'Loyal'], combat: 2, salary: 1900, equipment: ['Nav-Deck', 'Pistole'] },
      { id: 'crew-tomas-reik', name: 'Tomas Reik', role: 'Waffenoffizier', traits: ['Diszipliniert', 'Aggressiv'], combat: 5, salary: 1700, equipment: ['Karabiner', 'Panzerweste'] },
      { id: 'crew-lysa-orn', name: 'Lysa Orn', role: 'Reaktortechnik', traits: ['Hartnäckig', 'Effizient'], combat: 2, salary: 1650, equipment: ['Werkzeug'] },
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
      { id: 'steel', name: 'Stahl', basePrice: 510, stock: 900, demand: 0.76, production: 0.08 },
      { id: 'fuel', name: 'Treibstoff', basePrice: 118, stock: 9200, demand: 0.44, production: 0.88 },
      { id: 'food', name: 'Nahrung', basePrice: 94, stock: 620, demand: 0.94, production: 0.06 },
      { id: 'machine-parts', name: 'Maschinenteile', basePrice: 390, stock: 450, demand: 0.92, production: 0.05 },
      { id: 'electronics', name: 'Elektronik', basePrice: 660, stock: 240, demand: 0.78, production: 0.03 },
      { id: 'medicine', name: 'Medikamente', basePrice: 305, stock: 190, demand: 0.96, production: 0.02 },
      { id: 'promethium', name: 'Promethium', basePrice: 2380, stock: 300, demand: 0.67, production: 0.18 },
      { id: 'water', name: 'Wasser', basePrice: 58, stock: 15400, demand: 0.3, production: 0.94 },
      { id: 'ferrite', name: 'Ferrit', basePrice: 12, stock: 1600, demand: 0.71, production: 0.08 },
    ],
    crew: [
      { id: 'crew-ivar-denn', name: 'Ivar Denn', role: 'Maschinenraum', traits: ['Pragmatisch', 'Robust'], combat: 3, salary: 1250, equipment: ['Werkzeug', 'Pistole'] },
      { id: 'crew-naia-vex', name: 'Naia Vex', role: 'Medizin', traits: ['Ruhig', 'Gewissenhaft'], combat: 1, salary: 1450, equipment: ['Medkit'] },
    ],
  },
];

export function tutorialPortByLocationId(locationId: string): PortDefinition | null {
  return tutorialPorts.find((port) => port.locationId === locationId) ?? null;
}
