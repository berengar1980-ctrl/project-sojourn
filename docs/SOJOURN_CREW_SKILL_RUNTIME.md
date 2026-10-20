# Project Sojourn – Crew Skill Runtime Audit

**Audit basis:** Voidbound `main` → Project Sojourn  
**Scope:** every runtime use of `stationSkill`, `stationFactor` and `stationReduction` plus sensor/transponder extensions.

This document separates three states:

- **LIVE** – the Voidbound effect is connected to an existing Sojourn gameplay loop.
- **READY** – the exact formula is ported and tested, but the Sojourn gameplay system that consumes it is not complete yet.
- **OPEN** – the required parent system itself does not exist yet; do not invent a substitute just to mark the skill complete.

## Shared station performance

Both projects use the same core station model:

- assigned specialist: **60 %**
- synergy from the rest of the active crew: **40 %**
- multiple equal-skill stations: best station at full value; each additional station contributes **35 % of its performance above automation 20**
- understaffing reduces the final station value
- automation baseline: **20**
- Voidbound then adds a captain command bonus: `round((order + duty) × 1.5)`

Sojourn additionally already applies injury, motivation and social-trait modifiers before station performance is resolved. Its runtime already accepts a generic `commandBonus`, but the player-captain trait system that supplies Voidbound's Order/Duty command value does not exist yet, so that final captain contribution is **READY**, not live.

## Piloting

| Effect                     | Voidbound formula / behavior                                             | Sojourn                                                                           |
| -------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Strategic travel time      | `1 - skill/100 × 0.15`                                                   | **LIVE** – converted to equivalent speed multiplier `1 / travelTimeMultiplier`    |
| Strategic fuel use         | `1 - skill/100 × 0.10`                                                   | **READY** – exact formula ported; player strategic fuel system is not implemented |
| Combat dodge               | `skill/100 × 0.20`                                                       | **READY** – exact formula ported; full ship combat firing loop is not implemented |
| Corsair interception evade | average Sensors + Piloting, then `clamp((navigation-25)×0.006, 0, 0.45)` | **READY** – exact formula ported; player interception/Corsair system is open      |

At skill 100, Piloting gives 15 % shorter travel time, about 17.65 % equivalent travel-speed gain, 10 % lower fuel use and up to 20 % dodge.

## Sensors

Sensors are not one generic range bonus in Voidbound. They operate several independent detection channels.

| Effect                            | Voidbound formula / behavior                                                                      | Sojourn                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Tactical ship-contact range       | `(1.4 + skill×0.045) × sensor hardware`                                                           | **LIVE** – used by sector contact service                                                    |
| Civilian transponder range        | `clamp(26 + skill×0.2, 28, 46) × sensor hardware`                                                 | **LIVE** – star-map civilian NPC visibility                                                  |
| Corsair detection                 | tactical range × **0.78**                                                                         | **READY** – service supports it; no live Corsair population yet                              |
| Corsair identification            | `max(0.85, corsair detection × 0.52)`                                                             | **READY**                                                                                    |
| Weapon hit bonus                  | `skill/100 × 0.15`                                                                                | **READY** – formula ported; full firing loop open                                            |
| Market-intel range                | `(8 + skill×0.22) × sensor hardware`                                                              | **LIVE**                                                                                     |
| Market-intel age                  | `round((100-skill)/45 + distanceRatio×(7-0.055×skill))`, clamped 0–10 days                        | **LIVE**                                                                                     |
| Market history integrity          | old reports must come from actual historical snapshots; missing history is never fabricated       | **LIVE**                                                                                     |
| Special salvage-wreck range       | `(5 + skill×0.11) × sensor hardware`                                                              | **READY** – exact formula ported; sector-level hidden wreck discovery is not yet implemented |
| Contraband anomaly detection      | false positive + load + suspicion + illegal cargo signal modified by sensor skill and concealment | **READY** – exact formula ported; customs/smuggling parent system open                       |
| Physical contraband scan strength | `clamp(0.34 + skill/145 + customsStrength×0.18, 0.25, 0.97)`                                      | **READY**                                                                                    |
| Mining-claim counter-detection    | player `clamp(0.45 +(player-npc)/140, .1,.92)`; NPC `clamp(0.42 +(npc-player)/140,.1,.92)`        | **READY** – claims parent system open                                                        |
| Corsair interception evade        | combined with Piloting                                                                            | **READY**                                                                                    |
| Mine detection                    | Sojourn extension: sensor skill + hardware tier/range vs mine stealth                             | **LIVE**                                                                                     |

The star map no longer has omniscient civilian NPC visibility. Remote market prices are no longer globally known at game start; the Sensor station now determines which markets can be read and how stale that information is.

## Weapons

| Effect                                  | Voidbound formula / behavior                                 | Sojourn                                |
| --------------------------------------- | ------------------------------------------------------------ | -------------------------------------- |
| Damage                                  | `1 + skill/100 × 0.20`                                       | **READY**                              |
| Critical chance                         | `skill/100 × 0.10`; Voidbound critical hit = ×1.5 raw damage | **READY**                              |
| Weapon cycle                            | `1 - clamp(skill×0.0012, 0, 0.12)`                           | **READY**                              |
| Patrol inspection combat-power estimate | adds `skill×0.18`                                            | **READY** – patrol/customs system open |

