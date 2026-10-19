# Combat weapon balance

Combat reads `combatShieldDamage` and `combatHullDamage`.
Damage variants must update those values.

## MK I

- Front Repeater: 1.75 shield, 1.75 hull, 0.20 s weapon CD.
- Flux Projector: 15 shield, 1 hull, 1.50 s weapon CD.
- Railgun: 0.9 shield, 54 hull, 7.20 s weapon CD.

The ship-wide fire-control CD remains 0.65 s.

Two loaded front repeaters may launch together for 3.5 damage per
salvo, approximately 5.38 theoretical DPS at 100% hit chance.

The Flux Projector has an independent cyan pulse and discharge effect.
It does not inflict EMP or area damage.

Only patrol ships presently have two active front weapon slots.

## Adding weapons

1. Define all six weapon tiers and actual combat damage.
2. Register the weapon family and its presentation effects.
3. Allow the family on compatible hardpoints.
4. Test cooldowns, salvos, damage, variants, AI and visuals.
5. Review passing checks before merging.
