# Weapon balance and loadout behavior (MK I baseline)

The combat runtime reads `combatShieldDamage` and `combatHullDamage`. The historical
`shieldDamage` / `hullDamage` fields are not the canonical strategic-combat
damage values. Damage variants must update both pairs consistently.

- **Front Repeater Mk I:** 1.75 shield / 1.75 hull per shot; weapon cooldown
  0.20 s, ship fire-control cadence 0.65 s. Two synchronized repeaters reach
  3.50 damage per volley, or about 5.38 sustained theoretical DPS at 100% hit chance.
- **Flux Projector Mk I:** 15 shield / 1 hull per shot; 1.50 s weapon cooldown;
  range 700 m, forward 60-degree arc. Its cyan projectile and radial shield
  discharge are presentation only, not EMP or area damage.
- **Railgun Mk I:** 0.9 shield / 54 hull; 7.2 s individual reload.
  Two loaded forward railguns can launch a coordinated salvo.
- **Shared fire-control cadence:** remains 0.65 s per ship. Independent weapon
  reloads continue to tick even while another hardpoint fires.
- **Salvo scheduling:** multiple valid, ready forward mounts may fire in one
  decision; shield-phase inefficiency and obvious overkill are checked.
- **AI:** weapon-posture scoring uses the effective per-weapon cadence instead
  of assuming a 0.20-second repeater can fire five times per second in isolation.

These are *upper bounds*, not battle outcome guarantees. Crew bonuses, shield
modifiers, armor, line of sight, arc, movement and misses change observed DPS.
Only patrol ships presently have two active forward mounts; freighters, miners,
and salvagers have one active forward mount even though additional unused
physical hardpoints may exist in the sprite metadata.

## New weapon checklist

1. Define all six tiers in the ship component catalog, including native combat
   damage and mounting constraints.
2. Register its family in the weapon union, visual timings and shield/hull
   contact renderer when it has a genuinely new effect.
3. Admit the family to appropriate forward / broadside / universal JSON hardpoints.
4. Test the canonical weapon-fire-control scheduler, AI posture scoring,
   variants, multi-weapon volleys, compatibility, energy usage and visuals.
5. Keep a separate branch and merge only after review and passing checks.
