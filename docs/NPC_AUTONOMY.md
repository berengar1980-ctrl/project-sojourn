# NPC Autonomy

Project Sojourn civilian NPCs use one shared, persistent autonomy model for trading, resource work and patrol duty.

## Activity state machine

The normal lifecycle is:

`docking → resting → thinking → loading → launch-prep → travel`

Role-specific stable states are:

- `working` for miners and salvagers at their work location.
- `patrol-rest` for patrol ships between security routes.
- `ready` as the decision boundary before the next role action.

Travel arrival always re-enters `docking`. Local mining and salvage traffic is allowed to spawn only while the NPC is in `working`.

Timers run through `NpcEconomyService.tick(deltaSeconds)`; daily economy advancement is no longer allowed to skip the visible autonomy phases.

## Persistent personality

Every NPC receives deterministic persistent values for:

- risk tolerance,
- patience,
- profit drive,
- routine bias,
- preferred market.

These values affect trade scoring, acceptance of optional side trades, work-event risk preference and dwell/decision durations. They are deterministic from NPC identity unless explicitly supplied, so simulations and tests remain reproducible.

## Trading behavior

NPCs continue to use their own stale market intel. Decision scoring weighs expected profit against distance, intel age, risk tolerance, routine and preferred-market bias.

Buying happens only after the `loading` phase. Departure happens only after `launch-prep`. Arrival never causes an instant follow-up departure.

## Mining and salvage

Miners and salvagers use the same strategic lifecycle as traders. At a work location they enter `working`; the local-space services then provide the visible approach, scan and extraction/recovery sequence. A full worker exits local space, enters `thinking`, chooses a sale market from personal intel and only later launches.

A worker that performs a side trade must resume the original work mission after selling instead of chaining unlimited side trades.

## Patrol

Patrol ships no longer auto-launch whenever they are idle. They use:

`travel → docking → patrol-rest → ready → launch-prep/travel`

Combat can still interrupt the normal lifecycle.

## Regression requirements

Tests must preserve these invariants:

1. no civilian NPC may depart immediately after arrival or idle initialization;
2. loading/unloading is delayed by the corresponding phase;
3. different persistent personalities can make different valid route choices;
4. miners/salvagers cannot appear in local work space before `working`;
5. loaded workers do not teleport directly to a sale market;
6. patrols have a real rest interval between routes.
