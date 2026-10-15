import type { MutableCombatant } from './strategic-combat-types';
import type { CombatExchange } from './combat-exchange-machine';

const ACTION_NAMES: Record<string, string> = {
  frontal_pass: 'FRONTALANFLUG',
  broadside_pass: 'BREITSEITENPASSAGE',
  disengage_fire: 'ABSTAND GEWINNEN',
  flanking_pass: 'FLANKIEREN',
};

const REACTION_NAMES: Record<string, string> = {
  evade: 'AUSWEICHEN',
  accelerate_clear: 'BESCHLEUNIGEN',
  extend_range: 'ABSTAND HALTEN',
  break_contact: 'KONTAKT LÖSEN',
  close_gap: 'ANNÄHERN',
  intercept: 'ABFANGEN',
  pursue: 'VERFOLGEN',
  cross_pass: 'KREUZEN',
  counter_pass: 'GEGENPASSAGE',
  counterfire: 'GEGENFEUER',
  turn_to_face: 'ZIEL ANVISIEREN',
  hold_fire: 'POSITION HALTEN',
};

/** The exchange owns its HUD labels; idle phase transitions do not erase them. */
export function updateExchangeIntents(
  initiator: MutableCombatant,
  reactor: MutableCombatant,
  next: CombatExchange
): void {
  if (initiator.tactic === 'flee') initiator.combatIntent = 'FLIEHEN';
  else if (next.action) initiator.combatIntent = ACTION_NAMES[next.action] ?? 'KURS HALTEN';
  if (reactor.tactic === 'flee') reactor.combatIntent = 'FLIEHEN';
  else if (next.reaction) reactor.combatIntent = REACTION_NAMES[next.reaction] ?? 'KURS HALTEN';
}