Sojourn now has Mk I–VI weapon definitions and layered shield/hull damage, but not the complete live firing/cooldown combat loop. These formulas remain the canonical values for that integration.

## Engineering

| Effect                           | Voidbound formula / behavior                                                                              | Sojourn                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Shield regeneration              | base **0.4 HP/s** × `1 + skill/100×0.25`                                                                  | **LIVE** in local-space shields                                         |
| Post-hit regen lock              | **3 seconds**                                                                                             | **LIVE**                                                                |
| Collapsed-shield offline delay   | **7 seconds**                                                                                             | **LIVE**                                                                |
| Repair cost                      | `1 - skill/100×0.15`                                                                                      | **READY** – exact formula ported; persistent player repair service open |
| Reactor overload / drive failure | failure chance × `1 - skill/100×0.25`                                                                     | **READY** – exact formula ported; overload combat runtime open          |
| Distress diagnosis/repair        | station Engineering is compared directly to the damage profile's required skill; best technician is shown | **OPEN** – distress-rescue parent system not ported                     |

At skill 100, shield regeneration is 0.5 HP/s instead of 0.4 HP/s.

## Salvage

| Effect                        | Voidbound formula / behavior                                                   | Sojourn                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Routine yield                 | `1 + skill/100×0.35`                                                           | **LIVE**                                                                               |
| Work duration                 | `1 - skill/100×0.25`                                                           | **LIVE**                                                                               |
| Board/component success       | normal/special base chance + skill × 0.48/0.34 + module bonus, clamped 12–95 % | **READY**; Sojourn component recovery currently also has its own wreck-difficulty term |
| Extra personal loot           | chance `skill/120`                                                             | **READY** – personal loot inventory not implemented                                    |
| Special personal loot         | `0.55 + skill×0.003`                                                           | **READY**                                                                              |
| Relic find                    | `0.06 + skill×0.0025`                                                          | **READY** – relic system open                                                          |
| Full wreck stripping quantity | `max(2, round(3 + skill/18))`                                                  | **READY**                                                                              |

The existing Sojourn physical salvage loop already uses yield and work-time skill effects.

## Mining

| Effect                | Voidbound formula / behavior            | Sojourn                                                         |
| --------------------- | --------------------------------------- | --------------------------------------------------------------- |
| Surface yield         | `1 + skill/100×0.40`                    | **LIVE**                                                        |
| Surface work time     | `1 - skill/100×0.25`                    | **LIVE**                                                        |
| Surface fuel          | `1 - skill/100×0.10`                    | **READY** – local mining currently has no operation fuel budget |
| Prospecting time      | `1 - skill/100×0.20`                    | **READY**                                                       |
| Prospecting fuel      | `1 - skill/100×0.10`                    | **READY**                                                       |
| Quantity uncertainty  | `clamp(0.34 - skill/100×0.18, .14,.34)` | **READY**                                                       |
| Second deposit chance | `0.45 + skill×0.0025`                   | **READY**                                                       |
| Third deposit chance  | `0.18 + skill×0.0015`                   | **READY**                                                       |
| Deep signature chance | `clamp(0.36 + skill/220, .36,.74)`      | **READY**                                                       |
| Deep yield            | `1 + skill/100×0.35`                    | **READY**                                                       |
| Deep work time        | `1 - skill/100×0.20`                    | **READY**                                                       |
| Deep fuel             | `1 - skill/100×0.08`                    | **READY**                                                       |

The remaining effects depend on Voidbound-style prospecting, claims and deep mining, which Sojourn does not yet have.

## Logistics

| Effect                  | Voidbound formula / behavior                   | Sojourn                                                                    |
| ----------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| Sale fee                | base `0.25 × (1-skill/100)`                    | **LIVE**                                                                   |
| Captain commercial edge | subtract `(cunning-trust)×0.005`, clamp 0–25 % | **READY** – formula ported; player-captain trait model not yet implemented |

Ships without a Logistics station receive no Logistics skill benefit, matching Voidbound.

## Implementation rule going forward

A skill effect is only marked **LIVE** when an actual Sojourn gameplay system consumes it. Having a formula in `crew-skill-effects.ts` is **READY**, not complete.

When the missing parent systems are introduced, they must consume these existing formulas rather than defining new skill curves:

- ship combat → Piloting dodge, Sensors hit bonus, Weapons damage/crit/cycle, Engineering overload
- player fuel → Piloting fuel and Mining fuel
- customs/smuggling → Sensor anomaly/scan formulas
- Corsairs/interceptions → Sensor/Piloting evade and Corsair sensor visibility
- mining claims/prospecting/deep mining → the ported Mining and Sensor claim formulas
- distress rescue → Engineering diagnosis threshold
- personal salvage loot/relics → Salvage loot formulas
- repair services → Engineering repair-cost multiplier
