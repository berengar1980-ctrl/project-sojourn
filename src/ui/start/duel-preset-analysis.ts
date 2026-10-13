import { getAllShipDefinitions } from '../../systems/ships';
import { crewDefinitions } from '../../data/crew/crew-definitions';
import { createDuelArena, type DuelMapKind } from '../../systems/combat/duel-arena-presets';
import { analyzeReproducibleDuel, formatDuelTelemetry, type DuelTelemetry } from '../../systems/combat/combat-duel-telemetry';
import { duelCombatant } from './duel-lobby';
import { DUEL_ENCOUNTERS, resolveDuelPreset } from './duel-presets';

export function analyzeDuelPreset(
  presetId: string,
  map: DuelMapKind = 'empty',
  overrideSeed?: number
): DuelTelemetry {
  const preset = DUEL_ENCOUNTERS.find((entry) => entry.id === presetId);
  if (!preset) throw new Error('Unknown duel encounter: ' + presetId);
  const ships = getAllShipDefinitions();
  const drafts = resolveDuelPreset(preset, ships);
  const setups = drafts.map((draft, index) => {
    const ship = ships.find((entry) => entry.id === draft.shipId);
    if (!ship) throw new Error('Unknown ship: ' + draft.shipId);
    const crew = crewDefinitions[draft.crewIndex % crewDefinitions.length]!;
    return duelCombatant(index, {
      shipId: draft.shipId,
      weapons: draft.weapons,
      mines: [],
      crewId: crew.id,
    }, ship);
  });
  const combatants = preset.id === 'alpha'
    ? setups.map((setup) => ({
        ...setup,
        shieldHp: setup.shieldHp * 8,
        hullHp: setup.hullHp * 5,
        damageMultiplier: setup.damageMultiplier * 0.25,
      }))
    : setups;
  const seed = overrideSeed ?? preset.seed;
  return analyzeReproducibleDuel({
    name: preset.title,
    seed,
    attacker: combatants[0]!,
    defender: combatants[1]!,
    arena: createDuelArena(map, seed),
  });
}

export function formatPresetAnalysis(results: readonly DuelTelemetry[]): string {
  const rows = results.map((result) =>
    [result.name, result.seed, result.durationSeconds, result.winner ?? 'timeout',
      result.exchanges, Object.values(result.reactions).reduce((sum, count) => sum + count, 0)]
      .join(' | ')
  );
  return [
    '# Harrowdrift · Duellanalyse',
    'Preset | Seed | Dauer (s) | Sieger | Exchanges | Reaktionen',
    '--- | --- | --- | --- | --- | ---',
    ...rows,
    '',
    ...results.map(formatDuelTelemetry),
  ].join('\n\n');
}
