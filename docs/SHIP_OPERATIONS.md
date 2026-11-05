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

## Route-planning extension – fuel stops

The star-map fuel display shows current/maximum fuel, the effective consumption per 100 world-distance units (with the current Piloting and Engineering crew multipliers), and a preview of total fuel use, required service stops and expected mid-route refueling costs. Multi-leg routes are drawn as one continuous journey.

`planFuelRoute` is the **shared affordable itinerary planner** for player and NPC sector vessels. It considers fuel currently aboard, tank capacity, travel profile, ship fuel consumption, actual refuel infrastructure and available credits. It explores reachable legs through serviced planets/stations and never assumes free refueling at a stop. The player actually flies each leg; on reaching a scheduled stop, it purchases fuel from the authoritative player wallet and continues only when the next leg can be flown. If refueling fails, the journey pauses rather than teleporting or silently granting fuel. The NPC sector service uses the same planner with the NPC's own fuel and wallet and pays through its existing port servicing.

The forecast displays estimated fuel **purchased en route**, not a fee on travel itself or an invoice for docking at the final destination. If the current state cannot fund a route, the travel button is disabled. These are in-session runtime features, not savegame persistence.


## NPC business decisions – projected operating costs

NPC traders now evaluate cargo margins **after their expected travel fuel expense**, rather than choosing routes from gross commodity spread alone. The sector service quotes the actual reachable fuel itinerary, including intermediate fuel expenses and the NPC's own credit balance. Loading rechecks these costs against current market prices, reducing the purchase quantity if money must remain available for a paid tank stop. A buyer does not buy cargo that makes its planned trip impossible; NPC cargo stock, credits and actual market transactions remain owned by the existing economy services.

NPC miners and salvagers also consider the fuel cost and affordability of side-trade detours. They can drop an unprofitable side-trade plan and undertake their assigned resource work instead. Seriously damaged resource workers return to their recorded home port where it can be reached, rather than embarking on more resource extraction. **This is task prioritization inside an existing ship role, not a new ship-class or profession switching system.**

At inhabited docks the existing NPC port service still owns all expenditures. For minor damage it can postpone repairs to preserve operational liquidity; for critical damage it prioritizes actual paid hull repairs ahead of topping up fuel. A critically damaged vessel is not sent on a new route simply because a recovery timer has elapsed. Equipment upgrades must also reserve the funds needed for the ship's existing damage and fuel shortage. All repairs and fuel remain paid; there is no hidden NPC credit or fuel subsidy beyond the existing explicitly funded patrol contract.

The ownership of credits, physical cargo, fuel, hull and equipment does **not** change. Quotes and repair priorities are derived transient computations and add no new savegame fields or persistence APIs.
