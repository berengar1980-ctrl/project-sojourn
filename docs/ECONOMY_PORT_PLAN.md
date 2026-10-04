# Economy Port Plan — Voidbound → Project Sojourn

## Goal

Port the proven economic behavior from Voidbound into Sojourn without copying its legacy global-state architecture. Sojourn keeps typed domain services, stable IDs, deterministic simulation, and testable pure logic.

## Core invariants

1. Resource quantities are conserved by ordinary transfers.
2. Buying moves quantity from a market into player cargo.
3. Selling moves quantity from player cargo into a market.
4. NPC trade moves quantity between market and NPC cargo, then between NPC cargo and another market.
5. Consumption moves quantity from market stock into the resource reserve.
6. Production moves quantity from the reserve into producer markets.
7. Mining draws physical resources from the same circulation pool.
8. Generated combat loot draws physical resources from the same circulation pool.
9. Loot taken from an existing NPC cargo hold is a transfer only and must not draw the pool again.
10. Destroyed or permanently lost cargo is an explicit sink and must be recorded as a loss.
11. External imports are the only normal mechanism allowed to increase total sector quantity after initialization.
12. Stocks, cargo, reserve, demand, prices, and credits must never become negative or NaN.

## Porting phases

### A. Resource circulation foundation

- Typed resource-pool state per stable resource ID.
- Initialization target from markets + player cargo + NPC cargo.
- Resource total accounting.
- Market consumption → reserve.
- Reserve → production/mining/generated loot.
- Deficit stabilization through explicit external imports.
- Deterministic random source injection for tests.

### B. Market state and pricing

- Persistent stock, demand, and current price per location/resource.
- Target price based on base value, producer/consumer role, stock-vs-demand scarcity, and market situations.
- Immediate market response to player/NPC buy and sell transactions.
- No display-name lookups in domain logic.

### C. Player trade

- Credits, cargo capacity, quantity, weighted cost basis, last origin.
- Buy/sell validation.
- Profit/loss calculation.
- Port UI wired to the real market state.

### D. Daily economy simulation

- Consumer draw.
- Producer refill.
- Demand drift.
- Price relaxation.
- Deterministic day stepping.
- Long-run stabilization.

### E. Mining integration

- Local-space extraction becomes a circulation allocation.
- If reserve is short, the economy first recovers available material from market circulation, matching Voidbound semantics.
- Mined cargo remains physically accounted for when sold later.

### F. Combat loot integration

- Persistent enemy cargo: transfer enemy cargo → player cargo.
- Generated enemy cargo: allocate from resource circulation before enemy cargo is created.
- Destroyed cargo: record explicit sink/loss.
- Boarding may alter transfer fraction but not conservation semantics.

### G. NPC trade

- Real credits and cargo capacity.
- Route profitability using actual prices.
- Market purchases/sales mutate the same stocks as the player.
- Mining/salvage NPCs may perform profitable side-trade routes.

### H. Later systems

- Market situations.
- Adaptive reactions to repeated trade routes.
- Blockades and market sabotage.
- Smuggling/illegal supply.
- Faction/reputation modifiers.
- Trade licenses and logistics fees.

## Test strategy

Every phase starts with behavior contracts, then implementation.

Required test classes:

- Unit tests for pure calculations.
- Conservation/invariant tests.
- Deterministic simulation tests.
- Fuzz tests for invalid/edge quantities.
- Long-run 30/365/1000-day simulations.
- Integration tests for player trade, mining, combat loot, and NPC trade.
- UI tests only verify presentation/wiring; business rules stay in domain tests.

The original Voidbound tests are reference behavior, not code to copy verbatim.
