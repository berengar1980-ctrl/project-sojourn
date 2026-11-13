import type { BoardingMapDefinition } from '../../core/boarding-types';

export const boardingMaps = [
  {
    id: 'long-corridor',
    name: 'Langer Gang',
    columns: 9,
    rows: 7,
    walls: [
      '0,0',
      '1,0',
      '2,0',
      '3,0',
      '4,0',
      '5,0',
      '6,0',
      '7,0',
      '8,0',
      '0,2',
      '1,2',
      '2,2',
      '3,2',
      '4,2',
      '5,2',
      '6,2',
      '7,2',
      '8,2',
      '0,4',
      '1,4',
      '2,4',
      '3,4',
      '4,4',
      '5,4',
      '6,4',
      '7,4',
      '8,4',
      '0,6',
      '1,6',
      '2,6',
      '3,6',
      '4,6',
      '5,6',
      '6,6',
      '7,6',
      '8,6',
    ],
    doors: [],
    cover: [
      { q: 3, r: 1, side: 3 },
      { q: 5, r: 1, side: 0 },
      { q: 4, r: 3, side: 3 },
      { q: 3, r: 5, side: 3 },
      { q: 5, r: 5, side: 0 },
    ],
  },
  {
    id: 'bulkhead-door',
    name: 'Schott mit Tür',
    columns: 9,
    rows: 7,
    walls: ['4,0', '4,1', '4,2', '4,4', '4,5', '4,6'],
    doors: [{ id: 'door-4-3', q: 4, r: 3 }],
    cover: [
      { q: 3, r: 3, side: 0 },
      { q: 5, r: 3, side: 3 },
      { q: 2, r: 1, side: 0 },
      { q: 6, r: 5, side: 3 },
    ],
  },
  {
    id: 'central-breach',
    name: 'Zentraler Durchbruch',
    columns: 9,
    rows: 7,
    walls: ['3,1', '3,2', '3,4', '3,5', '5,1', '5,2', '5,4', '5,5'],
    doors: [
      { id: 'door-3-3', q: 3, r: 3 },
      { id: 'door-5-3', q: 5, r: 3 },
    ],
    cover: [
      { q: 4, r: 3, side: 3 },
      { q: 4, r: 3, side: 0 },
      { q: 2, r: 3, side: 0 },
      { q: 6, r: 3, side: 3 },
      { q: 4, r: 1, side: 5 },
      { q: 4, r: 5, side: 2 },
    ],
  },
] as const satisfies readonly BoardingMapDefinition[];

/** Author each salvage interior as a compact, visibly distinct 9×7 deck plan.
 * # = wall, D = closed bulkhead, . = traversable floor.
 */
function wreckDeck(
  id: string,
  name: string,
  layout: readonly string[],
  cover: BoardingMapDefinition['cover']
): BoardingMapDefinition {
  if (layout.length !== 7 || layout.some((row) => row.length !== 9)) {
    throw new Error('Ungültiger Wrack-Deckplan: ' + id);
  }
  const walls: string[] = [];
  const doors: { id: string; q: number; r: number }[] = [];
  for (const [r, line] of layout.entries()) {
    for (const [q, symbol] of [...line].entries()) {
      if (symbol === '#') walls.push(q + ',' + r);
      if (symbol === 'D') doors.push({ id: 'door-' + q + '-' + r, q, r });
    }
  }
  return { id, name, columns: 9, rows: 7, walls, doors, cover };
}

const wreckDecks = [
  wreckDeck(
    'wreck-corridors',
    'Korridorlabyrinth',
    ['#########', '..#..#...', '..#..#...', '..D..D...', '..#..#...', '.........', '#########'],
    [{ q: 3, r: 3, side: 3 }, { q: 6, r: 3, side: 3 }]
  ),
  wreckDeck(
    'wreck-double-deck',
    'Doppeldeck-Verbindung',
    ['#########', '.........', '##.###.##', '.........', '##.###.##', '.........', '#########'],
    [{ q: 3, r: 1, side: 3 }, { q: 5, r: 5, side: 0 }]
  ),
  wreckDeck(
    'wreck-engine',
    'Maschinenraum',
    ['#########', '...##....', '...##....', '.........', '...##....', '...##....', '#########'],
    [{ q: 2, r: 3, side: 0 }, { q: 6, r: 3, side: 3 }]
  ),
  wreckDeck(
    'wreck-cargo',
    'Verstellter Frachtraum',
    ['#########', '..##.....', '......##.', '.........', '..##.....', '.....##..', '#########'],
    [{ q: 4, r: 3, side: 3 }, { q: 5, r: 3, side: 0 }]
  ),
  wreckDeck(
    'wreck-quarters',
    'Mannschaftsquartiere',
    ['#########', '...#.#...', '...D.D...', '...#.#...', '...D.D...', '...#.#...', '#########'],
    [{ q: 4, r: 3, side: 3 }, { q: 6, r: 4, side: 0 }]
  ),
  wreckDeck(
    'wreck-bridge',
    'Brückendeck',
    ['#########', '....##...', '...#.....', '...D.....', '...#.....', '....##...', '#########'],
    [{ q: 5, r: 3, side: 3 }, { q: 6, r: 2, side: 0 }]
  ),
  wreckDeck(
    'wreck-reactor',
    'Reaktorring',
    ['#########', '...###...', '...#.#...', '...D.D...', '...#.#...', '...###...', '#########'],
    [{ q: 2, r: 3, side: 0 }, { q: 6, r: 3, side: 3 }]
  ),
  wreckDeck(
    'wreck-medbay',
    'Isolationsstation',
    ['#########', '..#...#..', '..D...D..', '..#...#..', '..D...D..', '..#...#..', '#########'],
    [{ q: 3, r: 3, side: 3 }, { q: 5, r: 3, side: 0 }]
  ),
];



export function boardingMapById(id: string): BoardingMapDefinition | null {
  return [...boardingMaps, ...wreckDecks].find((map) => map.id === id) ?? null;
}

export const boardingWreckDecks: readonly BoardingMapDefinition[] = wreckDecks;
