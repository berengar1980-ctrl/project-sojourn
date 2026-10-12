# Harrowdrift combat choreography

A combat exchange is a dynamic flight commitment, not a scripted animation.
Flight goals are subject to ship inertia, acceleration, heading, asteroid routing, weapon arcs and damage.

| Initiator's action | Reactor's possible reactions              | Tactical goal                                                                                                              |
| ------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Frontal pass       | Evade, counterfire, cross-pass            | Approach along a revised enemy intercept; evade changes lane, counterfire holds facing, cross-pass crosses the attack line |
| Broadside pass     | Close gap, extend range, counter-pass     | Bring port/starboard weapons into firing arc; reaction either closes range, opens range or answers with its own broadside  |
| Disengage fire     | Pursue, hold fire, break contact          | Gain separation under fire; defender may chase, hold position or also withdraw                                             |
| Flanking pass      | Intercept, turn to face, accelerate clear | Approach enemy side; defender cuts projected path, rotates to meet threat or accelerates clear                             |

## Mines

Mines are tactical resources separate from exchange-action labels. The current
autonomous runtime supports an equipped minefield posture, defensive deployment
when fleeing, and opportunistic drops when the enemy is closing during a close
pass. Ion mines are preferred against intact shields, hunter mines against
unshielded distant targets, and shaped charges against nearby exposed hulls.
A mine requires inventory, suitable range and cooldown. No mine is spawned from
thin air. Mining chokepoints, forcing detours and tractor-assisted pushes into a
minefield remain future **choreography tactics**, not confirmed implemented
behavior.

## Tractor and asteroid throw

While a ship's own shields are active, tractor combat pulses and the asteroid
throw are unavailable. If its own shields have failed, the ship has a working
tractor subsystem and finds a small asteroid within its own tractor range, it
can launch that asteroid at the opposing ship. The rock becomes a moving
projectile, with a luminous rotating tractor effect. On contact, it inflicts
heavy shield damage and heavy hull damage if shields are breached. The action
has a cooldown and consumes the selected rock. This is an opportunistic
high-risk counterattack, not an unconditional response to enemy shield loss.

These behaviors require full runtime and visual validation after merging.
