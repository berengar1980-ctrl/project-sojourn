# Weapon balance and loadout behavior

Combat uses `combatShieldDamage` and `combatHullDamage`, not the
historical nominal damage values. Damage variants must update both.

## MK I baseline

| Weapon | Shield | Hull | Weapon CD | Range |
| --- | ---: | ---: | ---: | ---: |
| Front Repeater | 1.75 | 1.75 | 0.20 s | 600 m |
| Flux Projector | 15 | 1 | 1.50 s | 700 m |
| Railgun | 0.9 | 54 | 7.20 s | 1600 m |

The ship-wide fire-control cadence remains 0.65 s. Two synchronized
repeaters can deal 3.5 damage per volley: about 5.38 theoretical DPS
with perfect hits. Both railguns and mixed forward batteries can share
a salvo. Very weak hits and obvious overkill are avoided.

Weapon-posture scoring uses the achievable per-mount cadence rather
than assuming a Repeater fires every 0.20 s. Enemy shields, crew
skills, armor, accuracy and movement still alter real outcomes.

The Flux Projector creates a separate cyan energy packet and radial
surface discharge without adding EMP or area damage.

Only patrol ships currently have two **active** front hardpoints.
Other ship roles each have one active front slot.

## Adding weapon families

1. Add all six tiers and the actual combat damage values.
2. Register the family and presentation effects.
3. Configure legal mounting families in the ship hardpoint JSON.
4. Test volleys, damage, variants, arcs, AI, energy and effects.
5. Review and test changes before any explicitly authorized merge.
