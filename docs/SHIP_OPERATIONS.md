# Project Sojourn – ship fuel and hull servicing

## Operating economy

- All inhabited planets and orbital stations with docking, trade or refueling facilities supply fuel at the **same price: 10 credits per unit**. Asteroid fields and isolated wrecks cannot provide service.
- On every docking, and after further docked transactions (including cargo sales), the active player ship automatically buys as much missing fuel as the current wallet allows. A full tank and a broke wallet never generate charges or fuel.
- Ship fuel is charged proportionally to actual **star-map route/pursuit distance**. Consumption uses role-defined `fuelUse` (the same distance constant as NPC routes), times the Piloting and Engineering crew reduction multipliers (each down to 0.90, multiplicative). A requested route beyond fuel range is blocked before launch; any pursued contact is released if fuel is exhausted.
- Player hull maintenance is manual via the docked ship pane. Base hull repair costs **100 credits per recovered HP**; a shipyard charges 80% of that rate. The Engineering crew multiplier can reduce this discounted cost by another 15%. Repairs cannot overdraw the wallet. If full repair cannot be paid, the command restores as many whole HP as credits permit. Regenerating shields are not billed.
- NPCs already own `fuel`, `fuelCapacity`, `fuelUse`, `hullHp`, `hullMaxHp` and `credits`. Sector travel and combat maneuvers consume fuel. Refueling and repairs now deduct actual funds and use the same uniform tariffs and shipyard discount. Recovery timers do not automatically restore full hull or fuel. Completed contract patrol runs credit a modest operating allowance; pirates receive none.

## State and limitations

`ShipOperatingService` owns per-hull fuel and unrepaired damage in session memory. It stores canonical hull IDs, exposes detached, JSON-compatible `snapshotAll()`, and does not promise a save/load schema. `PlayerTradeService` remains the exclusive authority for all credit debits. The port model is read-only.

Player combat and mining asteroid impacts preserve hull losses on the owned ship across scenes. Salvage-field collision damage, emergency fuel deliveries, local thruster fuel costs, and full NPC operating budgets for all special missions are separate follow-up mechanics and are **not** described as live in this change. The world still has no savegame support.

## Tests

`tests/ships/ship-operating-costs.test.cjs` covers fuel, finance, repairs, discounts, and detached state; `tests/npcs/npc-port-servicing.test.cjs` covers NPC refueling, affordable repair, fuel starvation, port eligibility, and patrol income. Existing ship, navigation, crew, port and NPC CI suites remain mandatory.
