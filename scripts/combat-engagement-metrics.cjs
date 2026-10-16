'use strict';

// Read-only evaluation of whether existing weapons can reach and face an opponent.
// Delegates arc checks to the game's canonical weapon-geometry implementation.
function createEngagementMetrics(setups, weaponInArc) {
  const secondsInRange = [0, 0];
  const secondsInArc = [0, 0];
  const secondsPhaseFire = [0, 0];
  let previousTime = null;

  function sample(frame) {
    const time = frame.elapsedSeconds;
    if (previousTime === null) {
      previousTime = time;
      return;
    }
    const dt = time - previousTime;
    previousTime = time;
    if (!Number.isFinite(dt) || dt <= 0) return;
    const combatants = [frame.attacker, frame.defender];
    for (let index = 0; index < 2; index += 1) {
      const actor = combatants[index];
      const target = combatants[1 - index];
      const setup = setups[index];
      const distance = Math.hypot(
        target.position.x - actor.position.x,
        target.position.y - actor.position.y
      );
      const withinRange = setup.weapons.some((component) => {
        const weapon = component.weapon;
        return weapon && distance <= weapon.rangeMeters;
      });
      if (withinRange) secondsInRange[index] += dt;
      const state = { ...actor, setup };
      const inArc = setup.weapons.some((component, slot) => {
        const weapon = component.weapon;
        return (
          weapon &&
          distance <= weapon.rangeMeters &&
          weaponInArc(state, target.position, slot, weapon)
        );
      });
      if (inArc) secondsInArc[index] += dt;
      if (actor.strategy?.phase === 'fire') secondsPhaseFire[index] += dt;
    }
  }

  function summarize() {
    const round = (value) => Number(value.toFixed(2));
    return {
      attackerWeaponRangeSeconds: round(secondsInRange[0]),
      defenderWeaponRangeSeconds: round(secondsInRange[1]),
      attackerWeaponArcSeconds: round(secondsInArc[0]),
      defenderWeaponArcSeconds: round(secondsInArc[1]),
      attackerFirePhaseSeconds: round(secondsPhaseFire[0]),
      defenderFirePhaseSeconds: round(secondsPhaseFire[1]),
    };
  }

  return { sample, summarize };
}

module.exports = { createEngagementMetrics };
